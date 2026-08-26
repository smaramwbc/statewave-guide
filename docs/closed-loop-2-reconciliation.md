# Closed Loop #2 — quality reconciliation

The Day 1 milestone finished with a benchmark that disagreed with the indexer. This document records
what changed, in which direction, and why — because the benchmark is not the source of truth. It is
an executable statement of the architecture we intend, and when adversarial testing shows an
expectation is unsafe, the expectation changes.

Every change below is classified. None of them were made to improve a percentage.

> Regenerate with `pnpm test:indexer-quality` and `pnpm test:indexer-quality:diff`.

## Before and after

```
Statewave Guide — Closed Loop #2 benchmark: PRE-FIX vs POST-FIX

Nodes
------------------------------------------------------------------------------------
  category            P before  P after     R before  R after      TP        FP        FN
  api                  19% → 100% ▲    21% →  93% ▲     3→ 14   13→  0   11→  1
  component           100% → 100%     100% → 100%      22→ 21    0→  0    0→  0
  element             100% → 100%     100% → 100%      62→ 62    0→  0    0→  0
  function             87% →  89% ▲    94% →  96% ▲   104→101   15→ 12    7→  4
  hook                 43% → 100% ▲   100% → 100%       6→  6    8→  0    0→  0
  permission          100% → 100%     100% → 100%       8→  8    0→  0    0→  0
  route               100% → 100%     100% → 100%       6→  6    0→  0    0→  0
  schema              100% → 100%     100% → 100%       8→  8    0→  0    0→  0
  service             100% → 100%     100% → 100%       6→  5    0→  0    0→  0
  type                  — →   —     100% → 100%       5→  5    —→  —    0→  0

Relationships
------------------------------------------------------------------------------------
  category            P before  P after     R before  R after      TP        FP        FN
  calls                 — →   —      95% → 100% ▲    36→ 36    —→  —    2→  0
  calls_api             0% →  83% ▲     0% → 100% ▲     0→  5    9→  1    8→  0
  contains            100% → 100%     100% → 100%      62→ 60    0→  0    0→  0
  invokes              39% → 100% ▲    43% → 100% ▲     9→ 23   14→  0   12→  0
  navigates_to         90% →  88% ▼   100% → 100%       9→  7    1→  1    0→  0
  opens               100% → 100%     100% → 100%       1→  1    0→  0    0→  0
  renders              88% → 100% ▲   100% → 100%      36→ 38    5→  0    0→  0
  requires_permission  39% →  96% ▲    53% → 100% ▲     9→ 22   14→  1    8→  0
  submits_to           50% → 100% ▲   100% → 100%       3→  6    3→  0    0→  0
  uses_hook            24% → 100% ▲   100% → 100%      10→ 10   31→  0    0→  0
  uses_service         22% → 100% ▲    45% →  79% ▲     5→ 23   18→  0    6→  6
  validates_with       82% → 100% ▲    82% → 100% ▲     9→ 11    2→  0    2→  0

Discipline
------------------------------------------------------------------------------------
  false-positive traps violated         9 →    0 of 37
  refusals correctly diagnosed         12 →   12 of 13
  relationships without evidence        0 →    0
  invalid confidence values             0 →    0
  inferences without rules              0 →    0
  graph integrity                    PASS → PASS
```

## Every expectation change, classified

### ARCHITECTURAL DECISION

**1. An endpoint's identity is its fullest provable runtime path.** (62 id changes)

The manifest spelled endpoints base-relative (`api:POST:/clients`); the indexer kept the full runtime
path (`api:POST:/api/clients`). This looked arbitrary until the fixture's own trap settled it: a
legacy router mounted at an unprovable point _also_ registers `/clients`, so under base-stripping the
resolved endpoint and the unresolvable one collide, and the graph attaches a controller to an endpoint
it has never served. Keeping the base preserves the evidence that tells them apart.

The manifest was reconciled to the indexer. Recorded in
[ADR 0006](adr/0006-api-endpoint-identity.md).

**2. Path parameters are addressed positionally in the id.**

A frontend `` `/clients/${id}` `` and a backend `/clients/:clientId` are one endpoint under every
router that exists. Keeping the declared names in the identity split it into a frontend-only node and
a backend-only node — two endpoints nobody serves. The id now uses `:param`; the declared name
survives on the node's `path`, preferring the server's spelling.

Measured: `joinedEndpoints` 7 → 8, `frontendOnlyEndpoints` 1 → 0.

**3. A router at an unprovable mount is recorded as a partial endpoint.**

`api:GET:?/clients` carries an explicit unknown-prefix marker, so it can never merge with a resolved
endpoint — collision is impossible by construction rather than by convention. Two such nodes were
added to the manifest.

### BENCHMARK BUG

**4. The trap checker matched ids instead of provenance.** (mine, not the manifest's)

The manifest states its traps as _"must not gain a provenance here"_ — a real endpoint may exist, it
simply must not be sighted at a documentation string that happens to spell it. My checker compared
ids alone, so after change (1) it reported legitimate endpoints as trap violations. Corrected to test
evidence location.

Measured: 9 violations → **0 of 37**.

**5. The manifest was incomplete in three places.** (33 edges added, each verified)

- `uses_service` × 18 — backend controllers genuinely import and call their service; only the
  frontend side was listed
- `renders` × 5 — `App.tsx` names page components inside `<Route element={…}>`; both the
  `route → page` and `App → page` edges are true
- `submits_to` × 3 — the behaviour spec mandates a component-sourced edge alongside the
  element-sourced one, so a chain can continue when the form carries no `data-guide`
- `requires_permission` × 5 — `settingsRouter.use(requirePermission(…))` applies to every
  registration after it, a `PermissionGate` wraps the invoice form, and the legacy router carries its
  own guard
- `invokes` × 2 — the legacy router's handlers, on the partial endpoint

Every one was verified by script before being added: the evidence file and line must exist and
contain what the entry claims. 26 + 7 candidates, 33 verified, 0 unverifiable.

**6. Ambiguity exclusion was asymmetric.** Excluding a found item while keeping its expected
counterpart converts a false positive into a false negative. Now driven by the ids named in each
entry's `acceptableOutcomes` and applied to both sides.

### SCOPE CHANGE

**7. Built-in framework hooks are scored separately, not removed.**

`useState` and `useEffect` are real nodes and `HookNode.builtin` exists precisely so they can be told
apart. But they are _framework implementation_ knowledge, not _product_ knowledge: that a component
calls `useState` says nothing about the product, while `usePermissions` says a great deal. Averaging
them together let 31 uncontroversial React hooks bury the handful of project hooks that matter.

They now get their own reported row and are excluded from the product scores. **No behaviour changed
to achieve this** — the nodes and edges are still emitted.

Measured: `hook` 43% → 100% precision, `uses_hook` 24% → 100%, with 8 nodes and 31 edges reported
separately.

**8. Service-member naming declared ambiguous.**

`export const invoiceService = { list, create }` aggregates functions declared at module scope. The
declaration is `function list()`; the function is also reached as `invoiceService.list`. Addressing it
either way is defensible, so the fixture now asserts neither and the ids are excluded from scoring in
both directions.

### IMPLEMENTATION BUG

**9. The feature-path walk stopped one hop short of the endpoint.**

`uses_service` outranked `calls`, and a `uses_service` edge points at the service _object_, which has
no outgoing behaviour. The chain stranded there. Worse, the test that covered it was named "…and
reaches the endpoint behind it" while asserting a chain that reached no endpoint at all.

Then `calls` outranked `calls_api`, so once fixed the walk descended into shared utilities
(`unwrap(response)`) instead of reaching the request. Order is now
`invokes → opens → renders → submits_to → calls_api → calls → uses_service → navigates_to`.

**10. `gap.relatedDiagnostics` only covered the terminal node's file.**

The walk is greedy and follows one branch, so a function that calls something resolvable _and_
something refused gets walked down the resolvable side — and the refusal, which is exactly what a
developer needs to see, never surfaced. Diagnostics now span every file the chain passed through.

## What this bought

The demo's flagship path now reconstructs end to end, across the network boundary:

```
element:clients.create
  ↓ invokes      openCreateClient                [1.0]
  ↓ opens        NewClientDialog                 [0.9]
  ↓ submits_to   submitClient                    [1.0]
  ↓ calls        clientService.create            [0.95]
  ↓ calls_api    POST /api/clients               [0.9]
  ↓ invokes      createClient         (backend)  [0.9]
  ↓ calls        clientService.create (backend)  [0.95]
```

## Known remaining gaps

Stated plainly rather than rounded away.

| Category                                      | Gap                                                                                       | Status                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| `uses_service` recall 79%                     | 6 expected edges not produced                                                             | open                        |
| `function` precision 89%                      | 12 unlisted nodes — hooks are dual-represented as functions by design, plus local helpers | mostly scope                |
| `api` recall 93%                              | 1 endpoint reached only through a stretch hop (client via constructor default)            | known                       |
| `navigates_to` precision 88%                  | 1 unlisted edge                                                                           | open                        |
| `calls_api` / `requires_permission` precision | 1 unlisted edge each                                                                      | open                        |
| refusals diagnosed                            | 12 of 13                                                                                  | one shape not yet diagnosed |
| stretch goals                                 | 3 of 19 reached                                                                           | not required                |

`calls` precision is deliberately unscored: the manifest lists a selection of call edges rather than
all of them, and computing precision against a partial expected set would invent a number.

## Determinism

Re-verified across working directories, not merely repeated runs — the earlier claim was true only
for repeated runs from one directory, which is a weaker property than it sounded.

```
8 working directories → 1 unique hash
```
