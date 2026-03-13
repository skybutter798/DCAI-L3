# Merkle leaf format

Leaf = `keccak256(abi.encodePacked(epochId, operatorAddress, amountWei))`

- `epochId`: uint256 (recommended: YYYYMMDDHH or sequential)
- `operatorAddress`: EVM address
- `amountWei`: uint256 (native token wei)

Off-chain scoring produces a list of claims for an epoch.
Then:
1) build Merkle tree (sorted pair hashing)
2) publish root on-chain via `publishEpoch()`
3) each operator claims with proof
