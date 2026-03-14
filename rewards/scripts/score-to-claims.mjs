import fs from 'node:fs';

// score-to-claims.mjs
// Converts a measurement snapshot into claims.json
//
// Usage:
//   node score-to-claims.mjs --in measurements.json --out claims.json --dailyCapWei <wei> --epochsPerDay 12
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

if (!inFile) {
  console.error('Missing --in measurements.json');
  process.exit(2);
}
if (dailyCapWei <= 0n) {
  console.error('Missing/invalid --dailyCapWei');
  process.exit(2);
}

const input = JSON.parse(fs.readFileSync(inFile, 'utf8'));

const WEIGHTS = { rpc: 40, indexer: 20, storage: 30, multiregion: 10 };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function scoreRpc(m) {
  const uptime = m?.uptime ?? 0;
  const p95 = m?.p95_ms ?? 1e9;
  const err = m?.error_rate ?? 1;
  const A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1);
  const L = clamp((800 - p95) / 800, 0, 1);
  const E = clamp((0.02 - err) / 0.02, 0, 1);
  return A * (0.6 * L + 0.4 * E);
}

function scoreIndexer(m) {
  const uptime = m?.uptime ?? 0;
  const lag = m?.lag_blocks ?? 1e9;
  const A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1);
  const G = clamp((12 - lag) / 12, 0, 1);
  return A * G;
}

function scoreStorage(m) {
  const uptime = m?.uptime ?? 0;
  const io = m?.io_p95_ms ?? 1e9;
  const err = m?.error_rate ?? 1;
  const A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1);
  const I = clamp((50 - io) / 50, 0, 1);
  const E = clamp((0.02 - err) / 0.02, 0, 1);
  return A * (0.6 * I + 0.4 * E);
}

function scoreMultiregion(m) {
  const ok = m?.regions_ok ?? 0;
  const req = m?.regions_required ?? 1;
  return clamp(ok / req, 0, 1);
}

function totalScore(op) {
  const s = op.services || {};
  const m = op.metrics || {};
  return (
    (s.rpc ? WEIGHTS.rpc * scoreRpc(m.rpc) : 0) +
    (s.indexer ? WEIGHTS.indexer * scoreIndexer(m.indexer) : 0) +
    (s.storage ? WEIGHTS.storage * scoreStorage(m.storage) : 0) +
    (s.multiregion ? WEIGHTS.multiregion * scoreMultiregion(m.multiregion) : 0)
  );
}

const epochPoolWei = dailyCapWei / epochsPerDay;

const scored = (input.operators || []).map((op) => ({
  operator: op.operator,
  score: totalScore(op)
}));

const sum = scored.reduce((a, x) => a + x.score, 0);

const claims = scored
  .filter((x) => x.score > 0)
  .map((x) => {
    const amountWei = sum === 0 ? 0n : (epochPoolWei * BigInt(Math.floor(x.score * 1e9)) / BigInt(Math.floor(sum * 1e9)));
    return { operator: x.operator, amountWei: amountWei.toString() };
  });

const out = {
  epochId: input.epochId,
  dayId: input.dayId,
  claims
};

fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log('wrote', outFile);
