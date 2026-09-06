# Statewave Guide — Day 2

## Unknown is better than wrong.

Yesterday's question was:

> Can we follow one real user action all the way from a button to the backend — without guessing?

**Yes.**

But getting there was a useful reminder that even your benchmark can lie to you.

The target looked simple:

```text
New Client
    ↓
openCreateClient()
    ↓
NewClientDialog
    ↓
submitClient()
    ↓
clientService.create()
    ↓
POST /api/clients
```

Frontend to backend.

One connected application graph.

No docs.

No manually maintained knowledge base.

Easy, right? 😅

Our first quality run had other ideas.

`invokes` precision: **39%**

API detection: **19%**

`calls_api`: **0%**

Beautiful.

At least the tests were honest. 😂

Then something more interesting happened.

We found what looked like an indexer bug.

The benchmark expected:

```text
GET /clients
```

The indexer produced:

```text
GET /api/clients
```

My first instinct was to normalize them.

Turns out that would have been wrong.

One adversarial fixture had another router with `/clients` whose mount point could not be determined.

Strip `/api` from the known endpoint and suddenly two different routes become the same thing.

Congratulations.

We've manufactured product knowledge.

So instead of fixing the indexer…

**we fixed the benchmark.**

That became another rule:

> **A benchmark isn't truth.
> It's an executable statement of what we currently believe truth is.**

If the evidence proves the benchmark wrong, the benchmark loses.

We also introduced partial identities:

```text
api:GET:?/clients
```

Meaning:

> "I know this route exists. I do not know where it is mounted."

No guessing.

No helpful little inference quietly connecting it to the wrong backend handler.

After reconciliation:

**API precision:** 100%
**invokes:** 100% / 100%
**uses_hook:** 100% precision
**uses_service:** 100% precision
**submits_to:** 100%
**renders:** 100%
**validates_with:** 100%
**calls_api:** 83% precision / 100% recall

Across the graph:

**0 relationships without evidence.**
**0 invalid confidence values.**
**0 unsupported inferences pretending to be facts.**
**0 / 37 adversarial trap violations.**

437 tests green.

We also discovered our previous "deterministic output" wasn't actually deterministic.

Same repository.

Different working directory.

Different graph.

😬

Eight working directories later:

**one hash.**

Fixed.

One of the most important files we added might actually be `refusals.md`.

A catalogue of things the system intentionally refuses to infer.

One real-world pattern would have generated dozens of fake API endpoints if we'd taken the obvious shortcut.

So we didn't.

That's increasingly becoming the philosophy behind Statewave Guide:

> **Missing knowledge is fixable.
> Wrong knowledge destroys trust.**

So yes:

We can follow a real user action all the way to the backend without guessing.

Now comes the next problem.

We know increasingly well **what happened**.

But not necessarily what those facts **mean to the user**.

**Statewave Guide — Day 2.**

Next question:

> **Can a model add product meaning to this graph without being allowed to invent product truth?**
