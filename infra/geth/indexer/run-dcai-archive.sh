#!/usr/bin/env bash
set -euo pipefail

exec docker run -d --name dcai-archive --restart unless-stopped \
  -v /opt/dcai/indexer:/data \
  -p 30303:30303 -p 30303:30303/udp \
  -p 8545:8545 -p 8546:8546 \
  ethereum/client-go:v1.13.15 \
  --datadir /data/data \
  --networkid 18441 \
  --port 30303 \
  --bootnodes enode://394a60ef7022d2cdd9f32d0f9ef979e62214f18f26d19f6f139da1086930c13988d65181768d002cdc24b51ec0208e2473b8da714105e9dea27fe4184fb65a76@45.76.190.151:30303 \
  --syncmode full \
  --gcmode archive \
  --http --http.addr 0.0.0.0 --http.port 8545 --http.api eth,net,web3,txpool,debug --http.vhosts='*' \
  --ws --ws.addr 0.0.0.0 --ws.port 8546 --ws.api eth,net,web3,txpool,debug --ws.origins='*'
