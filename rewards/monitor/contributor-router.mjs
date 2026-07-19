import fs from 'node:fs';
import http from 'node:http';
import { getContributorPolicy } from './contributor-policy.mjs';
import { DEFAULT_PEER_AGENTS, getFoundationPeerPresence } from './peer-client.mjs';

const PORT = Number(process.env.CONTRIBUTOR_ROUTER_PORT || 3998);
const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/dcai/rewards/monitor/config.json';
const STATS_PATH = process.env.TRAFFIC_STATS_PATH || '/opt/dcai/rewards/monitor/traffic-stats.json';
const EXPECTED_CHAIN_ID = BigInt(process.env.CHAIN_ID || 18441);
const OFFICIAL_RPCS = String(process.env.OFFICIAL_RPC_URLS || 'http://139.180.188.61:8545,http://207.148.72.238:8545')
  .split(',').map((value) => value.trim()).filter(Boolean);
const PEER_AGENT_URLS = String(process.env.P2P_AGENT_URLS || DEFAULT_PEER_AGENTS.join(','))
  .split(',').map((value) => value.trim()).filter(Boolean);

function readEnvValue(path, key) {
  try {
    const row = fs.readFileSync(path, 'utf8').split(/\r?\n/).find((line) => line.replace(/^export\s+/, '').startsWith(key + '='));
    return row ? row.replace(/^export\s+/, '').slice(key.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2') : '';
  } catch { return ''; }
}

const P2P_AGENT_TOKEN = process.env.P2P_AGENT_TOKEN || readEnvValue('/opt/dcai/rewards/.env', 'P2P_AGENT_TOKEN');
const TRAFFIC_WEIGHTS = { observer:1, core:4, backbone:8 };
const LATENCY_BUCKETS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const runtime = new Map();
let candidates = [];
let referenceBlock = 0;
let officialIndex = 0;
let refreshing = false;
let dirtyStats = false;

function loadStats() {
  try { return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); }
  catch { return { version:1, updatedAt:null, minutes:{} }; }
}
const stats = loadStats();
if (!stats.minutes || typeof stats.minutes !== 'object') stats.minutes = {};

function atomicWrite(path, data) {
  const tmp = `${path}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, { mode:0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, path);
}

function minuteKey(date = new Date()) {
  return date.toISOString().slice(0, 16) + 'Z';
}

function recordTraffic(operator, result) {
  const key = minuteKey();
  const minute = stats.minutes[key] ||= { operators:{} };
  const row = minute.operators[operator] ||= {
    requests:0, successes:0, failures:0, fallbacks:0, totalLatencyMs:0,
    latencyBuckets:Object.fromEntries(LATENCY_BUCKETS.map((bucket) => [String(bucket), 0])),
    methods:{}, bytesIn:0, bytesOut:0,
  };
  row.requests++;
  result.success ? row.successes++ : row.failures++;
  if (result.fallback) row.fallbacks++;
  row.totalLatencyMs += Math.max(0, Number(result.latencyMs || 0));
  row.bytesIn += Number(result.bytesIn || 0);
  row.bytesOut += Number(result.bytesOut || 0);
  for (const bucket of LATENCY_BUCKETS) {
    if (result.latencyMs <= bucket) { row.latencyBuckets[String(bucket)]++; break; }
  }
  for (const method of result.methods || []) row.methods[method] = (row.methods[method] || 0) + 1;
  dirtyStats = true;
}

function flushStats() {
  if (!dirtyStats) return;
  const cutoff = minuteKey(new Date(Date.now() - 48 * 60 * 60 * 1000));
  for (const key of Object.keys(stats.minutes)) if (key < cutoff) delete stats.minutes[key];
  stats.updatedAt = new Date().toISOString();
  atomicWrite(STATS_PATH, JSON.stringify(stats, null, 2) + '\n');
  dirtyStats = false;
}

async function rpcFetch(url, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body,
      redirect:'error', signal:controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    try { JSON.parse(text); } catch { throw new Error('invalid JSON-RPC response'); }
    return { text, status:response.status, latencyMs:performance.now() - started };
  } finally { clearTimeout(timer); }
}

async function rpcCall(url, method, timeoutMs = 5000) {
  const result = await rpcFetch(url, JSON.stringify({ jsonrpc:'2.0', id:1, method, params:[] }), timeoutMs);
  const parsed = JSON.parse(result.text);
  if (parsed?.error || parsed?.result == null) throw new Error(`${method} failed`);
  return parsed.result;
}

function routeUrl(routePath) {
  if (!/^\/op\/[0-9a-f]{40}\/rpc\/[0-9a-f]{32}\/$/.test(String(routePath || ''))) throw new Error('invalid monitoring route');
  return `http://127.0.0.1${routePath}`;
}

async function refreshCandidates() {
  if (refreshing) return;
  refreshing = true;
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    try { referenceBlock = Number(BigInt(await rpcCall(OFFICIAL_RPCS[0], 'eth_blockNumber'))); }
    catch { referenceBlock = 0; }
    const eligible = (config.operators || []).filter((operator) =>
      operator?.contributionPolicyVersion === 'v2' && operator?.services?.rpc && operator?.p2p?.nodeId && operator?.monitoringRoutes?.rpc?.routePath,
    );
    candidates = await Promise.all(eligible.map(async (operator) => {
      const address = String(operator.operator).toLowerCase();
      const state = runtime.get(address) || { consecutiveFailures:0, circuitUntil:0 };
      runtime.set(address, state);
      const policy = getContributorPolicy(operator.programTier, { allowLegacyDefault:true });
      let p2p;
      let chainId = null;
      let blockNumber = 0;
      let error = '';
      try {
        p2p = await getFoundationPeerPresence({
          nodeId:operator.p2p.nodeId, agentUrls:PEER_AGENT_URLS, token:P2P_AGENT_TOKEN, timeoutMs:4000,
        });
        const url = routeUrl(operator.monitoringRoutes.rpc.routePath);
        chainId = BigInt(await rpcCall(url, 'eth_chainId', 4000));
        blockNumber = Number(BigInt(await rpcCall(url, 'eth_blockNumber', 4000)));
        if (chainId !== EXPECTED_CHAIN_ID) throw new Error('wrong chainId');
        if (!referenceBlock || referenceBlock - blockNumber > 12) throw new Error('block lag exceeds 12');
        if (p2p.connectedAgents < 1) throw new Error('not connected to a Foundation peer');
        state.lastHealthyAt = new Date().toISOString();
      } catch (caught) {
        error = caught?.message || String(caught);
      }
      return {
        operator:address,
        programTier:policy.key,
        weight:TRAFFIC_WEIGHTS[policy.key] || 1,
        url:routeUrl(operator.monitoringRoutes.rpc.routePath),
        nodeId:operator.p2p.nodeId,
        p2pConnectedAgents:p2p?.connectedAgents || 0,
        blockNumber,
        blockLag:referenceBlock && blockNumber ? Math.max(0, referenceBlock - blockNumber) : null,
        healthy:!error,
        error,
        state,
      };
    }));
  } catch (error) {
    candidates = [];
    console.error('[contributor-router] refresh failed:', error?.message || error);
  } finally { refreshing = false; }
}

function chooseContributor() {
  const now = Date.now();
  const ready = candidates.filter((candidate) => candidate.healthy && candidate.state.circuitUntil <= now);
  const total = ready.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (!total) return null;
  let point = Math.random() * total;
  for (const candidate of ready) {
    point -= candidate.weight;
    if (point <= 0) return candidate;
  }
  return ready[ready.length - 1];
}

function requestMethods(body) {
  try {
    const parsed = JSON.parse(body);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => String(row?.method || 'unknown')).slice(0, 100);
  } catch { return ['invalid-json']; }
}

async function fallbackOfficial(body) {
  let lastError;
  for (let attempt = 0; attempt < OFFICIAL_RPCS.length; attempt++) {
    const url = OFFICIAL_RPCS[(officialIndex++) % OFFICIAL_RPCS.length];
    try { return await rpcFetch(url, body, 8000); }
    catch (error) { lastError = error; }
  }
  throw lastError || new Error('all official RPC fallbacks failed');
}

async function readRequestBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname === '/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok:true, referenceBlock, eligible:candidates.filter((row) => row.healthy).length });
  }
  if (pathname === '/v1/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok:true, referenceBlock, canaryPercent:4.76,
      candidates:candidates.map((row) => ({
        operator:row.operator, programTier:row.programTier, healthy:row.healthy,
        p2pConnectedAgents:row.p2pConnectedAgents, blockNumber:row.blockNumber,
        blockLag:row.blockLag, circuitUntil:row.state.circuitUntil || 0,
        consecutiveFailures:row.state.consecutiveFailures || 0, error:row.error,
      })),
      statsUpdatedAt:stats.updatedAt,
    });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error:'POST required' });

  try {
    const body = await readRequestBody(req);
    const methods = requestMethods(body);
    const selected = chooseContributor();
    if (!selected) {
      const official = await fallbackOfficial(body);
      res.writeHead(official.status, { 'Content-Type':'application/json', 'X-DCAI-Route':'official-fallback' });
      return res.end(official.text);
    }

    try {
      const result = await rpcFetch(selected.url, body, 8000);
      selected.state.consecutiveFailures = 0;
      recordTraffic(selected.operator, {
        success:true, fallback:false, latencyMs:result.latencyMs, methods,
        bytesIn:Buffer.byteLength(body), bytesOut:Buffer.byteLength(result.text),
      });
      res.writeHead(result.status, { 'Content-Type':'application/json', 'X-DCAI-Route':'contributor' });
      return res.end(result.text);
    } catch (error) {
      selected.state.consecutiveFailures = (selected.state.consecutiveFailures || 0) + 1;
      if (selected.state.consecutiveFailures >= 3) selected.state.circuitUntil = Date.now() + 60_000;
      const official = await fallbackOfficial(body);
      recordTraffic(selected.operator, {
        success:false, fallback:true, latencyMs:official.latencyMs, methods,
        bytesIn:Buffer.byteLength(body), bytesOut:Buffer.byteLength(official.text),
      });
      res.writeHead(official.status, { 'Content-Type':'application/json', 'X-DCAI-Route':'official-after-contributor-failure' });
      return res.end(official.text);
    }
  } catch (error) {
    return sendJson(res, 502, { error:'RPC unavailable', detail:error?.message || String(error) });
  }
});

setInterval(refreshCandidates, 15_000).unref();
setInterval(flushStats, 5_000).unref();
process.on('SIGTERM', () => { try { flushStats(); } finally { process.exit(0); } });

await refreshCandidates();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`DCAI contributor router listening on 127.0.0.1:${PORT}`);
});
