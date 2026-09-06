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

## The deterministic layer and the semantic layer

Two layers, and which one is authoritative is the whole design.

```
SOURCE
  ↓  deterministic analysis — ts-morph, no model
FACT GRAPH            ApplicationGraph      ← authoritative
  ↓  semantic enrichment — a model, bounded and checked
VERIFIED PRODUCT MODEL  product.json        ← authoritative for meaning
  ↓  projection
DOCS · future chat · future tooltips · future guides
```

**The ApplicationGraph is authoritative for what exists.** Every node and edge
came from source, carries evidence, and was produced without a model. Nothing in
the semantic layer may contradict it, and nothing may add to it.

**The Product Model is authoritative for what things mean** — and only to the
extent each claim survived verification. It never _replaces_ the graph; every
claim points back into it.

> Code determines what exists. AI may explain what verified facts mean.

The critical direction is that the ProductModel is the **render source**, not a
staging area for documentation:

```
ApplicationGraph → verified ProductModel → ├── docs
                                          ├── future chat
                                          ├── future tooltips
                                          └── future interactive guides
```

and **not**

```
ApplicationGraph → generated Markdown → future knowledge base
```

Markdown is one projection among several. Treating it as the asset would mean the
next consumer parses prose to recover facts the model already holds structurally —
which is how a documentation system becomes a second source of truth to maintain.
See [ADR 0008](adr/0008-documentation-is-output-not-source-of-truth.md).

### The semantic pipeline

Between the graph and the Product Model there are more stages than "ask a model",
and all but one of them are deterministic:

```
ApplicationGraph          authoritative facts, no model involved
      ↓
FeatureCandidate          one guide element and the code reachable from it
      ↓
FeatureScope              deterministic ownership — what this feature may speak about
      ↓
EvidencePack              seeded from the ownership closure, then widened for context
      ↓
ClaimOpportunities        claims the graph already supports, each proved through
                          the verifier before it is offered
      ↓
model selects or declines the only step a model performs
      ↓
Verifier                  the selected claim re-checked against the graph
      ↓
ProductModel              accepted and rejected claims, both persisted
      ↓
GuidanceIR                what a user should be told — selection and arrangement,
                          never addition
      ↓
Renderer                  deterministic phrasing — Markdown, and whatever comes after it
```

The model's position in that list is the design. It is handed a bounded set of
things it is already known to be allowed to say, it chooses among them and writes
the sentence, and what it chose is checked again on the way out. Everything before
and after it is reproducible without a network call.

### Guidance is a projection, not a printout

The last two stages used to be one, and an independent usefulness review found
out what that costs. Rendering a `ProductModel` straight into prose put its
internal vocabulary in front of users: ten of twenty-one features carried the
sentence _"No capability, route or permission has been verified for this
feature"_, and every one of them was flagged as too technical. Two of them
printed it directly above a confident description of what the control does, so
the page disagreed with itself in consecutive lines.

The four layers now answer four different questions.

|                    | Question                           |
| ------------------ | ---------------------------------- |
| `ApplicationGraph` | What does the code do?             |
| `ProductModel`     | What do we know about the product? |
| `GuidanceIR`       | What should we tell the user?      |
| Renderer           | How should we phrase it?           |

`GuidanceIR` selects. A `ProductModel` holds more truth than a guide chooses to
say, and that gap is the point rather than a loss: _"Input is validated before it
is accepted"_ was verified, accurate, and flagged as irrelevant three times,
because it answered no question anyone had asked.

Three rules give the layer its shape. Guidance is assembled from typed
propositions — `perform_action`, `navigate`, `enter_fields`, `confirm_action` and
four more — rather than by joining fragments of claim text, which is how _"submit
the invoices create form form"_ was once produced. Names come from a `HumanLabel`
whose origin is recorded, so a control's visible text may be quoted back to a
reader and a noun derived from an identifier may not. And step order comes from a
role — entry, trigger, container, input, confirmation, result — rather than from
how deep a node sits in the graph, because containment nests the opposite way
from use: a form is _inside_ a dialog that is _opened by_ a button, so sorting by
depth prints the procedure backwards.

What the layer may not do is add. Every proposition carries provenance to the
claims and graph facts behind it, and a check compares the compiled guidance
against the accepted model for every feature. It earned its place on its first
run, catching a step that had quietly defaulted its action to `navigate` and so
asserted a navigation no claim established.

Where nothing can be established, the output is silence and the reason becomes a
developer diagnostic. See [ADR 0012](adr/0012-product-truth-and-user-guidance-are-different-projections.md)
and [ADR 0013](adr/0013-internal-epistemic-state-is-not-user-copy.md).

### Which control a user presses

A verified action claim says something happens. It does not always say what to
press: a `workflow_step` may name its subject as `feature:<id>`, and a
`capability:submit` may sit on a `<form>` — and nobody presses a form. Resolving
that gap is a separate job from verifying the claim, and it runs in three stages
with a fixed precedence.

| Stage        | Resolves                                            |
| ------------ | --------------------------------------------------- |
| **Direct**   | A subject naming an actionable node, to that node   |
| **Root**     | A `feature:` subject, through the candidate's roots |
| **Recovery** | A passive subject, to the control doing its work    |

Nothing here consults the _text_ of an identifier. `feature:clients.export` does
not become `element:clients.export` because the suffixes agree; it becomes that
node only if discovery already recorded the mapping, the scope owns it, and the
graph proves a user can act on it.

Recovery is the third stage and the most tightly bounded. A passive element that
carries `submits_to` or `invokes` to a node the feature **owns** — its _action
surface_ — resolves to the unique actionable element carrying the same edge to
the same surface. `settings.form` reaches **Save changes** because both submit to
`saveSettings`. `settings.danger-zone` reaches nothing, because a `<section>`
submits to nothing at all. Ownership is of the _action_, not of the control:
recovery asks whether the feature owns the work, which is why it cannot borrow a
button that does something else on the same screen.

`navigates_to` is deliberately not an action surface. Two links to `/invoices`
prove only that they lead to the same place. Ambiguity — two controls on one
handler — emits nothing and records `AMBIGUOUS_ACTION_TARGET`. Depth is one edge
out and one edge back, and there is no search: nearby is not ownership. See
[ADR 0014](adr/0014-a-feature-reference-is-not-a-control.md) and
[ADR 0015](adr/0015-action-target-recovery-is-bounded-structural-resolution.md).

### What a sentence may say

A `semantically_grounded` claim is _attached to evidence, not proven true_ — and that was enforced
at the level of the claim, never at the level of what the claim **says**. A sentence is not a unit:
_"Lets an account manager move a client onto the enterprise plan"_ is an actor, an action, an object
and a target state sharing one full stop, and two evidence refs licensed all four.

Measured across Round 5's twenty-one features: **194 user-facing propositions, 97 supported.** The
split decided the design — the summary line, compiled from typed propositions since Closed Loop #4,
was 82% supported; the purpose line, passed through from the model, was 38%.

So no user-facing sentence is passed through. Each is built from propositions that carry their own
support, on the layering the guidance layer already uses:

```
language claim → PurposeIR → realisePurpose
```

A language claim decides **whether** to speak and **which grounded word** to use. It cannot create a
role, a plan tier, a navigation guarantee, a motive or an architectural status — not because a filter
removes them, but because no path exists from a sentence to the page along which one could arrive.

Vocabulary is owned. `settings.rotate-key` may say _API key_ because its own button carries the
words; `settings.danger-zone`, the section wrapping that button, may not. An artifact must be named
twice — by an owned label **and** an owned endpoint path — because a label alone is English on a
button and a path segment alone is an identifier. Questions are compiled the same way: a question
mark does not reduce factual authority. See
[ADR 0017](adr/0017-semantic-language-is-a-projection-of-supported-propositions.md).

### Claims, not documents

`ProductClaim` is the unit. Factual claims (`capability`, `navigation`,
`workflow_step`, `permission`, `constraint`) carry a machine-checkable assertion
and are checked against a verification matrix. Language claims (`purpose`,
`synonym`, `user_question`) interpret, and are never presented as facts.

Three states, never collapsed:

| State                   | Means                                                  |
| ----------------------- | ------------------------------------------------------ |
| `structurally_verified` | The assertion was checked against the graph and upheld |
| `semantically_grounded` | Attached to real evidence — **not** proven true        |
| `rejected`              | Refused, and persisted so the refusal stays visible    |

There is no generic fallback. An assertion the matrix has no rule for is
`EXPLICITLY_UNSUPPORTED`, which says _we did not check_ — different from _we
checked and it is false_, and reported separately so an unverifiable claim never
reads as disproven. Reasoning in
[ADR 0007](adr/0007-ai-enriches-but-does-not-define-product-truth.md) and
[ADR 0009](adr/0009-semantic-knowledge-is-claim-based.md).

### Feature Scope

_"True somewhere in the graph" is not the same as "true for this feature."_

The failure that forced this stage is worth stating exactly, because nothing about
it resembles a hallucination.

`settings.new-key` is a `<code>` element that displays a freshly rotated API key.
Asked to describe it, a real model (`claude-opus-5`) produced, and the verifier
accepted:

> Settings changes are saved by submitting the settings form.

typed as a `capability` with action `submit`, subject `element:settings.form`,
targeting that element and `SettingsPage.tsx#saveSettings`. Nothing in the sentence
is false. The settings form really does submit, the relationships are real and
carry evidence, and every dimension of the capability/submit rule was satisfied.
The verifier checked that the subject was a known identity and that the evidence
was in the feature's pack, and both were true — because an evidence pack is a
neighbourhood, and the sibling was sitting in it. It happened in two runs out of
three.

The structural cause is small and entirely mechanical. `element:settings.new-key`
has zero outgoing relationships. `element:settings.form` has `submits_to`. Both are
contained by `component:…#SettingsPage`. The only route from the feature to the
form goes **up** a `contains` edge into the shared page and back **down** into a
sibling.

**A feature owns what it reaches by walking forward out of its own roots along
behaviour edges. It never owns what it reaches by walking an edge backwards and
descending somewhere else.** Ownership is a path, never a distance.

The rejected alternative was "a node within depth _N_ is owned". It is the same
mistake in a different unit: the borrowed form is two hops from the feature, and so
are a great many nodes that genuinely belong to it. No hop count separates them,
because the thing that separates them is direction.

Every node the graph can see is placed in one of four classes:

| Class        | Reached how                                                           | A claim may                              |
| ------------ | --------------------------------------------------------------------- | ---------------------------------------- |
| `OWNED`      | forward from the feature's own roots, along behaviour edges           | name it as subject or as target          |
| `REACHABLE`  | forward, but past an ownership boundary — the code behind an endpoint | name it as a target, never as subject    |
| `CONTEXTUAL` | ancestry of the roots — the page the feature sits on                  | be positioned by it, not assert about it |
| `OUTSIDE`    | anywhere else, siblings included                                      | not name it at all                       |

Two boundaries end the forward walk. Neither is a hop count; both are semantic.

**The API endpoint is the frontier.** A feature owns the endpoint _identity_ it
calls. The controller, the service, the repository and the `db.query` behind that
endpoint are reachable and may be cited, but they are not the feature. This is the
line between what the product does and how it is built, and it falls on the same
node [ADR 0006](adr/0006-api-endpoint-identity.md) makes the join key, for the same
reason: the endpoint is the one thing both tiers name independently.

**Shared infrastructure is nobody's feature.** Measured fan-in on the realistic-app
fixture: `lib/http.ts#unwrap` has 13 callers, `db.ts#query` 11, `hasPermission` 5,
and `primitives/Button` has 8 incoming `renders`. A feature-specific function has
exactly one. A node that everything reaches describes the codebase rather than any
product capability, and letting one into a feature's scope drags the rest of the
application in behind it.

Two rejection reasons enforce this: `SUBJECT_OUT_OF_SCOPE` and
`TARGET_OUT_OF_SCOPE`. Deliberately _not_ `UNKNOWN_SUBJECT` — the subject is real,
and telling a reader "no such thing" about something that exists sends them looking
for a typo that is not there.

A citation gate alone is not sufficient, because not every claim type names its
evidence precisely. `workflow_step` names only `nodeKinds`, so before a witness
gate was added — requiring the claim's named participants to be in scope, not
merely its evidence to be in the pack — 203 of 203 cross-page citations were
accepted, including `clients.create` describing the settings page.

What the change measures out to, on the same fixture:

- `settings.new-key`: owned set is `{itself}`, `element:settings.form` is
  `OUTSIDE`, and the claim is refused with `SUBJECT_OUT_OF_SCOPE`.
- `settings.form`: the identical claim still verifies. The positive control holds,
  which is what distinguishes a scope rule from a mute button.
- `clients.create`: owns `api:POST:/api/clients` along
  `invokes → opens → renders → submits_to → calls → calls_api`. Its owned node count
  fell from 28 to 20 once backend internals became `REACHABLE`.
- Contextual nodes fell from 14 to 3 once ancestry was seeded from the roots only.
  Before that, `primitives/Button` and its 8 incoming `renders` made SettingsPage,
  InvoicesPage, DashboardPage and ClientDetailPage all "context" for
  `clients.create`.

Two other things had to change to make the rule survivable.

**The indexer now emits `submits_to` from a `type="submit"` control to its enclosing
form's resolved handler**, as a named inference rule (`submit-control-in-form`,
static inference, confidence 0.9). The reason is that `contains` is flat: of 62
`contains` edges in the fixture, none is element→element and every source is a
component. A submit _button_ therefore had no outgoing behaviour of its own and
could only support a submit claim by citing the _form's_ edge — structurally the
same borrowing as the bug. Three features were affected: `settings.save`,
`invoices.create-form.submit` and `clients.create-dialog.submit`. A control that
carries `form="some-id"` from outside the form gets no edge; the fixture's own
footer button names `settings-form` and no element declares that id, so the link is
unprovable and is left unmade.

**The evidence pack is now seeded from the ownership closure before its undirected
breadth-first search.** The search reaches siblings as readily as the behaviour
path, and unseeded it did: `clients.create`'s pack held 13 sibling elements while
omitting every `submits_to` and `calls_api` edge on its own path, so no
capability/create claim could be proved for the flagship feature at all.

### Claim Opportunities

Three participants, and the division of labour between them is the whole idea.

**The graph proposes factual possibilities.** Before a model is asked anything, the
pipeline enumerates the claims this feature's scope can already support — this
element, this action, this endpoint, this permission — and runs each candidate
through the verifier. An opportunity is not a hint or a suggestion. It is a claim
already known to pass. What the model is handed is therefore a menu of true things,
derived deterministically, reproducible without a model.

**The model adds semantic usefulness.** Truth is not the scarce resource here; the
graph has more of it than anyone wants to read. The scarce resource is knowing
which facts a person would care about and how to say them in that person's words.
So the model selects among the opportunities and writes the language, and it may
also decline every one of them. Declining is an ordinary outcome, not a failure: a
feature about which nothing useful can be said should produce nothing, rather than
a sentence written to fill the slot.

**The verifier decides what survives.** A selected claim is checked again on the way
out, against the graph and against the feature's scope, and a rejection is
persisted with its reason. The re-check is not redundant. The opportunity was
proved as offered; what comes back is a claim the model has written, and the text,
the subject and the targets can all differ from what was proposed.

The alternative — let the model write claims freely and lean on the verifier to
catch the bad ones — is what produced the `settings.new-key` sentence. A verifier
can only refuse a claim on a rule it holds. Enumerating the possibilities first
means the model's freedom is spent on wording rather than on choosing what the
feature is about, and choosing what the feature is about is the decision that went
wrong.

---

## Product Model vocabulary

**`@statewavedev/guide-shared` — the vocabulary everything agrees on.**

`ProductFeature`, `ProductClaim`, `ProductWorkflow`, `ProductPermission`,
`SemanticEvidence`, `ProvenanceReference`. Plain data, no behaviour, no
environment assumptions.

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

### Guide memory is a different thing, and reading this section for it is a mistake

`MemoryProvider` above is a general port a host may hand the runtime. **Guide
memory** — Closed Loop #19 — is separate, narrower, and the one that decides how a
returning user is spoken to:

```ts
interface GuideMemoryStore {
  append(event: GuideMemoryEvent): Promise<void>;
  read(scope: GuideMemoryScope): Promise<readonly GuideMemoryEvent[]>;
  clear(scope: GuideMemoryScope): Promise<void>;
}
```

Three methods, no query language, no search, no similarity. A store that could
answer _find me something like this_ would be a second knowledge base, and this
project has exactly one.

**What a host needs to know:**

| question                | answer                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is stored          | Identifiers and counters: a feature id, one of six event kinds, a timestamp, a build id, an authority class                                                               |
| What is never stored    | Questions, answers, DOM text, placeholders, accessible names, instance labels, input values, anything secret-shaped                                                       |
| Where                   | `localStorage` by default — one browser profile, one device. Replaceable with any `GuideMemoryStore`                                                                      |
| Scope                   | `statewave-guide:<appId>:user:<subjectId>[:workspace:<workspaceId>]`. Subject ids are opaque and supplied by the host                                                     |
| Retention               | The browser store keeps the most recent **200** events per scope, oldest dropped first. A cap, not a clock — counters do not improve with age. Another store sets its own |
| How a user is forgotten | The overflow menu's reset, and `clear(scope)` for a host that wants its own control                                                                                       |
| How to switch it off    | Do not pass memory props. The panel then renders exactly as it did before Closed Loop #19                                                                                 |

Memory is presentation-only. It may fold steps, emphasise an action already
offered, and add one sentence from a closed list. It may not establish a fact, an
action, a permission, a route, a title or a semantic id — see
[ADR 0029](adr/0029-memory-remembers-experience-not-truth.md).

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
