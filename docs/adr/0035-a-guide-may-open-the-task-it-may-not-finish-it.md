# 35. A guide may open the task; it may not finish it

- **Status:** Accepted
- **Date:** 2026-09-13
- **Refines:** [ADR 0022](0022-the-ui-asks-for-guidance-it-does-not-interpret-product-truth.md)

## Context

Every safe action this system offers is inert. `navigate`, `highlight`, `scroll`, `focus`,
`open_guide_step` — each moves attention and changes nothing, and that is precisely what makes
offering one always harmless. The engine said so out loud:

> Nothing being _told_ to a user depends on whether a guide can press it for them: instruction and
> automation permission are different questions, and `Choose "Create client"` is displayed precisely
> because the guide will never click it.

Two things were asked for on top of that. First, that a walkthrough notice when the reader does the
step themselves — pressing **New client** in the application and then having to press **Next** in
the panel is bookkeeping the guide is supposed to be doing. Second, that where a step names a
button, the guide offer to press it.

The first is observation and costs nothing. The second is the line above.

It is worth being exact about why that line exists, because "just click it" sounds small. A
walkthrough runs against a real application holding real records. A convenience that presses
**New client** opens a dialog; the same convenience, one step later, presses **Create client** and
there is now a client. Nothing about a button's markup distinguishes those two. A label heuristic
would be a guess, and a guess in this direction writes to somebody's database.

The compiler had already answered the question, in a field nobody was reading. Every step carries a
`role`, recorded from what the evidence showed it was for:

| role           | means                            | in `clients.create`        |
| -------------- | -------------------------------- | -------------------------- |
| `entry`        | go to the screen                 | "Open Clients."            |
| `trigger`      | open the task — a dialog, a form | `Choose "New client".`     |
| `input`        | supply the user's own data       | "Enter the billing email…" |
| `confirmation` | commit it                        | `Choose "Create client".`  |

## Decision

**A guide may take a step that reveals the task. It may never take one that commits it, and never
one that supplies data.**

Read off the compiled `role`, not off the DOM:

| role           | a guide may | because                                                  |
| -------------- | ----------- | -------------------------------------------------------- |
| `entry`        | yes         | navigation is already an inert safe action               |
| `trigger`      | yes         | it reveals the task, and closing the dialog undoes it    |
| `input`        | no          | `SUPPLIES_DATA` — the record being written is the user's |
| `confirmation` | no          | `COMMITS_A_CHANGE` — pressing it _is_ the change         |

An unrecognised role is refused, not allowed. A compiler that grows a fifth role has to come here and
say what it means.

Three structural choices carry this, rather than a warning somebody can click past.

**The permission is a field of its own, not another action kind.** `GuideAnswerStep.performance`
sits beside `actions` precisely because everything in `actions` is inert and this is not. A host that
executes every action it is handed — which the contract invites — must never discover it has been
pressing things.

**A host opts in, and the opt-in carries the DOM access.** `StatewaveGuide` takes an optional
`stepInteraction`; without it the panel neither watches nor presses, which is every release before
this one. `createStepInteraction(registry)` is the supplied implementation, and it is the only place
in the package that reaches a node in order to operate it.

**Deciding and doing stay apart.** The engine decides `byGuide` from compiled evidence; the seam
presses what it is told to press; the panel reads the verdict and renders a button. A panel that
looked at the control and decided for itself is the failure ADR 0022 exists to prevent — and the
same split already caught an earlier attempt at the callout text.

Watching obeys the same verdict. A `confirmation` is not watched either: advancing past the commit
because the user clicked something would claim the task was finished on evidence the guide does not
have. A `TYPE` step is not watched because clicking into a field is not filling it in.

## Consequences

Pressing goes through the host's element, via `node.click()` — the same entry point assistive
technology uses, so a control the host has disabled no-ops exactly as it would for anybody. The
guide's press and the user's press then take an identical path: the click fires, the walkthrough's
own listener notices, and the step advances. There is no second code path that could drift.

The observed-interaction listener is passive — bubble phase, nothing cancelled — so an application
behaves exactly as it would with nobody watching.

What this does not do is complete a task for somebody. The last step of every procedure still
belongs to the person whose name is on the record, which is the same reason it was displayed in the
first place.
