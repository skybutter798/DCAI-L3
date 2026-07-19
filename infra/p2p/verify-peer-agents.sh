#!/usr/bin/env bash
set -euo pipefail

token="$(sed -n 's/^P2P_AGENT_TOKEN=//p' /opt/dcai/rewards/.env)"
test -n "${token}"

for url in http://139.180.188.61:3090 http://207.148.72.238:3090; do
  status="$(curl -fsS --connect-timeout 5 --max-time 10 \
    -H "Authorization: Bearer ${token}" "${url}/v1/status")"
  AGENT_URL="${url}" STATUS_JSON="${status}" python3 - <<'PY'
import json
import os

data = json.loads(os.environ["STATUS_JSON"])
print(json.dumps({
    "agent": os.environ["AGENT_URL"],
    "ok": data.get("ok"),
    "nodeId": data.get("node", {}).get("id", "")[:16],
    "blockNumber": data.get("blockNumber"),
    "peerCount": len(data.get("peers", [])),
}))
PY
done
