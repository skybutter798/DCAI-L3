# Rewards v0.1 (Operator Contributions)

Goal: whitelist-based infra contributor rewards for RPC/Indexer/Storage/Multi-region operators.

- Token: tDCAI (native)
- Distribution: **Merkle claim** per epoch
- Caps: **daily cap** (admin adjustable) + optional per-operator daily cap
- Eligibility: only approved operators (OperatorRegistry)

This folder contains:
- Solidity contracts (Registry + Merkle Distributor)
- Example Merkle generation script format

> Secrets (private keys, API keys) are not stored in this repo.

## Parameters (initial)

- DailyCap: 300 tDCAI/day (adjustable)
- Epochs/day: 12 (adjustable off-chain)
- Weights: RPC/Indexer/Storage/Multi-region = 40/20/30/10 (off-chain scoring)
- Ban: 5 strikes; appeal/unban is admin action

## Next steps

1. Pick admin address (multisig recommended)
2. Deploy `OperatorRegistry`
3. Deploy `MerkleRewardDistributor` funded with tDCAI
4. Run off-chain scoring → produce Merkle root per epoch → `publishEpoch()`
5. Operators call `claim()`
