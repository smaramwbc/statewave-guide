import { describe, expect, expectTypeOf, it } from 'vitest';
import { claimAssertionSchema } from '../src/semantic-schemas.js';
import {
  appContextSchema,
  builtinActionSchemas,
  guideActionRequestSchema,
  guideElementIdSchema,
  highlightInputSchema,
  navigateInputSchema,
  productElementSchema,
  productFeatureSchema,
  productModelSchema,
  featureEnrichmentSchema,
  factualClaimEnrichmentSchema,
  languageClaimEnrichmentSchema,
  productClaimStatusSchema,
  FACTUAL_CLAIM_TYPES,
  LANGUAGE_CLAIM_TYPES,
  isFactualClaimType,
  findBuiltInRule,
  BUILT_IN_VERIFICATION_RULES,
  UNSUPPORTED_CAPABILITY_ACTIONS,
  provenanceReferenceSchema,
  scrollInputSchema,
  type AppContext,
  type ProductElement,
  type ProductFeature,
  type ProductModel,
  type ProvenanceReference,
  isVerifiedClaim,
} from '../src/index.js';

describe('guideElementIdSchema', () => {
  it('accepts a conventional id', () => {
    expect(guideElementIdSchema.parse('clients.create')).toBe('clients.create');
  });

  it('rejects a CSS selector with an explanatory message', () => {
    const result = guideElementIdSchema.safeParse('#app > div:nth-child(4)');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/CSS selectors/);
  });
});

describe('product model schemas', () => {
  const provenance: ProvenanceReference = {
    source: 'source-code',
    file: 'src/pages/Clients.tsx',
    symbol: 'Clients',
    line: 82,
  };

  it('validates a provenance reference and rejects an unknown source', () => {
    expect(provenanceReferenceSchema.parse(provenance)).toEqual(provenance);
    expect(provenanceReferenceSchema.safeParse({ source: 'vibes' }).success).toBe(false);
  });

  it('rejects a non-positive line number', () => {
    expect(provenanceReferenceSchema.safeParse({ source: 'source-code', line: 0 }).success).toBe(
      false,
    );
  });

  it('validates an element and enforces the id convention on it', () => {
    const element: ProductElement = {
      id: 'clients.create',
      type: 'button',
      label: 'New Client',
      featureId: 'clients',
      provenance: [provenance],
    };
    expect(productElementSchema.parse(element)).toEqual(element);
    expect(productElementSchema.safeParse({ ...element, id: 'div > button' }).success).toBe(false);
    expect(productElementSchema.safeParse({ ...element, type: 'widget' }).success).toBe(false);
  });

  it('validates a feature and requires the kind discriminator', () => {
    const feature: ProductFeature = {
      id: 'clients.create',
      kind: 'feature',
      title: 'Create a client',
      description: 'Adds a new client to the directory.',
      entryPoints: ['element:clients.create'],
      routes: ['/clients'],
      elements: ['clients.create'],
      permissions: ['clients:create'],
      workflows: ['clients.create#workflow'],
      relatedFeatures: [],
      questions: ['How do I create a client?'],
      claims: ['clients.create#description:1'],
      evidence: [{ ref: 'element:clients.create', kind: 'node' }],
      confidence: 1,
      claimSummary: {
        factualClaims: 1,
        structurallyVerified: 1,
        factualRejected: 0,
        languageClaims: 0,
        semanticallyGrounded: 0,
        languageRejected: 0,
        unsupportedActions: {},
      },
      idOrigin: 'semantic-id',
      dependencyFingerprint: 'abc123',
      dependsOn: ['element:clients.create'],
    };
    expect(productFeatureSchema.parse(feature)).toEqual(feature);
    expect(productFeatureSchema.safeParse({ ...feature, kind: 'screen' }).success).toBe(false);
    expect(productFeatureSchema.safeParse({ ...feature, confidence: 1.5 }).success).toBe(false);
    expect(productFeatureSchema.safeParse({ ...feature, idOrigin: 'invented' }).success).toBe(
      false,
    );
  });

  it('validates a whole product model and pins the schema version', () => {
    const model: ProductModel = {
      version: 2,
      application: 'demo',
      source: {
        graphHash: 'deadbeef',
        generatorVersion: '0.0.1',
        provider: 'mock',
        model: 'mock-1',
        generatedAt: '2026-08-26T00:00:00.000Z',
      },
      features: [],
      workflows: [],
      claims: [],
      permissions: [],
      verification: {
        featureCandidates: 0,
        featuresEnriched: 0,
        featuresAccepted: 0,
        featuresRejected: 0,
        factualClaimsGenerated: 0,
        structurallyVerified: 0,
        semanticallyGrounded: 0,
        claimsRejected: 0,
        blocked: {
          unsupportedCapabilities: 0,
          unsupportedConstraints: 0,
          unsupportedPermissions: 0,
          workflowStepsWithoutEvidence: 0,
          unknownReferences: 0,
        },
        evidenceCoverage: 1,
        rejectionsByReason: {},
      },
    };
    expect(productModelSchema.parse(model)).toEqual(model);
    expect(productModelSchema.safeParse({ ...model, version: 1 }).success).toBe(false);
  });
});

describe('model response schemas — untrusted input', () => {
  const valid = {
    title: 'Create a client',
    description: 'Adds a new client to the directory.',
    factualClaims: [
      {
        type: 'capability' as const,
        text: 'You can create a client from the Clients screen.',
        subjectRef: 'feature:clients.create',
        action: 'create' as const,
        targets: ['element:clients.create', 'api:POST:/api/clients'],
      },
    ],
    languageClaims: [
      { type: 'user_question' as const, text: 'How do I create a client?', targets: [] },
    ],
    confidenceReason: 'the element and its endpoint are both present',
  };

  it('accepts a well-formed enrichment', () => {
    expect(featureEnrichmentSchema.parse(valid)).toMatchObject({ title: 'Create a client' });
  });

  it('refuses a model that tries to set the feature id', () => {
    // Identity is decided before the model is called. Failing the shape check is
    // more informative than silently dropping the field.
    expect(featureEnrichmentSchema.safeParse({ ...valid, id: 'clients.new' }).success).toBe(false);
  });

  it('refuses a model that tries to grade its own confidence', () => {
    expect(featureEnrichmentSchema.safeParse({ ...valid, confidence: 0.99 }).success).toBe(false);
  });

  it('bounds the response so one call cannot balloon', () => {
    expect(featureEnrichmentSchema.safeParse({ ...valid, title: 'x'.repeat(200) }).success).toBe(
      false,
    );
    expect(
      featureEnrichmentSchema.safeParse({
        ...valid,
        languageClaims: Array(50).fill({ type: 'synonym', text: 'x', targets: [] }),
      }).success,
    ).toBe(false);
  });
});

describe('structured claims — the shape that makes verification possible', () => {
  it('forces a factual claim to state what it asserts, not just say it', () => {
    // This is the whole point of the structured layer. "Clients can be imported
    // from CSV" cannot be checked as a sentence. Decomposed into a subject and an
    // action it becomes a question the graph can answer.
    const parsed = factualClaimEnrichmentSchema.parse({
      type: 'capability',
      text: 'Clients can be imported from CSV.',
      subjectRef: 'feature:clients.create',
      action: 'import',
      targets: ['element:clients.create'],
    });
    expect(parsed.action).toBe('import');
    expect(parsed.subjectRef).toBe('feature:clients.create');
  });

  it('refuses a factual claim that cites nothing', () => {
    // A factual claim with no targets is an assertion with nowhere to check it.
    expect(
      factualClaimEnrichmentSchema.safeParse({
        type: 'capability',
        text: 'Clients can be imported from CSV.',
        subjectRef: 'feature:clients.create',
        action: 'import',
        targets: [],
      }).success,
    ).toBe(false);
  });

  it('closes the verb set, so there is no assertion without a rule to check it', () => {
    expect(
      factualClaimEnrichmentSchema.safeParse({
        type: 'capability',
        text: 'Clients can be reticulated.',
        subjectRef: 'feature:clients.create',
        action: 'reticulate',
        targets: ['element:clients.create'],
      }).success,
    ).toBe(false);
  });

  it('refuses a factual claim smuggled in as a language claim type', () => {
    expect(
      factualClaimEnrichmentSchema.safeParse({
        type: 'purpose',
        text: 'x',
        subjectRef: 'feature:clients.create',
        targets: ['element:clients.create'],
      }).success,
    ).toBe(false);
    expect(
      languageClaimEnrichmentSchema.safeParse({
        type: 'capability',
        text: 'x',
        targets: [],
      }).success,
    ).toBe(false);
  });

  it('keeps factual and language claim types disjoint', () => {
    const overlap = FACTUAL_CLAIM_TYPES.filter((type) =>
      (LANGUAGE_CLAIM_TYPES as readonly string[]).includes(type),
    );
    expect(overlap).toEqual([]);
    for (const type of FACTUAL_CLAIM_TYPES) expect(isFactualClaimType(type)).toBe(true);
    for (const type of LANGUAGE_CLAIM_TYPES) expect(isFactualClaimType(type)).toBe(false);
  });

  it('distinguishes the four verification states', () => {
    // "checked against the graph" and "a sentence we allowed through" are
    // different guarantees; collapsing them would be the most misleading thing
    // this model could do.
    //
    // Closed Loop #10 added a fourth for the same reason it kept the first three
    // apart. A structural proof holds for every run because the code cannot do
    // otherwise; a behavioural one is a report about a single observed run under
    // a recorded context. Both are verified and they are not interchangeable,
    // which is why they are two values and not one.
    expect(productClaimStatusSchema.options).toEqual([
      'structurally_verified',
      'behaviorally_verified',
      'semantically_grounded',
      'rejected',
    ]);
  });

  it('treats both verified states as verified, and neither of the others', () => {
    expect(isVerifiedClaim({ status: 'structurally_verified' })).toBe(true);
    expect(isVerifiedClaim({ status: 'behaviorally_verified' })).toBe(true);
    expect(isVerifiedClaim({ status: 'semantically_grounded' })).toBe(false);
    expect(isVerifiedClaim({ status: 'rejected' })).toBe(false);
  });
});
describe('appContextSchema', () => {
  it('accepts an empty context — every field is optional', () => {
    expect(appContextSchema.parse({})).toEqual({});
  });

  it('validates a fully populated context', () => {
    const context: AppContext = {
      route: '/clients/42',
      screen: 'ClientDetails',
      userId: 'u_1',
      workspaceId: 'w_1',
      permissions: ['clients.read'],
      selectedEntity: { type: 'client', id: '42' },
      visibleElements: ['clients.create'],
      metadata: { theme: 'dark' },
    };
    expect(appContextSchema.parse(context)).toEqual(context);
  });

  it('rejects a selected entity missing its id', () => {
    expect(appContextSchema.safeParse({ selectedEntity: { type: 'client' } }).success).toBe(false);
  });

  it('strips unknown keys rather than failing', () => {
    expect(appContextSchema.parse({ route: '/x', nope: 1 })).toEqual({ route: '/x' });
  });
});

describe('built-in action input schemas', () => {
  it('covers exactly the built-in action vocabulary', () => {
    expect(Object.keys(builtinActionSchemas).sort()).toEqual([
      'highlight',
      'navigate',
      'open',
      'scroll',
      'startGuide',
    ]);
  });

  it('requires a route to navigate', () => {
    expect(navigateInputSchema.parse({ route: '/clients' })).toEqual({ route: '/clients' });
    expect(navigateInputSchema.safeParse({ route: '' }).success).toBe(false);
    expect(navigateInputSchema.safeParse({}).success).toBe(false);
  });

  it('refuses to highlight anything but a semantic element id', () => {
    expect(highlightInputSchema.parse({ elementId: 'clients.create' }).elementId).toBe(
      'clients.create',
    );
    expect(highlightInputSchema.safeParse({ elementId: '#app > div' }).success).toBe(false);
    expect(
      highlightInputSchema.safeParse({ elementId: 'clients.create', durationMs: 0 }).success,
    ).toBe(false);
  });

  it('constrains scroll alignment to the DOM vocabulary', () => {
    expect(scrollInputSchema.parse({ elementId: 'settings.profile' }).block).toBeUndefined();
    expect(
      scrollInputSchema.safeParse({ elementId: 'settings.profile', block: 'middle' }).success,
    ).toBe(false);
  });

  it('infers the input type from the schema', () => {
    expectTypeOf(navigateInputSchema.parse({ route: '/x' })).toEqualTypeOf<{
      route: string;
      replace?: boolean | undefined;
    }>();
  });
});

describe('guideActionRequestSchema', () => {
  it('keeps input opaque so the action schema owns validation', () => {
    const parsed = guideActionRequestSchema.parse({
      action: 'highlight',
      input: { elementId: 'clients.create' },
      source: 'agent',
      reason: 'showing the user where to click',
    });
    expect(parsed.action).toBe('highlight');
    expect(parsed.input).toEqual({ elementId: 'clients.create' });
  });

  it('rejects an unnamed action and an unknown source', () => {
    expect(guideActionRequestSchema.safeParse({ action: '' }).success).toBe(false);
    expect(guideActionRequestSchema.safeParse({ action: 'x', source: 'robot' }).success).toBe(
      false,
    );
  });
});

describe('the verification matrix', () => {
  it('has no rule for the verbs hallucinations reach for', () => {
    // import/export/send exist in the taxonomy so the verifier can reject them
    // *explicitly*. No generic graph fact proves an import: a POST endpoint is
    // not an import, and a button labelled Upload is not an import.
    for (const action of UNSUPPORTED_CAPABILITY_ACTIONS) {
      expect(findBuiltInRule('capability', action)).toBeUndefined();
    }
  });

  it('distinguishes create from view by HTTP method, not by target count', () => {
    // The absence of a generic "has targets, therefore true" fallback is the
    // whole design. A create claim is not satisfied by a GET endpoint.
    expect(findBuiltInRule('capability', 'create')?.httpMethods).toContain('POST');
    expect(findBuiltInRule('capability', 'create')?.httpMethods).not.toContain('GET');
    expect(findBuiltInRule('capability', 'delete')?.httpMethods).toEqual(['DELETE']);
    expect(findBuiltInRule('capability', 'view')?.httpMethods).toEqual(['GET']);
  });

  it('refuses to read search out of a list endpoint', () => {
    // `GET /api/clients` proves clients can be LISTED. Listing is not searching,
    // and neither is an input element, a query parameter, or a component whose
    // name contains "Search" — every ordinary read screen has those shapes too.
    // The graph carries no search signal at all, so there is nothing honest to
    // build a rule on.
    expect(findBuiltInRule('capability', 'search')).toBeUndefined();
    expect(UNSUPPORTED_CAPABILITY_ACTIONS).toContain('search');
  });

  it('still verifies view from the same read evidence', () => {
    // The point of removing search is not to weaken read claims. A route,
    // component or GET endpoint genuinely does prove something is viewable.
    const view = findBuiltInRule('capability', 'view');
    expect(view).toBeDefined();
    expect(view?.nodeKinds).toEqual(expect.arrayContaining(['route', 'component', 'api']));
    expect(view?.httpMethods).toEqual(['GET']);
  });

  it('refuses to read creation out of a PUT', () => {
    // `PUT /clients/:id` is replacement far more often than creation. Accepting
    // it as create evidence would reclassify ordinary updates as create
    // capabilities across most codebases — precision over recall says an
    // uncommon valid PUT-upsert going unsupported is the cheaper mistake.
    const create = findBuiltInRule('capability', 'create');
    expect(create?.httpMethods).toEqual(['POST']);
    expect(create?.httpMethods).not.toContain('PUT');
  });

  it('accepts PUT for update, because replacement IS an update', () => {
    // The asymmetry with `create` is deliberate, not an oversight.
    const update = findBuiltInRule('capability', 'update');
    expect(update?.httpMethods).toEqual(['PATCH', 'PUT']);
  });

  it('requires a permission to be connected, not merely to exist', () => {
    const rule = findBuiltInRule('permission');
    expect(rule?.relationships).toContain('requires_permission');
    expect(rule?.requirement).toMatch(/connecting it to the subject/);
  });

  it('covers every factual claim type or names the gap', () => {
    for (const type of FACTUAL_CLAIM_TYPES) {
      const hasRule =
        BUILT_IN_VERIFICATION_RULES.some((rule) => rule.type === type) || type === 'capability';
      expect(hasRule).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Empty is absence, not assertion
//
// Every field goes to a provider as `required`, because strict structured-output
// modes reject a partial `required` list. A model with nothing to say therefore
// answers `""`. Read literally that is a claim about the application, and the
// verifier — correctly — calls it a fabrication. The first real provider run
// produced 251 such rejections out of 363, none of which the model had actually
// asserted.
// ---------------------------------------------------------------------------

describe('empty optional values from a model', () => {
  const base = {
    type: 'capability' as const,
    text: 'Users can create a client.',
    subjectRef: 'element:clients.create',
    targets: ['rel:1'],
  };

  it('treats an empty route and permission as not stated', () => {
    const parsed = factualClaimEnrichmentSchema.parse({
      ...base,
      route: '',
      permission: '',
      subjectLabel: '',
      action: 'create',
    });
    expect(parsed.route).toBeUndefined();
    expect(parsed.permission).toBeUndefined();
    expect(parsed.subjectLabel).toBeUndefined();
    // The rest of the claim is untouched — this is a fidelity fix, not a filter.
    expect(parsed.action).toBe('create');
    expect(parsed.targets).toEqual(['rel:1']);
  });

  it('treats null the same way', () => {
    const parsed = factualClaimEnrichmentSchema.parse({ ...base, route: null, permission: null });
    expect(parsed.route).toBeUndefined();
    expect(parsed.permission).toBeUndefined();
  });

  it('still carries a real route through unchanged', () => {
    // The safety-critical half: normalisation must not swallow a genuine value,
    // or a fabricated route would silently stop being checked.
    const parsed = factualClaimEnrichmentSchema.parse({ ...base, route: '/clients' });
    expect(parsed.route).toBe('/clients');
  });

  it('refuses an empty value on the internal assertion type', () => {
    // Past the model boundary an empty string is a bug in our own code, so it
    // is rejected outright rather than normalised a second time.
    const result = claimAssertionSchema.safeParse({
      subjectRef: 'element:clients.create',
      route: '',
      targets: ['rel:1'],
    });
    expect(result.success).toBe(false);
  });
});

describe('the no-action sentinel', () => {
  const base = {
    type: 'navigation' as const,
    text: 'The Clients page is at /clients.',
    subjectRef: 'route:/clients',
    targets: ['rel:1'],
  };

  it('turns the sentinel into absence, so rule lookup finds the action-free rule', () => {
    const parsed = factualClaimEnrichmentSchema.parse({ ...base, action: 'none' });
    expect(parsed.action).toBeUndefined();
  });

  it('leaves a real action untouched', () => {
    // The half that must not regress: a capability claim's action still reaches
    // the verifier, and a navigation claim that genuinely asserts one is still
    // matched exactly — and still found to have no rule.
    const parsed = factualClaimEnrichmentSchema.parse({
      ...base,
      type: 'capability' as const,
      action: 'create',
    });
    expect(parsed.action).toBe('create');
    const stillMismatched = factualClaimEnrichmentSchema.parse({ ...base, action: 'navigate' });
    expect(stillMismatched.action).toBe('navigate');
  });

  it('never lets the sentinel reach the internal assertion type', () => {
    const result = claimAssertionSchema.safeParse({
      subjectRef: 'route:/clients',
      action: 'none',
      targets: ['rel:1'],
    });
    expect(result.success).toBe(false);
  });
});
