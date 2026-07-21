import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  normalizeFeaturedTokens,
  readFeaturedTokens,
  writeFeaturedTokens,
} from './featured-tokens.mjs';

const token = {
  address: '0xF7C968d5e0903aCc257D63913F886241fE292AAF',
  symbol: 'SB01',
  name: 'SBtoken',
};

test('normalizes defaults and preserves disabled tokens', () => {
  const [result] = normalizeFeaturedTokens([{ ...token, enabled: false }]);
  assert.deepEqual(result, { ...token, type: 'erc20', decimals: 18, note: '', enabled: false });
});

test('rejects invalid and duplicate addresses', () => {
  assert.throws(() => normalizeFeaturedTokens([{ ...token, address: '0x123' }]), /valid EVM address/);
  assert.throws(() => normalizeFeaturedTokens([token, { ...token, address: token.address.toLowerCase() }]), /duplicate/);
});

test('writes a public-readable document atomically and reads it back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcai-featured-'));
  const file = path.join(dir, 'featured-tokens.json');
  const now = new Date('2026-07-21T04:30:00.000Z');
  try {
    writeFeaturedTokens(file, { featured: [token] }, now);
    const result = readFeaturedTokens(file);
    assert.equal(result.updatedAt, now.toISOString());
    assert.equal(result.featured[0].symbol, 'SB01');
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o644);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
