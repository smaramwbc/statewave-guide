/**
 * Offering the concrete thing in front of the user, without claiming what it is.
 *
 * The product knows what an *invoice* is: a verified capability established the
 * noun, and it lives in the ProductModel. The runtime knows that two rows are on
 * screen and that the interface writes `INV-001` and `INV-002` on them. Those are
 * different kinds of knowledge and this module is the only place they meet.
 *
 * What it will not do is bridge them with an identifier. The benchmark's rows are
 * rendered by a component called `InvoiceList`, sit under semantic ids beginning
 * `invoices.`, and **nothing in the graph connects either to the concept**. Reading
 * "invoice" off a component name is exactly the substitution ADR 0018 removed from
 * titles, so the concept has to be established on the screen the user is actually
 * looking at, by evidence, or no instance is offered at all.
 *
 * The consequence is deliberate and worth stating: the same two rows are offerable
 * on `/invoices`, where a verified claim establishes "invoice", and are not on
 * `/clients/:clientId`, where nothing does. Same rows, different evidence, different
 * answer.
 *
 * Nothing here writes anything down. An instance is true of one snapshot.
 *
 * @packageDocumentation
 */

import type { GuideKnowledgeBundle } from './bundle.js';
import { routeMatches } from './bundle.js';
import type { GuideQueryContext, GuideRuntimeChoice, RuntimeInstanceRef } from './contract.js';

/**
 * Names that must never be displayed, whatever they belong to.
 *
 * The same shapes Closed Loop #9 refuses to record. A name matching one of these
 * removes the instance from the *choices*; the instance stays addressable, because
 * being unable to say a thing's name is not a reason to be unable to point at it.
 */
const SECRET_SHAPED: readonly RegExp[] = [
  // Provider key shapes. The separator repeats — `sk_live_9f2a71b3c4d5` is what
  // almost every provider ships — and a pattern anchored on a single underscore
  // misses it. One did, and the value reached a choice label.
  // No leading word boundary: concatenated DOM text produces `keysk_live_…`,
  // where the prefix is welded to the previous word and a boundary never
  // matches. That is exactly how a secret slipped past this line once.
  /(sk|pk|api|key|tok|tkn|sess|pat|ghp|priv)[-_][A-Za-z0-9_-]{6,}/i,
  /\b[A-Fa-f0-9]{32,}\b/,
  /\beyJ[A-Za-z0-9_-]{4,}\./,
  /^\s*(bearer|basic|token)\s+\S{8,}/i,
  /^[A-Za-z0-9+/]{24,}={0,2}$/,
  // A sensitive word welded into an unbroken string. This is the rule that took
  // the most care to get right: `Reset password` is a control somebody labelled
  // and must stay displayable, while `hunter2password` is a value that happens
  // to be rendered. Whitespace is the only signal available without reading the
  // thing, so a *phrase* is a label and a *token* is a value.
  /^\S*(password|passwd|pwd|secret|apikey)\S*$/i,
];

/** Whether a runtime name may be shown to a user. */
export function isDisplayableInstanceName(name: string | undefined): name is string {
  if (name === undefined) return false;
  const text = name.trim();
  if (text.length === 0 || text.length > 64) return false;
  return !SECRET_SHAPED.some((pattern) => pattern.test(text));
}

/** The concept nouns this bundle has earned, anywhere. */
export function supportedConceptNouns(bundle: GuideKnowledgeBundle): Set<string> {
  const nouns = new Set<string>();
  for (const feature of bundle.features) for (const noun of feature.conceptNouns) nouns.add(noun);
  return nouns;
}

/**
 * The concept nouns established *on this route*.
 *
 * Route-scoped because evidence is. The claim that establishes "invoice" belongs
 * to a feature reachable on `/invoices`; on a client's own screen that feature is
 * not there and nothing else speaks for those rows.
 */
export function conceptNounsOnRoute(
  bundle: GuideKnowledgeBundle,
  route: string | undefined,
): Set<string> {
  const nouns = new Set<string>();
  if (route === undefined) return nouns;
  for (const feature of bundle.features) {
    if (!feature.routes.some((candidate) => routeMatches(candidate, route))) continue;
    for (const noun of feature.conceptNouns) nouns.add(noun);
  }
  return nouns;
}

/** Content words of a question, with the filler removed. */
const STOP = new Set([
  'the',
  'a',
  'an',
  'i',
  'do',
  'how',
  'what',
  'where',
  'why',
  'can',
  'cannot',
  'see',
  'is',
  'are',
  'to',
  'me',
  'show',
  'my',
  'this',
  'that',
  'it',
  'in',
  'on',
  'of',
  'for',
  'and',
  'or',
  'with',
  'does',
  'get',
  'find',
  'use',
  'open',
  'view',
  'look',
  'at',
  'there',
  'here',
  'now',
  'you',
  'your',
  'please',
  'help',
  'cant',
  'one',
  'which',
]);

function contentWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/["'?.,!]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

/** Singular and plural, so "invoices" finds "invoice". */
function matchesNoun(word: string, noun: string): boolean {
  return word === noun || word === `${noun}s` || `${word}s` === noun;
}

/** Why instances could not be offered. Diagnostic only. */
export type InstanceRefusal =
  | 'NO_CONCEPT_IN_QUERY'
  | 'CONCEPT_NOT_ESTABLISHED_HERE'
  | 'NO_INSTANCES_PRESENT'
  | 'STALE_SNAPSHOT'
  | 'NAMES_NOT_DISPLAYABLE'
  | 'AMBIGUOUS_NAMES'
  | 'AMBIGUOUS_COLLECTION';

/** What {@link resolveRuntimeChoices} decided. */
export interface InstanceResolution {
  choices: readonly GuideRuntimeChoice[];
  /** Instances present and unnameable, so a lone choice is not the whole story. */
  withheldForPrivacy?: number;
  /** The concept the choices were offered against. */
  concept?: string;
  refusal?: InstanceRefusal;
  detail?: string;
}

/**
 * The instances a question could be about, or a named reason there are none.
 *
 * Every condition below is a way this can go wrong that would look fine in a
 * screenshot, which is why each is checked rather than assumed.
 */
export function resolveRuntimeChoices(
  bundle: GuideKnowledgeBundle,
  query: string,
  context: GuideQueryContext,
): InstanceResolution {
  const instances = context.runtimeInstances ?? [];
  const words = contentWords(query);
  const established = conceptNounsOnRoute(bundle, context.route);

  const concept = [...established].find((noun) => words.some((word) => matchesNoun(word, noun)));
  if (concept === undefined) {
    const anywhere = [...supportedConceptNouns(bundle)].find((noun) =>
      words.some((word) => matchesNoun(word, noun)),
    );
    return anywhere === undefined
      ? { choices: [], refusal: 'NO_CONCEPT_IN_QUERY' }
      : {
          choices: [],
          refusal: 'CONCEPT_NOT_ESTABLISHED_HERE',
          detail: `"${anywhere}" is a concept this product has earned, and nothing on ${context.route ?? 'this screen'} establishes it here.`,
        };
  }

  if (instances.length === 0) {
    return { choices: [], concept, refusal: 'NO_INSTANCES_PRESENT' };
  }

  // A reference from a different snapshot describes a screen that has moved on.
  const fresh = instances.filter(
    (instance) =>
      context.snapshotId === undefined ||
      instance.snapshotId === undefined ||
      instance.snapshotId === context.snapshotId,
  );
  if (fresh.length === 0) return { choices: [], concept, refusal: 'STALE_SNAPSHOT' };

  const onRoute = fresh.filter(
    (instance) => context.route === undefined || routeMatches(instance.route, context.route),
  );

  // Which of the things on screen are *instances* at all.
  //
  // Structural, and grounded in the bundle rather than in names: an instance is a
  // control the product model knows, appearing more than once, inside a
  // container. That is what a list of items looks like from outside — the same
  // semantic id repeated with different content. Everything else on the page is
  // furniture, and including it made two unrelated rows collide on a name and
  // refuse the whole question.
  const controls = new Set(
    bundle.features.flatMap((feature) => feature.controls.map((control) => control.semanticId)),
  );
  const bySemanticId = new Map<string, RuntimeInstanceRef[]>();
  for (const instance of onRoute) {
    if (!controls.has(instance.semanticId)) continue;
    if (instance.containerSemanticId === undefined) continue;
    bySemanticId.set(instance.semanticId, [
      ...(bySemanticId.get(instance.semanticId) ?? []),
      instance,
    ]);
  }
  const groups = [...bySemanticId.values()].filter((group) => group.length > 1);
  if (groups.length === 0) return { choices: [], concept, refusal: 'NO_INSTANCES_PRESENT' };
  if (groups.length > 1) {
    return {
      choices: [],
      concept,
      refusal: 'AMBIGUOUS_COLLECTION',
      detail: `${groups.length} repeated controls are on this screen and nothing says which of them the question is about.`,
    };
  }
  const candidates = groups[0]!;
  const displayable = candidates.filter((instance) =>
    isDisplayableInstanceName(instance.runtimeAccessibleName),
  );
  if (displayable.length === 0) {
    return {
      choices: [],
      concept,
      refusal: 'NAMES_NOT_DISPLAYABLE',
      detail: 'Instances are present and none carries a name that may be shown.',
    };
  }

  // A name is not identity. If two instances share one, the name cannot pick
  // between them and offering it as a label would be offering a coin flip.
  const byName = new Map<string, RuntimeInstanceRef[]>();
  for (const instance of displayable) {
    const name = instance.runtimeAccessibleName!.trim();
    byName.set(name, [...(byName.get(name) ?? []), instance]);
  }
  const duplicated = [...byName.entries()].filter(([, group]) => group.length > 1);
  if (duplicated.length > 0) {
    return {
      choices: [],
      concept,
      refusal: 'AMBIGUOUS_NAMES',
      detail: `${duplicated.map(([name]) => `"${name}"`).join(', ')} names more than one thing on screen, so the name cannot identify one.`,
    };
  }

  const choices = displayable
    .map((instance) => ({ label: instance.runtimeAccessibleName!.trim(), instance }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));

  // Whether anything was removed for privacy changes what a single remaining
  // choice means. One of one is the answer; one of three, with two withheld, is
  // *the only one that can be named* — offering it as the answer would imply the
  // others are not there.
  const withheld = candidates.length - displayable.length;
  return { choices, concept, ...(withheld > 0 ? { withheldForPrivacy: withheld } : {}) };
}

/**
 * A context safe to put in developer diagnostics.
 *
 * The inspector is a development aid and not an exemption. A raw runtime name
 * that may not be shown to a user may not be shown to a developer either — it is
 * the same value in the same page, and Closed Loop #14's own secret rule says so.
 * The instance stays in the diagnostics with its identity intact; only the name
 * is replaced.
 */
export function redactContextForDiagnostics(context: GuideQueryContext): GuideQueryContext {
  const instances = context.runtimeInstances;
  if (instances === undefined) return context;
  return {
    ...context,
    runtimeInstances: instances.map((instance) =>
      isDisplayableInstanceName(instance.runtimeAccessibleName)
        ? instance
        : { ...instance, runtimeAccessibleName: '[redacted]' },
    ),
  };
}

/** The chosen instance, if the reference still describes something present. */
export function selectedInstance(context: GuideQueryContext): RuntimeInstanceRef | undefined {
  const chosen = context.selectedInstanceRef;
  if (chosen === undefined) return undefined;
  // Re-resolved against what is on screen now, never remembered independently.
  // A reference that no longer matches an observed instance is simply gone — and
  // "observed" includes *where*: a handle taken on the invoice list does not
  // describe anything after the user has walked to settings, and honouring it
  // there would point at whatever happens to share the ordinal.
  return (context.runtimeInstances ?? []).find(
    (instance) =>
      instance.ref === chosen &&
      (context.route === undefined || routeMatches(instance.route, context.route)) &&
      (context.snapshotId === undefined ||
        instance.snapshotId === undefined ||
        instance.snapshotId === context.snapshotId),
  );
}
