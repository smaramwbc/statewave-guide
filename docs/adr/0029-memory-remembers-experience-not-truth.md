# 29. Memory remembers experience, not truth

- **Status:** Accepted, refined in part by
  [ADR 0031](0031-an-adaptation-that-changes-nothing-is-not-an-adaptation.md)
- **Date:** 2026-08-29
- **Extends:** [ADR 0018](0018-identifiers-identify-user-visible-evidence-names.md),
  [ADR 0022](0022-the-ui-asks-for-guidance-it-does-not-interpret-product-truth.md),
  [ADR 0025](0025-runtime-instances-are-contextual-identity-not-product-truth.md),
  [ADR 0028](0028-visible-now-is-not-named-forever.md)

## Context

The independent review of Closed Loop #18 concluded that runtime-visible language is worth keeping,
improves naturalness modestly, remains substantially redundant with the screen, and does not justify
further contextual-language research. The next capability is adaptive guidance.

That is the most dangerous thing this project has built. Every previous loop added a source of
evidence and spent its length deciding what that source may not establish. Memory is different in
kind: it is not evidence about the product at all, and it is the most tempting thing in the system to
reason from. A user who opened an invoice yesterday looks like a reason to call these rows invoices.
A user who had delete permission last week looks like a reason to show them Delete.

Both are the same mistake, and it is worth naming precisely: **a record of what a person did is not
evidence about what a product is.**

## Decision

**Memory may answer _what has happened before_. It may never answer _what is true now_.**

Four layers, and each answers exactly one question:

| layer                  | answers                          |
| ---------------------- | -------------------------------- |
| ProductModel           | what the product is              |
| RuntimeContext         | what exists now                  |
| RuntimeVisibleLanguage | what the user can see now        |
| Statewave Memory       | what this person has done before |

### The boundary is a stage, not a rule

Adaptation is a separate pass that receives a verified response and returns a **plan**. There is no
code path by which it could rewrite an answer, remove a step or add an action, because it never holds
the response as something writable. The original stays beside the plan, so _"the facts did not move"_
is a comparison a test makes rather than a promise a comment offers.

A plan may collapse steps, emphasise one safe action over another, and add one closed sentence.
`stepCount` travels with it precisely so a renderer showing fewer steps than exist would be caught.

### Completion must be observed, not inferred

> **Superseded by [ADR 0031](0031-an-adaptation-that-changes-nothing-is-not-an-adaptation.md).**
> The rule below — what licenses the sentence — still holds. The sentence itself no longer ships: an
> independent review found it truthful and over-explicit, so a returning user now gets the fold and
> the control that undoes it, and no announcement.

The guide may say _"You've completed this guide before"_ only against a recorded
`STEP_THROUGH_COMPLETED` for that feature on that application version. Viewing guidance is not
completing it. Pressing Show me is not completing it. Starting the steps is emphatically not
completing them.

This is the same discipline ADR 0018 applied to names: the sentence and the evidence must be the same
size.

### An observation is not a preference

Three `SHOW_ME_USED` events license _emphasis_, recorded as `DERIVED_ADAPTATION`. They do not license
the sentence _you prefer Show me_, which is a claim about somebody's mind that only they can make.
`EXPLICIT_USER_PREFERENCE` exists for what a person actually chose, and it outranks any pattern —
somebody who asked for full detail keeps it however many times they have finished the guide.

### Version scopes history; preference does not

Feature history is scoped to the application version it happened on. A guide completed against a
build the application has moved past is history, not a reason to collapse today's instructions —
the steps may have changed, and collapsing them would be asserting they had not.

An explicit preference is about how a person wants to be spoken to. It survives the product shipping.

### Identifiers and counters, and nothing else

What is stored is `{ featureId, kind }` plus opaque scope. Not questions, not answers, not accessible
names, not placeholders, not instance labels, not input values. Every one of those is a plausible
thing to store and a bad thing to keep, and the refusal is enforced at the boundary by shape rather
than trusted from a type.

`INV-001` is refused specifically. Closed Loop #16 made it addressable for exactly as long as its
screen exists; persisting it would grant a within-snapshot handle a durability nobody gave it.

### Memory is untrusted persistence

It comes back from a store somebody else runs and may have been edited by anyone with developer
tools. Records are validated on the way in _and_ on the way out. A record claiming
`featureId: 'invented.feature'`, an unknown kind, a route, or a sentence beginning _"Ignore previous
instructions"_ loses at the boundary — not in a renderer, and not by being recognised as hostile, but
by not being in the closed taxonomy at all.

### Failure costs personalisation and nothing else

A store that throws, times out, returns malformed rows or hands back an unknown kind produces the
neutral plan — which is byte-identical to a build with no memory. The question still gets its answer.
No provider diagnostic reaches a user; a person does not need to know that a cache was unreachable.

### Statewave provenance is memory provenance

Where Statewave supplies receipts and versions, they are preserved. They prove **a record exists**.
They do not prove that anything the record describes is currently true, and the distinction matters
most exactly where it is least convenient: a well-attested memory of a permission is still not a
permission.

## Consequences

ProductModel delta is **zero**; the claim set is byte-identical to Closed Loop #11 and no static title
moved. Nothing in the compiled bundle mentions a subject, an event or a memory.

A user who completes the create-client guide, reloads the browser and asks the same question gets the
same verified sentence, the same steps available and the same safe actions — presented concisely,
with one closed sentence and a way back to the full steps. A user in the same browser under a
different opaque id gets none of it.

Adaptation is deterministic and clock-free. The same response and the same profile produce the same
plan, because a personalised interface that changes when nothing changed is indistinguishable from a
broken one.

> **Corrected by [ADR 0032](0032-remote-memory-persists-experience-not-authority.md).** The limitation
> below is wrong. `@statewavedev/sdk` is published and has no runtime dependencies; the MCP server is a
> thin wrapper over the same HTTP API. Closed Loop #20 wired the adapter, and the contract this ADR
> described turned out to map onto the real API without adjustment.

**Limitations.** No Statewave adapter is wired. There is no Statewave JavaScript client in this
repository or its dependencies, and the Statewave surface available in this environment is an MCP
tool server — agent-side, and not importable by a browser package. Writing one anyway would have meant
inventing an API and then testing against the invention. The contract is stated so it can be reviewed
now, and the reference store is a `Map`.

**A build identity is opaque and hex is its normal shape.** `applicationVersion` is exempt from the
long-hex secret rule because git SHAs and build digests are hex; a forty-character hex token parked
there is therefore stored. The field is bounded, charset-restricted, whitespace-free, never rendered
to a user and never used for anything but an equality comparison — but a host that puts a credential
in its own version string will have it persisted, and no rule this layer can write distinguishes that
from a commit hash.

**A well-formed forged record is indistinguishable from a real one.** Client-side memory can be
hand-edited, and an event carrying the right subject, the right build and
`kind: STEP_THROUGH_COMPLETED` will collapse the steps of a guide nobody finished. The taxonomy stops
a record from claiming anything the product does not already allow it to claim; it cannot stop
somebody lying to their own browser about their own history. The cost is bounded by what memory may
do at all, which is why the adaptation set is three things.

The default browser store is `localStorage`, which is per-profile and per-device. That is the correct
blast radius for something no server was asked to hold, and it is not cross-device continuity.

The adaptation set is deliberately three things — collapse, emphasis, one sentence. Whether that is
the useful adaptation or merely the safe one is not established here, and the review exists to ask.
