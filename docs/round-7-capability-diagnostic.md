# Round 7 — capability evidence diagnostic

> **This is not the Round 7 usefulness evaluation.** The scored package was not provided, so no
> scores have been imported and nothing here reports a Round 7 result. This is the work that does not
> depend on them: why verified capabilities do not survive into the ProductModel, and what a next loop
> could and could not recover.

## Two corrections to my own earlier analysis

Both were found by re-reading the code rather than reasoning from the schema, and both change the
recommendation.

**There is no `capability/view` hazard.** I computed that all 21 features could mint a `view`
capability on node kind alone, and that was wrong. `capability/view` declares
`httpMethods: ['GET']`, and `evaluateMethods` (`verifier.ts:414`) is **conjunctive and fails
closed**: with no `api` node among the cited targets it returns `UNKNOWN_ENDPOINT` — _"the claim
cited no endpoint the graph contains"_. I read `nodeKinds` as sufficient. Measured properly, exactly
**one** feature can mint `view` today: `client-detail.audit`, on a real `GET` endpoint. The rule is
already the strictest thing holding this line and must not be tightened.

**There is no capability-level `NO_CLAIM_PROPOSED`.** I measured that 14 of 21 features have no
capability claim in the frozen Round 2 model and inferred a proposal gap. Running
`planClaimOpportunities` against the live graph shows the planner offers a capability opportunity to
**exactly the 7 features that have one**. The provider was never offered a capability to propose for
the other 14, because the deterministic planner had already refused. That is not a proposal failure;
it is a correct upstream refusal, and it means a provider re-run on today's graph would reproduce
today's seven exactly.

## §12 Capability coverage

|                        | n     |
| ---------------------- | ----- |
| verified capability    | **7** |
| no verified capability | 14    |
| **purpose emitted**    | **4** |

The purpose gate is 4, not 7. `nav.clients` (`navigate`), `settings.form` and `settings.save`
(`submit`) each hold a capability and emit no purpose, because `compilePurpose` excludes both as
mechanisms — a decision from Closed Loop #7 that this loop does not revisit.

**Perfect correlation across all 21:** the four features that emit a purpose are exactly the four that
own a resolved endpoint.

## §13 Why no capability survives — 14 features

| feature                                                                                                                                              | dominant cause                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `clients.error`, `clients.table`, `clients.table.forbidden`, `invoices.list.clear`, `invoices.list.open`, `settings.danger-zone`, `settings.new-key` | **`NO_ACTIONABLE_SUBJECT`** — 7       |
| `clients.export`, `clients.search`, `settings.rotate-key`                                                                                            | **`UNSUPPORTED_CAPABILITY_KIND`** — 3 |
| `client-detail.delete`, `dashboard.new-client`                                                                                                       | **`MISSING_BEHAVIOR_EDGE`** — 2       |
| `client-detail.change-plan`                                                                                                                          | **`MISSING_ENDPOINT_LINK`** — 1       |
| `api.get.partial-clients`                                                                                                                            | **`UNRESOLVED_ENDPOINT_PATH`** — 1    |
| —                                                                                                                                                    | **`NO_CLAIM_PROPOSED` — 0**           |

Two of these deserve their detail, because they are the ones that look most recoverable and are not.

**`client-detail.delete` does not delete anything.** `onClick={askToDelete}`, and `askToDelete`'s
entire body is `confirmDelete.open()` — `useCallback(() => setIsOpen(true))`. The button provably
**flips a boolean**. The deletion lives in `confirmDeleteClient`, handed to
`<ConfirmDeleteDialog onConfirm={…}>` and invoked from a different element labelled
`Delete permanently`. The label `Delete` and `permission:clients:delete` are the only things
suggesting otherwise, and neither is behaviour. Recovering the prop hop would attach
`capability/delete` to a control that **is not one of the 21 features** — 69 candidates exist and 21
were modelled.

**`client-detail.change-plan` issues a write no server route serves.**
`clientService.save({plan}, clientId, 'patch')` takes the HTTP verb as a **parameter**, so the module
holds no endpoint fact; and `grep -rn patch backend/src` returns nothing — the backend serves `PUT`.
Recovering the link would materialise a frontend-only `PATCH` endpoint. That is a defect report, not
help text.

## §14 Evidence sources

Owned outgoing edges across the 21 features, against what any capability rule accepts:

| edge                  | owned  | accepted by                  |
| --------------------- | ------ | ---------------------------- |
| `calls`               | 19     | —                            |
| `contains`            | 19     | —                            |
| `requires_permission` | 11     | `permission`, `constraint`   |
| **`invokes`**         | **10** | **nothing**                  |
| `submits_to`          | 7      | `create`, `update`, `submit` |
| `uses_service`        | 5      | —                            |
| `calls_api`           | 4      | `create`, `update`, `delete` |
| `navigates_to`        | 1      | `navigate`                   |
| `opens`               | 1      | nothing                      |

`invokes` is the second most common owned behaviour edge and **no capability rule accepts it**. That
looks like the obvious gap and it is a trap: 14 of its 23 instances are backend `api → controller`,
and probing all 21 features against the real verifier, **not one refusal names a missing relationship
`invokes` would supply**. "This button invokes a handler" proves a handler runs. A terminal fact —
an endpoint, a form submission, a destination — has to finish the job.

## §16 Target features

| feature                   | what the source proves                                                                           | recoverable?                |
| ------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------- |
| `dashboard.new-client`    | `handlers[label] ?? startClientCreation` — dynamic dispatch                                      | No, and deliberately so     |
| `clients.search`          | a dataflow chain no relationship expresses; and `GET /api/clients` proves listing, not searching | No                          |
| `settings.form`           | a real update: `saveSettings` → `settingsService.save` → `PUT /api/settings`                     | **Yes**, via an indexer gap |
| `settings.new-key`        | a `<code>` holding a value                                                                       | No                          |
| `clients.table`           | a labelled Delete button with no behaviour edge                                                  | No                          |
| `clients.error`           | a conditional `<p>`                                                                              | No                          |
| `api.get.partial-clients` | a legacy router never statically mounted; path is `?/clients`                                    | No                          |
| `settings.danger-zone`    | a `<section>`                                                                                    | No                          |
| `invoices.list.open`      | `selectRow` sets local state                                                                     | No                          |

## §17 Entry screen names — reported, not fixed

**All 17 synthesised entry steps take their screen name from `screenNameFrom(componentName)`** — a
code identifier with its suffix stripped and its camel case split. Not one is backed by user-visible
evidence. It is the last identifier-derived string in user-facing output.

It is also almost entirely cosmetic, which I did not expect. Four of the five routes have a nav link
with a real visible label pointing at them, and **the labels are byte-identical to the derived
strings**: `ClientsPage → "Clients"` and `element:nav.clients` reads `"Clients"`; likewise
`Dashboard`, `Invoices`, `Settings`. Backing 13 of the 17 steps with the existing `navigates_to` edge
would change **zero user-visible characters**.

The remaining 4 are `/clients/:clientId → "Client Detail"`, which appears nowhere in the interface and
has no nav link. Enforcing the rule without an answer for those would delete the entry step from four
working task flows.

**Naming debt, not capability authority.** It deserves a regression test and a decision about the four
orphans, not a loop.

## §18 Recommendation

**Closed Loop #9 — Capability Evidence Recovery _and Model Re-capture_.** The rename is the
recommendation.

Recovery alone measures **zero**. Two things were measured on an injected graph rather than predicted:
the recovered delete capability lands on `client-detail.delete-dialog.confirm`, a candidate the frozen
model does not contain; and recovering the settings endpoints makes the planner offer `constraint` and
`permission` claims that the frozen model also does not contain, so `conditions` stays `[]`. A
re-capture alone measures zero too, since the planner already offers everything provable. **The two
together are the smallest unit that ships anything.**

Realistic yield: **three purposes, one of them good.** _"Lets you delete a client."_ on the confirm
control — the one destructive fact a reader most needs stated, attributed to the control that actually
performs it. The other two are `settings.form` and `settings.save` both emitting _"Lets you change a
setting."_ — weak, and byte-identical to each other.

**Do first, before anything raises endpoint reachability:** require a capability's witness endpoint to
be observed on **both** sides — `observedOn ⊇ {frontend, backend}`. The field already exists and
`candidates.ts` already uses exactly this test. Measured cost today: **zero**. Without it, recovering
the settings endpoints emits _"Lets you create the rotate api key for a setting."_ — a false purpose
about a credential replacement, on a POST no backend serves, produced by the double-grounding check
working exactly as designed and landing on nonsense because the path echoes the button.

**Never:** an `invokes`-based rule; a permission co-gating join (`element:invoices.create-form.amount`,
a numeric text field, carries `requires_permission → invoices:create` — that rule asserts an amount
input creates invoices); a rule for `import`/`export`/`search`/`send`; loosening **or tightening**
`capability/view`; reading anything from a label or an element type.

## What stays unrecoverable

`clients.search` and `clients.export` by construction. `settings.rotate-key` — rotation is not
create/update/delete/view/submit/navigate, and inventing an action for it is the ADR 0015 failure one
layer down. `dashboard.new-client` — dynamic dispatch, forever. `api.get.partial-clients` — the legacy
router is never statically mounted.

And the seven `NO_ACTIONABLE_SUBJECT` features. Display elements, containers and local-state toggles.
No indexer work and no matrix rule extracts behaviour from a `<code>` tag or a `setSelected(id)`. On a
real codebase these are the **majority** of `data-guide` targets, and any rule loose enough to give
them a purpose gives one to all of them.
