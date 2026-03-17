async function main() {
  const { ethers } = require('hardhat');
  const registryAddress = process.env.REGISTRY_ADDRESS;
  const operator = process.env.OPERATOR_ADDRESS;
  if (!registryAddress || !operator) throw new Error('Missing REGISTRY_ADDRESS or OPERATOR_ADDRESS');

  const registry = await ethers.getContractAt('OperatorRegistry', registryAddress);
  const tx = await registry.setOperatorStatus(operator, 1); // 1 = ACTIVE
  console.log('whitelist tx', tx.hash);
  await tx.wait();
  console.log('whitelisted', operator);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
