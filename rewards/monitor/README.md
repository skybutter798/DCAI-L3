# Rewards monitoring / probe runner (v0.1)

This produces `measurements.json` (input for `score-to-claims.mjs`).

## Why a probe runner?

The chain contract only verifies Merkle proofs. The "competition" rules (uptime/latency/etc) live off-chain.

## MVP limitation

If you probe the **unified entry** (`/rpc/<key>/`), you measure the user experience but you **cannot attribute** results to a specific operator unless:

- each operator has a unique endpoint/key, OR
- you probe operator nodes directly (recommended for attribution)

This v0.1 runner focuses on getting the pipeline working; attribution can be added next.

## Run

1) Copy `config.example.json` to `config.json` and set your RPC URL.
2) Run:

```bash
node probe-runner.mjs --config config.json --out measurements.json
```

## Contributor approval automation

Approving a request whose note starts with `Contributor Program Application`
is a transactional onboarding operation with best-effort cross-system rollback:

1. Re-check the applicant's on-chain stake.
   Observer/Core/Backbone must match Basic/Pro/Ultra exactly; Core and
   Backbone must also declare a region.
2. Validate the submitted public endpoint. RPC endpoints must report chainId
   `18441`; indexers must expose a Blockscout-compatible latest-block API and
   be within 100 blocks of the reference RPC.
3. Generate a private `/op/<wallet>/<service>/<key>/` nginx monitoring route.
   Private, loopback, link-local, and reserved upstream addresses are rejected.
4. Add or update the wallet in `monitor/config.json` without duplicating an
   existing operator.
5. Submit `setOperatorStatus(wallet, ACTIVE)` through `OperatorRegistry`.
6. Issue the staked API key and mark the request approved.

Ordinary developer API-key requests do not enter the rewards program. If a
step fails, the config, generated nginx include, API-key files, and Registry
status are restored where applicable. The generated route include is
`/etc/nginx/dcai-operator-routes.conf` and must be included from the nginx
server block.

The enforced contributor lane matrix is documented in
`../docs/contributor-tiers-v1.md`. The probe forwards each operator's lane to
the scorer. The scorer applies the lane-specific SLO curve first and only then
the bounded 1.00x/1.20x/1.50x capacity factor. Operators without a stored lane
remain on Observer behavior for backwards compatibility.

New contributor records use the real-contribution v2 policy documented in
`../docs/real-contribution-v2.md`. They must prove a live Enode connection to a
Foundation RPC node. A bounded HTTP RPC canary then records real traffic and
feeds two-hour traffic plus P2P measurements into `score-to-claims.mjs`.
Legacy records stay on v1 until explicitly re-verified.

`ops/cron/run-epoch.sh` reads `dailyCapWei()` directly from the deployed
distributor before every scoring run. Do not configure a second off-chain
Daily Cap value.
