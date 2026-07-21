import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ethers } from 'ethers';
import {
  buildContributorConfig,
  contributorSpecFromRequest,
  ensureOperatorActive,
  preflightContributorEndpoint,
  renderOperatorRoutes,
  restoreOperatorStatus,
} from './operator-onboarding.mjs';
import {
  connectToFoundationPeers,
  DEFAULT_PEER_AGENTS,
  rollbackFoundationPeers,
} from './peer-client.mjs';

function readEnvFileValue(path, key) {
  try {
    const line = fs.readFileSync(path, 'utf8').split(/\r?\n/).find((row) => {
      const clean = row.trim().replace(/^export\s+/, '');
      return clean.startsWith(key + '=');
    });
    if (!line) return '';
    const clean = line.trim().replace(/^export\s+/, '');
    return clean.slice(key.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  } catch {
    return '';
  }
}

// --- Existing monitor/admin config ---
const CONFIG_PATH = '/opt/dcai/rewards/monitor/config.json';
const RPC_URL = process.env.RPC_URL || 'http://139.180.188.61:8545';
const DISTRIBUTOR_ADDR = '0x728f2C63b9A0ff0918F5ffB3D4C2d004107476B7';
const PRIVATE_KEY = process.env.FOUNDATION_KEY;
const CONTRACT_OWNER_KEY = process.env.CONTRACT_OWNER_KEY || readEnvFileValue('/opt/dcai/rewards/.env', 'PRIVATE_KEY');
const OPERATOR_REGISTRY_ADDR = process.env.OPERATOR_REGISTRY_ADDRESS || '0xb37c81eBC4b1B4bdD5476fe182D6C72133F41db9';
const OPERATOR_ROUTES_PATH = process.env.OPERATOR_ROUTES_PATH || '/etc/nginx/dcai-operator-routes.conf';
const OPERATOR_ROUTE_BASE = process.env.OPERATOR_ROUTE_BASE || 'https://explorer.dcai.ai';
const EXPECTED_CHAIN_ID = Number(process.env.CHAIN_ID || 18441);
const ADMIN_API_PORT = Number(process.env.ADMIN_API_PORT || 3001);
const P2P_AGENT_TOKEN = process.env.P2P_AGENT_TOKEN || readEnvFileValue('/opt/dcai/rewards/.env', 'P2P_AGENT_TOKEN');
const P2P_AGENT_URLS = String(process.env.P2P_AGENT_URLS || DEFAULT_PEER_AGENTS.join(','))
  .split(',').map((value) => value.trim()).filter(Boolean);
const TRAFFIC_STATS_PATH = process.env.TRAFFIC_STATS_PATH || '/opt/dcai/rewards/monitor/traffic-stats.json';

// --- API key system config ---
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const STAKE_CONTRACT = process.env.STAKE_CONTRACT || '';
const STORE_DIR = '/opt/dcai/apikey';
const REQ_PATH = STORE_DIR + '/requests.json';
const KEYS_PATH = STORE_DIR + '/keys.json';
const USAGE_PATH = STORE_DIR + '/usage.json';
const BASIC_AUTH_FILE = '/etc/nginx/.htpasswd-dcai-admin';

const TIERS = {
  basic: { enum: 1, requiredEther: '1000', keyFile: '/etc/nginx/rpc_keys_basic.conf' },
  pro: { enum: 2, requiredEther: '5000', keyFile: '/etc/nginx/rpc_keys_pro.conf' },
  ultra: { enum: 3, requiredEther: '10000', keyFile: '/etc/nginx/rpc_keys_ultra.conf' },
};

const stakeAbi = [
  'function getStake(address user) view returns (uint8 tier, uint256 stakeWei, uint256 requestedAt)',
];

const distAbi = [
  'function dailyCapWei() view returns (uint256)',
  'function dailySpentWei(uint256 dayId) view returns (uint256)',
  'function setDailyCap(uint256 newCapWei)'
];

// in-memory nonces for signature auth
const nonces = new Map(); // addressLower -> nonce
let approvalInProgress = false;

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function parseUrl(req) {
  const u = new URL(req.url || '/', 'http://localhost');
  return { pathname: u.pathname, searchParams: u.searchParams };
}

async function readBody(req) {
  return await new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

function ensureStore() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  if (!fs.existsSync(REQ_PATH)) fs.writeFileSync(REQ_PATH, '[]');
  if (!fs.existsSync(KEYS_PATH)) fs.writeFileSync(KEYS_PATH, '[]');
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWriteFile(path, data, mode = 0o600) {
  const tmp = path + '.tmp-' + process.pid + '-' + randomBytes(4).toString('hex');
  try {
    fs.writeFileSync(tmp, data, { mode });
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, path);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

function snapshotFile(path) {
  if (!fs.existsSync(path)) return { path, exists:false, data:null, mode:null };
  return { path, exists:true, data:fs.readFileSync(path), mode:fs.statSync(path).mode & 0o777 };
}

function restoreFile(snapshot) {
  if (snapshot.exists) atomicWriteFile(snapshot.path, snapshot.data, snapshot.mode || 0o600);
  else fs.rmSync(snapshot.path, { force:true });
}

function saveJson(p, obj) {
  const mode = fs.existsSync(p) ? (fs.statSync(p).mode & 0o777) : 0o600;
  atomicWriteFile(p, JSON.stringify(obj, null, 2), mode);
}

function usageForKey(key) {
  const u = loadJson(USAGE_PATH, { keys: {} });
  const rec = u?.keys?.[key];
  if (!rec) {
    return {
      today: 0,
      last5m: 0,
      last60m: 0,
      lastSeen: null,
      statusToday: {},
      statusLast5m: {},
      statusLast60m: {},
      topMethodsToday: [],
      topMethodsLast60m: [],
      latencyToday: { p50Ms: null, p95Ms: null },
      latencyLast60m: { p50Ms: null, p95Ms: null },
    };
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);

  const byDay = rec.byDay || {};
  const byMinute = rec.byMinute || {};
  const byDayStatus = rec.byDayStatus || {};
  const byMinuteStatus = rec.byMinuteStatus || {};
  const methodsByDay = rec.methodsByDay || {};
  const methodsByMinute = rec.methodsByMinute || {};
  const latByDay = rec.latByDay || {};
  const latByMinute = rec.latByMinute || {};

  const today = Number(byDay[day] || 0);

  const sumLastN = (n) => {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = new Date(now.getTime() - i * 60_000);
      const k = d.toISOString().slice(0, 16);
      total += Number(byMinute[k] || 0);
    }
    return total;
  };

  const mergeCountsLastN = (n, minuteMap) => {
    const out = {};
    for (let i = 0; i < n; i++) {
      const d = new Date(now.getTime() - i * 60_000);
      const k = d.toISOString().slice(0, 16);
      const row = minuteMap[k] || {};
      for (const [kk, vv] of Object.entries(row)) {
        out[kk] = (out[kk] || 0) + Number(vv || 0);
      }
    }
    return out;
  };



  const percentileFromLatencyHist = (hist, p) => {
    // hist: { bucket: count }, bucket order is fixed
    const order = [
      ['le5', 5], ['le10', 10], ['le25', 25], ['le50', 50], ['le100', 100],
      ['le250', 250], ['le500', 500], ['le1000', 1000], ['le2500', 2500], ['le5000', 5000], ['gt5000', 10000],
    ];
    const total = Object.values(hist || {}).reduce((a, b) => a + Number(b || 0), 0);
    if (!total) return null;
    const target = Math.ceil(total * p);
    let cum = 0;
    for (const [k, ub] of order) {
      cum += Number(hist?.[k] || 0);
      if (cum >= target) return ub;
    }
    return order[order.length - 1][1];
  };

  const mergeLatencyLastN = (n) => {
    const out = {};
    for (let i = 0; i < n; i++) {
      const d = new Date(now.getTime() - i * 60_000);
      const k = d.toISOString().slice(0, 16);
      const row = latByMinute[k] || {};
      for (const [bk, vv] of Object.entries(row)) {
        out[bk] = (out[bk] || 0) + Number(vv || 0);
      }
    }
    return out;
  };

  const topN = (obj, n = 8) => {
    return Object.entries(obj || {})
      .map(([k, v]) => ({ method: k, count: Number(v || 0) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  };

  const methodsLast60mAgg = (() => {
    const out = {};
    for (let i = 0; i < 60; i++) {
      const d = new Date(now.getTime() - i * 60_000);
      const k = d.toISOString().slice(0, 16);
      const row = methodsByMinute[k] || {};
      for (const [m, vv] of Object.entries(row)) {
        out[m] = (out[m] || 0) + Number(vv || 0);
      }
    }
    return out;
  })();

  const latencyTodayHist = latByDay[day] || {};
  const latencyLast60mHist = mergeLatencyLastN(60);

  const latencyToday = {
    p50Ms: percentileFromLatencyHist(latencyTodayHist, 0.50),
    p95Ms: percentileFromLatencyHist(latencyTodayHist, 0.95),
  };

  const latencyLast60m = {
    p50Ms: percentileFromLatencyHist(latencyLast60mHist, 0.50),
    p95Ms: percentileFromLatencyHist(latencyLast60mHist, 0.95),
  };

  return {
    today,
    last5m: sumLastN(5),
    last60m: sumLastN(60),
    lastSeen: rec.lastSeen || null,
    tier: rec.tier || null,

    statusToday: byDayStatus[day] || {},
    statusLast5m: mergeCountsLastN(5, byMinuteStatus),
    statusLast60m: mergeCountsLastN(60, byMinuteStatus),

    topMethodsToday: topN(methodsByDay[day] || {}, 10),
    topMethodsLast60m: topN(methodsLast60mAgg, 10),

    latencyToday,
    latencyLast60m,
  };
}

function isAdmin(req) {
  // Defense in depth. Admin actions require the shared secret that nginx
  // injects as X-Admin-Token on the /admin/api/ location (which itself sits
  // behind Basic Auth); the Node API also binds to 127.0.0.1 only. When
  // ADMIN_TOKEN is unset we fall back to allow (bootstrap/dev) but warn, so
  // nothing breaks before nginx is wired up.
  if (!ADMIN_TOKEN) {
    console.error('[admin-api] WARNING: ADMIN_TOKEN unset — admin endpoints are not token-gated');
    return true;
  }
  const got = req.headers['x-admin-token'] || req.headers['X-Admin-Token'] || '';
  return got === ADMIN_TOKEN;
}

// Which frontend a key/request came from. The Contributor Program stamps a
// recognisable first line into the note; everything else is a developer
// (API Dashboard) request. There is only ONE staking system behind both.
function sourceFromNote(note) {
  return String(note || '').startsWith('Contributor Program Application')
    ? 'contributor'
    : 'developer';
}

function normAddress(a) {
  try {
    return ethers.getAddress(a);
  } catch {
    return null;
  }
}

function genKey32() {
  return randomBytes(16).toString('hex'); // 32 hex chars
}

function tierLabelFromEnum(tierEnum) {
  switch (Number(tierEnum)) {
    case 1: return 'basic';
    case 2: return 'pro';
    case 3: return 'ultra';
    default: return 'none';
  }
}

async function getStakeWatchRows(provider) {
  if (!STAKE_CONTRACT) throw new Error('STAKE_CONTRACT not set');

  const keys = loadJson(KEYS_PATH, []);
  const requests = loadJson(REQ_PATH, []);
  const addresses = Array.from(new Set([
    ...keys.map((k) => String(k.address || '').toLowerCase()),
    ...requests.map((r) => String(r.address || '').toLowerCase()),
  ].filter(Boolean)));

  const c = new ethers.Contract(STAKE_CONTRACT, stakeAbi, provider);
  const nowSec = Math.floor(Date.now() / 1000);

  const rows = await Promise.all(addresses.map(async (address) => {
    const addr = ethers.getAddress(address);
    const [tierEnum, stakeWei, requestedAt] = await c.getStake(addr);
    const requestedAtSec = Number(requestedAt.toString());
    const cooldownEndsSec = requestedAtSec > 0 ? requestedAtSec + 86400 : 0;
    const cooldownLeftSec = cooldownEndsSec > 0 ? Math.max(0, cooldownEndsSec - nowSec) : 0;

    const activeKeys = keys
      .filter((k) => String(k.address || '').toLowerCase() === address && k.active)
      .map((k) => ({ keyPrefix: String(k.key || '').slice(0, 6), tier: k.tier, createdAt: k.createdAt }));

    const recentRequests = requests
      .filter((r) => String(r.address || '').toLowerCase() === address)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 3)
      .map((r) => ({ id: r.id, tier: r.tier, status: r.status, createdAt: r.createdAt }));

    let unstakeStatus = 'no-stake';
    if (BigInt(stakeWei.toString()) > 0n) {
      unstakeStatus = requestedAtSec > 0
        ? (cooldownLeftSec > 0 ? 'cooldown' : 'withdrawable')
        : 'staked';
    }

    return {
      address: address,
      tierEnum: Number(tierEnum),
      tier: tierLabelFromEnum(tierEnum),
      stakeWei: stakeWei.toString(),
      stake: ethers.formatEther(stakeWei),
      requestedAtSec,
      cooldownEndsSec,
      cooldownLeftSec,
      unstakeStatus,
      activeKeys,
      activeKeyCount: activeKeys.length,
      recentRequests,
    };
  }));

  rows.sort((a, b) => {
    const aScore = (a.requestedAtSec > 0 ? 1_000_000_000 : 0) + a.activeKeyCount;
    const bScore = (b.requestedAtSec > 0 ? 1_000_000_000 : 0) + b.activeKeyCount;
    if (bScore !== aScore) return bScore - aScore;
    if (b.requestedAtSec !== a.requestedAtSec) return b.requestedAtSec - a.requestedAtSec;
    return a.address.localeCompare(b.address);
  });

  return { nowSec, rows };
}

async function verifyStake(provider, addr, tierKey) {
  if (!STAKE_CONTRACT) throw new Error('STAKE_CONTRACT not set');
  const t = TIERS[tierKey];
  if (!t) throw new Error('invalid tier');

  const c = new ethers.Contract(STAKE_CONTRACT, stakeAbi, provider);
  const [tierEnum, stakeWei] = await c.getStake(addr);

  const needWei = ethers.parseEther(t.requiredEther);
  const okTier = Number(tierEnum) === t.enum;
  const okAmt = BigInt(stakeWei.toString()) === BigInt(needWei.toString());

  return { ok: okTier && okAmt, tierEnum: Number(tierEnum), stakeWei: stakeWei.toString(), needWei: needWei.toString() };
}

function msgRequest(address, tier, nonce) {
  return `DCAI API Key Request\nAddress: ${address}\nTier: ${tier}\nNonce: ${nonce}`;
}

function msgReveal(address, nonce) {
  return `DCAI API Key Reveal\nAddress: ${address}\nNonce: ${nonce}`;
}

function verifySig(message, signature, expectedAddress) {
  const recovered = ethers.verifyMessage(message, signature);
  return recovered.toLowerCase() === expectedAddress.toLowerCase();
}

function writeNginxKeyFile(tierKey, keys) {
  const t = TIERS[tierKey];
  if (!t) throw new Error('invalid tier');
  const lines = keys
    .filter((k) => k.active && k.tier === tierKey)
    .map((k) => `"${k.key}" 1;`)
    .join('\n');
  fs.writeFileSync(t.keyFile, lines + (lines ? '\n' : ''), { mode: 0o600 });
}

function reloadNginx() {
  execFileSync('nginx', ['-t'], { stdio:'pipe' });
  execFileSync('nginx', ['-s', 'reload'], { stdio:'pipe' });
}

async function rollbackContributorState(state) {
  if (!state || state.rolledBack) return [];
  state.rolledBack = true;
  const errors = [];
  try {
    restoreFile(state.configSnapshot);
    restoreFile(state.routesSnapshot);
    reloadNginx();
  } catch (error) {
    errors.push('filesystem/nginx rollback failed: ' + (error?.message || error));
  }
  try {
    await restoreOperatorStatus(state.activation, state.operator);
  } catch (error) {
    errors.push('registry rollback failed: ' + (error?.message || error));
  }
  try {
    errors.push(...await rollbackFoundationPeers(state.p2pVerification, P2P_AGENT_TOKEN));
  } catch (error) {
    errors.push('P2P rollback failed: ' + (error?.message || error));
  }
  return errors;
}

async function beginContributorOnboarding(request) {
  const spec = contributorSpecFromRequest(request);
  if (!spec) return null;
  if (!CONTRACT_OWNER_KEY) throw new Error('Contract owner key is not configured for contributor onboarding');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const referenceBlockNumber = await provider.getBlockNumber();
  const directPreflight = await preflightContributorEndpoint(spec, {
    expectedChainId: EXPECTED_CHAIN_ID,
    referenceBlockNumber,
    timeoutMs: 8000,
  });

  const configSnapshot = snapshotFile(CONFIG_PATH);
  const routesSnapshot = snapshotFile(OPERATOR_ROUTES_PATH);
  const currentConfig = JSON.parse(configSnapshot.data.toString('utf8'));
  const state = {
    configSnapshot,
    routesSnapshot,
    activation:null,
    p2pVerification:null,
    operator:spec.operator,
    rolledBack:false,
  };

  try {
    state.p2pVerification = await connectToFoundationPeers({
      enode:spec.enode,
      endpointAddresses:directPreflight.addresses,
      agentUrls:P2P_AGENT_URLS,
      token:P2P_AGENT_TOKEN,
    });
    const plan = buildContributorConfig(currentConfig, request, directPreflight, {
      routeBase: OPERATOR_ROUTE_BASE,
      p2pVerification:state.p2pVerification,
    });
    const routesText = renderOperatorRoutes(plan.config);

    // Establish and verify the private monitoring route before the operator can
    // enter scoring. The raw contributor endpoint is never published in the
    // public epoch summary.
    atomicWriteFile(OPERATOR_ROUTES_PATH, routesText, 0o600);
    reloadNginx();
    await preflightContributorEndpoint({ ...spec, endpoint:plan.routeUrl }, {
      expectedChainId: EXPECTED_CHAIN_ID,
      referenceBlockNumber,
      timeoutMs: 8000,
    });

    state.activation = await ensureOperatorActive({
      rpcUrl: RPC_URL,
      privateKey: CONTRACT_OWNER_KEY,
      registryAddress: OPERATOR_REGISTRY_ADDR,
      operator: spec.operator,
    });

    atomicWriteFile(CONFIG_PATH, JSON.stringify(plan.config, null, 2) + '\n', 0o600);
    return {
      state,
      publicResult: {
        operator: spec.operator,
        service: spec.service,
        programTier: spec.programTier,
        rewardFactor: spec.policy.rewardFactor,
        p2pNodeId:spec.nodeId,
        p2pConnectedAgents:state.p2pVerification.connectedAgents,
        registryStatus: 'ACTIVE',
        registryTxHash: state.activation.txHash,
        registryChanged: state.activation.changed,
        monitoringRouteCreated: true,
        rewardConfigUpdated: true,
      },
      rollback: async () => await rollbackContributorState(state),
    };
  } catch (error) {
    const rollbackErrors = await rollbackContributorState(state);
    const suffix = rollbackErrors.length ? ' | ' + rollbackErrors.join(' | ') : '';
    throw new Error((error?.message || String(error)) + suffix);
  }
}

function commitApprovedKey({ requests, request, keys, keyObj, onboarding }) {
  const snapshots = [
    snapshotFile(KEYS_PATH),
    snapshotFile(REQ_PATH),
    ...Object.values(TIERS).map((tier) => snapshotFile(tier.keyFile)),
  ];
  try {
    keys.push(keyObj);
    request.status = 'approved';
    request.approvedAt = new Date().toISOString();
    if (onboarding) request.onboarding = onboarding.publicResult;
    saveJson(KEYS_PATH, keys);
    saveJson(REQ_PATH, requests);
    writeNginxKeyFile('basic', keys);
    writeNginxKeyFile('pro', keys);
    writeNginxKeyFile('ultra', keys);
    reloadNginx();
  } catch (error) {
    for (const snapshot of snapshots) {
      try { restoreFile(snapshot); } catch {}
    }
    try { reloadNginx(); } catch {}
    throw error;
  }
}

function changeAdminPassword(username, currentPassword, newPassword) {
  if (!username) throw new Error('missing username');
  if (!currentPassword) throw new Error('missing current password');
  if (!newPassword || newPassword.length < 8) throw new Error('new password too short');
  if (!fs.existsSync(BASIC_AUTH_FILE)) throw new Error('basic auth file missing');

  try {
    execFileSync('htpasswd', ['-vb', BASIC_AUTH_FILE, username, currentPassword], { stdio: 'ignore' });
  } catch {
    throw new Error('current password incorrect');
  }

  execFileSync('htpasswd', ['-bB', BASIC_AUTH_FILE, username, newPassword], { stdio: 'ignore' });
  reloadNginx();
}

function getTodayDayIdUTC() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return Number(String(yyyy) + mm + dd);
}

function contributionTrafficSummary(windowMinutes = 120) {
  const data = loadJson(TRAFFIC_STATS_PATH, { minutes:{} });
  const cutoff = new Date(Date.now() - windowMinutes * 60_000).toISOString().slice(0, 16) + 'Z';
  const operators = {};
  for (const [minute, bucket] of Object.entries(data.minutes || {})) {
    if (minute < cutoff) continue;
    for (const [operator, row] of Object.entries(bucket?.operators || {})) {
      const total = operators[operator] ||= { requests:0, successes:0, failures:0, fallbacks:0, totalLatencyMs:0, bytesIn:0, bytesOut:0 };
      for (const key of Object.keys(total)) total[key] += Number(row?.[key] || 0);
    }
  }
  for (const row of Object.values(operators)) {
    row.successRate = row.requests ? row.successes / row.requests : 0;
    row.avgLatencyMs = row.requests ? row.totalLatencyMs / row.requests : null;
  }
  return { windowMinutes, updatedAt:data.updatedAt || null, operators };
}

async function contributorRouterStatus() {
  try {
    const response = await fetch('http://127.0.0.1:3998/v1/status', { signal:AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    return { ok:false, error:error?.message || String(error), candidates:[] };
  }
}

ensureStore();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const { pathname, searchParams } = parseUrl(req);

  // ---------- Auth (nonce + signature) ----------
  if ((pathname === '/api/auth/nonce' || pathname === '/auth/nonce') && req.method === 'GET') {
    const a = searchParams.get('address');
    const addr = a ? normAddress(a) : null;
    if (!addr) return sendJson(res, 400, { error: 'bad address' });
    const nonce = randomBytes(16).toString('hex');
    nonces.set(addr.toLowerCase(), nonce);
    return sendJson(res, 200, { address: addr, nonce });
  }

  // ---------- User: submit API key application ----------
  if ((pathname === '/api/apikey/request' || pathname === '/apikey/request') && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const addr = body?.address ? normAddress(body.address) : null;
      const tier = String(body?.tier || '').toLowerCase();
      const note = String(body?.note || '').slice(0, 2000);
      const signature = String(body?.signature || '');

      if (!addr) return sendJson(res, 400, { error: 'bad address' });
      if (!TIERS[tier]) return sendJson(res, 400, { error: 'bad tier' });

      const nonce = nonces.get(addr.toLowerCase());
      if (!nonce) return sendJson(res, 400, { error: 'missing nonce (call /auth/nonce first)' });

      const message = msgRequest(addr, tier, nonce);
      if (!signature || !verifySig(message, signature, addr)) {
        return sendJson(res, 401, { error: 'bad signature' });
      }

      // verify stake on-chain
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const stake = await verifyStake(provider, addr, tier);
      if (!stake.ok) {
        return sendJson(res, 400, { error: 'stake not valid for tier', stake });
      }

      const source = sourceFromNote(note);
      const contributorSpec = source === 'contributor'
        ? contributorSpecFromRequest({ address:addr, tier, note, source })
        : null;

      const requests = loadJson(REQ_PATH, []);
      const existing = requests.find((r) => r.address === addr.toLowerCase() && r.status === 'pending');
      if (existing) return sendJson(res, 200, { ok: true, request: existing, note: 'already pending' });

      const reqObj = {
        id: randomBytes(8).toString('hex'),
        address: addr.toLowerCase(),
        tier,
        note,
        source,
        programTier: contributorSpec?.programTier || null,
        createdAt: new Date().toISOString(),
        status: 'pending',
        stakeWei: stake.stakeWei,
      };

      requests.push(reqObj);
      saveJson(REQ_PATH, requests);
      return sendJson(res, 200, { ok: true, request: reqObj });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || String(e) });
    }
  }

  // ---------- User: reveal my key (needs signature) ----------
  if ((pathname === '/api/apikey/reveal' || pathname === '/apikey/reveal') && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const addr = body?.address ? normAddress(body.address) : null;
      const signature = String(body?.signature || '');
      if (!addr) return sendJson(res, 400, { error: 'bad address' });

      const nonce = nonces.get(addr.toLowerCase());
      if (!nonce) return sendJson(res, 400, { error: 'missing nonce (call /auth/nonce first)' });

      const message = msgReveal(addr, nonce);
      if (!signature || !verifySig(message, signature, addr)) {
        return sendJson(res, 401, { error: 'bad signature' });
      }

      const keys = loadJson(KEYS_PATH, []);
      const active = keys.filter((k) => k.active && k.address === addr.toLowerCase());
      return sendJson(res, 200, { ok: true, keys: active.map(({ key, tier, createdAt }) => ({ key, tier, createdAt, usage: usageForKey(key) })) });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || String(e) });
    }
  }

  // ---------- Basic auth: change admin password ----------
  if ((pathname === '/api/auth/change-password' || pathname === '/auth/change-password') && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const username = String(body?.username || '').trim();
      const currentPassword = String(body?.currentPassword || '');
      const newPassword = String(body?.newPassword || '');
      const confirmPassword = String(body?.confirmPassword || '');

      if (!username) return sendJson(res, 400, { error: 'missing username' });
      if (!currentPassword) return sendJson(res, 400, { error: 'missing current password' });
      if (!newPassword) return sendJson(res, 400, { error: 'missing new password' });
      if (confirmPassword && newPassword !== confirmPassword) return sendJson(res, 400, { error: 'password confirmation mismatch' });

      changeAdminPassword(username, currentPassword, newPassword);
      return sendJson(res, 200, { ok: true, username });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || String(e) });
    }
  }

  // ---------- Admin: list requests ----------
  if ((pathname === '/api/apikey/requests' || pathname === '/apikey/requests') && req.method === 'GET') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    const requests = loadJson(REQ_PATH, []).map((r) => ({ ...r, source: r.source || sourceFromNote(r.note) }));
    return sendJson(res, 200, { ok: true, requests });
  }

  // ---------- Admin: approve request ----------
  if ((pathname === '/api/apikey/approve' || pathname === '/apikey/approve') && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    if (approvalInProgress) return sendJson(res, 409, { error: 'another approval is currently in progress' });
    approvalInProgress = true;
    let onboarding = null;
    try {
      const body = JSON.parse(await readBody(req));
      const requestId = String(body?.id || '');
      const requests = loadJson(REQ_PATH, []);
      const r = requests.find((x) => x.id === requestId);
      if (!r) return sendJson(res, 404, { error: 'request not found' });
      if (r.status !== 'pending') return sendJson(res, 400, { error: 'not pending', request: r });

      // re-verify stake at approval time
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const stake = await verifyStake(provider, ethers.getAddress(r.address), r.tier);
      if (!stake.ok) return sendJson(res, 400, { error: 'stake not valid', stake, request: r });

      onboarding = await beginContributorOnboarding(r);

      const keys = loadJson(KEYS_PATH, []);
      const newKey = genKey32();
      const keyObj = {
        id: randomBytes(8).toString('hex'),
        address: r.address,
        tier: r.tier,
        key: newKey,
        source: r.source || sourceFromNote(r.note),
        programTier: onboarding?.publicResult?.programTier || r.programTier || null,
        active: true,
        createdAt: new Date().toISOString(),
      };
      commitApprovedKey({ requests, request:r, keys, keyObj, onboarding });

      return sendJson(res, 200, {
        ok: true,
        key: newKey,
        tier: r.tier,
        address: r.address,
        onboarding: onboarding?.publicResult || null,
      });
    } catch (e) {
      const rollbackErrors = onboarding ? await onboarding.rollback() : [];
      return sendJson(res, 500, {
        error: e.message || String(e),
        rollbackErrors,
      });
    } finally {
      approvalInProgress = false;
    }
  }

  // ---------- Admin: reject request ----------
  if ((pathname === '/api/apikey/reject' || pathname === '/apikey/reject') && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    try {
      const body = JSON.parse(await readBody(req));
      const requestId = String(body?.id || '');
      const reason = String(body?.reason || '').slice(0, 500);
      const requests = loadJson(REQ_PATH, []);
      const r = requests.find((x) => x.id === requestId);
      if (!r) return sendJson(res, 404, { error: 'request not found' });
      if (r.status !== 'pending') return sendJson(res, 400, { error: 'not pending', request: r });

      r.status = 'rejected';
      r.rejectedAt = new Date().toISOString();
      if (reason) r.rejectReason = reason;
      saveJson(REQ_PATH, requests);

      return sendJson(res, 200, { ok: true, id: r.id, address: r.address, tier: r.tier, reason: r.rejectReason || '' });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || String(e) });
    }
  }

  // ---------- Admin: revoke key ----------
  if ((pathname === '/api/apikey/revoke' || pathname === '/apikey/revoke') && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    try {
      const body = JSON.parse(await readBody(req));
      const key = String(body?.key || '').trim();
      const id = String(body?.id || '').trim();
      if (!key && !id) return sendJson(res, 400, { error: 'missing key or id' });
      const keys = loadJson(KEYS_PATH, []);
      const k = keys.find((x) => x.active && ((key && x.key === key) || (id && String(x.id || '') === id)));
      if (!k) return sendJson(res, 404, { error: 'key not found' });
      k.active = false;
      k.revokedAt = new Date().toISOString();
      saveJson(KEYS_PATH, keys);
      writeNginxKeyFile('basic', keys);
      writeNginxKeyFile('pro', keys);
      writeNginxKeyFile('ultra', keys);
      reloadNginx();
      return sendJson(res, 200, { ok: true, id: k.id, keyPrefix: String(k.key || '').slice(0, 6), address: k.address, tier: k.tier });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || String(e) });
    }
  }

  // ---------- Admin: rotate key ----------
  if ((pathname === '/api/apikey/rotate' || pathname === '/apikey/rotate') && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    try {
      const body = JSON.parse(await readBody(req));
      const id = String(body?.id || '').trim();
      if (!id) return sendJson(res, 400, { error: 'missing id' });
      const keys = loadJson(KEYS_PATH, []);
      const current = keys.find((x) => x.active && String(x.id || '') === id);
      if (!current) return sendJson(res, 404, { error: 'active key not found' });

      current.active = false;
      current.revokedAt = new Date().toISOString();
      current.rotated = true;

      const newKey = genKey32();
      const next = {
        id: randomBytes(8).toString('hex'),
        address: current.address,
        tier: current.tier,
        key: newKey,
        active: true,
        createdAt: new Date().toISOString(),
        replacesId: current.id,
      };
      current.rotatedToId = next.id;
      keys.push(next);

      saveJson(KEYS_PATH, keys);
      writeNginxKeyFile('basic', keys);
      writeNginxKeyFile('pro', keys);
      writeNginxKeyFile('ultra', keys);
      reloadNginx();

      return sendJson(res, 200, { ok: true, oldId: current.id, newId: next.id, key: newKey, address: next.address, tier: next.tier });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || String(e) });
    }
  }

  // ---------- Admin: list keys ----------
  if ((pathname === '/api/apikey/keys' || pathname === '/apikey/keys') && req.method === 'GET') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    const keys = loadJson(KEYS_PATH, []);
    return sendJson(res, 200, { ok: true, keys: keys.map(({ key, ...rest }) => ({ ...rest, source: rest.source || 'developer', keyPrefix: key.slice(0, 6) })) });
  }

  // ---------- Admin: usage summary ----------
  if ((pathname === '/api/apikey/usage' || pathname === '/apikey/usage') && req.method === 'GET') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    const { searchParams } = parseUrl(req);
    const key = String(searchParams.get('key') || '');
    if (key) {
      return sendJson(res, 200, { ok: true, key, usage: usageForKey(key) });
    }
    const u = loadJson(USAGE_PATH, { keys: {} });
    return sendJson(res, 200, { ok: true, usage: u });
  }

  // ---------- Admin: stake / unstake watch ----------
  if ((pathname === '/api/stakes' || pathname === '/stakes') && req.method === 'GET') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const { nowSec, rows } = await getStakeWatchRows(provider);
      return sendJson(res, 200, { ok: true, nowSec, rows });
    } catch (e) {
      return sendJson(res, 500, { error: e.message || String(e) });
    }
  }

  // ---------- Admin: real contributor traffic / P2P status ----------
  if ((pathname === '/api/contribution-status' || pathname === '/contribution-status') && req.method === 'GET') {
    if (!isAdmin(req)) return sendJson(res, 401, { error:'admin only' });
    const config = loadJson(CONFIG_PATH, { operators:[] });
    return sendJson(res, 200, {
      ok:true,
      canaryPercent:4.76,
      router:await contributorRouterStatus(),
      traffic:contributionTrafficSummary(120),
      operators:(config.operators || []).map((operator) => ({
        operator:operator.operator,
        programTier:operator.programTier || 'observer',
        contributionPolicyVersion:operator.contributionPolicyVersion || 'v1',
        p2p:operator.p2p || null,
      })),
    });
  }


  // ---------- Existing monitor endpoints ----------

  // --- Config ---
  if ((pathname === '/api/config' || pathname === '/config') && req.method === 'GET') {
    try {
      const config = fs.readFileSync(CONFIG_PATH, 'utf8');
      return sendJson(res, 200, JSON.parse(config));
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // --- Update reward weights (4-key model; consumed live by score-to-claims) ---
  if ((pathname === '/api/update-weights' || pathname === '/update-weights') && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    const body = await readBody(req);
    try {
      const w = JSON.parse(body || '{}');
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const num = (v, def) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : def;
      };
      const previous = config.weights || {};
      config.weights = {
        rpc: num(w.rpc, 40),
        indexer: num(w.indexer, 20),
        storage: num(w.storage, 30),
        multiregion: num(w.multiregion, 10),
      };
      atomicWriteFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 0o600);
      return sendJson(res, 200, { success: true, weights: config.weights, previous });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  // --- Legacy master API keys (defined in the nginx map, not managed here) ---
  if ((pathname === '/api/legacy-keys' || pathname === '/legacy-keys') && req.method === 'GET') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    try {
      const confPaths = [
        '/etc/nginx/sites-available/dcai-testnet',
        '/etc/nginx/sites-enabled/dcai-testnet',
      ];
      let conf = '';
      for (const p of confPaths) {
        try { conf = fs.readFileSync(p, 'utf8'); break; } catch {}
      }
      const keys = [];
      const block = conf.match(/map\s+\$http_x_api_key\s+\$rpc_key_ok\s*\{([\s\S]*?)\}/);
      if (block) {
        const re = /"([0-9a-fA-F]{32})"\s+1\s*;/g;
        let mm;
        while ((mm = re.exec(block[1]))) keys.push(mm[1]);
      }
      return sendJson(res, 200, { ok: true, keys, note: 'Defined in nginx map $http_x_api_key; unstaked master keys, not part of the staking system.' });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // --- Topup distributor ---
  if ((pathname === '/api/topup' || pathname === '/topup') && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    const body = await readBody(req);
    try {
      const { amount } = JSON.parse(body || '{}');
      if (!PRIVATE_KEY) throw new Error('FOUNDATION_KEY not set');
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const tx = await wallet.sendTransaction({
        to: DISTRIBUTOR_ADDR,
        value: ethers.parseEther(amount.toString())
      });
      return sendJson(res, 200, { success: true, hash: tx.hash });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // --- Daily cap status ---
  if ((pathname === '/api/cap' || pathname === '/cap') && req.method === 'GET') {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const dist = new ethers.Contract(DISTRIBUTOR_ADDR, distAbi, provider);
      const dayId = getTodayDayIdUTC();
      const capWei = await dist.dailyCapWei();
      const spentWei = await dist.dailySpentWei(dayId);
      const remainingWei = capWei - spentWei;
      return sendJson(res, 200, {
        dayId,
        capWei: capWei.toString(),
        spentWei: spentWei.toString(),
        remainingWei: remainingWei.toString(),
        cap: ethers.formatEther(capWei),
        spent: ethers.formatEther(spentWei),
        remaining: ethers.formatEther(remainingWei)
      });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  // --- Set daily cap (project owner) ---
  if ((pathname === '/api/set-cap' || pathname === '/set-cap') && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'admin only' });
    const body = await readBody(req);
    try {
      if (!CONTRACT_OWNER_KEY) throw new Error('Contract owner key not set');
      const { cap } = JSON.parse(body || '{}'); // cap in tDCAI
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(CONTRACT_OWNER_KEY, provider);
      const dist = new ethers.Contract(DISTRIBUTOR_ADDR, distAbi, wallet);
      const newCapWei = ethers.parseEther(cap.toString());
      const tx = await dist.setDailyCap(newCapWei);
      return sendJson(res, 200, { success: true, hash: tx.hash, cap });
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  return sendJson(res, 404, { error: 'Not Found', url: pathname });
});

server.listen(ADMIN_API_PORT, '127.0.0.1', () => {
  console.log(`Admin API running on http://127.0.0.1:${ADMIN_API_PORT}`);
});
