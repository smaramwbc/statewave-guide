# Statewave Guide — Day 1

## The DOM is not the product.

Yesterday I ended with:

> Can source code become reliable product knowledge without developers maintaining another knowledge base beside it?

The answer looks like **yes**.

But definitely not by just reading the DOM.

Day 0 ended with:

**141 files**
**~17k lines added**
**257 tests passing**

and our first closed loop:

```text
source code
    ↓
application graph
    ↓
running UI
    ↓
navigate
    ↓
highlight
```

So naturally I thought:

> "Nice. This is going surprisingly well."

That feeling lasted about five minutes. 😅

Then we ran the implementation through adversarial review.

Everything was green.

And we still found:

- a project path containing `(` silently producing an empty graph
- a React render loop happily heading past 300 renders
- a selector injection edge case that could escape toward something like `input[type="password"]`
- React 19 ref-cleanup behavior we weren't handling correctly
- graph output changing depending on path capitalization
- and a beautiful JavaScript classic where `constructor` inherited from `Object.prototype` and quietly disappeared from our graph

257 tests.

Still broken.

I love software. 😂

But the interesting part wasn't really the bugs.

It was what they forced us to clarify architecturally.

Eventually we want someone to ask:

> **"Where do I create a client?"**

…and the application doesn't respond with six paragraphs of documentation.

It takes you there.

Highlights the control.

Explains it.

Eventually, it should even understand whether you've already done this twenty times and stop giving you the kindergarten tour.

But first we need to answer a harder question:

> **What does the application actually know about itself?**

A browser DOM can tell us:

> There's a button here.

That's nowhere near enough.

We need:

```text
clients.create
      ↓
ClientsPage
      ↓
openCreateClient()
      ↓
NewClientDialog
      ↓
ClientForm
      ↓
submitClient()
      ↓
clientService.create()
      ↓
POST /api/clients
```

That is the difference between knowing the **interface** and understanding the **product**.

So we made an important decision:

> **The DOM is runtime evidence.
> It is not the product model.**

The product model starts with the source.

Routes.
Components.
Functions.
Forms.
Services.
APIs.
Permissions.
Schemas.
Tests.

Connected into an evidence-backed application graph.

And the running UI connects back to that graph through stable semantic IDs like:

```html
data-guide="clients.create"
```

No arbitrary CSS selectors.

No hoping the third button inside the fourth `<div>` is still the third button after Friday's redesign.

We also adopted a rule that I suspect is going to survive this whole project:

> **Unknown is better than wrong.**

If we can prove:

```text
clients.create
    → invokes
    → openCreateClient
```

we store it.

With the file, symbol and line that prove it.

If we _think_ something probably opens a dialog because the names look suspiciously similar?

We store nothing.

Missing knowledge can be improved later.

Confidently wrong product knowledge is how you build an assistant that confidently takes users to the wrong screen.

And once that happens twice, nobody trusts it again.

So Day 1 isn't about chat.

It's about reconstructing the real application:

```text
React UI
   ↓
handlers
   ↓
services
   ↓
HTTP
   ↓
Node API
   ↓
controllers
   ↓
business logic
```

If this works, developers may not need to maintain a separate product knowledge base at all.

Because the product already contains one.

We just normally call it **source code**.

**Statewave Guide — Day 1.**

Next question:

> **Can we follow one real user action all the way from a button to the backend — without guessing?**
