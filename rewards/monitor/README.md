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
