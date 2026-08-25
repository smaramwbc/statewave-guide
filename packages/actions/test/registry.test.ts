import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { GuideActionDefinition } from '@statewavedev/guide-shared';
import { ActionRegistrationError, createActionRegistry } from '../src/index.js';

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

    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toEqual({ navigatedTo: '/clients' });
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

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe('unknown_action');
    expect(result.ok === false && result.error.message).toContain('navigate');
  });

  it('rejects invalid parameters with a per-field issue list', async () => {
    const actions = createActionRegistry({ actions: [navigate()] });

    const result = await actions.execute({ action: 'navigate', input: { route: 42 } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.issues).toEqual([{ path: ['route'], message: expect.any(String) }]);
  });

  it('rejects missing input entirely', async () => {
    const actions = createActionRegistry({ actions: [navigate()] });
    const result = await actions.execute({ action: 'navigate' });
    expect(result.ok === false && result.error.code).toBe('invalid_input');
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
    expect(onExecuted.mock.calls[0]?.[0].ok).toBe(true);
    expect(onExecuted.mock.calls[1]?.[0].ok).toBe(false);
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

    expect(result.ok).toBe(false);
    if (result.ok) return;
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
      ok: false,
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
    expect(result.ok === false && result.error.message).toBe('a string');
  });

  it('reports cancellation when the signal is already aborted', async () => {
    const spy = vi.fn();
    const actions = createActionRegistry({ actions: [navigate(spy)] });

    const result = await actions.execute({
      action: 'navigate',
      input: { route: '/x' },
      signal: AbortSignal.abort(),
    });

    expect(result.ok === false && result.error.code).toBe('cancelled');
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

    expect(result.ok === false && result.error.code).toBe('cancelled');
  });

  it('survives a policy that throws', async () => {
    const actions = createActionRegistry({
      actions: [navigate()],
      policy: () => {
        throw new Error('policy blew up');
      },
    });

    const result = await actions.execute({ action: 'navigate', input: { route: '/x' } });
    expect(result.ok === false && result.error.code).toBe('execution_failed');
  });
});
