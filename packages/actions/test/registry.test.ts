import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { GuideActionDefinition } from '@statewavedev/guide-shared';
import { ActionFailure, ActionRegistrationError, createActionRegistry } from '../src/index.js';

const navigate = (spy = vi.fn()) =>
  ({
    name: 'navigate',
    description: 'Navigate to an application route',
    schema: z.object({ route: z.string().min(1) }),
    execute: spy,
  }) satisfies GuideActionDefinition<z.ZodObject<{ route: z.ZodString }>, unknown>;

describe('registration', () => {
  it('registers an action and reports it', () => {
    const actions = createActionRegistry();
    actions.register(navigate());

    expect(actions.has('navigate')).toBe(true);
    expect(actions.size).toBe(1);
    expect(actions.get('navigate')?.description).toBe('Navigate to an application route');
  });

  it('defaults risk to safe and title to the action name', () => {
    const actions = createActionRegistry();
    actions.register(navigate());

    const action = actions.get('navigate');
    expect(action?.risk).toBe('safe');
    expect(action?.title).toBe('navigate');
  });

  it('accepts actions passed at construction time', () => {
    const actions = createActionRegistry({ actions: [navigate()] });
    expect(actions.has('navigate')).toBe(true);
  });

  it('returns an unregister function', () => {
    const actions = createActionRegistry();
    const dispose = actions.register(navigate());

    dispose();
    expect(actions.has('navigate')).toBe(false);
  });

  it('does not let a stale disposer remove a replacement', () => {
    const actions = createActionRegistry();
    const disposeFirst = actions.register(navigate());
    actions.register({ ...navigate(), description: 'second' }, { replace: true });

    disposeFirst();

    expect(actions.get('navigate')?.description).toBe('second');
  });

  it('rejects a duplicate name unless replacement is explicit', () => {
    const actions = createActionRegistry();
    actions.register(navigate());

    expect(() => actions.register(navigate())).toThrow(ActionRegistrationError);
    expect(() => actions.register(navigate(), { replace: true })).not.toThrow();
  });

  it.each([
    [{ name: '', description: 'x', schema: z.object({}), execute: vi.fn() }, /non-empty `name`/],
    [{ name: 'a', description: '  ', schema: z.object({}), execute: vi.fn() }, /description/],
    [{ name: 'a', description: 'x', schema: undefined, execute: vi.fn() }, /Zod `schema`/],
    [{ name: 'a', description: 'x', schema: z.object({}), execute: undefined }, /`execute`/],
  ])('rejects a malformed definition (%#)', (definition, message) => {
    const actions = createActionRegistry();
    expect(() => actions.register(definition as unknown as GuideActionDefinition)).toThrow(message);
  });

  it('unregister reports whether anything was removed', () => {
    const actions = createActionRegistry({ actions: [navigate()] });
    expect(actions.unregister('navigate')).toBe(true);
    expect(actions.unregister('navigate')).toBe(false);
  });

  it('clears every action', () => {
    const actions = createActionRegistry({ actions: [navigate()] });
    actions.clear();
    expect(actions.size).toBe(0);
  });
});

describe('execution', () => {
  it('validates, runs, and returns the handler result', async () => {
    const spy = vi.fn().mockResolvedValue({ navigatedTo: '/clients' });
    const actions = createActionRegistry({ actions: [navigate(spy)] });

    const result = await actions.execute({ action: 'navigate', input: { route: '/clients' } });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ navigatedTo: '/clients' });
    expect(spy).toHaveBeenCalledWith(
      { route: '/clients' },
      expect.objectContaining({ source: 'user', requestId: expect.any(String) }),
    );
  });

  it('passes the parsed value, not the raw input', async () => {
    const spy = vi.fn();
    const actions = createActionRegistry();
    actions.register({
      name: 'scroll',
      description: 'Scroll to an element',
      schema: z.object({ elementId: z.string(), block: z.string().default('center') }),
      execute: spy,
    });

    await actions.execute({ action: 'scroll', input: { elementId: 'a', extra: 'dropped' } });

    expect(spy).toHaveBeenCalledWith({ elementId: 'a', block: 'center' }, expect.anything());
  });

  it('rejects an unknown action and names the ones it knows', async () => {
    const actions = createActionRegistry({ actions: [navigate()] });

    const result = await actions.execute({ action: 'teleport' });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.code).toBe('action_not_found');
    expect(result.success === false && result.error.message).toContain('navigate');
  });

  it('rejects invalid parameters with a per-field issue list', async () => {
    const actions = createActionRegistry({ actions: [navigate()] });

    const result = await actions.execute({ action: 'navigate', input: { route: 42 } });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.issues).toEqual([{ path: ['route'], message: expect.any(String) }]);
  });

  it('rejects missing input entirely', async () => {
    const actions = createActionRegistry({ actions: [navigate()] });
    const result = await actions.execute({ action: 'navigate' });
    expect(result.success === false && result.error.code).toBe('invalid_input');
  });

  it('does not call the handler when validation fails', async () => {
    const spy = vi.fn();
    const actions = createActionRegistry({ actions: [navigate(spy)] });

    await actions.execute({ action: 'navigate', input: { route: '' } });

    expect(spy).not.toHaveBeenCalled();
  });

  it('echoes a caller-supplied request id and generates one otherwise', async () => {
    const actions = createActionRegistry({ actions: [navigate()] });

    const given = await actions.execute({
      action: 'navigate',
      input: { route: '/x' },
      requestId: 'req_custom',
    });
    const generated = await actions.execute({ action: 'navigate', input: { route: '/x' } });

    expect(given.requestId).toBe('req_custom');
    expect(generated.requestId).toMatch(/^req_/);
  });

  it('hands the current context to the handler, read at call time', async () => {
    const spy = vi.fn();
    let route = '/dashboard';
    const actions = createActionRegistry({
      actions: [navigate(spy)],
      getContext: () => ({ route }),
    });

    await actions.execute({ action: 'navigate', input: { route: '/a' } });
    route = '/clients';
    await actions.execute({ action: 'navigate', input: { route: '/b' } });

    expect(spy.mock.calls[0]?.[1].context).toEqual({ route: '/dashboard' });
    expect(spy.mock.calls[1]?.[1].context).toEqual({ route: '/clients' });
  });

  it('notifies the host after every execution, successful or not', async () => {
    const onExecuted = vi.fn();
    const actions = createActionRegistry({ actions: [navigate()], onExecuted });

    await actions.execute({ action: 'navigate', input: { route: '/x' } });
    await actions.execute({ action: 'nope' });

    expect(onExecuted).toHaveBeenCalledTimes(2);
    expect(onExecuted.mock.calls[0]?.[0].success).toBe(true);
    expect(onExecuted.mock.calls[1]?.[0].success).toBe(false);
  });
});

describe('failures never escape', () => {
  it('converts a rejected async handler into a failed result', async () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'save',
      description: 'Save',
      schema: z.object({}),
      execute: async () => {
        throw new Error('backend exploded');
      },
    });

    const result = await actions.execute({ action: 'save', input: {} });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('execution_failed');
    expect(result.error.message).toBe('backend exploded');
    expect(result.error.cause).toBeInstanceOf(Error);
  });

  it('converts a synchronous throw into a failed result', async () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'boom',
      description: 'Boom',
      schema: z.object({}),
      execute: () => {
        throw new Error('sync boom');
      },
    });

    await expect(actions.execute({ action: 'boom', input: {} })).resolves.toMatchObject({
      success: false,
      error: { code: 'execution_failed', message: 'sync boom' },
    });
  });

  it('survives a handler that throws a non-Error', async () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'weird',
      description: 'Weird',
      schema: z.object({}),
      execute: () => {
        throw 'a string';
      },
    });

    const result = await actions.execute({ action: 'weird', input: {} });
    expect(result.success === false && result.error.message).toBe('a string');
  });

  it('reports cancellation when the signal is already aborted', async () => {
    const spy = vi.fn();
    const actions = createActionRegistry({ actions: [navigate(spy)] });

    const result = await actions.execute({
      action: 'navigate',
      input: { route: '/x' },
      signal: AbortSignal.abort(),
    });

    expect(result.success === false && result.error.code).toBe('cancelled');
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports cancellation when a handler aborts mid-flight', async () => {
    const controller = new AbortController();
    const actions = createActionRegistry();
    actions.register({
      name: 'slow',
      description: 'Slow',
      schema: z.object({}),
      execute: async () => {
        controller.abort();
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      },
    });

    const result = await actions.execute({
      action: 'slow',
      input: {},
      signal: controller.signal,
    });

    expect(result.success === false && result.error.code).toBe('cancelled');
  });

  it('survives a policy that throws', async () => {
    const actions = createActionRegistry({
      actions: [navigate()],
      policy: () => {
        throw new Error('policy blew up');
      },
    });

    const result = await actions.execute({ action: 'navigate', input: { route: '/x' } });
    expect(result.success === false && result.error.code).toBe('execution_failed');
  });
});

describe('classified handler failures', () => {
  it('passes an ActionFailure code straight through instead of flattening it', async () => {
    // The whole point of ActionFailure: without it, "the element is not on
    // screen" and "the handler crashed" would be indistinguishable to a caller.
    const actions = createActionRegistry();
    actions.register({
      name: 'highlight',
      description: 'Highlight an element',
      schema: z.object({ elementId: z.string() }),
      execute: ({ elementId }) => {
        throw new ActionFailure('target_not_mounted', `"${elementId}" is not on screen.`, {
          details: { elementId },
        });
      },
    });

    const result = await actions.execute({
      action: 'highlight',
      input: { elementId: 'clients.create' },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('target_not_mounted');
    expect(result.error.details).toEqual({ elementId: 'clients.create' });
  });

  it('round-trips a GuideError through ActionFailure.from', async () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'scroll',
      description: 'Scroll to an element',
      schema: z.object({}),
      execute: () => {
        throw ActionFailure.from({
          code: 'target_not_found',
          message: 'nothing registered under that id',
          details: { elementId: 'ghost' },
        });
      },
    });

    const result = await actions.execute({ action: 'scroll', input: {} });

    expect(result.success === false && result.error).toMatchObject({
      code: 'target_not_found',
      message: 'nothing registered under that id',
      details: { elementId: 'ghost' },
    });
  });

  it('still reports an unclassified throw as execution_failed', async () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'boom',
      description: 'Boom',
      schema: z.object({}),
      execute: () => {
        throw new Error('kaboom');
      },
    });

    const result = await actions.execute({ action: 'boom', input: {} });
    expect(result.success === false && result.error.code).toBe('execution_failed');
  });

  it('reports a TimeoutError as timeout, not execution_failed', async () => {
    const actions = createActionRegistry();
    actions.register({
      name: 'slow',
      description: 'Slow',
      schema: z.object({}),
      execute: () => {
        const error = new Error('took too long');
        error.name = 'TimeoutError';
        throw error;
      },
    });

    const result = await actions.execute({ action: 'slow', input: {} });
    expect(result.success === false && result.error.code).toBe('timeout');
  });

  it('names the known actions in the details of an action_not_found failure', async () => {
    const actions = createActionRegistry({ actions: [navigate()] });
    const result = await actions.execute({ action: 'teleport' });

    expect(result.success === false && result.error.code).toBe('action_not_found');
    expect(result.success === false && result.error.details).toEqual({
      action: 'teleport',
      knownActions: ['navigate'],
    });
  });
});
