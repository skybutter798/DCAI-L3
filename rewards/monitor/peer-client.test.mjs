import assert from 'node:assert/strict';
import test from 'node:test';
import { parseContributorEnode, validateEnodeMatchesEndpoint } from './peer-client.mjs';

const nodeId = 'a'.repeat(128);

test('parses a public contributor enode', () => {
  const parsed = parseContributorEnode(`enode://${nodeId}@8.8.8.8:30303`);
  assert.equal(parsed.nodeId, nodeId);
  assert.equal(parsed.port, 30303);
});

test('rejects private enode addresses', () => {
  assert.throws(() => parseContributorEnode(`enode://${nodeId}@127.0.0.1:30303`), /public IPv4/);
});

test('requires endpoint and enode to resolve to the same server', () => {
  assert.throws(
    () => validateEnodeMatchesEndpoint(`enode://${nodeId}@8.8.8.8:30303`, ['1.1.1.1']),
    /must match/,
  );
});
