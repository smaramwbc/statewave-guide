# Statewave Guide — Day 4

## We passed the safety test. Then failed the product test.

Yesterday I asked:

> Can technically safe product knowledge survive contact with an actual user?

Not particularly. 😅

Wrong-feature claims accepted: **0**

Unsupported claims accepted: **0**

Model restraint: **30/30**

Verified claim yield: **95%**

Nice.

Then we asked:

> Would any of this actually help a human?

Median usefulness:

**1 / 3**

Only **24%** of reviewed features were rated genuinely useful.

Nothing was dangerously wrong.

Nothing was completely useless either.

It was worse in a much more software-engineering kind of way:

**almost everything was mediocre.**

We assumed the remaining problem would be missing capabilities.

The data disagreed.

Features with a verified capability scored:

**1.43**

Features without one:

**1.14**

Barely a difference.

Meanwhile:

**14 / 21 outputs were too technical.**

Then we found the smoking gun.

Ten features exposed this sentence directly to the user:

> "No capability, route or permission has been verified for this feature."

Every single one was rated too technical.

**10/10.**

Fair enough. 😂

That's not product copy.

That's a debugger having an existential crisis in front of the customer.

Another feature had excellent evidence:

POST endpoint ✓
Create permission ✓
Submit path ✓
Button ✓

And our deterministic renderer proudly produced:

> "You can create a new invoices create form and submit the invoices create form form…"

Technically grounded.

Linguistically deceased.

That exposed another boundary.

We had already separated:

**what the application does**

from:

**what the model thinks it does**

Now we needed to separate:

**what we know**

from:

**what a human actually needs to hear**

So the architecture gained another layer:

```text
Source Code
    ↓
Application Graph
    ↓
Product Model
    ↓
Guidance Compiler
    ↓
Human Help
```

The Product Model answers:

> **What do we know?**

The Guidance Compiler answers:

> **What is worth telling the user?**

The renderer answers:

> **How should we say it?**

No verification rules loosened.

No extra authority for the model.

We were finally admitting something painfully obvious:

> **Technically correct data structures do not automatically know how to talk to humans.**

Shocking discovery for software developers, I know.

**Statewave Guide — Day 4.**

Next question:

> **Can we turn verified product truth into human guidance without inventing anything new?**
