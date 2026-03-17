export type AppView = 'home' | 'blocks' | 'txs' | 'block' | 'tx' | 'address' | 'tokens' | 'token' | 'dashboard';

export function pushRoute(path: string, state: Record<string, unknown> = {}) {
  try {
    window.history.pushState(state, '', path);
  } catch {}
}

export function replaceRoute(path: string, state: Record<string, unknown> = {}) {
  try {
    window.history.replaceState(state, '', path);
  } catch {}
}

export function setRouteQuery(basePath: string, params: Record<string, unknown> | null | undefined, state: Record<string, unknown> = {}, replace = false) {
  try {
    const sp = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) sp.set(String(k), String(v));
      }
    }
    const qs = sp.toString();
    const url = basePath + (qs ? `?${qs}` : '');
    (replace ? replaceRoute : pushRoute)(url, state);
  } catch {}
}

export function navigateTo(path: string) {
  try {
    pushRoute(path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    window.location.href = path;
  }
}

export function parseAppPath(path = window.location.pathname || '/'):
  { view: AppView; blockHeight?: number; txHash?: string; address?: string; tokenAddress?: string } {
  if (path === '/blocks' || path === '/blocks/') return { view: 'blocks' };
  if (path === '/txs' || path === '/txs/') return { view: 'txs' };
  if (path === '/tokens' || path === '/tokens/') return { view: 'tokens' };
  if (path === '/dashboard' || path === '/dashboard/') return { view: 'dashboard' };

  const txm = path.match(/^\/tx\/(0x[0-9a-fA-F]{64})/);
  if (txm) return { view: 'tx', txHash: txm[1] };

  const bm = path.match(/^\/block\/(\d+)/);
  if (bm) {
    const blockHeight = parseInt(bm[1], 10);
    if (Number.isFinite(blockHeight)) return { view: 'block', blockHeight };
  }

  const tokm = path.match(/^\/token\/(0x[0-9a-fA-F]{40})/);
  if (tokm) return { view: 'token', tokenAddress: tokm[1] };

  const am = path.match(/^\/address\/(0x[0-9a-fA-F]{40})/);
  if (am) return { view: 'address', address: am[1] };

  return { view: 'home' };
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
