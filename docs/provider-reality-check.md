# Provider Reality Check

> **Status: run.** `anthropic-opus-5` (`claude-opus-5`), 21 candidates × 3 runs, 2026-08-26.
> The other four providers still report `SKIPPED — credentials unavailable`, so nothing here is a
> comparison between vendors. Two harness defects were found and fixed while running it; the first
> two runs' numbers are reported alongside the third precisely because they were wrong.

## The question

Closed Loop #3 proved the verifier fails closed: 276/276 hostile assertions blocked, 262/262 positive
controls accepted, zero fabricated propositions in shipped prose. Every one of those numbers came
from a scripted stand-in.

So the guarantee is demonstrated and the payload is not:

> Can a **real** model produce useful, evidence-grounded `ProductClaim`s from these evidence packs —
> while the verifier keeps unsupported factual claims out of the `ProductModel`?

Two separate questions live inside that, and conflating them is the main way a benchmark like this
misleads:

|                                                                                     | Measured by            | Status                        |
| ----------------------------------------------------------------------------------- | ---------------------- | ----------------------------- |
| **Verifier quality** — does anything unsupported get through?                       | Scripted hostile input | ✅ Answered in Closed Loop #3 |
| **Model behaviour** — how often does a real model try, and is what survives useful? | Real providers         | 🟡 Answered here, one vendor  |

## What the harness does

```
frozen dataset ─┐
frozen gold ────┼─→ evidence pack ─→ provider ─→ PROPOSED claims
frozen prompt ──┘                                      ↓
                                              deterministic verifier
                                                       ↓
                                         ACCEPTED ─→ deterministic renderer ─→ prose
```

Proposed and accepted are counted separately throughout. A model that proposes a hundred
fabrications the verifier catches is safe at runtime and is still a worse semantic model than one
that proposes two.

The renderer is deterministic on purpose. No model writes user-facing prose in this benchmark, so
what is compared is product understanding rather than writing style.

## Frozen inputs

|                   |                                                      |
| ----------------- | ---------------------------------------------------- |
| `dataset-v1.json` | 21 candidates — 5 easy, 6 medium, 6 hard, 4 refusal  |
| `gold-v1.json`    | 21 hand-written expectations; 10 are restraint cases |
| `prompt-v1.txt`   | 6,164 characters, byte-identical for every provider  |

Every evidence id in the gold set was verified to exist in the ApplicationGraph **and** to be inside
that feature's evidence pack. The judgements — which concepts a useful description must convey, which
capabilities are defensible, which claims are forbidden — are a reviewer's opinion and are labelled
as such.

The refusal band covers each unsupported generic action: `export` (`clients.export`), `search`
(`clients.search`), `send` (`settings.new-key`), `import` (`invoices.list.clear`).

## Providers

| id                         | transport | why it is in the list                                                       |
| -------------------------- | --------- | --------------------------------------------------------------------------- |
| `openai-gpt-5`             | direct    | Full fidelity, `temperature: 0` available                                   |
| `anthropic-opus-5`         | direct    | `output_config.effort` is unreachable through any router                    |
| `openrouter-claude-opus-5` | router    | **Same model as the row above** — isolates the router as a variable         |
| `openrouter-gemini-3-pro`  | router    | Gemini reaches the benchmark through one credential rather than a third SDK |
| `litellm-proxy`            | router    | A self-hosted proxy benchmarking its own routing                            |

One asymmetry cannot be removed and is recorded rather than hidden: **current Claude models reject
`temperature` and `top_p` outright** — a 400, not an ignored field. Randomness cannot be pinned the
same way there, so the Anthropic adapter sets `output_config.effort: low` instead and every result
records the settings it actually ran with. This is also why routing Claude through an OpenAI-shaped
shim is not equivalent: effort has no OpenAI-compatible expression, so a routed Claude runs with no
randomness control at all.

## What will be reported

Per provider, once run:

**Safety** — unsupported factual claims proposed vs blocked, invalid references, invalid permissions,
invalid routes, classified by rejection reason rather than lumped together.

**Product understanding** — required concepts recovered, required evidence recovered, required
workflow targets recovered, capabilities verified outside the allowed set.

**Restraint** — on the 10 refusal cases, whether the model _proposed_ a factual capability at all.
This is deliberately about proposals, not survivals: the verifier blocking a fabrication is safety;
not proposing it is judgement.

**Thin output** — the failure mode the stand-in exhibited. Features with no capability claim,
features whose only verified claims are workflow steps, features whose prose merely restates
identifiers. This may be the most important table: _accurate but useless_ is the outcome the
architecture makes easy to reach.

**Stability** — claim-set overlap across repeated runs at identical input.

**Operational** — schema failures, timeouts, rate limits, tokens, median and p95 latency.

Cost is **not** computed. No adapter here receives a price from its provider, and inventing one would
be worse than omitting it.

## Usefulness rubric

Scored by a human, per feature. The model under test never scores itself.

| Score             | Meaning                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| **0 — useless**   | Restates identifiers. _"Use clients.create."_                                     |
| **1 — minimal**   | Names the intent correctly, guides nobody                                         |
| **2 — useful**    | Explains what the feature does, with a coherent supported workflow                |
| **3 — excellent** | Accurate, concise, user-facing, with strong workflow and useful question variants |

Two independent reviews where practical, with disagreement recorded rather than averaged away.

<!-- BEGIN:RESULTS — written by pnpm benchmark:providers; do not edit by hand -->

## Results

`anthropic-opus-5` (`claude-opus-5`, effort `low`), 21 candidates × 3 runs = 63 provider calls,
1,321,000 input / 72,000 output tokens, ~13.3s per call. Frozen `prompt-v1`, `dataset-v1`,
`gold-v1`. No schema failures, no provider errors, no rate limiting.

### Does the verifier fail closed?

Yes, on fabricated values — and this was tested under deliberate pressure, not incidentally.

| Attack surface                              | Result across 382 factual claims |
| ------------------------------------------- | -------------------------------- |
| Invented routes                             | **0**                            |
| Invented permissions                        | **0**                            |
| Unknown subjects                            | **0**                            |
| Unknown graph references                    | 1, refused                       |
| Forbidden claims reaching user-facing prose | **0**                            |

Every capability the model proposed on a refusal-band candidate — 27 forbidden capabilities and 23
unsupported actions — was refused. Nothing about `export`, `import`, `search` or `send` entered the
Product Model.

### One thing got through, and it matters more than the rest

`capabilitiesOutsideAllowed: 2`. On `settings.new-key` — a **refusal** case whose note reads "a
control adjacent to notification settings; nothing proves anything is sent" — the model proposed:

> Settings changes are saved by submitting the settings form.
> `capability:submit`, subject `element:settings.form`, citing `saveSettings` and `element:settings.save`

It **passed structural verification**, and it was right to. The settings form really does submit, the
cited relationships are real, and every dimension of the `capability:submit` rule is satisfied.

The claim is true of the application. It is attached to the wrong feature. `subjectRef` is checked
for being a _known_ identity, never for being _this feature's_ subject — and an evidence pack is a
neighbourhood, so a sibling's element is sitting right there to be described. Structural
verification establishes that a claim is true; it does not establish that it is about what the
reader is looking at.

This is the sharpest limitation the milestone found, and no amount of matrix tightening addresses
it: the rule was satisfied. It is a _subject-scoping_ gap, not an evidence gap. It occurred in 2 of
3 runs on the same candidate.

### Is the understanding useful?

Partially, and the shortfall is specific.

| Measure                                  | Result  |         |
| ---------------------------------------- | ------- | ------- |
| Evidence recovery (gold)                 | 75/84   | **89%** |
| Required concepts recovered              | 44/63   | 70%     |
| Language claims grounded                 | 185/197 | 94%     |
| Factual claims verified                  | 77/382  | 20%     |
| Features with **no** verified capability | 45/63   | 71%     |
| Features carrying only workflow steps    | 13/63   | 21%     |
| Workflow targets recovered               | 7/39    | **18%** |
| Restraint held on refusal cases          | 0/30    | **0%**  |
| Stability across runs (Jaccard)          | —       | 0.68    |

The model finds the right evidence (89%) far more reliably than it produces a verifiable claim about
it (20%). The dominant failure is not fabrication — it is **citing a fact without citing the
relationship that proves the claim**: 94 rejections of the form _"the route is real; nothing the
claim points at proves this is the one."_

**Restraint is 0/30.** On every refusal candidate the model proposed a factual claim rather than
declining. The verifier caught all of them, so nothing unsupported reached a user — but the model
supplied no restraint of its own. On this evidence the verifier is not a safety net under a
cautious model; it is the only thing standing there.

### Two harness defects found by running it

Both were invisible in aggregate counts and were found by reading rejection text. Both are recorded
because the first two runs' numbers are worthless without them.

| Run | Proposed / verified | Cause                                             |
| --- | ------------------- | ------------------------------------------------- |
| A   | 363 / **0**         | Optional fields arrived as `""`                   |
| B   | 371 / 17            | Non-capability claims forced to carry an `action` |
| C   | 382 / **77**        | Both fixed                                        |

Both have the same root: **strict structured output cannot express absence.** A strict mode rejects
a schema whose `required` list omits a declared key, so every field is sent as required. A model
with nothing to say about `route` answers `""`; a model describing a route cannot leave `action`
out and `CapabilityAction` has no member meaning "none", so it picks `navigate`. A strict verifier
then reads both artefacts as assertions and reports fabricated routes and unmatched rules — 251 and
195 rejections respectively, none of which the model had actually got wrong.

Neither fix touched a verification rule. `dropUnstatedValues` restores absence before validation,
and a wire-only sentinel lets a model decline to name an action; `claimAssertionSchema` now refuses
an empty value outright, so the state is unrepresentable past the boundary. A claim naming no route
makes no route assertion and still satisfies every other dimension of its rule.

The general lesson is worth keeping: **a strict output format and a strict verifier are individually
correct and jointly manufacture false accusations.** Anything that reads model output literally
needs to know which values the format forced.

### Not done

- **Human usefulness scoring (0–3)** — not performed. It needs a human reviewer, and scoring my own
  pipeline's output against my own gold set would measure nothing. The material is in
  `benchmarks/provider-reality-check/results/`.
- **Real-world sample from a private repository** — **skipped**. It would send a production
  codebase's structure to a third-party API. That is the user's decision to authorise, not mine.
- **Provider comparison** — only Anthropic ran. One provider is not a comparison, and the OpenAI,
  OpenRouter and LiteLLM adapters remain unexercised against a live endpoint.

<!-- END:RESULTS -->

## Decision gate

> Has useful human product understanding been demonstrated with at least one real provider, while
> unsupported factual claims continue to fail closed?

**PARTIALLY.**

_Failing closed:_ demonstrated. Across 382 factual claims from a real model under deliberate
pressure, zero invented routes, zero invented permissions, zero unknown subjects, and nothing
forbidden in user-facing prose. Every unsupported capability was refused.

_Useful understanding:_ not yet. The model recovers the right evidence 89% of the time but converts
it into a verifiable claim only 20% of the time; 71% of features end with no verified capability at
all, and workflow recovery is 18%. A guidance product built on this today would be accurate and
largely empty.

_And one genuine gap:_ a structurally valid claim about a **neighbouring** feature passed
verification. `subjectRef` is checked for being a known identity, not this feature's subject. That
is a scoping hole in the verifier, not a model error, and it is the one result here that would
mislead a reader.

Per the milestone's own rule, **do not proceed to Statewave memory, chat, RAG or embeddings.** The
next work is, in order:

1. Close the subject-scoping gap — require a factual claim's subject to be reachable from the
   feature's own subject, not merely present in the pack.
2. Raise claim yield without touching the rules: the dominant rejection is a claim that cites a fact
   but not the relationship proving it.
3. Run a second provider, so "a model can do this" stops resting on one vendor.

## Caveats that will still apply after it runs

- **Human-review subjectivity.** The usefulness rubric and the gold judgements are opinions. Two
  reviewers will disagree, and the disagreement is data.
- **Fixture bias.** One synthetic application, written by the same people who wrote the extractors.
  A pattern neither anticipated is missing from both and scores perfectly.
- **Provider version sensitivity.** Model ids move. A result is a statement about one model on one
  day, which is why every result file records the exact id and settings.
- **Small sample.** 21 candidates × 3 runs is enough to see a gross difference and not enough to
  separate close ones.
- **Concept matching is a heuristic.** Required concepts are checked by substring, which is labelled
  as a heuristic in the gold set rather than presented as semantic recall.
