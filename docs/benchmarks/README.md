# Benchmark snapshots

Machine-readable output of `pnpm test:indexer-quality --json <path>`. Committed so a before/after
comparison is generated rather than transcribed — a hand-written table is a place for a number to
drift.

| File | What it captures |
| --- | --- |
| `pre-fix.json` | The indexer as the implementation agents left it, scored against the original manifest. The baseline. |
| `post-fix-old-manifest.json` | After the adversarial fix pass, still scored against the *original* manifest. Kept because it isolates what the code fixes did from what the manifest reconciliation did — without it the two are indistinguishable. |
| `post-fix.json` | The reconciled state: fixed indexer, reconciled manifest. |

Regenerate the comparison with:

```bash
pnpm test:indexer-quality:diff
```

Every difference between these snapshots is classified in
[`../closed-loop-2-reconciliation.md`](../closed-loop-2-reconciliation.md).
