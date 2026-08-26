# @statewavedev/guide-indexer

Deterministic source-code analysis for [Statewave Guide](https://github.com/smaramwbc/statewave-guide).

Reads a TypeScript/React project with `ts-morph` and writes what it can prove
about it to `.statewave-guide/application.json`.

```bash
npx @statewavedev/guide-indexer .
```

```
Statewave Guide

Analyzing application...

✓ TypeScript project detected
✓ 42 source files
✓ 18 React components
✓ 12 guide elements
✓ 4 routes

ApplicationGraph Health

Nodes:                  1,482
Relationships:          2,741

Resolved calls:          91%
Unresolved calls:         9%

API paths resolved:      96%

Graph integrity:        PASS

Product graph written to:

.statewave-guide/application.json
```

`--health` prints only that second block.

## The graph

`application.json` is version 2: one flat `nodes` array and one `relationships`
array, both sorted by canonical id.

Every node is addressed by a `kind:…` identifier that is stable across runs and
machines — `component:src/pages/Clients.tsx#Clients`, `element:clients.create`,
`function:src/services/clientService.ts#clientService.create`,
`api:POST:/api/clients`. Every relationship is a typed, directed edge carrying at
least one evidence record naming the file, the line and the reason.

## What it extracts

- **Guide elements** — JSX carrying a string-literal `data-guide` (or the legacy
  `data-ai-id`), with element type, label and provenance
- **React components** — PascalCase functions containing JSX, including ones
  wrapped in `forwardRef`, `memo` and friends
- **Routes** — `<Route path="…">` and `createBrowserRouter([{ path: '…' }])`
- **Functions** — module-scope declarations, arrow and function expressions,
  object-literal methods, class methods, and the handlers declared inside a
  component when their name is unambiguous in their file
- **Services** — objects whose members are mostly functions, and classes with
  methods, recognised by shape rather than by name
- **HTTP endpoints** — `fetch`, `axios`, and configured client instances, with
  the client's `baseURL` applied
- **Server routes** — Express and Fastify registrations, with mount prefixes
  composed across modules
- **Permissions** — via recognisers named in the config
- **Validation schemas** — module-scope `zod` and `yup` constants, including the
  ones derived from another schema
- **Types** — exported interfaces, type aliases and enums

All twelve relationship types: `contains`, `renders`, `invokes`, `opens`,
`navigates_to`, `calls`, `submits_to`, `uses_hook`, `uses_service`, `calls_api`,
`requires_permission` and `validates_with`.

### UI behaviour

The edges that answer "what does pressing this do?" are the ones with the most
room to be plausibly wrong, so each is restricted to a shape the source states
outright.

- **`invokes`** — an `on[A-Z]` prop on an element, when it names a function: a
  bare identifier, an arrow whose whole body is one call, or a memo wrapper
  opened to the call inside it. A prop whose value the _parent_ supplies
  (`onClick={onCancel}`), a member read off an object, and an arrow that does
  several things each produce an `UNRESOLVED_DYNAMIC_CALL` and no edge.
- **`submits_to`** — `<form onSubmit={…}>`, including `handleSubmit(submit)` and
  an arrow that calls `preventDefault` before submitting. Recorded from the form
  element _and_ from the component holding it, so a chain continues through a
  form that carries no semantic id. Anything else is an
  `UNSUPPORTED_FORM_PATTERN`.
- **`opens`** — one rule, `state-flag-gates-element`: a `useState` flag, a
  function in the same component setting it to `true`, and that same binding
  gating a component in the return. All three, resolved to one declaration, or
  no edge. `modal.open('create-client')` is an `UNRESOLVED_MODAL_REGISTRY`,
  because a string that resembles a component name is not evidence that it is
  one.
- **`navigates_to`** — a router link's `to`, or a call on a navigator the router
  itself handed out. A local function that merely shares the name `navigate`
  produces nothing, and a destination that matches no declared route becomes an
  `UNRESOLVED_DYNAMIC_ROUTE` rather than a new `route:` node.
- **`validates_with`** — a schema passed to route middleware (recorded on the
  endpoint) or run by `.parse(…)` in a handler (recorded on the function).

### The frontend/backend join

A frontend `calls_api` and a backend route registration for the same normalised
`METHOD:/path` produce **one** endpoint node, with `observedOn` naming both
sides and a provenance for every sighting. That single node is what lets a
button in a page be traced to the controller that answers it.

A path parameter is addressed positionally, `:param`, because its _name_ is not
part of an endpoint's identity: the client writes `` `/clients/${id}` `` and the
server writes `/clients/:clientId`, and no router can serve both as different
routes. The name survives on the node's `path`, spelled the way the server
spells it. An endpoint whose mount prefix could not be proven carries an
explicit unknown-prefix marker — `api:GET:?/clients` — so it can never merge
with a resolved endpoint whose string it happens to match.

Optional attributes refine what the extractor can see: `data-guide-type="button"`
states the semantic kind of a custom component, and `data-guide-label="…"` states
a label that isn't readable from a string literal child.

## Three rules

**No evidence, no relationship.** No model, no inferred business meaning, no
invented descriptions. A relationship that cannot name the file, the line and the
reason that produced it is not recorded at all — not with low confidence, not
with a caveat. Confidence is one of exactly three values: `1.0` for direct
syntax, `0.95` for a deterministically resolved symbol, `0.9` for a named static
inference. A gap becomes a diagnostic instead, so that what the indexer could not
determine is visible rather than silent.

**Everything carries provenance.** Every node records the file, line, column and
symbol it came from, so a claim about the application is always traceable back to
the code that justified it.

**Byte-identical output.** Two runs over unchanged source produce an identical
file: no timestamps, no absolute paths, POSIX separators, NFC-composed file
names, every array sorted by a stable key, optional keys omitted rather than
emitted as `null`. The file set is discovered by walking the project itself, so
it is a property of the project and not of the directory the command was run
from. That is what lets the graph live in version control and be reviewed in a
pull request.

## Configuration

Optional, in `statewave-guide.config.ts`:

```ts
import { defineConfig } from '@statewavedev/guide-indexer';

export default defineConfig({
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['**/*.test.*', '**/node_modules/**'],
  // Used only where a file's own structure is ambiguous.
  backend: ['backend/**', 'server/**', 'api/**'],
  // Nothing becomes a permission unless a recogniser here matches.
  permissions: { functions: ['requirePermission'], components: ['Can'] },
  // Clients built by `axios.create(…)` are found whatever they are called.
  httpClients: ['api', 'http'],
});
```

`.js`, `.mjs`, `.mts` and `.json` config files are also recognised.

## Programmatic use

```ts
import {
  createGraphQuery,
  createProjectIndexer,
  writeApplicationGraph,
} from '@statewavedev/guide-indexer';

const { graph } = await createProjectIndexer({ root: '.' }).index();
await writeApplicationGraph(graph, { root: '.' });

// Ask the graph a question. Every answer is structured data, never prose.
const query = createGraphQuery(graph);
const path = query.resolveFeaturePath('clients.create');
```

The indexer runs entirely offline and shares no process, state or runtime
dependency with the guide itself.

## Status

Early development. It produces a behavioural application graph — elements, the
handlers they invoke, the dialogs those open, the forms, services and endpoints
behind them, and the routes and permissions that reach them. Turning that into
a product-shaped model of features is the next milestone. See the
[main README](https://github.com/smaramwbc/statewave-guide#readme).

Apache-2.0
