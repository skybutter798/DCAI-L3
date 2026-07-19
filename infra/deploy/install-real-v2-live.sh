#!/usr/bin/env bash
set -euo pipefail

stage="$(readlink -f "${1:?staging directory required}")"
backup="$(readlink -f "${2:?backup directory required}")"
case "${stage}" in
  /opt/dcai/rewards/real-v2-staging-*) ;;
  *) echo "refusing unexpected staging path: ${stage}" >&2; exit 1 ;;
esac
case "${backup}" in
  /root/dcai-recovery/real-contribution-v2-four-layer-*) ;;
  *) echo "refusing unexpected backup path: ${backup}" >&2; exit 1 ;;
esac

test -f "${stage}/rewards/monitor/admin-api.mjs"
test -f "${stage}/explorer/aurascan-preview/dist/index.html"
install -d -m 0700 "${backup}/live"
test ! -e "${backup}/live/monitor"

cp -a /opt/dcai/rewards/monitor "${backup}/live/monitor"
cp -a /opt/dcai/rewards/scripts "${backup}/live/scripts"
cp -a /opt/dcai/rewards/inbox "${backup}/live/inbox"
cp -a /opt/aurascan-explorer/dist "${backup}/live/aurascan-dist"
cp -a /var/www/html/admin "${backup}/live/admin-web"
cp -a /etc/nginx/sites-available/dcai-testnet "${backup}/live/nginx-dcai-testnet"
cp -a /etc/nginx/dcai-operator-routes.conf "${backup}/live/nginx-operator-routes"
if test -f /etc/systemd/system/dcai-contributor-router.service; then
  cp -a /etc/systemd/system/dcai-contributor-router.service "${backup}/live/dcai-contributor-router.service"
fi

monitor_files=(
  README.md admin-api.mjs contributor-policy.mjs contributor-policy.test.mjs
  contributor-router.mjs contributor-router.test.mjs gen-dashboard.mjs
  operator-onboarding.mjs operator-onboarding.test.mjs peer-client.mjs
  peer-client.test.mjs probe-runner.mjs
)
for file in "${monitor_files[@]}"; do
  install -m 0644 "${stage}/rewards/monitor/${file}" "/opt/dcai/rewards/monitor/${file}"
done

script_files=(read-daily-cap.mjs score-to-claims.mjs score-to-claims.test.mjs)
for file in "${script_files[@]}"; do
  install -m 0644 "${stage}/rewards/scripts/${file}" "/opt/dcai/rewards/scripts/${file}"
done

install -d -m 0755 /opt/dcai/rewards/docs
install -m 0644 "${stage}/rewards/docs/contributor-tiers-v1.md" /opt/dcai/rewards/docs/contributor-tiers-v1.md
install -m 0644 "${stage}/rewards/docs/real-contribution-v2.md" /opt/dcai/rewards/docs/real-contribution-v2.md
install -m 0644 "${stage}/infra/systemd/dcai-contributor-router.service" /etc/systemd/system/dcai-contributor-router.service

systemctl daemon-reload
systemctl enable --now dcai-contributor-router.service
for _attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3998/health >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS http://127.0.0.1:3998/health
curl -fsS -D "${stage}/live-router-headers.txt" -o "${stage}/live-router-response.json" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  http://127.0.0.1:3998/
grep -qi '^X-DCAI-Route: official-fallback' "${stage}/live-router-headers.txt"
python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); assert data.get("result") == "0x4809"' "${stage}/live-router-response.json"

systemctl restart dcai-admin-api.service
systemctl is-active --quiet dcai-admin-api.service
for _attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/cap >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS http://127.0.0.1:3001/cap >/dev/null
(cd /opt/dcai/rewards/monitor && node gen-dashboard.mjs)

rsync -a --delete "${stage}/explorer/aurascan-preview/dist/" /opt/aurascan-explorer/dist/
docker restart aurascan_preview >/dev/null
for _attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3002/ >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS http://127.0.0.1:3002/ >/dev/null

echo "live application install passed; nginx canary not yet enabled"
