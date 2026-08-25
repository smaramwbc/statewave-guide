# Statewave Guide — React demo

A small React + Vite + React Router application that proves the Day 0 foundation
works end to end:

```
semantic product element + action runtime + React registry + our guidance engine
```

There is **no AI and no chat here.** The demo panel in the bottom-right corner
sends named actions through the action runtime by hand, and prints the raw result.

## Run it

From the repository root:

```bash
pnpm install
pnpm build          # the demo consumes the workspace packages
pnpm dev:example
```

## What to try

| Button                    | What it proves                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| **Highlight New Client**  | A semantic id resolves to a live node; our own spotlight engine draws on it                |
| **Navigate to Clients**   | The host's router implementation, registered as an action                                  |
| **Scroll to Settings**    | `scrollIntoView` then highlight — and, from another page, a clean `not-registered` failure |
| **Try a CSS selector**    | Refused with `invalid_input` before any DOM code runs                                      |
| **Try an unknown action** | Refused with `unknown_action`, listing what _is_ registered                                |

The last two are the point. The safety boundary is not a convention here — it is
schema validation that a selector cannot pass.

The panel also shows the live application context: the current route, how many
elements are registered, how many are visible, and what the action vocabulary
currently contains.

## Index it

```bash
pnpm index:example
```

This runs the indexer against this app and writes
`examples/react-demo/.statewave-guide/application.json` — 28 guide elements and 4
routes, every one traceable to a file and line.

Compare what the indexer found with what the demo panel reports at runtime: they
are the same identifiers, because they are the same strings, written once in the
JSX.

## Two halves of the same identifier

The hero elements carry **both** a literal `data-guide` attribute and a React
registration, because the two do different jobs:

|                                          | What it gives you                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `data-guide="clients.create"` in the JSX | the **indexer** can see it — it ends up in the Product Model with a file and line |
| `<GuideElement>` / `useGuideElement()`   | the **runtime** knows it — label, description, mount state, viewport visibility   |

Either alone works. The guide resolves an attribute-only element straight from
the DOM, and a wrapper-only element registers fine but stays absent from the
Product Model. Using both is what makes the two views agree — which is the point
of the whole architecture.

`Clients.tsx` shows the component form, `Settings.tsx` the hook form.

## Notes on the source

- Every addressable element carries a literal `data-guide` attribute. `Sidebar.tsx`
  has a comment explaining why the links are written out longhand rather than
  mapped — a computed `data-guide={link.id}` still works at runtime, but the
  indexer cannot prove it, and the two views must agree.
- `data-guide-type` states the semantic kind where the tag name doesn't imply it
  (a React Router `<Link>` is a `link`, not `other`).
- `App.tsx` shows the routing boundary: the built-in `navigate` action exists only
  because the provider is handed a `navigate` implementation.
- `RouteSync` pushes the router's location into the guide context. The guide never
  reads the router.

Apache-2.0
