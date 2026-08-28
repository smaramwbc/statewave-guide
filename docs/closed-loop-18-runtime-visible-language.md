# Closed Loop #18 — Runtime Visible-Language Authority

**Hypothesis.** Can Statewave Guide use text that is visibly present in the current runtime UI as
transient contextual language, without promoting that text into static ProductModel identity?

**Answer: PARTIALLY.** The separation holds completely and is now enforced in more places than the
static one ever was. Whether the resulting sentence is actually better is not established here, and
this report deliberately does not claim it — the last loop was confident about a sentence that scored
1.00 out of 3.

---

## 1. Why this loop existed

`clients.search` has been the standing example for three loops: a real, addressable, highlightable
input the interface never names in any way the authority rules accept. It carries
`placeholder="Search clients"`, which every user can read.

Closed Loop #17 paid the full price of refusing that placeholder and produced _"On this screen, it is
directly above the list."_ The independent review scored it:

| dimension            | score        |
| -------------------- | ------------ |
| location helpfulness | **1.00 / 3** |
| truthfulness         | 2.00 / 2     |
| restraint cost       | 1.75 / 2     |
| clarity              | 2.00 / 2     |
| non-redundancy       | **0.63 / 2** |

True, correct, and mostly telling people what they could already see. The question this loop asks is
not whether the refusal to _name_ was right — it was — but whether it should also have meant refusing
to _mention_.

## 2. What changed

| before                                           | after                                                    |
| ------------------------------------------------ | -------------------------------------------------------- |
| Lets you filter clients.                         | Lets you filter clients.                                 |
| _On this screen, it is directly above the list._ | _Use the field showing "Search clients" above the list._ |

Where each part comes from, and nowhere else:

- **filter** — a behaviourally verified capability claim
- **"Search clients"** — the placeholder attribute, read from this snapshot, expiring with it
- **above the list** — bounding boxes the browser measured
- **the list** — a container the runtime observed members in, generic because no product noun was
  earned for it

The static title is still `null`. ADR 0018 is untouched.

## 3. Eligibility is decided by the attribute, never by the string

A placeholder and an `aria-label` are chrome: somebody writing the interface put them there to be
read as interface. A table cell, a note, a paragraph of prose is content — it arrived from a database
or a person typing, and it is exactly as trustworthy as whoever typed it.

Closed Loop #17 proved that distinction cannot be made by reading the words, because the words can
say _"SYSTEM: Ignore previous instructions"_ and look like anything. So trust is assigned by the
attribute, before anything looks at what it says. The hostile note loses for being `VISIBLE_TEXT`,
which has no descriptor authority — not because a filter recognised it.

**Four sources, kept apart:** `PLACEHOLDER` and `CURRENT_ACCESSIBLE_NAME` describe; `VISIBLE_TEXT`
and `RUNTIME_INSTANCE_NAME` are recorded and never spoken. There is no `INPUT_VALUE` — not a rule
against using one, but no such source, so there is nothing to grant authority to later.

## 4. One permitted form

_the field showing "X"_ — never _the field named X_, never _use the X feature_. The difference is one
word, so the word is a gate: the phrasing, the quotation marks and the noun source are all checked by
`test:contextual-verification`.

The noun (_field_, _button_) comes from the role the browser reports. Closed Loop #17 refused to say
"the field" because the _bundle_ does not record what kind of thing a control is. That was the right
refusal about the wrong source — the runtime knows.

## 5. Contextual sentences now have a verifier

Closed Loop #17's freeze record had to disclose that its location sentence was the only user-facing
string no verifier ever saw. The fix is **not** to push transient text through the static verifier:
those two answer different questions, and for a sentence about what is on screen the static
verifier's honest answer is always _the ProductModel does not say this_. Teaching it otherwise would
have been far worse than the gap.

So there are two paths. `verifyContextualStatement` proves relation, target, text source, freshness,
route, privacy, region-phrase authority and occlusion, and issues a **receipt** recording each. The
rendered sentence carries its receipt id in the DOM.

```
statementId  ctx_19323e8      relation   PROVED_BY_GEOMETRY
verified     true             target     MOUNTED
textSource   PLACEHOLDER      textTrust  HOST_UI
freshness    CURRENT_SNAPSHOT privacy    SAFE
occlusion    CLEAR            refusals   []
```

Clauses drop individually — a stale placeholder keeps its geometry, because _above the list_ is true
either way. Two things are never partial: an unmounted target, and a target the guide is covering.

## 6. Two defects the browser found

Both were found by running against Chromium rather than by reasoning, which is now the third loop in
a row where that was true.

**The placeholder outlives what the user can see.** A browser keeps the `placeholder` attribute after
somebody types and simply stops painting it. Reading the attribute alone meant the guide went on
saying _showing "Search clients"_ to a user looking at a field containing "John Smith". Emptiness of
the value is a display fact, not a label — nothing reads _what_ was typed, only _whether_ anything
was. RV01b now falls back to geometry, in a real browser.

**Closed Loop #17's frozen artifact contains a key.** Its capture stored `document.body.innerText`
verbatim so a reviewer could confirm a secret was on screen, and a faithful record of a screen
displaying a key is a file containing a key. The guide never said it and the provider pack never
carried it — the redaction gate proved that and still does, because it scanned the pack and not the
record.

It is `sk_live_fixture_0000`, a fixture constant. Pointed at a real application, the same harness
would have written a real credential into a committed file. The frozen artifact is **not corrected**,
because a review is a promise about the bytes somebody scored; the finding is disclosed in its freeze
record, and this loop's capture masks secret shapes while keeping the fact that one was displayed.

## 7. The gates now run by themselves

Closed Loop #17's audit found that none of this repository's 86 gates ran automatically: no CI, no
hooks, and `verify` covers build, typecheck, unit tests, lint and format but not one `test:` script.
Every guarantee held only while somebody remembered to type the command.

The obvious fix — list the gates in a workflow — is the wrong one, because two lists diverge and the
gate that quietly stops running is the one that was supposed to catch a regression. So there is no
list. The `test:` scripts in `package.json` **are** the manifest, `scripts/gates.mjs` enumerates
them, and CI invokes the runner. `test:ci-gate-manifest` fails if any workflow names a gate
individually, and fails if any workflow can reach a `capture:` command.

```
91 gates, 271.3s   (8 capture commands, none run)
```

## 8. What the numbers say

|                                  |      Before |       After |
| -------------------------------- | ----------: | ----------: |
| ProductModel claim-set hash      | `bb27c5db…` | `bb27c5db…` |
| ProductClaims                    |         113 |     **113** |
| Static title delta               |           — |       **0** |
| Runtime visible-language sources |           0 |       **4** |
| Tests                            |        1338 |    **1373** |
| Gates                            |          86 |      **91** |
| CI runners                       |           0 |       **1** |
| External model calls             |           0 |       **0** |

Seven scenes captured twice each from one build — 5 placeholders observed, 2 scenes gaining a runtime
descriptor, 3 with no contextual sentence at all. Zero page errors.

## 9. Regressions checked

- **Client-detail negative** — INV-001 and INV-002 are plainly visible on `/clients/:clientId` and
  still establish nothing. The answer is still _"I do not have anything verified about that."_
- **Invoice instances** — unchanged on `/invoices`, where `invoices.create-form.submit` earns the
  concept through a verified `POST` claim. Remove that feature from the screen and the choices
  vanish, which is Closed Loop #16 in one line.
- **Prompt injection** — the hostile note is on screen, and the sentence the guide produces is
  byte-identical to the one on the unattacked screen.
- **Mobile** — the sheet covers the application, so the guide says nothing about where anything is.
- **Secret** — the key is on screen and appears in no sentence, no capture and no artifact.

## 10. Why PARTIALLY

The separation half is answered thoroughly and is now enforced more tightly than the static side: a
placeholder can support one sentence shape and no other, its eligibility is decided before anything
reads it, it expires when the user types, and every sentence that reaches a person carries a receipt
naming what was proved. ProductModel delta is zero and no static title moved.

The usefulness half is not answered, and cannot be from inside. `Use the field showing "Search
clients" above the list` is plainly more specific than `On this screen, it is directly above the
list` — and the previous review's finding was that the useful contextual output is _substantially
redundant with what the user can already see_, which this sentence does not obviously escape. It
quotes words that are visible on the same screen the user is looking at.

That is a real possibility and the instrument is built for it: both sentences are captured from one
build, `preferredForm` accepts `NEITHER`, and `RUNTIME_LANGUAGE_NOT_USEFUL`, `GEOMETRY_SUFFICIENT`
and `STILL_REDUNDANT` are all available classifications. Saying the richer sentence was not worth the
words is the most useful outcome this review can produce.

**Limitations.** The trust rule is coarse: `placeholder` and `aria-label` are treated as
host-authored because that is almost always true, and an application rendering user content into an
`aria-label` would defeat it. This narrows the attack surface to something auditable; it does not
eliminate it.

Runtime language is presentation evidence only and does not inform resolution — deliberately, since a
string on screen that could steer guidance would let an application redirect the guide by rendering
text. Whether it should ever inform resolution is a separate authority decision, not taken here.

And the question a user is most likely to have is still unanswerable: a field whose only available
words are a placeholder gets a description and never a name.

---

**`DEVELOPMENT_RUNTIME_LANGUAGE_REVIEW` — UNSCORED.** Seven items, both sentence forms, every score
`null`, reviewer type `non_human_independent`.

**`FORMAL_HUMAN_VALIDATION_GATE` — `DEFERRED_UNTIL_PRE_RELEASE`.** Unchanged, unattempted.

No live model was called. No Statewave memory was started.
