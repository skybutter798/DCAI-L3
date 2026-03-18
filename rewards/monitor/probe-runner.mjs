import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

function arg(name, def = undefined) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  return process.argv[idx + 1];
}

const cfgPath = arg('--config', 'config.json');
const outPath = arg('--out', 'measurements.json');

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

async function rpcCall(url, method, params, timeoutMs) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const t0 = performance.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal });
    const text = await r.text();
    const dt = performance.now() - t0;
    if (!r.ok) return { ok: false, ms: dt, err: 'HTTP_' + r.status };
    let j;
    try { j = JSON.parse(text); } catch { return { ok: false, ms: dt, err: 'BAD_JSON' }; }
    if (j.error) return { ok: false, ms: dt, err: 'RPC_' + (j.error.message || 'ERR') };
    return { ok: true, ms: dt, result: j.result };
  } catch (e) {
    const dt = performance.now() - t0;
    return { ok: false, ms: dt, err: (e?.name === 'AbortError') ? 'TIMEOUT' : 'FETCH_ERR' };
  } finally {
    clearTimeout(to);
  }
}

function p95(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const idx = Math.floor(0.95 * (a.length - 1));
  return a[idx];
}

async function probeRpc(url, timeoutMs, methods, samples) {
  let total = 0, ok = 0, msOk = [], errors = 0;
  for (let i = 0; i < samples; i++) {
    for (const m of methods) {
      total++;
      const res = await rpcCall(url, m.name, m.params ?? [], timeoutMs);
      if (res.ok) { ok++; msOk.push(res.ms); } else { errors++; }
    }
  }
  const uptime = total === 0 ? 0 : ok / total;
  const p95ms = p95(msOk);
  const errorRate = total === 0 ? 1 : errors / total;
  return { uptime: clamp(uptime, 0, 1), p95_ms: p95ms ?? 999999, error_rate: clamp(errorRate, 0, 1) };
}

async function httpGetJson(url, timeoutMs) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const text = await r.text();
    const dt = performance.now() - t0;
    if (!r.ok) return { ok: false, ms: dt, err: 'HTTP_' + r.status };
    let j;
    try { j = JSON.parse(text); } catch { return { ok: false, ms: dt, err: 'BAD_JSON' }; }
    return { ok: true, ms: dt, json: j };
  } catch (e) {
    const dt = performance.now() - t0;
    return { ok: false, ms: dt, err: (e?.name === 'AbortError') ? 'TIMEOUT' : 'FETCH_ERR' };
  } finally {
    clearTimeout(to);
  }
}

async function probeIndexer(blockscoutApiBase, chainHeight, timeoutMs, samples) {
  const url = blockscoutApiBase.endsWith('/') ? (blockscoutApiBase + 'api/v2/blocks') : (blockscoutApiBase + '/api/v2/blocks');
  let total = 0, ok = 0, msOk = [], errors = 0, bestHeight = null;
  for (let i = 0; i < samples; i++) {
    total++;
    const res = await httpGetJson(url, timeoutMs);
    if (res.ok) {
      ok++; msOk.push(res.ms);
      const h = res.json?.items?.[0]?.height;
      if (typeof h === 'number') bestHeight = (bestHeight === null) ? h : Math.max(bestHeight, h);
    } else { errors++; }
  }
  const uptime = total === 0 ? 0 : ok / total;
  const p95ms = p95(msOk);
  const errorRate = total === 0 ? 1 : errors / total;
  const lagBlocks = (bestHeight === null) ? 1e9 : Math.max(0, chainHeight - bestHeight);
  return { uptime: clamp(uptime, 0, 1), p95_ms: p95ms ?? 999999, error_rate: clamp(errorRate, 0, 1), lag_blocks: lagBlocks };
}

async function probeStorage(url, timeoutMs) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const dt = performance.now() - t0;
    if (r.ok) return { uptime: 1, p95_ms: dt, error_rate: 0 };
    return { uptime: 0, p95_ms: dt, error_rate: 1, err: 'HTTP_' + r.status };
  } catch (e) {
    const dt = performance.now() - t0;
    return { uptime: 0, p95_ms: dt, error_rate: 1, err: 'FETCH_ERR' };
  } finally {
    clearTimeout(to);
  }
}

async function probeMultiregion(urls, timeoutMs) {
  const results = [];
  for (const u of urls) {
    const res = await rpcCall(u, 'eth_blockNumber', [], timeoutMs);
    results.push(res.ok);
  }
  const regions_ok = results.filter(Boolean).length;
  const regions_required = urls.length;
  return { regions_ok, regions_required };
}

async function main() {
  const rpcDefaults = cfg.rpc || {};
  const timeoutMs = rpcDefaults.timeoutMs ?? 2000;
  const methods = rpcDefaults.methods ?? [{ name: 'eth_blockNumber', params: [] }];
  const samples = rpcDefaults.samplesPerEpoch ?? 10;
  const operators = cfg.operators ?? [];

  const rpcUrl = cfg.rpc?.referenceUrl || operators[0]?.endpoints?.rpc;
  let chainHeight = 0;
  if (rpcUrl) {
    const res = await rpcCall(rpcUrl, 'eth_blockNumber', [], timeoutMs);
    if (res.ok) chainHeight = parseInt(res.result, 16);
  }
  console.log('reference chain height:', chainHeight);

  const epochId = Number(arg('--epochId', new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')));
  const dayId = Number(arg('--dayId', new Date().toISOString().slice(0,10).replace(/-/g,'')));

  const outOps = [];
  for (const op of operators) {
    const endpoints = op.endpoints || {};
    const metrics = {};
    if (op.services?.rpc) {
      metrics.rpc = await probeRpc(endpoints.rpc, timeoutMs, methods, samples);
    }
    if (op.services?.indexer) {
      if (!endpoints.indexer) {
        metrics.indexer = { uptime: 0, p95_ms: 999999, error_rate: 1, lag_blocks: 1e9, note: 'missing endpoints.indexer' };
      } else {
        metrics.indexer = await probeIndexer(endpoints.indexer, chainHeight, timeoutMs, Math.max(1, Math.floor(samples / 2)));
      }
    }
    if (op.services?.storage) {
      if (!endpoints.storage) {
        metrics.storage = { uptime: 0, p95_ms: 999999, error_rate: 1, note: 'missing endpoints.storage' };
      } else {
        metrics.storage = await probeStorage(endpoints.storage, timeoutMs);
      }
    }
    if (op.services?.multiregion) {
      metrics.multiregion = await probeMultiregion(endpoints.multiregion || [], timeoutMs);
    }
    outOps.push({ operator: op.operator, services: op.services, metrics });
  }
  const out = { epochId, dayId, operators: outOps };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('wrote', outPath);
}

main().catch(e => { console.error(e); process.exit(1); });