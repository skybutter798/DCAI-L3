// Data access + navigation helpers.
//
// NODE_RPC is the geth JSON-RPC passthrough exposed by this app's own nginx
// (see nginx.conf). It is deliberately NOT "/rpc1/" — the unified-entry nginx
// on port 80 reserves /rpc1/ for API-key-gated debug access, so when this app
// is served as the default site the path must not collide.
export const NODE_RPC = '/noderpc/';

export const CHAIN_ID = 18441;
export const NATIVE_SYMBOL = 'tDCAI';

// Blockscout API v2 GET. Returns parsed JSON or null (on 429/network errors).
export async function bs(path: string): Promise<any | null> {
  try {
    const res = await fetch(`/api/v2${path}`, { cache: 'no-store' });
    if (res.status === 429) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// geth JSON-RPC call via the node passthrough. Returns `result` or null.
export async function rpc(method: string, params: any[] = []): Promise<any | null> {
  try {
    const res = await fetch(NODE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      cache: 'no-store',
    });
    const j = await res.json();
    return j?.result ?? null;
  } catch {
    return null;
  }
}

export async function rpcBlockNumber(): Promise<number | null> {
  const hex = await rpc('eth_blockNumber');
  if (typeof hex === 'string' && hex.startsWith('0x')) {
    const bn = parseInt(hex, 16);
    if (Number.isFinite(bn)) return bn;
  }
  return null;
}

// Blockscout reports the zero address as `miner` for Clique blocks; the real
// signer comes from clique_getSnapshot(height).recents. Resolved values are
// cached for the session since historical signers never change.
const signerCache: Record<number, string> = {};

export async function resolveCliqueSigners(heights: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const need: number[] = [];
  for (const h of heights) {
    if (!Number.isFinite(h)) continue;
    if (signerCache[h]) out[h] = signerCache[h];
    else need.push(h);
  }

  const harvest = (snap: any) => {
    const recents = snap?.recents || {};
    for (const [k, v] of Object.entries(recents)) {
      const kh = Number(k);
      const addr = String(v || '').toLowerCase();
      if (Number.isFinite(kh) && addr) signerCache[kh] = addr;
    }
  };

  // Each snapshot's `recents` covers a small window, so query in chunks and
  // skip heights that earlier snapshots already answered.
  const CONCURRENCY = 5;
  for (let i = 0; i < need.length; i += CONCURRENCY) {
    const chunk = need.slice(i, i + CONCURRENCY).filter((h) => !signerCache[h]);
    if (!chunk.length) continue;
    await Promise.all(
      chunk.map(async (h) => {
        try {
          const snap = await rpc('clique_getSnapshot', ['0x' + h.toString(16)]);
          harvest(snap);
        } catch {}
      })
    );
  }

  for (const h of need) if (signerCache[h]) out[h] = signerCache[h];
  return out;
}

export function navigateTo(path: string) {
  try {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    window.location.href = path;
  }
}

export async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard && (window as any).isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// Base URL for the rewards/admin API (wallet-signed public endpoints live
// under /admin/api on the unified entry).
export const adminApiBase = (() => {
  try {
    return `${window.location.protocol}//${window.location.hostname}/admin/api`;
  } catch {
    return 'http://139.180.140.143/admin/api';
  }
})();

export const publicBase = (() => {
  try {
    return `${window.location.protocol}//${window.location.hostname}`;
  } catch {
    return 'http://139.180.140.143';
  }
})();
