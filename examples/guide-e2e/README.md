# The demo host

A deliberately small CRM with Statewave Guide mounted — the reference implementation for
[host integration](../../docs/host-integration.md), and the surface every browser gate runs against.

```bash
# from the repository root
pnpm install && pnpm build
pnpm demo
```

Then ask it _how do I create a client?_ — press **Show me**, or **Step through**. Ask it something
it cannot verify and watch it refuse.

Query parameters:

|                               |                                                                       |
| ----------------------------- | --------------------------------------------------------------------- |
| `?memory=local`               | remember in this browser (default)                                    |
| `?memory=off`                 | no memory                                                             |
| `?memory=remote&subject=<id>` | durable memory via the demo backend (below)                           |
| `?dev=1`                      | developer inspector: memory diagnostics and the adaptation accounting |

Durable memory needs a Statewave server and the demo backend
([`memory-backend.mjs`](memory-backend.mjs), started automatically by the e2e runner when
`STATEWAVE_GUIDE_URL` is set). The backend trusts the page's subject — its fixture has no accounts —
and reports `subjectTrust: CLIENT_ASSERTED_DEMO_ONLY` so nobody mistakes that for a pattern. A real
host derives the subject from its authenticated session; see the integration guide.
