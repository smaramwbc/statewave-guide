# 34. A permission is the host's to assert, and the guide's to repeat

- **Status:** Accepted
- **Date:** 2026-09-13
- **Applies:** [ADR 0022](0022-the-ui-asks-for-guidance-it-does-not-interpret-product-truth.md) to a condition's verdict

## Context

Compiled guidance has always been able to say what a feature requires. Ask the demo how to create a
client and the answer carries one condition:

> You need permission to create a client.

That sentence is true of the product and useless to the person reading it. It is the answer to
"what does this need?" offered to somebody who asked "can I do this?" — and in the one case where
the guide could be most useful, a user looking at a toolbar with no **New client** button in it, the
guide said the same thing it says to an administrator.

The material was already there. The compiled proposition carries two separate things:

```json
{ "kind": "requires_permission", "permission": "clients:create", "capability": "create a client" }
```

`permission` is an identifier lifted out of the application's own source. `capability` is the prose
half. And the host already had a field to report what the signed-in user holds — `permissions` on
the runtime context — documented as "used to filter guidance" and consulted by nothing.

Three things made this look riskier than it is, and only one of them was real.

The first was authority. A permission verdict is not a fact about the product and must never reach
the ProductModel: it is true of one user, for the length of one answer. That is what RuntimeContext
already is, so nothing new was needed — the verdict is computed per query and thrown away, in the
same sense the route is.

The second was matching. English is not an identifier, and `capability` must never be compared to
anything: a guide that matched "create a client" against a host's permission strings would flip a
verdict on a rename in either vocabulary. Only `permission` is matched, exactly, with no
normalisation.

The third is real. **Absence of a permission from a reported list is only meaningful if the list is
complete.** A host that reports half of what a user holds would produce "You do not have permission
to create a client" for a user who does — which is the failure this project cares most about, because
telling somebody they cannot do a thing they can do teaches them to stop asking.

## Decision

**A condition carries a verdict, and the verdict comes from the host or does not exist.**

`GuideAnswer.conditions` changes from `string[]` to `{ text, status }[]`, where `status` is one of:

| status     | reached when                              | sentence                                       |
| ---------- | ----------------------------------------- | ---------------------------------------------- |
| `UNKNOWN`  | the host reported no permissions          | You need permission to create a client.        |
| `HELD`     | the host's list contains the permission   | You have permission to create a client.        |
| `NOT_HELD` | the host reported a list, and it does not | You do not have permission to create a client. |

There is no fourth value for "probably". `UNKNOWN` is the default, and it is the sentence this
contract has always produced — so a host that adopts this release and changes nothing gets exactly
what it had.

Three rules hold the third risk down rather than pretending it away:

1. **Reporting the field is a claim of completeness**, documented at full strength on the field
   itself. This is the one thing a host must get right, and it is the same thing every authorisation
   check in that host already depends on.
2. **`undefined` and `[]` are different.** Absent is "I was not told". Empty is "this user holds
   nothing", which is what a signed-out session genuinely looks like. Collapsing them would either
   silence the useful answer or invent it.
3. **A permission identifier is never spoken.** `clients:delete` is a string from the source in
   exactly the way a route identifier is. Without a compiled `capability` phrase the sentence stays
   general — "You do not have the permission this needs" — rather than naming something the
   interface never shows.

**Steps are not pruned by a permission.** Being told how something works and being allowed to do it
are different questions — the distinction the engine already draws between what it will explain and
what it will click. A user who cannot create a client is often a user about to ask somebody who can,
and a walkthrough that vanishes teaches them nothing to ask for.

## Consequences

The renderer styles `status` and never derives words from it, which is ADR 0022 applied to a verdict:
choosing between "you need", "you have" and "you do not have" is three different claims, not three
ways of formatting one.

A host that reports permissions gets an answer that is about the reader. A host that does not is
unchanged, and pays nothing. A host that reports them _badly_ gets confidently wrong answers, which
is why the field says so in the place a developer reads it rather than in a document they might not.

`GuideQueryContext` gained a field during a frozen review round, which
`test:runtime-language-freeze` caught. The pin was moved deliberately, with the reason recorded
beside it — the round asks whether a placeholder may describe a control it is not allowed to name,
and a permission identifier is never spoken at all.
