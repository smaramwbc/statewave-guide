/**
 * What a sentence is allowed to say, proposition by proposition.
 *
 * Round 5 passed the usefulness gate and exposed the next ceiling underneath it:
 * **seventeen of eighteen assessable items scored correctness 1, not 2.** Not one
 * was flagged as containing an incorrect fact, and none scored 0. The reviewer's
 * note was the same each time in different words — *"more specific than the
 * supplied facts"*.
 *
 * They were right, and the cause is structural rather than a wording problem.
 *
 * A language claim is `semantically_grounded`, which means exactly one thing:
 * some evidence refs were attached to the sentence. It has never meant that each
 * factual thing the sentence says is true. So one evidence link licensed every
 * proposition inside a sentence, and a sentence holds several:
 *
 * > "Lets an account manager move a client onto the enterprise plan without
 * > editing the record by hand."
 *
 * contains an actor (*account manager*), an action (*move*), an object
 * (*client*), a target state (*enterprise plan*) and a qualifier. Its evidence is
 * `[element:client-detail.change-plan, function:…#changePlan]` — two nodes that
 * exist. Nothing there establishes a job title, and nothing establishes a plan
 * tier. Grepping the fixture settles which is which: `account manager` appears
 * **nowhere**, and `changePlan('enterprise')` is right there at
 * `ClientDetailPage.tsx:114`. One is invention; the other is true and simply not
 * the kind of fact this graph records. Treating them alike would send the fix to
 * the wrong layer.
 *
 * Two measured findings shaped what follows.
 *
 * **Language claims bypassed FeatureScope entirely.** 25 of 103 language-claim
 * evidence refs — 24% — point at nodes the feature does not own.
 * `settings.danger-zone` cites `element:settings.rotate-key`; `settings.form`
 * cites `element:settings.name` and `element:settings.notifications`;
 * `clients.table` cites `element:clients.table.delete`. ADR 0010 installed
 * ownership as the gate on factual truth in Closed Loop #2 and it was never
 * applied here, so a feature has been free to describe its neighbours.
 *
 * **Free-form English cannot be validated deterministically.** This was tried
 * first and measured: scanning a sentence for ungrounded content words withheld
 * 19 of 21 questions, and most of the casualties were `can't`, `particular`,
 * `history` and `name` — tokeniser artefacts and ordinary English, not
 * overreach. A hand-curated list of permitted words would decide what ships, and
 * a word missing from it would silently delete a true sentence. That is a worse
 * failure than the one being fixed, and it would be invisible.
 *
 * So no user-facing sentence is passed through from the model. **Every one is
 * built here, from typed propositions that each carry support.** The layering is
 * the one this project already has, applied one level further in:
 *
 * ```
 *   ProductModel   → GuidanceIR → renderer        (Closed Loop #4)
 *   language claim → PurposeIR  → realisePurpose  (here)
 * ```
 *
 * What a language claim still decides is real but narrow: **whether** to speak
 * about a feature at all, and **which grounded word** to use where more than one
 * would do. It may choose between `client` and `clients`. It may not introduce
 * `enterprise`, because a term that appears in no owned label, path or permission
 * is a term the application has not given us.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode } from '@statewavedev/guide-indexer';
import type { CapabilityAction, ProductClaim } from '@statewavedev/guide-shared';
import { compareStrings } from '../compare.js';
import type { FeatureScope, ScopeClass } from '../scope.js';
import type { HumanLabel } from './labels.js';

// ---------------------------------------------------------------------------
// The taxonomy
// ---------------------------------------------------------------------------

/**
 * The kinds of thing a user-facing sentence asserts.
 *
 * Nine, and each one is here because the Round 5 audit found real sentences
 * making that kind of claim without support. The taxonomy is deliberately not
 * exhaustive over language in general — it covers what twenty-one features
 * actually said, and a tenth class should be added when a tenth kind of overreach
 * is observed rather than in anticipation of one.
 */
export type LanguagePropositionType =
  /** Who does it. *"an admin"*, *"an account manager"*, *"someone reviewing a client"*. */
  | 'actor'
  /** What the user does to it. Must come from a verified capability's action. */
  | 'action'
  /** What is acted on: a client, an invoice, a setting. */
  | 'object'
  /** A named thing shown or produced: an audit trail, a CSV file, an API key. */
  | 'artifact'
  /** The state something is moved into. *"the enterprise plan"*. */
  | 'target_state'
  /** Where it happens, or a guarantee about navigation. *"without leaving the page"*. */
  | 'location'
  /** When it applies, or who may see it. */
  | 'condition'
  /** What changes afterwards. *"the client detail is reloaded"*. */
  | 'effect'
  /** Style. Carries no factual content and may never be used to carry any. */
  | 'qualifier';

/**
 * Why a proposition could not be supported.
 *
 * Four reasons, and the difference between the first two decides which layer
 * gets the work. `PRODUCT_OVERREACH` is a model that made something up.
 * `INDEXER_OMISSION` is a model that was right about the application and a graph
 * that does not record that kind of fact. Reporting both as "unsupported" would
 * hide a real indexer roadmap behind a hallucination count.
 */
export type LanguageRefusal =
  /** Nowhere in the graph, the claims, or the source. Invented. */
  | 'PRODUCT_OVERREACH'
  /** True in the source; the graph records no fact of the kind that would prove it. */
  | 'INDEXER_OMISSION'
  /** Proven, but by something this feature does not own. ADR 0010. */
  | 'NOT_OWNED'
  /** Asserts an absence. Nothing can prove that no navigation happens. */
  | 'UNPROVABLE_NEGATIVE';

/** What establishes a proposition. Never a sentence; always a checkable thing. */
export type LanguageSupport =
  /**
   * An accepted claim's **assertion** — never its text.
   *
   * The distinction matters more than it looks. `settings.new-key#workflow_step:1`
   * is `structurally_verified` and its text reads *"The new API key appears on the
   * Settings page in the danger zone after rotating the key."* What was actually
   * verified is that `element:settings.new-key` exists. Verified claims carry
   * unverified prose too, and treating a claim's text as support would reintroduce
   * the whole problem through the factual layer instead of the language one.
   */
  | { kind: 'claim-assertion'; claimId: string; detail: string }
  /** A node the feature owns, and the attribute of it that carries the meaning. */
  | {
      kind: 'owned-node';
      nodeId: string;
      attribute: 'label' | 'path' | 'permission' | 'method';
      text: string;
    }
  /** A relationship the feature owns. */
  | { kind: 'owned-edge'; edgeId: string; detail: string }
  /** Style, from the closed list. Carries no factual weight and claims none. */
  | { kind: 'presentational'; term: string };

/** One thing a sentence says, and what makes it sayable. */
export interface LanguageProposition {
  type: LanguagePropositionType;
  value: string;
  support: LanguageSupport;
}

/** One thing a sentence wanted to say and may not. */
export interface WithheldProposition {
  type: LanguagePropositionType;
  value: string;
  refusal: LanguageRefusal;
  detail: string;
}

// ---------------------------------------------------------------------------
// Presentational language
// ---------------------------------------------------------------------------

/**
 * The whole of what may be said without proving it.
 *
 * A closed, enumerated list, and that is the entire anti-escape-hatch. The
 * obvious way to defeat a rule requiring support for factual language is to
 * relabel an unsupported fact as style — and you cannot, because style is a
 * finite set of thirteen words and `enterprise` is not one of them.
 *
 * The admission test is not "does it feel like a fact". It is: **could this word
 * be false of this application?** *Quickly* could not — no arrangement of code
 * makes "quickly" wrong in a way a user could point at. *Without leaving the
 * page* could, trivially, and so it is not here.
 */
export const PRESENTATIONAL_TERMS: ReadonlySet<string> = new Set([
  'quickly',
  'easily',
  'simply',
  'straight',
  'directly',
  'conveniently',
  'clearly',
  'readily',
  'at a glance',
  'in one place',
  'without fuss',
  'as needed',
  'if you want',
]);

/** True when a term may appear without anything establishing it. */
export function isPresentational(term: string): boolean {
  return PRESENTATIONAL_TERMS.has(term.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// The grounded term index
// ---------------------------------------------------------------------------

/** A word the application itself supplies, and the thing that supplies it. */
export interface GroundedTerm {
  term: string;
  support: LanguageSupport;
}

/** Every word a feature has earned the right to use. */
export interface GroundedTerms {
  /** Lookup by lowercased term, singular or plural. */
  has(term: string): boolean;
  supportFor(term: string): LanguageSupport | undefined;
  /** Everything, sorted. For the audit report and for diagnostics. */
  all(): readonly GroundedTerm[];
}

const IDENTIFIER_NOISE = new Set([
  'api',
  'v0',
  'v1',
  'param',
  'id',
  'ids',
  'clientid',
  'the',
  'a',
  'an',
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/** `clients` and `client` are the same word for this purpose. */
export function singular(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** What {@link buildGroundedTerms} needs. */
export interface GroundedTermsInput {
  featureId: string;
  scope: FeatureScope;
  nodes: readonly ApplicationNode[];
  claims: readonly ProductClaim[];
}

/**
 * The vocabulary the application gives this feature.
 *
 * Three sources, in descending order of how directly a user meets them:
 * the **visible text of a control the feature owns**, the **path of an endpoint
 * or route it owns**, and the **permission it owns**. Plus the actions of its own
 * accepted capability claims, which are a closed enum rather than free text.
 *
 * Ownership is required, and it is the fix for the 24%. A term is only grounded
 * for the feature that owns the thing carrying it: `settings.rotate-key` may say
 * *API key* because its own control is labelled `Rotate API key`;
 * `settings.danger-zone` may not, because the section owns no such label and the
 * button belongs to another feature.
 *
 * Identifiers are deliberately **not** a source. `element:settings.new-key`
 * contains the word `key` and the element is a `<code>` block with no visible
 * text, so nothing on screen names it — the identifier is our filing system, not
 * the product's vocabulary. This is the same refusal ADR 0014 makes about
 * resolving a control by the shape of its id.
 */
export function buildGroundedTerms(input: GroundedTermsInput): GroundedTerms {
  const index = new Map<string, LanguageSupport>();

  /**
   * @param fromIdentifier - true for words lifted out of a path or a permission
   *   string, where `api` and `v1` are routing furniture rather than vocabulary.
   *   False for a visible label, where they are not: a button reading
   *   **Rotate API key** genuinely gives the reader the words *API* and *key*,
   *   and stripping them because a URL would have been noisy is how
   *   `settings.rotate-key` lost the only vocabulary it had.
   */
  const put = (raw: string, support: LanguageSupport, fromIdentifier: boolean): void => {
    const term = raw.toLowerCase();
    if (term.length < 2) return;
    if (fromIdentifier && IDENTIFIER_NOISE.has(term)) return;
    if (!index.has(term)) index.set(term, support);
    const stem = singular(term);
    if (!index.has(stem)) index.set(stem, support);
  };

  for (const node of input.nodes) {
    if (input.scope.classify(node.id) !== 'OWNED') continue;
    const record = node as unknown as Record<string, unknown>;

    const label = typeof record['label'] === 'string' ? record['label'].trim() : '';
    if (label.length > 0) {
      for (const word of words(label)) {
        put(word, { kind: 'owned-node', nodeId: node.id, attribute: 'label', text: label }, false);
      }
    }

    const path = typeof record['path'] === 'string' ? record['path'] : '';
    if (path.length > 0) {
      for (const word of words(path.replace(/[:?/]/g, ' '))) {
        put(word, { kind: 'owned-node', nodeId: node.id, attribute: 'path', text: path }, true);
      }
    }

    const permission = typeof record['permission'] === 'string' ? record['permission'] : '';
    if (permission.length > 0) {
      for (const word of words(permission.replace(/:/g, ' '))) {
        put(
          word,
          { kind: 'owned-node', nodeId: node.id, attribute: 'permission', text: permission },
          true,
        );
      }
    }
  }

  for (const claim of input.claims) {
    if (claim.status !== 'structurally_verified') continue;
    const action = claim.assertion?.action;
    if (action === undefined) continue;
    put(
      action,
      {
        kind: 'claim-assertion',
        claimId: claim.id,
        detail: `verified capability action "${action}"`,
      },
      false,
    );
  }

  return {
    has: (term) => index.has(term.toLowerCase()) || index.has(singular(term.toLowerCase())),
    supportFor: (term) => index.get(term.toLowerCase()) ?? index.get(singular(term.toLowerCase())),
    all: () =>
      [...index.entries()]
        .map(([term, support]) => ({ term, support }))
        .sort((a, b) => compareStrings(a.term, b.term)),
  };
}

// ---------------------------------------------------------------------------
// Evidence ownership
// ---------------------------------------------------------------------------

/** One language claim's evidence, checked against what the feature owns. */
export interface LanguageEvidenceAudit {
  claimId: string;
  owned: readonly string[];
  /** Refs the feature does not own, with how the scope classifies each. */
  unowned: readonly { ref: string; scopeClass: ScopeClass }[];
}

/**
 * Whether a language claim is even entitled to speak.
 *
 * A claim citing something the feature does not own is describing its
 * neighbours, and this is measurably common rather than hypothetical:
 * `settings.form` cites the two inputs beside it, `clients.table` cites the row
 * and the delete button inside a component it does not own, and
 * `settings.danger-zone` cites the rotate button — which is a different feature
 * entirely, with its own guide.
 *
 * `REACHABLE` counts as entitled. A navigation link legitimately speaks about
 * where it goes; ADR 0010 records the destination for exactly that reason and
 * stops the walk there.
 */
export function auditLanguageEvidence(
  claim: ProductClaim,
  scope: FeatureScope,
): LanguageEvidenceAudit {
  const owned: string[] = [];
  const unowned: { ref: string; scopeClass: ScopeClass }[] = [];
  for (const entry of claim.evidence ?? []) {
    const scopeClass = scope.classify(entry.ref);
    if (scopeClass === 'OWNED' || scopeClass === 'REACHABLE') owned.push(entry.ref);
    else unowned.push({ ref: entry.ref, scopeClass });
  }
  return { claimId: claim.id, owned, unowned };
}

// ---------------------------------------------------------------------------
// PurposeIR
// ---------------------------------------------------------------------------

/** What a feature has been established to be for, before anybody writes it down. */
export interface PurposeIR {
  featureId: string;
  propositions: readonly LanguageProposition[];
  /** What was wanted and refused, with the reason. Developer-facing. */
  withheld: readonly WithheldProposition[];
}

/** What {@link compilePurpose} needs. */
export interface CompilePurposeInput {
  featureId: string;
  scope: FeatureScope;
  graph: ApplicationGraph;
  /** Every claim belonging to this feature, of every status. */
  claims: readonly ProductClaim[];
  terms: GroundedTerms;
}

const OBJECT_STOP = new Set(['api', 'v0', 'v1', 'param', 'clientid', 'id']);

/**
 * The noun this feature is about.
 *
 * Taken from the resource segment of an endpoint the feature owns, because an
 * endpoint path is the least ambiguous statement of what a feature acts on that
 * a codebase contains: `POST /api/clients` is about a client whatever the button
 * is called. A route is the second choice, and the feature's own namespace is the
 * last — and only when it is a single plain word, because `client-detail` is a
 * screen name rather than a thing, and *"Lets you change a client-detail"* is
 * what happens when you forget that.
 */
export function objectNoun(
  input: CompilePurposeInput,
): { noun: string; support: LanguageSupport } | undefined {
  const owned = input.graph.nodes.filter((node) => input.scope.classify(node.id) === 'OWNED');

  for (const kind of ['api', 'route'] as const) {
    for (const node of owned) {
      if (node.kind !== kind) continue;
      const record = node as unknown as Record<string, unknown>;
      const path = typeof record['path'] === 'string' ? record['path'] : '';
      const segments = words(path.replace(/[:?/]/g, ' ')).filter((word) => !OBJECT_STOP.has(word));
      const first = segments[0];
      if (first === undefined) continue;
      return {
        noun: singular(first),
        support: { kind: 'owned-node', nodeId: node.id, attribute: 'path', text: path },
      };
    }
  }

  const head = input.featureId.split('.')[0] ?? '';
  if (/^[a-z]+$/.test(head) && head.length > 1) {
    return {
      noun: singular(head),
      support: {
        kind: 'claim-assertion',
        claimId: input.featureId,
        detail: 'the feature namespace, which names what the feature is about',
      },
    };
  }
  return undefined;
}

/**
 * A named thing the feature shows or produces.
 *
 * Grounded twice before it may be said: a control the feature owns must carry it
 * as visible text, **and** an endpoint the feature owns must name it too. Both,
 * because either alone is weak. A label on its own is English on a button —
 * ADR 0015 already refuses to read behaviour out of one — and a path segment on
 * its own is an identifier. Together they are the application naming the same
 * thing in two independent places, which is as close to corroboration as a static
 * graph offers.
 *
 * `client-detail.audit` passes: the button reads `Audit trail` and the endpoint
 * is `GET /api/clients/:clientId/audit`. `settings.rotate-key` does not: the
 * button reads `Rotate API key` and the feature owns no endpoint at all, because
 * the fixture's rotate call is frontend-only.
 */
export function artifactNoun(
  input: CompilePurposeInput,
  object: string,
): { text: string; support: LanguageSupport } | undefined {
  const owned = input.graph.nodes.filter((node) => input.scope.classify(node.id) === 'OWNED');
  const pathWords = new Set(
    owned.flatMap((node) => {
      const record = node as unknown as Record<string, unknown>;
      const path = typeof record['path'] === 'string' ? record['path'] : '';
      return words(path.replace(/[:?/]/g, ' '));
    }),
  );

  for (const node of [...owned].sort((a, b) => compareStrings(a.id, b.id))) {
    const record = node as unknown as Record<string, unknown>;
    const label = typeof record['label'] === 'string' ? record['label'].trim() : '';
    if (label.length === 0) continue;
    const corroborated = words(label).some(
      (word) => pathWords.has(word) && singular(word) !== object,
    );
    if (!corroborated) continue;
    return {
      text: label.toLowerCase(),
      support: { kind: 'owned-node', nodeId: node.id, attribute: 'label', text: label },
    };
  }
  return undefined;
}

/**
 * Compiles what may be said about why a feature exists.
 *
 * An action is taken only from a verified `capability` assertion — never from the
 * English of a control label. A button reading `Rotate API key` does not
 * establish that anything is rotated, which is the same refusal ADR 0015 makes
 * when it declines to treat a label as evidence of behaviour, applied to prose
 * instead of to selection.
 */
export function compilePurpose(input: CompilePurposeInput): PurposeIR {
  const propositions: LanguageProposition[] = [];
  const withheld: WithheldProposition[] = [];

  const verified = input.claims.filter((claim) => claim.status === 'structurally_verified');

  // `submit` and `navigate` are mechanisms rather than reasons a feature exists.
  // Round 4 shipped "You can submit a setting using Save changes" from the first
  // and "You can open a nav" from the second.
  const capability = verified.find(
    (claim) =>
      claim.type === 'capability' &&
      claim.assertion?.action !== undefined &&
      claim.assertion.action !== 'submit' &&
      claim.assertion.action !== 'navigate',
  );

  if (capability === undefined) {
    withheld.push({
      type: 'action',
      value: '(unknown)',
      refusal: 'PRODUCT_OVERREACH',
      detail:
        'No verified capability names what a user does here, so nothing establishes what the feature is for. A label is not a verb.',
    });
    return { featureId: input.featureId, propositions, withheld };
  }

  const action = capability.assertion?.action as CapabilityAction;
  propositions.push({
    type: 'action',
    value: action,
    support: {
      kind: 'claim-assertion',
      claimId: capability.id,
      detail: `verified capability action "${action}"`,
    },
  });

  const object = objectNoun(input);
  if (object === undefined) {
    withheld.push({
      type: 'object',
      value: '(unknown)',
      refusal: 'PRODUCT_OVERREACH',
      detail:
        'Nothing this feature owns names what it acts on: no endpoint, no route, and a namespace that is a screen rather than a thing.',
    });
    return { featureId: input.featureId, propositions, withheld };
  }
  propositions.push({ type: 'object', value: object.noun, support: object.support });

  const artifact = artifactNoun(input, object.noun);
  if (artifact !== undefined) {
    propositions.push({ type: 'artifact', value: artifact.text, support: artifact.support });
  }

  return { featureId: input.featureId, propositions, withheld };
}

// ---------------------------------------------------------------------------
// Realisation
// ---------------------------------------------------------------------------

const article = (noun: string): string => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

/** How each verified action reads as a reason rather than an instruction. */
const PURPOSE_VERBS: Record<CapabilityAction, string> = {
  create: 'create',
  view: 'view',
  update: 'change',
  delete: 'delete',
  submit: 'submit',
  navigate: 'open',
  search: 'search',
  export: 'export',
  import: 'import',
  send: 'send',
};

/**
 * The sentence, or nothing.
 *
 * Two shapes and no more. A grammar with a case for every combination of
 * propositions is a grammar nobody can audit, and the point of this layer is that
 * a reader can hold each sentence against the things that licensed it.
 */
export function realisePurpose(ir: PurposeIR): string | undefined {
  const find = (type: LanguagePropositionType): LanguageProposition | undefined =>
    ir.propositions.find((entry) => entry.type === type);

  const action = find('action');
  const object = find('object');
  if (action === undefined || object === undefined) return undefined;

  const verb = PURPOSE_VERBS[action.value as CapabilityAction] ?? action.value;
  const artifact = find('artifact');

  if (artifact !== undefined) {
    return `Lets you ${verb} the ${artifact.value} for ${article(object.value)}.`;
  }
  if (action.value === 'create') return `Lets you create ${article(`new ${object.value}`)}.`;
  if (action.value === 'search' || action.value === 'export' || action.value === 'import') {
    return `Lets you ${verb} ${object.value}s.`;
  }
  return `Lets you ${verb} ${article(object.value)}.`;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/** A question, and what makes asking it honest. */
export interface CompiledQuestion {
  text: string;
  propositions: readonly LanguageProposition[];
}

/**
 * Questions, compiled rather than quoted.
 *
 * A question mark does not reduce factual authority. *"Why can't I see the New
 * client button?"* presupposes that the button can be absent, which is a claim
 * about conditional visibility, and *"How do I upgrade a client to the enterprise
 * plan?"* asserts a plan tier while appearing to ask about one. Both were shipped
 * in Round 5 and neither was checked.
 *
 * So the two questions this layer can ask are the two a verified claim licenses:
 * a capability makes *how do I* answerable, and a permission or constraint makes
 * *why can't I see* answerable. Everything else is silence.
 */
export function compileQuestions(input: CompilePurposeInput): CompiledQuestion[] {
  const questions: CompiledQuestion[] = [];
  const verified = input.claims.filter((claim) => claim.status === 'structurally_verified');
  const object = objectNoun(input);

  const capability = verified.find(
    (claim) =>
      claim.type === 'capability' &&
      claim.assertion?.action !== undefined &&
      claim.assertion.action !== 'submit' &&
      claim.assertion.action !== 'navigate',
  );

  if (capability !== undefined && object !== undefined) {
    const action = capability.assertion?.action as CapabilityAction;
    const verb = PURPOSE_VERBS[action] ?? action;
    // The artifact carries the question as much as the verb does. "How do I view
    // a client?" is a worse question than "How do I view the audit trail for a
    // client?", and the second is no less proven — the same doubly-grounded noun
    // the purpose uses.
    const artifact = artifactNoun(input, object.noun);
    const phrase =
      artifact !== undefined
        ? `${verb} the ${artifact.text} for ${article(object.noun)}`
        : action === 'create'
          ? `create ${article(`new ${object.noun}`)}`
          : action === 'search' || action === 'export' || action === 'import'
            ? `${verb} ${object.noun}s`
            : `${verb} ${article(object.noun)}`;
    questions.push({
      text: `How do I ${phrase}?`,
      propositions: [
        {
          type: 'action',
          value: action,
          support: {
            kind: 'claim-assertion',
            claimId: capability.id,
            detail: 'verified capability',
          },
        },
        { type: 'object', value: object.noun, support: object.support },
        ...(artifact === undefined
          ? []
          : [{ type: 'artifact' as const, value: artifact.text, support: artifact.support }]),
      ],
    });
  }

  // Conditional visibility, and only where a permission the feature owns
  // establishes it. `settings.save`'s question about being greyed out cited
  // `permission:settings:update`, which that feature does not own.
  const permission = verified.find(
    (claim) => claim.type === 'permission' || claim.type === 'constraint',
  );
  const control = namedControl(input);
  if (permission !== undefined && control !== undefined) {
    questions.push({
      text: `Why can't I see "${control.text}"?`,
      propositions: [
        {
          type: 'condition',
          value: 'requires permission',
          support: {
            kind: 'claim-assertion',
            claimId: permission.id,
            detail: 'verified permission',
          },
        },
        {
          type: 'artifact',
          value: control.text,
          support: {
            kind: 'owned-node',
            nodeId: control.nodeId,
            attribute: 'label',
            text: control.text,
          },
        },
      ],
    });
  }

  return questions;
}

/** The feature's own visible control, when it has exactly one obvious name. */
function namedControl(input: CompilePurposeInput): { text: string; nodeId: string } | undefined {
  const labelled = input.graph.nodes
    .filter((node) => node.kind === 'element' && input.scope.classify(node.id) === 'OWNED')
    .map((node) => {
      const record = node as unknown as Record<string, unknown>;
      const label = typeof record['label'] === 'string' ? record['label'].trim() : '';
      const origin = typeof record['labelOrigin'] === 'string' ? record['labelOrigin'] : '';
      // A question quotes the control, so the same rule applies as to a step.
      return { nodeId: node.id, text: label, visible: origin.length > 0 };
    })
    .filter((entry) => entry.text.length > 0 && entry.visible)
    .sort((a, b) => compareStrings(a.nodeId, b.nodeId));
  const first = labelled[0];
  if (first === undefined || labelled.length > 1) return undefined;
  return first;
}

/** A label a compiled sentence may quote, because a user can read it on screen. */
export function quotableLabel(label: HumanLabel | undefined): string | undefined {
  return label?.origin === 'ui-label' ? label.text : undefined;
}
