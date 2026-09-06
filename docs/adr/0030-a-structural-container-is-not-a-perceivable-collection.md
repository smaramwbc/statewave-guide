# 30. A structural container is not a perceivable collection

- **Status:** Accepted
- **Date:** 2026-08-29
- **Extends:** [ADR 0027](0027-vision-proposes-evidence-decides.md),
  [ADR 0028](0028-visible-now-is-not-named-forever.md)
- **Refines:** [ADR 0029](0029-memory-remembers-experience-not-truth.md)

## Context

An independent review of the memory adaptation package read this sentence, about the **New client**
button on the clients screen:

> On this screen, it is inside the list.

The button sits in a toolbar **above** the client table. A reviewer following that sentence looks in
the wrong half of the screen.

Nothing was broken, which is what made it interesting. Traced end to end in a real browser, every
layer had done what it was designed to do:

- `presentInstances()` reports every marked element as belonging to its nearest marked ancestor, so
  the page section `<section data-guide="clients">` had six members and therefore "held members".
- `collectionPhrase()` calls anything that holds members **the list**.
- Containment was checked against the _document_, not against coordinates, exactly as
  [ADR 0027](0027-vision-proposes-evidence-decides.md) requires — and the document agreed: the button
  really is inside that section.
- Regions were then ranked by Manhattan distance between top-left corners. The toolbar is the first
  row of the page header, so its top edge is flush with the section's, and the section scored 153.66
  against the table's 253.94.

Every step was true. The sentence was false. And the sibling case — the search field, which says
_"Use the field showing 'Search clients' above the list"_ — was correct **by luck**: it is
left-aligned with both candidate regions, so the horizontal term cancelled and the nearer top edge
happened to be the table's.

The word that was wrong is **list**. A wrapper holding a toolbar and a table is a place on a page. It
is not a collection, and containment by it is not something a person perceives.

## Decision

**A region may be called a collection only where the runtime reports that element as one, and
containment is authorised only through the collection's own items.**

The first version of this decision asked a different question — whether the runtime had observed a
**repetition** inside the region — and an adversarial audit broke it in both directions before it had
shipped a week.

_Too permissive:_ repetition is a property of a region's **contents**, not of the region. A
`role="grid"` root holding a toolbar and five rows has a repetition inside it, so the toolbar's export
button — refused by the toolbar, then handed to its parent — was described as _inside the list_. The
same sentence came back through a card holding three chips, a table row holding three buttons, a
custom element, and a wrapper reporting no role at all.

_Too strict:_ it made the rule **data-dependent**. A client table filtered down to one row stopped
being a collection, and Closed Loop #18's sentence went with it. A table with one row is still a
table.

So, two guards, both from evidence already carried in `GuideQueryContext`:

1. **The element reports itself a collection.** `table`, `grid`, `treegrid`, `list`, `listbox`,
   `tree`, `feed`, `menu`, `menubar`, `tablist`, `rowgroup`, `select`, and the tag names the runtime
   falls back to — `ul`, `ol`, `dl`, `tbody`. Nothing else is a list, whatever it contains. An
   allow-list here rather than a deny-list, because the failure of a deny-list is silent
   over-permission and the failure of an allow-list is a missing sentence.

2. **Containment runs through the collection's own items.** `inside` is authorised only when the
   target's **nearest** marked container is the region itself — a control the list holds, like the
   Clear button at the top of the invoice list — or one of the semantic ids the region **repeats** — a
   delete button inside a table row. A toolbar between the two is neither, which is the whole point.

A refused containment is **dropped, never downgraded to a direction**, and the refusal is recorded in
the receipt so a sentence that came out shorter than expected can be explained without re-deriving it.

## Consequences

**The shapes an audit broke are closed, and they were ordinary rather than hostile.** A grid root that
also holds a toolbar is what most data-grid components render. Five of them are pinned as gate cases:
a toolbar button transitively inside a grid root, a custom-element wrapper, a wrapper reporting no
role, a list item holding repeated chips, and a table row holding repeated buttons.

**The Closed Loop #18 sentence is byte-identical**, and now for a reason rather than by luck. _"Use
the field showing 'Search clients' above the list."_ survives because `clients.table` is a `<table>`,
not because five rows happened to be on screen — so it survives a search that matches one client, and
an empty table, both of which the first rule lost.

**`invoices.list.clear` keeps its sentence.** It is a direct child of a `<ul>`; the list holds it, so
the list may be said to contain it.

**One sentence was lost, and it read well.** On the settings screen, _"On this screen, it is directly
below the setting list"_ described a `<form>` holding a name field, a checkbox and a save button. A
form is not a collection under either version of this rule. That sentence was not obviously wrong to a
reader, and it is gone for the same reason the obviously wrong one is. Under _unknown is better than
wrong_ this is correct, and it is a real reduction in what the guide says. The frozen review artifacts
that recorded it are untouched.

**A host that reports no roles loses location sentences entirely.** That is the cost of an allow-list,
and it is stated rather than hidden: the React binding derives a role for every element from its tag,
so this affects a host supplying geometry through some other path. Precision over recall.

**What this does not fix.** The ranking metric is still Manhattan distance between top-left corners,
which has no notion of a region being too large to be a useful landmark. It matters far less now that
only elements reporting themselves collections are eligible, and it is left alone deliberately:
changing eligibility _and_ selection in one loop would make it impossible to say which change produced
which sentence. Two `<table>`s on one screen can still be ranked by corner distance rather than by
which one the control is actually near.

**`containerSemanticId` is an id, not an element.** Two rows marked with the same semantic id are two
elements whose children merge into one bucket, so "the items this region repeats" is an approximation.
Guard 1 carries the weight; guard 2 narrows what the approximation can authorise.
