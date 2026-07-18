// Shared formatting helpers for chain data.

export const short = (s: string, a = 8, b = 6) =>
  s && s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : (s || '--');

export const shortAddr = (s: string) => short(String(s || ''), 6, 4);

// Format a wei-like value into a decimal string with `dp` fraction digits.
export const fmtWei = (weiLike: any, dp = 6, decimals = 18): string => {
  try {
    const wei = BigInt(String(weiLike ?? '0'));
    const neg = wei < 0n;
    const x = neg ? -wei : wei;
    const s = x.toString();
    const head = s.length > decimals ? s.slice(0, -decimals) : '0';
    const tail = s.length > decimals ? s.slice(-decimals) : s.padStart(decimals, '0');
    const frac = tail.slice(0, dp).replace(/0+$/, '');
    return (neg ? '-' : '') + addCommas(head) + (frac ? '.' + frac : '');
  } catch {
    return '--';
  }
};

// Token amounts with configurable decimals (ERC-20).
export const fmtUnits = (valueLike: any, decimalsLike: any, dp = 6): string =>
  fmtWei(valueLike, dp, Number(decimalsLike ?? 18));

export const addCommas = (intStr: string): string =>
  String(intStr).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const fmtNum = (n: any): string => {
  const x = Number(n);
  if (!Number.isFinite(x)) return '--';
  return addCommas(String(Math.trunc(x)));
};

export const timeAgo = (iso?: string): string => {
  try {
    if (!iso) return '--';
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return '--';
  }
};

export const fmtStamp = (iso?: string): string => {
  try {
    if (!iso) return '--';
    return new Date(iso).toLocaleString('en-GB', { hour12: false });
  } catch {
    return '--';
  }
};

export const gasPct = (used: any, limit: any): number | null => {
  const u = Number(used);
  const l = Number(limit);
  if (!Number.isFinite(u) || !Number.isFinite(l) || l <= 0) return null;
  return Math.max(0, Math.min(100, (u / l) * 100));
};
