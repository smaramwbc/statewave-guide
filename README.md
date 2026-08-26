# Statewave Guide

**Your app explains itself.**

Statewave Guide is an open-source framework for building memory-powered,
code-aware, interactive guidance directly inside applications.

```
Source Code
   ↓
Product Understanding
   ↓
Statewave Memory
   ↓
AI Guide
   ↓
Explain • Navigate • Highlight • Guide • Act
```

> ### ⚠️ Early development
>
> **Day 0** proved the first loop: a `data-guide` attribute in source code →
> application graph → runtime registry → a spotlight on the live DOM.
>
> **Day 1** is the second loop: understanding what a feature _does_. The indexer
> now resolves symbols across files, builds a call graph, and joins the frontend
> to the backend at the endpoint they share — so a button can be traced to the
> controller that answers it.
>
> There is **no AI in this repository yet** — no model SDK, no prompts, no chat,
> no embeddings. There is no Statewave dependency yet either. That ordering is
> deliberate and the reasoning is in
> [ADR 0004](docs/adr/0004-deterministic-code-understanding-before-ai-enrichment.md).
> See [what is not built yet](#what-is-not-built-yet) for what is honestly missing.

---

## The idea

Most in-app guidance rots. Someone writes a tour, the UI changes, the tour points
at a button that moved. The knowledge lives in a separate system from the code
that it describes, and nothing keeps them in sync.

Statewave Guide starts from the opposite premise: **the source code is the source
of truth.** Developers should not maintain a parallel knowledge base. The
application should be able to read itself, know what it can do, and show a user
where to do it.

Three pieces make that work.

**1. A semantic identifier, written once.**

```tsx
<button data-guide="clients.create" onClick={openCreateClient}>
  New Client
</button>
```

**2. An indexer that finds it, deterministically.**

```bash
npx @statewavedev/guide-indexer .
```

```json
{
  "id": "clients.create",
  "type": "button",
  "label": "New Client",
  "provenance": {
    "source": "source-code",
    "file": "src/pages/Clients.tsx",
    "symbol": "Clients",
    "line": 82
  }
}
```

No AI, no guessing, no invented descriptions. Every extracted fact carries the
file and line that justified it.

**3. A runtime that can act on it.**

```ts
await guide.executeAction({
  action: 'highlight',
  input: { elementId: 'clients.create' },
});
```

The same string — `clients.create` — is written in source, extracted by the
indexer, registered at runtime, and resolved to a live DOM node. That single join
key is the whole architecture.

## Semantic actions, not DOM control

The rule that shapes everything: **a guide addresses elements by semantic
identifier, never by selector.**

```ts
highlight('clients.create'); // ✅ the only thing any API accepts
click('#app > div:nth-child(4)'); // ❌ no API in this project takes this
```

This is enforced, not just documented. Semantic ids are validated by a schema that
rejects every selector metacharacter, so `#app > div` fails validation before it
reaches a handler — and the DOM lookup re-validates, so a selector cannot reach a
`querySelector` even by another route. No hook, context value or action result
hands out an `HTMLElement`; the highlight engine is the only code that ever holds
one. An agent's entire vocabulary is the set of registered element ids and the set
of registered action names.

The node resolver is private at _runtime_, not merely absent from the types: it
lives behind a module-private `WeakMap`, so the object `createElementRegistry()`
returns does not carry it at all — not as an own property, not on its prototype,
and not anywhere React's fiber tree can reach. That is verified by test rather
than asserted by documentation. See
[ADR 0002](docs/adr/0002-private-dom-node-resolver.md).

Actions also declare how consequential they are:

| Risk         | Examples                          | Behaviour                                     |
| ------------ | --------------------------------- | --------------------------------------------- |
| `safe`       | navigate, highlight, scroll, open | always allowed                                |
| `confirm`    | save, send, archive               | agent requests refused until a human confirms |
| `restricted` | delete, pay, sign                 | never shown to an agent at all                |

Day 0 enforces the classification. The confirmation UI is roadmap work — see
[docs/architecture.md](docs/architecture.md#actions).

---

## Knowing where a button is, versus knowing what it does

A product tour knows there is a control at a position. That is not the same as
understanding the product.

Take a button called **New Client**. What a guide actually needs to know is:

```
element:clients.create
    ↓ invokes        openCreateClient
    ↓ opens          NewClientDialog
    ↓ renders        ClientForm
    ↓ submits_to     submitClient
    ↓ calls          clientService.create
    ↓ calls_api      POST /api/clients
    ↓ invokes        backend createClient
```

The indexer reconstructs that chain from source alone. No manual, no annotations
beyond the one `data-guide` attribute, no model.

Two rules make it trustworthy.

**The DOM is runtime evidence. The source graph is product knowledge.** The React
registry knows what is mounted and visible right now — a fact about this browser
tab. The source graph knows what the application can do at all. Neither
substitutes for the other.

**Unknown is better than wrong.** Every relationship carries evidence: a file, a
line, a symbol, and for an inference, the named rule that produced it. If static
analysis cannot prove a link, the graph does not record one — it records a
diagnostic saying why. This is enforced rather than documented:
`createRelationship()` throws when handed an empty evidence list.

Confidence is one of exactly three values — `1.0` direct syntax, `0.95` resolved
symbol, `0.9` named static inference. There is no 0.5 tier: if we would have to
write one, we write a diagnostic instead. Full catalogue, including what each
rule _refuses_ to fire on, in [docs/confidence.md](docs/confidence.md).

So the indexer will **not**:

- link `CreateClientButton` to `POST /clients` because the names look alike
- resolve `api[method](path)` where the method is a runtime value
- map `modal.open('create-client')` to a component without a real registry
- pick between two candidate declarations when resolution is ambiguous

Each of those produces a diagnostic, so what the system does not know is
observable rather than silently filled in. The full catalogue — every pattern we
refuse, why the obvious inference is wrong, and the diagnostic emitted instead —
is in [docs/refusals.md](docs/refusals.md).

### One graph, both tiers

A frontend HTTP call and a backend route registration for the same normalised
method and path become **one node**:

```
clientService.create  --calls_api-->  api:POST:/api/clients  --invokes-->  createClient
```

The endpoint is the join because it is the only thing both tiers name
independently. Joining on anything else means matching on names, and names are
evidence of intent, not evidence of connection —
[ADR 0005](docs/adr/0005-unified-frontend-backend-application-graph.md).

A useful side effect: an endpoint seen on only one side is a finding. A
`calls_api` with no route is a dead client call or an unresolved prefix; a route
nothing calls is dead server code. Both are reported in the graph health output.

### Asking the graph

```ts
import { createGraphQuery } from '@statewavedev/guide-indexer';

const graph = createGraphQuery(applicationGraph);

graph.resolveFeaturePath('clients.create');
// { start, container, routes, permissions, path: [...], gap: {...} }
```

`gap` reports where the chain stopped and which diagnostics were recorded there.
A path that stops short is a result, not a failure — and showing the gap honestly
is the difference between a graph you can trust and one you cannot.

---

## Architecture

```
statewave-guide/
├── packages/
│   ├── shared/     @statewavedev/guide-shared     types, schemas, semantic-id rules
│   ├── actions/    @statewavedev/guide-actions    framework-free action runtime
│   ├── core/       @statewavedev/guide-core       runtime, context, provider ports
│   ├── react/      @statewavedev/guide-react      bindings + our own highlight engine
│   └── indexer/    @statewavedev/guide-indexer    ts-morph source analysis + CLI
├── examples/
│   └── react-demo/                                proves the whole path end to end
└── docs/
    ├── architecture.md
    └── adr/0001-build-our-own-guidance-engine.md
```

| Package         | Responsibility                                                                              | Depends on                            |
| --------------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `guide-shared`  | Product Model types, Zod schemas, the `data-guide` convention                               | `zod`                                 |
| `guide-actions` | Named, schema-validated, risk-gated actions. Never throws.                                  | shared                                |
| `guide-core`    | `AppContext`, orchestration, `KnowledgeProvider` / `MemoryProvider` / `ModelProvider` ports | shared, actions                       |
| `guide-react`   | `<StatewaveGuideProvider>`, hooks, element registry, highlight engine                       | shared, actions, core, `react` (peer) |
| `guide-indexer` | Deterministic TypeScript/React analysis → `application.json`                                | shared, `ts-morph`                    |

Hard boundaries, enforced by convention and dependency direction:

- Core imports no browser API, no React, no HTTP client and no model SDK.
- The indexer runs entirely independently of the runtime packages; they meet only
  through a JSON artefact.
- React is the only package that may hold an `HTMLElement`, and it does not let
  one out.
- Nothing depends on Statewave yet. Memory is a port with an in-memory reference
  implementation.

We built the highlight engine ourselves rather than depending on a product-tour
library. The reasoning is written up in
[ADR 0001](docs/adr/0001-build-our-own-guidance-engine.md).

Full detail: **[docs/architecture.md](docs/architecture.md)**.

---

## Quick start

### Mark up your UI

```tsx
<button data-guide="clients.create" onClick={openCreateClient}>
  New Client
</button>
```

`data-guide` is the recommended convention. `data-ai-id` is also recognised for
compatibility.

Identifiers are dot-separated lowercase segments — `clients`, `clients.create`,
`settings.form.save`. The leading segments act as a feature namespace.

### Index your project

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

Product graph written to:

.statewave-guide/application.json
```

The output is byte-identical between runs over unchanged source — no timestamps,
no absolute paths — so you can commit it and review changes to your product model
in a diff. If you would rather regenerate it in CI, add `.statewave-guide/` to
your `.gitignore`.

Optional configuration in `statewave-guide.config.ts`:

```ts
import { defineConfig } from '@statewavedev/guide-indexer';

export default defineConfig({
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['**/*.test.*', '**/node_modules/**'],
});
```

### Wire up the runtime

```tsx
import { createActionRegistry } from '@statewavedev/guide-actions';
import { createGuideRuntime, createStaticKnowledgeProvider } from '@statewavedev/guide-core';
import { StatewaveGuideProvider } from '@statewavedev/guide-react';
import { useNavigate } from 'react-router-dom';

const guide = createGuideRuntime({
  actions: createActionRegistry(),
  knowledgeProvider: createStaticKnowledgeProvider(productModel),
});

function App() {
  const navigate = useNavigate();

  return (
    // `highlight` and `scroll` are registered for you.
    // `navigate` is registered only because you supplied it —
    // the React package does not own your routing.
    <StatewaveGuideProvider runtime={guide} navigate={({ route }) => navigate(route)}>
      <Routes>…</Routes>
    </StatewaveGuideProvider>
  );
}
```

### Register elements and guide the user

```tsx
import { GuideElement, useGuide, useGuideElement } from '@statewavedev/guide-react';

// Either wrap a child…
<GuideElement id="clients.create" type="button" description="Creates a new client">
  <button data-guide="clients.create">New Client</button>
</GuideElement>;

// …or use the hook.
function CreateButton() {
  const ref = useGuideElement({ id: 'clients.create', type: 'button' });
  return <button ref={ref}>New Client</button>;
}

// Then guide.
function Helper() {
  const { highlightElement, scrollToElement, clearHighlight } = useGuide();

  return (
    <button onClick={() => highlightElement('clients.create', { message: 'Start here' })}>
      Show me
    </button>
  );
}
```

Both registration paths set `data-guide` on the real node, so the attribute the
indexer read in source is the attribute present in the live DOM.

---

## Example

[`examples/react-demo`](examples/react-demo) is a small React + Vite + React Router
application with Dashboard, Clients, Client Details and Settings pages. It has a
developer panel whose buttons trigger the guidance actions directly, so you can
watch a semantic id travel through the action runtime, the React registry and the
highlight engine.

```bash
pnpm install
pnpm build
pnpm dev:example
```

It contains no AI and no chat. It exists to prove that

```
semantic product element + action runtime + React registry + our guidance engine
```

works end to end.

---

## Local development

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
pnpm build          # builds every package, in dependency order
pnpm test           # runs every package's tests
pnpm typecheck      # run after build — packages typecheck against each other's dist
pnpm lint
pnpm verify         # build + typecheck + test + lint + format:check
```

Run the indexer against the demo app:

```bash
pnpm build
pnpm index:example
```

A note on the setup: packages resolve each other through `node_modules` → `dist`,
exactly as a published consumer would, so a type that fails to survive declaration
emit fails here rather than in the wild. That is why `typecheck` wants a build
first. Vitest and Vite alias to source, so the inner development loop needs no
build step.

---

## Roadmap

Statewave Guide is being built in public, in stages. Day 0 and Day 1 are done;
everything below them is **not yet implemented**.

|           | Milestone                             | Status                                                                         |
| --------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| **Day 0** | Semantic elements and guidance engine | ✅ Source → graph → registry → highlight, end to end                           |
| **Day 1** | Application understanding             | ✅ Symbol resolution, call graph, services, HTTP, backend join, evidence model |
| **Day 2** | Product Model generation              | Turn the structural graph into a product-shaped model of features              |
| **Day 3** | OpenAPI and schema ingestion          | Extract capabilities and shapes from API contracts                             |
| **Day 4** | AI semantic enrichment                | Explain extracted facts, with enriched claims kept distinguishable             |
| **Day 5** | Statewave memory adapter              | A `MemoryProvider` backed by Statewave, as a separate package                  |
| **Day 6** | Conversational runtime                | A `ModelProvider` returns _action requests_; the registry still validates them |
| **Day 7** | Dynamic multi-step guidance           | Sequences composed at request time rather than authored in advance             |

### Provider Reality Check — the next evaluation, not yet run

Closed Loop #3 measured the **verifier**, not a model. No provider credentials were
configured, so every semantic number in this repository comes from a deterministic
stand-in returning scripted responses.

That answers "does the verifier fail closed?" — it does not answer "how often does
a real model try to fabricate?". The evaluation that would:

Run the same evidence packs and the same gold set across several providers and
measure, per provider: unsupported factual claims proposed · claims rejected, by
reason · accepted factual correctness against the gold set · language quality ·
input and output tokens · latency · cost.

Until that runs, treat "276 hostile assertions blocked" as a statement about the
verifier and nothing else.

### Later

- GitHub connector
- Git diff incremental indexing
- Playwright verification of extracted knowledge
- Product and version-aware knowledge
- Personalised guidance driven by memory
- Vue and Svelte adapters
- Tauri adapter
- Safe executable actions
- Confirmation workflows

## What is not built yet

Stated plainly, so nothing above is mistaken for a promise:

- **No AI.** No model SDK, no prompt templates, no conversational loop, no
  embeddings. The `ModelProvider` interface exists and is deliberately unused.
- **No Statewave integration.** The memory port is designed so Statewave can
  implement it. It does not yet.
- **No Product Model generation.** The indexer produces an application graph of
  nodes and relationships; turning that into a product-shaped model of _features_
  is Day 2.
- **An incomplete graph, on purpose.** Dynamic dispatch, runtime modal registries
  and computed paths do not resolve, and we do not guess at them. See the
  per-relationship precision and recall in
  [docs/quality.md](docs/quality.md) and the diagnostics the indexer emits where
  it declines.
- **No confirmation UI.** The risk model is enforced — `confirm` and `restricted`
  actions are refused for agents — but nothing asks the user yet.
- **No multi-step guidance.** `startGuide` is in the action vocabulary; the engine
  behind it is not built.
- **Minimal visuals.** The highlight engine is deliberately plain. Proving the
  architecture came first.
- **Vue, Svelte and Tauri adapters** do not exist. The core is framework-free so
  they can.

## Contributing

Early days, and the architecture is still moving. The most useful contributions
right now are issues that poke at the boundaries described in
[docs/architecture.md](docs/architecture.md).

House rules: strict TypeScript, no `any`, small composable modules, JSDoc on
public APIs, and no new runtime dependencies without a good reason.

## License

[Apache-2.0](LICENSE)
