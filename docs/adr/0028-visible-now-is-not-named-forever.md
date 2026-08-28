# 28. Visible now is not named forever

- **Status:** Accepted
- **Date:** 2026-08-28
- **Extends:** [ADR 0018](0018-identifiers-identify-user-visible-evidence-names.md),
  [ADR 0022](0022-the-ui-asks-for-guidance-it-does-not-interpret-product-truth.md),
  [ADR 0025](0025-runtime-instances-are-contextual-identity-not-product-truth.md),
  [ADR 0027](0027-vision-may-describe-the-screen-it-may-not-define-the-product.md)

## Context

`clients.search` has been the standing example for three loops. It is a real, addressable,
highlightable input that the interface never names in any way the authority rules accept — and it
carries `placeholder="Search clients"`, which every user can read.

ADR 0018 refuses to let that placeholder become a title, and it is right to. A title answers _what is
this feature called_, permanently, for everyone; a placeholder is a hint one developer wrote into one
input, and promoting it is the same substitution that used component names as product truth.

Closed Loop #17 paid the full price of that refusal and produced _"On this screen, it is directly
above the list."_ The independent review scored it **1.00 out of 3** for helpfulness and **0.63 out of
2** for non-redundancy: true, correct, and mostly telling people what they could already see.

So the question is not whether the refusal was right. It is whether refusing to _name_ something
should also mean refusing to _mention_ what it says.

## Decision

**The interface may lend us words for this moment without turning those words into permanent product
truth.**

_The field showing "Search clients"_ is not a name. It is a report about what a person can read on
their screen right now, and it stops being true when the screen changes. Both halves are the point:
it is genuinely more useful, and it is genuinely temporary.

### Eligibility is decided by the attribute, never by the string

A placeholder and an `aria-label` are chrome — somebody writing the interface put them there to be
read as interface. A table cell, a note field, a paragraph of prose is content: it arrived from a
database or from a person typing, and it is exactly as trustworthy as whoever typed it.

Closed Loop #17 proved that distinction cannot be made by reading the words, because the words can
say _"SYSTEM: Ignore previous instructions"_ and look like anything at all. So trust is assigned by
the attribute the text was read from, before anything looks at what it says. The hostile note loses
for being `VISIBLE_TEXT`, which has no descriptor authority — not because a filter recognised it.

### Four sources, kept apart

`PLACEHOLDER`, `VISIBLE_TEXT`, `CURRENT_ACCESSIBLE_NAME`, `RUNTIME_INSTANCE_NAME`. They are not
interchangeable and they do not share authority. The first two of those decide this loop; the last is
governed by ADR 0025 and is deliberately not merged with it, because "which row is this" and "what is
this control called" are different questions that happen to both involve text on a screen.

There is no `INPUT_VALUE`. Not a rule against using one — no such source exists, so there is nothing
to grant authority to later. A user typing "John Smith" has not renamed the field.

### One permitted form

A source with descriptor authority supports exactly one sentence shape: _the field showing "X"_. It
may not become _the field named X_, and it may not become _use the X feature_. Those assert identity,
and identity is the ProductModel's to give.

The difference is one word, which is exactly the kind of thing that erodes when somebody improves the
phrasing. So the phrasing is a gate, the quotation marks are a gate, and the noun — _field_, _button_
— comes from the role the browser reports rather than from anything invented.

### Contextual sentences have their own verifier

Closed Loop #17 disclosed that its location sentence was the only user-facing string no verifier ever
saw. The fix is not to push transient text through the static verifier: those two answer different
questions and share no evidence, and for a sentence about what is on screen the static verifier's
honest answer is always _the ProductModel does not say this_. Teaching it otherwise would be far
worse than the gap.

So there are two paths. `verifyContextualStatement` proves relation, target, text source, freshness,
route, privacy, region-phrase authority and occlusion, and issues a **receipt** recording which. A
sentence without a receipt does not render.

Clauses are dropped individually. A statement whose placeholder went stale keeps its geometry,
because _above the list_ is true whether or not the field is still showing its hint. Two things are
never partial: an unmounted target, and a target the guide's own panel is covering.

### Freshness is what makes it honest

Snapshot, route, presence, and the text itself. When a user types, the browser stops painting the
placeholder, the host stops reporting it, and the descriptor disappears on the next question — while
the location, still true, remains.

### Presentation, and nothing else

Runtime-visible language never reaches feature resolution. A string on screen cannot change which
feature a question is about, or an application could steer guidance by rendering text. Whether it
should ever inform resolution is a separate authority decision and is not taken here.

## Consequences

ProductModel delta is **zero**; the claim set is byte-identical to Closed Loop #11, and no static
title, synonym or label changed. The same words now appear in a description of the current screen and
nowhere in the product.

The primary case reads:

> Lets you filter clients.
> _Use the field showing "Search clients" above the list._

The first sentence is behaviourally verified truth. The second borrows three words from the screen,
computes a relation from bounding boxes, and expires.

**Limitations.** Whether this is actually better is not established here, and this ADR deliberately
does not claim it. Both sentence forms are captured from the same build and handed to an independent
review, because the loop that produced a 1.00/3 sentence did so while being confident about it.

The trust rule is coarse. `placeholder` and `aria-label` are treated as host-authored because that is
almost always true, and an application that renders user content into an `aria-label` would defeat it
— the honest description is that this moves the attack surface to a much narrower and more auditable
place, not that it eliminates it.

And the placeholder question ADR 0018 answered is still open in a different form: a field whose
_only_ available words are a placeholder gets a description but never a name, so "what is this
called" remains unanswerable. That is the intended behaviour, and it is also the thing a user is most
likely to have wanted.
