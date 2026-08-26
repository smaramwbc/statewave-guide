# 5. Model the frontend and the backend as one application graph

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

A user's question is almost never scoped to one tier.

> "What happens when I press New Client?"

The honest answer crosses a network boundary:

```
element:clients.create → openCreateClient → NewClientDialog → ClientForm
   → submitClient → clientService.create → POST /api/clients
   → backend createClient → clientService.create → INSERT
```

Two separate graphs — one per tier — could each describe their half. Neither could answer the
question, and joining them at query time would mean re-deriving the correspondence on every lookup,
from the only thing the two halves share: a method and a path.

That correspondence is also where a naive implementation goes wrong. `api.post('/clients')` on a
client configured with `baseURL: '/api'` and `router.post('/clients')` on a router mounted at `/api`
are the same endpoint. Nothing textual in either file says so.

## Decision

One graph, containing both tiers, joined at a canonical endpoint node.

```
api:POST:/api/clients
```

An `ApiEndpointNode` is created once per normalised `METHOD:path`. Both tiers attach to it:

- frontend: `function:…#clientService.create --calls_api--> api:POST:/api/clients`
- backend: `api:POST:/api/clients --invokes--> function:…#createClient`

The node records `observedOn: ['backend', 'frontend']` and keeps every observation's provenance, so
the join is visible rather than implied.

Path normalisation is symmetric and purely syntactic — a client's `baseURL` and a server's mount
prefix are both resolved when they are module-scope string literals, and both sides run through the
same `normaliseApiPath`. Where a base or a prefix cannot be resolved, the endpoint is registered at
its unprefixed path and a diagnostic is emitted. It is never guessed at.

## Why the endpoint is the join, and not something else

The endpoint is the only thing both tiers name independently. A frontend service and a backend
controller may share nothing else — not a type, not a file, not a module, often not even a repository.
They both write `POST` and they both write `/clients`, and that is the entire contract between them.

Joining on anything else means matching on names. `clientService.create` on the frontend and
`createClient` on the backend look related, and a name-matching join would connect them. It would
also connect them when they are unrelated, and it would fail whenever a team names things differently
on either side. Names are evidence of intent, not evidence of connection.

## Consequences

**We accept:**

- The indexer must handle a project containing both tiers, and must classify each file's `side`
  structurally rather than by folder convention.
- Base URLs and mount prefixes must be resolved, which is real work and will not always succeed. A
  path resolved on one side but not the other produces two nodes instead of one — a visible failure,
  reported as `frontendOnlyEndpoints` / `backendOnlyEndpoints` in the graph health section.
- A monorepo with several backends serving overlapping paths could collide on one node. Not yet
  handled; the endpoint id would need a service dimension.
- Frontend and backend in separate repositories cannot be joined at all until a cross-repository
  indexing story exists.

**We gain:**

- One traversal answers a question that spans tiers. `resolveFeaturePath('clients.create')` walks
  from a button to a controller without a special case at the network boundary.
- Endpoints observed on only one side become a _finding_: a `calls_api` with no route is a dead
  client call or a missing prefix; a route nothing calls is dead server code. The health report
  surfaces both, which is a useful side effect of doing the join at all.
- The graph mirrors how a developer already reasons about their product. Nobody debugging "New Client
  is broken" thinks in terms of two graphs.

## Relationship to ADR 0004

This join is only defensible because it is deterministic. A model asked to connect a frontend service
to a backend controller would do it by name similarity and would be confidently wrong on any codebase
that names its tiers differently. The join here is a string equality check on a normalised path,
where both normalisations are traceable to a line of source.
