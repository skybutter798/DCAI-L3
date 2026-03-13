import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';

// Usage:
// node build-epoch.mjs --in claims.json --out out.json
//
// Input format (claims.json):
// {
//   "epochId": 2026031311,
//   "dayId": 20260313,
//   "claims": [
//     {"operator":"0x...","amountWei":"1000000000000000000"},
//     ...
//   ]
// }

function arg(name, def = undefined) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  return process.argv[idx + 1];
}

const inFile = arg('--in');
const outFile = arg('--out', 'epoch-out.json');
if (!inFile) {
  console.error('Missing --in claims.json');
  process.exit(2);
}

const input = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const epochId = BigInt(input.epochId);
const dayId = BigInt(input.dayId ?? 0);
const claims = input.claims ?? [];

function leaf(epochId, operator, amountWei) {
  return ethers.keccak256(
    ethers.solidityPacked(['uint256', 'address', 'uint256'], [epochId, operator, BigInt(amountWei)])
  );
}

function sortPair(a, b) {
  return a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
}

function hashPair(a, b) {
  const [x, y] = sortPair(a, b);
  return ethers.keccak256(ethers.concat([x, y]));
}

// Build leaves
const leaves = claims.map((c) => {
  const operator = ethers.getAddress(c.operator);
  const amountWei = BigInt(c.amountWei);
  return {
    operator,
    amountWei: amountWei.toString(),
    leaf: leaf(epochId, operator, amountWei)
  };
});

if (leaves.length === 0) {
  console.error('No claims');
  process.exit(2);
}

// Build tree levels (array of arrays of hex32)
let level = leaves.map((x) => x.leaf);
const levels = [level];
while (level.length > 1) {
  const next = [];
  for (let i = 0; i < level.length; i += 2) {
    const left = level[i];
    const right = level[i + 1] ?? level[i]; // duplicate last if odd
    next.push(hashPair(left, right));
  }
  level = next;
  levels.push(level);
}

const root = levels[levels.length - 1][0];

function getProof(leafHex) {
  let proof = [];
  let idx = levels[0].indexOf(leafHex);
  if (idx === -1) throw new Error('leaf not found');

  for (let d = 0; d < levels.length - 1; d++) {
    const cur = levels[d];
    const isRight = (idx % 2) === 1;
    const pairIdx = isRight ? idx - 1 : idx + 1;
    const sibling = cur[pairIdx] ?? cur[idx];
    proof.push(sibling);
    idx = Math.floor(idx / 2);
  }
  return proof;
}

const out = {
  epochId: epochId.toString(),
  dayId: dayId.toString(),
  merkleRoot: root,
  totalWei: leaves.reduce((acc, x) => acc + BigInt(x.amountWei), 0n).toString(),
  claims: leaves.map((x) => ({
    operator: x.operator,
    amountWei: x.amountWei,
    leaf: x.leaf,
    proof: getProof(x.leaf)
  }))
};

fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log('wrote', outFile);
console.log('root', root);
