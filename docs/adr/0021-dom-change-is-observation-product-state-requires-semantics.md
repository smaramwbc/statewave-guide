# 21. DOM change is observation; product state requires semantics

- **Status:** Accepted
- **Date:** 2026-08-28
- **Extends:** [ADR 0019](0019-runtime-observes-behaviour-vision-proposes-meaning.md),
  [ADR 0020](0020-observed-behaviour-supports-product-truth-only-after-typed-verification.md)

## Context

ADR 0020 let observed behaviour become product truth after passing a named rule. The rules were
written against an effect vocabulary that had not been examined, and one entry in it was doing far
more work than its name admitted.

`COLLECTION_CHANGED` counted the children of **any** element carrying a semantic id. Every container
was therefore a collection and every child a member. Clicking **New client** opened a dialog inside
the clients `<section>`, the section's child count went 6 to 7, and the observer reported a
collection changing size — a true statement about the DOM and a false one about the product.

That would have been merely untidy if nothing consumed it. Closed Loop #10 had just tightened
`select` to require exactly that effect, having previously accepted a bare route change. So the
tightening moved the rule from one wrong dimension to another: **a button that opens a dialog
verified as a selection.** Three of seven observed traces would have minted a false `select` claim if
one had been proposed. None was, which is luck rather than a safeguard.

The review instrument had already been caught rendering the same effect as _"reduced a visible
collection … from 1 items to 2"_. That was fixed as an attribution defect. This is the layer beneath
it: the effect should not have existed.

## Decision

### An arbitrary child-count change is not a collection change

A collection is a **typed** thing an application declares. `COLLECTION_MEMBERS_CHANGED` requires a
container whose role is one of `table`, `grid`, `list`, `listbox`, `tree`, `treegrid`, `menu`,
`menubar`, `radiogroup`, `tablist`, `rowgroup` — and `section`, `form`, `dialog`, `region` and `div`
are absent deliberately and must stay absent.

### Membership is typed too

Each collection role admits specific member roles: a table counts `row`s, a listbox counts
`option`s, a tree counts `treeitem`s. A `<table>` gaining a caption has not gained a row. Counting
arbitrary descendants is how a member count stops meaning anything.

### Membership and selection are different dimensions

A row being added is not a row being picked, and neither is inferable from the other.
`SELECTION_CHANGED` is a separate effect, computed by **identity** rather than by count — a list that
swaps which row is selected has the same number selected before and after, and that is precisely a
selection change.

### Selection is what the application declares, and nothing else

Read from `aria-selected`, `aria-checked`, native `<option>`/checkbox/radio state, and
`aria-activedescendant`. Not from a CSS class, a colour, a label or an identifier. `undefined` means
the element says nothing about selection, which is **not** the same as saying it is unselected — and
a rule that treats silence as `false` has invented the evidence it was supposed to check.

The benchmark fixture is the case that makes this concrete. `InvoiceList` marks its chosen row with
`className="is-active"` and declares nothing to assistive technology, so selection there is genuinely
unobservable. Both `select` and `clear_selection` are refused. Reading the class would be easy and
would make an implementation detail into product truth — the same substitution ADR 0018 removed from
titles.

`clear_selection` gets the same treatment from the other direction. The control is labelled _"Clear
selection"_; the label supplies naming and never behavioural proof. Clearing requires something to
have been selected before and nothing selected after — a selection that merely _moves_ is refused as
`SELECTION_REPLACED_NOT_CLEARED`.

### Interpretation happens in one place

Every capability is defined once, in `CAPABILITY_REGISTRY` in `shared`: the effects it requires, the
effects that refuse it, the interaction kinds it may be claimed from, and whether it may reach the
ProductModel. The runtime verifier and the semantic integration layer are **projections** of it.

This is not tidiness. Closed Loop #10 defined `select` independently in both places, both copies said
a route change was enough, and the second was found by luck while fixing the first.
`MECHANISM_ACTIONS` diverged identically in the same loop and shipped a summary the purpose compiler
had already withheld. Two hand-written tables answering one semantic question will disagree; the only
question is whether anyone notices.

`test:capability-verification-registry-consistency` reads the source of both consumers and fails if
either declares a requirement list of its own — regardless of whether it currently agrees.

### The observer observes

Every entry in the effect taxonomy is marked `observation`, and the gate fails if one is ever marked
`interpretation`. `ELEMENT_APPEARED` says an element that was absent is present; whether that
constitutes _revealing_ something is a verifier's judgement, made where it is reviewable, never
folded into the diff where it is not.

## Consequences

False `select` opportunities went from **3 of 7** observed traces to **0**. Membership facts in the
evidence went from 4 to 1, and the survivor is the real one: `clients.table`, a `<table>`, narrowing
from 5 `<tr>` rows to 2. `filter` still verifies. A rule that refuses everything passes every
false-positive test ever written, so the positive control is a gate rather than a footnote.

The ProductModel is unchanged: the same 7 behavioural claims with the same actions and subjects, the
static half byte-identical, and all 21 product outputs identical to the externally scored package.
Only the evidence strings those claims cite changed, which is what should happen when a vocabulary is
corrected.

**What this does not fix.** Selection is observable only where an application declares it, so an
application that keeps selection in a CSS class is invisible to this system — correctly, and at the
cost of saying nothing about it. The fixture is exactly such an application, which means the
selection path is proven by construction and by adversarial test rather than by a real trace. A
second fixture that declares `aria-selected` would be worth more than any further rule.
