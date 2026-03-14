# Rewards Scoring Spec v0.1 (score → claims.json)

This spec defines how the project converts off-chain measurements into an on-chain epoch distribution.

## Terminology

- **Operator**: an allowlisted address that runs one or more services (RPC / Indexer / Storage / Multi-region).
- **Epoch**: one distribution round. You can publish any time ("not fixed"), but typically **12/day**.
- **DailyCap**: maximum total rewards published per UTC day.

## Inputs

### A) Operator registry (off-chain)
For each operator, store:
- `operator` (EVM address)
- `services`: `{ rpc, indexer, storage, multiregion }` booleans
- optional metadata: region(s), specs, endpoints

### B) Measurements per epoch (off-chain)
Per operator per service, record:

#### RPC measurements
- `uptime` (0..1)
- `p95_ms`
- `error_rate` (0..1)
- optional `rps` (or `qps`)

#### Indexer measurements
- `uptime` (0..1)
- `lag_blocks` (>=0)
- `error_rate` (0..1)

#### Storage measurements
- `uptime` (0..1)
- `io_p95_ms`
- `error_rate` (0..1)
- optional `stored_gb`

#### Multi-region measurements
- `regions_ok` (0..N)
- `regions_required` (N)
- optional `geo_p95_ms`

## Weights (from Sky)

Default service weights:

- RPC: **40**
- Indexer: **20**
- Storage: **30**
- Multi-region: **10**

Total weight = 100.

## Eligibility (pass/fail)

If an operator fails *any* service they claim to provide, that service gets score 0 for the epoch.

Recommended defaults:

- RPC: `uptime >= 0.98` AND `p95_ms <= 800` AND `error_rate <= 0.02`
- Indexer: `uptime >= 0.98` AND `lag_blocks <= 12`
- Storage: `uptime >= 0.98` AND `io_p95_ms <= 50` AND `error_rate <= 0.02`
- Multi-region: `regions_ok >= regions_required`

(These are admin-tunable. Private chain = OK to adjust.)

## Scoring (continuous)

For each operator, compute a **serviceScore** in `[0, 1]` for each enabled service.

### RPC serviceScore

```
A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1)
L = clamp((800 - p95_ms) / 800, 0, 1)
E = clamp((0.02 - error_rate) / 0.02, 0, 1)
serviceScore_rpc = A * (0.6*L + 0.4*E)
```

### Indexer serviceScore

```
A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1)
G = clamp((12 - lag_blocks) / 12, 0, 1)
serviceScore_indexer = A * G
```

### Storage serviceScore

```
A = clamp((uptime - 0.98) / (1 - 0.98), 0, 1)
I = clamp((50 - io_p95_ms) / 50, 0, 1)
E = clamp((0.02 - error_rate) / 0.02, 0, 1)
serviceScore_storage = A * (0.6*I + 0.4*E)
```

### Multi-region serviceScore

```
serviceScore_multiregion = clamp(regions_ok / regions_required, 0, 1)
```

### Total operator score

```
score(operator) =
  40 * serviceScore_rpc +
  20 * serviceScore_indexer +
  30 * serviceScore_storage +
  10 * serviceScore_multiregion
```

Operators not providing a service get 0 for that service.

## Converting scores into rewards

Per epoch, define:

- `epochPoolWei = DailyCapWei / epochsPerDay`

Then for each operator:

```
rewardWei_i = epochPoolWei * score_i / sum(score)
```

Recommended guards:
- `minRewardWei` (e.g. 0.01 tDCAI) → below this, set to 0
- `maxRewardWeiPerEpoch` (optional)

## Output: claims.json

This is fed into the Merkle builder.

```json
{
  "epochId": 202603140900,
  "dayId": 20260314,
  "claims": [
    {"operator": "0x...", "amountWei": "123000000000000000"}
  ]
}
```

## Notes

- The chain contract does **not** know these rules; it only verifies Merkle proofs. The rules live in your scoring system.
- For audits/disputes, store raw measurements + computed scores per epoch.
