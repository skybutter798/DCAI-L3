# DCAI-L3 (Testnet)

> **⛔ DECOMMISSIONED 2026-08-05.** The testnet has been shut down and all servers destroyed. This repo is preserved as the complete rebuild source (configs, apps, docs — no secrets, no chain data). Final state and rebuild checklist: [`DECOMMISSION.md`](DECOMMISSION.md). Host IPs and endpoints below are historical.

This repository documents the final **DCAI AppChain Testnet** deployment (Scheme A: PoA sidechain/appchain) and contains the infra configs used to bring it up.

> Note: **No passwords / private keys** are committed here.

## Network parameters

- **Chain ID:** `18441`
- **Consensus:** Clique (PoA)
- **Block time:** ~2s
- **Native token symbol:** `tDCAI`
- **Client:** Geth `v1.13.15` (important: newer geth releases are PoS-only and won’t run Clique)
- **Treasury:** `0xae201c3daacd53e4cb305fa91678b16cc7eae43a`
- **Fee policy (current implementation):**
  - EIP-1559 **baseFee burns**
  - tips/fees land on signer accounts (Clique sealing requires local etherbase), then swept periodically to Treasury

## Public endpoints (via unified entry)

Unified entry (nginx): `https://explorer.dcai.ai`

- Explorer: `https://explorer.dcai.ai/`
- Faucet:
  - Status: `https://explorer.dcai.ai/faucet/`
  - Request: `POST https://explorer.dcai.ai/faucet/request` with JSON `{ "address": "0x..." }`
- RPC (API-key gated):
  - HTTP: `https://explorer.dcai.ai/rpc/`
  - WS: `wss://explorer.dcai.ai/ws/`
- Direct debug paths:
  - `/rpc1/`, `/rpc2/`, `/ws1/`, `/ws2/`

## Hosts / roles (Vultr SG)

- **Signers**
  - signer-1: `45.76.190.151` — `0xD3A120011D0cD915E6df918B2c607B6d0B7522Fb`
  - signer-2: `139.180.188.167` — `0x80189D1f1a2b15c1bb1cb1b20d68c777823a8079`
  - signer-3: `45.76.145.198` — `0xEB9B32A62DFB67bf0b37A07682DD9DF07859D241`
- **RPC**
  - rpc-1: `45.76.158.165` (8545/8546)
  - rpc-2: `207.148.124.68` (8545/8546)
- **Infra**
  - infra-1: `45.32.113.89` (nginx unified entry, explorer UI `:3002`, Blockscout backend + legacy frontend `:3000`, faucet, admin dashboard + API `:3001`, RPC API-key usage collector, contributor RPC router)
- **Indexer / archive node**
  - indexer-node-1: `139.180.131.232`

## Repo layout

- `genesis/genesis.json` — genesis used across nodes
- `contracts/` — standalone Solidity contracts (`ApiKeyStake.sol`, `SBtoken.sol`)
- `apps/ask-mvp/` — Ask MVP web app
- `explorer/aurascan-preview/` — custom explorer UI served at the unified entry root
- `rewards/` — contribution rewards stack (contracts, hardhat, monitor + admin API, ops cron, web) — see `rewards/README.md`
- `infra/nginx/` — nginx unified entry config (Explorer + Faucet + RPC proxy + admin), incl. `conf.d/dcai-rpc-usage.conf` which defines the `dcai_rpc_usage` log format the site config depends on
- `infra/firewall/` — `dcai-rpc-firewall.sh` + systemd unit: restricts geth `8545/8546` to the fleet via the `DOCKER-USER` iptables chain (ufw alone does **not** cover Docker-published ports)
- `infra/docker/daemon.json`, `infra/logrotate/` — container log size caps (json-file `max-size`/`max-file`) plus a logrotate rule for existing containers
- `infra/blockscout/` — Blockscout docker-compose + cyber theme override snapshot + frontend patch
- `infra/faucet/` — Faucet docker-compose + source
- `infra/geth/` — sanitized live runtime snapshots reconstructed from running geth containers
- `infra/apikey/` — RPC API-key usage collector snapshot
- `infra/deploy/` — deploy + validation scripts for live rollouts
- `infra/p2p/` — peer agent (systemd unit + install/verify scripts)
- `infra/systemd/` — contributor RPC router service unit
- `scripts/dcai-sweep.sh` — signer fee sweep script (installed on signers via cron; per-signer `FROM`)
- `scripts/dcai-status-check.sh` — infra-1 fleet/explorer lag-check cron
- `infra/nginx/maintenance/` — "server expired" takedown mask used 2026-08-01 → decommission
- `docs/` — developer guide + operations runbook
- `DECOMMISSION.md` — final chain state + fresh-testnet rebuild checklist

## Operations quickstart

See `docs/runbook.md`.
