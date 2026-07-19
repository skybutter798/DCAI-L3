import { isIP } from 'node:net';

export const DEFAULT_PEER_AGENTS = [
  'http://139.180.188.61:3090',
  'http://207.148.72.238:3090',
];

const ENODE_RE = /^enode:\/\/([0-9a-f]{128})@((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})$/i;

export function isPublicIp(address) {
  const version = isIP(address);
  if (version !== 4) return false;
  const [a, b, c, d] = address.split('.').map(Number);
  if ([a, b, c, d].some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function parseContributorEnode(value) {
  const enode = String(value || '').trim();
  const match = enode.match(ENODE_RE);
  if (!match) throw new Error('Enode must use enode://<128 hex node id>@<public IPv4>:<port>');
  const port = Number(match[3]);
  if (!isPublicIp(match[2]) || port < 1 || port > 65535) throw new Error('Enode must advertise a public IPv4 address and valid port');
  return { enode, nodeId:match[1].toLowerCase(), address:match[2], port };
}

export function validateEnodeMatchesEndpoint(enode, endpointAddresses) {
  const parsed = parseContributorEnode(enode);
  const addresses = Array.isArray(endpointAddresses) ? endpointAddresses : [];
  if (!addresses.includes(parsed.address)) {
    throw new Error('Enode public IP must match one of the submitted endpoint IP addresses');
  }
  return parsed;
}

async function agentRequest(agentUrl, path, token, options = {}) {
  if (!/^[0-9a-f]{64}$/i.test(String(token || ''))) throw new Error('P2P agent token is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  try {
    const response = await fetch(new URL(path, agentUrl), {
      method:options.method || 'GET',
      headers:{
        Authorization:`Bearer ${token}`,
        ...(options.body ? { 'Content-Type':'application/json' } : {}),
      },
      body:options.body ? JSON.stringify(options.body) : undefined,
      redirect:'error',
      signal:controller.signal,
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('peer agent returned invalid JSON'); }
    if (!response.ok || !data?.ok) throw new Error(data?.error || `peer agent HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function connectToFoundationPeers(options) {
  const parsed = validateEnodeMatchesEndpoint(options.enode, options.endpointAddresses);
  const agents = options.agentUrls?.length ? options.agentUrls : DEFAULT_PEER_AGENTS;
  const results = await Promise.all(agents.map(async (agentUrl) => {
    try {
      const data = await agentRequest(agentUrl, '/v1/peers/connect', options.token, {
        method:'POST', body:{ enode:parsed.enode }, timeoutMs:options.timeoutMs || 18000,
      });
      return { agentUrl, connected:true, wasConnected:!!data.wasConnected, remoteAddress:data.peer?.remoteAddress || '' };
    } catch (error) {
      return { agentUrl, connected:false, wasConnected:false, error:error?.message || String(error) };
    }
  }));
  const connectedAgents = results.filter((row) => row.connected).length;
  if (connectedAgents < 1) throw new Error('Enode could not establish a P2P session with either Foundation RPC node');
  return {
    version:'v1',
    enode:parsed.enode,
    nodeId:parsed.nodeId,
    address:parsed.address,
    port:parsed.port,
    connectedAgents,
    agents:results,
    verifiedAt:new Date().toISOString(),
  };
}

export async function rollbackFoundationPeers(verification, token) {
  const errors = [];
  for (const agent of verification?.agents || []) {
    if (!agent.connected || agent.wasConnected) continue;
    try {
      await agentRequest(agent.agentUrl, '/v1/peers/remove', token, {
        method:'POST', body:{ enode:verification.enode }, timeoutMs:8000,
      });
    } catch (error) {
      errors.push(`${agent.agentUrl}: ${error?.message || error}`);
    }
  }
  return errors;
}

export async function getFoundationPeerPresence(options) {
  const nodeId = String(options.nodeId || '').toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(nodeId)) return { connectedAgents:0, agents:[], observedAt:new Date().toISOString() };
  const agents = options.agentUrls?.length ? options.agentUrls : DEFAULT_PEER_AGENTS;
  const results = await Promise.all(agents.map(async (agentUrl) => {
    try {
      const data = await agentRequest(agentUrl, '/v1/status', options.token, { timeoutMs:options.timeoutMs || 6000 });
      const peer = (data.peers || []).find((row) => String(row.id || '').toLowerCase() === nodeId);
      return { agentUrl, connected:!!peer, remoteAddress:peer?.remoteAddress || '', foundationBlock:data.blockNumber || 0 };
    } catch (error) {
      return { agentUrl, connected:false, error:error?.message || String(error) };
    }
  }));
  return {
    connectedAgents:results.filter((row) => row.connected).length,
    agents:results,
    observedAt:new Date().toISOString(),
  };
}
