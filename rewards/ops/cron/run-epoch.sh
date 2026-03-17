#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

MEASUREMENTS_JSON=${MEASUREMENTS_JSON:-"/opt/dcai/rewards/inbox/measurements.json"}
CLAIMS_JSON=${CLAIMS_JSON:-"/opt/dcai/rewards/inbox/claims.json"}
CONFIG_JSON=${CONFIG_JSON:-"/opt/dcai/rewards/monitor/config.json"}
DAILY_CAP_WEI=${DAILY_CAP_WEI:-"300000000000000000000"}
EPOCHS_PER_DAY=${EPOCHS_PER_DAY:-"12"}

# 1) Probe unified entry -> measurements.json
node "$ROOT_DIR/monitor/probe-runner.mjs" \
  --config "$CONFIG_JSON" \
  --out "$MEASUREMENTS_JSON" >/dev/null

# 2) Score -> claims.json
node "$ROOT_DIR/scripts/score-to-claims.mjs" \
  --in "$MEASUREMENTS_JSON" \
  --out "$CLAIMS_JSON" \
  --dailyCapWei "$DAILY_CAP_WEI" \
  --epochsPerDay "$EPOCHS_PER_DAY" >/dev/null

# 3) Publish on-chain + update latest.json
CLAIMS_JSON="$CLAIMS_JSON" "$ROOT_DIR/ops/cron/publish-epoch.sh"
