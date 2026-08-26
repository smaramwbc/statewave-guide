import { describe, expect, it } from 'vitest';
import type { ProductFeature, ProductModel } from '@statewavedev/guide-shared';
import {
  createInMemoryMemoryProvider,
  createStaticKnowledgeProvider,
  scoreFields,
  tokenize,
} from '../src/index.js';

/**
 * Builds a ProductFeature with the structural fields filled in.
 *
 * These tests are about *search*, not about the semantic pipeline, so the
 * provenance-shaped fields would be noise in every fixture. The helper keeps
 * them out of the way while leaving them present and valid.
 */
function feature(
  partial: Pick<ProductFeature, 'id' | 'title'> & Partial<ProductFeature>,
): ProductFeature {
  return {
    kind: 'feature',
    description: '',
    entryPoints: [],
    routes: [],
    elements: [],
    permissions: [],
    workflows: [],
    relatedFeatures: [],
    questions: [],
    claims: [],
    evidence: [],
    confidence: 1,
    claimSummary: {
      factualClaims: 0,
      structurallyVerified: 0,
      factualRejected: 0,
      languageClaims: 0,
      semanticallyGrounded: 0,
      languageRejected: 0,
      unsupportedActions: {},
    },
    idOrigin: 'semantic-id',
    dependencyFingerprint: `fp-${partial.id}`,
    dependsOn: [],
    ...partial,
  };
}

/** A model wrapper with the bookkeeping filled in. */
function productModel(features: ProductFeature[], application?: string): ProductModel {
  return {
    version: 2,
    ...(application ? { application } : {}),
    source: {
      graphHash: 'test-graph-hash',
      generatorVersion: '0.0.1',
      provider: 'mock',
      model: 'mock-1',
      generatedAt: '2026-08-26T00:00:00.000Z',
    },
    features,
    workflows: [],
    claims: [],
    permissions: [],
    verification: {
      featureCandidates: features.length,
      featuresEnriched: features.length,
      featuresAccepted: features.length,
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
}

const model: ProductModel = productModel([
  feature({
    id: 'clients',
    kind: 'feature',
    title: 'Clients',
    description: 'Create and manage the clients in your workspace.',
    routes: ['/clients', '/clients/:id'],
    elements: ['clients.create', 'clients.table'],
  }),
  feature({
    id: 'settings',
    kind: 'feature',
    title: 'Settings',
    description: 'Workspace preferences and notifications.',
    routes: ['/settings'],
    elements: ['settings.profile'],
  }),
  feature({
    id: 'dashboard',
    kind: 'feature',
    title: 'Dashboard',
    description: 'An overview of recent activity.',
    routes: ['/'],
  }),
]);

describe('tokenize', () => {
  it('treats dots and hyphens as separators so ids are searchable', () => {
    expect(tokenize('clients.create')).toEqual(['clients', 'create']);
    expect(tokenize('submit-button')).toEqual(['submit', 'button']);
    expect(tokenize('How do I add a Client?')).toEqual(['how', 'do', 'i', 'add', 'a', 'client']);
  });
});

describe('scoreFields', () => {
  it('scores nothing for an empty query or empty fields', () => {
    expect(scoreFields([], [{ text: 'clients', weight: 1 }])).toBe(0);
    expect(scoreFields(['clients'], [])).toBe(0);
  });

  it('ranks a high-weight match above a low-weight one', () => {
    const inTitle = scoreFields(['clients'], [{ text: 'Clients', weight: 3 }]);
    const inBody = scoreFields(
      ['clients'],
      [
        { text: 'Something else', weight: 3 },
        { text: 'mentions clients', weight: 1 },
      ],
    );
    expect(inTitle).toBeGreaterThan(inBody);
  });

  it('counts a prefix match for less than an exact one', () => {
    const exact = scoreFields(['clients'], [{ text: 'clients', weight: 1 }]);
    const prefix = scoreFields(['client'], [{ text: 'clients', weight: 1 }]);
    expect(prefix).toBeGreaterThan(0);
    expect(prefix).toBeLessThan(exact);
  });

  it('never exceeds 1', () => {
    expect(scoreFields(['clients'], [{ text: 'clients clients', weight: 5 }])).toBeLessThanOrEqual(
      1,
    );
  });
});

describe('createStaticKnowledgeProvider', () => {
  const knowledge = createStaticKnowledgeProvider(model);

  it('finds a feature by title', async () => {
    const results = await knowledge.search('settings');
    expect(results[0]?.id).toBe('settings');
  });

  it('finds a feature through one of its element ids', async () => {
    // Element *labels* are technical facts and live in the ApplicationGraph, not
    // here. What the semantic layer carries is the id and the phrasings a user
    // would actually type, which is what a lexical scorer can use.
    const results = await knowledge.search('create client');
    expect(results[0]?.id).toBe('clients');
    // Both client elements legitimately tokenise to "client"; only one to "create".
    expect(results[0]?.matchedElements).toEqual(['clients.create', 'clients.table']);
    expect((await knowledge.search('create'))[0]?.matchedElements).toEqual(['clients.create']);
  });

  it('finds a feature through a generated user question', async () => {
    const results = await knowledge.search('how do I add a customer');
    expect(results[0]?.id).toBe('clients');
  });

  it('returns nothing for a query that matches nothing', async () => {
    await expect(knowledge.search('quantum chromodynamics')).resolves.toEqual([]);
  });

  it('returns nothing for an empty query', async () => {
    await expect(knowledge.search('   ')).resolves.toEqual([]);
  });

  it('prefers the feature the user is currently looking at', async () => {
    const neutral = await knowledge.search('overview activity settings preferences');
    const onSettings = await knowledge.search('overview activity settings preferences', {
      route: '/settings',
    });

    const settingsScore = (results: typeof neutral) =>
      results.find((r) => r.id === 'settings')?.score ?? 0;
    expect(settingsScore(onSettings)).toBeGreaterThan(settingsScore(neutral));
  });

  it('matches a parameterised route against a concrete one', async () => {
    const results = await knowledge.search('client', { route: '/clients/42' });
    expect(results[0]?.id).toBe('clients');
  });

  it('honours the result limit', async () => {
    const limited = createStaticKnowledgeProvider(model, { limit: 1 });
    expect(await limited.search('clients settings dashboard')).toHaveLength(1);
    expect(
      await limited.search('clients settings dashboard', undefined, { limit: 2 }),
    ).toHaveLength(2);
  });

  it('is deterministic — the same query always yields the same order', async () => {
    const once = await knowledge.search('client settings');
    const twice = await knowledge.search('client settings');
    expect(once.map((r) => r.id)).toEqual(twice.map((r) => r.id));
  });

  it('supports direct lookup by feature and element id', async () => {
    expect((await knowledge.getFeature?.('clients'))?.title).toBe('Clients');
    // The element lookup answers ownership, not appearance: the semantic model
    // knows which feature an element belongs to; the graph knows what it looks
    // like. Duplicating the label here would create two places to disagree.
    expect((await knowledge.getElement?.('clients.create'))?.featureId).toBe('clients');
    expect(await knowledge.getFeature?.('nope')).toBeUndefined();
    expect(await knowledge.getElement?.('nope')).toBeUndefined();
  });
});

describe('createInMemoryMemoryProvider', () => {
  it('remembers and recalls', async () => {
    const memory = createInMemoryMemoryProvider();
    await memory.remember({ text: 'Sam prefers keyboard shortcuts' });

    const results = await memory.retrieve({ query: 'shortcuts' });

    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe('Sam prefers keyboard shortcuts');
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it('namespaces by subject', async () => {
    const memory = createInMemoryMemoryProvider();
    await memory.remember({ text: 'likes dark mode', subject: 'user:1' });
    await memory.remember({ text: 'likes dark mode', subject: 'user:2' });

    expect(await memory.retrieve({ query: 'dark mode', subject: 'user:1' })).toHaveLength(1);
    expect(await memory.retrieve({ query: 'dark mode' })).toHaveLength(2);
  });

  it('stamps an ISO timestamp from an injectable clock', async () => {
    const memory = createInMemoryMemoryProvider({
      now: () => new Date('2026-08-25T00:00:00.000Z'),
    });
    await memory.remember({ text: 'x' });
    expect(memory.all()[0]?.createdAt).toBe('2026-08-25T00:00:00.000Z');
  });

  it('accepts seed records and can be cleared', async () => {
    const memory = createInMemoryMemoryProvider({
      initial: [{ text: 'seeded fact about clients' }],
    });
    expect(memory.all()).toHaveLength(1);

    memory.clear();
    expect(memory.all()).toEqual([]);
    await expect(memory.retrieve({ query: 'clients' })).resolves.toEqual([]);
  });

  it('returns copies so callers cannot mutate the store', async () => {
    const memory = createInMemoryMemoryProvider({ initial: [{ text: 'a fact' }] });
    const record = memory.all()[0];
    if (record) record.text = 'tampered';
    expect(memory.all()[0]?.text).toBe('a fact');
  });

  it('honours the limit and returns nothing for an empty query', async () => {
    const memory = createInMemoryMemoryProvider({
      initial: [{ text: 'client one' }, { text: 'client two' }, { text: 'client three' }],
    });

    expect(await memory.retrieve({ query: 'client', limit: 2 })).toHaveLength(2);
    expect(await memory.retrieve({ query: '' })).toEqual([]);
  });
});
