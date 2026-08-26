/**
 * The claim verification matrix: what Statewave Guide knows how to check.
 *
 * One central, machine-readable table. Every factual assertion resolves against
 * it, and there is deliberately **no generic fallback** — no
 * `if (claim.targets.length > 0) accept()`. A verifier with a fallback stops
 * being a verifier the moment a model produces something it has no rule for,
 * which is exactly when verification matters most.
 *
 * An assertion the matrix has no rule for resolves to `EXPLICITLY_UNSUPPORTED`
 * and can never become `structurally_verified`. That is failing closed: we do
 * not claim the application cannot do the thing, only that we cannot check
 * whether it can — and those are different, so they are reported differently.
 *
 * @packageDocumentation
 */

import type { CapabilityAction, ProductClaimType } from './semantic.js';

/**
 * What the graph must contain for an assertion to be upheld.
 *
 * Expressed as requirements over the evidence pack rather than as code, so the
 * matrix stays readable as a table and a reviewer can check the rules without
 * reading the verifier.
 */
export interface ClaimVerificationRule {
  type: ProductClaimType;
  /** Only meaningful for `capability`. */
  action?: CapabilityAction;
  /**
   * Node kinds that can satisfy this rule, if any.
   * At least one target must resolve to one of these.
   */
  nodeKinds?: readonly string[];
  /**
   * HTTP methods that satisfy this rule, when an `api:` node is the evidence.
   * A `create` claim is not satisfied by a GET endpoint.
   */
  httpMethods?: readonly string[];
  /**
   * Relationship types that can satisfy this rule.
   * At least one must connect the subject to a target.
   */
  relationships?: readonly string[];
  /**
   * Prose for the matrix table and for rejection details.
   *
   * Every dimension a rule names is **conjunctive**: a rule that specifies
   * `nodeKinds`, `httpMethods` and `relationships` requires all three. An
   * omitted dimension is not a requirement at all. Phrase the requirement to
   * match, because it is quoted verbatim in rejection details and a caption
   * saying "or" where the verifier means "and" sends a developer looking for
   * the wrong missing fact.
   */
  requirement: string;
}

/**
 * The built-in rules.
 *
 * `import`, `export`, `send` and `search` are absent on purpose. They exist in
 * {@link CapabilityAction} because they are things applications genuinely do —
 * and because naming them lets the verifier reject them explicitly rather than
 * failing to parse them. But no *generic* graph fact proves any of them.
 *
 * A POST endpoint is not an import, and a button labelled "Upload" is not an
 * import. `search` is the subtler case and worth stating outright: `GET
 * /api/clients` proves that clients can be **listed**, and listing is not
 * searching. Neither is an `input` element, a query parameter, or a component
 * whose name contains "Search" — those are all shapes that ordinary read
 * features have too. Treating any of them as proof would mean every list screen
 * in every application acquires a search capability it may not have.
 *
 * The graph carries no search signal today: there is no search relationship, no
 * search node kind, and `input` is indistinguishable from any other field. So
 * there is nothing honest to build a rule on, and these fail closed unless an
 * application registers a domain verifier that knows better.
 */
export const BUILT_IN_VERIFICATION_RULES: readonly ClaimVerificationRule[] = [
  {
    type: 'capability',
    action: 'create',
    nodeKinds: ['api', 'element', 'component'],
    // POST only. PUT is deliberately absent: `PUT /clients/:id` is replacement
    // far more often than creation, so accepting it here would classify ordinary
    // updates as create capabilities across most codebases. An application that
    // genuinely upserts with PUT needs additional deterministic evidence or a
    // registered domain verifier — an uncommon valid pattern going initially
    // unsupported is the cheaper mistake.
    httpMethods: ['POST'],
    relationships: ['submits_to', 'calls_api'],
    requirement:
      'a POST endpoint among the cited facts, and a submits_to or calls_api path from the subject',
  },
  {
    type: 'capability',
    action: 'update',
    nodeKinds: ['api', 'element'],
    // PATCH first: it is unambiguous. PUT is accepted here because replacement
    // *is* an update — the asymmetry with `create` above is the whole point.
    httpMethods: ['PATCH', 'PUT'],
    relationships: ['submits_to', 'calls_api'],
    requirement:
      'a PATCH or PUT endpoint among the cited facts, and a submits_to or calls_api path from the subject',
  },
  {
    type: 'capability',
    action: 'delete',
    nodeKinds: ['api', 'element'],
    httpMethods: ['DELETE'],
    relationships: ['calls_api'],
    requirement:
      'a DELETE endpoint among the cited facts, reached by a calls_api path from the subject',
  },
  {
    type: 'capability',
    action: 'view',
    nodeKinds: ['route', 'element', 'component', 'api'],
    httpMethods: ['GET'],
    requirement: 'a route, element, component or GET endpoint among the cited facts',
  },
  {
    type: 'capability',
    action: 'submit',
    nodeKinds: ['element', 'component'],
    relationships: ['submits_to'],
    requirement:
      'an element or component target, reached by a submits_to relationship from the subject',
  },
  {
    type: 'capability',
    action: 'navigate',
    nodeKinds: ['route', 'element'],
    relationships: ['navigates_to'],
    requirement:
      'a route or element target, reached by a navigates_to relationship from the subject',
  },
  {
    type: 'navigation',
    nodeKinds: ['route'],
    relationships: ['navigates_to'],
    requirement:
      'a route node among the cited facts, reached by a navigates_to relationship from the subject',
  },
  {
    type: 'permission',
    nodeKinds: ['permission'],
    relationships: ['requires_permission'],
    requirement:
      'a permission node AND a requires_permission relationship connecting it to the subject',
  },
  {
    type: 'workflow_step',
    nodeKinds: ['element', 'component', 'route', 'api'],
    requirement: 'at least one addressable target: an element, component, route or api node',
  },
  {
    type: 'constraint',
    nodeKinds: ['schema', 'permission'],
    relationships: ['validates_with', 'requires_permission'],
    requirement:
      'a schema or permission target, reached by a validates_with or requires_permission relationship from the subject',
  },
];

/**
 * Capability actions with no built-in rule.
 *
 * Listed explicitly so the gap is visible in the matrix rather than being an
 * absence a reader has to notice.
 */
export const UNSUPPORTED_CAPABILITY_ACTIONS: readonly CapabilityAction[] = [
  'import',
  'export',
  'search',
  'send',
];

/** Looks up the built-in rule for an assertion, if one exists. */
export function findBuiltInRule(
  type: ProductClaimType,
  action?: CapabilityAction,
): ClaimVerificationRule | undefined {
  return BUILT_IN_VERIFICATION_RULES.find((rule) => rule.type === type && rule.action === action);
}
