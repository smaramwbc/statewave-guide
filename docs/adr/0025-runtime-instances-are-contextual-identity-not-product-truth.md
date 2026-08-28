# 25. Runtime instances are contextual identity, not product truth

- **Status:** Accepted
- **Date:** 2026-08-28
- **Extends:** [ADR 0018](0018-identifiers-identify-user-visible-evidence-names.md),
  [ADR 0020](0020-observed-behaviour-supports-product-truth-only-after-typed-verification.md),
  [ADR 0022](0022-the-ui-asks-for-guidance-it-does-not-interpret-product-truth.md)

## Context

Interactive Review V2 scored 2.46/3 with one scenario at zero: _"How do I open an invoice?"_ was
refused, correctly, and the refusal helped nobody. The runtime had been watching `INV-001` and
`INV-002` on screen for three loops and had no way to say so.

The temptation is to make "invoice" a fact about those rows. It is not one. They are rendered by a
component called `InvoiceList`, they sit under semantic ids beginning `invoices.`, and **nothing in
the ApplicationGraph connects either to the concept** — only structural containment and a call to a
local `selectRow`. Reading "invoice" off a component name is precisely the substitution ADR 0018
removed from titles.

## Decision

**A product concept and a runtime instance are different kinds of knowledge, and this system keeps
them apart.**

`invoice` is compiled from a verified capability claim and lives in the ProductModel. `INV-001` is
observed, belongs to one snapshot, and never enters it. `RuntimeInstanceRef` carries the second and
is scoped to the moment that produced it.

### The concept must be earned, and earned _here_

An instance is offered against a noun only when that noun appears as an evidence-backed object
proposition, **and** the feature carrying it is reachable on the route the user is on. The
consequence is deliberate: the same two rows are offerable on `/invoices`, where a verified `POST`
claim establishes "invoice", and are not on `/clients/:clientId`, where nothing does. Same rows,
different evidence, different answer.

That refuses the fixture route Closed Loop #16 nominated. Refusing there is the correct behaviour,
and a rule that produced the nicer result on that screen would have had to accept a component name
as evidence.

### A name is not identity

Two rows can display the same text. When they do, the name cannot pick between them and the contract
returns `AMBIGUOUS_NAMES` rather than a coin flip. Instances carry a within-snapshot handle, and safe
actions carry it too — because a semantic id shared by a list resolves to the first match, and after
somebody has chosen the second row that is confidently the wrong one. This loop shipped that bug and
caught it only by comparing the highlight geometry against each row.

### Privacy decides displayability, not addressability

A name that looks like a secret is withheld from choices, from sentences and from developer
diagnostics — the inspector is a development aid, not an exemption. The instance stays addressable;
only the name is withheld. The policy matches **value shapes**, not the presence of a sensitive word:
`Reset password` is a control somebody labelled and stays sayable, while `hunter2password` is a value
that happens to be rendered. Whitespace is the only signal available without reading the thing.

Two leaks were found by testing rather than by reasoning. A key prefix welded to preceding text
(`keysk_live_…`) defeated a leading word boundary; and a _container's_ `textContent` is its children's
text, so `settings.danger-zone` named itself "Danger zoneRotate API keysk_live_fixture_0000". Only a
leaf, or something that labels itself, has a name of its own — the rule Closed Loop #9 already
settled for snapshots.

### Instances are context, and context expires

A reference is re-resolved against what is on screen now. It does not survive a route change, a
different snapshot, or the element going away; each of those returns the choice again or
`TARGET_NOT_AVAILABLE`. There is no fallback to the first invoice, the nearest element, matching text
or a selector.

### Pointing, still not acting

A chosen instance produces `scroll` and `highlight` on its own handle and **no sentence at all** —
nothing verified says what it is, and the guide's whole contribution is knowing how to find it again.
The user opens the invoice.

## Consequences

`How do I open an invoice?` on `/invoices` now offers **INV-001** and **INV-002** through the existing
ambiguity interface, and the chosen one is the one highlighted — verified in a real browser in both
directions.

Zero instance names in the ProductModel, zero invented ids, zero secret leaks, zero raw selectors,
zero wrong-instance highlights. The claim set is byte-identical to Closed Loop #11.

Two presentation defects from V2 are fixed as a consequence of the same rule: Show me is no longer
offered for a control the host reports as absent, so the Delete explanation stands alone; and the
`settings.new-key` Show me is _proven_ to resolve to the button labelled "Rotate API key" rather than
to the code block displaying the key.

**Limitations.** The route-scoped concept rule is the weakest link: co-location on a route is
evidence that a concept exists on a screen, not that a particular collection is made of it. A
stronger correlation — a verified path from the collection to the endpoint that populates it — does
not exist in this fixture, and building one on a component name would defeat the purpose. The
within-snapshot handle is a document ordinal, which is deterministic and cheap and would need
replacing for a host that reorders without re-rendering.
