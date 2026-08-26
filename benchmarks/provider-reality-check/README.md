# Provider Reality Check

Measures whether a **real** language model can produce useful, evidence-grounded
`ProductClaim`s from the bounded evidence packs Statewave Guide already builds — while the
deterministic verifier keeps unsupported factual claims out of the `ProductModel`.

Closed Loop #3 proved the verifier fails closed against scripted hostile input. It proved nothing
about model behaviour, because no model was called. This is the experiment that addresses that.

## What is frozen

| File              | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `dataset-v1.json` | The candidate set, with a difficulty band per entry |
| `gold-v1.json`    | Human structural expectations per candidate         |
| `prompt-v1.txt`   | The exact instruction sent to every provider        |

**Do not edit a `-v1` file after results exist.** Editing the dataset or the prompt after seeing
output is benchmark overfitting, and it silently invalidates every comparison already recorded.
Create `-v2` and keep both. `results/` is keyed by version for the same reason.

## Running

```bash
pnpm benchmark:providers                        # every configured provider
pnpm benchmark:providers -- --provider openai-gpt-5
pnpm benchmark:providers -- --runs 5
```

A provider with no credential reports `SKIPPED — credentials unavailable` and is excluded from every
table. It is never counted as a zero.

## Fairness

Every provider receives the same candidate, the same evidence pack, the same schema, the same
instruction and the same refusal information. Only _transport_ formatting differs — how a system
turn is expressed, how JSON is requested.

One asymmetry cannot be removed and is recorded rather than hidden: current Anthropic models
**reject** `temperature` and `top_p` outright, so randomness cannot be pinned the same way there.
Each result records the settings it actually ran with.

## What is committed

Fixture-derived results may be committed — the fixture is synthetic.

**Results from a private repository must not be.** Raw responses can echo repository text. For
real-world runs, commit aggregate metrics only, and keep raw responses out of Git.

Credentials never appear in any artefact: adapters read them at the last moment and never store them
on a serialisable object, which `providers.test.ts` pins.
