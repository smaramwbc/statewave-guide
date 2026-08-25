import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { GuideActionRisk, GuideActionSource } from '@statewavedev/guide-shared';
import { createActionRegistry, defaultActionPolicy } from '../src/index.js';

function registryWith(risk: GuideActionRisk, execute = vi.fn()) {
  const actions = createActionRegistry();
  actions.register({
    name: 'act',
    description: 'An action',
    risk,
    schema: z.object({}),
    execute,
  });
  return actions;
}

describe('default risk policy', () => {
  it.each<[GuideActionRisk, GuideActionSource]>([
    ['safe', 'user'],
    ['safe', 'agent'],
    ['safe', 'system'],
    ['confirm', 'user'],
    ['confirm', 'system'],
    ['restricted', 'user'],
    ['restricted', 'system'],
  ])('allows a %s action requested by %s', async (risk, source) => {
    const execute = vi.fn();
    const result = await registryWith(risk, execute).execute({ action: 'act', input: {}, source });

    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('refuses a confirm action requested by an agent, without running it', async () => {
    const execute = vi.fn();
    const result = await registryWith('confirm', execute).execute({
      action: 'act',
      input: {},
      source: 'agent',
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('confirmation_required');
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses a restricted action requested by an agent, without running it', async () => {
    const execute = vi.fn();
    const result = await registryWith('restricted', execute).execute({
      action: 'act',
      input: {},
      source: 'agent',
    });

    expect(result.ok === false && result.error.code).toBe('not_permitted');
    expect(execute).not.toHaveBeenCalled();
  });

  it('is refused before the input is even validated', async () => {
    // Order matters: a refusal must not leak whether the input was well-formed.
    const result = await registryWith('restricted').execute({
      action: 'act',
      input: { nonsense: true },
      source: 'agent',
    });

    expect(result.ok === false && result.error.code).toBe('not_permitted');
  });

  it('can be called directly', () => {
    const action = {
      name: 'delete',
      title: 'delete',
      description: 'Delete',
      risk: 'restricted' as const,
      schema: z.object({}),
      execute: vi.fn(),
    };

    expect(defaultActionPolicy({ action, source: 'user', requestId: 'r1' })).toBeUndefined();
    expect(defaultActionPolicy({ action, source: 'agent', requestId: 'r1' })).toMatchObject({
      code: 'not_permitted',
    });
  });
});

describe('custom policy', () => {
  it('receives the action, the source and the stated reason', async () => {
    const policy = vi.fn().mockReturnValue(undefined);
    const actions = createActionRegistry({
      policy,
      getContext: () => ({ route: '/clients' }),
    });
    actions.register({
      name: 'archive',
      description: 'Archive a client',
      risk: 'confirm',
      schema: z.object({}),
      execute: vi.fn(),
    });

    await actions.execute({
      action: 'archive',
      input: {},
      source: 'agent',
      reason: 'the user asked to tidy up',
    });

    expect(policy).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'agent',
        reason: 'the user asked to tidy up',
        context: { route: '/clients' },
        action: expect.objectContaining({ name: 'archive', risk: 'confirm' }),
      }),
    );
  });

  it('can grant what the default policy would refuse', async () => {
    const execute = vi.fn();
    const actions = createActionRegistry({ policy: () => undefined });
    actions.register({
      name: 'send',
      description: 'Send',
      risk: 'confirm',
      schema: z.object({}),
      execute,
    });

    const result = await actions.execute({ action: 'send', input: {}, source: 'agent' });

    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('may be asynchronous', async () => {
    const actions = createActionRegistry({
      policy: async () => ({ code: 'not_permitted' as const, message: 'nope' }),
    });
    actions.register({
      name: 'x',
      description: 'X',
      schema: z.object({}),
      execute: vi.fn(),
    });

    const result = await actions.execute({ action: 'x', input: {} });
    expect(result.ok === false && result.error.message).toBe('nope');
  });
});

describe('list', () => {
  const build = () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'navigate',
      description: 'Navigate',
      schema: z.object({}),
      execute: vi.fn(),
      metadata: { category: 'guidance' },
    });
    actions.register({
      name: 'archive',
      description: 'Archive',
      risk: 'confirm',
      schema: z.object({}),
      execute: vi.fn(),
    });
    actions.register({
      name: 'delete',
      description: 'Delete',
      risk: 'restricted',
      schema: z.object({}),
      execute: vi.fn(),
    });
    return actions;
  };

  it('returns descriptors sorted by name, never handlers', () => {
    const listed = build().list();

    expect(listed.map((a) => a.name)).toEqual(['archive', 'delete', 'navigate']);
    for (const descriptor of listed) {
      expect(descriptor).not.toHaveProperty('execute');
      expect(descriptor).not.toHaveProperty('schema');
    }
  });

  it('hides restricted actions from an agent so they cannot be named', () => {
    const listed = build().list({ visibleTo: 'agent' });
    expect(listed.map((a) => a.name)).toEqual(['archive', 'navigate']);
  });

  it('filters by risk', () => {
    expect(
      build()
        .list({ risk: ['safe'] })
        .map((a) => a.name),
    ).toEqual(['navigate']);
  });

  it('carries metadata through', () => {
    expect(build().list()[2]?.metadata).toEqual({ category: 'guidance' });
  });
});
