# Round 5 — Semantic language audit

> Produced **before** any change to output, which is the only order in which it is worth producing.
> The question was which exact fragments caused the correctness ceiling, and the answer had to be
> allowed to be "fewer than you think".

Round 5 passed the development usefulness gate and left one number where it had been for four rounds:
**17 of 18 assessable items scored correctness 1.** Not one incorrect fact. Not one score of 0. And
nothing at 2. The reviewer's note was the same each time in different words — _"more specific than
the supplied facts"_.

## Method

Every user-facing sentence emitted for the twenty-one features — purpose, summary, question, title —
was decomposed into its individual propositions, and each proposition was judged against the
ApplicationGraph, the accepted `structurally_verified` claims, and the fixture source.

Each was then attacked. A second pass tried to **refute** every verdict that was not `SUPPORTED`:
to find support an auditor had missed, or to show that a fragment called style was in fact
falsifiable. 126 propositions were contested, **104 were adversarially verified, and 22 were not** —
the verification was capped at fourteen per feature group and the cap was reached. Those 22 carry a
first-pass verdict only.

The refutation pass overturned **71 of the 104 verdicts it examined**, in both directions: 18
`UNSUPPORTED` became `SUPPORTED`, and 6 `PRESENTATIONAL` became `UNSUPPORTED`. An audit that had
stopped after one pass would have been wrong about two thirds of what it looked at hardest.

### Four reasons a fragment can lack support

Conflating these would send the fix to the wrong layer, so they are counted separately.

|                            |                                                                          |
| -------------------------- | ------------------------------------------------------------------------ |
| **`PRODUCT_OVERREACH`**    | The model invented it. Nowhere in the source, the graph or any claim.    |
| **`INDEXER_OMISSION`**     | Demonstrably true in the source; the graph records no fact of that kind. |
| **`REVIEW_FACT_OMISSION`** | The graph proves it and the fact list never showed the reviewer.         |
| **`PRESENTATIONAL`**       | Not a factual claim. Could not be false of any application.              |

The distinction is not academic. `changePlan('enterprise')` sits at `ClientDetailPage.tsx:114` — the
plan tier is a literal in the source, and the graph records no call arguments at all. `account
manager` appears in **no file of the fixture**. One is an indexer roadmap item; the other is a
fabrication, and a single "unsupported" count would have hidden the first behind the second.

## Result — 194 propositions, 97 supported

| verdict          | n   | share |
| ---------------- | --- | ----- |
| `SUPPORTED`      | 97  | 50.0% |
| `UNSUPPORTED`    | 83  | 42.8% |
| `AMBIGUOUS`      | 11  | 5.7%  |
| `PRESENTATIONAL` | 3   | 1.5%  |

**Support rate 51.5%.** Just over half of what the guide told users was actually established.

| reason                 | n   |
| ---------------------- | --- |
| `INDEXER_OMISSION`     | 47  |
| `PRODUCT_OVERREACH`    | 38  |
| `REVIEW_FACT_OMISSION` | 9   |

### The finding that decided the design

| surface      | n   | supported |         |                                                 |
| ------------ | --- | --------- | ------- | ----------------------------------------------- |
| **summary**  | 17  | 14        | **82%** | compiled from propositions since Closed Loop #4 |
| **title**    | 10  | 7         | 70%     | a control label, or a derived noun              |
| **question** | 56  | 34        | 61%     | passed through from the model                   |
| **purpose**  | 111 | 42        | **38%** | passed through from the model                   |

**The surface this project already compiled was twice as well-supported as the surfaces it quoted.**
Not because the compiler is clever — because a compiled sentence can only contain what was put into
it, and a quoted one contains whatever the model wrote. That is the whole argument for Closed Loop
#7, and it was measured rather than assumed.

## The second finding: language claims never respected scope

Independent of the audit, and deterministic:

> **25 of 103 language-claim evidence refs — 24% — point at nodes the feature does not own.**

`settings.form` cites `element:settings.name` and `element:settings.notifications`.
`settings.danger-zone` cites `element:settings.rotate-key`, which is a different feature with its own
guide. `clients.table` cites `element:clients.table.row` and `element:clients.table.delete`.
`settings.save` cites `permission:settings:update`.

ADR 0010 installed ownership as the gate on factual truth in Closed Loop #2, and it was never applied
to language. A feature has been free to describe its neighbours for five rounds.

## What the categories contain

**Roles — 6, five of them invented.** `an admin` (twice), `an account manager`. `clients:update`
does not make anybody an account manager, and grep finds neither word anywhere in the fixture.

**Locations — 6.** Every one was a guarantee about navigation _not_ happening: _without leaving the
client detail page_, _from anywhere in the app_. A static graph records what exists. It cannot prove
an absence.

**Domain state — 8.** `enterprise plan` (`INDEXER_OMISSION` — the literal is in the source), `account`
for a client, `my clients` implying ownership scoping.

**Motive — 4.** _when the old one may be compromised_, _you no longer need_, _correct a wrong name_.
A button labelled `Rotate API key` establishes a button.

**Generated state — 5.** _freshly generated_, _greyed out_, _and when_. A `<code>` element carries no
record of when its contents were made — and `settings.new-key` is
`{rotatedKey !== null ? <code …/> : null}`, so it does not exist at all until the reader has already
done the thing they are asking how to do.

**Status classification — 3.** _legacy route_, _the current client APIs_. The only thing carrying the
word `legacy` is a module path, and reading architecture history out of a file name is the weakest
form of the identifier inference ADR 0014 refuses.

## The required cases

**`settings.form`** — _"The settings form collects organisation name and notification preferences in
one place."_ The form exists and is owned ✓. `collects` is a containment claim and **the graph has no
element-to-element containment at all** — `settings.name` and `settings.notifications` are contained
by the page component, not by the form, so as far as the graph knows they sit beside it. Both field
meanings are `INDEXER_OMISSION`: `<span className="field__label">Organisation</span>` is at
`SettingsPage.tsx:74` and the indexer's label resolver reads only `data-guide-label`, `aria-label` and
a single text child. `in one place` is presentational. Nothing survives; the purpose is withheld.

**`settings.save`** — _"You can submit a setting using \"Save changes\"."_ Withdrawn, and by omission
rather than rewording. The only verified thing is `capability/submit`. Nothing establishes that
anything is **saved**: the handler is called `saveSettings`, which is an identifier, and the button
reads `Save changes`, which is English on a button. A summary here has to name the mechanism or invent
the outcome. The title already says `Save changes` and the step already says to choose it.

**`settings.new-key`** — everything withheld. See generated state above.

**`settings.rotate-key`** — purpose withheld. The label gives it the words _API_ and _key_, and the
feature owns no endpoint to second them, so no artifact survives the double-grounding rule. The
control, the step and the screen remain.

**`client-detail.change-plan`** — purpose withheld; the role, the plan tier and the qualifier all fail.
The permission condition and the control survive, and so does a compiled question.

**`client-detail.audit`** — the one that keeps its purpose, rebuilt: **_"Lets you view the audit trail
for a client."_** `view` from `capability:1`; `client` from the owned endpoint
`GET /api/clients/:clientId/audit`; `audit trail` from the owned label **and** the same endpoint path.
Two independent places in the application name the same thing.

**`clients.table`** — _"each row opening that client and offering a Delete action"_ cites two nodes the
feature does not own, inside a component it does not own.

**`api.get.partial-clients`** — _legacy_ and _the current client APIs_ both fail; the second is
`PRODUCT_OVERREACH` outright, since "current" is a comparison with endpoints this feature has no
relationship to.

**`invoices.create-form.submit`** — keeps a purpose. `create` from `capability:1`, `invoice` from the
owned `POST /api/invoices`. _for a client_ and _without leaving the invoices page_ are withdrawn.

## What this is not

The audit was performed with model assistance, structured and adversarially verified, and it is a
**report**. It is not the enforcement mechanism, and nothing in the shipped compiler consults it.
That separation is deliberate: the audit's job was to say what was wrong, and a mechanism that
depended on parsing English correctly would have inherited exactly the fragility being measured.
Enforcement is by construction — a sentence can only contain what a typed proposition put into it.

The 22 unverified propositions, and the general possibility that a first-pass verdict is wrong, are
the limits of this document. The numbers are good enough to choose a design by and not good enough to
quote to three significant figures.
