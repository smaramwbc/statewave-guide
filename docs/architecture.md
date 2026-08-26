# Architecture

Statewave Guide has one job: let an application explain and demonstrate itself.
Doing that safely requires keeping several concerns strictly apart, and most of
the design here is about where those lines fall and what is allowed to cross
them.

> **Status:** early development. This document describes the Day 0 foundation.
> Anything marked _planned_ is not implemented.

## The one-sentence version

The indexer reads source code and produces a Product Model; the runtime holds
that model plus the live application context; the action registry is the only way
anything can affect the application; and the React bindings are the only place
that ever touches a DOM node.

```
   SOURCE CODE                data-guide="clients.create"
        │
        │  deterministic analysis (ts-morph)
        ▼
   APPLICATION GRAPH          .statewave-guide/application.json
        │
        │  (planned) semantic enrichment
        ▼
   PRODUCT MODEL              features · elements · routes · provenance
        │
        ▼
   GUIDE RUNTIME  ◄──────────  AppContext (host-owned)
        │
        │  named actions, validated + risk-gated
        ▼
   REACT BINDINGS             element registry · highlight engine
        │
        ▼
   LIVE DOM                   the actual <button>
```

The semantic identifier `clients.create` is the join key. It is written once in
source, extracted by the indexer, registered at runtime, and resolved to a node —
the same string at every layer. Everything else in this document follows from
wanting that to be the _only_ way to address a piece of the interface.

## Packages and their boundaries

| Package                       | Runs in  | Depends on            | May import               |
| ----------------------------- | -------- | --------------------- | ------------------------ |
| `@statewavedev/guide-shared`  | anywhere | —                     | `zod`                    |
| `@statewavedev/guide-actions` | anywhere | shared                | `zod`                    |
| `@statewavedev/guide-core`    | anywhere | shared, actions       | —                        |
| `@statewavedev/guide-react`   | browser  | shared, actions, core | `react` (peer)           |
| `@statewavedev/guide-indexer` | Node     | shared                | `ts-morph`, `picocolors` |

The rules that keep this honest:

- **Core never imports a browser API, React, an HTTP client, or a model SDK.**
  Everything from the outside world arrives as an interface implementation.
- **The indexer never imports a runtime package** other than `shared`, and no
  runtime package imports the indexer. They meet only through the JSON artefact.
- **React is the only package that may hold an `HTMLElement`**, and it does not
  let one out (see [The DOM boundary](#the-dom-boundary)).
- **No package depends on Statewave.** The memory port is shaped so a Statewave
  adapter can implement it, and that adapter is a future package, not a
  dependency of core.

---

## Indexer

**`@statewavedev/guide-indexer` — source code in, facts out.**

The indexer loads a project's `tsconfig`, parses it with `ts-morph`, and walks the
syntax tree looking for things it can state as fact:

- React components (PascalCase functions containing JSX)
- guide elements (`data-guide` / `data-ai-id` string-literal attributes)
- routes (`<Route path="…">`, `createBrowserRouter([{ path: '…' }])`)
- exported functions
- exported interfaces, type aliases and enums

Three rules govern it:

**Deterministic facts only.** The indexer never invents a description, never
infers business meaning, and never calls a model. If a label cannot be read from
a string literal, it is omitted rather than guessed. Semantic enrichment is a
separate, later stage that _annotates_ this output — it does not replace it, and
the provenance of an enriched claim stays distinguishable from a extracted one.

**Everything carries provenance.** Every node records the file, line and symbol it
came from. A claim about the application is always traceable back to the code that
justified it, which is what makes the model reviewable.

**Byte-identical output.** Two runs over unchanged source produce an identical
`application.json`: no timestamps, no absolute paths, POSIX separators, every
array sorted by a stable key, optional keys omitted rather than emitted as `null`.
This is what lets the Product Model live in version control and be reviewed in a
pull request like any other artefact.

The indexer runs entirely offline and shares no process, no state and no runtime
dependency with the guide itself.

---

## Application Understanding

_Closed Loop #2. This is where the indexer stops describing structure and starts describing
behaviour._

Knowing that a button exists is not the same as understanding what an application does. A product
tour knows there is a control at a position. What a guide needs to know is what pressing it causes:

```
New Client
    ↓ opens NewClientDialog
    ↓ contains ClientForm
    ↓ submitClient()
    ↓ clientService.create()
    ↓ POST /api/clients
    ↓ backend createClient()
```

That is the difference between a graph of _things_ and a graph of _behaviour_, and it is the whole
point of this layer.

### Two kinds of evidence, deliberately kept apart

> **The DOM is runtime evidence. The source graph is product knowledge.**

The React registry knows what is mounted and visible _right now_. That is real, and it is what makes
highlighting possible — but it is a fact about this browser tab at this moment, not a fact about the
product. The source graph knows what the application can do at all, whether or not anything is
currently rendered.

Neither substitutes for the other. Runtime evidence cannot tell you that a button submits to
`POST /api/clients`; the source graph cannot tell you that the button is currently off-screen.

### The pipeline

```
Syntactic facts          what the source literally says
      ↓
Symbol resolution        which declaration an identifier refers to
      ↓
Relationship graph       how those declarations connect
      ↓
Behaviour graph          what a user action causes
      ↓
Semantic enrichment      what it means, in a person's words   ← planned; AI enters only here
```

Each layer consumes the one above and may not skip it. The reasoning is in
[ADR 0004](adr/0004-deterministic-code-understanding-before-ai-enrichment.md); the short version is
that a hallucination originating in the substrate is far more dangerous than one originating in a
model, because it arrives wearing the authority of static analysis.

### Nodes

Version 2 of the graph replaces per-kind arrays with one typed node union. A route, a component, a
UI element, a function, a service and an HTTP endpoint are all nodes, addressed by a canonical id:

| Kind           | Canonical id                        | Example                                                       |
| -------------- | ----------------------------------- | ------------------------------------------------------------- |
| `route`        | `route:<path>`                      | `route:/clients/:clientId`                                    |
| `component`    | `component:<file>#<name>`           | `component:src/pages/Clients.tsx#Clients`                     |
| `element`      | `element:<semantic id>`             | `element:clients.create`                                      |
| `function`     | `function:<file>#<name>`            | `function:src/services/clientService.ts#clientService.create` |
| `hook`         | `hook:<file>#<name>`                | `hook:src/hooks/useClients.ts#useClients`                     |
| `service`      | `service:<file>#<name>`             | `service:src/services/clientService.ts#clientService`         |
| `api`          | `api:<METHOD>:<path>`               | `api:POST:/api/clients`                                       |
| `schema`       | `schema:<file>#<name>`              | `schema:src/validation/client.ts#createClientSchema`          |
| `permission`   | `permission:<value>`                | `permission:clients:create`                                   |
| `file`, `type` | `file:<path>`, `type:<file>#<name>` |                                                               |

Two of these ids are deliberately location-free. `element:clients.create` and
`permission:clients:create` identify a _thing in the product_, not a place in the source, so the same
element referenced from two files is one node. Everything else is location-bearing, because two
functions with the same name in different files are two functions.

### Relationships

Twelve types, each answering a question someone might actually ask:

| Relationship                 | Question it answers                       |
| ---------------------------- | ----------------------------------------- |
| `contains`                   | What is on this screen?                   |
| `renders`                    | What does this component put on the page? |
| `invokes`                    | What happens when I press this?           |
| `opens`                      | What appears?                             |
| `submits_to`                 | Where does this form go?                  |
| `calls`                      | What does this function do?               |
| `uses_service` / `uses_hook` | What does this depend on?                 |
| `calls_api`                  | What request does this make?              |
| `navigates_to`               | Where does this take me?                  |
| `requires_permission`        | Who is allowed to do this?                |
| `validates_with`             | What shape must the input be?             |

Every relationship carries at least one piece of evidence — file, line, symbol, excerpt, and for an
inference, the named rule that produced it. This is enforced rather than documented:
`createRelationship()` throws when handed an empty evidence list.

Confidence is one of exactly three values — `1.0` direct syntax, `0.95` resolved symbol, `0.9` named
static inference. There is no 0.5 tier: if we would have to write one, we write a diagnostic instead.
The full catalogue, including what each rule _refuses_ to fire on, is in
[docs/confidence.md](confidence.md).

### The frontend/backend join

The headline capability of this layer. A frontend HTTP call and a backend route registration for the
same normalised method and path become **one** node:

```
function:…#clientService.create  --calls_api-->  api:POST:/api/clients
                                                 api:POST:/api/clients  --invokes-->  function:…#createClient
```

The endpoint is the join because it is the only thing both tiers name independently. Joining on
anything else means matching on names, and names are evidence of intent, not evidence of connection.
Reasoning in [ADR 0005](adr/0005-unified-frontend-backend-application-graph.md).

A useful side effect: an endpoint observed on only one side is a finding. A `calls_api` with no route
is a dead client call or an unresolved prefix; a route nothing calls is dead server code. Both are
reported in the graph health section.

### Traversal

`createGraphQuery(graph)` provides `getNode`, `getOutgoing`, `getIncoming`, `neighbors`, `findPath`
and `explainPath`. `explainPath` returns structured evidence records, never prose — turning those
into a sentence is a presentation decision, and baking one in would make the output impossible to
render any other way.

`resolveFeaturePath('clients.create')` walks the behaviour chain from a UI element, preferring
`invokes` → `opens` → `renders` → `submits_to` → `calls` → `calls_api`. The order is deliberate: from
a button the interesting question is what pressing it does, and a walk that preferred `calls` would
dive into utility functions and never reach the dialog.

It returns a `gap` describing where the chain stopped and which diagnostics were recorded in that
file. A path that stops short is a result, not a failure — and showing the gap honestly is the
difference between a graph you can trust and one you cannot.

### What this layer will not do

- It will not link `CreateClientButton` to `POST /clients` because the names look alike.
- It will not resolve `api[method](path)` where the method is a runtime value.
- It will not map `modal.open('create-client')` to a component unless a deterministic registry exists.
- It will not follow dynamic `import()`.
- It will not pick between two candidate declarations when resolution is ambiguous.

Each of these produces a diagnostic instead, so what the system does not know is observable rather
than silently filled in. The complete list is in [docs/refusals.md](refusals.md).

---

## Product Model

**`@statewavedev/guide-shared` — the vocabulary everything agrees on.**

The Product Model is plain data: `ProductFeature` (a user-facing capability),
`ProductElement` (an addressable piece of UI), `ProvenanceReference` (where a fact
came from). No behaviour, no environment assumptions.

It sits between the indexer's `ApplicationGraph` — which is _structural_, in terms
of files and components — and the runtime, which needs something _product-shaped_,
in terms of features a user would name. Day 0 defines the model and a knowledge
provider that searches it; generating a Product Model from the graph is roadmap
Day 1.

`shared` also owns the semantic-id rules, and this is where the safety model is
actually enforced:

```ts
export const GUIDE_ELEMENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
```

Dot-separated lowercase segments, nothing else. Whitespace, `#`, `>`, `[` and every
other selector metacharacter is rejected. Both the indexer and the runtime call the
same `isValidGuideElementId`, so an id that survives static analysis is guaranteed
addressable at runtime, and a value that could act as a selector cannot exist as an
id anywhere in the system.

---

## Actions

**`@statewavedev/guide-actions` — the complete set of things that can be done.**

An action is a name, a description, a Zod schema, a risk level and a handler. The
registry validates input against the schema, applies the risk policy, runs the
handler, and returns a result. It is framework-free and has no idea what any
action actually does — a `navigate` handler might call React Router, a Tauri
window, or a spy in a test.

Two properties matter more than the rest.

**Execution never throws.** Every failure — unknown action, invalid input, a
handler that rejected, a policy refusal, a cancellation — comes back as
`{ success: false, error: { code, message } }`. The caller of an action is frequently
not a human and must be able to _read_ a failure rather than catch it.

**Risk is declared, and enforced separately from execution.**

| Risk         | Meaning                                       | Default policy                                                                          |
| ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `safe`       | pure guidance — navigate, highlight, scroll   | always allowed                                                                          |
| `confirm`    | changes state — save, send, archive           | agent requests refused with `confirmation_required`                                     |
| `restricted` | never exposed to an agent — delete, pay, sign | agent requests refused with `not_permitted`; hidden from `list({ visibleTo: 'agent' })` |

Day 0 ships the classification, the enforcement point and the default policy. It
does **not** ship a confirmation UI — `confirm` actions requested by an agent are
refused until a host supplies a policy that can obtain that confirmation. The
policy is a plain replaceable function, so a host can express role checks or a
confirmation token without forking the runtime.

Note that `restricted` actions are _invisible_ to an agent, not merely refused. An
action a model has never been told about is one it cannot be argued into naming.

---

## Runtime

**`@statewavedev/guide-core` — orchestration, and nothing else.**

`createGuideRuntime()` owns four things and delegates the rest:

- the current `AppContext`, validated and observable
- the action registry, whose context source it takes over so handlers and the
  policy always read live values
- a `KnowledgeProvider` port
- a `MemoryProvider` port

**The host owns the context.** It pushes route changes, permissions and the
selected entity in; the runtime and action handlers only read. Nothing an agent
sends can modify it, which is what makes the context trustworthy enough to gate
guidance on. `patchContext` distinguishes `undefined` ("leave alone") from `null`
("clear") so a router reporting a route change cannot erase what the auth layer
reported a moment earlier.

---

## Memory

**A port, not a dependency.**

```ts
interface MemoryProvider {
  retrieve(input: MemoryRetrieveInput): Promise<MemoryRecord[]>;
  remember(input: MemoryWriteInput): Promise<void>;
}
```

Two methods. Anything richer — summarisation, compaction, consolidation — belongs
inside an implementation.

`createInMemoryMemoryProvider()` ships today. It is not a placeholder to be thrown
away: it is the reference implementation that proves the port is usable and
testable before the port acquires a network dependency.

The `subject` field is a namespace (`user:42`, `workspace:acme`), not a Statewave
API concept, though it is deliberately the shape a Statewave adapter will want. A
Statewave-backed provider is roadmap Day 5 and will be its own package. Core will
not gain a dependency on it.

---

## React bindings

**`@statewavedev/guide-react` — the only place a DOM node exists.**

Three things live here.

**The element registry.** Components register semantic elements on mount via
`<GuideElement>` or `useGuideElement()`, and the registry tracks id, type, label,
description, feature, mount state and viewport visibility. That visible set feeds
`AppContext.visibleElements`, which is how the guide knows what is actually on
screen.

Both registration paths set the `data-guide` attribute on the real node. This is
the closing of the loop: the attribute the indexer read in source is the attribute
present in the live DOM, so the runtime can also resolve an element that was
declared by attribute alone and never registered through React.

**The guidance engine.** Ours, with no third-party tour dependency — see
[ADR 0001](adr/0001-build-our-own-guidance-engine.md). `highlightElement`,
`clearHighlight` and `scrollToElement` take semantic ids and return typed results.
A target that is unregistered, unmounted, or unmounts _while_ highlighted is an
ordinary outcome, not an exception.

**The action wiring.** The provider registers `highlight` and `scroll` itself,
because they need only the controller. It registers `navigate`, `open` and
`startGuide` **only when the host supplies a handler** — the React package does not
own routing, and refuses to guess at it.

### The DOM boundary

This is the load-bearing rule of the whole system, so it is worth stating
precisely.

The public `GuideElementRegistry` is read-only state — `has`, `get`, `list`,
`visibleIds`, `subscribe`, `getSnapshot`. It has no method that mutates anything
and no method that returns a DOM node.

The capabilities that must not escape — `resolveNode`, `register`, `setNode`,
`update`, `unregister`, `destroy` — live on a separate object associated with the
facade through a module-private `WeakMap`. The provider, the hooks and the
highlight engine reach them through `internalsOf()`. Nothing outside the package
can, because the map is not reachable from any export.

This is a _runtime_ boundary, not a type-level one, and the difference matters. A
type-level boundary can only be checked by grepping declarations. A runtime
boundary can be checked directly — `'resolveNode' in registry` is `false`,
including up the prototype chain.

That distinction earned its keep during review. The first implementation was
type-clean but leaked anyway: the provider parked the internals in `useState` and
`useGuideElement` memoised them into a dependency array, so React's own fiber tree
held a reference and a fiber walk from any rendered node found them — five
separate paths. The fix was to call `internalsOf()` inside the closure that needs
it and never store the result. A test now walks the fiber tree to depth 12 and
duck-types for the internals; it fails if the memo is put back.

So:

- No hook, context value, action result or public type hands out a DOM node.
- No public API accepts a selector, a node, or a DOM query.
- An agent's entire vocabulary for the interface is the set of validated semantic
  ids and the set of registered action names.

The worst thing a compromised or confused model can do is name an element that
does not exist, and get back `{ success: false, error: { code: 'target_not_found' } }`.

---

## Future agent layer

_Planned — roadmap Day 6. The seam exists; nothing is implemented._

`ModelProvider` is defined in core and deliberately unused:

```ts
interface ModelProvider {
  generate(request: ModelGenerateRequest): Promise<ModelGenerateResult>;
}

interface ModelGenerateResult {
  text: string;
  actionRequests?: GuideActionRequest[];
}
```

The important detail is `actionRequests`. A model returns _requests_, not
commands. Every one still goes through the action registry, where it is validated
against a schema and gated by the risk policy. A model can therefore ask for
something it is not allowed to do and be refused — which is the intended failure
mode, not an edge case.

No vendor SDK, no HTTP client and no prompt template exists in any package today.

---

## Data flow, end to end

Registering an element and highlighting it:

```
1.  Developer writes   <button data-guide="clients.create">New Client</button>
2.  Indexer extracts   { id: 'clients.create', type: 'button', label: 'New Client',
                         file: 'src/pages/Clients.tsx', line: 82 }
3.  App mounts         useGuideElement({ id: 'clients.create', type: 'button' })
                       → registry holds the node privately
                       → AppContext.visibleElements gains 'clients.create'
4.  Something asks     guide.executeAction({ action: 'highlight',
                         input: { elementId: 'clients.create' } })
5.  Registry           validates against highlightInputSchema
                       (a selector would be rejected here, with invalid_input)
6.  Policy             risk 'safe' → allowed
7.  Handler            controller.highlight('clients.create')
8.  Engine             resolveNode → scroll into view → spotlight + ring + popover
9.  Result             { ok: true, action: 'highlight', requestId: 'req_1', data: … }
```

Step 5 is where the safety model is cashed in: `elementId` is parsed by
`guideElementIdSchema`, so `#app > div:nth-child(4)` fails validation and never
reaches step 7.

## What is deliberately absent

- No LLM SDK, no prompt templates, no conversational loop.
- No Statewave client, no HTTP, no hosted-service assumption.
- No database. The indexer writes a JSON file; providers keep state in memory.
- No third-party tour library.
- No confirmation UI — the risk model is enforced, the prompt is not built.
- No Product Model generation from the application graph yet.

See the roadmap in the [README](../README.md) for when each of these is expected.
