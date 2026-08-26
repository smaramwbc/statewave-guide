import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createActionRegistry } from '@statewavedev/guide-actions';
import type { ProductFeature, ProductModel } from '@statewavedev/guide-shared';
import {
  createGuideRuntime,
  createInMemoryMemoryProvider,
  createStaticKnowledgeProvider,
  type KnowledgeProvider,
  type MemoryProvider,
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
    description: 'Workspace preferences and notification settings.',
    routes: ['/settings'],
    elements: ['settings.profile'],
  }),
]);

describe('context', () => {
  it('starts from the initial context and exposes changes', () => {
    const guide = createGuideRuntime({ initialContext: { route: '/dashboard' } });

    expect(guide.getContext()).toEqual({ route: '/dashboard' });
    guide.setContext({ route: '/clients' });
    expect(guide.getContext()).toEqual({ route: '/clients' });
  });

  it('merges partial updates and notifies subscribers', () => {
    const guide = createGuideRuntime({ initialContext: { permissions: ['clients.read'] } });
    const listener = vi.fn();
    guide.subscribeToContext(listener);

    guide.patchContext({ route: '/clients' });

    expect(guide.getContext()).toEqual({ permissions: ['clients.read'], route: '/clients' });
    expect(listener).toHaveBeenCalledWith({ permissions: ['clients.read'], route: '/clients' });
  });
});

describe('action delegation', () => {
  it('creates its own registry when none is supplied', async () => {
    const guide = createGuideRuntime();
    const execute = vi.fn();
    guide.actions.register({
      name: 'navigate',
      description: 'Navigate',
      schema: z.object({ route: z.string() }),
      execute,
    });

    const result = await guide.executeAction({ action: 'navigate', input: { route: '/clients' } });

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('uses a registry it is handed', async () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'ping',
      description: 'Ping',
      schema: z.object({}),
      execute: () => 'pong',
    });

    const guide = createGuideRuntime({ actions });

    expect(guide.actions).toBe(actions);
    await expect(guide.executeAction({ action: 'ping', input: {} })).resolves.toMatchObject({
      success: true,
      data: 'pong',
    });
  });

  it('takes over the registry context source so handlers see live context', async () => {
    // A registry built before the runtime knows nothing about context. The
    // runtime rewires it, so handlers must observe updates made afterwards.
    const actions = createActionRegistry();
    const execute = vi.fn();
    actions.register({ name: 'peek', description: 'Peek', schema: z.object({}), execute });

    const guide = createGuideRuntime({ actions });
    guide.setContext({ route: '/clients', permissions: ['clients.create'] });
    await guide.executeAction({ action: 'peek', input: {} });

    expect(execute.mock.calls[0]?.[1].context).toEqual({
      route: '/clients',
      permissions: ['clients.create'],
    });
  });

  it('returns failures as data rather than throwing', async () => {
    const guide = createGuideRuntime();
    const result = await guide.executeAction({ action: 'nope' });
    expect(result.success === false && result.error.code).toBe('action_not_found');
  });

  it('lists available actions and hides restricted ones from an agent', () => {
    const guide = createGuideRuntime();
    guide.actions.register({
      name: 'highlight',
      description: 'Highlight',
      schema: z.object({}),
      execute: vi.fn(),
    });
    guide.actions.register({
      name: 'deleteClient',
      description: 'Delete a client',
      risk: 'restricted',
      schema: z.object({}),
      execute: vi.fn(),
    });

    expect(guide.getAvailableActions().map((a) => a.name)).toEqual(['deleteClient', 'highlight']);
    expect(guide.getAvailableActions({ visibleTo: 'agent' }).map((a) => a.name)).toEqual([
      'highlight',
    ]);
  });
});

describe('knowledge provider abstraction', () => {
  it('returns nothing when no provider is configured', async () => {
    await expect(createGuideRuntime().searchKnowledge('clients')).resolves.toEqual([]);
  });

  it('forwards the query, the current context and the limit', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const knowledgeProvider: KnowledgeProvider = { name: 'stub', search };
    const guide = createGuideRuntime({ knowledgeProvider, initialContext: { route: '/clients' } });

    await guide.searchKnowledge('create a client', { limit: 3 });

    expect(search).toHaveBeenCalledWith('create a client', { route: '/clients' }, { limit: 3 });
  });

  it('lets the caller override the context for one search', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const guide = createGuideRuntime({
      knowledgeProvider: { search },
      initialContext: { route: '/clients' },
    });

    await guide.searchKnowledge('x', { context: { route: '/settings' } });

    expect(search).toHaveBeenCalledWith('x', { route: '/settings' }, undefined);
  });

  it('lets a provider failure surface — a broken provider is a host bug', async () => {
    const guide = createGuideRuntime({
      knowledgeProvider: {
        search: async () => {
          throw new Error('index unavailable');
        },
      },
    });

    await expect(guide.searchKnowledge('x')).rejects.toThrow('index unavailable');
  });

  it('works end to end with the static provider', async () => {
    const guide = createGuideRuntime({
      knowledgeProvider: createStaticKnowledgeProvider(model),
      initialContext: { route: '/clients' },
    });

    const results = await guide.searchKnowledge('how do I create a client');

    expect(results[0]?.id).toBe('clients');
    expect(results[0]?.matchedElements).toContain('clients.create');
  });
});

describe('memory provider abstraction', () => {
  it('no-ops when no provider is configured', async () => {
    const guide = createGuideRuntime();
    await expect(guide.remember({ text: 'anything' })).resolves.toBeUndefined();
    await expect(guide.recall({ query: 'anything' })).resolves.toEqual([]);
  });

  it('applies the default subject to reads and writes', async () => {
    const memoryProvider = createInMemoryMemoryProvider();
    const guide = createGuideRuntime({ memoryProvider, memorySubject: 'user:42' });

    await guide.remember({ text: 'Prefers keyboard shortcuts' });

    expect(memoryProvider.all()[0]?.subject).toBe('user:42');
    await expect(guide.recall({ query: 'shortcuts' })).resolves.toHaveLength(1);
  });

  it('lets an explicit subject win over the default', async () => {
    const remember = vi.fn().mockResolvedValue(undefined);
    const memoryProvider: MemoryProvider = { retrieve: async () => [], remember };
    const guide = createGuideRuntime({ memoryProvider, memorySubject: 'user:42' });

    await guide.remember({ text: 'x', subject: 'workspace:acme' });

    expect(remember).toHaveBeenCalledWith({ text: 'x', subject: 'workspace:acme' });
  });

  it('passes the current context to retrieval', async () => {
    const retrieve = vi.fn().mockResolvedValue([]);
    const guide = createGuideRuntime({
      memoryProvider: { retrieve, remember: async () => {} },
      initialContext: { route: '/clients' },
    });

    await guide.recall({ query: 'x' });

    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ context: { route: '/clients' } }),
    );
  });
});

describe('providers', () => {
  it('exposes only what it was given', () => {
    const bare = createGuideRuntime();
    expect(bare.providers).toEqual({});

    const memoryProvider = createInMemoryMemoryProvider();
    const configured = createGuideRuntime({
      knowledgeProvider: createStaticKnowledgeProvider(model),
      memoryProvider,
    });

    expect(configured.providers.knowledge?.name).toBe('static-product-model');
    expect(configured.providers.memory).toBe(memoryProvider);
    // The model port is defined but nothing in Day 0 uses it.
    expect(configured.providers.model).toBeUndefined();
  });
});
