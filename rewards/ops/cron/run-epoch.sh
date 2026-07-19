#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [[ -d "$SCRIPT_DIR/monitor" && -d "$SCRIPT_DIR/scripts" ]]; then
  ROOT_DIR="$SCRIPT_DIR"
elif [[ -d "$SCRIPT_DIR/../../monitor" && -d "$SCRIPT_DIR/../../scripts" ]]; then
  ROOT_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
else
  echo "[run-epoch] unable to locate rewards root from $SCRIPT_DIR" >&2
  exit 1
fi

MEASUREMENTS_JSON=${MEASUREMENTS_JSON:-"/opt/dcai/rewards/inbox/measurements.json"}
CLAIMS_JSON=${CLAIMS_JSON:-"/opt/dcai/rewards/inbox/claims.json"}
CONFIG_JSON=${CONFIG_JSON:-"/opt/dcai/rewards/monitor/config.json"}
EPOCHS_PER_DAY=${EPOCHS_PER_DAY:-"12"}

# The distributor contract is the single source of truth. Reading the cap for
# every run prevents the off-chain scorer from drifting after an admin change.
DAILY_CAP_WEI=$(node "$ROOT_DIR/scripts/read-daily-cap.mjs")
if [[ ! "$DAILY_CAP_WEI" =~ ^[1-9][0-9]*$ ]]; then
  echo "[run-epoch] invalid on-chain Daily Cap: $DAILY_CAP_WEI" >&2
  exit 1
fi
echo "[run-epoch] on-chain dailyCapWei=$DAILY_CAP_WEI epochsPerDay=$EPOCHS_PER_DAY" >&2

# 1) Probe unified entry -> measurements.json
node "$ROOT_DIR/monitor/probe-runner.mjs" \
  --config "$CONFIG_JSON" \
  --out "$MEASUREMENTS_JSON" >/dev/null

# 2) Score -> claims.json
node "$ROOT_DIR/scripts/score-to-claims.mjs" \
  --in "$MEASUREMENTS_JSON" \
  --out "$CLAIMS_JSON" \
  --config "$CONFIG_JSON" \
  --dailyCapWei "$DAILY_CAP_WEI" \
  --epochsPerDay "$EPOCHS_PER_DAY" >/dev/null

if [[ "${REWARDS_DRY_RUN:-0}" == "1" ]]; then
  echo "[run-epoch] dry run complete; skipping on-chain publication" >&2
  exit 0
fi

# 3) Publish on-chain + update latest.json
PUBLISH_SCRIPT="$ROOT_DIR/ops/cron/publish-epoch.sh"
if [[ ! -x "$PUBLISH_SCRIPT" ]]; then PUBLISH_SCRIPT="$ROOT_DIR/publish-epoch.sh"; fi
CLAIMS_JSON="$CLAIMS_JSON" "$PUBLISH_SCRIPT"
