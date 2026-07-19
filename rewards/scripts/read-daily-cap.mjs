import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL;
const DISTRIBUTOR_ADDRESS = process.env.DISTRIBUTOR_ADDRESS;
const EXPECTED_CHAIN_ID = BigInt(process.env.CHAIN_ID || '18441');

if (!RPC_URL || !DISTRIBUTOR_ADDRESS) {
  throw new Error('Missing env: RPC_URL or DISTRIBUTOR_ADDRESS');
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const network = await provider.getNetwork();
if (network.chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`Unexpected chainId ${network.chainId}; expected ${EXPECTED_CHAIN_ID}`);
}

const distributor = new ethers.Contract(
  DISTRIBUTOR_ADDRESS,
  ['function dailyCapWei() view returns (uint256)'],
  provider,
);
const dailyCapWei = BigInt(await distributor.dailyCapWei());
if (dailyCapWei <= 0n) throw new Error('On-chain Daily Cap must be greater than zero');

process.stdout.write(dailyCapWei.toString());
