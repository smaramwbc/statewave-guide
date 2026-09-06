# Statewave Guide — Day 5

## We taught it to speak. Then realized it still doesn't finish the job.

Yesterday's question:

> Can we turn verified product truth into human guidance without inventing anything new?

**Yes.**

At least linguistically.

Task-wise…

not so much. 😅

We added **Guidance Compilation**.

Instead of rendering the Product Model directly:

```text
What the app does
        ↓
What we should tell the user
        ↓
How we should say it
```

Then we ran the same 21-feature review again.

The language result was almost absurdly clear.

**Too technical: 14 → 0**

Natural-language quality:

**1.14 → 1.95 / 2**

Clarity:

**1.43 → 1.86 / 2**

Malformed identifier soup:

**gone**

Incorrect factual claims:

**still 0**

And for the first time:

two features scored a full **3/3** usefulness.

Nice.

Except the overall usefulness gate still failed.

Median:

**1 / 3**

Useful outputs:

**33%**

Why?

Because we'd taught the system how to speak…

but it kept stopping halfway through the task.

Rotate API key?

> Open Settings.

That's it.

Delete client?

> Open Client Detail.

Upgrade client?

> Open Client Detail.

Export CSV?

> Open Clients.

Perfectly readable English.

Almost impressively unhelpful. 😂

The metrics made the bug obvious.

`missing_workflow`:

**5 → 16**

Actionability:

**1.24 → 1.14**

And 10 of our 14 low-scoring examples had the same root cause.

Their verified workflow referred to:

```text
feature:<id>
```

The compiler expected a graph node.

Couldn't classify it.

Quietly dropped the action.

Then proudly called:

> Open Clients.

"actionable guidance."

Narrator:

it was not actionable guidance.

That gave us another rule:

> **Correct language is not the same as complete guidance.**

So we're now separating:

```text
Entry
  ↓
Task action
  ↓
Terminal action
  ↓
Complete path
```

And another rule:

> **Every dropped verified action needs a reason.**

No more silent disappearing acts.

The bottleneck keeps moving.

First prove truth.

Then prove ownership.

Then make it human.

Now make sure it actually finishes the job.

Still no chat UI.

And I'm increasingly happy about that.

Because a beautiful chatbot answering:

> Open Settings.

when you ask how to rotate an API key…

is still just a very expensive tooltip.

**Statewave Guide — Day 5.**

Next question:

> **Can verified product knowledge become a complete user task — without giving the model any new authority?**
