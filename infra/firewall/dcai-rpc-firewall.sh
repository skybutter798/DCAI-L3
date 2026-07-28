#!/usr/bin/env bash
set -euo pipefail
# Transitional allowlist: OLD + NEW fleet IPs. Prune the old ones after decommission.
FLEET="45.32.113.89 45.76.190.151 139.180.188.167 45.76.145.198 45.76.158.165 207.148.124.68 139.180.131.232 127.0.0.1"
PORTS="8545,8546"
iptables -F DOCKER-USER
for ip in $FLEET; do
  iptables -A DOCKER-USER -s "$ip" -p tcp -m multiport --dports "$PORTS" -j RETURN
done
iptables -A DOCKER-USER -p tcp -m multiport --dports "$PORTS" -j DROP
iptables -A DOCKER-USER -j RETURN
if ip6tables -S DOCKER-USER >/dev/null 2>&1; then
  ip6tables -F DOCKER-USER
  ip6tables -A DOCKER-USER -s ::1 -p tcp -m multiport --dports "$PORTS" -j RETURN
  ip6tables -A DOCKER-USER -p tcp -m multiport --dports "$PORTS" -j DROP
  ip6tables -A DOCKER-USER -j RETURN
fi
echo applied
