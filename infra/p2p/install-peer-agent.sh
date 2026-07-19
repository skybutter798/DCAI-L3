#!/usr/bin/env bash
set -euo pipefail

install -d -m 0755 /opt/dcai/p2p-agent
install -m 0755 /tmp/peer-agent.py /opt/dcai/p2p-agent/peer-agent.py
install -m 0644 /tmp/dcai-peer-agent.service /etc/systemd/system/dcai-peer-agent.service
rm -f /tmp/peer-agent.py /tmp/dcai-peer-agent.service

systemctl daemon-reload
systemctl restart dcai-peer-agent
systemctl is-active --quiet dcai-peer-agent

token="$(sed -n 's/^P2P_AGENT_TOKEN=//p' /etc/dcai-p2p-agent.env)"
status=""
for _attempt in $(seq 1 20); do
  if status="$(curl -fsS -H "Authorization: Bearer ${token}" http://127.0.0.1:3090/v1/status 2>/dev/null)"; then
    break
  fi
  sleep 0.25
done
test -n "${status}"
STATUS_JSON="${status}" python3 - <<'PY'
import json
import os

data = json.loads(os.environ["STATUS_JSON"])
print(json.dumps({
    "ok": data.get("ok"),
    "nodeId": data.get("node", {}).get("id", "")[:16],
    "blockNumber": data.get("blockNumber"),
    "peerCount": len(data.get("peers", [])),
}))
PY
