/**
 * The one entry point a UI calls.
 *
 * Everything here is assembly: it selects already-compiled guidance, prunes
 * steps the current context has already satisfied, and points at things by
 * semantic id. It writes no sentences of its own. The single exception is the
 * short, fixed messages attached to ambiguity and refusal, which name nothing
 * about the product.
 *
 * The last thing it does before returning is check its own work — every
 * sentence traceable to stored guidance, every route verified, every action
 * target known, every omission justified. That pass exists because assembly is
 * exactly where an invented name would be cheapest to introduce and hardest to
 * notice.
 *
 * @packageDocumentation
 */

import type {
  GuideAnswer,
  GuideAnswerCondition,
  GuideAnswerStep,
  GuideConditionStatus,
  GuidePrunedStep,
  GuideStepPerformance,
  GuideQueryContext,
  GuideQueryDiagnostics,
  GuideQueryIntent,
  GuideQueryPlan,
  GuideQueryRequest,
  GuideQueryResponse,
  GuideSafeAction,
} from './contract.js';
import { GUIDE_QUERY_CONTRACT_VERSION, GUIDE_SAFE_ACTION_KINDS } from './contract.js';
import type { GuideControl, GuideFeatureEntry, GuideKnowledgeBundle } from './bundle.js';
import { controlIndex, featureEntry, routeMatches } from './bundle.js';
import { classifyIntent } from './intent.js';
import { authorisedScreenName } from './screen-name.js';
import { resolveFeature } from './resolve.js';
import { describeVisualContext } from './visual-context.js';
import {
  isDisplayableInstanceName,
  redactContextForDiagnostics,
  resolveRuntimeChoices,
  selectedInstance,
} from './instances.js';
import type { GuideQueryProvider } from './provider.js';

/** What {@link createGuideQueryEngine} needs. */
export interface GuideQueryEngineOptions {
  bundle: GuideKnowledgeBundle;
  /**
   * Optional language help.
   *
   * May classify a question and choose among candidates this layer already
   * resolved. May not add a feature, a route, a semantic id, an action or a
   * sentence — anything it returns that is not already known is discarded, and
   * the discard is recorded rather than silently tolerated.
   */
  provider?: GuideQueryProvider;
}

/** The public surface. */
export interface GuideQueryEngine {
  query(request: GuideQueryRequest): GuideQueryResponse;
  getFeature(featureId: string): GuideFeatureEntry | undefined;
  getGuidance(featureId: string): GuideFeatureEntry['guidance'] | undefined;
  listFeatures(): readonly string[];
}

/** Whether the supplied context describes the application this bundle knows. */
function freshness(
  bundle: GuideKnowledgeBundle,
  context: GuideQueryContext,
): GuideQueryPlan['contextFreshness'] {
  // Never a clock. A snapshot is not stale because it is old; it is stale
  // because it describes a different build, or a route this bundle has never
  // heard of. Both are decidable, and "how long ago" is not.
  if (context.applicationVersion !== undefined) {
    return context.applicationVersion === bundle.applicationVersion ? 'FRESH' : 'STALE';
  }
  if (context.route !== undefined) {
    const known = bundle.screens.some((screen) => routeMatches(screen.route, context.route!));
    return known ? 'FRESH' : 'STALE';
  }
  return 'UNKNOWN';
}

/**
 * The steps a user still needs, and the ones the context has already satisfied.
 *
 * Pruning is deterministic and conservative. A step comes out only when the
 * context *proves* its precondition — the route is already reached, or the
 * control it names is already visible — and never because it looked redundant.
 * A task action is never removed. Every omission is recorded with its reason so
 * that "the guide skipped a step" is always answerable.
 *
 * The third reason is Closed Loop #12's own: an entry step whose screen name has
 * no user-visible source is withheld rather than spoken, because *"Open Client
 * Detail"* names a screen the application never calls that.
 */
function contextualise(
  bundle: GuideKnowledgeBundle,
  feature: GuideFeatureEntry,
  context: GuideQueryContext,
  controls: Map<string, GuideControl>,
): { steps: GuideAnswerStep[]; pruned: GuidePrunedStep[] } {
  const steps: GuideAnswerStep[] = [];
  const pruned: GuidePrunedStep[] = [];

  for (const [position, step] of feature.steps.entries()) {
    // Whether the *procedure* continues, read from what was compiled rather
    // than from what survived pruning: a trigger does not stop opening a dialog
    // because the reader happened to be on the right screen already.
    const opensMore = position < feature.steps.length - 1;
    const text = step.text;
    const target =
      step.semanticId !== undefined && controls.has(step.semanticId) ? step.semanticId : undefined;

    if (step.origin === 'synthetic-entry') {
      const route = step.screenRoute ?? feature.entryRoute ?? feature.routes[0];
      const authorised = authorisedScreenName(bundle, route);
      const speakable = authorised !== undefined && authorised.name === step.screenName;

      // The name is settled before anything else uses the sentence. Deciding
      // "already there" first would put the stored text into `pruned`, and a
      // pruned step is still part of the response — "Open Client Detail" would
      // have reached a UI through the field that exists to explain omissions.
      const shown = speakable
        ? `Open ${authorised.name}.`
        : route === undefined
          ? 'Go to the screen this is on.'
          : `Go to ${route}.`;

      if (
        context.route !== undefined &&
        feature.routes.some((candidate) => routeMatches(candidate, context.route!))
      ) {
        pruned.push({
          text: shown,
          reason: 'ROUTE_ALREADY_REACHED',
          detail: `The user is already on ${context.route}.`,
        });
        continue;
      }
      if (!speakable) {
        pruned.push({
          text: shown,
          reason: 'SCREEN_NAME_UNSUPPORTED',
          detail:
            `Nothing a user can see names ${route ?? 'that screen'}, so it is not named here. ` +
            'The stored step takes its name from a route identifier.',
        });
        continue;
      }
      steps.push({ text: shown, performance: stepPerformance(step, undefined, opensMore) });
      continue;
    }

    // A task action is never pruned, whatever the context shows. Being able to
    // see a control is not the same as having pressed it, and the terminal step
    // of a procedure is the one a user most needs to be told about — Closed Loop
    // #13 shipped a create-client answer that opened a dialog, filled three
    // fields, and never mentioned submitting it.
    //
    // Nothing being *told* to a user depends on whether a guide can press it for
    // them: instruction and automation permission are different questions, and
    // `Choose "Create client"` is displayed precisely because the guide will
    // never click it.
    if (target === undefined) {
      steps.push({ text, performance: stepPerformance(step, undefined, opensMore) });
      continue;
    }

    // The pointing sequence for this step, offered only for a control this
    // feature owns — the same rule the response-level actions obey. A step
    // naming a control the feature does not own is a sentence, never an offer
    // to point.
    const owned = controls.get(target);
    const stepLabel =
      owned?.nameable === true && owned.label !== undefined ? { label: owned.label } : {};
    // The callout beside the ring says the same sentence the panel is showing.
    // Both halves are already-authorised prose: the heading is the control's
    // supported name, and the body is this step, verbatim. Nothing is composed.
    const stepCallout =
      owned?.nameable === true && owned.label !== undefined
        ? { title: owned.label, message: text }
        : { message: text };
    const stepActions: GuideSafeAction[] =
      owned === undefined
        ? []
        : [
            { kind: 'scroll', semanticId: target, ...stepLabel },
            { kind: 'highlight', semanticId: target, ...stepLabel, ...stepCallout },
          ];

    const performance = stepPerformance(step, target, opensMore);
    steps.push(
      stepActions.length === 0
        ? { text, semanticId: target, performance }
        : { text, semanticId: target, actions: stepActions, performance },
    );
  }
  return { steps, pruned };
}

/**
 * What a step consists of, decided from what it was compiled as.
 *
 * The four roles the compiler emits are not decoration — they are the record of
 * *why* a step exists, and two of them mark work nobody but the user may do.
 * Reading the role is how this stays a structural rule rather than a guess
 * about what a button is likely to do: no heuristics on labels, no probing the
 * DOM for a `type="submit"`, nothing that a rename could quietly flip.
 *
 * An unrecognised role is refused, not allowed. A compiler that grows a fifth
 * role should have to come here and say what it means.
 */
function stepPerformance(
  step: GuideFeatureEntry['steps'][number],
  target: string | undefined,
  opensMore: boolean,
): GuideStepPerformance {
  const on = target === undefined ? {} : { semanticId: target };

  if (step.role === 'entry') return { kind: 'NAVIGATE', ...on, byGuide: 'ALLOWED' };

  if (step.role === 'input') {
    // The one thing a guide can never supply. Even where the value looks
    // obvious — a plan, a default — it is the user's record being written.
    return { kind: 'TYPE', ...on, byGuide: 'REFUSED', refusedBecause: 'SUPPLIES_DATA' };
  }

  if (step.role === 'confirmation') {
    // The step the whole task exists to reach. Pressing it is the change.
    return { kind: 'PRESS', ...on, byGuide: 'REFUSED', refusedBecause: 'COMMITS_A_CHANGE' };
  }

  if (step.role === 'trigger') {
    // A trigger is only "reveals the task" while something comes after it. With
    // nothing following, the trigger *is* the task: `clients.export` is a lone
    // trigger, and pressing it does not open a dialog somebody can close — it
    // downloads the file. An exploratory run asked "where is Export CSV?" and
    // the guide exported the clients, which is the same class of mistake as
    // pressing Create client and exactly as unwelcome.
    //
    // So the shape of the procedure decides it, not the label on the control.
    // A trigger with later steps opens something; a trigger alone commits, and
    // gets the reason that already exists for committing.
    if (!opensMore) {
      return target === undefined
        ? { kind: 'PRESS', byGuide: 'REFUSED', refusedBecause: 'NO_CONTROL_TO_PRESS' }
        : {
            kind: 'PRESS',
            semanticId: target,
            byGuide: 'REFUSED',
            refusedBecause: 'COMMITS_A_CHANGE',
          };
    }
    // Reveals the task rather than completing it: a dialog that opens, a form
    // that expands, both undone by closing them. This is the only role a guide
    // may act on, and only when this feature owns the control — pressing
    // something a feature does not own is pressing something nobody verified.
    return target === undefined
      ? { kind: 'PRESS', byGuide: 'REFUSED', refusedBecause: 'NO_CONTROL_TO_PRESS' }
      : { kind: 'PRESS', semanticId: target, byGuide: 'ALLOWED' };
  }

  return { kind: 'PRESS', ...on, byGuide: 'REFUSED', refusedBecause: 'NO_CONTROL_TO_PRESS' };
}

/**
 * A condition, settled against the runtime where the runtime can settle it.
 *
 * The compiled proposition carries two different things and they are not
 * interchangeable. `permission` is an exact identifier lifted out of the
 * application's own source — `clients:create` — and is what gets compared.
 * `capability` is the prose half — "create a client" — and is only ever used to
 * build a sentence; it is never matched against anything, because matching
 * English to an identifier is the kind of guess this system exists to avoid.
 *
 * Three outcomes, and the third is the default:
 *
 * - the host listed the permission          -> `HELD`
 * - the host listed permissions, not that one -> `NOT_HELD`
 * - the host listed no permissions at all   -> `UNKNOWN`
 *
 * `NOT_HELD` rests on {@link GuideQueryContext.permissions} being complete when
 * present, which is what that field documents at full strength. An absent list
 * asserts nothing and gets the sentence this function has always produced.
 */
function answerCondition(
  condition: GuideFeatureEntry['guidance']['conditions'][number],
  context: GuideQueryContext,
): GuideAnswerCondition | undefined {
  const proposition = condition.proposition as Record<string, unknown>;
  if (proposition['kind'] !== 'requires_permission') return undefined;

  const capability = proposition['capability'];
  const named = typeof capability === 'string' ? capability : undefined;
  const permission = proposition['permission'];

  const held = context.permissions;
  const status: GuideConditionStatus =
    held === undefined || typeof permission !== 'string'
      ? 'UNKNOWN'
      : held.includes(permission)
        ? 'HELD'
        : 'NOT_HELD';

  // A permission identifier is not user-visible language — it is a string from
  // the source, and naming it here would be the same mistake as reading a route
  // out loud. Without a compiled capability phrase the sentence stays general,
  // and says less rather than something unsupported.
  if (status === 'HELD') {
    return {
      text:
        named === undefined
          ? 'You have the permission this needs.'
          : `You have permission to ${named}.`,
      status,
    };
  }
  if (status === 'NOT_HELD') {
    return {
      text:
        named === undefined
          ? 'You do not have the permission this needs.'
          : `You do not have permission to ${named}.`,
      status,
    };
  }
  return {
    text:
      named === undefined ? 'You need permission to do this.' : `You need permission to ${named}.`,
    status,
  };
}

/** Safe actions for an intent, each pointing at something already known. */
function deriveActions(
  bundle: GuideKnowledgeBundle,
  feature: GuideFeatureEntry,
  intent: GuideQueryIntent,
  context: GuideQueryContext,
  semanticId: string | undefined,
  controls: Map<string, GuideControl>,
): { actions: GuideSafeAction[]; derivation: { action: GuideSafeAction; because: string }[] } {
  const actions: GuideSafeAction[] = [];
  const derivation: { action: GuideSafeAction; because: string }[] = [];
  const add = (action: GuideSafeAction, because: string) => {
    actions.push(action);
    derivation.push({ action, because });
  };

  // Any answered question about a feature may offer to point at it. Closed Loop
  // #12 derived actions only for the two locating intents, which left *"How do I
  // filter clients?"* — the whole reason the contract exists — with an answer
  // and nothing to point at. The distinction that matters is not the intent; it
  // is that pointing is inert, so offering it can never be the wrong thing to
  // have made possible.
  if (intent === 'UNKNOWN') return { actions, derivation };

  const route = feature.entryRoute ?? feature.routes[0];
  const onRoute =
    context.route !== undefined &&
    feature.routes.some((candidate) => routeMatches(candidate, context.route!));
  if (route !== undefined && !onRoute) {
    const named = authorisedScreenName(bundle, route);
    add(
      named === undefined
        ? { kind: 'navigate', route }
        : { kind: 'navigate', route, label: named.name },
      named === undefined
        ? `${route} is verified for this feature; no user-visible name exists for it.`
        : `${route} is verified, and "${named.name}" is a ${named.origin}.`,
    );
  }

  // The control to point at: what the user is already pointing at, or the
  // feature's own primary control. Named or not — an action can address a
  // control the interface never names, which is the whole distinction this
  // contract turns on.
  const target =
    semanticId ??
    feature.controls.find((control) => control.nameable)?.semanticId ??
    feature.controls[0]?.semanticId;

  // A target the host says is not on screen is not something to offer to point
  // at. Closed Loop #15 recorded a Show me beside an explanation of why Delete
  // is *absent* — inert, and still an offer to point at nothing. Checked only
  // when the host actually reports presence, and skipped when the sequence will
  // navigate first, because a control on another screen is legitimately not here
  // yet.
  const reportsPresence = context.visibleSemanticIds !== undefined;
  const present =
    !reportsPresence ||
    (context.visibleSemanticIds ?? []).includes(target ?? '') ||
    (context.disabledSemanticIds ?? []).includes(target ?? '');

  if (target !== undefined && controls.has(target) && (present || !onRoute)) {
    const control = controls.get(target)!;
    const label = control.nameable && control.label !== undefined ? control.label : undefined;
    const suffix = label === undefined ? {} : { label };
    add({ kind: 'scroll', semanticId: target, ...suffix }, 'the control is owned by this feature');
    // The callout heading is the control's own supported name, and the body is
    // the feature's compiled purpose. There is no step here to quote — a
    // response-level Show me is "this is the thing", not "do this" — so what it
    // carries is what the thing is *for*. A heading alone beside a button that
    // already reads "New client" says nothing the user cannot see.
    const purpose = feature.guidance.purpose?.text;
    add(
      {
        kind: 'highlight',
        semanticId: target,
        ...suffix,
        ...(label === undefined ? {} : { title: label }),
        ...(purpose === undefined ? {} : { message: purpose }),
      },
      'pointing at it is inert',
    );
    if (intent === 'SHOW_ME' || intent === 'HOW_TO') {
      add({ kind: 'focus', semanticId: target, ...suffix }, 'focus moves attention, not data');
    }
  }
  return { actions, derivation };
}

/** Builds an engine over one compiled bundle. */
export function createGuideQueryEngine(options: GuideQueryEngineOptions): GuideQueryEngine {
  const bundle = options.bundle;
  const controls = controlIndex(bundle);
  const routes = new Set(bundle.screens.map((screen) => screen.route));

  function query(request: GuideQueryRequest): GuideQueryResponse {
    const context = request.context ?? {};
    const refusals: { what: string; reason: string }[] = [];

    let intent = classifyIntent(request.query);
    if (options.provider !== undefined) {
      // A provider is an optional improvement to language understanding, so a
      // provider that is down, slow or broken must cost exactly that improvement
      // and nothing else. The deterministic classification is already in hand.
      let proposed: GuideQueryIntent | undefined;
      try {
        proposed = options.provider.classify?.(request.query);
      } catch {
        refusals.push({ what: 'provider.classify', reason: 'PROVIDER_UNAVAILABLE' });
      }
      // A provider may classify. Anything outside the closed taxonomy is
      // discarded, and the discard is recorded rather than tolerated.
      if (proposed !== undefined) {
        if (proposed === 'UNKNOWN' || classifyIntent('') === proposed) intent = proposed;
        else if (
          (['EXPLAIN', 'HOW_TO', 'WHERE_IS', 'WHY_UNAVAILABLE', 'SHOW_ME'] as const).includes(
            proposed as never,
          )
        ) {
          intent = proposed;
        } else {
          refusals.push({ what: String(proposed), reason: 'INTENT_OUTSIDE_TAXONOMY' });
        }
      }
    }

    const contextFreshness = freshness(bundle, context);
    const base = {
      contractVersion: GUIDE_QUERY_CONTRACT_VERSION,
      intent,
      actions: [] as readonly GuideSafeAction[],
      pruned: [] as readonly GuidePrunedStep[],
    };

    const plan: GuideQueryPlan = { intent, context, contextFreshness };
    const finish = (response: GuideQueryResponse): GuideQueryResponse => {
      if (request.developer !== true) return response;
      const diagnostics: GuideQueryDiagnostics = {
        // The inspector is a development aid, not an exemption from the privacy
        // policy: a name that may not be shown to a user may not be shown here.
        plan: { ...plan, context: redactContextForDiagnostics(plan.context) },
        actionDerivation: derivation,
        refusals,
        provenance,
      };
      return { ...response, diagnostics };
    };
    let derivation: { action: GuideSafeAction; because: string }[] = [];
    let provenance: { text: string; featureId: string; source: string }[] = [];

    if (contextFreshness === 'STALE') {
      refusals.push({ what: 'context', reason: 'SNAPSHOT_DOES_NOT_DESCRIBE_THIS_BUILD' });
      return finish({ ...base, status: 'STALE_CONTEXT' });
    }
    if (intent === 'UNKNOWN') {
      return finish({ ...base, status: 'UNKNOWN' });
    }

    // What is actually on the screen, before anything about product structure.
    // A question naming a concept the user can see instances of is answered with
    // those instances rather than with a guess about which one was meant.
    const chosen = selectedInstance(context);
    const instances = resolveRuntimeChoices(bundle, request.query, context);
    if (instances.refusal !== undefined) {
      refusals.push({ what: 'runtime-instances', reason: instances.refusal });
    }
    // A chosen instance is pointed at, not described. It gets inert actions on
    // its own semantic id and no sentence at all, because nothing verified says
    // what it is — the user picked it off the screen, and the guide's whole
    // contribution is knowing how to find it again.
    if (chosen !== undefined) {
      plan.resolvedInstanceRef = chosen.ref;
      const label = chosen.runtimeAccessibleName;
      const suffix = isDisplayableInstanceName(label) ? { label } : {};
      const actions: GuideSafeAction[] = [
        { kind: 'scroll', semanticId: chosen.semanticId, instanceRef: chosen.ref, ...suffix },
        { kind: 'highlight', semanticId: chosen.semanticId, instanceRef: chosen.ref, ...suffix },
      ];
      if (chosen.ownerFeatureId !== undefined) plan.resolvedFeatureId = chosen.ownerFeatureId;
      return finish({
        ...base,
        status: 'ANSWERED',
        ...(chosen.ownerFeatureId === undefined ? {} : { featureId: chosen.ownerFeatureId }),
        actions,
      });
    }

    // One nameable thing and nothing hidden is not a question. One nameable
    // thing with others withheld is.
    const mustAsk =
      instances.choices.length > 1 ||
      (instances.choices.length === 1 && (instances.withheldForPrivacy ?? 0) > 0);
    if (mustAsk) {
      plan.runtimeConcept = instances.concept;
      return finish({
        ...base,
        status: 'AMBIGUOUS',
        runtimeChoices: instances.choices,
        ambiguity: {
          reason: 'MULTIPLE_TARGETS',
          candidates: [],
          message: 'Which one do you mean?',
        },
      });
    }

    const resolution = resolveFeature(bundle, request.query, context, {
      preferContext: intent === 'EXPLAIN',
    });
    plan.resolutionPath = resolution.path;
    if (resolution.ambiguity !== undefined) {
      plan.ambiguity = resolution.ambiguity;
      return finish({ ...base, status: 'AMBIGUOUS', ambiguity: resolution.ambiguity });
    }
    const feature = resolution.feature;
    if (feature === undefined) {
      return finish({ ...base, status: 'UNSUPPORTED' });
    }
    plan.resolvedFeatureId = feature.featureId;
    plan.resolvedSemanticId = resolution.semanticId;
    plan.resolvedRoute = feature.routes[0];

    const { steps, pruned } = contextualise(bundle, feature, context, controls);
    const conditions = feature.guidance.conditions
      .map((condition) => answerCondition(condition, context))
      .filter((entry): entry is GuideAnswerCondition => entry !== undefined);

    const answer: GuideAnswer = {
      ...(feature.guidance.title?.text === undefined ? {} : { title: feature.guidance.title.text }),
      ...(feature.guidance.purpose?.text === undefined
        ? {}
        : { purpose: feature.guidance.purpose.text }),
      ...(feature.guidance.summary?.text === undefined
        ? {}
        : { summary: feature.guidance.summary.text }),
      steps: intent === 'WHY_UNAVAILABLE' ? [] : steps,
      conditions,
      questions: feature.guidance.questions.map((entry) => entry.text),
    };

    const derived = deriveActions(
      bundle,
      feature,
      intent,
      context,
      resolution.semanticId,
      controls,
    );
    derivation = derived.derivation;

    // Where the thing is, on this screen, when geometry says so exactly.
    // Additive: it never changes what the answer asserts, and it is gone the
    // moment the screen is.
    const pointedAt =
      resolution.semanticId ?? derived.actions.find((action) => 'semanticId' in action)?.semanticId;
    const visualContext = describeVisualContext({ bundle, context, targetSemanticId: pointedAt });

    provenance = [
      ...(answer.title === undefined
        ? []
        : [{ text: answer.title, featureId: feature.featureId, source: 'guidance.title' }]),
      ...(answer.purpose === undefined
        ? []
        : [{ text: answer.purpose, featureId: feature.featureId, source: 'guidance.purpose' }]),
      ...answer.steps.map((step) => ({
        text: step.text,
        featureId: feature.featureId,
        source: 'guidance.steps',
      })),
    ];

    // --- What the answer is allowed to be -----------------------------------
    const problems = verifyResponse({
      bundle,
      feature,
      answer,
      actions: derived.actions,
      routes,
      controls,
    });
    for (const problem of problems) refusals.push({ what: problem.what, reason: problem.reason });
    if (problems.length > 0) {
      return finish({ ...base, status: 'UNSUPPORTED', featureId: feature.featureId, pruned });
    }

    // Pointing at something *is* answering "where is it?" — the locating
    // intents are satisfied by an action, not by prose.
    const said =
      answer.purpose !== undefined ||
      answer.summary !== undefined ||
      answer.steps.length > 0 ||
      derived.actions.length > 0 ||
      (intent === 'WHY_UNAVAILABLE' && answer.conditions.length > 0);

    let status: GuideQueryResponse['status'] = said ? 'ANSWERED' : 'UNSUPPORTED';
    if (said && intent === 'HOW_TO' && answer.steps.length === 0) status = 'PARTIAL';
    if (said && intent === 'WHY_UNAVAILABLE' && answer.conditions.length === 0) status = 'PARTIAL';
    if (said && (intent === 'SHOW_ME' || intent === 'WHERE_IS') && derived.actions.length === 0) {
      status = 'PARTIAL';
    }
    if (said && intent === 'WHY_UNAVAILABLE' && answer.conditions.length === 0) status = 'PARTIAL';

    return finish({
      ...base,
      status,
      featureId: feature.featureId,
      answer,
      actions: derived.actions,
      ...(visualContext === undefined ? {} : { visualContext }),
      pruned,
    });
  }

  return {
    query,
    getFeature: (featureId) => featureEntry(bundle, featureId),
    getGuidance: (featureId) => featureEntry(bundle, featureId)?.guidance,
    listFeatures: () => bundle.features.map((feature) => feature.featureId),
  };
}

/**
 * The answer, checked before anybody sees it.
 *
 * Assembly is where an unsupported name is cheapest to introduce, so nothing
 * leaves without passing: every sentence must appear in the stored guidance,
 * every route must be one the bundle knows, every action must be in the closed
 * union and point at a known target, and nothing may contain a selector.
 */
function verifyResponse(input: {
  bundle: GuideKnowledgeBundle;
  feature: GuideFeatureEntry;
  answer: GuideAnswer;
  actions: readonly GuideSafeAction[];
  routes: ReadonlySet<string>;
  controls: ReadonlyMap<string, GuideControl>;
}): { what: string; reason: string }[] {
  const problems: { what: string; reason: string }[] = [];
  const guidance = input.feature.guidance;

  if (input.answer.title !== undefined && input.answer.title !== guidance.title?.text) {
    problems.push({ what: input.answer.title, reason: 'TITLE_NOT_FROM_GUIDANCE' });
  }
  for (const [field, value] of [
    ['purpose', input.answer.purpose],
    ['summary', input.answer.summary],
  ] as const) {
    if (value === undefined) continue;
    const stored = field === 'purpose' ? guidance.purpose?.text : guidance.summary?.text;
    if (value !== stored) problems.push({ what: value, reason: 'SENTENCE_NOT_FROM_GUIDANCE' });
  }
  for (const question of input.answer.questions) {
    if (!guidance.questions.some((entry) => entry.text === question)) {
      problems.push({ what: question, reason: 'QUESTION_NOT_FROM_GUIDANCE' });
    }
  }
  for (const step of input.answer.steps) {
    if (step.semanticId !== undefined && !input.controls.has(step.semanticId)) {
      problems.push({ what: step.semanticId, reason: 'STEP_TARGET_UNKNOWN' });
    }
  }
  for (const action of input.actions) {
    if (!GUIDE_SAFE_ACTION_KINDS.includes(action.kind)) {
      problems.push({ what: action.kind, reason: 'ACTION_OUTSIDE_CLOSED_UNION' });
      continue;
    }
    if (action.kind === 'navigate' && !input.routes.has(action.route)) {
      problems.push({ what: action.route, reason: 'ROUTE_NOT_VERIFIED' });
    }
    if (
      (action.kind === 'highlight' || action.kind === 'scroll' || action.kind === 'focus') &&
      !input.controls.has(action.semanticId)
    ) {
      problems.push({ what: action.semanticId, reason: 'ACTION_TARGET_UNKNOWN' });
    }
  }

  // No prose may read like an instruction to go and find something. Applied to
  // sentences only: a semantic id contains dots by construction, and it is
  // already checked the strong way — by membership in the bundle, which a
  // fabricated selector could never satisfy.
  const SELECTOR = /querySelector|xpath|::|\[data-|\bdiv\s*>|#[A-Za-z][\w-]*\s*[>.]/i;
  const prose = [
    input.answer.title,
    input.answer.purpose,
    input.answer.summary,
    ...input.answer.steps.map((step) => step.text),
    ...input.answer.conditions.map((condition) => condition.text),
  ].filter((entry): entry is string => entry !== undefined);
  for (const surface of prose) {
    if (SELECTOR.test(surface)) problems.push({ what: surface, reason: 'LOOKS_LIKE_A_SELECTOR' });
  }
  return problems;
}
