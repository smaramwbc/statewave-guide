# 36. Every answer has a next move

- **Status:** Accepted
- **Date:** 2026-09-13
- **Refines:** [ADR 0035](0035-a-guide-may-open-the-task-it-may-not-finish-it.md)

## Context

Reported from the running demo, with a screenshot:

> i pressed show me and then also a second time and nothing happens, it is unclear to the user how
> to proceed

The report was accurate and the cause was structural rather than cosmetic. **Show me** ran the
response's action sequence — navigate, scroll, highlight — and stopped. It did not enter the
walkthrough. What the reader was left with was a ring around a button, a callout reading _"Lets you
create a new client"_ (a description, not an instruction), a badge saying "Highlighted in the app",
four steps rendered as static text, and no next move anywhere on screen. Pressing the button again
re-ran the identical sequence, which is visually indistinguishable from nothing happening.

Two further faults sat underneath it.

**Step through changed only the panel.** It set the step index and left the application unmarked, so
a reader who asked to be walked through something saw the screen exactly as it had been.

**Pointing could switch itself off for the rest of a walkthrough.** Whether the ring followed a step
was derived from the last run's outcomes, so a single step whose control was not yet on screen — a
dialog nobody had opened — turned pointing off permanently. Every later step then went unmarked even
once its control had mounted, and nothing said why.

Together these produced a panel with two entry points, one of which was a dead end and the other of
which was invisible.

The obvious fix is to collapse the two buttons into one. That was rejected. The two describe
genuinely different requests — _show me_ and _walk me through it_ — and an entire memory feature is
built on which one a person prefers (`assistanceMode`, a registered Statewave claim key, the
`ASSISTANCE_EMPHASIS` adaptation and its accounting). Deleting a working, audited feature to fix a
dead end is the wrong trade. The dead end was never the second button; it was that one of them did
not go anywhere.

## Decision

**Both ways in lead into the same walkthrough. They differ in who does the work.**

| button           | what it now means                                             |
| ---------------- | ------------------------------------------------------------- |
| **Show me**      | start, point, and _take the steps a guide is allowed to take_ |
| **Step through** | start and point, at the reader's pace                         |

Show me demonstrates. It presses each step it may under
[ADR 0035](0035-a-guide-may-open-the-task-it-may-not-finish-it.md) — triggers only — and hands over
at the first step only the reader can do. For creating a client that is exactly one press: the
dialog opens, the ring lands on the billing email field, and it stops, because nobody else may type
somebody's data.

It lingers before pressing. A demonstration that fires instantly opens the dialog before the reader
has seen which control opened it, which is the one thing Show me exists to convey.

Three supporting rules:

**A walkthrough points, for as long as it is running.** Not conditional on the last run's outcome. A
step whose control is missing retracts the ring and says so, and the step after it points again.
There is no state in which the panel is walking somebody through something while the application
sits unmarked.

**Exactly one primary, and only where the next move is.** On a step the guide may take, that is
**Do it for me**; on a step only the reader can do, **Next** carries the emphasis; on the final step
neither does, because the next move is the control the ring is sitting on. The mid-walkthrough
**Show me** was removed — the ring follows the active step on its own now, and a control that
repeats what is already happening is how a panel comes to feel like it is not listening.

**There is a way out that is not "finish it".** **Stop** leaves the walkthrough and takes the ring
with it, recording nothing. Before this the only exits were pressing Done on a walkthrough the
reader had abandoned — writing down a completion that never happened — or closing the panel.

## Consequences

`assistanceMode` keeps its meaning exactly: which of the two a person prefers, and which one memory
puts first. Nothing in the profile, the planner, the retention table or the claim keys changes.

The guide still never marks up an application nobody asked it to. What changed is where the asking
happens: starting a walkthrough is now one of the ways to ask, because a walkthrough that leaves the
application unmarked is the dead end this ADR exists to close.

The reader can be ahead of the guide, behind it, or have it act for them, and all three paths run
through the same watcher — so a press by the guide and a press by the reader remain
indistinguishable to everything downstream.
