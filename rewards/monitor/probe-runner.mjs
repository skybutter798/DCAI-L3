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

async function probeRpc() {
  const c = cfg.rpc;
  const url = c.url;
  const timeoutMs = c.timeoutMs ?? 2000;
  const methods = c.methods ?? [{ name: 'eth_blockNumber', params: [] }];
  const samples = c.samplesPerEpoch ?? 10;

  let total = 0;
  let ok = 0;
  let msOk = [];
  let errors = 0;

  for (let i = 0; i < samples; i++) {
    for (const m of methods) {
      total++;
      const res = await rpcCall(url, m.name, m.params ?? [], timeoutMs);
      if (res.ok) {
        ok++;
        msOk.push(res.ms);
      } else {
        errors++;
      }
    }
  }

  const uptime = total === 0 ? 0 : ok / total;
  const p95ms = p95(msOk);
  const errorRate = total === 0 ? 1 : errors / total;

  return {
    uptime: clamp(uptime, 0, 1),
    p95_ms: p95ms ?? 999999,
    error_rate: clamp(errorRate, 0, 1)
  };
}

async function main() {
  const epochId = Number(arg('--epochId', new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')));
  const dayId = Number(arg('--dayId', new Date().toISOString().slice(0,10).replace(/-/g,'')));

  const operators = cfg.operators ?? [];

  // Note: v0.1 uses unified entry probing. Per-operator differentiation requires
  // per-operator endpoints (or a gateway that can route by key/host).
  const rpcMetrics = await probeRpc();

  const out = {
    epochId,
    dayId,
    operators: operators.map((op) => ({
      operator: op.operator,
      services: op.services,
      metrics: {
        rpc: op.services?.rpc ? rpcMetrics : undefined,
        // placeholders for future: indexer/storage/multiregion
      }
    }))
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('wrote', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
