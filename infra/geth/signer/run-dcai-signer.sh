#!/usr/bin/env bash
set -euo pipefail

HOST_PUBLIC_IP="${HOST_PUBLIC_IP:?set HOST_PUBLIC_IP}"
SIGNER_ADDRESS="${SIGNER_ADDRESS:?set SIGNER_ADDRESS}"

exec docker run -d --name dcai-signer --restart unless-stopped \
  -v /opt/dcai/signer:/data \
  -p 30303:30303 -p 30303:30303/udp \
  ethereum/client-go:v1.13.15 \
  --datadir /data/chaindata \
  --keystore /data/geth/keystore \
  --networkid 18441 \
  --port 30303 \
  --nat "extip:${HOST_PUBLIC_IP}" \
  --unlock "${SIGNER_ADDRESS}" \
  --password /data/geth/pw.txt \
  --mine \
  --miner.etherbase "${SIGNER_ADDRESS}" \
  --miner.gasprice 1
