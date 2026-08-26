# Things we still refuse to guess

Every pattern below appears in real code. For each one, Statewave Guide could produce a plausible
relationship — and does not, because the evidence does not support it.

This document exists because a graph is only as trustworthy as its worst edge. A user who finds one
fabricated relationship has no way to tell which of the other ten thousand are also invented, and the
whole model becomes something to double-check rather than something to rely on.

Two categories, and the difference matters:

- **Refusals on principle** — the evidence is genuinely insufficient. More engineering will not
  change these, and a rule that resolved them would be guessing.
- **Not yet supported** — safely resolvable in principle, simply not built. These are roadmap items,
  not judgements.

Both emit a diagnostic. Neither emits an edge.

---

## Refusals on principle

### A URL built by a wrapper whose body is not a plain concatenation

```ts
function buildUrl(path: string) {
  return `/api/proxy?path=${encodeURIComponent(path)}`;
}
await fetch(buildUrl('/admin/dashboard'));
```

The obvious inference — the argument is the path — produces `GET /admin/dashboard`. The application
never requests that URL. Every one of these calls hits `/api/proxy`, and the logical path travels in a
query parameter.

This is not hypothetical. It is the single most common HTTP shape in the first production codebase
this indexer was pointed at, and inferring the obvious thing would have fabricated dozens of endpoints
that do not exist.

→ `UNRESOLVED_API_PATH`

### A computed HTTP method

```ts
const method = isEdit ? 'put' : 'post';
await api[method]('/clients', payload);
```

An endpoint is a _(method, path)_ pair. Half of one is not an endpoint, and recording either branch
invents a route the code may never take.

→ `UNRESOLVED_DYNAMIC_CALL`

### A handler that arrives through an object

```tsx
<ToolbarButton action={actions.createClient} />
```

`actions` may be constructed anywhere, reassigned, or spread from props. Following the property name
into a same-named declaration elsewhere is name matching, not resolution.

→ no `invokes` edge

### A modal opened by a string key

```ts
modal.open('create-client');
```

Unless the project contains a deterministic registry mapping that string to a component, the string is
just a string. That `NewClientDialog` exists and looks related is a coincidence the indexer is not
entitled to act on.

→ `UNRESOLVED_MODAL_REGISTRY`

### A route registered under an unresolvable mount point

```ts
app.use(legacyMountPoint(), legacyRouter);   // reads the environment
legacyRouter.get('/clients', …);
```

The router's own path is known; its prefix is not. Recording it as `/clients` and merging it with a
resolved `/api/clients` would attach a controller to an endpoint it has never served. The endpoint is
kept, marked as partially resolved, and can never merge with a fully resolved one — see
[ADR 0006](adr/0006-api-endpoint-identity.md).

→ `UNSUPPORTED_ROUTING_PATTERN`, and a `partial` endpoint

### An identifier that only appears inside a string, a comment, a type or JSX text

```ts
const label = 'openCreateClient';
// POST /clients creates one
type CreateClient = () => void;
```

None of these is a reference. An indexer that matched text would find all three.

→ nothing at all

### A dynamic import followed by a namespace call

```ts
const mod = await import('./heavy');
mod.exportToCsv(clients);
```

`mod` is a resolved promise, not a static namespace. A call edge here would assert that every lazily
loaded module is statically linked — the exact assumption code splitting exists to break.

→ `UNRESOLVED_DYNAMIC_CALL`

### A permission-shaped string passed to an unrecognised function

```ts
track('clients:create');
```

Recognisers are configured by name. Treating any colon-separated string argument as a permission would
turn analytics events, feature flags and cache keys into permissions.

→ nothing

### A binding that shadows a familiar name

```ts
const navigate = useLocalStepper();
navigate('/clients');
```

The name is not the thing. Resolution follows bindings, so this is not a router call and produces no
`navigates_to`.

→ nothing

### Two candidate declarations

When a barrel re-export or a path alias yields more than one declaration for a name, the resolver
returns nothing rather than picking. A wrong resolution is worse than an absent one, and there is no
tiebreak that is not a preference dressed as a fact.

→ `UNRESOLVED_IMPORT`

### Cross-tier name similarity

A frontend `clientService.create` and a backend `createClient` are joined only by the endpoint they
both name. They are never joined because the names look alike — see
[ADR 0005](adr/0005-unified-frontend-backend-application-graph.md).

→ nothing

### A template path with a non-identifier expression

```ts
await api.get(`/clients/${filters.map((f) => f.id).join(',')}`);
```

A plain identifier segment normalises to `:param`. An arbitrary expression does not have a shape worth
recording.

→ `UNRESOLVED_API_PATH`

---

## Not yet supported

These would be safe to resolve. They are simply not built, and they are listed here so their absence
is not mistaken for a judgement.

| Pattern                                                              | Why it is safe, and what it needs                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple URL builders — `` (p) => `${BASE}${p}` ``                     | A body that concatenates only module constants and its own parameter is deterministic. Needs a narrow rule that refuses anything containing a call. |
| Manual `node:http` dispatch — `if (pathname === '/x')`               | The route table is control flow rather than a registration call. Real, but a harder analysis.                                                       |
| Serverless handler exports — `export default async function handler` | The path comes from the file's location under a convention, so it needs framework-aware path derivation.                                            |
| A dialog whose state flag lives in a custom hook                     | Identical in spirit to `state-flag-gates-element`, but the three facts span two modules.                                                            |
| Class-instance member calls                                          | Resolvable once instance bindings are tracked.                                                                                                      |
| Hook result destructuring — `const { save } = useClient()`           | Needs the hook's return shape, which is a small step beyond current resolution.                                                                     |
| Query-string stripping                                               | Distinguishing a path from its query safely is easy; deciding whether the query is part of the endpoint's identity is not.                          |

---

## How to read a gap

Every refusal above produces a counted diagnostic, so absence is visible:

```
Warnings:
  29 dynamic calls
   3 dynamic API paths
   1 unsupported routing pattern
```

And `resolveFeaturePath()` reports where a behaviour chain stopped, with the diagnostics recorded in
that file — so a short chain reads as a finding rather than a blank.

> A missing relationship is acceptable. An incorrect one is not.
