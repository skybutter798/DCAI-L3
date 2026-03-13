import express from 'express';
import { ethers } from 'ethers';

const {
  FAUCET_PRIVATE_KEY,
  RPC_URL,
  CHAIN_ID,
  SEND_AMOUNT_WEI,
  COOLDOWN_SECONDS,
} = process.env;

if (!FAUCET_PRIVATE_KEY || !RPC_URL || !CHAIN_ID) {
  throw new Error('Missing env: FAUCET_PRIVATE_KEY, RPC_URL, CHAIN_ID');
}

const chainId = Number(CHAIN_ID);
const amountWei = BigInt(SEND_AMOUNT_WEI ?? '1000000000000000000');
const cooldownMs = Number(COOLDOWN_SECONDS ?? '3600') * 1000;

const provider = new ethers.JsonRpcProvider(RPC_URL, chainId);
const wallet = new ethers.Wallet(FAUCET_PRIVATE_KEY, provider);

const app = express();
app.use(express.json({ limit: '32kb' }));

const lastByIp = new Map();
const lastByAddr = new Map();

function canRequest(map, key) {
  const now = Date.now();
  const last = map.get(key) ?? 0;
  if (now - last < cooldownMs) return { ok: false, waitMs: cooldownMs - (now - last) };
  map.set(key, now);
  return { ok: true, waitMs: 0 };
}

app.get('/', async (_req, res) => {
  const bal = await provider.getBalance(wallet.address);
  res.json({
    chainId,
    rpc: RPC_URL,
    faucetAddress: wallet.address,
    faucetBalanceWei: bal.toString(),
    sendAmountWei: amountWei.toString(),
    cooldownSeconds: Number(COOLDOWN_SECONDS ?? '3600'),
  });
});

app.post('/request', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()) || req.socket.remoteAddress || 'unknown';
    const { address } = req.body || {};
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid address' });
    }

    const ipCheck = canRequest(lastByIp, ip);
    if (!ipCheck.ok) return res.status(429).json({ error: 'IP cooldown', waitSeconds: Math.ceil(ipCheck.waitMs / 1000) });

    const addr = ethers.getAddress(address);
    const addrCheck = canRequest(lastByAddr, addr);
    if (!addrCheck.ok) return res.status(429).json({ error: 'Address cooldown', waitSeconds: Math.ceil(addrCheck.waitMs / 1000) });

    const fee = await provider.getFeeData();
    const maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei');
    const maxFeePerGas = fee.maxFeePerGas ?? ethers.parseUnits('2', 'gwei');

    const tx = await wallet.sendTransaction({
      to: addr,
      value: amountWei,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    return res.json({ ok: true, txHash: tx.hash });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => console.log('Faucet listening on :' + port + ' addr=' + wallet.address));
