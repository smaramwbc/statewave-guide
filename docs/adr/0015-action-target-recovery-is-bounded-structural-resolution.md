# 15. Action target recovery is bounded structural resolution, not graph proximity

- **Status:** Accepted
- **Date:** 2026-08-27
- **Extends:** [ADR 0010](0010-factual-truth-requires-feature-scope.md),
  [ADR 0014](0014-a-feature-reference-is-not-a-control.md)

## Context

Closed Loop #5 taught the compiler to resolve a `feature:<id>` subject to the control a user presses,
and the independent Round 4 review measured the result. The median usefulness score moved from 1 to 2
for the first time and the share of items scoring 2 or better doubled, from 33% to 67%. The gate needs
70% and therefore failed by a single item.

One variable separated the set, and it was binary.

|                      | n   | mean | share ≥2 |
| -------------------- | --- | ---- | -------- |
| emits a task action  | 12  | 2.25 | **100%** |
| emits only the entry | 9   | 1.11 | **22%**  |

All seven low scorers emitted zero task steps. Twelve of the fourteen high scorers emitted at least
one. Whether the guide names something to press is, on this evidence, the whole difference between
help and a title.

Three of the seven fail for a reason the graph can answer. `settings.form` is the clearest: it carries
a verified `capability:submit`, its subject is a `<form>`, and ADR 0014's resolver refuses a form on
purpose — nobody presses a form. What a user presses is **Save changes**, which the graph knows about
and the compiler could not reach.

## The temptation, stated plainly

A rule loose enough to find _Save changes_ from a form is loose enough to find _Rotate API key_ from
the `<section>` that happens to sit above it. Both are elements on the Settings page, both are near
their subject in the source, both share a namespace prefix with it. Every signal that would recover
the first would recover the second, if the signal is proximity.

And a score that rises because the compiler started guessing is worse than a score that stayed where
it was, because the number no longer measures the thing it is named after. ADR 0010 exists because the
Round 1 pipeline treated adjacency as ownership and put four unrelated pages inside one feature.

## Decision

**A passive subject may resolve to a control only where the graph proves that control performs work
the feature owns. Ownership is of the action, not of the control.**

Concretely, and this is the whole rule:

1. The subject is an **element** the feature owns, and it is **passive** — a form, a section, a table,
   a display. An actionable subject resolved directly and recovery never runs.
2. The subject carries an outgoing relationship from a fixed allow-list to some node: its **action
   surface**.
3. The feature's `FeatureScope` classifies that surface **`OWNED`**.
4. Exactly one **actionable element** carries a relationship **of the same type** to that **same
   surface**.

Then the control is the target, marked `recovered-action-surface` and carrying the full walk.

### The allow-list, and why it has two entries rather than six

| relationship   | eligible | why                                                                  |
| -------------- | -------- | -------------------------------------------------------------------- |
| `submits_to`   | yes      | names work: two elements submitting to one handler run the same code |
| `invokes`      | yes      | the same, for a control that calls rather than submits               |
| `navigates_to` | **no**   | names a destination, not work                                        |
| `opens`        | **no**   | the same                                                             |
| `contains`     | **no**   | holding something is not doing it                                    |
| `renders`      | **no**   | the same                                                             |

`navigates_to` is the instructive exclusion, because the counterexample is already in the fixture:
`element:nav.invoices` and `element:client-detail.invoices-link` both navigate to `route:/invoices`.
They are unrelated features. Converging on a destination proves two things lead to the same place;
converging on a handler proves they do the same job. Only the second is an action surface.

### Depth

One relationship out to the surface, one relationship back to the control. No further, and no search.
There is no breadth-first walk looking for nearby buttons, because **nearby is not ownership** —
which is the sentence ADR 0010 was written to enforce and this ADR is written not to undo.

### Precedence

1. A direct verified target, where the subject names an actionable node.
2. A `feature:` subject resolved through the candidate's own roots (ADR 0014).
3. Recovery.
4. Refusal.

Recovery may never displace a target a claim named for itself.

### Ambiguity refuses

Two controls submitting to one handler produce `AMBIGUOUS_ACTION_TARGET` and no step. There is no
tie-break by label, by sort order, by source line or by identifier similarity. A form with **Save**
and **Save and close** is a form this system declines to give instructions for, and says so.

## What "owned" means here, exactly

This is the part of the decision most likely to be misread later, so it is written out.

The recovered control is frequently **not** `OWNED` by the feature's own scope. `element:settings.save`
is classified `OUTSIDE` by `settings.form`'s scope, and it is also the root of a different feature.
Requiring the _control_ to be owned would make the rule unimplementable rather than safe: the graph
records no element-to-element containment at all, so a submit button is never a descendant of its own
form — both are contained by the page component, alongside everything else on the page.

What is required instead is that the **action surface** is owned, and that is the stronger claim, not
the weaker one. It says: _this control performs work that belongs to this feature._ `settings.form`
reaches **Save changes** because both submit to `saveSettings`, which `settings.form` owns.
`settings.danger-zone` cannot reach **Rotate API key**, because a `<section>` submits to nothing and
invokes nothing — it holds children, and holding is not doing. The four passive controls on the same
page are refused for four different structural reasons, none of them "we decided not to".

The provenance therefore records the scope class of the control as well as of the surface, unflattering
value included, so that anybody auditing a recovered step can see exactly what was and was not proven.

## Language cannot supply the missing fact

`clients.search` has a grounded purpose saying the feature helps you find a client, and one unlabelled
`<input>` with no outgoing edge whatsoever. It stays unresolved.

A grounded language claim may help _phrase_ a fact the graph establishes. It may not establish one. If
purpose prose could license _"Search for a client"_ over a generic text box, then any sufficiently
confident sentence would be self-verifying, and the separation ADR 0007 draws between what the code
proves and what the model says would exist only where it was never tested.

The honest output is that a resolvable control is not always a **sayable** one. `clients.search`
resolves to a real, owned, actionable input carrying no text a reader could look for; the only name
available comes from the identifier, which is how _"Enter the client's search"_ once reached a
reviewer. That claim is now dropped with a reason recorded rather than dropped silently — which is the
minimum this project owes a fact it cannot use.

## A restatement is not a step

Where a verified action navigates to exactly the route the synthesised entry step announces, the entry
step is dropped. `nav.clients` said _"Open Clients."_ and then _"Choose "Clients"."_ — one navigation
act written twice, and the Round 4 reviewer's only `repetitive` flag. The verified action is kept
because it names the control; the synthesised one only names the screen. The test is the
`navigates_to` edge, not the similarity of the two sentences.

## Consequences

- Two features change and nineteen do not. `settings.form` gains _Choose "Save changes."_;
  `nav.clients` loses a restatement.
- Every recovery is inspectable: subject, rule, relationship, surface, both scope classes, the edge
  ids walked, and why the candidate won.
- The funnel is reported in full by `test:action-target-recovery-quality` — offered, eligible,
  resolved, ambiguous, refused, and refused for which of three reasons. No silent outcome.
- Action retention is stated over an exact denominator: resolved targets, minus de-duplicated, minus
  unsayable. It is not, and must not be reported as, "100% of verified action claims".
- `settings.new-key`, `settings.danger-zone`, `clients.table`, `dashboard.new-client` and
  `clients.error` gain nothing, and a gate fails if any of them ever does.

## Alternatives rejected

**Unique actionable descendant of the container.** Fails on the first real form, which has a Cancel
button. Both are actionable; only one does the work.

**Record element-to-element containment in the indexer.** Would make the literal reading of "the
control must be owned" implementable — and changes the graph every measurement in this project is
recorded against, mid-experiment, to make one rule tidier. The right time to consider it is a loop
whose subject is the indexer.

**Let the purpose sentence license the search action.** Rejected under ADR 0007. See above.

**Refuse `settings.form` too, on the grounds that Save changes belongs to another feature.** Defensible,
and it would have made this loop recover nothing. The graph proves the button submits the form; two
features may correctly describe one control from different angles, and refusing a proven fact to keep
a boundary tidy is a different failure from asserting an unproven one.
