#!/usr/bin/env bash
set -euo pipefail

# Minimal cron entrypoint.
# Expects:
# - a claims input JSON at $CLAIMS_JSON (see rewards/scripts/example-claims.json)
# - env vars: RPC_URL, PRIVATE_KEY, DISTRIBUTOR_ADDRESS
#
# Produces:
# - an epoch-out JSON next to the claims input

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPTS_DIR="$ROOT_DIR/scripts"
HH_DIR="$ROOT_DIR/hardhat"

CLAIMS_JSON=${CLAIMS_JSON:-"/opt/dcai/rewards/inbox/claims.json"}
OUT_JSON=${OUT_JSON:-"/opt/dcai/rewards/out/epoch-out.json"}

mkdir -p "$(dirname "$OUT_JSON")"

cd "$SCRIPTS_DIR"
if [ ! -f node_modules/.bin/true ]; then
  npm install --silent
fi
node build-epoch.mjs --in "$CLAIMS_JSON" --out "$OUT_JSON"

cd "$HH_DIR"
if [ ! -f node_modules/.bin/true ]; then
  npm install --silent
fi

EPOCH_JSON="$OUT_JSON" \
  npx hardhat run scripts/publish-epoch.js --network dcai

