# 3. Report failures as structured codes, never as message strings

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

Day 0 shipped two independent failure vocabularies.

The action registry returned `{ ok: false, error: { code, message } }` with codes like
`unknown_action` and `not_permitted`. The guidance engine returned something else entirely:

```ts
{ ok: false, id, reason: 'not-registered' | 'not-mounted', message: string }
```

Those two vocabularies met at the `highlight` action handler, and they met badly. A handler can only
signal failure by throwing, and the registry classified every throw as `execution_failed`. So asking
the guide to highlight an element that does not exist produced:

```json
{ "ok": false, "error": { "code": "execution_failed", "message": "clients.create was not found" } }
```

The only way to learn what actually happened was to parse the message. Day 0 shipped this knowingly,
with a comment calling it a rough edge and a test pinning the behaviour so it stayed visible.

It cannot survive contact with an agent. A model that receives `execution_failed` has no way to
distinguish "this element does not exist, your Product Model is stale" from "this element exists but
the user is on the wrong screen, navigate first" from "the handler crashed". Those call for three
completely different next actions.

## Decision

One error vocabulary for the whole system, defined in `@statewavedev/guide-shared`:

```ts
type GuideErrorCode =
  | 'target_not_found'
  | 'target_not_mounted'
  | 'target_not_visible'
  | 'timeout'
  | 'cancelled'
  | 'invalid_input'
  | 'action_not_found'
  | 'permission_denied'
  | 'confirmation_required'
  | 'execution_failed';

interface GuideError {
  code: GuideErrorCode;
  message: string; // for people; never parsed
  issues?: GuideErrorIssue[]; // when code is invalid_input
  details?: Record<string, unknown>; // e.g. { elementId: 'clients.create' }
  cause?: unknown;
}
```

Every result is a discriminated union on `success`. The guidance engine's private `reason` vocabulary
is deleted; it now returns `GuideError`.

To carry a code across the handler boundary, a handler throws `ActionFailure`:

```ts
const result = await highlight.highlight(elementId);
if (!result.success) throw ActionFailure.from(result.error);
```

The registry recognises it and passes the code through untouched. Everything else still becomes
`execution_failed`, which is now an honest classification rather than a catch-all.

## The distinctions worth having

`target_not_found` versus `target_not_mounted` is the one that motivated this. They mean:

- **`target_not_found`** — nothing is registered under that id. The Product Model disagrees with the
  running application. Re-index, or the id is wrong.
- **`target_not_mounted`** — the element is registered but has no attached node. It is on another
  screen, or behind a closed dialog. Navigate, then retry.
- **`target_not_visible`** — mounted but outside the viewport. Scroll, then retry.

Collapsing them would throw away exactly the information that makes recovery possible.

`details` exists for the same reason: `{ elementId: 'clients.create' }` lets a caller act on the
failure without re-deriving it from prose.

## Consequences

**We accept:**

- A breaking rename of `ok` to `success` across every package. Done now, before publication, rather
  than after.
- `ActionFailure` is a second way for a handler to fail. Handlers that throw ordinary errors still
  work and still produce `execution_failed`; the class is opt-in for handlers that know better.
- Ten codes is more than most consumers will branch on. The alternative — fewer codes and a message
  to parse — is the thing we are removing.

**We gain:**

- No consumer, human or model, has to parse a message to know what happened.
- The `target_*` family gives an agent an actionable next step rather than a dead end.
- One vocabulary across the registry, the engine and the future agent layer, so a failure means the
  same thing wherever it surfaces.
