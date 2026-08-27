# Round 6 — evidence recovery analysis

> **This is not the Round 6 usefulness evaluation.** The scored package
> `human-review-round-6.scored-gpt56sol.json` was not available, so no scores have been imported and
> nothing here reports a Round 6 result. What follows is the work that does not depend on those
> scores: the review-fact coverage exclusions, and the analysis of the 47 `INDEXER_OMISSION` findings
> from the Closed Loop #7 audit.

## Review-fact coverage exclusions

Closed Loop #7 reported `reviewFactCoverage 50/50 = 100%` with three controls named as outside the
denominator, on the grounds that the interface gives them no readable text. **One of the three was
concealing an emitted action, which is exactly what an exclusion must never do.**

| feature                | node                            | why excluded                                   | in user-facing output?                                  | checkable by the reviewer?     |
| ---------------------- | ------------------------------- | ---------------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `clients.create`       | `element:clients.create-dialog` | a `<div>` with no label and no structural kind | **no** — cited in step provenance, named in no sentence | n/a; 9 other facts shown       |
| `dashboard.new-client` | `element:dashboard.new-client`  | recorded `label: null`                         | **no** — the feature emits no task step                 | n/a                            |
| `invoices.list.open`   | `element:invoices.list.open`    | a `<button>` with no label                     | **YES** — the guide says _"Choose Open."_               | **no. Zero facts were shown.** |

### The one that matters

`invoices.list.open` emits a task step naming a control, and the reviewer's `knownSupportedFacts` for
that item is **empty**. Worse than unverifiable: the source is

```jsx
<button type="button" data-guide="invoices.list.open" onClick={() => selectRow(invoice)}>
  {invoice.number}
</button>
```

The button's visible text is the invoice number at runtime. **Nothing in that interface says "Open".**
The word comes from the last segment of the semantic id, and the compiler signals this by leaving it
unquoted — a convention no reader knows. So the guide names a control by a word the application never
shows, and the instrument that would have caught it excluded the control for having no words.

Across all 21 features, **13 of 15 task steps quote real visible text and 2 do not**: this one, and
`clients.create`'s _"Enter the client's email, name and plan."_

The immediate cause is small: `describeFact` returns `undefined` for an element with no label whose
tag is not in `STRUCTURAL_KINDS`, and `button` is not in that map. The rule behind it is not small —
**an exclusion may remove a control from the denominator only if no emitted sentence names it.**

### The second one

`clients.create` shows nine facts, and none of them names a field. The reviewer sees _"The Clients
screen contains a text input"_ and _"…a dropdown"_ against a step that says _email, name and plan_.
Those nouns come from identifiers. The real labels are in the source:

```jsx
<TextField data-guide="clients.create-dialog.name"  label="Name" …/>
<TextField data-guide="clients.create-dialog.email" label="Billing email" …/>
```

The graph records `label: null` for both. This is `INDEXER_OMISSION`, not overreach — and the correct
copy is _"Enter the client's Name and Billing email"_, which is both truer and quotable.

## The 47 `INDEXER_OMISSION` findings

Every finding was re-classified against the fixture source, the shipped graph and the indexer itself,
and the two leading candidate rules were **run over the fixture** rather than estimated.

### The bucket is not 47 wide

|                                                              | n       |                                                                      |
| ------------------------------------------------------------ | ------- | -------------------------------------------------------------------- |
| genuinely indexer-recoverable                                | **~24** | a new fact is obtainable deterministically                           |
| misclassified — overreach, or no proposition at all          | **14**  | 3, 8, 11, 13, 15, 18, 29, 34, 35, 36, 37, 38, 44, 46                 |
| actually `REVIEW_FACT_OMISSION`                              | **3**   | 19, 23, 45 — no indexer change needed                                |
| prop-bound callback hops, unresolvable **by fixture design** | **3**   | 21, 22, 24 — `expectations.json` lists these as `expectedUnresolved` |

Roughly half the headline number. Three findings (`in one place`, `everyday settings`, `main view`)
assert nothing about the application at all and should have been rejected at proposition-extraction
time rather than counted as indexer debt.

### Ranked by count × feasibility × usefulness recovered

**1 · element → element `contains` — 7 findings. `DIRECT_SYNTAX` 1.0. Extractor-only.**

The graph has **zero** element-to-element edges today; all 62 `contains` edges originate at a
component, so every element on a page is recorded as a sibling of every other. Running the proposed
rule over the fixture — nearest guide-bearing JSX ancestor, child positions only, stopping at a JSX
attribute boundary and at any PascalCase ancestor — yields **29 new edges covering 29 of 60
elements**, including every one the findings need: `settings.form → settings.name`,
`settings.danger-zone → settings.rotate-key`, `clients.table → row → delete`,
`invoices.list → row → open`.

No `RelationshipType` change (`contains` already takes node ids), no node-kind change, and the walk
already exists twice in the package — `handlers.ts:597` does it upward for submit controls, and
`permissions.ts:282` does it downward. Every fixture trap is refused: `app.not-found` at the prop
boundary, `dashboard.new-client` at the `PermissionGate` ancestor, `settings.save` as a duplicate id.
Costs are recall-only and silent: 14 elements blocked by a component ancestor, 3 by a prop boundary.

**2 · literal JSX attribute capture — 8 findings. `DIRECT_SYNTAX` 1.0, one `RESOLVED_SYMBOL` hop.**

27 of 62 elements carry a label today. The measured gain is **+8**: `Organisation`,
`Email me when an invoice is paid` and `Plan` from a wrapping `<label>`; `Name`, `Billing email`,
`New client`, `All clients` and `Invoices` from a component `label` prop.

The prop rule is not a guess. It resolves the tag to its declaration and confirms the prop reaches a
**text position** — `TextField.tsx:20` renders `<span className="field__label">{label}</span>` and
`ToolbarButton.tsx:23` renders `{label}` inside a `<Button>`. That is `RESOLVED_SYMBOL` work the
indexer already does elsewhere, and it fails closed when the component cannot be resolved.

A further **10 elements** would gain `labelKind: 'dynamic'` with the expression's provenance — the
honest fact for `invoices.list.open`, and the thing that turns _"Choose Open."_ from silence into a
principled refusal.

**3 · permission modality and polarity — 6 findings. Feasible, and must not ship alone.**

The only class where the graph is not merely silent but **misleading**. `requires_permission` carries
no polarity, so projecting `ClientTable → clients:read` onto `clients.table.forbidden` asserts the
exact inverse of the truth: `ClientTable.tsx:28` renders that message when the permission is
**absent**. Adding `disabled={!canEdit}` edges under the same relationship type would let the
compiler say _"only shown to users with…"_ about a button that is plainly on screen. Needs a
`hidden | disabled | absent-branch` discriminator first, which is a language-layer contract change.

### A latent precision bug found on the way

`extract/permissions.ts:282-287` gates elements with a bare `forEachDescendant`, so a `data-guide`
element written inside `fallback={…}` would be recorded as **requiring** the permission it is shown
in the absence of. No fixture instance bites today — `InvoicesPage.tsx:56`'s fallback carries no id —
so this is latent rather than active. It is the same attribute-boundary discipline the containment
rule needs, and it should be back-ported in the same change.

## Call arguments — the claim was wrong

Closed Loop #7's report and ADR 0017 said recording call arguments "would convert 47
`INDEXER_OMISSION` findings into support" and called it the single highest-value follow-up.

**It converts zero of them.**

|                                                |                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| fully dependent on call arguments              | **0 of 47**                                                                      |
| argument-**adjacent**, a different gap binding | 6 — findings 16, 22, 30, 31, 35, 36                                              |
| affected features                              | `client-detail.change-plan`, `clients.table`, `clients.create`, `clients.search` |

The premise was also wrong. The graph **does** read call arguments — `extract/permissions.ts` for
`Permissions.ClientCreate`, `backend.ts` for route paths, `navigation.ts` for destinations,
`http.ts` for API paths, with four dedicated diagnostics for arguments that do not resolve. What is
missing is _generic_ capture, and the generic surplus measures **12 domain-meaningful literals out of
487 arguments — 2.5%**.

The two `enterprise` propositions that motivated the claim were re-adjudicated during the audit's own
verification pass from `UNSUPPORTED / INDEXER_OMISSION` to `SUPPORTED / REVIEW_FACT_OMISSION`, so they
are not in the 47 at all. Value kinds across the fixture's call sites are overwhelmingly non-literal;
the few useful literals are better reached elsewhere. `ClientForm.tsx:86-88` renders
`<option value="free">Free</option>` — the plan vocabulary _and_ its display names, as `DIRECT_SYNTAX`
on the element a user actually operates, needing no resolution at all.

The one genuinely valuable use is the opposite of a recovery. Capturing
`clientService.save(…, 'patch')` at `ClientDetailPage.tsx:76` would let the compiler **prove** this
feature's write verb has no matching route, and suppress all outcome language. That is a suppression
gate, and it should be argued on those terms.

I got this wrong in the Closed Loop #7 report. ADR 0017 now carries the correction beside the original
sentence.

## Recommendation — Closed Loop #8, narrower than proposed

**Not "evidence recovery" in general. Two extractors and one instrument.**

1. **Element → element `contains`.** `DIRECT_SYNTAX` 1.0, emitted from the existing
   `elementIdsByTagStart` map, with four mandatory refusals: JSX-attribute boundary, PascalCase
   ancestor, duplicate sightings, file boundary. Parent → child only, never symmetric.
2. **`resolveLabel` widening**: a wrapping `<label>` with exactly one statically readable text run,
   and a literal `label` prop on a component verified to render it in text position
   (`RESOLVED_SYMBOL` 0.95). Plus `labelKind: 'literal' | 'dynamic' | 'none'`, and literal `role` and
   intrinsic-only `type`. A new `InferenceRule` member and a `docs/confidence.md` row for each.
3. **The fact renderer, and it is required rather than optional.** Add the missing element kinds to
   `STRUCTURAL_KINDS`, use `labelKind: 'dynamic'` to emit the honest sentence, and enforce the rule
   the exclusion broke: **a step that names a control must cite a label fact, and with none it must
   not mint a name from the identifier.**
4. **Back-port the attribute-boundary discipline to `extract/permissions.ts`.**

**Out of scope:** permission modality and polarity, which needs a discriminator and a compiler-side
contract first. **Out of scope entirely:** generic call-argument capture.

**If only one thing:** element-to-element `contains`. Seven findings, 29 measured edges, no schema
change, and it is the only class nothing else can substitute for — a label can be carried by an
accepted claim, nesting cannot come from anywhere else.

**And the loop must not** weaken any Closed Loop #7 rule, infer containment through a PascalCase
ancestor or out of a JSX attribute, promote a `placeholder` or an id token or a CSS class into a
name, reuse `requires_permission` for `disabled`, read absence as fact, or resolve an identifier by
name — the fixture's shadowed binding, computed member read and dangling form id exist to punish
exactly that.

## What stays unrecoverable

Row → detail navigation (`ClientTable.tsx:51`) binds handlers through props to arrows resolved in
another module, and the fixture manifest declares it unresolvable on purpose — _"clicking a row opens
that client"_ stays unsayable, and it is the largest genuine user-facing loss in the set. Every
universal negative. Outcome and persistence: the graph proves a request is _sent_, never that it
committed. Evaluative and lifecycle vocabulary — _everyday_, _main view_, _legacy_, _onboard_, _the
old one_ — which is absent from source in any form and whose tempting proxies would attach a file and
line number to a falsehood.

And the eight elements whose visible name is computed will have a _kind_ of label, never a label.
After Closed Loop #8 the system would know that it does not know — which is the difference between an
honest refusal and the _"Choose Open."_ that started this.
