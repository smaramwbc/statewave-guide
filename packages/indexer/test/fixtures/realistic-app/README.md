# `realistic-app` — the indexer's benchmark fixture

A two-package application that is never built and never run. It exists to be **parsed**, and it is
written the way an application someone actually maintains is written: pages import components which
import primitives, services share one HTTP client, controllers delegate to services, hooks wrap
services, and a fair amount of it is shaped so that a naive extractor gets it wrong.

`expectations.json` beside this file is the ground truth. It is the more important of the two
deliverables: the source only matters because the manifest says what the source means.

---

## What this fixture proves

**1. The frontend/backend join.** One `data-guide` element in a page can be traced through a
handler, a dialog, a form, a service and an HTTP call to the Express route that answers it, the
controller that runs, and the permission that gates both ends — because the frontend and the backend
independently arrive at the same `api:POST:/clients` node.

```
route:/clients                                          App.tsx
  renders     ClientsPage                               pages/ClientsPage.tsx
  contains    element:clients.create                    <Button data-guide="clients.create">
  invokes     openCreateClient                          onClick={openCreateClient}
  opens       NewClientDialog                           setIsCreateOpen(true) gates <NewClientDialog/>
  renders     ClientForm                                components/NewClientDialog.tsx
  submits_to  submitClient                              onSubmit={handleSubmit(submitClient)}
  calls       clientService.create                      via `const create = clientsApi.create`
  calls_api   api:POST:/clients            ◄────────────┐  services/clientService.ts
                                                        │
  invokes     createClient (controller)    ◄────────────┘  routes/clients.ts
  calls       clientService.create (backend service)       controllers/clientController.ts
  requires_permission  permission:clients:create           requirePermission('clients:create')
```

The last hop matters twice: `element:clients.create` is gated by
`<PermissionGate permission={Permissions.ClientCreate}>` on the frontend and the endpoint is gated by
`requirePermission('clients:create')` on the backend, and both land on `permission:clients:create`.

**The join has to be earned twice, in opposite ways.** On the `/clients` side both packages spell
`clientService.create`, which is a *trap*: if node ids stopped carrying the path, a UI call and a
database write would become one fact. On the `/invoices` side nothing survives the hop — the
frontend calls `invoiceService.create` and the backend declares `invoiceRepository.insert`, in a file
with a different basename, behind a controller whose name lines up with neither. `api:POST:/invoices`
can only be reached by composing the mount point with the registration and matching the *path*. An
indexer that joins the two sides by member name scores the first case and fails the second, which is
the point of having both.

**2. That the indexer refuses to guess.** Roughly a fifth of this fixture is patterns whose meaning
is genuinely not in the syntax. Each one is classified in `expectations.json` as *resolves*, *does
not resolve*, or *ambiguous*, with the reason written down.

**3. That it does not hallucinate.** A second set of patterns looks exactly like a relationship and
is not one — a function name inside a string, an endpoint in a JSDoc block, a component named after
a route that calls nothing. Those are `mustNotExist` entries: finding one is a false positive, and
false positives from a deterministic layer are worse than gaps, because they arrive wearing the
authority of static analysis.

---

## Path normalisation — the one convention you must know

The frontend axios client is created with `baseURL: '/api'`:

```ts
// frontend/src/lib/http.ts
export const API_BASE_URL = '/api';
export const api: AxiosInstance = axios.create({ baseURL: API_BASE_URL, /* … */ });
```

The backend declares the same prefix and mounts its routers under it:

```ts
// backend/src/server.ts
export const API_PREFIX = '/api';
app.use(API_PREFIX, clientsRouter);              // routes written as '/clients'
app.use(`${API_PREFIX}/invoices`, invoicesRouter); // routes written as '/' and '/:invoiceId/pdf'
app.use(API_PREFIX, settingsRouter);
```

**The canonical path of an endpoint is its runtime path with the API base removed.**

| Side     | Written as                                   | Runtime path            | Canonical node            |
| -------- | -------------------------------------------- | ----------------------- | ------------------------- |
| frontend | `api.post(CLIENTS_PATH, draft)`              | `POST /api/clients`     | `api:POST:/clients`       |
| backend  | `app.use('/api', …)` + `router.post('/clients', …)` | `POST /api/clients` | `api:POST:/clients`       |
| frontend | ``api.get(`/clients/${clientId}`)``          | `GET /api/clients/123`  | `api:GET:/clients/:clientId` |
| backend  | `router.get('/clients/:clientId', …)`        | `GET /api/clients/123`  | `api:GET:/clients/:clientId` |
| frontend | `api.get(INVOICES_PATH)`                     | `GET /api/invoices`     | `api:GET:/invoices`       |
| backend  | `app.use('/api/invoices', …)` + `router.get('/', …)` | `GET /api/invoices` | `api:GET:/invoices`   |

Three consequences worth stating explicitly:

- **Interpolated segments become `:param`**, named after the expression where the source gives a
  name. `` `/clients/${clientId}` `` and `'/clients/:clientId'` are the same node.
- **A backend path outside the API base is recorded verbatim.** `app.get('/healthz', …)` is
  `api:GET:/healthz`, never `api:GET:/api/healthz`, and it can never join a frontend call.
- **A route path is not an API path.** `<Route path="/clients">` and `api.get('/clients')` share a
  string and nothing else. Neither may contribute a provenance to the other's node.

---

## Layout

```
realistic-app/
  README.md                    this file
  expectations.json            the ground truth manifest
  verify-expectations.mjs      re-checks every line reference in the manifest (no dependencies)
  frontend/
    package.json  tsconfig.json           jsx: react-jsx, strict: true
    src/
      main.tsx  App.tsx                   entry point and the react-router route table
      pages/                              5 pages, one per route
      components/                         custom UI, including primitives/ that wrap intrinsics
      hooks/                              useClients, useInvoices, useDialog, useDebouncedValue
      services/                           clientService (object literal), invoiceService (shorthand),
                                          settingsService (class), index.ts (re-export barrel)
      lib/                                the axios client, constants, formatting, a lazy module,
                                          endpoints.ts (an endpoint table), legacy-format.ts (which
                                          re-declares two names that exist elsewhere)
      permissions/                        Permissions, hasPermission, PermissionGate, SessionContext
      types/                              domain types
  backend/
    package.json  tsconfig.json           no jsx, strict: true
    src/
      server.ts                           mount points, the API prefix
      routes/                             Express routers: one plain, one collection-relative, one
                                          guarded at the router level, one with an unknowable mount
      controllers/                        HTTP handlers that delegate to services
      services/                           persistence: clientService (name-identical to the
                                          frontend's), invoiceRepository (name-disjoint from it),
                                          settingsStore (not named *Service at all)
      validation/                         zod schemas
      middleware/                         requirePermission, validate, asyncHandler, errorHandler
      lib/                                db helpers, the server's copy of the permission vocabulary
```

Nothing is installed. `react`, `axios`, `express`, `zod` and friends are bare specifiers that do not
resolve, which is fine — the indexer is syntax-only, and it means the fixture also exercises
"an import that leaves the project".

One thing this layout does **not** prove: `frontend/src/components/__tests__/ClientForm.test.tsx` is
excluded by the `**/*.test.*` glob, not by the directory it sits in. `**/__tests__/**` and
`**/__mocks__/**` are absent from `DEFAULT_EXCLUDE` in `packages/indexer/src/config.ts`, so a
`__tests__/renderWithProviders.tsx` or a `ClientForm.stories.tsx` carrying the same semantic ids
would reach the graph and make every element id in the application ambiguous. That is a finding
about the defaults, not a fixture defect, so it is written down rather than staged as a trap the
shipped configuration cannot pass.

---

## Reading `expectations.json`

| Section              | Meaning                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `canonicalApiBase`   | `/api`. The prefix stripped from both sides.                                          |
| `notes`              | The normalisation and confidence rules, in prose.                                     |
| `exhaustiveness`     | Which node kinds and relationship types the manifest claims to list *completely*. Recall may only be scored against complete kinds. |
| `nodes`              | Every node, by kind, with the file, line and the exact source text at that line.       |
| `relationships`      | Every edge, with `why`, `expectedConfidence`, `expectedRule`, `tier` and one evidence location. |
| `expectedUnresolved` | Things the indexer must *fail* to resolve, and the diagnostic it should emit saying so. One representative site per *shape*; emitting the same diagnostic at the other structurally identical sites is correct output, and `exhaustiveness.diagnostics` lists where they are. |
| `expectedDiagnostics`| Things that resolve **and** diagnose. A duplicate element id produces one node *plus* `DUPLICATE_ELEMENT_ID`; filing that under `expectedUnresolved` — which means "must fail to resolve" — penalised a correct indexer, so it lives here. |
| `mustNotExist`       | Nodes and edges that must never appear. Each one is a false positive if found.         |
| `ambiguous`          | Cases with more than one defensible answer. Scored neither way; listed so nobody "fixes" them by accident. |

### `mustNotExist` has a schema, and `verify-expectations.mjs` checks it

Every entry carries `kind`. A **node** entry carries `idLike`, a canonical node id; `*` is legal only
in the method position of an `api:` id and means "under any method". A **relationship** entry carries
`type` and canonical `sourceLike`/`targetLike` ids — never a bare name and never a file path.

10 entries name an id the manifest also *declares*. Those carry `extra`, which says what is
forbidden — usually "must not gain a provenance here". An id appearing in `mustNotExist` is never on
its own a reason to drop the node.

### Confidence policy

Only three values are ever correct, and which one applies is mechanical:

| Value  | When                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| `1.0`  | Source and target are in one module, or the whole fact is one JSX expression.     |
| `0.95` | The hop crossed a module boundary and resolved to exactly one declaration.        |
| `0.9`  | Several facts were combined under a named `InferenceRule`.                        |

### Tiers

- **`core`** — must be found. These are the edges recall is scored on.
- **`stretch`** — a capable indexer should find it. Credit for finding it, no penalty for missing it.
  Every stretch edge names the extra hop that makes it hard.

### `ruleGap`

Some edges have `"expectedRule": null` and a `"ruleGap"` naming a rule that does **not** exist in the
`InferenceRule` union yet: `template-path-route-match`, `hook-result-destructuring`,
`hook-result-member-call`, `class-instance-member-call`, `fetch-call-endpoint`, `injected-http-client`,
`query-string-stripping`, `endpoint-table-indirection`, `router-level-middleware`,
`permission-array-argument`. Those are findings about the vocabulary, not defects in the fixture.
Three `expectedUnresolved` entries likewise have `"expectedDiagnostic": null`, because no member of
`IndexerDiagnosticCode` covers a `data-guide` whose value is not a literal — that gap is real and the
fixture is where it shows up.

### What `complete` does and does not license

`exhaustiveness` is scoped, not a blanket claim, because `complete` and `ambiguous` cannot both apply
to the same id. Three kinds carry named exceptions:

- **`element`** — complete except `element:client-detail.delete-dialog`, which is `ambiguous`.
- **`api`** — complete for endpoints reachable from a **core** edge. `api:POST:/settings/api-key/rotate`
  is reachable only through a stretch hop and `api:GET:/healthz` is `ambiguous`; neither may cost api
  recall.
- **`function`** — complete for the listed forms, with the shorthand-service member ids
  (`#invoiceService.list` and its two siblings) `ambiguous` as to *naming*. Those three ids are the
  endpoints of five core edges, so an indexer that addresses them as `#list` must be matched through
  the mapping rather than scored as five misses.

`calls` is a **selection**, not a set: one representative edge per (calling module, callee) pair plus
every service-member call. `hasPermission` has three call sites and `db#query` eleven, and listing
them all proves nothing new — so **recall must not be computed for `calls`**. A number derived from
that list measures how many representatives were picked.

---

## Adversarial patterns

Every one of these is in the source on purpose. "Resolves" means the manifest asserts an edge or a
node; "Does not" means the manifest asserts its absence and (usually) a diagnostic.

| # | Pattern | Where | Resolves? | Why |
|---|---------|-------|-----------|-----|
| 1 | Identifier bound in a `useCallback` body — `const openCreateClient = useCallback(() => { setIsCreateOpen(true); }, [])` | `pages/ClientsPage.tsx` | **Yes**, 1.0 | The memo wrapper changes nothing: the handler is still a named binding in this module, and `onClick` still names it. |
| 2 | Aliased service member behind a **renamed import** — `import { clientService as clientsApi }` then `const create = clientsApi.create` | `components/ClientForm.tsx` | **Yes**, 0.95 | Bound once, at module scope, never reassigned. Nothing in the file spells `clientService`, so the edge exists only if the `as` binding is followed back to its declaration. |
| 3 | Permission from a const object — `permission={Permissions.ClientCreate}` | `pages/ClientsPage.tsx` | **Yes**, 0.9 | `Permissions` is a module-scope `as const` literal, so the member read has exactly one value. |
| 4 | Module constant path, same module — `const CLIENTS_PATH = '/clients'; api.post(CLIENTS_PATH, …)` | `services/clientService.ts` | **Yes**, 0.9 | `module-constant-string`. Nothing leaves the file. |
| 5 | Module constant path, imported — `import { INVOICES_PATH }` then `api.get(INVOICES_PATH)` | `services/invoiceService.ts` | **Yes**, 0.9 | Two rules chained: resolve the import to one const, then read its literal initialiser. |
| 6 | Template path with a variable segment — ``api.get(`/clients/${clientId}`)`` | `services/clientService.ts` | **Shape only**, 0.9 | The path *shape* is knowable and normalises to `/clients/:clientId`. The concrete id never is, and is not recorded. |
| 7 | Template mixing a constant and a variable — ``api.put(`${CLIENTS_PATH}/${clientId}`)`` | `services/clientService.ts` | **Yes**, 0.9 | Constant resolves, interpolation becomes `:clientId`. |
| 8 | Handler through a **computed** member read whose key names nothing — `const label = 'openCreateClient'` … `action={handlers[label] ?? startClientCreation}` | `pages/DashboardPage.tsx` | **No** | The key is a module constant that matches no member of `handlers`, so the value at the site is the fallback and no single function is named. The key spells a function declared in `ClientsPage` and never imported here, which is the false positive it exists to provoke. `UNRESOLVED_DYNAMIC_CALL`. |
| 9 | Handler on a non-handler prop, direct identifier — `action={goToClients}` **and** `action={goToInvoices}` | `pages/DashboardPage.tsx` | *Ambiguous*, **both lines** | Only the prop *name* stands in the way. An indexer with a configurable handler-prop list is right to resolve them; one keyed on `/^on[A-Z]/` is right to refuse. Both adjacent lines are listed: exempting one and scoring the other as a false positive was a defect. |
| 10 | Computed method name from a **parameter** — `async save(patch, clientId, method) { api[method](path, patch) }` | `services/clientService.ts`, reached from `ClientDetailPage` | **No** | The verb is not a fact this module holds at all: callers pass `'patch'`, which no route serves. Not a two-armed ternary that could be folded into two endpoints. `UNRESOLVED_DYNAMIC_CALL` — and it sits on a **live** chain (`client-detail.change-plan` → `changePlan` → `save`), so the gap is reported in a flow a user can walk rather than on dead code. |
| 11 | Dynamic import then namespace call — `const mod = await import('../lib/heavy'); mod.exportToCsv(clients)` | `pages/ClientsPage.tsx` | *Ambiguous* | The specifier is a literal and `mod` is bound once, which is exactly the reasoning that *requires* two other resolutions here (the star-export barrel, and `const create = clientsApi.create`). Refusing to follow a resolved dynamic import one module further is a defensible policy about code splitting — a policy, not a fact about the syntax — so the fixture asserts neither. |
| 12 | Re-export barrel — `export * from './clientService'` | `services/index.ts` | **Yes**, 0.95 | Resolution must follow the star export. Stopping at the barrel loses every service edge reached through `../services`. |
| 13 | Router path from a module constant — `router.get(CLIENT_BY_ID, …)` | `backend/routes/clients.ts` | **Yes**, 0.9 | Same rule as (4), on the server. Three registrations share the constant. |
| 14 | Router mounted at a template — ``app.use(`${API_PREFIX}/invoices`, invoicesRouter)`` | `backend/server.ts` | **Yes**, 0.9 | `API_PREFIX` is a module constant, so the mount point composes with `'/'` to `/api/invoices` → `/invoices`. |
| 15 | Router mounted at a function return — `app.use(legacyMountPoint(), legacyRouter)` | `backend/server.ts` | **No** | `legacyMountPoint()` reads `process.env`. Every route on that router is therefore path-less. `UNRESOLVED_API_PATH`. |
| 16 | Collection-relative registration — `invoicesRouter.get('/', …)` | `backend/routes/invoices.ts` | **Yes**, 0.9 | `'/'` is `GET /invoices`, not `GET /`. Only mount-point composition gets this right. |
| 17 | Router exported under another name — `export { router as clientsRouter }` | `backend/routes/clients.ts` | **Yes**, 0.95 | The alias is part of the import graph; `server.ts` imports the new name. |
| 18 | Native form — `<form onSubmit={saveSettings}>` | `pages/SettingsPage.tsx` | **Yes**, 1.0 | One expression, one module, one identifier. |
| 19 | React-Hook-Form wrapper — `<form onSubmit={handleSubmit(submitClient)}>` | `components/ClientForm.tsx` | **Yes**, 0.9 | `form-submit-wrapper`: it costs one extra fact (that `handleSubmit` came from `useForm`), so it is an inference, not direct syntax. |
| 20 | `useState` flag gates a dialog — `setIsCreateOpen(true)` … `{isCreateOpen ? <NewClientDialog/> : null}` | `pages/ClientsPage.tsx` | **Yes**, 0.9 | `state-flag-gates-element`. Setter, flag and gated element are all in one component. |
| 21 | Dialog flag owned by a hook — `const confirmDelete = useDialog(); … open={confirmDelete.isOpen}` | `pages/ClientDetailPage.tsx` | *Ambiguous* | Same user-visible behaviour as (20), one module further away, and the dialog is always rendered rather than gated. `state-flag-gates-element` genuinely does not apply. |
| 22 | Destructured hook result used as a handler — `onClick={() => void reload()}` | `pages/ClientsPage.tsx` | **Stretch**, 0.9 | Reaching `useClients`'s `reload` means understanding the object the hook returns. Worth doing, not required. |
| 23 | Class service with an injected client — `constructor(private readonly client = api)` then `this.client.get(…)` | `services/settingsService.ts` | **Stretch**, 0.9 | `http-client-member-call` covers a *module-scope* client binding. Proving `this.client` is `api` is one hop further. |
| 24 | Raw `fetch` with the base URL spelled out — ``fetch(`${API_BASE_URL}${CLIENTS_PATH}/${clientId}/audit`)`` | `services/clientService.ts` | **Stretch**, 0.9 | Not the axios client, and the method is implicit `GET`. This is the only frontend call site where the base URL is composed rather than implied. |
| 25 | Class instance alias — `export const settingsService = new SettingsService()` | `services/settingsService.ts` | **Stretch**, 0.9; the *instance node* is *ambiguous* | Callers write `settingsService.load()`; the declaration is `SettingsService.load`. This manifest gives the class the service node and the instance none. Recording the instance as a second service node is what a caller-addressed graph would do, and `service` claims completeness, so it must not be scored as an undeclared node. |
| 26 | Shorthand-aggregated service — `export const invoiceService = { list, create, markPaid }` | `services/invoiceService.ts` | **Yes**, member naming *ambiguous* | It is a service by shape. Whether the member node is `#invoiceService.list` (as recorded here) or `#list` plus a mapping is a naming choice, not a correctness one. |
| 27 | `data-guide` on a wrapping component — `<Button data-guide="clients.create">` rendering `<button {...rest}>` | `components/primitives/Button.tsx` | **Yes**, 1.0 | The element is recorded at the usage site with `tagName: "Button"`. The inner `<button>` carries no literal attribute and must **not** produce a second element — `mustNotExist[30]`. |
| 28 | Identifier guide id — `data-guide={guideId}` | `components/primitives/Dialog.tsx` | **No** | There is no semantic id here to record. `element:guideId` must never exist — `mustNotExist[16]`, evidenced by the attribute itself rather than by the comment that describes it. |
| 29 | Template guide id — ``data-guide={`invoices.list.${invoice.status}`}`` | `components/InvoiceList.tsx` | **No** | As many ids as the interpolation has values, so it names no element. |
| 30 | Literal guide id forwarded on a prop — `guideId="client-detail.delete-dialog"` | `components/ConfirmDeleteDialog.tsx` | *Ambiguous* | The literal is here, the attribute is in `Dialog`. Following a single-valued prop is defensible; refusing is defensible. Inventing `element:guideId` is not. |
| 31 | One id inside `.map()` — `<tr data-guide="clients.table.row">` | `components/ClientTable.tsx` | **Yes**, one node | A semantic id names a *kind* of element, not an instance. One node, however many rows render. |
| 32 | The same id twice in one file — `data-guide="settings.save"` in the form and in the sticky footer | `pages/SettingsPage.tsx` | **Yes**, one node **+ diagnostic** | `DUPLICATE_ELEMENT_ID`. Keeping the first silently would make the id ambiguous at runtime, where it is the join key. It lives in **`expectedDiagnostics`**, not `expectedUnresolved`: it resolves, and a section that means "must fail to resolve" scored a correct indexer as wrong. |
| 33 | Invalid id — `data-guide="Dashboard.Docs"` | `pages/DashboardPage.tsx` | **No**, **+ diagnostic** | Capitals violate `GUIDE_ELEMENT_ID_PATTERN`. `INVALID_ELEMENT_ID`, and no node. |
| 34 | Legacy attribute — `data-ai-id="settings.danger-zone"` | `pages/SettingsPage.tsx` | **Yes**, 1.0 | Still a recognised guide attribute; the node records which one declared it. |
| 35 | `forwardRef`-wrapped component — `export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(…))` | `components/primitives/TextField.tsx` | **Yes** | A component declaration wrapped in a call is still a component declaration. |
| 36 | Component declared after use — `Toolbarish` | `pages/ClientDetailPage.tsx` | **Yes**, 1.0 | Hoisting is not the indexer's problem; the declaration is in the same module. |
| 37 | Identical names on both sides — `clientService.create` exists in the frontend *and* the backend | `frontend/src/services/`, `backend/src/services/` | **Yes**, two nodes | Node ids carry the path. If these collapse into one, a UI call and a database write become the same fact. |
| 38 | Endpoint outside the API base — `app.get('/healthz', …)` | `backend/server.ts` | *Ambiguous* | Recorded verbatim as `api:GET:/healthz` here. Omitting it is acceptable; recording it as `/api/healthz` is not. `exhaustiveness.api` names it as an exception, so omitting it costs no recall. |
| 39 | Query string in a navigation target — ``navigate(`/invoices?highlight=${invoice.id}`)`` | `pages/ClientDetailPage.tsx` | **Stretch**, 0.9 | The query string is not part of the route path. |
| 40 | Dynamic link target — `<Link to={backTo}>` | `pages/ClientDetailPage.tsx` | **No** | Read from history state. The `?? '/clients'` fallback is one of two possible values, not the value. `UNRESOLVED_DYNAMIC_ROUTE`. |
| 41 | Prop-bound handlers — `onClick={onCancel}`, `onClick={() => onOpen(client)}` | `ClientForm`, `ClientTable`, `ConfirmDeleteDialog` | **No** | The value is decided by whichever parent renders the component. Syntax in the file cannot name it. |
| 42 | Endpoint inside a wrapper call — `return unwrap(api.get(CLIENTS_PATH, …))` | every frontend service | **Yes**, 0.9 | The call carrying the path is an *argument*, not the outer callee. An extractor that only inspects top-level callees finds `unwrap` and no endpoints at all. |
| 43 | Handler chosen among several router arguments — `router.post('/clients', requirePermission('clients:create'), createClient)` | `backend/routes/clients.ts` | **Yes**, 0.95 | The handler is the last argument; the middleware in between is a permission fact, not a handler. |
| 44 | Validation in middleware vs in the controller | `routes/invoices.ts` vs `controllers/clientController.ts` | **Yes**, both, 0.95 | `validates_with` hangs off the endpoint when validation is route middleware and off the handler when it is a `.parse()` call. Both placements are in the fixture. Four handlers in `clientController.ts` parse the *same* schema with byte-identical lines, so the four edges are only distinguishable by which brace-matched body the evidence falls in. |
| 44a | Bare specifiers that do not resolve — `import axios from 'axios'` | everywhere | *Ambiguous* | Nothing is installed, by design. Reporting every library import as `UNRESOLVED_IMPORT` at info severity is defensible but noisy; suppressing non-relative specifiers is equally defensible. |
| 45 | A service not named `*Service` — `export const settingsStore = { … }` | `backend/services/settingsStore.ts` | **Yes** | A thing is a service because of its shape. `nameSuggestsService` is metadata and never sufficient. |
| 46 | **Duplicate exported name** — `formatDate` is declared in `lib/format.ts` *and* `lib/legacy-format.ts`, with different output | `components/InvoiceList.tsx` imports both | **Yes**, 0.95, two nodes | Reached as `formatDate` and `formatDate as formatIsoDate` in one file. A resolver that maps a bare name to "the one file that declares it" picks whichever it saw first. Only the import graph separates them. |
| 47 | **Kind collision** — `ClientTable` is a component in `components/` and a plain function in `lib/legacy-format.ts` | both | **Yes**, two distinct ids | `component:…/ClientTable.tsx#ClientTable` and `function:…/legacy-format.ts#ClientTable`. Ids that differ only by kind must stay apart. |
| 48 | **Shadowed identifier** — a local `const settingsService = { load: … }` inside `loadOffline`, shadowing the module import | `pages/SettingsPage.tsx` | **No** | The names have nothing to do with each other. A `calls` edge here is a scope-table bug, and it is the classic symbol-table failure. |
| 49 | **Options-object request** — `api.request({ method: spec.method, url: spec.path, data: body })` | `lib/endpoints.ts` | **No** at this site; **stretch** through the spec | Nothing at the call site names either half of an endpoint. `http-client-member-call` keys on the method name and drops this shape *silently*, which is worse than a diagnostic: the manifest requires `UNRESOLVED_API_PATH`. |
| 50 | **Endpoint described in a table** — `endpoints.createClient = { method: 'post', path: '/clients' }`, then `callEndpoint(endpoints.createClient, draft)` in a third module | `lib/endpoints.ts`, `services/clientService.ts` | **Stretch**, 0.9 | The path is assembled in one module, the request is issued in another, and the service member that owns the endpoint mentions neither. `ruleGap: endpoint-table-indirection`. |
| 51 | **Configured HTTP path** — `api.get(readExportPath())`, where the helper returns `window.exportPath ?? '/clients/export.csv'` | `lib/endpoints.ts` | **No** | The fallback is one of two possible values, not the value — the same reasoning as `backTo`. This is what `UNRESOLVED_API_PATH` is for: an HTTP *call* with an unknowable path. |
| 52 | **Router-level guard** — `settingsRouter.use(requirePermission('settings:read'))` above two bare registrations | `backend/routes/settings.ts` | **Stretch**, 0.9 | `GET /settings` carries a permission its own line never names. The fact is the *order* of two statements. `ruleGap: router-level-middleware`. |
| 53 | **Public route** — `settingsRouter.get('/settings/schema', getSettingsSchema)` registered *before* the guard | `backend/routes/settings.ts` | **Yes**, and **no** `requires_permission` edge | Not every endpoint has a permission. A rule that never fails is a rule that tests nothing, so one route is deliberately unguarded — and it is unguarded only because of where it sits relative to the `use`. |
| 54 | **`asyncHandler`-wrapped handler** — `settingsRouter.put('/settings', …, asyncHandler(updateSettings))` | `backend/routes/settings.ts` | **Yes**, 0.95 | The last argument is a *call*, not an identifier. `router-handler-identifier` has to look one level in. Near-universal in real Express. |
| 55 | **Two permissions from an array** — `requireEveryPermission([Permissions.InvoiceRead, Permissions.ClientRead])` | `backend/routes/invoices.ts` | **Stretch**, 0.9, **two edges** | An extractor that reads the first argument, or the first array element, records half the guard. `ruleGap: permission-array-argument`. |
| 56 | **Template permission** — `requirePermission(\`${scope}:read\`)` where `scope` reads `process.env` | `backend/routes/legacy.ts` | **No** | Resolving the module constant yields the *default*, which is a deployment's choice. `UNRESOLVED_PERMISSION`. |
| 57 | **Name-disjoint backend layer** — frontend `invoiceService.{list,create}` vs backend `invoiceRepository.{findPage,insert}`, behind `listInvoices`/`createInvoice` | `frontend/services/invoiceService.ts`, `backend/services/invoiceRepository.ts` | **Yes**, join through the path only | Nothing survives the hop: not the basename, not the const, not one member name, and the controller/service naming is not mechanical either. `api:POST:/invoices` is reachable only by composing the mount point with `'/'`. |
| 58 | **Path parameter named differently on the two sides** — `` `/clients/${id}` `` vs `'/clients/:clientId'` | `services/clientService.ts`, `backend/routes/clients.ts` | *Ambiguous* | A path parameter is identified at runtime by its *position*; the normalisation rule names it after the expression. This manifest records one node, matched positionally. Two nodes that fail to join is the other defensible reading. |
| 59 | Barrel's **second** star export — `import { invoiceService } from '../services'` | `pages/InvoicesPage.tsx` | **Yes**, 0.95 | `services/index.ts` has three `export *` lines. A resolver that follows only the first finds `clientService` and stops. |

---

## False-positive traps

**This table is the whole of `mustNotExist`, one row per entry, numbered by array index.** Every row
is an entry and every entry is a row; if you add one, add the other. (An earlier revision claimed the
same and listed 15 rows against 27 entries, with five traps documented only in the adversarial table
above and one — the inner `<button>` in `Button.tsx` — asserted in prose and in no entry at all.)

Two traps that could not fire were repaired rather than kept. A dead `export const
DRAFT_STORAGE_KEY` with zero references gave `module-constant-string` nothing to resolve, and a
`CreateClientButton` whose body was a single `<span>` gave a `calls` assertion no callee to
mis-resolve. Both now have a use site and a call expression, so both are refutable.

One candidate did not survive triage and is in `ambiguous` instead: a literal `data-guide` written
*before* `{...rest}` in `ToolbarButton`, which every call site overrides. Knowing that means reading
every caller's props, and asserting its absence would penalise an indexer for following adversarial
rule 27. Recording it and refusing to are both defensible; the fixture asserts neither.

| # | Trap | Where | Must not exist | Why it is not a relationship |
|---|------|-------|----------------|------------------------------|
| 0 | `const label = 'openCreateClient'`, used as `action={handlers[label] ?? …}` | `frontend/src/pages/DashboardPage.tsx:31` | `invokes` `element:dashboard.new-client` → `openCreateClient` | a module constant that spells a function declared in ANOTHER page and never imported here. It is used as a lookup key on a handler prop, so an indexer that matches string contents against declarations elsewhere has a place to go wrong. |
| 1 | `API_DOCS_HINT = 'POST /clients creates one; GET /clients lists them'` | `frontend/src/lib/constants.ts:28` | `api:POST:/clients`<br>*must not gain a provenance here* | an endpoint written in prose. A documentation string is not a call site. |
| 2 | `const docs = 'POST /clients creates one'` | `frontend/src/pages/DashboardPage.tsx:34` | `api:POST:/clients`<br>*must not gain a provenance here* | the same prose repeated in a page module. |
| 3 | `DRAFT_STORAGE_KEY = 'draft:/clients'`, passed to `sessionStorage.setItem(…)` | `frontend/src/components/ClientForm.tsx:51` | `api:*:/clients` | a storage key that starts with 'draft:' and happens to contain a path. It is now *used* — passed to sessionStorage as the argument of a member call, structurally identical to api.get(CLIENTS_PATH) — so `module-constant-string` has something to fire on and must not. Slashes do not make a URL. |
| 4 | `TOKEN_STORAGE_KEY = 'statewave/session/token'`, read by `localStorage.getItem(…)` | `frontend/src/lib/http.ts:21` | `api:*:/statewave/session/token` | a slash-separated storage key. Slashes do not make a path. |
| 5 | `HELP_URL = 'https://docs.example.com/clients'` | `frontend/src/lib/constants.ts:38` | `route:https://docs.example.com/clients` | an external documentation URL. Not a route of this application. |
| 6 | `<a href={HELP_URL} data-guide="nav.help">` | `frontend/src/components/AppNav.tsx:22` | `navigates_to` `element:nav.help` → _(any target)_ | nav.help points at an absolute external URL, so it navigates to no route in this application. |
| 7 | `CreateClientButton` — its one call expression goes to a local text helper | `frontend/src/components/CreateClientButton.tsx:22` | `calls` `CreateClientButton` → `clientService.create` | the module's one call expression goes to a local text helper. A component named after an endpoint is still just a component, and the callee is the identifier before the parentheses, not the name of the function it sits in. |
| 8 | `CreateClientButton` — a component named after an endpoint | `frontend/src/components/CreateClientButton.tsx:21` | `api:POST:/clients`<br>*must not gain a provenance here* | a component named after an endpoint is still just a component. |
| 9 | `clients.create`, where `clients` is an object of strings | `frontend/src/pages/DashboardPage.tsx:37` | `function:frontend/src/pages/DashboardPage.tsx#clients.create` | `clients` is an object whose members are strings, so `clients.create` is a property read and not a function. There is no call expression here at all, which is why this is a node assertion: the failure mode is a shape detector that registers object members without checking they are callable. |
| 10 | `const clients = { create: 'not a function', … }` | `frontend/src/pages/DashboardPage.tsx:37` | `service:frontend/src/pages/DashboardPage.tsx#clients` | an object literal whose members are strings is not a service, whatever it is called. |
| 11 | `export type CreateClient = (draft) => Promise<Client>` | `frontend/src/types/client.ts:54` | `function:frontend/src/types/client.ts#CreateClient` | a callable-looking type alias is not a function. |
| 12 | `type CreateClient = () => void` declared locally in a page | `frontend/src/pages/DashboardPage.tsx:40` | `function:frontend/src/pages/DashboardPage.tsx#CreateClient` | the same trap declared locally inside a page. |
| 13 | A second `ClientForm`, in `__tests__/` | `frontend/src/components/__tests__/ClientForm.test.tsx:11` | `component:frontend/src/components/__tests__/ClientForm.test.tsx#ClientForm` | the test file is excluded by the default exclude globs; its stub component must not shadow or duplicate the real one. The glob that excludes it is `**/*.test.*`, not the directory: `**/__tests__/**` and `**/__mocks__/**` are NOT in DEFAULT_EXCLUDE (packages/indexer/src/config.ts), so a `__tests__/renderWithProviders.tsx` or a `ClientForm.stories.tsx` carrying the same ids would go straight into the graph. That is a finding about the defaults rather than a fixture defect, and it is recorded here rather than staged as a trap the shipped config cannot pass. |
| 14 | The real form's semantic ids, re-used in that test file | `frontend/src/components/__tests__/ClientForm.test.tsx:13` | `element:clients.create-dialog.form`<br>*must not gain a provenance from the test file* | the test file re-uses the real form's semantic ids. Neither may gain a provenance from a test file. The glob that excludes it is `**/*.test.*`, not the directory: `**/__tests__/**` and `**/__mocks__/**` are NOT in DEFAULT_EXCLUDE (packages/indexer/src/config.ts), so a `__tests__/renderWithProviders.tsx` or a `ClientForm.stories.tsx` carrying the same ids would go straight into the graph. That is a finding about the defaults rather than a fixture defect, and it is recorded here rather than staged as a trap the shipped config cannot pass. |
| 15 | `navigate('/invoices')` calling the *local* `navigate` | `frontend/src/components/InvoiceList.tsx:37` | `navigates_to` `navigate` → _(any target)_ | the local `navigate` sets a highlight. It is called here with a bare route-shaped literal, which is the shape every navigation rule in this fixture keys on, so the trap has something to bite: the argument looks exactly like a route and no route change happens. |
| 16 | `data-guide={guideId}` | `frontend/src/components/primitives/Dialog.tsx:27` | `element:guideId` | a guide attribute whose value is an identifier names no element; `guideId` is a prop, not a semantic id. The evidence is the attribute itself — it used to point at the JSDoc four lines from the top that describes it, and a trap made of prose is not a trap. |
| 17 | `data-guide="Dashboard.Docs"` | `frontend/src/pages/DashboardPage.tsx:97` | `element:Dashboard.Docs` | an invalid semantic id must be diagnosed, not recorded. |
| 18 | `legacyRouter.get('/clients', …)` | `backend/src/routes/legacy.ts:17` | `invokes` `api:GET:/clients` → `listLegacyClients` | the v0 router registers the same path string but its mount point is unknowable; merging it would attach a second, wrong handler to the real endpoint. |
| 19 | `mod.exportToCsv(clients)` after `await import('../lib/heavy')` | `frontend/src/pages/ClientsPage.tsx:88` | `calls` _(any source)_ → `exportToCsv` | the dynamic import must not become a call edge to the module it loads. |
| 20 | `api[method](path, patch)` where the verb is a parameter | `frontend/src/services/clientService.ts:88` | `api:*:/clients`<br>*must not gain a provenance here* | the computed method makes the endpoint unknowable; neither PUT nor POST may be recorded from this call site. |
| 21 | `<Route path="/clients" element={<ClientsPage />} />` | `frontend/src/App.tsx:25` | `api:GET:/clients`<br>*must not gain a provenance here* | a route path is not an API path. Client-side routes and HTTP endpoints share a syntax and nothing else. |
| 22 | `api.get(CLIENTS_PATH)` | `frontend/src/services/clientService.ts:29` | `route:/clients`<br>*must not gain a provenance here* | an HTTP call is not a client-side route. |
| 23 | `const create = clientsApi.create` | `frontend/src/components/ClientForm.tsx:36` | `function:frontend/src/components/ClientForm.tsx#create` | the alias `create` is a second name for an existing function, not a new one. |
| 24 | `app.get('/healthz', …)` | `backend/src/server.ts:40` | `api:GET:/api/healthz` | a liveness probe outside the API prefix must not be normalised as though it were mounted under it. |
| 25 | ` * const client = await clientService.create({ … })` in a JSDoc `@example` | `frontend/src/services/clientService.ts:42` | `calls` `clientService` → `clientService.create` | a call expression inside a JSDoc @example block is documentation. Comments are not code. |
| 26 | `// The list endpoint is GET /clients …` | `frontend/src/pages/ClientsPage.tsx:39` | `api:GET:/clients`<br>*must not gain a provenance here* | an endpoint named in a line comment. Prose is not a call site, whichever comment syntax carries it. |
| 27 | `TOUR_STEPS = ['clients.create', 'clients.table.row', 'settings.save']` | `frontend/src/lib/constants.ts:49` | `element:clients.create`<br>*must not gain a provenance here; nor may element:clients.table.row or element:settings.save* | three strings that exactly equal real data-guide values, in a module the indexer certainly reads. `data-guide` is the product's join key, so an extractor that scans for id-shaped strings instead of for guide attributes invents elements here. |
| 28 | `<div {...{ 'data-guide': 'dialog.backdrop' }} …>` | `frontend/src/components/primitives/Dialog.tsx:26` | `element:dialog.backdrop` | the id is a key inside a spread object literal, so no JSX attribute carries it. An element is recorded from a literal guide *attribute* at a usage site or not at all. |
| 29 | The inner intrinsic `<button>` inside `Button` | `frontend/src/components/primitives/Button.tsx:24` | `element:clients.create`<br>*must not gain a second node or a provenance from this line* | the inner intrinsic <button> carries no literal guide attribute — the id arrives through `...rest`. The element is recorded once, at the usage site, with tagName Button. |
| 30 | `export function ClientTable(clients: Client[]): string` | `frontend/src/lib/legacy-format.ts:20` | `component:frontend/src/lib/legacy-format.ts#ClientTable` | a plain function that happens to share a name with a component in another module. Two ids that differ only by kind must stay distinct; this one is not a component. |
| 31 | A local `settingsService` inside `loadOffline` | `frontend/src/pages/SettingsPage.tsx:49` | `calls` `loadOffline` → `SettingsService.load` | `settingsService` inside this function is a local binding that shadows the module import. An edge here is a scope-table bug: the two names have nothing to do with each other. |
| 32 | `export const endpoints = { createClient: { method, path } }` | `frontend/src/lib/endpoints.ts:23` | `service:frontend/src/lib/endpoints.ts#endpoints` | an object whose members are objects, not functions. It is an endpoint table, however service-shaped the name looks. |
| 33 | `window.exportPath ?? '/clients/export.csv'` | `frontend/src/lib/endpoints.ts:34` | `api:GET:/clients/export.csv` | the `??` fallback is one of two possible values, not the value. Recording it invents an endpoint the deployment may never serve. |
| 34 | `clearSelection()` → the local `navigate('/invoices')` | `frontend/src/components/InvoiceList.tsx:37` | `navigates_to` `clearSelection` → `route:/invoices` | a bare route-shaped literal handed to a local function called `navigate`. The name is the whole resemblance; no router is involved and no route changes. |
| 35 | `element:invoices.refresh` → `useClients#reload` | `frontend/src/pages/InvoicesPage.tsx:50` | `invokes` `element:invoices.refresh` → `reload` | `reload` is declared in useClients.ts AND in useInvoices.ts. The invoices toolbar reaches the invoices one; a resolver that maps a bare name to the single file declaring it picks whichever it saw first and is wrong half the time. |
| 36 | `export const Permissions = { … }` on the backend | `backend/src/lib/permissions.ts:8` | `service:backend/src/lib/permissions.ts#Permissions` | the backend declares its own `Permissions` with the same member names and the same values as the frontend's. Neither is a service — the members are strings — and the two must never collapse into one node, or a UI gate and an API guard become the same fact. |

---

## How to add a case

1. **Write the source first.** Put it where it would live in a real application — a trap in a
   `traps/` directory is not a trap, because no indexer would be fooled by a file labelled *fool me*.
2. **Decide what should happen**, and write the reason down before you write the manifest entry. If
   you cannot state the reason in one sentence, the case is `ambiguous`, and that is a legitimate
   answer — put it in `ambiguous` with both acceptable outcomes.
3. **Add the entry to `expectations.json`** in the right section:
   - it should be found → `relationships` (with `tier: "core"` or `"stretch"`) and/or `nodes`
   - it should fail, loudly → `expectedUnresolved`, with the diagnostic code you expect
   - it should be **found and complained about** → `expectedDiagnostics`. A case that resolves does
     not belong in `expectedUnresolved`, whose contract is "the indexer must fail to resolve this"
   - it must never appear → `mustNotExist`, one entry per assertion, and add the matching row to the
     false-positive table above
   - more than one answer is defensible → `ambiguous`, with **both** outcomes written out. If an
     entry there has a twin elsewhere in the source — two adjacent lines with the same construct —
     list them both, or the same indexer is exempt on one and a false positive on the other
4. **Re-verify.** Inserting a line shifts every reference below it in that file:

   ```sh
   node packages/indexer/test/fixtures/realistic-app/verify-expectations.mjs
   ```

   It checks that every `file`/`line` in the manifest exists, that the source at that line still says
   what the manifest's `excerpt` claims, that no relationship points at an undeclared node, that
   every confidence is on the scale, every rule is a real `InferenceRule`, every diagnostic a real
   `IndexerDiagnosticCode`, every element id a valid guide id, every API id normalised — and that the
   flagship chain is present hop by hop.

   **Matching the excerpt is not enough, and the script no longer stops there.** Several lines in
   this fixture are byte-identical to each other: `const { clientId } = clientIdParamSchema.parse(req.params);`
   appears in three client handlers and `const rows = await query<ClientRecord>(` in three service
   members. An edge can cite the wrong one and pass an excerpt check perfectly — which is exactly
   what happened to three `validates_with` edges and one `calls` edge in an earlier revision. So the
   script also checks:

   - **evidence attribution** — an edge whose source is a declaration must cite a line inside that
     declaration's **brace-matched body**, with the parameter list skipped so destructured props do
     not close the scan early. When it does not, the script names the declaration that *does* own
     the line.
   - **the `mustNotExist` schema** — canonical ids in `idLike`/`sourceLike`/`targetLike`, wildcards
     only in an `api:` method position, and an `extra` on every entry naming an id the manifest also
     declares.
   - **comment anchors** — a trap may not be evidenced by the prose that describes it, unless the
     trap *is* the comment.
   - **`expectedDiagnostics`** — every entry must name a node the manifest declares, since a case
     that resolves does not belong in `expectedUnresolved`.
   - **`counts`** — every key, not just the five it used to cover.
5. **Update `counts` and, if you added a node kind, `exhaustiveness`.** Recall may only be scored
   against kinds marked complete, so a half-listed kind is worse than an unlisted one — and a kind
   marked complete that also has `ambiguous` or stretch-only members is worse still, because
   `complete` and "scored neither way" cannot both hold for one id. Name the exception inside the
   claim, the way `element`, `api` and `function` do.

### House rules

- **Do not run Prettier here.** This directory is listed in `/.prettierignore` (and in
  `eslint.config.js`'s `ignores`) precisely so that reformatting cannot silently move every asserted
  line. Format it once and the manifest is wrong everywhere at once.
- **Do not install dependencies** and do not add `node_modules`. The imports are meant not to resolve.
- **Keep both `tsconfig.json` files strict**, `jsx: react-jsx` on the frontend only.
- **No absolute paths in `expectations.json`.** Every path is relative to this directory:
  `frontend/src/…`, `backend/src/…`.
- **Syntactic validity is the bar**, not type-checking. The fixture must parse cleanly; it will never
  type-check, because nothing it imports exists.
