# 37. The walkthrough ends when the work is done

- **Status:** Accepted
- **Date:** 2026-09-14
- **Refines:** [ADR 0035](0035-a-guide-may-open-the-task-it-may-not-finish-it.md), [ADR 0036](0036-every-answer-has-a-next-move.md)

## Context

Found by driving the demo as a user rather than as a test — ten journeys, counting the interactions
each one cost and looking for any state with no obvious next move. Four defects came out of it, and
three were in code written the day before.

**The walkthrough did not notice being finished.** Following "how do I create a client?" to the end
and pressing **Create client** created the client, navigated to it, and left the panel sitting at
_3 of 3_ waiting to be told about work it had just watched happen. The reader had to press **Done**
to confirm something visibly done.

That came from a rule in ADR 0035 that was half right. A `confirmation` step was neither pressed nor
_watched_, on the reasoning that advancing past a commit would claim a task was finished without
evidence. Backwards: pressing "Create client" **is** the evidence — it is the whole of what
`STEP_THROUGH_COMPLETED` means. Pressing it is acting; noticing that somebody else pressed it is
paying attention, and those are different things.

**A lone trigger is not a trigger.** Asking _"where is Export CSV?"_ and pressing **Show me** made
the guide export the clients. `clients.export` compiles to `role: trigger`, which ADR 0035 permits a
guide to press — but that permission was written for a trigger that _opens_ something a reader can
close. With nothing after it, the trigger is the task.

**Starting a walkthrough dropped the navigation.** The opening sequence carries the `navigate`, and
the code took the step's own pointing actions _instead of_ the opening whenever the step had any. So
a feature on another screen — "how do I create an invoice?" asked from `/clients` — scrolled at a
control that was never going to be there and reported it as not on screen. A dead end introduced
while fixing a dead end.

**One step was not a walkthrough.** `stepping` required two or more, so a single-step answer had a
ring, no progress, no way to put the ring down, and a **Show me** button that did the same thing
every time. The originally reported symptom, surviving in the one shape nobody had looked at.

## Decision

**Watching is not acting, and the distinction is drawn per step.**

|                                  | may the guide press it?     | is it watched?                         |
| -------------------------------- | --------------------------- | -------------------------------------- |
| `entry`                          | yes (navigation is inert)   | no — the route does that               |
| `trigger`, with steps after it   | **yes**                     | yes                                    |
| `trigger`, with nothing after it | **no** — `COMMITS_A_CHANGE` | yes                                    |
| `input`                          | no — `SUPPLIES_DATA`        | no; clicking a field is not filling it |
| `confirmation`                   | no — `COMMITS_A_CHANGE`     | **yes**                                |

Every `PRESS` step is watched, whoever may press it, because operating a control is what doing that
step consists of. Watching the last step **ends** the walkthrough and records the completion, rather
than pinning at the final index.

Whether a trigger opens or commits is read from the shape of the procedure, not from the label on
the control: a trigger with later steps opens something; a trigger alone commits, and takes the
refusal reason that already exists for committing. The taxonomy does not grow.

**The opening sequence's navigation always survives**, because the step decides what to point at and
the opening decides how to get there. **One step is a walkthrough**, without the arithmetic of "1 of
1" or a Previous that goes nowhere. And **anything the guide put on screen, it can take off again** —
an answer with no steps at all now offers the same Stop a walkthrough has.

Finishing says so, once and briefly. Not about the reader and not about the product: a thing ended,
which is the one fact the panel is entitled to state about its own state.

## Consequences

Measured on the demo afterwards, from the Dashboard: open the guide, type the question, send, press
**Show me** — four interactions, and the reader is looking at an open New client dialog with the
ring on the first field and the instruction beside it. Doing the last step ends the walkthrough by
itself.

The rule that a guide may not finish a task is unchanged and now covers one more case it always
meant to. What changed is that refusing to _look_ at the final step was never part of it.
