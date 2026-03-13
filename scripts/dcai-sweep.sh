#!/usr/bin/env bash
set -euo pipefail
FROM="0xD3A120011D0cD915E6df918B2c607B6d0B7522Fb"
TO="0xae201c3daacd53e4cb305fa91678b16cc7eae43a"
IPC="ipc:/data/chaindata/geth.ipc"
RESERVE_WEI="2000000000000000000"
GASPRICE="1000000000"

# Do all math inside geth console (BigInt-safe)
docker exec dcai-signer geth attach --exec "(function(){var from=\"${FROM}\"; var to=\"${TO}\"; var reserve=web3.toBigNumber('${RESERVE_WEI}'); var bal=eth.getBalance(from); if(bal.gt(reserve)){ return eth.sendTransaction({from:from,to:to,value:bal.sub(reserve),gas:21000,gasPrice:${GASPRICE}}); } return 'skip'; })()" ${IPC} >/dev/null
