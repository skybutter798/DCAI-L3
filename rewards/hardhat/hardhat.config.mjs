import '@nomicfoundation/hardhat-ethers';

const { RPC_URL, PRIVATE_KEY } = process.env;

export default {
  solidity: '0.8.20',
  networks: {
    dcai: {
      url: RPC_URL || 'https://explorer.dcai.ai/rpc/<YOUR_KEY>/',
      chainId: 18441,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
