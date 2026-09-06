# Statewave Guide — Day 0

## The Beginning

I wanted to add something fairly simple to an application:

A help chat that actually knows how the product works.

Not another little bubble in the bottom-right corner that politely links you to a 200-page documentation site nobody has opened since 2023.

Something that can answer:

> "Where do I change this?"

…and instead of writing five paragraphs, it just takes you there.

Highlights the right element.
Explains what it does.
Walks with you through the workflow.

And eventually remembers that you already learned it last week, so it doesn't treat you like a new employee every Monday morning.

Sounds simple.

Obviously it isn't. 😅

So I started looking around.

There are great chat frameworks.
Great product-tour libraries.
Code documentation generators.
RAG systems.
Agent/UI protocols.

Lots of very good pieces.

But I couldn't find the thing I actually wanted:

```text
Source code
    ↓
Product understanding
    ↓
Memory
    ↓
Interactive guidance
inside the real application
```

And one requirement became clear pretty quickly:

**I don't want developers maintaining a second version of their application in Confluence just so the assistant understands the first one.**

The code should be the source of truth.

Routes.
Components.
Forms.
API endpoints.
Schemas.
Permissions.
Tests.
Translations.
Git history.

There is already a ridiculous amount of product knowledge sitting inside a modern codebase.

We just don't normally call it documentation.

So this is where the experiment starts.

We're building our own guidance engine around Statewave.

No dependency on an existing tour engine.

We'll probably make some questionable architectural decisions.

We'll definitely delete a few of them later.

And I'll share the reasoning as we go — architecture, dead ends, trade-offs, weird bugs, and the occasional:

> "This was a much better idea yesterday."

The repository starts now.

**Statewave Guide — Day 0.**

First question:

> **Can source code become reliable product knowledge without developers maintaining another knowledge base beside it?**
