# @statewavedev/guide-statewave

The durable memory adapter. Server-side only — it is the one package allowed to hold `@statewavedev/sdk`, and a gate fails if a browser-bound package imports it. Persists a closed vocabulary of guide events, bounded by logical state keys; see ADR 0032/0033.

Part of [Statewave Guide](https://github.com/smaramwbc/statewave-guide). Not yet published to npm —
install by cloning the repository. Apache-2.0.
