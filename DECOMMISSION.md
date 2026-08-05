# Testnet decommission record

**Date:** 2026-08-05
**Reason:** DCAI AppChain testnet (chain ID 18441) no longer needed. All servers
destroyed; this repository is preserved as the complete rebuild source for a
future testnet with fresh data.

## Final chain state (last observed 2026-08-05 ~08:24 UTC, chain still sealing)

| Metric | Value |
|---|---|
| Block height | 6,190,687 (`0x5e765f`) |
| Total transactions (Blockscout) | 11,204 |
| Total addresses | 210 |
| Issued RPC API keys | 52 |
| Chain age | ~145 days (genesis 2026-03-13) |

Public entry `explorer.dcai.ai` had been serving the maintenance "expired" mask
since 2026-08-01 (`infra/nginx/maintenance/`); the chain and all backend
services kept running behind it until destruction.

## Fleet destroyed

| Host | IP | Role |
|---|---|---|
| signer-1 | 45.76.190.151 | Clique signer 0xD3A120… |
| signer-2 | 139.180.188.167 | Clique signer 0x80189D… |
| signer-3 | 45.76.145.198 | Clique signer 0xEB9B32… |
| rpc-1 | 45.76.158.165 | Public RPC |
| rpc-2 | 207.148.124.68 | Public RPC |
| indexer-node-1 | 139.180.131.232 | Archive node |
| infra-1 | 45.32.113.89 | nginx entry, explorer, Blockscout, faucet, admin, rewards |

DNS: the `explorer.dcai.ai` A record was removed at decommission; the domain is
retained.

## Credentials

No private keys or live credentials are in this repository. Everything secret
(signer keystores, faucet/foundation keys, admin token, issued customer API
keys and usage records, nginx key maps, peer-agent token) was archived
privately off-repo before destruction, and all of it died with the chain —
keys that ever leaked into git history were rotated before decommission and
the endpoints they guarded no longer exist.

## Rebuilding a fresh testnet from this repo

The repo contains everything needed except secrets and chain data, which are
regenerated. Broad order (details: `docs/runbook.md`, `infra/geth/README.md`):

1. **New keys first**: create new signer accounts (3×), faucet wallet,
   foundation/publisher wallet, treasury address.
2. **New genesis**: `genesis/genesis.json` is the OLD chain's — regenerate
   `extradata` (Clique signer list) and `alloc` for the new addresses before
   first boot. Keep Geth v1.13.15 (newer releases drop Clique).
3. **Nodes**: bring up signers → RPC nodes → archive node using
   `infra/geth/run-*.sh`, `infra/firewall/`, `infra/docker/daemon.json` +
   `infra/logrotate/` (log caps — the 62 GB container-log incident is why).
4. **infra-1 stack**: nginx (`infra/nginx/`, generate new master keys + admin
   token into the placeholders; `conf.d/dcai-rpc-usage.conf` must be installed
   or nginx won't start), Blockscout (`infra/blockscout/`), faucet
   (`infra/faucet/`), rewards + admin (`rewards/`, units in `infra/systemd/`
   — use `EnvironmentFile=`, don't inline secrets), apikey collector
   (`infra/apikey/`), peer agents (`infra/p2p/`), crons
   (`rewards/ops/cron/crontab.example`), signer sweep (`scripts/dcai-sweep.sh`,
   set per-signer `FROM`), status check (`scripts/dcai-status-check.sh`,
   update fleet IPs).
5. **Contracts**: redeploy ApiKeyStake / SBtoken (`scripts/token-deploy/`),
   OperatorRegistry + MerkleRewardDistributor (`rewards/hardhat/`), then wire
   the new addresses into monitor config and explorer constants.
6. **Edge**: point DNS at the new infra host, `certbot` for TLS, `ufw allow
   80,443` (+3090 for peer agents) — fresh Ubuntu images block everything but
   22 by default.

Known quirks worth re-reading before a rebuild: the tiered RPC path-key rules
in `docs/developer-guide.md`, the `/ws/` proxy_pass URI-rewrite bug noted
there, and Docker's `-p` publishing bypassing ufw (hence the DOCKER-USER
firewall units).
