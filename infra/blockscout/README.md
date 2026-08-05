# Blockscout snapshots

Files in this directory are sanitized/live-oriented snapshots from infra-1.

## Included
- `docker-compose.yml` — current main Blockscout stack snapshot
- `docker-compose.cyber.yml` — extra custom frontend service used for the cyber/gold theme variant
- `frontend-src.dcai-theme.patch` — git patch captured from `/opt/blockscout/frontend-src` local modifications against upstream `blockscout/frontend`

## Why a patch instead of vendoring the whole frontend repo?
The live machine keeps Blockscout frontend as its own Git checkout tracking upstream. Storing only the patch keeps this repo focused on DCAI-specific customizations.

## Known delta vs the last live state (decommission note, 2026-08-05)
The committed `docker-compose.yml` is the canonical `explorer.dcai.ai`/https
version. The compose actually running at decommission still had the legacy
frontend on raw-IP hosts (`BLOCKSCOUT_HOST`/`NEXT_PUBLIC_API_HOST`/
`NEXT_PUBLIC_APP_HOST` = `45.32.113.89`, http/ws) and carried
`NEXT_PUBLIC_COLOR_THEME_DEFAULT: dark` plus the cyber gold/black
`NEXT_PUBLIC_COLOR_THEME_OVERRIDES` inline in the main file rather than via
`docker-compose.cyber.yml`. For a rebuild, use the committed version; the
theme overrides live in `docker-compose.cyber.yml`. Also note
`blockscout-frontend_cyber:latest` is a locally built image in no registry —
rebuild it from `frontend-src` + the theme patch (or `docker save/load` it
before destroying the host).
