# Confidence and evidence

Every relationship in the application graph carries at least one piece of evidence and exactly one
confidence value. This document defines what those values mean and which rules are allowed to claim
them.

It exists because a confidence number nobody can explain is worse than no number at all: it invites
downstream consumers to threshold on noise. There are three values. There will only ever be a small
number, and adding one requires adding a row here.

## The governing rule

> **No evidence, no relationship. Unknown is better than wrong.**

A relationship that cannot name the file, the line and the reason that produced it is not recorded —
not recorded with low confidence, not recorded with a caveat, not recorded at all. This is enforced
in code: `createRelationship()` throws when handed an empty evidence list, so the rule cannot be
bypassed by a careless extractor.

When the indexer declines to record something, it emits an [`IndexerDiagnostic`](#diagnostics)
instead. A gap that produces a diagnostic is a finding. A gap that produces silence is a bug.

## Why this is strict

The deterministic graph is the factual substrate a later AI layer will consume. A hallucination that
originates _here_ is far more dangerous than one that originates in a model, because it arrives
wearing the authority of static analysis and nothing downstream will question it.

Precision is therefore worth more than recall. A graph that knows 70% of an application and is right
about all of it is more useful than one that knows 95% and is quietly wrong about a tenth.

## Evidence types

| Type                   | Meaning                                                               | Used today |
| ---------------------- | --------------------------------------------------------------------- | ---------- |
| `source`               | Read directly from the syntax tree. The strongest kind.               | ✅         |
| `static-inference`     | Derived by a named rule from several source facts. Must carry `rule`. | ✅         |
| `test`                 | Observed in a test file.                                              | reserved   |
| `openapi`              | Read from an OpenAPI document.                                        | reserved   |
| `documentation`        | Read from prose documentation.                                        | reserved   |
| `runtime-verification` | Confirmed by executing the application.                               | reserved   |

There is deliberately **no `ai` evidence type**. When semantic enrichment arrives it gets its own
type, so an enriched claim can never become indistinguishable from an extracted one.

## The confidence scale

### `1.0` — direct syntactic relationship

The fact is written in a single expression, in a single file, and reading it requires no resolution
step. If the source says it, the graph says it.

```tsx
<Route path="/clients" element={<Clients />} />   // route → renders → Clients
<button data-guide="clients.create" onClick={openCreateClient}>   // element → invokes → openCreateClient
```

Both endpoints are visible at the same place in the same file. There is nothing to be wrong about
short of a parser bug.

### `0.95` — deterministically resolved symbol relationship

The fact spans files, but every hop was resolved by following an import to **exactly one**
declaration, with no ambiguity at any step.

```ts
import { createClient } from '../services/clientService';
await createClient(values); // submit → calls → clientService#createClient
```

Not `1.0`, because resolution is a step that can be wrong — a shadowed binding, a barrel that
re-exports two things of the same name, a path alias resolving somewhere unexpected. The resolver
returns `undefined` on any ambiguity rather than picking, so a `0.95` edge means "one candidate, and
only one".

### `0.9` — strong static inference under an explicit named rule

Several source facts were combined by a rule from the closed `InferenceRule` union. The rule is
recorded on the evidence, so any edge at this level can be traced to the exact reasoning that
produced it.

```tsx
const [createOpen, setCreateOpen] = useState(false); // (a)
function openCreateClient() {
  setCreateOpen(true);
} // (b)
return <>{createOpen && <NewClientDialog />}</>; // (c)
// → openCreateClient --opens--> NewClientDialog
```

All three conditions must hold and must refer to the same binding. Remove any one and the edge is not
emitted.

## The rule catalogue

Every rule that may claim `static-inference`. This union is closed; adding a member means adding a
row here.

| Rule                               | Confidence | What it combines                                             | Refuses to fire when                                              |
| ---------------------------------- | ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `jsx-handler-identifier`           | 1.0 / 0.95 | A handler prop and the function binding it names             | The prop is a spread, or the value arrives through an object      |
| `import-symbol-resolution`         | 0.95       | An import specifier and the declaration it names             | Two candidates, a bare package specifier, or a dynamic `import()` |
| `state-flag-gates-element`         | 0.9        | A `useState` pair, a setter call, and the JSX the flag gates | Any of the three is missing, or they name different bindings      |
| `object-literal-service`           | 0.95       | A module-scope const and its function-valued members         | The object is built dynamically                                   |
| `http-client-member-call`          | 0.95       | A client binding, its `baseURL`, and a method call           | The method name is computed                                       |
| `module-constant-string`           | 0.95       | An identifier and its string-literal initialiser             | The constant is not module-scope, or not a literal                |
| `router-handler-identifier`        | 0.95       | A route registration and its handler identifier              | The handler is an inline expression that resolves nowhere         |
| `configured-permission-recogniser` | 0.95       | A configured recogniser name and a string-literal argument   | The function is not in the configured list                        |
| `form-submit-wrapper`              | 0.9        | An `onSubmit` wrapper call and the inner handler it wraps    | The wrapper's argument is not a resolvable identifier             |

Note the last column. A rule is defined as much by what it refuses to do as by what it does. The
refusals are catalogued in full in [docs/refusals.md](refusals.md).

## Diagnostics

Where the indexer declines to record a relationship, it records why. These are machine-readable so a
consumer can distinguish "there is nothing there" from "we could not tell".

| Code                          | Meaning                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `UNRESOLVED_DYNAMIC_CALL`     | A call whose callee is not statically knowable                |
| `UNRESOLVED_DYNAMIC_ROUTE`    | A navigation target that is not a static string               |
| `UNRESOLVED_API_PATH`         | An HTTP call whose path is not statically knowable            |
| `UNRESOLVED_IMPORT`           | An import that could not be resolved within the project       |
| `UNRESOLVED_MODAL_REGISTRY`   | A modal opened by a string key with no discoverable registry  |
| `UNRESOLVED_PERMISSION`       | A permission argument that is not a static string             |
| `UNSUPPORTED_FORM_PATTERN`    | A form whose submit handler could not be traced               |
| `UNSUPPORTED_ROUTING_PATTERN` | A router registration shape the extractor does not understand |
| `PARSE_FAILURE`               | A file that failed to parse                                   |

## What this deliberately does not do

- **No probabilistic scoring.** There is no model producing a similarity number.
- **No name matching.** `CreateClientButton` does not imply `POST /clients`. `clientService.create`
  is not linked to `createClient` because the names look alike.
- **No transitive confidence decay.** A path of three `0.95` edges is three `0.95` edges. Multiplying
  them would produce a number with no defensible meaning.
- **No "probably" tier.** There is no 0.5. If we would have to write 0.5, we write a diagnostic.
