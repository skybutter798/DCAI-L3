import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { ethers } from 'ethers';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const contractPath = path.join(ROOT, 'contracts', 'SurveyPassNFT.sol');
const contractSource = fs.readFileSync(contractPath, 'utf8');

const RPC_URL = process.env.RPC_URL || 'http://139.180.188.61:8545';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const TREASURY = process.env.TREASURY || '0xae201c3daacd53e4cb305fa91678b16cc7eae43a';
const BASE_URI = process.env.BASE_URI || 'https://ask.skybutter.com/nft/meta.php?tokenId=';
const OUT_PATH = path.join(ROOT, 'deploy', 'deployment.json');

if (!PRIVATE_KEY) {
  throw new Error('DEPLOYER_PRIVATE_KEY is required');
}

function findImport(importPath) {
  const candidates = [
    path.join(ROOT, 'deploy', 'node_modules', importPath),
    path.join(ROOT, importPath),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return { contents: fs.readFileSync(filePath, 'utf8') };
    }
  }
  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: 'Solidity',
  sources: {
    'SurveyPassNFT.sol': { content: contractSource },
  },
  settings: {
    evmVersion: 'paris',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
if (output.errors?.length) {
  const fatal = output.errors.filter((e) => e.severity === 'error');
  if (fatal.length) {
    console.error(output.errors);
    process.exit(1);
  }
}

const artifact = output.contracts['SurveyPassNFT.sol']['SurveyPassNFT'];
const abi = artifact.abi;
const bytecode = '0x' + artifact.evm.bytecode.object;

const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: 18441,
  name: 'dcai-l3'
});
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
console.log('Deployer:', wallet.address);
console.log('Treasury:', TREASURY);
console.log('Base URI:', BASE_URI);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy(TREASURY, BASE_URI);
console.log('Deploy tx:', contract.deploymentTransaction().hash);
await contract.waitForDeployment();
const address = await contract.getAddress();
console.log('Contract deployed at:', address);

const data = {
  network: 'DCAI L3',
  chainId: 18441,
  rpcUrl: RPC_URL,
  deployer: wallet.address,
  treasury: TREASURY,
  baseUri: BASE_URI,
  contractAddress: address,
  deployTxHash: contract.deploymentTransaction().hash,
  deployedAt: new Date().toISOString(),
  abi,
};
fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 2));
console.log('Wrote', OUT_PATH);
