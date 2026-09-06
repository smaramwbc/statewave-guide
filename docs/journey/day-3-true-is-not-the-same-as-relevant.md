# Statewave Guide — Day 3

## True is not the same as relevant.

Yesterday I asked:

> Can a model add product meaning to the graph without being allowed to invent product truth?

The answer is:

**Yes.**

But apparently factual truth still isn't enough. 😅

Today we finally put a real model behind Statewave Guide.

The good news first.

Across hundreds of factual claims under deliberately hostile conditions:

**0 invented routes reached the Product Model.**
**0 invented permissions.**
**0 unknown subjects.**
**27/27 forbidden capabilities refused.**
**23/23 unsupported actions refused.**

The verifier did its job.

Then came the less exciting number.

The model found the right evidence about **89%** of the time…

…but only turned it into a verifiable product claim about **20%** of the time.

**71%** of features ended with no verified capability.

Workflow recovery: **18%**.

So technically:

Very safe.

Practically:

A beautifully verified empty room. 😂

Then we found the interesting bug.

One claim passed verification that should never have been attached to the feature being analyzed.

The model said, roughly:

> Settings changes are saved by submitting the settings form.

Structurally?

Correct.

The form exists.

It submits.

The relationship exists.

Every verification rule passed.

There was only one problem:

**It was true about the application, but not about the feature we were asking about.**

The verifier answered:

> Is this statement supported by real evidence?

Yes.

What it didn't answer was:

> **Does this evidence actually belong to THIS feature?**

That's a very different class of error.

And it gave us today's rule:

> **Truth is not enough. Context owns truth.**

An application graph is a neighborhood.

Related components, sibling elements, routes and services naturally sit next to each other.

If an assistant can grab any true fact from that neighborhood, it can produce answers that are technically correct and completely irrelevant.

So the next layer became **Feature Scope**.

A claim now has to prove:

- the subject exists
- the evidence exists
- the evidence supports the claim
- **the claim belongs to the feature being explained**

We also learned that we were asking the model to do too much.

Find the evidence.
Choose the claim.
Choose the action.
Choose the subject.
Choose the relationships.
Then explain it.

The source graph already knows most of that.

So we changed direction:

Instead of:

```text
Model
   ↓
invent claim
   ↓
Verifier
```

we moved toward:

```text
Graph
   ↓
deterministic claim opportunities
   ↓
Model adds meaning
   ↓
Verifier
```

Same safety boundary.

Less guessing.

And it worked.

Verified claim yield went from roughly **20% → 95%**.

Wrong-feature claims went to **0**.

Model restraint reached **30/30**.

At that point we had something very safe.

So naturally we asked the question we should probably have asked earlier:

> **Does any of this actually help a human?**

**Statewave Guide — Day 3.**

Next question:

> **Can technically safe product knowledge survive contact with an actual user?**
