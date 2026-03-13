import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('deployer', deployer.address);
  const Registry = await ethers.getContractFactory('OperatorRegistry');
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  console.log('OperatorRegistry', await registry.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
