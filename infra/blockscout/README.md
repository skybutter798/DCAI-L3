# Blockscout snapshots

Files in this directory are sanitized/live-oriented snapshots from infra-1.

## Included
- `docker-compose.yml` — current main Blockscout stack snapshot
- `docker-compose.cyber.yml` — extra custom frontend service used for the cyber/gold theme variant
- `frontend-src.dcai-theme.patch` — git patch captured from `/opt/blockscout/frontend-src` local modifications against upstream `blockscout/frontend`

## Why a patch instead of vendoring the whole frontend repo?
The live machine keeps Blockscout frontend as its own Git checkout tracking upstream. Storing only the patch keeps this repo focused on DCAI-specific customizations.
