async function main() {
  const { ethers } = require('hardhat');
  const to = process.env.DISTRIBUTOR_ADDRESS;
  if (!to) throw new Error('Missing DISTRIBUTOR_ADDRESS');

  const [signer] = await ethers.getSigners();
  const tx = await signer.sendTransaction({
    to,
    value: ethers.parseEther('10')
  });
  console.log('fund tx', tx.hash);
  await tx.wait();
  console.log('funded', to);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
