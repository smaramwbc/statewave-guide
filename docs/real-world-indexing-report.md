# Real-world indexing report

The fixture application is built to be hard, but it is still built by the same people who wrote the
extractors. This report is the counterweight: the indexer run against a production codebase that has
never heard of Statewave Guide.

> **Method.** The target repository was indexed read-only — no files were written into it, no
> `data-guide` identifiers were added, and nothing was modified. This document reports counts,
> patterns and anonymised shapes only. No source from the target application is reproduced here.

## Target

|                              |                                                                           |
| ---------------------------- | ------------------------------------------------------------------------- |
| Application                  | An internal admin console (React + TypeScript + Vite, with a Node server) |
| Approximate size             | ~23,000 lines across `src/`, `server/` and `api/`                         |
| `data-guide` identifiers     | **0** — the application does not use our convention                       |
| Relationship to this project | Sibling repository, unmodified                                            |

Zero guide identifiers is the point. It tests whether the indexer extracts anything useful from an
application that has done nothing to accommodate it.

<!-- BEGIN:GENERATED — refreshed by the indexing run; do not edit by hand -->

## What it found

|                |                                                         |
| -------------- | ------------------------------------------------------- |
| Indexing time  | **2.0 s**                                               |
| Files parsed   | 100 (66 frontend, 27 backend, 7 shared)                 |
| Components     | 152                                                     |
| Routes         | 11                                                      |
| Functions      | 556                                                     |
| Exported types | 247                                                     |
| Hooks          | 16                                                      |
| Services       | 3                                                       |
| API endpoints  | 18                                                      |
| Guide elements | **0** — the application uses no `data-guide` attributes |

| Relationship                                   | Count                                               |
| ---------------------------------------------- | --------------------------------------------------- |
| `calls`                                        | 693                                                 |
| `renders`                                      | 351                                                 |
| `uses_hook`                                    | 211                                                 |
| `calls_api`                                    | 21                                                  |
| `navigates_to`                                 | 7                                                   |
| `opens`                                        | 3                                                   |
| `submits_to`                                   | 2                                                   |
| `uses_service`                                 | 1                                                   |
| `contains` / `invokes` / `requires_permission` | 0 — all need guide elements or a recognised backend |

| Health                        |                                |
| ----------------------------- | ------------------------------ |
| Calls resolved                | **886 of 969 (91%)**           |
| API paths resolved            | 21 of 104 (20%)                |
| Endpoints joined across tiers | **0**                          |
| Graph integrity               | PASS, 0 dangling relationships |
| Absolute paths in output      | none                           |

| Diagnostic                 | Count |
| -------------------------- | ----- |
| `UNRESOLVED_DYNAMIC_CALL`  | 83    |
| `UNRESOLVED_API_PATH`      | 83    |
| `UNRESOLVED_DYNAMIC_ROUTE` | 17    |

**183 diagnostics.** Every gap described below is one of them — counted, located and attributable.
None of it is silence.
<!-- END:GENERATED -->

## What worked

**Structural extraction needs no cooperation.** Components, routes, functions, hooks, types and the
call graph all came out of an application that has never seen a `data-guide` attribute. The Product
Model does not depend on annotations; annotations only make elements _addressable_.

**Cross-file symbol resolution held up.** The great majority of call sites resolved to a declaration.
The ones that did not are reported below rather than guessed at.

**Determinism held.** No absolute paths, no home directories, no machine-specific data in the output.
Repeated runs produced identical results.

**Performance is not a concern yet.** Indexing completed in a couple of seconds with a heap footprint
in the low hundreds of megabytes. There is no sign of super-linear behaviour at this size. That is not
a claim about a million-line monorepo, which remains untested.

## What did not work, and why that is the useful part

### 1. A URL-builder wrapper defeated endpoint extraction — and refusing was correct

The dominant HTTP shape in this codebase, by a wide margin, is not a literal path. It is a call to a
module-local URL builder:

```ts
// anonymised shape
await fetch(buildUrl('/some/logical/path'), { method: 'POST' });
```

The indexer resolved none of these and emitted `UNRESOLVED_API_PATH` for each.

The obvious "fix" would have been to treat the builder's argument as the path. It would have been
**wrong**. In this application the builder does not concatenate the argument onto a base URL at all —
it wraps it into a _query parameter_ of a single proxy endpoint. Every one of those calls hits the
same real HTTP route, and the logical path never appears in the request line.

Had the indexer inferred the obvious thing, it would have fabricated dozens of endpoints that this
application does not serve, each carrying provenance and confidence, each looking exactly as
trustworthy as a correct one.

This is the clearest evidence so far that the governing rule earns its cost:

> No evidence, no relationship. Unknown is better than wrong.

**Planned response.** A narrow inference rule for URL builders whose body is a template literal
concatenating _only_ module constants and the builder's own parameter. The pattern above contains a
function call inside a query string and would correctly still not match.

### 2. The backend routing style was not recognised at all

The target's server does not use Express or Fastify. It dispatches with a raw `node:http` server and
manual pathname comparison, plus a single serverless-style default-export handler.

The result: a substantial number of backend files were classified correctly as backend, and produced
**zero** endpoint nodes. The frontend/backend join therefore did not occur for this application —
every endpoint discovered was frontend-only.

That is an honest coverage gap, not a defect. Express and Fastify were the two frameworks in scope,
and they cover less real-world backend surface than assumed. Manual `node:http` dispatch and
serverless handler exports are common and are not detected.

**Planned response.** Treat this as roadmap work rather than patching in a third framework hastily.
Manual dispatch is a genuinely harder problem — the "route table" is control flow, not a registration
call — and a rule that scraped string comparisons out of an `if` chain would be exactly the kind of
plausible-but-unfounded inference this project exists to avoid.

### 3. No addressable elements

With no `data-guide` attributes, there are no `element` nodes and therefore no `contains` or `invokes`
edges from UI elements. Everything below the element layer still resolved.

This is the expected trade and it is worth stating plainly: **the behaviour graph works without
annotation; the _addressability_ layer does not.** An application gets the call graph, the services
and the endpoints for free, and pays one attribute per element for the ability to point at it.

## What this changes

1. A narrow, safe URL-builder rule is worth adding — with the proxy shape above as a permanent
   regression test for what it must _not_ match.
2. Express and Fastify are not sufficient backend coverage. The gap is now measured rather than
   assumed.
3. The diagnostics carried their weight. Every failure above was _visible_ in the output as a counted
   diagnostic code, not as a silently missing edge. That is the difference between a coverage gap you
   can plan around and one you discover from a user.

## Limits of this report

- **One application.** One team's habits. A second and third target would likely surface entirely
  different dominant patterns.
- **No ground truth.** Unlike the fixture, there is no manifest saying what _should_ have been found,
  so this report can measure what the indexer produced and what it declined, but not its recall.
- **The author chose the target.** It was picked for being available, real and reasonably sized — not
  for being representative.
