# Developer Onboarding (DCAI Testnet)

## 1) Network details

- Chain ID: **18441**
- Currency symbol: **tDCAI**
- Explorer: `http://139.180.140.143/`
- Faucet:
  - Status: `http://139.180.140.143/faucet/`
  - Request: `POST http://139.180.140.143/faucet/request` with JSON `{ "address": "0x..." }`

## 2) RPC endpoints

RPC is API-key gated.

### Option A (recommended for server/backend): header-based API key

HTTP:
- `http://139.180.140.143/rpc/`

Add header:
- `X-API-Key: <YOUR_KEY>`

### Option B (recommended for wallets like MetaMask): API key embedded in URL path

Some wallets cannot set custom headers. Use the path-key form:

HTTP:
- `http://139.180.140.143/rpc/<YOUR_KEY>/`

WebSocket:
- `ws://139.180.140.143/ws/<YOUR_KEY>/`

> Keep the key private. For production, issue per-partner keys and rotate regularly.

## 3) MetaMask setup

1. Open MetaMask → Settings → Networks → Add network
2. Fill:
   - Network name: `DCAI Testnet`
   - RPC URL: `http://139.180.140.143/rpc/<YOUR_KEY>/`
   - Chain ID: `18441`
   - Currency symbol: `tDCAI`
   - Block explorer URL: `http://139.180.140.143/`

## 4) Get tDCAI (Faucet)

Example:

```bash
curl -s http://139.180.140.143/faucet/ | jq

curl -s -X POST http://139.180.140.143/faucet/request \
  -H 'Content-Type: application/json' \
  --data '{"address":"0xYOUR_ADDRESS"}'
```

## 5) Quick RPC tests

### chainId

```bash
curl -s http://139.180.140.143/rpc/<YOUR_KEY>/ \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### latest block

```bash
curl -s http://139.180.140.143/rpc/<YOUR_KEY>/ \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## 6) Ethers.js example

```js
import { ethers } from "ethers";

const RPC = "http://139.180.140.143/rpc/<YOUR_KEY>/";
const provider = new ethers.JsonRpcProvider(RPC, 18441);

console.log("chainId", (await provider.getNetwork()).chainId);
console.log("block", await provider.getBlockNumber());
```
