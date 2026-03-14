# Runbook (DCAI Testnet)

## Common checks

### Chain height (via RPC)

```bash
curl -s http://139.180.140.143/rpc/ \
  -H "X-API-Key: <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Signers: check block production

On a signer host:

```bash
docker logs --tail 50 dcai-signer
```

### RPC nodes

On rpc-1 / rpc-2:

```bash
curl -s http://127.0.0.1:8545 \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

## Components

### Unified entry (nginx)

Config: `infra/nginx/dcai-testnet.conf` (installed at `/etc/nginx/sites-available/dcai-testnet`).

Routes:
- `/` → Explorer frontend
- `/faucet/` → Faucet
- `/rewards/` → Rewards static page + `latest.json`
- `/rpc/` + `/ws/` → RPC with upstream failover
- `/rpc1/` `/rpc2/` `/ws1/` `/ws2/` → direct debug

### Blockscout

Located on infra-1: `/opt/blockscout`.

Useful commands:

```bash
cd /opt/blockscout
# status
sudo docker compose ps
# logs
sudo docker compose logs --tail 200 blockscout
# migrations (if DB is empty)
sudo docker compose run --rm blockscout bin/blockscout eval "Explorer.ReleaseTasks.create_and_migrate()"
```

### Faucet

Located on infra-1: `/opt/faucet`.

```bash
cd /opt/faucet
sudo docker compose ps
sudo docker compose logs --tail 200 faucet
```

## Address map (chainId 18441)

### Treasury
- Treasury (fee sink): `0xAe201C3DAaCd53e4cB305fa91678B16CC7eAE43a`

### Core rewards contracts
- OperatorRegistry: `0xb37c81eBC4b1B4bdD5476fe182D6C72133F41db9`
- MerkleRewardDistributor: `0x728f2C63b9A0ff0918F5ffB3D4C2d004107476B7`

### Testnet faucet
- Faucet wallet: `0xefD5198c51c4cBA11283156d31D4dB6c0200A0A9`

### Signers
- signer-1: `0xD3A120011D0cD915E6df918B2c607B6d0B7522Fb`
- signer-2: `0x80189D1f1a2b15c1bb1cb1b20d68c777823a8079`
- signer-3: `0xEB9B32A62DFB67bf0b37A07682DD9DF07859D241`

### Roles (conceptual)
- **Owner/Admin**: can publish epochs, set caps, whitelist operators (should be a multisig in production)
- **Operator**: runs infra (RPC/indexer/storage) and calls `claim()` to receive rewards

> ⚠️ Security note: for production, do NOT reuse the same address for Owner and Operator.

## Rewards ops

### Publisher cron (project-side)
On infra-1:
- Publisher directory: `/opt/dcai/rewards/`
- Cron: runs every 10 minutes
- Entry script: `/opt/dcai/rewards/publish-epoch.sh`
- Input template: `/opt/dcai/rewards/inbox/claims.json`
- Output/merkle file: `/opt/dcai/rewards/out/epoch-out.json`
- Public proof mirror: `/var/www/html/rewards/latest.json` (served at `http://<infra>/rewards/latest.json`)

### Operator auto-claim cron (operator-side)
On contributor box (example):
- `/opt/dcai/operator-claim/auto-claim.mjs`
- Cron: every 5 minutes
- Writes: `/opt/dcai/operator-claim/claim.log`

### Common failure modes
- `EPOCH_EXISTS`: epochId reused → stamp a new epochId/dayId or update claims input
- claims fail: Distributor contract has insufficient native token balance

## Fee sweep to Treasury

Each signer runs `/usr/local/bin/dcai-sweep.sh` every 5 minutes via cron.

- Keeps a small reserve on the signer address
- Sweeps remaining funds to Treasury

If you need to disable temporarily:

```bash
crontab -l | grep -v dcai-sweep.sh | crontab -
```
