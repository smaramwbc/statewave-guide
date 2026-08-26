# Statewave Guide — React demo

A small full-stack application that proves both closed loops end to end.

**Loop 1 — where is it?** A `data-guide` attribute in source becomes an application-graph node,
becomes a runtime registration, becomes a spotlight on a real DOM node.

**Loop 2 — what does it do?** The same identifier is traced through its handler, the dialog it opens,
the form that submits, the service that runs, the endpoint it requests, and the backend controller
that answers.

There is **no AI and no chat here.**

## Run it

From the repository root:

```bash
pnpm install
pnpm build          # the demo consumes the workspace packages
pnpm dev:example
```

The backend is not started by `dev:example` — it exists to be _indexed_, and the create-client call
fails harmlessly without it. That failure is deliberate: the call is real, and the indexer sees it.

## The two panels

### Demo panel (bottom right)

Sends named actions through the action runtime by hand and prints the structured result.

| Button                    | What it proves                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **Highlight New Client**  | A semantic id resolves to a live node; our own spotlight engine draws on it         |
| **Navigate to Clients**   | The host's router implementation, registered as an action                           |
| **Scroll to Settings**    | `scrollIntoView` then highlight — and from another page, a clean `target_not_found` |
| **Highlight a ghost id**  | `target_not_found`, with `details.elementId` — not a message to parse               |
| **Try a CSS selector**    | `invalid_input`, refused by schema before any DOM code runs                         |
| **Try an unknown action** | `action_not_found`, listing what _is_ registered                                    |

The last three are the point. The safety boundary is not a convention here — it is schema validation
a selector cannot pass, and an error vocabulary a caller can branch on.

### Inspector (bottom left)

Reads the committed application graph and shows, for any indexed element:

```
clients.create

SOURCE        src/pages/Clients.tsx:58
ROUTE         /clients        in Clients
LIVE RUNTIME  mounted · visible

BEHAVIOUR
  ↓ invokes       openCreateClient   1.0
  ↓ opens         NewClientDialog    0.9
  ↓ submits_to    submitClient       1.0
  ↓ uses_service  clientService      0.95
```

Click any hop to expand its **evidence** — the file, the line, the inference rule that produced it,
and the source excerpt that justified it.

Two sources of truth sit side by side on purpose:

- **SOURCE / ROUTE / BEHAVIOUR** come from the application graph — what the indexer proved offline.
- **LIVE RUNTIME** comes from the React element registry — what is mounted in this browser tab.

Neither substitutes for the other, and disagreement between them is itself information.

The chain also reports where it **stopped** and which diagnostics were recorded in that file. A short
chain is a finding, not a blank.

## Index it

```bash
pnpm index:example
```

Indexes the frontend and backend together as one application and writes
`.statewave-guide/application.json`. That file is **committed** — the output is byte-identical
between runs over unchanged source, so a diff shows a real change in the product rather than churn.
It is also what makes the Inspector work straight after a clone.

## What resolves, and what deliberately does not

`src/services/clientService.ts` contains one of each, on purpose:

```ts
// resolvable — the base is a module constant at the call site
await fetch(`${API_BASE_URL}/clients`, { method: 'POST' });
//  → api:POST:/api/clients, joined to the backend route

// NOT resolvable — the base is applied one call deeper, so the path is a parameter
return api.delete<void>(`/clients/${clientId}`);
//  → the wrapper hides the base; UNRESOLVED_API_PATH rather than a guess
```

Both shapes are completely ordinary. Keeping one of each is the point — and the wrapper case is the
_dominant_ pattern in real codebases, which is why the graph health output reports
`frontendOnlyEndpoints` and `backendOnlyEndpoints` rather than quietly merging them.

## Two halves of the same identifier

The hero elements carry **both** a literal `data-guide` attribute and a React registration:

|                                          | What it gives you                                               |
| ---------------------------------------- | --------------------------------------------------------------- |
| `data-guide="clients.create"` in the JSX | the **indexer** can see it — file, line, Product Model          |
| `<GuideElement>` / `useGuideElement()`   | the **runtime** knows it — label, description, mounted, visible |

Either alone works. Using both is what makes the two views agree.

`Clients.tsx` shows the component form, `Settings.tsx` the hook form.

## Notes on the source

- `Sidebar.tsx` writes its links out longhand rather than mapping them. A computed
  `data-guide={link.id}` still registers at runtime, but the indexer cannot prove it — and the two
  views must agree.
- `data-guide-type` states the semantic kind where the tag name does not imply it (a React Router
  `<Link>` is a `link`, not `other`).
- `App.tsx` shows the routing boundary: the built-in `navigate` action exists only because the
  provider is handed a `navigate` implementation.
- `RouteSync` pushes the router's location into the guide context. The guide never reads the router.
- `openCreateClient` is a named function, not an inline arrow, and the dialog is gated by the same
  `createOpen` flag it sets. All three facts are required for the `state-flag-gates-element` rule to
  record `opens` — remove any one and the edge disappears.

Apache-2.0
