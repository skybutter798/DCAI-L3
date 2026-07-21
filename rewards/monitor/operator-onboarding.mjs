import { lookup } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { ethers } from 'ethers';
import { validateContributorTier } from './contributor-policy.mjs';
import { parseContributorEnode } from './peer-client.mjs';

export const DEFAULT_OPERATOR_REGISTRY = '0xb37c81eBC4b1B4bdD5476fe182D6C72133F41db9';
export const DEFAULT_CHAIN_ID = 18441;

const ROLE_TO_SERVICE = {
  'rpc-provider': 'rpc',
  indexer: 'indexer',
};

const registryAbi = [
  'function owner() view returns (address)',
  'function status(address operator) view returns (uint8)',
  'function setOperatorStatus(address operator,uint8 newStatus)',
];

const bareHostname = (value) => String(value || '').replace(/^\[|\]$/g, '');

export function parseContributorNote(note) {
  const lines = String(note || '').replace(/\r/g, '').split('\n');
  const read = (label) => {
    const row = lines.find((line) => line.startsWith(label + ':'));
    return row ? row.slice(label.length + 1).trim() : '';
  };
  return {
    isContributor: lines[0] === 'Contributor Program Application',
    role: read('Role').toLowerCase(),
    programTier: read('Program Tier').toLowerCase(),
    internalTier: read('Internal Tier').toLowerCase(),
    region: read('Region'),
    endpoint: read('Endpoint'),
    enode: read('Enode'),
    note: read('Note'),
  };
}

export function contributorSpecFromRequest(request) {
  const parsed = parseContributorNote(request?.note);
  if (!parsed.isContributor && request?.source !== 'contributor') return null;

  const operator = ethers.getAddress(String(request?.address || ''));
  const service = ROLE_TO_SERVICE[parsed.role];
  if (!service) throw new Error('Contributor role must be rpc-provider or indexer');
  if (!parsed.endpoint || parsed.endpoint === '-') throw new Error('Contributor endpoint is required');
  const enode = parseContributorEnode(parsed.enode);
  const policy = validateContributorTier(parsed.programTier, parsed.internalTier, request?.tier);
  if (policy.regionRequired && (!parsed.region || parsed.region === '-')) {
    throw new Error(`${policy.label} contributors must declare a region`);
  }

  return {
    operator,
    service,
    role: parsed.role,
    region: parsed.region && parsed.region !== '-' ? parsed.region : '',
    programTier: parsed.programTier,
    internalTier: parsed.internalTier || String(request?.tier || ''),
    policy,
    enode:enode.enode,
    nodeId:enode.nodeId,
    endpoint: normalizeContributorEndpoint(parsed.endpoint, service),
    requestId: String(request?.id || ''),
  };
}

export function normalizeContributorEndpoint(value, service) {
  if (typeof value !== 'string' || value.length > 500) throw new Error('Invalid contributor endpoint');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Contributor endpoint must be a valid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Contributor endpoint must use http or https');
  if (url.username || url.password) throw new Error('Contributor endpoint cannot contain credentials');
  if (url.search || url.hash) throw new Error('Contributor endpoint cannot contain query parameters or fragments');
  if (!url.hostname || !/^[a-zA-Z0-9.:-]+$/.test(bareHostname(url.hostname))) throw new Error('Contributor endpoint hostname is invalid');
  if (url.port && !/^\d{1,5}$/.test(url.port)) throw new Error('Contributor endpoint port is invalid');
  if (!/^\/[a-zA-Z0-9._~%/-]*$/.test(url.pathname)) throw new Error('Contributor endpoint path contains unsupported characters');

  if (service === 'indexer') {
    url.pathname = url.pathname.replace(/\/(api\/v2\/(health|blocks))\/?$/i, '/');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
  } else if (!url.pathname) {
    url.pathname = '/';
  }
  return url.toString();
}

function isPublicIp(address) {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (version === 6) {
    const v = address.toLowerCase();
    if (v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('ff')) return false;
    if (/^fe[89ab]/.test(v)) return false;
    if (v.startsWith('2001:db8')) return false;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPublicIp(mapped[1]) : true;
  }
  return false;
}

export async function resolvePublicEndpoint(endpoint) {
  const url = new URL(endpoint);
  const hostname = bareHostname(url.hostname);
  const literalVersion = isIP(hostname);
  const rows = literalVersion
    ? [{ address: hostname, family: literalVersion }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!rows.length) throw new Error('Contributor endpoint hostname did not resolve');
  const unsafe = rows.find((row) => !isPublicIp(row.address));
  if (unsafe) throw new Error('Contributor endpoint resolves to a private or reserved address');
  return { url, addresses: rows.map((row) => row.address), selectedAddress: rows[0].address };
}

async function fetchJson(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, redirect:'error', signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error('HTTP ' + response.status);
    try { return JSON.parse(text); } catch { throw new Error('Endpoint returned invalid JSON'); }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Contributor endpoint timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function preflightContributorEndpoint(spec, options = {}) {
  const expectedChainId = BigInt(options.expectedChainId ?? DEFAULT_CHAIN_ID);
  const resolved = await resolvePublicEndpoint(spec.endpoint);

  if (spec.service === 'rpc') {
    const call = async (method) => await fetchJson(spec.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
    }, options.timeoutMs);
    const chain = await call('eth_chainId');
    if (chain?.error || chain?.result == null) throw new Error('RPC endpoint did not return eth_chainId');
    if (BigInt(chain.result) !== expectedChainId) throw new Error('RPC endpoint is not DCAI L3 chainId ' + expectedChainId);
    const block = await call('eth_blockNumber');
    if (block?.error || block?.result == null) throw new Error('RPC endpoint did not return eth_blockNumber');
    return { ...resolved, chainId: Number(expectedChainId), blockNumber: Number(BigInt(block.result)) };
  }

  const blocksUrl = new URL('api/v2/blocks', spec.endpoint).toString();
  const data = await fetchJson(blocksUrl, {}, options.timeoutMs);
  const height = Number(data?.items?.[0]?.height);
  if (!Number.isFinite(height) || height <= 0) throw new Error('Indexer endpoint did not return a valid latest block');
  if (Number.isFinite(options.referenceBlockNumber) && Math.abs(options.referenceBlockNumber - height) > 100) {
    throw new Error('Indexer endpoint is more than 100 blocks from DCAI L3');
  }
  return { ...resolved, blockNumber: height };
}

function routeBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid operator route base URL');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function proxyTargetFor(endpoint, selectedAddress) {
  const source = new URL(endpoint);
  const target = new URL(endpoint);
  target.hostname = isIP(selectedAddress) === 6 ? '[' + selectedAddress + ']' : selectedAddress;
  return {
    proxyTarget: target.toString(),
    upstreamHost: source.host,
    upstreamServerName: bareHostname(source.hostname),
  };
}

export function buildContributorConfig(currentConfig, request, preflight, options = {}) {
  const spec = contributorSpecFromRequest(request);
  if (!spec) throw new Error('Not a Contributor Program application');
  const p2p = options.p2pVerification;
  if (!p2p || p2p.nodeId !== spec.nodeId || Number(p2p.connectedAgents || 0) < 1) {
    throw new Error('A matching Foundation P2P verification is required before onboarding');
  }
  const routeKey = options.routeKey || randomBytes(16).toString('hex');
  if (!/^[0-9a-f]{32}$/.test(routeKey)) throw new Error('Invalid monitoring route key');
  const slug = spec.operator.slice(2).toLowerCase();
  const routePath = `/op/${slug}/${spec.service}/${routeKey}/`;
  const routeUrl = routeBaseUrl(options.routeBase || 'https://explorer.dcai.ai') + routePath;
  if (!Array.isArray(preflight.addresses) || !preflight.addresses.includes(p2p.address)) {
    throw new Error('Verified Enode address is not present in the endpoint DNS result');
  }
  // Pin monitoring to the exact machine whose Geth identity was verified.
  // This matters for multi-address DNS names where the first answer may point
  // at a different backend than the submitted Enode.
  const proxy = proxyTargetFor(spec.endpoint, p2p.address);

  const config = JSON.parse(JSON.stringify(currentConfig || {}));
  if (!Array.isArray(config.operators)) config.operators = [];
  let operator = config.operators.find((row) => String(row.operator || '').toLowerCase() === spec.operator.toLowerCase());
  if (!operator) {
    operator = { operator: spec.operator, services: {}, endpoints: {} };
    config.operators.push(operator);
  }
  operator.operator = spec.operator;
  operator.programTier = spec.programTier;
  operator.internalTier = spec.internalTier;
  operator.contributionPolicyVersion = 'v2';
  operator.p2p = {
    version:'v1',
    enode:p2p.enode,
    nodeId:p2p.nodeId,
    address:p2p.address,
    port:p2p.port,
    connectedAgents:p2p.connectedAgents,
    verifiedAt:p2p.verifiedAt,
    agents:(p2p.agents || []).map((agent) => ({ agentUrl:agent.agentUrl, connected:!!agent.connected })),
  };
  operator.rewardPolicy = {
    version: 'v2-real-contribution',
    rewardFactor: spec.policy.rewardFactor,
    nodeId:spec.nodeId,
    rpcRatePerSecond: spec.policy.rpcRatePerSecond,
    slo: spec.policy.slo,
  };
  operator.services = { rpc:false, indexer:false, storage:false, multiregion:false, ...(operator.services || {}) };
  operator.endpoints = { ...(operator.endpoints || {}) };
  operator.monitoringRoutes = { ...(operator.monitoringRoutes || {}) };
  operator.services[spec.service] = true;
  operator.endpoints[spec.service] = routeUrl;
  operator.monitoringRoutes[spec.service] = {
    service: spec.service,
    upstream: spec.endpoint,
    proxyTarget: proxy.proxyTarget,
    upstreamHost: proxy.upstreamHost,
    upstreamServerName: proxy.upstreamServerName,
    routePath,
    region: spec.region,
    programTier: spec.programTier,
    rewardFactor: spec.policy.rewardFactor,
    requestId: spec.requestId,
    approvedAt: options.approvedAt || new Date().toISOString(),
  };

  return { config, operator, spec, routePath, routeUrl };
}

export function renderOperatorRoutes(config) {
  const blocks = ['# Managed by DCAI contributor onboarding. Do not edit by hand.'];
  for (const operator of config?.operators || []) {
    for (const [service, route] of Object.entries(operator.monitoringRoutes || {})) {
      if (!['rpc', 'indexer'].includes(service)) throw new Error('Unsupported monitoring service in config');
      if (!/^\/op\/[0-9a-f]{40}\/(rpc|indexer)\/[0-9a-f]{32}\/$/.test(route.routePath || '')) throw new Error('Invalid monitoring route path in config');
      const target = new URL(route.proxyTarget);
      const targetHostname = bareHostname(target.hostname);
      if (!['http:', 'https:'].includes(target.protocol) || !isIP(targetHostname)) throw new Error('Monitoring proxy target must use a resolved public IP');
      if (!isPublicIp(targetHostname)) throw new Error('Monitoring proxy target is not public');
      if (!/^[a-zA-Z0-9.:[\]-]+$/.test(route.upstreamHost || '') || !/^[a-zA-Z0-9.:-]+$/.test(route.upstreamServerName || '')) throw new Error('Invalid monitoring upstream host');

      const match = service === 'rpc' ? `location = ${route.routePath}` : `location ^~ ${route.routePath}`;
      const methods = service === 'rpc' ? 'POST' : 'GET HEAD';
      blocks.push(`
${match} {
  limit_except ${methods} { deny all; }
  proxy_connect_timeout 3s;
  proxy_read_timeout 8s;
  proxy_send_timeout 8s;
  proxy_set_header Host ${route.upstreamHost};
  proxy_ssl_server_name on;
  proxy_ssl_name ${route.upstreamServerName};
  proxy_pass ${route.proxyTarget};
}`);
    }
  }
  return blocks.join('\n') + '\n';
}

export async function ensureOperatorActive(options) {
  const provider = new ethers.JsonRpcProvider(options.rpcUrl);
  const wallet = new ethers.Wallet(options.privateKey, provider);
  const registry = new ethers.Contract(options.registryAddress || DEFAULT_OPERATOR_REGISTRY, registryAbi, wallet);
  const owner = await registry.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('Configured registry key is not the OperatorRegistry owner');
  const previousStatus = Number(await registry.status(options.operator));
  if (previousStatus === 1) return { previousStatus, changed:false, txHash:null, registry, wallet };
  const tx = await registry.setOperatorStatus(options.operator, 1);
  await tx.wait();
  return { previousStatus, changed:true, txHash:tx.hash, registry, wallet };
}

export async function restoreOperatorStatus(activation, operator) {
  if (!activation?.changed) return { changed:false, txHash:null };
  const tx = await activation.registry.setOperatorStatus(operator, activation.previousStatus);
  await tx.wait();
  return { changed:true, txHash:tx.hash };
}
