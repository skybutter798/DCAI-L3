import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContributorConfig,
  contributorSpecFromRequest,
  normalizeContributorEndpoint,
  renderOperatorRoutes,
  resolvePublicEndpoint,
} from './operator-onboarding.mjs';

const request = {
  id: 'req-1',
  address: '0x1111111111111111111111111111111111111111',
  tier: 'basic',
  source: 'contributor',
  note: [
    'Contributor Program Application',
    'Role: rpc-provider',
    'Program Tier: observer',
    'Internal Tier: basic',
    'Region: SG',
    'Endpoint: http://8.8.8.8:8545/',
    `Enode: enode://${'a'.repeat(128)}@8.8.8.8:30303`,
    'Note: test',
  ].join('\n'),
};

test('parses Contributor Program application fields', () => {
  const spec = contributorSpecFromRequest(request);
  assert.equal(spec.service, 'rpc');
  assert.equal(spec.region, 'SG');
  assert.equal(spec.operator, request.address);
  assert.equal(spec.policy.rewardFactor, 1);
  assert.equal(spec.nodeId, 'a'.repeat(128));
});

test('rejects a forged Backbone label on a Basic stake request', () => {
  const forged = { ...request, note:request.note.replace('Program Tier: observer', 'Program Tier: backbone') };
  assert.throws(() => contributorSpecFromRequest(forged), /must use the ultra/);
});

test('requires a declared region for Core and Backbone', () => {
  const core = {
    ...request,
    tier:'pro',
    note:request.note
      .replace('Program Tier: observer', 'Program Tier: core')
      .replace('Internal Tier: basic', 'Internal Tier: pro')
      .replace('Region: SG', 'Region: -'),
  };
  assert.throws(() => contributorSpecFromRequest(core), /must declare a region/);
});

test('normalizes an indexer health URL to its Blockscout base', () => {
  assert.equal(
    normalizeContributorEndpoint('https://example.com/api/v2/health', 'indexer'),
    'https://example.com/',
  );
});

test('rejects loopback endpoints before an approval can create an nginx route', async () => {
  await assert.rejects(
    () => resolvePublicEndpoint('http://127.0.0.1:8545/'),
    /private or reserved/,
  );
});

test('builds one idempotent operator record and a restricted nginx route', () => {
  const initial = { weights:{ rpc:40, indexer:20, storage:30, multiregion:10 }, operators:[] };
  const first = buildContributorConfig(initial, request, { selectedAddress:'8.8.8.8', addresses:['8.8.8.8'] }, {
    routeKey:'a'.repeat(32),
    routeBase:'http://139.180.140.143',
    approvedAt:'2026-01-01T00:00:00Z',
    p2pVerification:{
      enode:`enode://${'a'.repeat(128)}@8.8.8.8:30303`, nodeId:'a'.repeat(128), address:'8.8.8.8', port:30303,
      connectedAgents:1, verifiedAt:'2026-01-01T00:00:00Z', agents:[{ agentUrl:'http://agent', connected:true }],
    },
  });
  assert.equal(first.config.operators.length, 1);
  assert.equal(first.operator.services.rpc, true);
  assert.equal(first.operator.programTier, 'observer');
  assert.equal(first.operator.rewardPolicy.rewardFactor, 1);
  assert.equal(first.operator.contributionPolicyVersion, 'v2');
  assert.match(first.routeUrl, /\/op\/1111111111111111111111111111111111111111\/rpc\/a{32}\/$/);
  const rendered = renderOperatorRoutes(first.config);
  assert.match(rendered, /proxy_pass http:\/\/8\.8\.8\.8:8545\//);
  assert.match(rendered, /limit_except POST/);

  const second = buildContributorConfig(first.config, request, { selectedAddress:'1.1.1.1', addresses:['1.1.1.1', '8.8.8.8'] }, {
    routeKey:'b'.repeat(32),
    routeBase:'http://139.180.140.143',
    approvedAt:'2026-01-02T00:00:00Z',
    p2pVerification:{
      enode:`enode://${'a'.repeat(128)}@8.8.8.8:30303`, nodeId:'a'.repeat(128), address:'8.8.8.8', port:30303,
      connectedAgents:1, verifiedAt:'2026-01-02T00:00:00Z', agents:[{ agentUrl:'http://agent', connected:true }],
    },
  });
  assert.equal(second.config.operators.length, 1);
  assert.doesNotMatch(renderOperatorRoutes(second.config), /a{32}/);
  assert.match(renderOperatorRoutes(second.config), /proxy_pass http:\/\/8\.8\.8\.8:8545\//);
  assert.doesNotMatch(renderOperatorRoutes(second.config), /proxy_pass http:\/\/1\.1\.1\.1:8545\//);
});
