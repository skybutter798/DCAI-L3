# Real contribution v2

This rollout upgrades Contributor rewards from synthetic endpoint readiness to
verified network identity plus real work.

## Four enforcement layers

1. **P2P identity** — every new RPC or Indexer contributor submits an Enode.
   Its advertised public IP must match the submitted service endpoint. Two
   Foundation RPC peer agents use Geth IPC (never public Admin HTTP) to call
   `admin.addPeer` and confirm the node ID appears in `admin.peers`.
2. **Real traffic** — the public HTTP RPC upstream sends a bounded
   `2/(20+20+2) = 4.76%` canary share to the local contributor router. Observer,
   Core, and Backbone candidates have relative selection weights 1/4/8.
3. **Health and circuit breaking** — a candidate must have chainId 18441, be
   within 12 blocks of the Foundation reference, and remain directly connected
   to at least one Foundation peer. A request failure falls back to an official
   RPC in the same request; three consecutive failures open a 60-second
   circuit.
4. **Work-based rewards** — two-hour traffic aggregates record requests,
   successes, failures, fallbacks, latency buckets, methods, and bytes. The v2
   work factor combines standby quality, actual traffic, and live P2P presence.

Legacy operators remain on v1 scoring until they complete Enode verification.
This prevents the rollout from silently treating old, incomplete records as
verified contributors.

## RPC work factor

For v2 RPC operators:

```text
workFactor = 0.50 + 0.30 * trafficScore + 0.20 * p2pScore
effectiveRpcScore = measuredRpcQuality * workFactor * laneCapacityFactor
```

No traffic and one Foundation peer therefore receives only 0.60 of measured
standby quality. Good real traffic plus both peer connections can reach 1.00.
The lane capacity factors remain Observer 1.00x, Core 1.20x, Backbone 1.50x.

## Indexer rollout boundary

Indexer applications receive the same Enode proof and live P2P measurement.
The first rollout does not put an external Indexer in the main Explorer read
path. Indexer production queries require a separate shadow/canary period and
data-consistency comparison before serving user responses.

## Security properties

- Peer-agent access requires both an allowlisted Infra-1 source address and a
  256-bit bearer token stored outside Git.
- Contributor upstreams remain pinned to the public IP resolved at approval.
- The router binds to loopback and always retains official RPC fallback.
- Geth `admin`, `debug`, and account-management APIs are not exposed over HTTP.
