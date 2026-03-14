import fs from 'node:fs';
import { ethers } from 'ethers';

// Publish an epoch using ethers (no Hardhat).
// Required env:
// - RPC_URL
// - PRIVATE_KEY (owner)
// - DISTRIBUTOR_ADDRESS
// - EPOCH_JSON (path to epoch-out.json)

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DISTRIBUTOR_ADDRESS = process.env.DISTRIBUTOR_ADDRESS;
const EPOCH_JSON = process.env.EPOCH_JSON;

if (!RPC_URL || !PRIVATE_KEY || !DISTRIBUTOR_ADDRESS || !EPOCH_JSON) {
  throw new Error('Missing env: RPC_URL, PRIVATE_KEY, DISTRIBUTOR_ADDRESS, EPOCH_JSON');
}

const data = JSON.parse(fs.readFileSync(EPOCH_JSON, 'utf8'));

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
  'function publishEpoch(uint256 epochId,uint256 dayId,bytes32 merkleRoot,uint256 totalWei) external'
];

const dist = new ethers.Contract(DISTRIBUTOR_ADDRESS, abi, wallet);

const epochId = BigInt(data.epochId);
const dayId = BigInt(data.dayId);
const root = data.merkleRoot;
const totalWei = BigInt(data.totalWei);

const tx = await dist.publishEpoch(epochId, dayId, root, totalWei);
console.log('publish tx', tx.hash);
await tx.wait();
console.log('published', { epochId: epochId.toString(), dayId: dayId.toString(), root, totalWei: totalWei.toString() });
