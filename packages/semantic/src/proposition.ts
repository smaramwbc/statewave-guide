/**
 * Counting what a renderer added.
 *
 * ## What this is, stated plainly
 *
 * This is a **detector for the test suite**, not a proof and not a gate. It
 * cannot decide whether an English sentence is true, and nothing in this package
 * pretends it can — ADR 0007 calls the prose blind spot out by name and leaves
 * it open. What this module does is narrower and honest: it looks for a fixed
 * list of capability and effect words, and reports the ones that appear in
 * rendered prose without appearing in any accepted claim.
 *
 * That is enough to answer one specific question — *did the renderer introduce a
 * proposition the verifier never saw?* — which is the question brief section 8
 * asks and the one a renderer test needs an answer to. It is not enough to
 * answer "is this description accurate", and using it that way would be worse
 * than not having it, because a check that reports zero on prose it cannot read
 * invites someone to trust the zero.
 *
 * ## Its value depends entirely on the watchlist
 *
 * {@link PROPOSITION_WATCHLIST} is eleven entries long. A fabricated capability
 * phrased in words that are not on it passes silently, and there is no version
 * of this approach where that stops being true: the space of sentences a model
 * can write is not enumerable, so any wordlist is a net with holes in it.
 *
 * The holes are real and worth naming. "Client types are created
 * automatically" is caught — by `automatically`, the *effect* word, not by the
 * invented taxonomy. "Clients may be grouped into tiers" is not caught at all.
 * That asymmetry is why the deterministic renderer exists: its zero score is
 * meaningful not because this detector is thorough, but because
 * `createDeterministicRenderer` emits templated text built from claim
 * assertions and has no path by which an unlisted word could arrive either.
 *
 * A watchlist hit against a real renderer is therefore strong evidence of a
 * problem; a clean run is weak evidence of correctness. Read the result in that
 * direction only.
 *
 * ## What counts as backing
 *
 * Only language the *verifier* actually checked, and language the *graph* itself
 * carries. Concretely:
 *
 * - the assertion fields a rule was evaluated against — `action`, `route`,
 *   `permission` and `subjectRef`;
 * - anything a caller passes as {@link PropositionCheckOptions.evidenceLanguage}:
 *   the readable half of graph facts, such as an element's label, a route path
 *   or a permission string.
 *
 * Two fields that look like backing are deliberately **not** backing.
 * {@link ProductClaim.text} is the sentence under suspicion — a detector that
 * let a sentence license its own vocabulary would report zero on every input,
 * which is worse than no detector. {@link ClaimAssertion.subjectLabel} is free
 * text a model wrote and the verifier never resolves (`shared/src/semantic.ts`
 * calls it "deliberately powerless"), so a label reading "the CSV import module"
 * must not license "CSV".
 *
 * A route named `/clients/export` therefore licenses the word through a
 * navigation claim's `route`, and an application that registers a verifier for
 * `export` licenses it through that claim's `action`. The built-in matrix can
 * never uphold an `export` capability, so with the built-in matrix alone that
 * second route to backing does not exist.
 *
 * @packageDocumentation
 */

import type { ProductClaim } from '@statewavedev/guide-shared';
import { compareStrings } from './compare.js';

/** One watched proposition and the surface forms that signal it. */
export interface WatchedProposition {
  /** Stable name, reported in {@link PropositionCheckResult.introduced}. */
  id: string;
  /**
   * Why this word is watched, in one line.
   *
   * Every entry here is a capability or an effect — something the application
   * would have to actually *do*. Descriptive vocabulary is deliberately absent:
   * a model calling a list "the client table" is writing, not asserting.
   */
  why: string;
  /** Surface forms, matched case-insensitively at word boundaries. */
  patterns: readonly RegExp[];
}

/**
 * The fixed watchlist.
 *
 * Eleven entries, each one a thing a model reaches for when it is filling a gap:
 * an application that emails, notifies, synchronises, imports, exports, handles
 * spreadsheets, acts in bulk, restricts to administrators, does something
 * automatically, or talks to a third party. None of those is provable from a
 * generic graph fact — `import`, `export` and `send` have no rule in the
 * verification matrix at all — which is exactly why prose that asserts one
 * without a claim behind it is worth flagging.
 */
export const PROPOSITION_WATCHLIST: readonly WatchedProposition[] = [
  {
    id: 'email',
    why: 'Sending mail is an effect on the outside world; no graph shape proves it.',
    patterns: [/\be-?mails?\b/i, /\be-?mail(ed|ing)\b/i],
  },
  {
    id: 'notify',
    why: 'A notification is a side effect a reader will expect to receive.',
    patterns: [/\bnotif(y|ies|ied|ying|ication|ications)\b/i, /\balerts?\b/i],
  },
  {
    id: 'sync',
    why: 'Synchronisation implies a second system and a schedule.',
    patterns: [/\bsync\b/i, /\bsyncs\b/i, /\bsync(ed|ing)\b/i, /\bsynchroni[sz](e|es|ed|ing)\b/i],
  },
  {
    id: 'import',
    why: 'The matrix has no rule for import: a POST endpoint is not an import.',
    patterns: [/\bimport(s|ed|ing)?\b/i],
  },
  {
    id: 'export',
    why: 'The matrix has no rule for export: a GET endpoint is not an export.',
    patterns: [/\bexport(s|ed|ing)?\b/i],
  },
  {
    id: 'csv',
    why: 'A named file format is a capability claim wearing a noun.',
    patterns: [/\bcsvs?\b/i, /\bcomma[- ]separated\b/i],
  },
  {
    id: 'excel',
    why: 'As with CSV: a format nobody proved the application handles.',
    patterns: [/\bexcel\b/i, /\bxlsx?\b/i, /\bspreadsheets?\b/i],
  },
  {
    id: 'bulk',
    why: 'Acting on many records at once is a different capability from acting on one.',
    patterns: [/\bbulk\b/i, /\bbatch(es|ed|ing)?\b/i, /\bmass\b/i],
  },
  {
    id: 'admin-only',
    why: 'A restriction nobody can act on is worse than no restriction stated.',
    patterns: [/\badmin(istrator)?s?[-\s]only\b/i, /\bonly\s+admin(istrator)?s?\b/i],
  },
  {
    id: 'automatically',
    why: 'Automatic behaviour is the commonest invented effect: nobody pressed anything.',
    patterns: [/\bautomatic(ally)?\b/i, /\bautomated\b/i, /\bon its own\b/i],
  },
  {
    id: 'external',
    why: 'An external system is an integration, and integrations are rarely in the graph.',
    patterns: [/\bexternal(ly)?\b/i, /\bthird[-\s]party\b/i, /\boutside system\b/i],
  },
];

/** What the check established. */
export interface PropositionCheckResult {
  /**
   * Watchlist entries the prose asserts and no accepted claim supports, sorted.
   *
   * Empty is the expected result for {@link createDeterministicRenderer}.
   */
  introduced: string[];
  /**
   * How many propositions were examined.
   *
   * The size of the watchlist, not the number of hits — so a caller reading
   * `introduced: []` alongside `checked: 11` can see how thin the guarantee is.
   */
  checked: number;
}

/**
 * The language a claim earned the right to license.
 *
 * The assertion fields the verifier matched against the graph, and nothing
 * else. `text` and `subjectLabel` are excluded — see "What counts as backing"
 * above — and so are `targets`: a node id is an identity, not vocabulary, and
 * letting `element:clients.export` license the word "export" in arbitrary prose
 * would hand the detector's own blind spot a shortcut. A caller that wants a
 * cited fact's *readable* half to count passes it as `evidenceLanguage`, where
 * it is a deliberate, visible decision rather than a silent one.
 */
function claimLanguage(claim: ProductClaim): string[] {
  const assertion = claim.assertion;
  if (assertion === undefined) return [];
  const parts = [assertion.subjectRef];
  if (assertion.action !== undefined) parts.push(assertion.action);
  if (assertion.route !== undefined) parts.push(assertion.route);
  if (assertion.permission !== undefined) parts.push(assertion.permission);
  return parts;
}

/** True when any pattern matches anywhere in `haystacks`. */
function matches(proposition: WatchedProposition, haystacks: readonly string[]): boolean {
  for (const pattern of proposition.patterns) {
    for (const haystack of haystacks) {
      // Constructed fresh each time rather than reusing a `/g` regex: a global
      // expression carries `lastIndex` between calls, and a detector whose
      // answer depends on how many times it has been called before is not a
      // detector.
      if (new RegExp(pattern.source, pattern.flags.replace('g', '')).test(haystack)) return true;
    }
  }
  return false;
}

/** Extra backing a caller can supply. */
export interface PropositionCheckOptions {
  /**
   * The readable half of graph facts under discussion — an element's label, a
   * route path, a permission string, an endpoint's path.
   *
   * These are facts the indexer extracted from source, not language a model
   * chose, so a word that appears in one is a word the application itself uses.
   * Pass only facts that belong to the prose being checked; passing a whole
   * neighbourhood would license every word in it.
   */
  evidenceLanguage?: readonly string[];
}

/**
 * Reports watched propositions the prose asserts and the claims do not.
 *
 * @param prose Rendered text — a description, a workflow intro, or both joined.
 * @param claims The feature's claims. Rejected ones are ignored: a claim the
 * verifier refused cannot license anything, and treating it as backing would
 * turn every refusal into a permit.
 * @param options Additional backing. See {@link PropositionCheckOptions}.
 */
export function checkRenderedPropositions(
  prose: string,
  claims: readonly ProductClaim[],
  options?: PropositionCheckOptions,
): PropositionCheckResult {
  const accepted = claims.filter((claim) => claim.status !== 'rejected');
  const supporting = [...accepted.flatMap(claimLanguage), ...(options?.evidenceLanguage ?? [])];

  const introduced = new Set<string>();
  for (const proposition of PROPOSITION_WATCHLIST) {
    if (!matches(proposition, [prose])) continue;
    if (matches(proposition, supporting)) continue;
    introduced.add(proposition.id);
  }

  return {
    introduced: [...introduced].sort(compareStrings),
    checked: PROPOSITION_WATCHLIST.length,
  };
}
