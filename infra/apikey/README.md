# API key usage collector

Sanitized live snapshot copied from infra-1 on 2026-03-17.

## Files
- `usage-collector.mjs` — ingests mirrored JSON-RPC requests from nginx (`/__rpc_mirror`) and maintains rolling per-key usage, status, method, and latency aggregates.

## Runtime paths on infra-1
- log input: `/var/log/nginx/rpc_access.log`
- state/output dir: `/opt/dcai/apikey`
- listen: `127.0.0.1:3999`

## Notes
- This belongs under `infra/` rather than `rewards/` because it serves the RPC API key system.
- Data files (`keys.json`, `requests.json`, `usage.json`, `usage-state.json`) are intentionally not committed.
