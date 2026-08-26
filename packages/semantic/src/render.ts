/**
 * Prose rendering, and the authority it is deliberately denied.
 *
 * Rendering is the last place a fact could re-enter the pipeline, and it is the
 * easiest place to lose one by accident. Everything upstream is careful: a
 * candidate comes from code, a pack is bounded, a claim is checked against the
 * verification matrix, a refusal is recorded. Then a renderer is handed "the
 * feature" and writes a paragraph — and if that renderer can see the evidence,
 * the graph, or the model's own free-form description, every one of those
 * guarantees is worth exactly nothing, because the paragraph is what a person
 * actually reads.
 *
 * So the seam is drawn at the input, not at the output:
 *
 * > A renderer receives accepted structured claims and nothing else.
 *
 * No {@link EvidencePack}, no `ApplicationGraph`, no repository text, and not
 * the description the model wrote. **A renderer cannot reintroduce a rejected
 * assertion because it never sees one.** That is a property of the type, not a
 * rule someone has to remember, and it is why
 * {@link ProseRenderRequest.claims} is documented as accepted-only and filtered
 * again here anyway.
 *
 * ## The deterministic renderer is the authority
 *
 * {@link createDeterministicRenderer} is the default and the authoritative docs
 * projection. It composes sentences from claim *assertions* — the machine-
 * checkable fields the verifier actually checked — by template. It never
 * concatenates {@link ProductClaim.text}, and it never reads
 * {@link ClaimAssertion.subjectLabel}: both are free text a model chose, and a
 * label reading "the CSV import module" would put an unverifiable capability
 * into a sentence that otherwise came from a verified `create` claim.
 *
 * The consequence is that its vocabulary is nearly closed, and it is worth being
 * exact about the "nearly". Verbs come from {@link CapabilityAction}. Routes and
 * permissions were matched against the pack verbatim *and* against the facts the
 * claim itself cited. Nouns are derived from `subjectRef` and from the feature's
 * own routes — identities rather than phrases, and identities the verifier
 * resolved inside this feature's evidence.
 *
 * So exactly two kinds of word can reach a rendered sentence: one of the
 * templates', or one an identity in this feature's own neighbourhood contains.
 * A model cannot introduce a word here, because a model does not choose an
 * identity; a *developer* can, by naming a button `clients.bulk-export`, and
 * then the page will say "bulk export". That is the application describing
 * itself, which is the only vocabulary this renderer was ever meant to have.
 *
 * Output is therefore exact, testable byte for byte, and scores zero introduced
 * propositions under `./proposition.ts`.
 *
 * ## On a model-backed renderer
 *
 * There is none in this package, and that is a decision rather than an omission.
 * A second generation pass would produce nicer prose and would reopen exactly
 * the hole the pipeline exists to close, so shipping one marked "experimental"
 * would mean shipping the failure mode with a label on it.
 *
 * {@link ProseRenderer} is nonetheless an interface, because a consuming
 * application may have a reason we do not. One that is safe has to hold three
 * properties, and `./proposition.ts` exists to test the first:
 *
 * 1. It rephrases only. It adds no workflow step, permission, route, effect or
 *    capability that is not already in an accepted claim.
 * 2. Its output is used as `description` text only — never as a source of
 *    routes, permissions, elements or workflow targets, which are facts and come
 *    from the graph.
 * 3. It is not the default, and a reader can tell which renderer wrote a page:
 *    {@link ProseRenderer.name} is recorded.
 *
 * @packageDocumentation
 */

import type {
  CapabilityAction,
  ProductClaim,
  ProductFeature,
  ProductWorkflow,
} from '@statewavedev/guide-shared';
import { compareStrings } from './compare.js';

/** What a renderer is given. Deliberately small. */
export interface ProseRenderRequest {
  /**
   * The feature being described.
   *
   * Its factual fields — `routes`, `permissions`, `elements`, `entryPoints` —
   * are graph facts and may be used. Its `description` is empty by construction:
   * the pipeline does not hand a renderer the prose it is replacing.
   */
  feature: ProductFeature;
  /**
   * The feature's claims, **accepted only**.
   *
   * A rejected claim never appears here. Implementations should nonetheless
   * filter defensively — this one does — because a guarantee that depends on
   * every caller getting it right is not a guarantee.
   */
  claims: ProductClaim[];
  /** The feature's workflow, when it has one. */
  workflow?: ProductWorkflow;
}

/** What a renderer produces. Language, never facts. */
export interface ProseRenderer {
  /** Recorded so a reader can tell which renderer wrote a description. */
  readonly name: string;
  render(request: ProseRenderRequest): Promise<{ description: string; workflowIntro?: string }>;
}

/** The name {@link createDeterministicRenderer} reports. */
export const DETERMINISTIC_RENDERER_NAME = 'deterministic';

// ---------------------------------------------------------------------------
// Subject phrasing
// ---------------------------------------------------------------------------

/**
 * The order capability phrases are listed in.
 *
 * Fixed rather than derived from the claims, so two runs whose model returned
 * the same claims in a different order still produce the same sentence.
 */
const ACTION_ORDER: readonly CapabilityAction[] = [
  'create',
  'view',
  'update',
  'delete',
  'submit',
  'navigate',
  'search',
  'export',
  'import',
  'send',
];

/**
 * Trailing identifier segments that name a control rather than a thing.
 *
 * `clients.create` is a button id; the noun in it is `clients`, and `create` is
 * already carried by the claim's `action`. Dropping these is what turns
 * "create clients create" into "create a new client".
 */
const STRUCTURAL_SEGMENTS = new Set<string>([
  ...ACTION_ORDER,
  'add',
  'button',
  'cancel',
  'close',
  'dialog',
  'edit',
  'field',
  'form',
  'input',
  'link',
  'list',
  'menu',
  'modal',
  'new',
  'open',
  'page',
  'panel',
  'remove',
  'save',
  'screen',
  'section',
  'tab',
  'table',
  'view',
]);

/** Node-id prefixes, so a subject that names a node still yields a noun. */
const NODE_KIND_PREFIXES: readonly string[] = [
  'api',
  'component',
  'element',
  'file',
  'function',
  'hook',
  'permission',
  'route',
  'schema',
  'service',
  'type',
];

/** HTTP method segments, dropped from an `api:` subject. */
const METHOD_SEGMENTS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

/** `feature:` prefixed subject references name a candidate the pipeline proposed. */
const FEATURE_PREFIX = 'feature:';

/**
 * Splits a subject reference into words, from its **identity** alone.
 *
 * Never from `subjectLabel`. The label is free text a model wrote; the reference
 * is something the verifier resolved, which is the only half of the assertion
 * that earned the right to appear in a sentence.
 */
function subjectSegments(subjectRef: string): string[] {
  let rest = subjectRef;
  if (rest.startsWith(FEATURE_PREFIX)) {
    rest = rest.slice(FEATURE_PREFIX.length);
  } else {
    const colon = rest.indexOf(':');
    if (colon > 0 && NODE_KIND_PREFIXES.includes(rest.slice(0, colon))) {
      rest = rest.slice(colon + 1);
    }
  }
  // A component or function id carries its file path in front of a `#`; the
  // symbol after it is the readable half.
  const hash = rest.lastIndexOf('#');
  if (hash !== -1) rest = rest.slice(hash + 1);

  return rest
    .split(/[.:/\\#]+/)
    .map((segment) => segment.replace(/^[:*?]+/, '').trim())
    .filter((segment) => segment !== '' && !METHOD_SEGMENTS.has(segment.toLowerCase()))
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .toLowerCase()
        .trim(),
    )
    .filter((segment) => segment !== '');
}

/**
 * A readable noun phrase for a subject.
 *
 * Structural segments are dropped from the tail while at least one remains, so
 * `admin.clients.create` reads "admin clients" and `clients.create` reads
 * "clients". A reference that is nothing but structure keeps its last segment
 * rather than becoming empty — a sentence with a hole in it is worse than a
 * clumsy one.
 */
function subjectPhrase(subjectRef: string): string {
  const segments = subjectSegments(subjectRef);
  if (segments.length === 0) return 'this feature';
  const kept = [...segments];
  while (kept.length > 1) {
    const last = kept[kept.length - 1];
    if (last === undefined || !STRUCTURAL_SEGMENTS.has(last)) break;
    kept.pop();
  }
  return kept.join(' ');
}

/**
 * A title for a feature that has to be named without the model's help.
 *
 * Built from the feature id and nothing else, so it can assert nothing: an
 * identifier is a fact the pipeline minted from the graph. It reads worse than a
 * generated title, which is the point — it is only ever used when the generated
 * one was refused, and a slightly wooden heading is a much smaller cost than a
 * heading that claims a capability.
 */
export function featureTitleFromId(featureId: string): string {
  const segments = subjectSegments(featureId);
  if (segments.length === 0) return 'Untitled feature';
  const phrase = segments.join(' ');
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
}

/**
 * A crude singular.
 *
 * English-only and knowingly imperfect: it exists so "create a new client"
 * reads better than "create a new clients", and it is applied only to the verbs
 * that act on one thing at a time. Nothing downstream resolves it — it is a
 * rendering convenience, and an odd-looking singular costs a reader a raised
 * eyebrow rather than a wrong fact.
 */
function singularise(phrase: string): string {
  const space = phrase.lastIndexOf(' ');
  const head = space === -1 ? '' : `${phrase.slice(0, space)} `;
  const word = space === -1 ? phrase : phrase.slice(space + 1);

  if (/ies$/.test(word) && word.length > 3) return `${head}${word.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes|zes)$/.test(word)) return `${head}${word.slice(0, -2)}`;
  if (/ss$/.test(word) || /us$/.test(word) || !/s$/.test(word)) return `${head}${word}`;
  return `${head}${word.slice(0, -1)}`;
}

/**
 * How each verb reads in front of its subject.
 *
 * A total map over {@link CapabilityAction}, so adding a verb to the contract
 * fails the build here rather than silently rendering as nothing. `export`,
 * `import` and `send` are present even though the built-in matrix can never
 * uphold them: an application that registers a verifier for one of them gets a
 * sentence rather than a gap.
 */
const ACTION_TEMPLATES: Record<CapabilityAction, (phrase: string) => string> = {
  create: (phrase) => `create a new ${singularise(phrase)}`,
  view: (phrase) => `view ${phrase}`,
  update: (phrase) => `update a ${singularise(phrase)}`,
  delete: (phrase) => `delete a ${singularise(phrase)}`,
  submit: (phrase) => `submit the ${singularise(phrase)} form`,
  navigate: (phrase) => `open ${phrase}`,
  search: (phrase) => `search ${phrase}`,
  export: (phrase) => `export ${phrase}`,
  import: (phrase) => `import ${phrase}`,
  send: (phrase) => `send ${phrase}`,
};

// ---------------------------------------------------------------------------
// Sentence assembly
// ---------------------------------------------------------------------------

/** `a`, `a and b`, `a, b and c`. Serial comma deliberately absent. */
function joinList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? '';
  const head = values.slice(0, -1).join(', ');
  return `${head} and ${values[values.length - 1] ?? ''}`;
}

/** `clients` → `Clients`, `client-list` → `Client List`. */
function humanise(segment: string): string {
  return segment
    .split(/[-_\s]+/)
    .filter((word) => word !== '')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/**
 * ` from the Clients screen`, when the feature has an unparameterised route.
 *
 * Routes with a `:param` segment are skipped: `/clients/:clientId` is a screen a
 * user reaches by picking a row, not one they can be told to open, and naming it
 * as though it were would be an instruction that does not work.
 */
function screenSuffix(routes: readonly string[]): string {
  const plain = routes.filter((route) => !route.includes(':') && !route.includes('*'));
  const first = [...plain].sort(compareStrings)[0];
  if (first === undefined) return '';
  if (first === '/') return ' from the home screen';
  const segments = first.split('/').filter((segment) => segment !== '');
  const last = segments[segments.length - 1];
  if (last === undefined) return ' from the home screen';
  return ` from the ${humanise(last)} screen`;
}

/** One capability phrase, with the action that produced it, for stable ordering. */
interface CapabilityPhrase {
  action: CapabilityAction;
  phrase: string;
}

/** Distinct capability phrases, ordered by verb and then alphabetically. */
function capabilityPhrases(claims: readonly ProductClaim[]): CapabilityPhrase[] {
  const seen = new Map<string, CapabilityPhrase>();
  for (const claim of claims) {
    if (claim.type !== 'capability') continue;
    const action = claim.assertion?.action;
    const subjectRef = claim.assertion?.subjectRef;
    if (action === undefined || subjectRef === undefined) continue;
    const phrase = ACTION_TEMPLATES[action](subjectPhrase(subjectRef));
    // NUL separates the halves because it can appear in neither, so no two
    // distinct pairs can collide on one key.
    const key = `${action}\u0000${phrase}`;
    if (!seen.has(key)) seen.set(key, { action, phrase });
  }
  return [...seen.values()].sort(
    (a, b) =>
      ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) ||
      compareStrings(a.phrase, b.phrase),
  );
}

/** Distinct, sorted values of one assertion field across claims of one type. */
function assertedValues(
  claims: readonly ProductClaim[],
  type: ProductClaim['type'],
  field: 'route' | 'permission',
): string[] {
  const values = new Set<string>();
  for (const claim of claims) {
    if (claim.type !== type) continue;
    const value = claim.assertion?.[field];
    if (value !== undefined && value !== '') values.add(value);
  }
  return [...values].sort(compareStrings);
}

/**
 * The sentence used when nothing the *description* is built from was verified.
 *
 * Deliberately narrow. The description is assembled from `capability`,
 * `navigation`, `permission` and `constraint` claims; `workflow_step` claims
 * feed the workflow section instead. So a feature can reach here with verified
 * workflow steps, and saying "nothing has been verified" would be false —
 * precisely the kind of overstatement this pipeline exists to avoid, pointed the
 * other way.
 */
export const NO_VERIFIED_DESCRIPTION =
  'No capability, route or permission has been verified for this feature.';

/**
 * Creates the default renderer.
 *
 * Pure and synchronous inside an async signature: the same request produces the
 * same bytes, on every machine and in every run, which is what lets a test
 * assert the exact sentence a user will read.
 */
export function createDeterministicRenderer(): ProseRenderer {
  return {
    name: DETERMINISTIC_RENDERER_NAME,
    render(request: ProseRenderRequest): Promise<{ description: string; workflowIntro?: string }> {
      // Filtered again even though the contract says accepted-only. The whole
      // safety argument of this module is "it never sees a rejected claim", and
      // that should not depend on every caller remembering.
      const accepted = request.claims.filter((claim) => claim.status !== 'rejected');

      const capabilities = capabilityPhrases(accepted);
      const routes = assertedValues(accepted, 'navigation', 'route');
      const permissions = assertedValues(accepted, 'permission', 'permission');
      const constrained = accepted.some((claim) => claim.type === 'constraint');

      const sentences: string[] = [];
      if (capabilities.length > 0) {
        const phrases = capabilities.map((entry) => entry.phrase);
        sentences.push(`You can ${joinList(phrases)}${screenSuffix(request.feature.routes)}.`);
      }
      if (routes.length > 0) {
        sentences.push(`It is reached at ${joinList(routes)}.`);
      }
      if (permissions.length > 0) {
        sentences.push(
          `It requires the ${joinList(permissions)} permission${permissions.length === 1 ? '' : 's'}.`,
        );
      }
      if (constrained) {
        // A constraint claim is upheld only against a schema, a `validates_with`
        // edge or a permission requirement, so "validated" is the strongest
        // thing the rule actually establishes — and the sentence says no more.
        sentences.push('Input is validated before it is accepted.');
      }
      if (sentences.length === 0) sentences.push(NO_VERIFIED_DESCRIPTION);

      const description = sentences.join(' ');
      const steps = request.workflow?.steps.length ?? 0;
      if (steps === 0) return Promise.resolve({ description });

      const lead = capabilities[0];
      const workflowIntro =
        lead === undefined ? 'The steps below follow this feature.' : `To ${lead.phrase}:`;
      return Promise.resolve({ description, workflowIntro });
    },
  };
}
