import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { ethers } from 'ethers';

function getEnv(name, fallback) {
  const v = process.env[name];
  return v == null || v === '' ? fallback : v;
}

function readPrivateKey() {
  const pkFile = process.env.DEPLOYER_PK_FILE;
  if (pkFile) return fs.readFileSync(pkFile, 'utf8').trim();
  const pk = process.env.DEPLOYER_PK;
  if (pk) return pk.trim();
  throw new Error('Missing DEPLOYER_PK_FILE or DEPLOYER_PK');
}

function compile(contractPath) {
  const source = fs.readFileSync(contractPath, 'utf8');
  const input = {
    language: 'Solidity',
    sources: {
      [path.basename(contractPath)]: { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: getEnv('EVM_VERSION', 'london'),
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors?.length) {
    const fatal = out.errors.filter((e) => e.severity === 'error');
    if (fatal.length) {
      throw new Error('Solc errors:\n' + fatal.map((e) => e.formattedMessage || e.message).join('\n'));
    }
  }

  const file = path.basename(contractPath);
  const contractName = 'ApiKeyStake';
  const c = out.contracts?.[file]?.[contractName];
  if (!c) throw new Error('Compiled contract not found: ' + contractName);

  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  const RPC_URL = getEnv('RPC_URL', 'http://139.180.188.61:8545');
  const CHAIN_ID = Number(getEnv('CHAIN_ID', '18441'));

  const BASIC = getEnv('BASIC_STAKE', '1000');
  const PRO = getEnv('PRO_STAKE', '5000');
  const ULTRA = getEnv('ULTRA_STAKE', '10000');
  const COOLDOWN = Number(getEnv('COOLDOWN_SECONDS', String(24 * 3600)));

  const pk = readPrivateKey();
  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'dcai-l3' });
  const wallet = new ethers.Wallet(pk, provider);

  const basicWei = ethers.parseUnits(BASIC, 18);
  const proWei = ethers.parseUnits(PRO, 18);
  const ultraWei = ethers.parseUnits(ULTRA, 18);

  console.log('RPC_URL:', RPC_URL);
  console.log('CHAIN_ID:', CHAIN_ID);
  console.log('DEPLOYER:', wallet.address);
  console.log('TIERS:', { basic: BASIC, pro: PRO, ultra: ULTRA, cooldownSeconds: COOLDOWN });

  const bal = await provider.getBalance(wallet.address);
  console.log('DEPLOYER_BALANCE_WEI:', bal.toString());
  if (bal === 0n) throw new Error('Deployer has 0 balance; fund it via faucet first.');

  const contractPath = path.resolve(process.cwd(), '..', '..', 'contracts', 'ApiKeyStake.sol');
  const { abi, bytecode } = compile(contractPath);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const gasLimit = BigInt(getEnv('GAS_LIMIT', '2000000'));

  const contract = await factory.deploy(basicWei, proWei, ultraWei, COOLDOWN, { gasLimit });
  console.log('DEPLOY_TX:', contract.deploymentTransaction()?.hash);

  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log('STAKE_CONTRACT:', addr);

  const receipt = await contract.deploymentTransaction()?.wait();
  if (receipt) {
    console.log('DEPLOY_BLOCK:', receipt.blockNumber);
    console.log('DEPLOY_GAS_USED:', receipt.gasUsed?.toString?.() ?? String(receipt.gasUsed));
  }
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
