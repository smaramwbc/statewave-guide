# Statewave Guide — Day 9

## An event happened a thousand times. The product only needed to remember one thing.

Day 8 ended with:

> If the Guide can finally understand the product and the current screen, can it also remember what the user has already learned — without letting the past overwrite what is true now?

**Yes.**

But this one took the longest arc of the project so far, four closed loops, and a detour into someone else's codebase.

The first rule arrived before any storage did:

> **Memory remembers experience. Not truth.**

Memory never learns what the product _is_.

It learns what this person _did_.

A profile here is arithmetic over events:

how many times, which feature, which build, what they explicitly asked for.

No prose.

No summaries.

No model deciding what your behavior "means."

And the boundary is structural, not polite:

a remembered delete guide cannot put a Delete button on the screen for someone who lost the permission.

Memory enters the pipeline **after** the answer exists.

It may shape presentation.

It may never shape facts.

Then an independent review asked the question our gates couldn't:

were the adaptations worth having?

Two of the three were not. 😅

A returning user used to get:

> Great — you've done this before.

We removed it.

Not because it was false.

Because it was the software talking about itself.

That became its own accounting rule:

> **An adaptation that changes nothing is not an adaptation.**

Every memory proposal is now compared against what a person would have seen anyway:

```text
APPLIED             the screen actually changed
ALREADY_SATISFIED   the presentation was already doing it
REFUSED             memory wanted something it may not have
```

Emphasizing a button that was already primary?

`ALREADY_SATISFIED`.

Not an adaptation.

Not a caption explaining that something invisible happened.

Then we made memory real.

Until that point, "memory" meant `localStorage`.

A person who cleared their browser became a stranger.

So:

a person completes a guide in one browser context.

That context is **destroyed**.

A second, independent browser with empty storage recognizes them from a Statewave server and shortens the answer.

> **We gave the Guide memory. Then removed the browser it remembered us in.**

With one hard rule for the wiring:

the credential never reaches the page.

Browser → host backend → Statewave.

A key in frontend code is a key given to every visitor.

And then the interesting part started.

Because real storage asks a question `localStorage` never did:

**what is all of this costing?**

We measured a typical session:

**11 events written.**

Events a later answer could actually read?

**1.**

The two highest-volume records — one per answer viewed, one per fold opened — were read by _nothing_.

We proved it by running every event kind through the real planner, alone, across every response shape:

zero applied outcomes.

Ever.

So they stopped being persisted:

**88–100% fewer durable writes**, depending on the session.

> **No future presentation effect. No durable guide memory.**

That audit also found a real bug that had been green for weeks:

a repeated preference resolved by **array position**.

The same two records could answer `CONCISE` on one read and `FULL` on the next —

the _store_ was deciding the preference, not the person.

Counters commute.

Our ordering tests shuffled counters.

The one order-sensitive branch was never permuted. 😬

Fixed, and the fixture widened so it can never quietly regress.

And still the loop ended in **PARTIALLY**.

Because one thing remained true:

finish the same walkthrough fifty times, get fifty durable records.

All asserting one fact.

Fixing that honestly meant fixing the platform, not the Guide.

So we went to Statewave itself.

Filed the issues.

The recent-history read landed.

An active-state read landed.

Then we found something better than a bug report:

with repeated observations of the same fact, the _surviving_ record was chosen by a _random UUID_.

Eight identical runs:

five said one value, three said the other. 🎲

A memory system flipping a coin about what it remembers.

The platform fixed it in days —

deterministic ordering, wording-independent supersession, and finally:

**consumer-registrable claim keys.**

Which let the Guide finish with two small, different keys —

because remembering turned out to be two different problems:

```text
A completion is monotonic.
Once true, always true.
    → its idempotency key IS the fact
    → repeats become no-ops at the front door

A preference is mutable.
Its whole content is a value that changes.
    → deduplication would trap your first choice forever
    → it must be SUPERSEDED, never deduplicated
```

We measured the failure mode before choosing:

four preference changes under one ingest key = one record, holding the **first** value.

Three choices, silently gone.

The final numbers, against a real server, through the production adapter:

**1000 observations of one completion → 1 durable record.**

**4 preference changes → 4 episodes → 1 active value. The right one.**

**504 writes → 5 durable episodes → 2 events read back:**

> completed = true
> guidanceDetail = CONCISE

Reset resurrects nothing.

A build-1 completion does not mark build-2 complete.

26 persisted records swept: zero secrets, zero instance labels, zero raw questions, zero UI text.

And the authority negatives held all the way through:

remembered state still cannot put an action on the screen.

**139 gates. All green.**

The past can stay remembered.

It just doesn't get to overwrite what is true now —

and it finally learned to take up the space of what it _knows_,

not the space of every time it learned it.

**Statewave Guide — Day 9.**

Next question:

> **Can a stranger install all of this in an afternoon — and trust it by evening?**
