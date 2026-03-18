#!/usr/bin/env bash
set -euo pipefail

# Minimal cron entrypoint.
# Expects env vars:
# - RPC_URL, PRIVATE_KEY, DISTRIBUTOR_ADDRESS
# - CLAIMS_JSON: input template
# - OUT_JSON: output epoch file
#
# This script stamps a fresh epochId/dayId each run to avoid being stuck on EPOCH_EXISTS.

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if [ -d "$SCRIPT_DIR/scripts" ]; then
  ROOT_DIR="$SCRIPT_DIR"
elif [ -d "$SCRIPT_DIR/../../scripts" ]; then
  ROOT_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
else
  echo "[publish-epoch] unable to locate rewards root from $SCRIPT_DIR" >&2
  exit 1
fi
SCRIPTS_DIR="$ROOT_DIR/scripts"

CLAIMS_JSON=${CLAIMS_JSON:-"/opt/dcai/rewards/inbox/claims.json"}
RUNTIME_CLAIMS_JSON=${RUNTIME_CLAIMS_JSON:-"/opt/dcai/rewards/out/claims.runtime.json"}
OUT_JSON=${OUT_JSON:-"/opt/dcai/rewards/out/epoch-out.json"}
PUBLISH_JSON=${PUBLISH_JSON:-"/var/www/html/rewards/latest.json"}
ARCHIVE_DIR=${ARCHIVE_DIR:-"/var/www/html/rewards/epochs"}
FULL_CONFIG_JSON=${FULL_CONFIG_JSON:-"$ROOT_DIR/monitor/config.json"}
PRIVATE_CONFIG_ARCHIVE_DIR=${PRIVATE_CONFIG_ARCHIVE_DIR:-"$ROOT_DIR/archive/config"}

mkdir -p "$(dirname "$OUT_JSON")"
mkdir -p "$(dirname "$PUBLISH_JSON")"
mkdir -p "$ARCHIVE_DIR"
mkdir -p "$PRIVATE_CONFIG_ARCHIVE_DIR"

if [ ! -f "$CLAIMS_JSON" ]; then
  echo "[publish-epoch] claims file not found: $CLAIMS_JSON" >&2
  exit 0
fi

EPOCH_ID=$(date -u +%Y%m%d%H%M)
DAY_ID=$(date -u +%Y%m%d)

python3 - <<PY
import datetime
import hashlib
import json
import os

src = "$CLAIMS_JSON"
dst = "$RUNTIME_CLAIMS_JSON"
cfg_path = "$FULL_CONFIG_JSON"
private_cfg_dir = "$PRIVATE_CONFIG_ARCHIVE_DIR"
epoch_id = int("$EPOCH_ID")
day_id = int("$DAY_ID")

with open(src,'r') as f:
    data = json.load(f)

data['epochId'] = epoch_id
data['dayId'] = day_id

if os.path.exists(cfg_path):
    with open(cfg_path, 'r') as f:
        cfg = json.load(f)

    canonical = json.dumps(cfg, sort_keys=True, separators=(',', ':')).encode()
    cfg_hash = 'sha256:' + hashlib.sha256(canonical).hexdigest()

    rpc_cfg = cfg.get('rpc', {}) or {}
    operators = []
    for op in cfg.get('operators', []) or []:
        endpoints = op.get('endpoints', {}) or {}
        operators.append({
            'operator': op.get('operator'),
            'services': op.get('services', {}) or {},
            'endpointKinds': {
                'rpc': bool(endpoints.get('rpc')),
                'indexer': 'shared-infra' if endpoints.get('indexer') == 'http://127.0.0.1:4000' else bool(endpoints.get('indexer')),
                'storage': bool(endpoints.get('storage')),
                'multiregionCount': len(endpoints.get('multiregion', []) or [])
            }
        })

    data['configHash'] = cfg_hash
    data['configMtimeUtc'] = datetime.datetime.utcfromtimestamp(os.stat(cfg_path).st_mtime).replace(microsecond=0).isoformat() + 'Z'
    data['configSummary'] = {
        'source': cfg_path,
        'rpc': {
            'timeoutMs': rpc_cfg.get('timeoutMs'),
            'samplesPerEpoch': rpc_cfg.get('samplesPerEpoch'),
            'methods': [m.get('name') for m in (rpc_cfg.get('methods', []) or []) if isinstance(m, dict)]
        },
        'weights': cfg.get('weights', {}) or {},
        'operators': operators
    }

    private_cfg_path = os.path.join(private_cfg_dir, f'{epoch_id}.full-config.json')
    with open(private_cfg_path, 'w') as f:
        json.dump({
            'epochId': epoch_id,
            'dayId': day_id,
            'configHash': cfg_hash,
            'config': cfg
        }, f, indent=2)
    os.chmod(private_cfg_path, 0o600)
    print('private config archive ->', private_cfg_path, cfg_hash)
else:
    print('config not found, skipping config hash/archive ->', cfg_path)

with open(dst,'w') as f:
    json.dump(data,f,indent=2)
print('runtime claims ->', dst, 'epochId', data['epochId'])
PY

cd "$SCRIPTS_DIR"
[ -d node_modules ] || npm install --silent
node build-epoch.mjs --in "$RUNTIME_CLAIMS_JSON" --out "$OUT_JSON"

EPOCH_JSON="$OUT_JSON" node publish-onchain.mjs

cp -f "$OUT_JSON" "$PUBLISH_JSON"
cp -f "$OUT_JSON" "$ARCHIVE_DIR/$EPOCH_ID.json"
echo "[publish-epoch] archived epoch -> $ARCHIVE_DIR/$EPOCH_ID.json"
