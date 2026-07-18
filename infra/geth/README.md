# Live geth runtime snapshots

These files were reconstructed from the **currently running containers** on the DCAI L3 fleet on **2026-03-17 UTC** using `docker inspect`, so they reflect what was actually running more closely than older ad-hoc host scripts.

## Current hosts

### Signers
- signer-1 — `45.76.190.151` — `0xD3A120011D0cD915E6df918B2c607B6d0B7522Fb`
- signer-2 — `139.180.188.167` — `0x80189D1f1a2b15c1bb1cb1b20d68c777823a8079`
- signer-3 — `45.76.145.198` — `0xEB9B32A62DFB67bf0b37A07682DD9DF07859D241`

### RPC
- rpc-1 — `139.180.188.61`
- rpc-2 — `207.148.72.238`

### Indexer / archive
- indexer-node-1 — `139.180.141.226`

## Notes
- `genesis/genesis.json` matches the live signer genesis.
- Signers expose only p2p (`30303` tcp/udp).
- RPC nodes expose p2p + `8545`/`8546`.
- Archive/indexer node exposes p2p + `8545`/`8546` and enables `debug` / `txpool` APIs.
- The explorer source in `explorer/aurascan-preview/` is deployed to infra-1 at `/opt/aurascan-explorer` (repo and server are in sync as of 2026-07-18). AuraScan is the default site on port 80; the Blockscout frontend remains reachable on `:3000` (and the cyber theme on `:3003`).
