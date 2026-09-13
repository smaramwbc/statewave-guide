# Host integration

The path from _your_ application to a working, memory-backed guide. The reference implementation of
every step is [`examples/guide-e2e`](../examples/guide-e2e) — a deliberately small CRM with the
panel mounted, a memory backend, and every scenario the gates exercise. When this page and that code
disagree, the code is newer; file an issue.

Two tiers, adopt them in order:

1. **Guidance** — the panel answering questions about your product, with Show me and Step through.
   Needs no server and no keys.
2. **Durable memory** — the guide remembering people across browsers. Needs your backend and a
   Statewave server.

---

## Tier 1 — guidance

### 1. Name your controls

```tsx
<button data-guide="clients.create" onClick={openCreateClient}>
  New Client
</button>
```

Dot-separated lowercase segments; leading segments are the feature namespace. These ids are the
stable spine everything else hangs on — the graph, the runtime registry, the highlight target.

### 2. Build the knowledge bundle

```bash
node <statewave-guide>/packages/indexer/dist/cli.js .
node <statewave-guide>/packages/semantic/dist/cli.js enrich . --provider mock --docs
```

The first writes `.statewave-guide/application.json` (the evidence-backed graph); the second writes
the verified product model (`product.json`) and, with `--docs`, documentation projected from it.
`--provider mock` is the only provider the CLI constructs, and it is deterministic and free. Real
providers (Anthropic, OpenAI-compatible) are used programmatically — pass one to
`enrichApplicationGraph()` from `@statewavedev/guide-semantic` — and go through the identical
verifier: a provider can propose meaning, never facts.

Build the guide bundle your app will import the way the demo does
(`scripts/build-guide-bundle.mjs` in this repo assembles product model + guidance into one JSON; the
demo imports it directly).

### 3. Mount the panel

The demo host's [`main.tsx`](../examples/guide-e2e/src/main.tsx) is the complete wiring, commented.
The skeleton:

```tsx
import { StatewaveGuide, useGuideMemory } from '@statewavedev/guide-react';
import { createGuideQueryEngine } from '@statewavedev/guide-core';
import bundle from './guide-bundle.json';

const engine = createGuideQueryEngine({ bundle });

// inside your app shell:
const memory = useGuideMemory({
  enabled: true,
  appId: 'your-app',
  subjectId: currentUser.id, // see the id-shape warning below
  workspaceId: currentWorkspace?.id, // optional; one scope per workspace
  applicationVersion: bundle.applicationVersion,
  store, // local, remote, or absent — Tier 2
});

<StatewaveGuide
  open={guideOpen}
  onClose={() => setGuideOpen(false)}
  ask={(q) => engine.query({ query: q, context: currentRuntimeContext() })}
  execute={(action) => runtime.execute(action)} // Show me / Step through act through this
  onMemoryEvent={memory.record}
  presentationFor={memory.plan}
  memoryDiagnostics={memory.diagnostics}
  developer={isDev}
/>;
```

What the host owes the panel beyond this: the runtime context (route, visible semantic ids,
snapshot id) on every query, and the docked-layout CSS if you dock it. Copy the demo.

### Permissions — optional, and a claim of completeness

`context.permissions` lets the guide settle a condition against the person asking, rather than
stating it in the abstract ([ADR 0034](adr/0034-a-permission-is-the-hosts-to-assert-and-the-guides-to-repeat.md)):

| you report                         | the guide says                                 |
| ---------------------------------- | ---------------------------------------------- |
| nothing (the field is absent)      | You need permission to create a client.        |
| a list containing `clients:create` | You have permission to create a client.        |
| a list without it                  | You do not have permission to create a client. |

Read the third row twice before you wire this up. **Reporting the field asserts that the list is
complete** — a permission absent from it is one the guide will tell your user they do not have. A
partial list produces an answer that is confidently wrong, which is worse than the abstract sentence
it replaces. Leave the field out and you keep the first row, which is where every host starts.

`undefined` and `[]` are different: absent means "I was not told", empty means "this user holds
nothing", which is what a signed-out session is. Strings are compared exactly against the
identifiers the ProductModel compiled out of your source — no normalisation, no prefix matching, no
case folding. Report the same list your own authorisation checks consult, from the same place:

```tsx
const guide = useGuideQuery({
  engine,
  registry,
  route: location.pathname,
  permissions: session.permissions, // the list `can()` reads, not a second copy
});
```

Steps are never pruned by a permission. A user who cannot create a client is often a user about to
ask somebody who can, and a walkthrough that vanishes tells them nothing to ask for.

### Letting the walkthrough keep up — optional

By default the panel never touches your application: it points, and the user acts. Pass
`stepInteraction` and two things change
([ADR 0035](adr/0035-a-guide-may-open-the-task-it-may-not-finish-it.md)):

```tsx
const stepInteraction = useMemo(() => createStepInteraction(registry), [registry]);

<StatewaveGuide … stepInteraction={stepInteraction} />;
```

- **The walkthrough advances when the user does the step**, so pressing **New client** in your app
  does not also require pressing **Next** in the panel.
- **A "Do it for me" button appears** on steps the guide is permitted to take.
- **"Show me" demonstrates** — it enters the walkthrough, takes the steps it may, and hands over at
  the first one only the user can do ([ADR 0036](adr/0036-every-answer-has-a-next-move.md)).

Which steps those are is not yours to configure and not the panel's to decide — it comes off each
step's compiled `role`:

| the step           | a guide may | why                                         |
| ------------------ | ----------- | ------------------------------------------- |
| opens the task     | yes         | a dialog that opens is undone by closing it |
| supplies data      | no          | the record being written is the user's      |
| commits the change | **no**      | pressing it _is_ the change                 |

So the guide will press **New client** and will never press **Create client**. Leave
`stepInteraction` out and you get the previous behaviour exactly: no watching, no pressing, nothing
in this package reaching into your DOM to operate it.

**Refusals are a feature.** Ask the demo something the product cannot do — the answer is
_"I do not have anything verified about that."_ If your integration ever makes that sentence rare,
something upstream is inventing facts; see [refusals.md](refusals.md).

---

## Tier 2 — durable memory

The browser never holds a Statewave credential and never talks to Statewave
([ADR 0032](adr/0032-remote-memory-persists-experience-not-authority.md)). The shape is:

```
browser (createRemoteGuideMemoryStore, no secrets)
   → your backend (holds the StatewaveClient)
      → Statewave
```

### 1. Statewave prerequisites

| requirement                                      | why                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statewave server **≥ 1.5.0**                     | `newest_first` / `limit` / `status` on the timeline. An older server accepts the parameters and silently ignores them; the adapter detects the missing `episodes_has_more` flag and reports `REMOTE_DEGRADED` with the reason — but detection is not a substitute for upgrading. |
| `@statewavedev/sdk` **^1.5.0** in _your backend_ | the adapter calls `getTimeline(subject, { limit, newestFirst })`; on the 1.4 SDK those parameters land in the ignored options slot and you silently read the oldest window.                                                                                                      |
| an `X-Tenant-ID`                                 | registered claim keys are tenant-scoped; the untenanted path reads no tenant config at all. Set it on the `StatewaveClient` in your backend, never from the page.                                                                                                                |
| the claim keys registered, once                  | the PATCH below. Without it, preference memory falls back to replaying episodes — correct, but unbounded by the number of changes.                                                                                                                                               |

Register **both** preference keys (one PATCH, operator action, per tenant):

```bash
curl -X PATCH http://<statewave>/admin/tenants/<your-tenant>/config \
  -H 'Content-Type: application/json' \
  -d '{"claim_keys": {
        "guide.preference.guidancedetail": "single",
        "guide.preference.assistancemode": "single"
      }}'
```

`single` is what makes a later choice supersede an earlier one instead of coexisting with it.

### 2. Your backend

Three endpoints, prefix of your choosing (the browser store takes `endpoint`):

| route                              | does                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| `POST <endpoint>/events`           | body `{ event }` → validate → `store.append(event)`                   |
| `GET <endpoint>/events?scope=…`    | → `store.read(scope)` → `{ events }` — events only, never diagnostics |
| `DELETE <endpoint>/events?scope=…` | → `store.clear(scope)` — this is "reset guide memory"                 |

where `store = createStatewaveGuideMemoryStore({ client })` from
`@statewavedev/guide-statewave`, and `client` is your `StatewaveClient` with the credential and
tenant id.

**The one rule that is not optional:** derive the subject from _your authenticated session_ and
ignore any scope identity the page claims. An endpoint that trusts the client's scope lets any page
read, write and **delete** any user's guide memory. The demo backend trusts the page — its fixture
has no accounts — and says so in its status response (`subjectTrust: CLIENT_ASSERTED_DEMO_ONLY`) so
it cannot be mistaken for a pattern. Apply your normal auth and rate limiting; it is your endpoint.

Also worth copying from [`memory-backend.mjs`](../examples/guide-e2e/memory-backend.mjs): reset
clears **one scope** — a person in three workspaces is three subjects, so a global "forget me"
button must clear all three.

### 3. Subject id shapes — read this before your memory is silently empty

The validator refuses identifiers shaped like runtime instance labels (`INV-001`) so screen text can
never become identity. The same rule refuses ordinary ids like **`user1024`** and **`tenant01`** —
2–8 letters followed by digits. If your user ids look like that, nothing is stored and the only
signal is `rejectedOnWrite` climbing in the diagnostics. Use UUIDs, or any id that does not match
that shape. (`applicationVersion` is exempt from the long-hex rule so build digests work; every
other secret shape still applies to it.)

### 4. Knowing it works — the degradation table

Every failure below costs personalisation only; answers were computed before memory was consulted,
so guidance never blocks and never errors. The signals, from `memory.diagnostics` (browser) and
`store.diagnostics()` (backend):

| situation                         | behaviour                                                          | the signal                                                |
| --------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Statewave down / endpoint dead    | reads return absence; first-time experience                        | `mode: REMOTE_DEGRADED`, `readFailures` / `writeFailures` |
| server < 1.5.0                    | events still returned, window untrustworthy                        | `truncatedReads`, `lastFailure: "…predates pagination…"`  |
| no tenant, or keys not registered | preferences replay from episodes — correct value, unbounded growth | backend `activeClaims: 0` on every read                   |
| keys registered and working       | one active value per preference                                    | backend `activeClaims ≥ 1`                                |
| id shape refused                  | nothing persisted, silently                                        | `rejectedOnWrite` > 0                                     |
| policy withholding (by design)    | `GUIDANCE_VIEWED` etc. never leave the page                        | `withheldByPolicy` — not an error                         |
| memory=off / no store             | neutral presentation, everything works                             | `enabled: false`                                          |

`activeClaims` is the number that answers _"is bounded preference state actually on?"_ — it lives on
the backend adapter's diagnostics; expose it to yourself however you expose backend metrics.

### 5. What ends up stored

Counters and choices from a closed vocabulary — never questions, answers, DOM text, names, or
anything typed. One durable record per completed guide per build (repeats are idempotent no-ops),
one active claim per preference. The full privacy posture, with the evidence: [trust.md](trust.md).
