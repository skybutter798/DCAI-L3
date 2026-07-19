# Contributor tiers v1

The public Contributor Program names are enforced aliases of the deployed
`ApiKeyStake` tiers. A larger stake does not buy rewards by itself: an operator
must be approved, remain `ACTIVE` in `OperatorRegistry`, and pass the measured
service-quality policy for every epoch.

| Lane | On-chain tier | Stake | RPC credential | Function | Quality policy | Reward capacity factor |
|---|---|---:|---:|---|---|---:|
| Observer | Basic | 1,000 tDCAI | 10 req/s | Single-region RPC or indexer entry lane | 98% floor, RPC p95 800 ms, errors 2%, indexer lag 12 blocks | 1.00x |
| Core | Pro | 5,000 tDCAI | 50 req/s | Production RPC or indexer with declared region | 99% floor, RPC p95 500 ms, errors 1%, indexer lag 6 blocks | 1.20x |
| Backbone | Ultra | 10,000 tDCAI | 200 req/s | Critical high-capacity RPC or indexer | 99.9% floor, RPC p95 250 ms, errors 0.1%, indexer lag 2 blocks | 1.50x |

The factor multiplies measured service score, not the stake balance. A higher
lane also has a stricter normalization curve, so an underperforming Core or
Backbone endpoint can earn less than a healthy Observer endpoint.

Legacy operators without a stored `programTier` are treated as Observer. This
keeps their current 1.00x behavior until an administrator explicitly
reclassifies them.
