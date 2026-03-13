import fs from 'node:fs';
import { ethers } from 'hardhat';

async function main() {
  const distributorAddress = process.env.DISTRIBUTOR_ADDRESS;
  if (!distributorAddress) throw new Error('Missing DISTRIBUTOR_ADDRESS');

  const epochJson = process.env.EPOCH_JSON || '../scripts/epoch-out.json';
  const data = JSON.parse(fs.readFileSync(epochJson, 'utf8'));

  const epochId = BigInt(data.epochId);
  const dayId = BigInt(data.dayId);
  const root = data.merkleRoot;
  const totalWei = BigInt(data.totalWei);

  const dist = await ethers.getContractAt('MerkleRewardDistributor', distributorAddress);
  const tx = await dist.publishEpoch(epochId, dayId, root, totalWei);
  console.log('publish tx', tx.hash);
  await tx.wait();
  console.log('published', { epochId: epochId.toString(), dayId: dayId.toString(), root, totalWei: totalWei.toString() });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
