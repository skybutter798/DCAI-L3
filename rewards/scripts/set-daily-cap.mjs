import { ethers } from 'ethers';

// Set dailyCapWei using ethers (no Hardhat).
// Required env:
// - RPC_URL
// - PRIVATE_KEY (owner)
// - DISTRIBUTOR_ADDRESS
// - NEW_DAILY_CAP_WEI

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DISTRIBUTOR_ADDRESS = process.env.DISTRIBUTOR_ADDRESS;
const NEW_DAILY_CAP_WEI = process.env.NEW_DAILY_CAP_WEI;

if (!RPC_URL || !PRIVATE_KEY || !DISTRIBUTOR_ADDRESS || !NEW_DAILY_CAP_WEI) {
  throw new Error('Missing env: RPC_URL, PRIVATE_KEY, DISTRIBUTOR_ADDRESS, NEW_DAILY_CAP_WEI');
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
  'function setDailyCap(uint256 newCapWei) external',
  'function dailyCapWei() view returns (uint256)'
];

const dist = new ethers.Contract(DISTRIBUTOR_ADDRESS, abi, wallet);

const before = await dist.dailyCapWei();
const tx = await dist.setDailyCap(BigInt(NEW_DAILY_CAP_WEI));
console.log('setDailyCap tx', tx.hash);
await tx.wait();
const after = await dist.dailyCapWei();
console.log('dailyCapWei', before.toString(), '->', after.toString());
