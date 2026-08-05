#!/usr/bin/env bash
set -euo pipefail

# Fleet lag check: chain head (rpc-1) vs archive indexer vs Blockscout index.
# Installed at /usr/local/bin/dcai-status-check.sh on infra-1, cron every 5 min
# (see rewards/ops/cron/crontab.example). Exits 2 when a consumer lags >200
# blocks. This is the repaired version — the original shipped with mangled
# python quoting and pointed at the pre-migration fleet IPs, so it had been
# failing silently in /var/log/dcai-status.log since the 2026-07-28 migration.

RPC1="http://45.76.158.165:8545"
INDEXER="http://139.180.131.232:8545"
BLOCKSCOUT_STATS="http://127.0.0.1:4000/api/v2/stats"

rpc_block(){
  curl -s --max-time 10 "$1" -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | python3 -c 'import sys,json; print(int(json.load(sys.stdin)["result"],16))'
}

CHAIN=$(rpc_block "$RPC1")
IDX=$(rpc_block "$INDEXER")
BS_BLOCKS=$(curl -s --max-time 10 "$BLOCKSCOUT_STATS" | python3 -c 'import sys,json; print(int(json.load(sys.stdin).get("total_blocks") or 0))')

LAG_IDX=$((CHAIN-IDX))
LAG_BS=$((CHAIN-BS_BLOCKS))
TS=$(date -u +"%F %T")
echo "$TS chain=$CHAIN indexer=$IDX(lag=$LAG_IDX) blockscout=$BS_BLOCKS(lag=$LAG_BS)"

if (( LAG_IDX > 200 || LAG_BS > 200 )); then
  exit 2
fi
