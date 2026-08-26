# 6. An endpoint's identity is the fullest provable runtime path

- **Status:** Accepted
- **Date:** 2026-08-25
- **Context for:** [ADR 0005](0005-unified-frontend-backend-application-graph.md)

## Context

ADR 0005 established that a frontend HTTP call and a backend route registration for the same endpoint
must become one node. It did not say what that node's _path_ is, and the first quality benchmark
exposed the gap: the ground-truth manifest and the indexer had independently chosen opposite
conventions.

**Base-stripped** — the path relative to the API base:

```
api:GET:/clients          from baseURL '/api' + '/clients'
```

**Full runtime path** — the URL actually requested:

```
api:GET:/api/clients
```

Both are self-consistent, and both join the two tiers correctly on the happy path. The benchmark
reported 0% precision and 0% recall on `calls_api` purely because the two disagreed.

The convention looked arbitrary. It is not.

## The deciding case

The fixture contains a second, legacy router whose mount point is not statically knowable:

```ts
app.use('/api', clientsRouter);            // resolvable
app.use(legacyMountPoint(), legacyRouter); // reads process.env — not resolvable

clientsRouter.get('/clients', …);          // → GET /api/clients
legacyRouter.get('/clients', …);           // → GET ???/clients
```

Two different endpoints. Both routers register the string `/clients`.

Under **base-stripping**, the resolved endpoint's canonical path becomes `/clients` — which is
exactly the string the unresolvable router also produces. The two collide, and the graph attaches the
legacy controller to the real endpoint as a second handler. That is a fabricated relationship of the
worst kind: it looks identical to a correct one, it carries real provenance, and it says a request to
`POST /api/clients` may be served by code that has never seen that path.

Under **full runtime path**, the resolved endpoint is `/api/clients` and the unresolvable one is
`/clients`. They cannot collide, because the thing that distinguishes them — the prefix we managed to
prove — is still present in the identity.

Stripping the base does not simplify the model. It discards the evidence that keeps two endpoints
apart.

## Decision

**An `ApiEndpointNode`'s path is the fullest runtime path the indexer could prove.**

- A resolvable client `baseURL` or server mount prefix is applied.
- An unresolvable prefix is _not_ invented, and the path is recorded as written — but the node is
  marked as such and may never be merged with a fully resolved one.

Endpoint nodes carry a resolution state:

| `resolution` | Meaning                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| `full`       | Every prefix in the path was resolved. This is a real URL.                |
| `partial`    | The path within its router is known; the mount prefix or base URL is not. |

A `partial` endpoint and a `full` endpoint **must never merge**, even when their path strings
coincide. Since a partial path is by definition missing an unknown prefix, its canonical id carries an
explicit unknown-prefix marker so collision is impossible by construction rather than by convention:

```
api:GET:/api/clients      full     — a real, requestable URL
api:GET:?/clients         partial  — '/clients' under an unknown mount
```

A path that cannot be determined at all yields **no node** — only an `UNRESOLVED_API_PATH`
diagnostic. There is no third state to guess with.

## Consequences

**We accept:**

- Endpoint ids are environment-specific. An application that mounts at `/api` in production and `/v2`
  in staging produces different ids. That is correct: they are different URLs.
- Two `partial` endpoints from different unmounted routers can still merge with each other. Both are
  honestly unknown, so conflating them loses less than conflating an unknown with a known.
- The frontend and backend must _both_ resolve their prefix for a join to occur. When only one does,
  the graph shows two nodes and the health report counts them as `frontendOnlyEndpoints` /
  `backendOnlyEndpoints` — a visible finding rather than a silent miss.
- The ground-truth manifest had to change. That is recorded as an **architectural decision**, not a
  benchmark fix, in the reconciliation report.

**We gain:**

- The identity of an endpoint is the thing that actually identifies it: its URL.
- A resolved endpoint can never acquire a handler from an unresolved one.
- "We could not resolve the mount point" survives into the graph as data, instead of being erased by
  a normalisation step.

## Regression protection

This is a permanent false-positive trap in the fixture, not a one-off fix:

```
resolved mount:            /api + /clients  → api:GET:/api/clients        resolution: full
unresolved router-local:   ???  + /clients  → api:GET:?/clients           resolution: partial
must NOT merge
```

## The principle behind it

The benchmark is not the source of truth. It is an executable statement of the architecture we
intend. When adversarial testing shows an expectation is unsafe, the expectation changes — and the
change is classified and justified, never made quietly to improve a percentage.

> Precision over recall. A missing relationship is acceptable. An incorrect one is not.
