# 31. An adaptation that changes nothing is not an adaptation

- **Status:** Accepted
- **Date:** 2026-08-29
- **Refines:** [ADR 0029](0029-memory-remembers-experience-not-truth.md)

## Context

Closed Loop #19 established that memory can adapt guidance without becoming product truth. An
independent review then asked the question the gates could not: whether the adaptations were worth
having. Two of the three were not.

**The completion sentence.** _"You've completed this guide before."_ was truthful, derived from a
recorded `STEP_THROUGH_COMPLETED` and nothing weaker, and over-explicit. It announced the mechanism.
The adaptation a returning user benefits from is the folded answer, not being told why it is folded.

**The inferred preference.** Three Show me presses set `emphasisedAction: 'SHOW_ME'` on a panel where
Show me is _already_ the primary action for any answer with more than one step. The plan changed; the
pixels did not. A previous round noticed the two scenario screenshots were byte-identical and
responded by **drawing a ring around the button** and adding a caption saying the emphasis came from
previous use. That made the report true by manufacturing the thing it reported.

The deeper problem is that nothing could have caught this. `neutralPresentationPlan` has no
`emphasisedAction` to compare against, so a plan-versus-plan comparison reports every emphasis as a
change. The base — _which button the panel makes primary when memory says nothing_ — lived in a JSX
expression, where core could not read it.

## Decision

**A memory-derived change is `APPLIED` only when the resolved presentation differs from the base
presentation in the dimension that change controls.**

Three outcomes, closed: `APPLIED`, `ALREADY_SATISFIED`, `REFUSED`.

To make that decidable, the renderer's first-paint rules are lifted into
`resolvePresentation(response, plan)` — steps visible, expand control visible, primary action, and
the copy lines that render on their own. **The panel renders from it and the classifier compares two
of them**, so the planner is no longer predicting the renderer's behaviour; the renderer is asking
the same question the planner asks.

The base is `resolvePresentation(response, neutralPresentationPlan(response))` — the memory-off
_presentation_, not the memory-off _plan_. Those are different relations, and only the first is what
a person would have seen.

Consequences for copy: the completion sentence and the pattern caption are removed. `GUIDE_META_COPY`
holds two ids — the expand control's label, and a line confirming a detail level the **user chose**.
The retired strings are kept in `RETIRED_META_COPY` so a gate can assert they never return.

`data-emphasis` stays as a **provenance marker** and carries no style. It records that memory chose an
emphasis; it is deliberately not the thing that makes the emphasis visible.

## Consequences

**The accounting is honest and unflattering.** On the demo application: a completed guide's fold is
`APPLIED`; a derived Show me pattern is `ALREADY_SATISFIED`; an explicit request for full detail over
an already-full base is `REFUSED`, and the resolved presentation is unchanged. (Its two captures are
not byte-identical — they differ over a hover artefact on a control outside the answer — which is why
the package reports exact-hash identity _and_ a separate list of which files are literally the same,
rather than asserting a sameness it has not measured.) Eleven captures yield five distinct images, six
of them one file, and the package says so rather than leaving a reviewer to discover it.

**A returning user is told nothing.** They get a shorter answer and a control reading _Show full steps
(3)_. Under _the smallest neutral treatment possible_, that control is the indication — it is visible,
it names the true count, and it is actionable. No extra sentence is needed for predictability, and the
developer inspector still carries the reason.

**`neutral` keeps its old meaning and loses its old job.** It is a structural claim about the plan
object — seven call sites depend on that reading — and it is _not_ byte-identity with the neutral
plan, because a plan that refused to collapse anything is neutral and carries a refusal saying so.
"Did this person see anything different" is now `hasVisibleAdaptation(plan.adaptations)`.

**This makes the feature look smaller, and that is the point.** A system that counts its own no-ops
as successes will keep adding them.
