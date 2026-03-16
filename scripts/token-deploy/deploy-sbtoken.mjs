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
  const contractName = 'SBtoken';
  const c = out.contracts?.[file]?.[contractName];
  if (!c) throw new Error('Compiled contract not found: ' + contractName);

  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  const RPC_URL = getEnv('RPC_URL', 'http://139.180.188.61:8545');
  const CHAIN_ID = Number(getEnv('CHAIN_ID', '18441'));

  const NAME = getEnv('TOKEN_NAME', 'SBtoken');
  const SYMBOL = getEnv('TOKEN_SYMBOL', 'SB01');
  const DECIMALS = Number(getEnv('TOKEN_DECIMALS', '18'));
  const SUPPLY_HUMAN = getEnv('TOKEN_SUPPLY', '100000');

  const pk = readPrivateKey();
  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'dcai-l3' });
  const wallet = new ethers.Wallet(pk, provider);

  const recipient = getEnv('RECIPIENT', wallet.address);
  const initialSupply = ethers.parseUnits(SUPPLY_HUMAN, DECIMALS);

  console.log('RPC_URL:', RPC_URL);
  console.log('CHAIN_ID:', CHAIN_ID);
  console.log('DEPLOYER:', wallet.address);
  console.log('RECIPIENT:', recipient);
  console.log('TOKEN:', `${NAME} (${SYMBOL}) decimals=${DECIMALS} supply=${SUPPLY_HUMAN}`);

  const bal = await provider.getBalance(wallet.address);
  console.log('DEPLOYER_BALANCE_WEI:', bal.toString());
  if (bal === 0n) throw new Error('Deployer has 0 balance; fund it via faucet first.');

  const contractPath = path.resolve(process.cwd(), '..', '..', 'contracts', 'SBtoken.sol');
  const { abi, bytecode } = compile(contractPath);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  // Some RPC nodes can fail eth_estimateGas for contract creation; allow manual overrides.
  const gasLimit = BigInt(getEnv('GAS_LIMIT', '5000000'));
  const maxFeePerGas = process.env.MAX_FEE_PER_GAS ? BigInt(process.env.MAX_FEE_PER_GAS) : undefined;
  const maxPriorityFeePerGas = process.env.MAX_PRIORITY_FEE_PER_GAS ? BigInt(process.env.MAX_PRIORITY_FEE_PER_GAS) : undefined;

  const overrides = {
    gasLimit,
    ...(maxFeePerGas != null ? { maxFeePerGas } : {}),
    ...(maxPriorityFeePerGas != null ? { maxPriorityFeePerGas } : {}),
  };

  const contract = await factory.deploy(NAME, SYMBOL, DECIMALS, recipient, initialSupply, overrides);
  console.log('DEPLOY_TX:', contract.deploymentTransaction()?.hash);

  const deployed = await contract.waitForDeployment();
  const addr = await deployed.getAddress();
  console.log('TOKEN_ADDRESS:', addr);

  const receipt = await contract.deploymentTransaction()?.wait();
  if (receipt) {
    console.log('DEPLOY_BLOCK:', receipt.blockNumber);
    console.log('DEPLOY_GAS_USED:', receipt.gasUsed?.toString?.() ?? String(receipt.gasUsed));
  }

  // Optional: do one tiny transfer to help Blockscout index token transfers/holders.
  const warmTo = process.env.WARM_TRANSFER_TO;
  if (warmTo && ethers.isAddress(warmTo)) {
    const warmAmountHuman = getEnv('WARM_TRANSFER_AMOUNT', '1');
    const warmAmount = ethers.parseUnits(warmAmountHuman, DECIMALS);
    console.log('WARM_TRANSFER_TO:', warmTo);
    console.log('WARM_TRANSFER_AMOUNT:', warmAmountHuman);
    const tx = await contract.transfer(warmTo, warmAmount);
    console.log('WARM_TRANSFER_TX:', tx.hash);
    await tx.wait();
  }
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
