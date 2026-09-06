# Closed Loop #19.1 — Memory UX Resolution

**"An adaptation that changes nothing is not an adaptation."**

**Hypothesis.** Has Statewave Guide reduced memory adaptation to changes that produce real
user-visible value, while remaining reversible and without letting memory influence product truth?

**Answer: YES**, with one loss disclosed below. The separation is untouched and every gate that
protects it is still green. What changed is that the guide stopped counting its own no-ops as
successes, stopped announcing that it remembers you, and stopped telling you a toolbar button is
inside a list.

- Starting commit: `7294fc8`
- Tests **1436 → 1461**, gates **110 → 118**, ProductClaims **113 → 113**, ProductModel hash
  unchanged.

---

## 1. What an independent review said, and what it cost

Six findings. Three were about restraint, and they are the ones that mattered:

> _"You've completed this guide before."_ is truthful but somewhat over-explicit.
> The inferred Show-me preference currently produces no perceptible UI delta.
> _"On this screen, it is inside the list."_ is misleading to a human for New client.

The uncomfortable part is not that these were wrong. It is that the previous round had already
noticed the second one — two scenario screenshots came out byte-identical — and responded by **drawing
a ring around the button** and adding a caption saying the emphasis came from previous use. That made
the report true by manufacturing the thing it reported. A reviewer saw through it in one pass.

## 2. An adaptation is only APPLIED when somebody could see it

Three outcomes, closed: `APPLIED`, `ALREADY_SATISFIED`, `REFUSED`.

The obstacle was not the union. It was that **the base could not be read from core**.
`neutralPresentationPlan` has no `emphasisedAction`, so a plan-versus-plan comparison calls every
emphasis a change — and the real base, _which button the panel makes primary when memory says
nothing_, lived in a JSX expression.

So the renderer's first-paint rules were lifted into `resolvePresentation(response, plan)`. **The
panel renders from it and the classifier compares two of them.** The planner no longer predicts what
the panel will do; the panel asks the same question the planner asks.

The accounting is printed by `test:memory-adaptation-perceptible-delta`, so it cannot drift from the
code:

| case                   | source                                 | authority              | requested            | base            | result                        | delta   | outcome               |
| ---------------------- | -------------------------------------- | ---------------------- | -------------------- | --------------- | ----------------------------- | ------- | --------------------- |
| A completed guide      | `STEP_THROUGH_COMPLETED`               | `OBSERVED_INTERACTION` | fold the steps       | steps listed    | steps folded behind a control | **yes** | **APPLIED**           |
| B repeated Show me     | three `SHOW_ME_USED`                   | `DERIVED_ADAPTATION`   | make Show me primary | SHOW_ME primary | SHOW_ME primary               | no      | **ALREADY_SATISFIED** |
| C explicit FULL        | `EXPLICIT_PREFERENCE_SET` + completion | —                      | fold the steps       | steps listed    | steps listed                  | no      | **REFUSED**           |
| D after a reset        | nothing remembered                     | —                      | nothing              | unchanged       | unchanged                     | no      | NONE                  |
| E viewed once          | `GUIDANCE_VIEWED`                      | —                      | nothing              | unchanged       | unchanged                     | no      | NONE                  |
| F memory off or failed | no store, or a store that throws       | —                      | nothing              | unchanged       | unchanged                     | no      | NONE                  |

The brief predicted `ALREADY_SATISFIED` for case C. The code says `REFUSED`, and the code is right:
the planner actively declined to collapse because the user asked for everything. Reported as it is
rather than as expected.

**One adaptation out of three does anything.** The ring is gone, `data-emphasis` carries no style at
all, and a gate fails if any rule is ever attached to it.

## 3. The guide stopped talking about itself

The completion sentence and the pattern caption are gone. What a returning user gets:

| first time                               | returning                               |
| ---------------------------------------- | --------------------------------------- |
| New client                               | New client                              |
| Lets you create a new client.            | Lets you create a new client.           |
| You need permission to create a client.  | You need permission to create a client. |
| 1. Choose "New client" … (3 steps shown) | **Show full steps (3)**                 |
| [Show me] [Step through]                 | [Show me] [Step through]                |

That control **is** the indication. It is visible, it names the true count, and it is actionable —
the smallest neutral treatment there is, so nothing further is needed for predictability. The reason
still reaches the developer inspector.

`GUIDE_META_COPY` holds two strings now instead of four. The retired ones live in
`RETIRED_META_COPY`, and `test:memory-completion-copy-restraint` fails if either reaches a plan, the
copy table or the panel source — along with the five replacements the brief named
(_"I remember"_, _"Welcome back"_, _"You usually"_ …).

## 4. "Inside the list"

The button sits in a toolbar **above** the client table. Traced end to end in a real browser, every
layer had done its job:

`presentInstances()` reports every marked element as belonging to its nearest marked ancestor, so
`<section data-guide="clients">` had six members and therefore "held members". `collectionPhrase()`
calls anything that holds members **the list**. Containment was checked against the _document_ rather
than coordinates, exactly as ADR 0027 requires — and the document agreed. Regions were then ranked by
Manhattan distance between top-left corners, and the toolbar is the first row of the page header, so
its top edge is flush with the section's — the wrapper scored closer than the table it contains.
(Those scores came from a browser trace taken while diagnosing this; they are not pinned by anything
in the repository, and the ranking is described here rather than quoted.)

Every step true, the sentence false. And the sibling case was right **by luck** — the search field is
left-aligned with both candidates, so the horizontal term cancelled and the nearer top edge happened
to be the table's.

The word that was wrong is **list**. [ADR 0030](adr/0030-a-structural-container-is-not-a-perceivable-collection.md)
adds two guards, both from evidence already in the context:

1. **A region is a collection when the runtime reports that element as one** — `table`, `grid`, `ul`,
   `list`, `listbox` and the rest. Not when something inside it happens to repeat. The first version
   of this rule asked about repetition instead, and §10 is the account of how an audit broke it in
   both directions within a week.
2. **Containment runs through the collection's own items** — the target's nearest marked container is
   the collection itself, or one of the semantic ids it repeats. A toolbar in between is neither.

Before and after, from the same fixtures in a real browser:

| target                       | before                                                   | after                                             |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| `clients.create`             | _On this screen, it is inside the list._                 | _On this screen, it is directly above the list._  |
| `clients.search`             | _Use the field showing "Search clients" above the list._ | **identical**                                     |
| `invoices.list.clear`        | _On this screen, it is inside the list._                 | **identical** — a control the `<ul>` itself holds |
| `settings.new-key`           | _On this screen, it is directly below the setting list._ | **nothing**                                       |
| `clients.search`, one match  | _…above the list_                                        | **identical** — a one-row table is still a table  |
| a grid root's toolbar button | _inside the list_ (found by the audit)                   | **nothing**                                       |

**The last row is a loss and is not argued away.** "The setting list" was a `<form>` holding a name
field, a checkbox and a save button — one of each, no repetition. The sentence read well and was
never true in the way it implied. Under _unknown is better than wrong_ omitting it is correct, and it
is still a real reduction in what the guide says. The frozen review artifacts that recorded it are
untouched.

A refused containment is now recorded in the receipt (`clients holds members but reports section, so
it is not described as a collection`), so a missing sentence is explainable without re-deriving it.

## 5. Found by running: a silent, total, random loss of memory

Building the capture, one scenario in about ten recorded **nothing at all** — no error, no failure
count, an answer on screen and an empty store. Two defects underneath, both mine, both from the
previous round's hardening.

**Event ids were being refused as runtime instance labels.** `INSTANCE_SHAPED`
(`^[A-Za-z]{2,8}[-_]?\d{2,}$`) exists to stop `INV-001` — a label read off a screen — being persisted
as an identifier. It was applied to _every_ string field, including `eventId`, which the React hook
mints as `ev` plus a random suffix. About **9%** of suffixes came out as letters-then-digits, which is
exactly that shape, so **every event of that session was refused**. An event id is minted by this
library and never observed, so the rule no longer applies to it — and the generator now produces
`ev-<session>-<n>`, whose shape is disjoint from a label's. Either fix alone would do.

**One failed append silently disabled the store for the life of the page.** Appends are serialised
through a promise chain — `queue = queue.then(step)` — which keeps them ordered and leaves the chain
rejected when one fails, so every later append quietly did nothing. Each append now runs after the
previous one has _settled_, and reports its own failure to its own caller.

Both are pinned: 3,000 generated ids must all validate, and a store whose first write throws must
still take the next one. The developer inspector now shows `written`, `rejected`, and the store's own
`writeErrors` — because a rejected write looked exactly like a write that never happened, which is
what made this cost an afternoon.

## 6. The harness was serving yesterday's build

`scripts/run-guide-e2e.mjs` spawned a preview server, never watched it, and probed a bare URL. A run
killed with SIGKILL never reaches its `finally`, so its server survives with PPID 1 — and the next
run's probe gets its 200 from **the old build**.

This was not hypothetical. An orphan from the previous afternoon was bound to port 4319 and had been
serving every browser gate for a day, including a full sweep this loop reported as green.

Fixed deterministically and without a broad kill: a `net.createServer()` pre-flight that refuses to
start when anything already holds the port and names it, spawning vite's binary directly so
`server.kill()` reaches the process that holds the port, watching the child so its own bind failure
outranks the probe, handling SIGINT/SIGTERM, and **waiting for the child to exit** — because returning
while it still holds the port made the _next_ run fail its pre-flight.

The pre-flight refusing a squatter is reproducible in one command: bind 4319 and run any capture. The
stability I watched while building this — repeated capture runs failing before the fix and passing
after — was a session observation, and nothing in this repository reproduces it. It is recorded here
as an anecdote rather than as a measurement.

## 7. Reversibility

Folding is never losing. `test:memory-fold-recoverability` proves, for every folded case, that the
plan carries the true step count, offers the control, and that unfolding restores exactly the
response's steps. The browser capture checks the same thing at the DOM: `UX02-returning-expanded`
lists the identical three steps as `UX01-first-time`, and the control reads **(3)**.

Step through, Show me, and every task action remain offered in every folded case.

## 8. The numbers

|                                        |      Before |       After |
| -------------------------------------- | ----------: | ----------: |
| ProductModel claim-set hash            | `bb27c5db…` | `bb27c5db…` |
| ProductClaims                          |         113 |     **113** |
| Static title set                       |           — |   unchanged |
| Memory-created facts                   |           — |       **0** |
| Memory-created actions                 |           — |       **0** |
| Raw user text persisted                |           — |       **0** |
| Runtime instance names persisted       |           — |       **0** |
| Secret-shaped strings persisted        |           — |       **0** |
| Cross-user leaks                       |           — |       **0** |
| Cross-workspace leaks                  |           — |       **0** |
| Question / answer / DOM text persisted |           — |       **0** |
| Memory sentences that can render       |           2 |       **0** |
| Tests                                  |        1436 |    **1461** |
| Gates                                  |         110 |     **118** |

Negative controls unchanged: **M10** — a user with six invoice memories on a client screen still gets
_"I do not have anything verified about that."_ **M11** — a remembered delete guide does not make
Delete appear without the permission. **M15** — a hand-written `localStorage` record with an invented
feature, an unknown kind and an instruction is ignored. All eighteen browser scenarios pass.

## 9. Review artifact

**`memory-ux-resolution-review-v1` — UNSCORED.** Six paired items, every score `null`, reviewer type
`non_human_independent`, `FORMAL_HUMAN_VALIDATION_GATE` deferred until pre-release.

Eleven captures; **five distinct images**. Six of them are one file — the first-time answer, both
sides of UX03, the explicit-FULL side of UX04, the fixed context sentence, and memory-off — and three
more are a second file. The package lists them in `reusedCaptures` rather than letting a reviewer
discover it. Identity there is by exact hash, so two screens that look the same can still be reported
as different over one antialiased pixel; that caveat is in the package's own instructions. UX03's two sides are
byte-identical by design — that is what `ALREADY_SATISFIED` looks like from outside — and the item
says so and asks whether such an adaptation should exist at all. UX05's left-hand side is **quoted
from the frozen Closed Loop #19 evidence with its hash**, not re-photographed, because reproducing the
old sentence would mean shipping it again; its comparison flags are `null` rather than `false`,
because one side is a quotation.

`benchmarks/memory-adaptation-review-v1` is now in `FROZEN_LOCATIONS`. It was the only review
directory with nothing protecting it, and this was the loop with every reason to overwrite it.

## 10. What an adversarial audit found

Eighty-six agents were pointed at this loop with instructions to break it. Fifty-two findings
survived an attempt to refute them, six of them blocking. Two are worth reading before anything else,
because both are the loop's own thesis failing on the loop's own work.

**The fix did not fix it.** ADR 0030's first rule asked whether the runtime had observed a
_repetition_ inside a region, which sounds like the definition of a list and is not. Repetition is a
property of the _contents_; being a list is a property of the _element_. So the audit walked an
ordinary data-grid root — a `role="grid"` holding a toolbar and five rows — straight through it: the
toolbar was correctly refused, and the sentence was handed to the toolbar's _parent_, which had a
repetition inside it and therefore qualified. `On this screen, it is inside the list.` The identical
sentence came back through a card, a table row, a custom element and a wrapper reporting no role at
all. The ADR's own Consequences claimed "a wrapper holding a toolbar and a table cannot become 'the
list'." It could.

It failed in the other direction too: requiring a repetition made the rule **data-dependent**, so
Closed Loop #18's flagship sentence disappeared whenever the search matched a single client. A table
with one row is still a table.

Both are the same mistake, and the rule now asks the question that was always the right one:

- **A region is a collection when the runtime reports the element as one** — `table`, `grid`, `ul`,
  `list`, `listbox`, and the rest. Not when something inside it happens to repeat.
- **Containment runs through the collection's own items**: the target's nearest marked container is
  the collection itself (a Clear button the list holds) or one of the things it repeats (a delete
  button in a row). A toolbar in between is neither.

Five attack shapes and four must-survive shapes are now in `test:contextual-container-language`.

**A validated event was not the event that got written.** `validateMemoryEvent` returned the caller's
object, and every store persists with `JSON.stringify` — which calls an inherited `toJSON` that the
own-property scan cannot see. An event whose _prototype_ carried one validated with **zero
rejections** and wrote a raw question, an email address, a runtime instance label and a secret-shaped
string in a single field. A getter that returned a good value while being checked and a payload
afterwards did the same without a prototype. All three of this loop's privacy invariants failed at
once. The validator now returns a plain copy of exactly the values it inspected.

**Three gates passed for the wrong reason**, and the mutation tests that prove they no longer do are
part of the fix:

| gate             | passed because                                                               | now                                                                   |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `instances`      | every probe failed the semantic-id charset before the instance rule was read | probes that are legal under every other rule; fails with the rule off |
| `copy-restraint` | it banned two exact strings in one file                                      | one render site, closed table only, no literal in the note element    |
| `fallback`       | it filtered a broken store's output, which production does not               | projects what the store actually returns                              |

`test:memory-adaptation-perceptible-delta` covered two of the planner's branches and only checked
_over_-claiming. It now covers nine, checks both directions, and requires a record for every dimension
that moved — which immediately caught a sentence rendering with no accounting row, in the one path
that still renders one.

`pnpm capture:memory` could still overwrite the frozen Closed Loop #19 round: `FROZEN_LOCATIONS` is
walked for `test:` scripts, and frozen directories are _supposed_ to be written by captures.
`test:memory-adaptation-freeze` now pins both issued files, all fifteen screenshots and the unscored
status by content.

**The review instrument** had six of its own: UX03 dropped `memoryMarked` — the only recorded
difference between its two sides — so the item asking whether the adaptation should exist was hiding
that it emits anything; UX06 was UX01 with the sides swapped, so LEFT meant "adapted" in one and
"unadapted" in the other; three rubric dimensions were scored per side when the question is about the
difference, and one was scored on a side that is a quotation rather than a screen; `--check` never
opened a PNG; and the sameness disclosure was reported by exact hash while the prose claimed a count
the hash could not support. All corrected, and `reusedCaptures` now names which files are literally
the same.

Fifteen findings were fixed as described above and in §4–§6; the rest were minor and are folded into
the code and its comments.

## 10. Limitations

**The settings sentence is gone** (§4), and that is a real reduction.

**The ranking metric is unchanged.** Regions are still ranked by Manhattan distance between top-left
corners, which has no notion of a region being too large to be a useful landmark. Under the new
eligibility rule no oversized wrapper qualifies on any screen this project tests, so it is not
load-bearing today. Changing eligibility _and_ selection in one loop would make it impossible to say
which change produced which sentence.

**A third containment guard is written down and not shipped** — requiring the target to be inside a
member of the repeated group. It would close a role-less wrapper that renders two identical children,
at the cost of refusing a control that sits in a list's own first row.

**`presentInstances()` still treats every marked element as a collection member.** That is what made a
page section look like a list in the first place. It is runtime-instance authority, which this loop
was told not to touch, and the fix sits at the language layer where the brief pointed.

**Nothing here says whether being remembered is worth it.** One adaptation out of three now does
anything at all, and whether folding a completed guide's steps is worth a memory system is exactly
what the review is for. `NEITHER` is a permitted answer on every item.

---

**`DEVELOPMENT_MEMORY_UX_RESOLUTION_REVIEW` — UNSCORED.**
**`FORMAL_HUMAN_VALIDATION_GATE` — `DEFERRED_UNTIL_PRE_RELEASE`.** Unchanged, unattempted.

No live model was called. No RAG. No autonomous actions. No Statewave network adapter. No memory
event taxonomy, authority class, scope key or version rule was changed. No chat transcript persisted.
