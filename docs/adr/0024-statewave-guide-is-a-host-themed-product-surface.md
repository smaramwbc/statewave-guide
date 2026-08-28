# 24. Statewave Guide is a host-themed product surface

- **Status:** Accepted
- **Date:** 2026-08-28
- **Extends:** [ADR 0022](0022-the-ui-asks-for-guidance-it-does-not-interpret-product-truth.md),
  [ADR 0023](0023-the-running-application-can-carry-part-of-the-explanation.md)

## Context

The first interactive product looked like what it was: a panel built to test a hypothesis. That was
the right thing to build and the wrong thing to ship. A guide lives inside somebody else's
application, beside their type, their colours and their layout, and one that arrives with its own
visual identity reads as an advertisement rather than as part of the product.

## Decision

**The host owns presentation. Statewave owns interaction invariants and truth.**

A host may change colours, type, radius, density, appearance, the side the panel sits on, its width,
the launcher, and whose name is in the header. Statewave keeps what a guide has to be: what it says,
which control it points at, what it refuses, the closed set of inert actions, accessibility, and the
attribution.

### Configuration is presentation, and presentation only

There is no value in `theme`, `branding` or `layout` that can change a sentence, a target, a refusal
or an action. Asserted rather than asserted about: `test:guide-theme-contract` asks the same six
questions under four themes and requires the responses byte-identical. The engine never receives a
theme, which is what makes the separation structural rather than a convention someone remembers.

### Structured help, in a conversational frame

The first cut of this loop shipped a docked utility panel and was rightly sent back. The approved
reference is a floating card: a question in a soft tinted bubble with a timestamp, an answer as a
bordered card with a sparkle mark, circular step numbers, an icon on each action, a composer with a
square send control, a launcher with a `⌘K` hint, and a matching customizer. That is what the panel
now is.

What did **not** change is what goes inside the card. An answer is still a small document — heading,
purpose, condition, numbered procedure, one clear affordance — and every sentence in it is compiled
guidance. The reference's own copy (_"Create a new client record to start managing their account…"_,
_"You must have 'Team Admin' permission"_) was illustrative; a component that rendered it would be
inventing product facts. Pixel-fidelity is a property of the chrome. The words come from the
contract. No avatar, and no typing animation over a call that returns in under forty milliseconds.

Where compiled guidance contains two supported sentences saying nearly the same thing, the purpose is
primary and the summary is shown only when it carries something the purpose does not. That is a
**presentation** decision made by a deterministic rule, and nothing is rewritten or removed: both
sentences remain in the response for anything that wants them. Editing product language from a
component is precisely what this project has spent twelve loops preventing.

### Typed tokens compiled to CSS variables

Tokens rather than class names, because a class name is a promise about DOM structure and this
package does not make that promise. Every token becomes a `--statewave-guide-*` custom property a
host can also override from its own stylesheet without rebuilding anything. A partial configuration
is enough — `{ colors: { primary: "#006BFF" } }` inherits the rest.

Invalid configuration falls back and is reported. `primary: "octarine"` is not a colour a browser
knows, and CSS's answer to one it cannot parse is to drop the declaration — producing a panel with a
missing background and no indication why. Colour names are checked against the list a browser
actually has; the first version accepted any short word, which is how `octarine` got through.

### Scoping without Shadow DOM

Every rule carries a `.sw-guide` ancestor, so a host selector of the shape `body.app button` — two
elements and one class — cannot out-specify a two-class panel rule. This was found the hard way: the
first scoping attempt read correctly and lost every primary button to the demo's own
`body.demo button`, visible only in a screenshot.

**Shadow DOM was evaluated and not adopted.** The panel depends on document-level focus behaviour —
remembering what the host had focused, restoring focus on close, a live region announcing an answer —
and on a highlight controller that resolves host elements outside the panel. Moving the panel into a
shadow root would require every one of those to become shadow-aware for a benefit that scoped CSS
already delivers against realistic host resets. The residual gap is a host whose reset is marked
`!important`, which wins against any stylesheet in the same document; that is documented as a
limitation rather than papered over by adding `!important` throughout.

### The application is still part of the explanation

No miniature screenshot of the host inside the answer. The running application is the visual
explanation, and _Show me_ points at it. That remains attention rather than autonomy: navigate,
scroll, highlight, focus, and nothing that changes anything.

### Attribution stays

Every panel carries **Powered by Statewave Guide**, once, small, theme-aware, linking to
`statewave.ai`. A host may put its own name in the header beside it. This is not licensing logic and
none was added.

## Consequences

The guide can be dropped into another product and made to look like part of it, from a configuration
object a host writes by hand — as a floating card by default, or docked to an edge with
`layout.mode: "docked"`. The paperclip in the composer is decorative and inert: it matches the
reference, is not focusable, and is not a button, because there is no attachment feature and nothing
here pretends to be one. The `?brand=acme` demo proves it: a different product name, `#006BFF`,
12px radius, and not one line of this package recompiled.

The ProductModel is byte-identical to the Closed Loop #11 baseline, as it has been for four loops.

**Limitations.** A host reset marked `!important` still wins. The theme playground warns about
contrast rather than correcting it, which is deliberate — silently changing a colour somebody chose
would be this package overruling a design decision — but it means an inaccessible theme can be
shipped by a host who ignores the warning. And the demo shell styles the benchmark application from
outside rather than restructuring it: no navigation that does not exist was invented to make the
screenshots look more like a CRM.
