import fs from 'node:fs';
import { ethers } from 'hardhat';

async function main() {
  const distributorAddress = process.env.DISTRIBUTOR_ADDRESS;
  if (!distributorAddress) throw new Error('Missing DISTRIBUTOR_ADDRESS');

  const epochJson = process.env.EPOCH_JSON || '../scripts/epoch-out.json';
  const data = JSON.parse(fs.readFileSync(epochJson, 'utf8'));

  const [signer] = await ethers.getSigners();
  const operator = await signer.getAddress();

  const claim = (data.claims || []).find((c) => c.operator.toLowerCase() === operator.toLowerCase());
  if (!claim) throw new Error('No claim for operator ' + operator);

  const epochId = BigInt(data.epochId);
  const amountWei = BigInt(claim.amountWei);
  const proof = claim.proof;

  const dist = await ethers.getContractAt('MerkleRewardDistributor', distributorAddress);
  const tx = await dist.claim(epochId, operator, amountWei, proof);
  console.log('claim tx', tx.hash);
  await tx.wait();
  console.log('claimed', { epochId: epochId.toString(), operator, amountWei: amountWei.toString() });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
