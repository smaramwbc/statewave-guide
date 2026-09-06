# Statewave Guide — Day 7

## Half of what we said was true.

Yesterday I ended with:

> Can every factual sentence become provable without turning the Guide back into a robot?

To answer that, we first had to admit something uncomfortable:

we didn't actually know what our sentences were claiming.

A sentence like:

> Change the client's plan without leaving the page.

reads as one statement.

It isn't.

It's four:

- there is a plan
- it belongs to a client
- it can be changed
- the change happens on this page

So we stopped auditing sentences.

We started auditing **propositions**.

Every user-facing sentence for all 21 features — purpose, summary, title, question — decomposed into its individual claims.

**194 propositions.**

Then each one judged against the graph, the verified claims, and the source.

Then we did the part I'm most glad we did.

We attacked our own audit.

A second adversarial pass tried to **refute every verdict**.

Find the support the first pass missed.

Prove that a fragment called "style" was actually a factual claim.

The refutation pass overturned:

**71 of the 104 verdicts it examined.**

Two thirds.

An audit that stops after one pass isn't an audit.

It's a first draft with confidence. 😅

The final number:

**97 of 194 propositions supported.**

**51.5%.**

Half of what the Guide told users was actually established.

Zero of it was _dangerous_ — the factual-claims gate had been holding for days.

But "not dangerous" and "established" are very different standards.

And the unsupported half wasn't one problem.

It was four.

```text
PRODUCT_OVERREACH      38   the model invented it
INDEXER_OMISSION       47   true in the source, missing from the graph
REVIEW_FACT_OMISSION    9   proven, but never shown to the reviewer
PRESENTATIONAL          3   not a claim at all
```

That distinction matters more than the total.

> "onto the enterprise plan"

`changePlan('enterprise')` sits at `ClientDetailPage.tsx:114`.

The plan tier is a literal in the source.

The graph just doesn't record call arguments yet.

That's an indexer roadmap item.

> "for an account manager"

appears in **no file of the fixture**.

Nowhere.

That's a fabrication.

One count of "unsupported" would have hidden a roadmap item behind a lie.

Different failures go to different layers:

```text
invented        → the renderer stops saying it
missing         → the indexer learns to see it
never shown     → the reviewer gets the fact
```

No verification rule was loosened.

Then the audit found the case that decided the next three days.

One of our task steps said:

> Choose "Open".

Confident. Quoted. Clean.

Except nothing in that interface says "Open".

The button's visible text at runtime is the **invoice number**.

The word "Open" came from the last segment of the semantic id:

```text
invoices.list.open
```

An internal identifier, leaked into a user's instructions, wearing quotation marks.

And the instrument that should have caught it?

It had **excluded** that control from review —

because the control "had no readable text."

An exclusion was concealing an emitted action.

That produced a rule I never want to lose:

> **An exclusion may remove a control from the denominator only if no emitted sentence names it.**

The audit also audited us in the other direction.

Two of my own earlier findings turned out to be wrong when re-read against the code instead of the schema.

I had computed that all 21 features could mint a `view` capability.

Measured properly: **exactly one** can.

The verifier is conjunctive and fails closed — with no endpoint among the cited targets, it refuses.

The strictest rule in the system was already holding the line.

I just hadn't trusted it enough to check. 😂

So where did that leave the sentences?

> **A sentence is not the unit of truth. A proposition is.**

And with that, a much more interesting observation.

The "Choose Open" button proves the interface has words we refuse to use.

The placeholder in the search field.

The label painted next to the toggle.

The text on the button the user is literally looking at.

Our static model rejects them all as permanent names — correctly.

Placeholders change.

Labels move.

But the _user can see them right now_.

There is a whole layer of true, current, visible language sitting in the running application…

and the Guide walks past it to quote an internal id.

**Statewave Guide — Day 7.**

Next question:

> **How much can we borrow from the running interface itself without turning temporary UI text into permanent product truth?**
