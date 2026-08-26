# 1. Build our own guidance engine

- **Status:** Accepted
- **Date:** 2026-08-25
- **Deciders:** Statewave Guide maintainers

## Context

Statewave Guide needs to move a user's attention inside a running application:
scroll to a control, put a spotlight on it, explain what it does, and eventually
walk through a sequence of steps.

That is superficially the same job a product-tour library does, and there are
several mature ones — Driver.js, React Joyride, Shepherd, Intro.js, GuideFlow.
Reaching for one would have saved a few hundred lines of overlay and positioning
code on day one.

We did not, and the reason is that the resemblance is superficial. A product tour
and an AI guide differ in what produces the steps, in what a step is allowed to
address, and in how long a step lives.

## Decision

We build the guidance engine ourselves, inside `@statewavedev/guide-react`, with
no third-party tour or positioning dependency.

The Day 0 engine is deliberately small: `DOMRect` from `getBoundingClientRect()`,
four fixed dimming rectangles leaving the target unpainted, an outline ring, and
a minimal popover — repositioned inside a single `requestAnimationFrame` on
scroll and resize.

## Rationale

### Semantic actions are the architecture, not a feature of it

The central safety property of this project is that guidance is expressed over
_registered semantic elements_, never over the DOM:

```ts
highlight('clients.create'); // the only thing the system accepts
click('#app > div:nth-child(4)'); // no API anywhere takes this
```

Tour libraries are built the other way round. Their step definitions take CSS
selectors, because a human author writes them against a specific DOM. Adopting
one would mean either translating our semantic ids into selectors at the
boundary — reintroducing exactly the selector surface we designed out — or
fighting the library's data model on every step. The element registry, keyed by
validated semantic id and holding the node privately, has to be ours because it
_is_ the boundary.

### AI-generated guidance is dynamic; tours are authored

A tour is written ahead of time: a fixed array of steps, authored by a developer,
shipped with the build. Our steps are decided at request time, by a model, from
the current context, the Product Model, and what the user has done before.

That changes the runtime requirements. Steps must be constructible from data the
application has never seen before; a step may target an element that has not
mounted yet, or has just unmounted; the sequence may be revised mid-flight. Tour
libraries reasonably optimise for the authored case and treat a missing target as
a configuration error. We need a missing target to be an ordinary, well-typed
outcome — which is why `highlight()` returns
`{ success: false, error: { code: 'target_not_mounted' } }` instead of throwing or
logging.

### We need to own the element lifecycle

The registry has to know, continuously, which semantic elements are mounted and
visible, because that set feeds `AppContext.visibleElements`, which is what lets
the guide answer "what can I do on this screen?" and what stops it from
suggesting something that is not there.

That is a React-lifecycle concern — mount, unmount, ref attachment,
`IntersectionObserver`, StrictMode double-mounting — and it is tightly coupled to
highlighting. Splitting it across our registry and a third party's internal
target resolution would leave the two views of "does this element exist?" free to
disagree.

### Memory-aware, adaptive guidance is the point

Once Statewave memory is wired in (roadmap Day 5), guidance becomes personal: skip
what this user has already been shown, expand what they struggled with, resume a
sequence abandoned last week. That means step state has to be inspectable and
resumable by the runtime rather than owned inside a library's internal state
machine.

### Framework independence

`@statewavedev/guide-core` and `@statewavedev/guide-actions` are framework-free by
rule, and Vue, Svelte and Tauri adapters are on the roadmap. Every adapter has to
implement the same `highlight` / `scroll` action contract. A React-specific tour
dependency would make React's behaviour the accidental specification of what the
other adapters must reproduce. Defining the contract ourselves means each adapter
implements a written spec instead of reverse-engineering a library.

### Dependency cost

The engine is a spotlight, an outline, a popover and a reposition loop. Set
against a permanent dependency in the render path of every consuming
application — with its own release cadence, its own React-version compatibility
matrix, and its own CSS to override — the trade favours owning it.

## Consequences

**We accept:**

- Writing and maintaining overlay positioning, popover placement, and scroll
  settling detection ourselves, including the browser edge cases.
- Cross-browser and accessibility correctness is on us. Day 0 does
  `prefers-reduced-motion` and `aria-hidden` on the dimmers; focus management and
  a full keyboard story are not done yet.
- The Day 0 visuals are plain. That is deliberate — the goal of this iteration is
  to prove the architecture, not to ship a design system.

**We gain:**

- No public API anywhere in the system accepts a CSS selector.
- A missing or unmounted target is a typed result, not an exception.
- One authority on which semantic elements exist right now.
- Freedom to make guidance memory-aware and multi-step without working around
  someone else's state machine.
- A written contract that non-React adapters can implement directly.

## Alternatives considered

**Wrap a tour library behind our semantic API.** Rejected. The wrapper would still
resolve semantic ids to selectors internally, so the selector surface would exist
in the runtime — just hidden from the type system rather than absent from it. We
would also inherit the library's failure modes for missing targets without being
able to change them.

**Use a positioning primitive (Floating UI / Popper) and write only the
spotlight.** A closer call: these solve real geometry problems well. Deferred, not
rejected on principle. Day 0 placement needs are modest, and starting dependency-
free keeps the engine's requirements visible. If popover placement grows genuinely
hard — collision detection, flipping, virtual reference elements — adopting a
positioning primitive is a reasonable follow-up, because it does not touch how
elements are addressed.

**Do nothing until an LLM is integrated.** Rejected. The element registry and the
highlight engine are what make the semantic-id contract testable end to end. If
they came after the AI layer, the AI layer's needs would have been guessed at
rather than proven.
