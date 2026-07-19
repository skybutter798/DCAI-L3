#!/usr/bin/env bash
set -euo pipefail

stage="$(readlink -f "${1:?staging directory required}")"
case "${stage}" in
  /opt/dcai/rewards/real-v2-staging-*) ;;
  *) echo "refusing unexpected staging path: ${stage}" >&2; exit 1 ;;
esac

test -f "${stage}/rewards/monitor/contributor-router.mjs"
test -f "${stage}/rewards/monitor/admin-api.mjs"
test -f "${stage}/rewards/scripts/score-to-claims.mjs"

ln -sfn /opt/dcai/rewards/monitor/node_modules "${stage}/rewards/monitor/node_modules"
ln -sfn /opt/dcai/rewards/scripts/node_modules "${stage}/rewards/scripts/node_modules"

for file in \
  admin-api.mjs contributor-policy.mjs contributor-router.mjs gen-dashboard.mjs \
  operator-onboarding.mjs peer-client.mjs probe-runner.mjs; do
  node --check "${stage}/rewards/monitor/${file}"
done
node --check "${stage}/rewards/scripts/read-daily-cap.mjs"
node --check "${stage}/rewards/scripts/score-to-claims.mjs"

node --test \
  "${stage}/rewards/monitor/contributor-policy.test.mjs" \
  "${stage}/rewards/monitor/contributor-router.test.mjs" \
  "${stage}/rewards/monitor/operator-onboarding.test.mjs" \
  "${stage}/rewards/monitor/peer-client.test.mjs" \
  "${stage}/rewards/scripts/score-to-claims.test.mjs"

set -a
. /opt/dcai/rewards/.env
set +a
CONTRIBUTOR_ROUTER_PORT=3997 \
CONFIG_PATH=/opt/dcai/rewards/monitor/config.json \
TRAFFIC_STATS_PATH="${stage}/traffic-stats.json" \
node "${stage}/rewards/monitor/contributor-router.mjs" >"${stage}/router-test.log" 2>&1 &
router_pid=$!
cleanup() {
  kill "${router_pid}" 2>/dev/null || true
  wait "${router_pid}" 2>/dev/null || true
}
trap cleanup EXIT

for _attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3997/health >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS http://127.0.0.1:3997/health
curl -fsS -D "${stage}/router-headers.txt" -o "${stage}/router-response.json" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  http://127.0.0.1:3997/
grep -qi '^X-DCAI-Route: official-fallback' "${stage}/router-headers.txt"
python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); assert data.get("result") == "0x4809"' "${stage}/router-response.json"

echo "staging validation passed"
