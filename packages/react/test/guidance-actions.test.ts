import { describe, expect, it, vi } from 'vitest';
import { createActionRegistry } from '@statewavedev/guide-actions';
import { createElementRegistry } from '../src/element-registry.js';
import { createHighlightController } from '../src/highlight/controller.js';
import { createGuidanceActions } from '../src/guidance-actions.js';

function controller() {
  return createHighlightController({ registry: createElementRegistry() });
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

    expect(result.ok).toBe(true);
    expect(navigate).toHaveBeenCalledWith({ route: '/clients', replace: true });
  });

  it('turns a missing element into a failed result naming the element', async () => {
    const actions = createActionRegistry({
      actions: createGuidanceActions({ highlight: controller() }),
    });

    const result = await actions.execute({
      action: 'highlight',
      input: { elementId: 'clients.nowhere' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Known Day-0 rough edge: the handler contract can only throw, so this is
      // reported as `execution_failed` rather than `target_not_found`.
      expect(result.error.code).toBe('execution_failed');
      expect(result.error.message).toContain('clients.nowhere');
    }
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

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(spy).not.toHaveBeenCalled();
  });
});
