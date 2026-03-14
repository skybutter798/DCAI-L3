#!/usr/bin/env bash
set -euo pipefail

# Minimal cron entrypoint.
# Expects env vars:
# - RPC_URL, PRIVATE_KEY, DISTRIBUTOR_ADDRESS
# - CLAIMS_JSON: input template
# - OUT_JSON: output epoch file
#
# This script stamps a fresh epochId/dayId each run to avoid being stuck on EPOCH_EXISTS.

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPTS_DIR="$ROOT_DIR/scripts"

CLAIMS_JSON=${CLAIMS_JSON:-"/opt/dcai/rewards/inbox/claims.json"}
RUNTIME_CLAIMS_JSON=${RUNTIME_CLAIMS_JSON:-"/opt/dcai/rewards/out/claims.runtime.json"}
OUT_JSON=${OUT_JSON:-"/opt/dcai/rewards/out/epoch-out.json"}
PUBLISH_JSON=${PUBLISH_JSON:-"/var/www/html/rewards/latest.json"}

mkdir -p "$(dirname "$OUT_JSON")"
mkdir -p "$(dirname "$PUBLISH_JSON")"

if [ ! -f "$CLAIMS_JSON" ]; then
  echo "[publish-epoch] claims file not found: $CLAIMS_JSON" >&2
  exit 0
fi

EPOCH_ID=$(date -u +%Y%m%d%H%M)
DAY_ID=$(date -u +%Y%m%d)

python3 - <<PY
import json
src = "$CLAIMS_JSON"
dst = "$RUNTIME_CLAIMS_JSON"
with open(src,'r') as f:
    data = json.load(f)
data['epochId'] = int("$EPOCH_ID")
data['dayId'] = int("$DAY_ID")
with open(dst,'w') as f:
    json.dump(data,f,indent=2)
print('runtime claims ->', dst, 'epochId', data['epochId'])
PY

cd "$SCRIPTS_DIR"
[ -d node_modules ] || npm install --silent
node build-epoch.mjs --in "$RUNTIME_CLAIMS_JSON" --out "$OUT_JSON"

EPOCH_JSON="$OUT_JSON" node publish-onchain.mjs

cp -f "$OUT_JSON" "$PUBLISH_JSON"
