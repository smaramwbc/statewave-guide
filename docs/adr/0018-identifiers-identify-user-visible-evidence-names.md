# 18. Identifiers identify; user-visible evidence names

- **Status:** Accepted
- **Date:** 2026-08-27
- **Extends:** [ADR 0010](0010-factual-truth-requires-feature-scope.md),
  [ADR 0013](0013-internal-epistemic-state-is-not-user-copy.md),
  [ADR 0014](0014-a-feature-reference-is-not-a-control.md),
  [ADR 0017](0017-semantic-language-is-a-projection-of-supported-propositions.md)

## Context

Closed Loop #7 made every user-facing sentence a projection of supported propositions and raised
correctness from 1.06 to 1.65 — thirteen items at correctness 2 where Round 5 had one. It left one
surface ungoverned, and Round 6 measured what that cost.

**Six of the seven items still scoring correctness 1 were the title.** `titleFor()` fell back to
`normaliseIdentifier(feature.id)` whenever no owned control carried visible text, and the corpus split
on that one variable:

| title origin                | n   | mean usefulness | mean correctness |
| --------------------------- | --- | --------------- | ---------------- |
| a real visible label        | 12  | **2.25**        | **1.92**         |
| derived from the identifier | 9   | **0.67**        | 1.25             |

The reviewer said it five separate times in different words: _"The Search title is more specific than
the supplied facts"_, _"the title's meaning is not independently supported"_.

The worst case was not a title. `invoices.list.open` emitted the step **"Choose Open."** for

```jsx
<button data-guide="invoices.list.open" onClick={() => selectRow(invoice)}>
  {invoice.number}
</button>
```

The button shows an invoice number. **Nothing in that interface says _Open_** — the word is the last
segment of the semantic id — and the review package carried no fact about the control because there
was none to carry. A reader would have gone looking for something that does not exist under that name.

Meanwhile eight genuinely visible labels sat unread in the same fixture: `Organisation`,
`Email me when an invoice is paid` and `Plan` in wrapping `<label>` elements, and `Name`,
`Billing email`, `New client`, `All clients` and `Invoices` passed as props to components that render
them. And the graph held **zero** element-to-element `contains` edges, so `settings.form` and the two
inputs it wraps were three peers under one page.

## Decision

**An identifier identifies. It never names.**

A semantic id is an address: it exists so a runtime can find a control again. Nobody chose it for a
reader. Spacing it out and capitalising it does not turn an address into a name — it disguises one as
a name, which is worse, because the result is indistinguishable from words somebody wrote and spends
the credibility the real names earned.

### Titles

A title comes from a `TitleCandidate`, and the allowed origins are:

1. **`ui-label`** — text on the control: its own text child, a wrapping `<label>`, an explicit
   `data-guide-label`, or a prop proven to reach a text position.
2. **`accessible-name`** — `aria-label`, or `aria-labelledby` resolved to statically known text.

Not allowed: the feature id, the semantic id, a function name, a component name, a route segment, a
filename, or a model-authored title. `route-title` and `component-name` are excluded by name, because
both are `screenNameFrom(<a code identifier>)` — `ClientDetailPage` with its suffix stripped and its
camel case split. Nothing in that interface says _Client Detail_; the page's only heading is a runtime
value.

The candidate must name a node the feature **owns** (ADR 0010), and where several owned controls carry
text and none is an entry point, the choice is refused.

### A title may be absent

`GuidanceDocument.title` is optional and eight of twenty-one features now have none. There is no
`Untitled`, no `Feature`, no `Control` — a placeholder is the same mistake in a blander word. A
renderer showing a gap is honest; a renderer showing a manufactured noun is not.

### Control names

**Any step naming a control must name it with text a user can find.** `Choose "X"` requires that `X`
is visible or accessible text for that control. Not a semantic id, not a feature id, not a function
name, not an inferred verb. Where no such name exists the step is withheld and the drop is recorded.

### Dynamic is not absent

A control whose text is computed carries `labelKind: 'dynamic'`. This is the fact that stops the
fallback: `<button>{invoice.number}</button>` **has** a name and we cannot read it, which is a
different thing from having none. Fourteen elements in the fixture are dynamic, and knowing that is
what lets the compiler refuse rather than invent.

### Containment

`element contains element` is recorded for direct JSX nesting, at `DIRECT_SYNTAX`, with four refusals:
a JSX attribute boundary (a control passed as a prop renders wherever the callee decides), a PascalCase
ancestor (a component may render its children, its fallback, or neither), a duplicate semantic id, and
a file boundary.

### What names and structure do **not** prove

Three traps, permanent:

- **A label does not prove behaviour.** A button reading `Delete` proves the control is called Delete.
  A `DELETE` operation still needs graph or claim evidence.
- **Containment does not prove semantics.** A form containing an input says nothing about what the
  form saves.
- **A title is not a purpose.** `Upgrade` proves the control's name and nothing about plan tiers,
  roles, or what pressing it changes.

Every Closed Loop #7 rule is unchanged. `actor`, `location`, `motive`, `target_state`,
`temporal_state` and `status_classification` remain unestablishable; purpose still requires a verified
capability. **The only way more language returns is if new evidence satisfies the existing rules** —
and the experiment below is what happened when it was allowed to.

### Review facts have no exclusions

Round 6 reported `50/50 = 100%` with three controls outside the denominator, and one of the three was
concealing the `Choose Open.` step. A denominator you can subtract from will be subtracted from. So
every emitted actionable step must carry facts sufficient to check that the control exists, that the
name the step uses is real, and that any route it names is real; every title must be backed by a fact;
and generation fails otherwise. This rule can be absolute now only because the compiler withholds an
unnameable control instead of naming it from an identifier.

## Consequences

- **0 identifier-derived titles.** 13 emitted, all `ui-label`, 100% traced to an owned node. 8 withheld.
- **8 labels recovered** — 3 from wrapping `<label>`, 5 from proven props — and **14 elements recorded
  `dynamic`**.
- **34 element-to-element `contains` edges** where there were none.
- `invoices.list.open` emits nothing rather than `Choose Open.`
- `clients.create` reads _"Enter the client's billing email, name and plan"_ — `Billing email` is now
  the label the component actually renders.
- Review fact coverage: propositions 52/52, action steps 32/32, control names 13/13, titles 13/13. **No
  exclusions.**
- **A fan-in regression, found and fixed.** Every nested element gained a second incoming `contains`
  edge — one from its component, one from its parent element — and the shared-infrastructure rule read
  that as two owners. `clients.create` lost all five of its dialog controls before the fix. Containment
  is now counted at its most specific level: a component containing an element and that element's
  parent element containing it are one nesting described twice, not two owners. Ownership went 69 → 77.

## The experiment, and its result

Closed Loop #7's rules were run unchanged over the enriched graph to see what would come back on its
own. **Naming returned. Purpose did not.**

Titles went from 9 manufactured to 13 read and 8 withheld. Questions went 9 → 11. Purposes stayed at
**4**, because a purpose requires a verified `capability` assertion and no amount of label or
containment evidence creates one — the Product Model is the same frozen capture.

That is the honest answer to whether evidence recovery restores meaning: it restores **what things are
called**, and what they are **for** is a different kind of fact that this loop did not touch. The
distinction is ADR 0017's, and it held.

## Alternatives rejected

**Keep the identifier fallback but mark it.** Round 6 already recorded `NO_USER_VISIBLE_LABEL` as a
diagnostic, and the title shipped anyway. A caveat in a developer channel does not reach the reader.

**Treat any `label` prop as a name.** `label`, `title` and `caption` are conventions, and a convention
is not evidence — a component may use `label` for analytics. Every string-literal prop is offered to
the same test instead: does the component render _this prop_ between tags?

**Flatten containment through components.** `PermissionGate` returns `children` **or** `fallback`.
What a component does with what it is given is that component's business.

**Use `placeholder` as a label.** It disappears the moment a user types.
