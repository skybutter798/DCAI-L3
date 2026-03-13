# Deploy & Ops (Rewards v0.1)

This is a private-chain, admin-driven rewards system.

## Contracts

- `OperatorRegistry` — allowlist + status control
- `MerkleRewardDistributor` — admin publishes epoch roots; operators claim

## Suggested deployment flow

1. Choose an **admin** address (multisig recommended)
2. Deploy `OperatorRegistry(admin)`
3. Deploy `MerkleRewardDistributor(admin, registry, dailyCapWei)`
   - Example: `dailyCapWei = 300e18` for 300 tDCAI/day
4. Fund `MerkleRewardDistributor` with tDCAI (native token)

## Operator lifecycle

- Approve operator:
  - `registry.setOperatorStatus(operator, ACTIVE)`
- Suspend/ban:
  - `registry.setOperatorStatus(operator, SUSPENDED/BANNED)`

## Epoch publishing (off-chain -> on-chain)

1. Off-chain scoring decides `amountWei` per operator for an epoch
2. Generate merkle root + proofs
   - Use `rewards/scripts/build-epoch.mjs`
3. Publish on-chain:
   - `distributor.publishEpoch(epochId, dayId, merkleRoot, totalWei)`
   - Must satisfy: `dailySpent + totalWei <= dailyCap`

## Claiming

Operator calls:

- `claim(epochId, operator, amountWei, proof[])`

Guards:
- must be `ACTIVE`
- can only claim once per epoch
- optional per-operator daily cap

## Notes

- Random/"not fixed time" distribution is operational: publish epoch at any time, but respect daily cap.
- For competition mode, publish multiple small epochs per day (e.g. 12) and vary timing.
