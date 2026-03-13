import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  const registryAddress = process.env.REGISTRY_ADDRESS;
  if (!registryAddress) throw new Error('Missing REGISTRY_ADDRESS');

  const dailyCapWei = ethers.parseEther('300');

  const Dist = await ethers.getContractFactory('MerkleRewardDistributor');
  const dist = await Dist.deploy(deployer.address, registryAddress, dailyCapWei);
  await dist.waitForDeployment();

  console.log('MerkleRewardDistributor', await dist.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
