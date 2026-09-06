# Trust, verifiable in an hour

This project's claims are designed to be checked, not believed. This page is the map: each claim,
where it is enforced, and the command that re-proves it on your machine.

## Run the checks

```bash
pnpm install && pnpm build
pnpm exec playwright install chromium   # once; the browser gates need it
pnpm gates                              # all 139 checks, ~6–7 minutes, ports 4319/4320 free
```

The `test:` scripts in `package.json` **are** the gate manifest. `scripts/gates.mjs` enumerates
them; CI invokes that enumeration and nothing else — so a gate cannot be added locally and silently
not run in CI (`test:ci-gate-manifest` fails if the workflow tries to keep its own list). Gates may
read the repository and may not write to it — `test:tree-clean` fails on any change the suite left
behind (it runs in alphabetical order, so it polices the gates before it; CI starts from a clean
checkout either way, and `test:capture-immutability` separately forbids any `test:` script from
writing into the frozen evidence).

[validation-gates.md](validation-gates.md) is the unedited history, failures included.

## The claims, and where each is held

**No fact without evidence.** A claim reaches the Product Model only through a verifier that fails
closed; a model chooses meaning from deterministically planned opportunities and can add no facts.
Held by the `test:query-*` and `test:runtime-*` gates, and measured under a real model — 382 claims,
zero fabrications ([provider-reality-check.md](provider-reality-check.md), and
[round 2](provider-reality-check-round-2.md), which found and closed a wrong-feature defect).

**The guide refuses rather than improvises.** Ask for something unverified and the answer is
_"I do not have anything verified about that."_ — including when memory, a seeded database, or the
visible screen suggest otherwise. Held by `test:memory-rv04-negative`,
`test:memory-current-permission-authority`, and the hostile scenarios in the e2e specs. The
catalogue of refused inferences is [refusals.md](refusals.md).

**What the screen lends is borrowed, never kept.** Visible text can be quoted while painted
([ADR 0028](adr/0028-visible-now-is-not-named-forever.md)); runtime instances are contextual
identity only ([ADR 0025](adr/0025-runtime-instances-are-contextual-identity-not-product-truth.md));
page content is content, not instruction (`test:visual-prompt-injection`).

## What leaves the browser, and what is stored

- **Credentials: none in the page, ever.** The browser store talks to _your_ backend; the backend
  holds the Statewave client. A gate fails if the React package imports the SDK
  ([ADR 0032](adr/0032-remote-memory-persists-experience-not-authority.md)).
- **Memory content: a closed vocabulary.** Six event kinds — counters, completions, two enum
  preferences. No questions, no answers, no DOM text, no free text of any kind. Every record is
  validated on write _and_ on read; secret-shaped and instance-shaped values are refused
  (`test:memory-secret-redaction`, `test:statewave-remote-data-minimisation`, and the live-database
  sweep in the #20 capture: zero instances, secrets, emails, questions, or UI text across every
  persisted record).
- **Volume: bounded by facts, not usage.** Only records a later answer can read are persisted
  (`test:memory-durability-*`); a repeated completion is one durable record and a changed preference
  is one active value (`test:guide-remote-bounded-state`, `test:statewave-*`). Measured on a real
  server: 504 writes → 5 durable episodes → 2 events read.
- **Deletion is real.** Reset deletes the guide's Statewave subject — one scope, nothing else, no
  resurrection (`test:statewave-reset-scope`, BS10).
- **Memory has no authority.** A remembered delete-guide cannot surface Delete for someone without
  the permission today; remembered activity cannot make an unsupported question answerable. Held by
  gates and re-proven against a live server in every #20.x loop.

## The evidence record

`benchmarks/` holds the frozen artifacts each closed loop was scored against — screenshots,
scenario evidence, review packages. `capture:*` scripts regenerate them (and are deliberately
unreachable from CI and from `pnpm gates`); `test:*-package` checks verify the frozen artifacts
still match the code where that is derivable. Review packages are scored `reviewerType:
non_human_independent` with human validation explicitly deferred — they say so on their face rather
than implying otherwise.

## What this page does not claim

No security audit has been performed. No human has validated the review artifacts yet. Windows is
untested. The packages are unpublished. The list of everything else honestly missing is in the
[README](../README.md#what-is-not-built-yet).
