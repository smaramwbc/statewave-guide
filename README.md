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
> This is the **Day 0 foundation**: clean architecture, strong types, and a
> working end-to-end path from a `data-guide` attribute in source code to a
> spotlight on the live DOM.
>
> There is **no AI in this repository yet** — no model SDK, no prompts, no chat.
> There is no Statewave dependency yet either. What exists is the substrate those
> things will be built on. See the [roadmap](#roadmap) for what is coming and the
> [what is not built yet](#what-is-not-built-yet) section for what is honestly
> missing.

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

(One seam, stated plainly: `createElementRegistry()` is exported for hosts wiring
the engine themselves, and what it returns does structurally carry a node
resolver. That is reachable only by host code which already has `document` — never
through a hook, the provider, or anything an agent can name. See
[docs/architecture.md](docs/architecture.md#the-dom-boundary).)

Actions also declare how consequential they are:

| Risk         | Examples                          | Behaviour                                     |
| ------------ | --------------------------------- | --------------------------------------------- |
| `safe`       | navigate, highlight, scroll, open | always allowed                                |
| `confirm`    | save, send, archive               | agent requests refused until a human confirms |
| `restricted` | delete, pay, sign                 | never shown to an agent at all                |

Day 0 enforces the classification. The confirmation UI is roadmap work — see
[docs/architecture.md](docs/architecture.md#actions).

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

Statewave Guide is being built in public, in stages. Everything below is **not yet
implemented**.

|           | Milestone                        | What it adds                                                                                               |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Day 1** | Product Model generation         | Turn the structural application graph into a product-shaped model of features                              |
| **Day 2** | React + Node relationship graph  | Connect UI elements to the handlers, endpoints and data they touch                                         |
| **Day 3** | OpenAPI, Zod and route ingestion | Extract capabilities and shapes from API contracts and schemas                                             |
| **Day 4** | AI semantic enrichment           | Explain and describe extracted facts, keeping enriched claims distinguishable from deterministic ones      |
| **Day 5** | Statewave memory adapter         | A `MemoryProvider` backed by Statewave, as a separate package                                              |
| **Day 6** | Conversational runtime           | Wire a `ModelProvider` in; a model returns _action requests_, which the registry still validates and gates |
| **Day 7** | Dynamic multi-step guidance      | Sequences composed at request time rather than authored in advance                                         |

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

- **No AI.** No model SDK, no prompt templates, no conversational loop. The
  `ModelProvider` interface exists and is deliberately unused.
- **No Statewave integration.** The memory port is designed so Statewave can
  implement it. It does not yet.
- **No Product Model generation.** The indexer produces a structural application
  graph; converting it into features is Day 1.
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
