export const CONTRIBUTOR_POLICY_VERSION = 'v1';

// Contributor lanes deliberately trade a larger stake and stricter service
// target for more capacity credit. The factor is applied only after measured
// service quality, so a higher stake cannot turn an unhealthy endpoint into a
// reward-eligible one.
export const CONTRIBUTOR_TIERS = Object.freeze({
  observer: Object.freeze({
    label: 'Observer',
    internalTier: 'basic',
    stakeEther: '1000',
    rpcRatePerSecond: 10,
    rewardFactor: 1,
    regionRequired: false,
    function: 'Single-region RPC or indexer entry lane',
    slo: Object.freeze({
      uptimeFloor: 0.98,
      rpcP95Ms: 800,
      errorRateMax: 0.02,
      indexerLagBlocks: 12,
    }),
  }),
  core: Object.freeze({
    label: 'Core',
    internalTier: 'pro',
    stakeEther: '5000',
    rpcRatePerSecond: 50,
    rewardFactor: 1.2,
    regionRequired: true,
    function: 'Production RPC or indexer capacity with a declared region',
    slo: Object.freeze({
      uptimeFloor: 0.99,
      rpcP95Ms: 500,
      errorRateMax: 0.01,
      indexerLagBlocks: 6,
    }),
  }),
  backbone: Object.freeze({
    label: 'Backbone',
    internalTier: 'ultra',
    stakeEther: '10000',
    rpcRatePerSecond: 200,
    rewardFactor: 1.5,
    regionRequired: true,
    function: 'Critical high-capacity RPC or indexer lane with the strictest SLO',
    slo: Object.freeze({
      uptimeFloor: 0.999,
      rpcP95Ms: 250,
      errorRateMax: 0.001,
      indexerLagBlocks: 2,
    }),
  }),
});

export function getContributorPolicy(programTier, options = {}) {
  const key = String(programTier || '').trim().toLowerCase();
  const resolvedKey = key || (options.allowLegacyDefault ? 'observer' : '');
  const policy = CONTRIBUTOR_TIERS[resolvedKey];
  if (!policy) throw new Error('Program Tier must be observer, core, or backbone');
  return { key: resolvedKey, ...policy };
}

export function validateContributorTier(programTier, internalTier, requestTier) {
  const policy = getContributorPolicy(programTier);
  const internal = String(internalTier || '').trim().toLowerCase();
  const requested = String(requestTier || '').trim().toLowerCase();
  if (internal !== policy.internalTier || requested !== policy.internalTier) {
    throw new Error(`${policy.label} must use the ${policy.internalTier} staking tier`);
  }
  return policy;
}

export function policyForOperator(operator) {
  return getContributorPolicy(operator?.programTier || operator?.operatorTier, { allowLegacyDefault:true });
}
