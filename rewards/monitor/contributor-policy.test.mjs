import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getContributorPolicy,
  policyForOperator,
  validateContributorTier,
} from './contributor-policy.mjs';

test('maps public lanes to the deployed staking tiers', () => {
  assert.equal(validateContributorTier('observer', 'basic', 'basic').stakeEther, '1000');
  assert.equal(validateContributorTier('core', 'pro', 'pro').stakeEther, '5000');
  assert.equal(validateContributorTier('backbone', 'ultra', 'ultra').stakeEther, '10000');
});

test('rejects a forged public lane/internal tier combination', () => {
  assert.throws(() => validateContributorTier('backbone', 'basic', 'basic'), /must use the ultra/);
});

test('legacy operators remain Observer-compatible until explicitly classified', () => {
  const policy = policyForOperator({});
  assert.equal(policy.key, 'observer');
  assert.equal(policy.rewardFactor, 1);
});

test('higher lanes have stricter SLOs and bounded capacity factors', () => {
  const observer = getContributorPolicy('observer');
  const core = getContributorPolicy('core');
  const backbone = getContributorPolicy('backbone');
  assert.ok(observer.slo.uptimeFloor < core.slo.uptimeFloor);
  assert.ok(core.slo.uptimeFloor < backbone.slo.uptimeFloor);
  assert.ok(observer.slo.rpcP95Ms > core.slo.rpcP95Ms);
  assert.ok(core.slo.rpcP95Ms > backbone.slo.rpcP95Ms);
  assert.deepEqual([observer.rewardFactor, core.rewardFactor, backbone.rewardFactor], [1, 1.2, 1.5]);
});
