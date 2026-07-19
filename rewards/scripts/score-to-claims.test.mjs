import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function runScore(operators) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcai-score-'));
  const input = path.join(dir, 'measurements.json');
  const output = path.join(dir, 'claims.json');
  try {
    fs.writeFileSync(input, JSON.stringify({ epochId:1, dayId:1, operators }));
    execFileSync(process.execPath, [
      path.join(here, 'score-to-claims.mjs'),
      '--in', input,
      '--out', output,
      '--dailyCapWei', '120000000000000000000',
      '--epochsPerDay', '1',
    ], { stdio:'pipe' });
    return JSON.parse(fs.readFileSync(output, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
}

const rpc = (operator, programTier, metrics = { uptime:1, p95_ms:0, error_rate:0 }) => ({
  operator,
  programTier,
  services:{ rpc:true },
  metrics:{ rpc:metrics },
});

test('capacity factors apply after identical perfect legacy measurements', () => {
  const out = runScore([
    rpc('0x1111111111111111111111111111111111111111', 'observer'),
    rpc('0x2222222222222222222222222222222222222222', 'backbone'),
  ]);
  assert.equal(out.scoringVersion, 'v0.4-real-contribution');
  assert.deepEqual(out.claims.map((row) => row.totalScore), [40, 60]);
  assert.deepEqual(out.claims.map((row) => row.amountWei), [
    '48000000000000000000',
    '72000000000000000000',
  ]);
});

test('verified P2P and real canary traffic increase a v2 RPC work factor', () => {
  const base = rpc('0x1111111111111111111111111111111111111111', 'observer');
  base.contributionPolicyVersion = 'v2';
  base.metrics.traffic = { requests:0, success_rate:0, p95_ms:null };
  base.metrics.p2p = { connectedAgents:1 };
  const active = structuredClone(base);
  active.operator = '0x2222222222222222222222222222222222222222';
  active.metrics.traffic = { requests:25, success_rate:1, p95_ms:25 };
  active.metrics.p2p = { connectedAgents:2 };
  const out = runScore([base, active]);
  assert.ok(out.claims[1].contribution.rpcWorkFactor > out.claims[0].contribution.rpcWorkFactor);
  assert.ok(out.claims[1].totalScore > out.claims[0].totalScore);
});

test('strict Backbone SLO can score below a healthy Observer', () => {
  const out = runScore([
    rpc('0x1111111111111111111111111111111111111111', 'observer', { uptime:1, p95_ms:400, error_rate:0.0005 }),
    rpc('0x2222222222222222222222222222222222222222', 'backbone', { uptime:1, p95_ms:400, error_rate:0.0005 }),
  ]);
  assert.ok(out.claims[0].totalScore > out.claims[1].totalScore);
});
