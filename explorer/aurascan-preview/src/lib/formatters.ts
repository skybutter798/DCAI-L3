export function shortHash(value: string, a = 10, b = 6) {
  return value && value.length > a + b ? `${value.slice(0, a)}…${value.slice(-b)}` : value || '--';
}

export function formatUnits(valueLike: any, decimalsLike: any = 18, dp = 6) {
  try {
    const d = Number(decimalsLike ?? 18);
    const v = BigInt(String(valueLike ?? '0'));
    const s = v.toString();
    const pad = s.length <= d ? '0'.repeat(d - s.length + 1) + s : s;
    const head = pad.slice(0, -d);
    const tail = pad.slice(-d);
    return `${head}.${tail.slice(0, dp)}`;
  } catch {
    return '--';
  }
}

export function formatTDCAI(weiLike: any, dp = 6) {
  return formatUnits(weiLike, 18, dp);
}

export function formatTDCAIParts(weiLike: any, dp = 6) {
  const s = formatTDCAI(weiLike, dp);
  if (s === '--') return { i: '--', f: ''.padEnd(dp, '-') };
  const [i, f0] = String(s).split('.');
  return { i: i || '0', f: (f0 || '').padEnd(dp, '0').slice(0, dp) };
}
