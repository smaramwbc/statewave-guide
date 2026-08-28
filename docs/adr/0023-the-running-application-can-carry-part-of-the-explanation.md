# 23. The running application can carry part of the explanation

- **Status:** Accepted
- **Date:** 2026-08-28
- **Extends:** [ADR 0018](0018-identifiers-identify-user-visible-evidence-names.md),
  [ADR 0021](0021-dom-change-is-observation-product-state-requires-semantics.md),
  [ADR 0022](0022-the-ui-asks-for-guidance-it-does-not-interpret-product-truth.md)

## Context

Twelve loops produced verified product knowledge and a contract for asking about it, and the only
way anyone had ever read the output was a Markdown page. That instrument has been measuring the
wrong thing for a while. It cannot represent highlighting, focus, scrolling, awareness of the current
screen, or a step disappearing because the user is already where it would have sent them — so every
score it produced was a score for _text about an application_, not for a guide inside one.

`clients.search` is where the gap is widest. The model knows _"You can filter clients."_ and cannot
name the input, because the interface displays no name for it. On a page that is the end of the
answer and it reads as a shortfall. In the application there is an obvious next move: point at the
box.

## Decision

### Text is not the whole guidance experience

An answer may consist of a sentence, a place, or both. The panel renders what the query contract
returns and offers to act on the actions it returned — and "act" means moving attention, never
operating anything.

### A semantic target may be useful without an invented name

The distinction the product turns on, now demonstrated rather than argued. Asked _"How do I filter
clients?"_, the guide says **"Lets you filter clients."**, shows no title, and highlights and focuses
`element:clients.search` in the running application. The words _Search_, _Search box_ and _Filter
field_ appear nowhere — the host's own placeholder happens to read "Search clients", and the guide
still does not borrow it, because a placeholder is not a name the product gave the control.

An action can address what a sentence cannot name. Those are different permissions, and keeping them
apart is what lets an unnamed control be genuinely useful instead of quietly renamed.

### "Show me" is attention, not autonomy

`navigate`, `scroll`, `highlight`, `focus`. The user still presses the button, fills the field and
submits the form. The end-to-end run records that the create dialog is closed before and after the
guide answers a question about creating a client, and that the filter input is still empty after the
guide has pointed at it. A guide that can operate an application is a different product with a
different risk profile, and this is not that product.

### The UI never interprets product truth

No feature resolution, no step selection, no pruning, no screen naming, no action construction, no
placeholder copy. A missing field renders as nothing at all: `Untitled` is a sentence somebody reads,
and this layer may not write sentences about the product. `test:guide-ui-contract` reads the panel's
source and fails on the verbs — a component that resolves, prunes or composes has taken a decision
that belongs upstream.

### Runtime context can satisfy part of the explanation

On `/clients`, the stored _"Open Clients."_ is gone before the panel ever sees it, because the
contract pruned a step whose precondition the context already satisfies. Asked where Export CSV is
from `/settings`, the same guidance navigates first. The difference is not in the guidance; it is in
where the user is standing.

### Interactive usefulness has to be evaluated in the application

The Markdown rounds cannot score any of the above, so this loop does not extend them. `Round 8 R1`
stays frozen, no Round 9 exists, and the new artefact — `interactive-review-v1` — records what
happened in a real browser with every subjective score left `null`. It is a development artefact.
`FORMAL_HUMAN_VALIDATION_GATE` remains `DEFERRED_UNTIL_PRE_RELEASE`, and a gate exists to keep the
screenshots from making it look like something more.

## Consequences

The first interactive product exists: a 400px panel beside the _benchmark_ application — the same
`realistic-app` every claim was compiled from — driven in real Chromium across ten scenarios. Ten
answered as the contract promised, including three that answered by refusing.

Zero fabricated names, zero secret values, zero feature ids shown to a user, zero unsafe actions,
zero values typed into the application, zero page errors. The ProductModel is byte-identical to the
Closed Loop #11 baseline: the UI required no knowledge to be improved, which was the point of
freezing it.

Two things the panel does that a page cannot, both measured: it removes a step the user has already
taken, and it points at a control the product cannot name.

**What this does not establish.** Nobody has used it. Every usefulness score in the artefact is
`null`, and the engineering metrics say the guide behaved correctly, not that a person was helped.
The highlight was verified drawn and the focus verified landed; whether either _reads_ as helpful is
the question the next evaluation has to ask, and it needs people rather than assertions. The
screenshots exist and have deliberately not been shown to a vision model — establishing the baseline
first is worth more than a comparison against nothing.
