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

## Fee sweep to Treasury

Each signer runs `/usr/local/bin/dcai-sweep.sh` every 5 minutes via cron.

- Keeps a small reserve on the signer address
- Sweeps remaining funds to Treasury

If you need to disable temporarily:

```bash
crontab -l | grep -v dcai-sweep.sh | crontab -
```
