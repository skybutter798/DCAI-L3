import fs from 'node:fs';

// score-to-claims.mjs
// Converts a measurement snapshot into claims.json
//
// Usage:
//   node score-to-claims.mjs --in measurements.json --out claims.json \
//        --dailyCapWei <wei> --epochsPerDay 12 [--config monitor/config.json]
//
// Input measurements.json (example):
// {
//   "epochId": 202603140900,
//   "dayId": 20260314,
//   "operators": [
//     {
//       "operator": "0x...",
//       "services": {"rpc": true, "indexer": false, "storage": true, "multiregion": false},
//       "metrics": {
//         "rpc": {"uptime": 0.995, "p95_ms": 120, "error_rate": 0.001},
//         "storage": {"uptime": 0.999, "io_p95_ms": 12, "error_rate": 0.0005}
//       }
//     }
//   ]
// }

function arg(name, def = undefined) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  return process.argv[idx + 1];
}

const inFile = arg('--in');
const outFile = arg('--out', 'claims.json');
const dailyCapWei = BigInt(arg('--dailyCapWei', '0'));
const epochsPerDay = BigInt(arg('--epochsPerDay', '12'));
const configFile = arg('--config');

if (!inFile) {
  console.error('Missing --in measurements.json');
  process.exit(2);
}
if (dailyCapWei <= 0n) {
  console.error('Missing/invalid --dailyCapWei');
  process.exit(2);
}

const input = JSON.parse(fs.readFileSync(inFile, 'utf8'));

// Canonical service weights. These are RELATIVE weights — the final payout is
// proportional (share = operator.totalScore / Σ totalScore), so only the ratio
// between services matters (40/20/30/10 is identical to 0.4/0.2/0.3/0.1).
// The admin dashboard edits config.weights; if config is missing or a key is
// absent, we fall back to these defaults so scoring never silently breaks.
const DEFAULT_WEIGHTS = { rpc: 40, indexer: 20, storage: 30, multiregion: 10 };
const WEIGHT_KEYS = ['rpc', 'indexer', 'storage', 'multiregion'];

function loadWeights(path) {
  const weights = { ...DEFAULT_WEIGHTS };
  if (!path) return { weights, source: 'default (no --config)' };
  try {
    const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
    const w = cfg && typeof cfg.weights === 'object' && cfg.weights ? cfg.weights : null;
    if (!w) return { weights, source: 'default (config has no weights)' };
    for (const k of WEIGHT_KEYS) {
      const v = Number(w[k]);
      if (Number.isFinite(v) && v >= 0) weights[k] = v;
    }
    return { weights, source: `config:${path}` };
  } catch (e) {
    console.error(`[score] failed to read weights from ${path}, using defaults:`, e.message);
    return { weights, source: 'default (config read error)' };
  }
}

const { weights: WEIGHTS, source: weightsSource } = loadWeights(configFile);
console.error('[score] weights', JSON.stringify(WEIGHTS), '·', weightsSource);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function scoreRpc(m) {
  const uptime = m?.uptime ?? 0;
  const p95 = m?.p95_ms ?? 1e9;
  const err = m?.error_rate ?? 1;
  const A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1);
  const L = clamp((800 - p95) / 800, 0, 1);
  const E = clamp((0.02 - err) / 0.02, 0, 1);
  const rawScore = A * (0.6 * L + 0.4 * E);
  return { A, L, E, rawScore };
}

function scoreIndexer(m) {
  const uptime = m?.uptime ?? 0;
  const lag = m?.lag_blocks ?? 1e9;
  const A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1);
  const G = clamp((12 - lag) / 12, 0, 1);
  const rawScore = A * G;
  return { A, G, rawScore };
}

function scoreStorage(m) {
  const uptime = m?.uptime ?? 0;
  const io = m?.io_p95_ms ?? 1e9;
  const err = m?.error_rate ?? 1;
  const A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1);
  const I = clamp((50 - io) / 50, 0, 1);
  const E = clamp((0.02 - err) / (0.02), 0, 1);
  const rawScore = A * (0.6 * I + 0.4 * E);
  return { A, I, E, rawScore };
}

function scoreMultiregion(m) {
  const ok = m?.regions_ok ?? 0;
  const req = m?.regions_required ?? 1;
  const rawScore = ok >= req ? 1 : 0;
  return { ok, req, rawScore };
}

function buildBreakdown(op) {
  const services = op.services || {};
  const metrics = op.metrics || {};

  const rpcBits = scoreRpc(metrics.rpc || {});
  const indexerBits = scoreIndexer(metrics.indexer || {});
  const storageBits = scoreStorage(metrics.storage || {});
  const multiregionBits = scoreMultiregion(metrics.multiregion || {});

  const breakdown = {
    rpc: {
      enabled: !!services.rpc,
      weight: WEIGHTS.rpc,
      metrics: {
        uptime: metrics.rpc?.uptime ?? 0,
        p95_ms: metrics.rpc?.p95_ms ?? null,
        error_rate: metrics.rpc?.error_rate ?? null
      },
      factors: {
        availability: rpcBits.A,
        latency: rpcBits.L,
        errors: rpcBits.E
      },
      rawScore: services.rpc ? rpcBits.rawScore : 0,
      weightedScore: services.rpc ? WEIGHTS.rpc * rpcBits.rawScore : 0
    },
    indexer: {
      enabled: !!services.indexer,
      weight: WEIGHTS.indexer,
      metrics: {
        uptime: metrics.indexer?.uptime ?? 0,
        lag_blocks: metrics.indexer?.lag_blocks ?? null
      },
      factors: {
        availability: indexerBits.A,
        freshness: indexerBits.G
      },
      rawScore: services.indexer ? indexerBits.rawScore : 0,
      weightedScore: services.indexer ? WEIGHTS.indexer * indexerBits.rawScore : 0
    },
    storage: {
      enabled: !!services.storage,
      weight: WEIGHTS.storage,
      metrics: {
        uptime: metrics.storage?.uptime ?? 0,
        io_p95_ms: metrics.storage?.io_p95_ms ?? null,
        error_rate: metrics.storage?.error_rate ?? null
      },
      factors: {
        availability: storageBits.A,
        io: storageBits.I,
        errors: storageBits.E
      },
      rawScore: services.storage ? storageBits.rawScore : 0,
      weightedScore: services.storage ? WEIGHTS.storage * storageBits.rawScore : 0
    },
    multiregion: {
      enabled: !!services.multiregion,
      weight: WEIGHTS.multiregion,
      metrics: {
        regions_ok: metrics.multiregion?.regions_ok ?? 0,
        regions_required: metrics.multiregion?.regions_required ?? 1
      },
      factors: {
        regions_ok: multiregionBits.ok,
        regions_required: multiregionBits.req
      },
      rawScore: services.multiregion ? multiregionBits.rawScore : 0,
      weightedScore: services.multiregion ? WEIGHTS.multiregion * multiregionBits.rawScore : 0
    }
  };

  const totalScore =
    breakdown.rpc.weightedScore +
    breakdown.indexer.weightedScore +
    breakdown.storage.weightedScore +
    breakdown.multiregion.weightedScore;

  return {
    operator: op.operator,
    services,
    metrics,
    breakdown,
    totalScore
  };
}

const epochPoolWei = dailyCapWei / epochsPerDay;
const scored = (input.operators || []).map(buildBreakdown);
const sumScore = scored.reduce((a, x) => a + x.totalScore, 0);

let allocatedWei = 0n;
const claims = scored
  .filter((x) => x.totalScore > 0)
  .map((x) => {
    const scaledScore = BigInt(Math.floor(x.totalScore * 1e9));
    const scaledSum = BigInt(Math.floor(sumScore * 1e9));
    const amountWei = scaledSum === 0n ? 0n : (epochPoolWei * scaledScore / scaledSum);
    allocatedWei += amountWei;

    return {
      operator: x.operator,
      amountWei: amountWei.toString(),
      sharePct: sumScore === 0 ? 0 : (x.totalScore / sumScore),
      totalScore: x.totalScore,
      services: x.services,
      metrics: x.metrics,
      breakdown: x.breakdown
    };
  });

const out = {
  epochId: input.epochId,
  dayId: input.dayId,
  scoringVersion: 'v0.2-breakdown',
  dailyCapWei: dailyCapWei.toString(),
  epochsPerDay: Number(epochsPerDay),
  epochPoolWei: epochPoolWei.toString(),
  allocatedWei: allocatedWei.toString(),
  roundingDustWei: (epochPoolWei - allocatedWei).toString(),
  weights: WEIGHTS,
  weightsSource,
  sumScore,
  claims
};

fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log('wrote', outFile);
