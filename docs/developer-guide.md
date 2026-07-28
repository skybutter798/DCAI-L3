# Developer Onboarding (DCAI Testnet)

## 1) Network details

- Chain ID: **18441**
- Currency symbol: **tDCAI**
- Explorer: `https://explorer.dcai.ai/`
- Faucet:
  - Status: `https://explorer.dcai.ai/faucet/`
  - Request: `POST https://explorer.dcai.ai/faucet/request` with JSON `{ "address": "0x..." }`

## 2) RPC endpoints

RPC is API-key gated. Keys are issued per tier (`basic`, `pro`, `ultra`) — the
tier is part of the URL, so use the path that matches the key you were issued.

### Path-key form (works everywhere, incl. wallets like MetaMask / OKX)

HTTP:
- `https://explorer.dcai.ai/rpc/basic/<YOUR_KEY>/`
- `https://explorer.dcai.ai/rpc/pro/<YOUR_KEY>/`
- `https://explorer.dcai.ai/rpc/ultra/<YOUR_KEY>/`

WebSocket:
- `wss://explorer.dcai.ai/ws/basic/<YOUR_KEY>/` (likewise `pro` / `ultra`)

> **The trailing slash is required.** `…/rpc/basic/<KEY>` without it returns 401.

Per-key rate limits: basic 10 r/s, pro 50 r/s, ultra 200 r/s.

> Note: the un-prefixed form `https://explorer.dcai.ai/rpc/<KEY>/` is reserved for
> internal foundation keys and will return 401 for issued tier keys.

### Header form (foundation/internal keys only)

HTTP `https://explorer.dcai.ai/rpc/` with header `X-API-Key: <KEY>`.
Issued tier keys are **not** accepted here — use the path-key form above.

> Keep the key private. For production, issue per-partner keys and rotate regularly.

## 3) MetaMask setup

1. Open MetaMask → Settings → Networks → Add network
2. Fill:
   - Network name: `DCAI Testnet`
   - RPC URL: `https://explorer.dcai.ai/rpc/basic/<YOUR_KEY>/`
   - Chain ID: `18441`
   - Currency symbol: `tDCAI`
   - Block explorer URL: `https://explorer.dcai.ai/`

## 4) Get tDCAI (Faucet)

Example:

```bash
curl -s https://explorer.dcai.ai/faucet/ | jq

curl -s -X POST https://explorer.dcai.ai/faucet/request \
  -H 'Content-Type: application/json' \
  --data '{"address":"0xYOUR_ADDRESS"}'
```

## 5) Quick RPC tests

### chainId

```bash
curl -s https://explorer.dcai.ai/rpc/basic/<YOUR_KEY>/ \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### latest block

```bash
curl -s https://explorer.dcai.ai/rpc/basic/<YOUR_KEY>/ \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## 6) Ethers.js example

```js
import { ethers } from "ethers";

const RPC = "https://explorer.dcai.ai/rpc/basic/<YOUR_KEY>/";
const provider = new ethers.JsonRpcProvider(RPC, 18441);

console.log("chainId", (await provider.getNetwork()).chainId);
console.log("block", await provider.getBlockNumber());
```
