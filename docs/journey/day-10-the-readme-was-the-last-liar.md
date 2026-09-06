# Statewave Guide — Day 10

## The README was the last liar in the building.

Day 9 ended with:

> Can a stranger install all of this in an afternoon — and trust it by evening?

So today we did the only honest thing:

we became the stranger.

Fresh eyes. Front door. Follow the instructions.

It went badly. 😅

The README — of a project whose entire identity is _"unknown is better than wrong"_ — opened with:

> There is no AI in this repository yet.

False.

> There is no Statewave dependency yet either.

Spectacularly false.

That's the crown jewel now.

> Day 0 and Day 1 are done; everything below is not yet implemented.

Days 2 through 7: built. Gated. Measured.

The "What is not built yet" section?

Mostly a list of things that are built.

For nine days, every _sentence the product speaks_ has gone through verifiers, refutation passes, adversarial gates.

And the one document nobody's gates were pointed at —

the front door —

quietly rotted into fiction.

139 checks proving the product never overclaims.

Zero checks on the README doing exactly that. 😬

It got better.

The quick start said:

```bash
npx @statewavedev/guide-indexer .
```

Nothing is published to npm.

That command 404s for every human on Earth.

The flagship demo — the one that answers "can I trust this?" in ninety seconds — had no README, no script, and was mentioned nowhere a stranger would look.

And the audit found real bugs hiding behind the stale paper:

The reference memory backend — the exact file we tell hosts to copy — pinned last month's SDK.

Which silently ignored the paging parameters.

Which read the **oldest** memory window instead of the newest.

Quietly reintroducing the exact bug two closed loops had just killed. 🎭

A server that's too old does the same thing: accepts the parameters, returns 200, ignores them.

So the adapter now detects it —

a page with no `has_more` flag is a server that never understood the question,

and the read gets reported as degraded instead of trusted.

Silent wrongness, refused. Again.

Then we rewrote everything.

README. Host integration guide. Trust page. Demo docs.

Every step a stranger takes, written down, in order, truthfully:

```bash
git clone … && pnpm install && pnpm build
pnpm demo        # ask it something. press Show me.
pnpm gates       # don't believe us. run the 139 checks.
```

And then — because this project has learned exactly one lesson nine times —

we fact-checked our own rewrite.

Line by line. Against the code. Fresh eyes again.

**Eighteen defects. In the rewrite.** 😂

I wrote "~50 fake endpoints."

The source says "dozens."

I invented the precision.

I wrote "33 ADRs."

There are 32. A number got skipped once.

I credited the CLI with powers only the library has.

I got two cells of my own dependency table wrong.

Eighteen times, the person writing _"our documents don't lie"_…

overclaimed.

Not because I'm careless.

Because **everyone** is careless.

That's not the embarrassing part of the story.

That _is_ the story:

> **Nobody gets to be their own verifier. Not even the person who built the verifiers.**

Everything is fixed.

The front door now tells the truth — and the claims on it link to the command that re-proves them on your machine.

So, the answer:

**An afternoon?** Yes — clone, build, demo, ten minutes to the first _Show me_.

**Trust by evening?** That was never going to come from a README.

It comes from `pnpm gates`.

Which is how it should be.

The product refuses to guess.

The memory refuses authority.

The docs refuse convenience.

And the README, finally, refuses fiction.

**Statewave Guide — Day 10.**

The repository is the product now:

```text
Source code        →  truth about the product
Running interface  →  truth about right now
Memory             →  truth about you (and only you)
Gates              →  truth about all of the above
```

Next question:

> **It works on our machine, honestly. Time to find out what breaks on yours.**
