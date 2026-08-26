import { describe, expect, it, vi } from 'vitest';
import { createActionRegistry } from '@statewavedev/guide-actions';
import { createElementRegistry } from '../src/element-registry.js';
import { internalsOf } from '../src/registry-internals.js';
import { createHighlightController } from '../src/highlight/controller.js';
import { createGuidanceActions } from '../src/guidance-actions.js';

function controller() {
  return createHighlightController({ registry: createElementRegistry() });
}

/** A controller whose registry knows `clients.create` but has no node for it. */
function controllerWithUnmountedElement() {
  const registry = createElementRegistry();
  internalsOf(registry).register({ id: 'clients.create', type: 'button' });
  return createHighlightController({ registry });
}

describe('createGuidanceActions', () => {
  it('always produces highlight and scroll, and nothing else on its own', () => {
    const definitions = createGuidanceActions({ highlight: controller() });
    expect(definitions.map((definition) => definition.name)).toEqual(['highlight', 'scroll']);
    expect(definitions.every((definition) => definition.risk === 'safe')).toBe(true);
    expect(definitions.every((definition) => definition.description.length > 20)).toBe(true);
  });

  it('produces a host action only when the host supplied its handler', () => {
    const definitions = createGuidanceActions({
      highlight: controller(),
      handlers: { navigate: () => undefined, startGuide: () => undefined },
    });
    expect(definitions.map((definition) => definition.name).sort()).toEqual([
      'highlight',
      'navigate',
      'scroll',
      'startGuide',
    ]);
  });

  it('passes validated input to a host handler', async () => {
    const navigate = vi.fn();
    const actions = createActionRegistry({
      actions: createGuidanceActions({ highlight: controller(), handlers: { navigate } }),
    });

    const result = await actions.execute({
      action: 'navigate',
      input: { route: '/clients', replace: true },
    });

    expect(result.success).toBe(true);
    expect(navigate).toHaveBeenCalledWith({ route: '/clients', replace: true });
  });

  it('reports a missing element as target_not_found, not execution_failed', async () => {
    const actions = createActionRegistry({
      actions: createGuidanceActions({ highlight: controller() }),
    });

    const result = await actions.execute({
      action: 'highlight',
      input: { elementId: 'clients.nowhere' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // The handler rethrows the engine's GuideError as an ActionFailure, so
      // the code survives the trip through the registry instead of collapsing
      // into `execution_failed`. A caller can branch on this; it could not
      // branch on a message.
      expect(result.error.code).toBe('target_not_found');
      expect(result.error.details).toEqual({ elementId: 'clients.nowhere' });
      expect(result.error.message).toContain('clients.nowhere');
    }
  });

  it('reports a registered but unmounted element as target_not_mounted', async () => {
    const actions = createActionRegistry({
      actions: createGuidanceActions({ highlight: controllerWithUnmountedElement() }),
    });

    const result = await actions.execute({
      action: 'highlight',
      input: { elementId: 'clients.create' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // "Nothing is registered under that id" and "it is registered but not on
      // screen" call for different responses from a guide, so they must not
      // arrive as the same code.
      expect(result.error.code).toBe('target_not_mounted');
      expect(result.error.details).toEqual({ elementId: 'clients.create' });
    }
  });

  it('carries the same codes through the scroll action', async () => {
    const actions = createActionRegistry({
      actions: createGuidanceActions({ highlight: controllerWithUnmountedElement() }),
    });

    await expect(
      actions.execute({ action: 'scroll', input: { elementId: 'clients.nowhere' } }),
    ).resolves.toMatchObject({ success: false, error: { code: 'target_not_found' } });

    await expect(
      actions.execute({ action: 'scroll', input: { elementId: 'clients.create' } }),
    ).resolves.toMatchObject({ success: false, error: { code: 'target_not_mounted' } });
  });

  it('refuses to ask the host to open something that is not there', async () => {
    const open = vi.fn();
    const actions = createActionRegistry({
      actions: createGuidanceActions({ highlight: controller(), handlers: { open } }),
    });

    const result = await actions.execute({
      action: 'open',
      input: { elementId: 'clients.nowhere' },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('target_not_found');
    // The host handler is application code. It should never be handed a target
    // the guide already knows does not exist.
    expect(open).not.toHaveBeenCalled();
  });

  it('cancels a highlight when the caller aborts mid-flight', async () => {
    const registry = createElementRegistry();
    const internals = internalsOf(registry);
    const highlight = createHighlightController({ registry });

    const node = document.createElement('button');
    node.setAttribute('data-guide', 'clients.create');
    document.body.appendChild(node);
    // A rect that never stops moving keeps the scroll wait genuinely in flight.
    let top = 0;
    node.getBoundingClientRect = () => {
      top += 7;
      const rect = {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 120,
        bottom: top + 24,
        width: 120,
        height: 24,
      };
      return { ...rect, toJSON: () => rect } as DOMRect;
    };
    internals.register({ id: 'clients.create', type: 'button' });
    internals.setNode('clients.create', node);

    const actions = createActionRegistry({ actions: createGuidanceActions({ highlight }) });
    const abort = new AbortController();
    const pending = actions.execute({
      action: 'highlight',
      input: { elementId: 'clients.create' },
      signal: abort.signal,
    });

    // The registry checks the signal once, before `execute`. Only the handler
    // can hear an abort that arrives while the scroll is still settling — and a
    // handler that ignored the execution context reported this as a success,
    // leaving the caller holding an overlay it believed it had cancelled.
    abort.abort();
    const result = await pending;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('cancelled');
      expect(result.error.details).toEqual({ elementId: 'clients.create' });
    }
    expect(highlight.activeId).toBeNull();
    expect(document.querySelector('[data-statewave-guide-overlay]')).toBeNull();

    highlight.destroy();
    node.remove();
  });

  it('refuses a selector before the handler ever runs', async () => {
    const highlight = controller();
    const spy = vi.spyOn(highlight, 'highlight');
    const actions = createActionRegistry({ actions: createGuidanceActions({ highlight }) });

    const result = await actions.execute({
      action: 'scroll',
      source: 'agent',
      input: { elementId: 'div[data-x="y"]' },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('invalid_input');
    expect(spy).not.toHaveBeenCalled();
  });
});
