/**
 * The callout text is carried, not composed.
 *
 * The query contract decides what a pointer says — the control's supported name
 * and the step's own sentence — and everything between there and the screen is
 * plumbing. This pins the one seam where that could quietly stop being true:
 * the executor that turns a safe action into a controller call.
 *
 * An earlier attempt at this feature had the panel build its own callout, which
 * `test:guide-ui-accessibility` rejected on sight. The rule survives because it
 * is checked at both ends.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createElementRegistry } from '../src/element-registry.js';
import { internalsOf } from '../src/registry-internals.js';
import { useGuideQuery } from '../src/use-guide-query.js';
import type { HighlightController } from '../src/highlight/controller.js';
import type { GuideQueryEngine } from '@statewavedev/guide-core';

/** An engine that is never asked a question — only `execute` is under test. */
const engine = { query: () => ({}) } as unknown as GuideQueryEngine;

function harness() {
  const registry = createElementRegistry();
  const node = document.createElement('button');
  document.body.append(node);
  // Registration lives on the private half, the way the provider reaches it.
  const internals = internalsOf(registry);
  internals.register({ id: 'clients.create' });
  internals.setNode('clients.create', node);

  const highlight = vi.fn(async () => ({ success: true as const, id: 'clients.create' }));
  const controller = { highlight, scrollTo: vi.fn(async () => ({ success: true, id: '' })) };

  const { result } = renderHook(() =>
    useGuideQuery({
      engine,
      registry,
      highlight: controller as unknown as HighlightController,
    }),
  );
  return { execute: result.current.execute, highlight };
}

describe('the executor and the callout', () => {
  it('hands the action’s own words to the controller', async () => {
    const { execute, highlight } = harness();

    await execute({
      kind: 'highlight',
      semanticId: 'clients.create',
      label: 'New client',
      title: 'New client',
      message: 'Choose "New client".',
    });

    expect(highlight).toHaveBeenCalledWith('clients.create', {
      title: 'New client',
      message: 'Choose "New client".',
    });
  });

  /**
   * A highlight with nothing to say passes nothing, rather than an empty
   * string. The overlay hides the callout when both halves are absent, and
   * `''` is not absent — it would render an empty card beside the control.
   */
  it('passes no words when the action carries none', async () => {
    const { execute, highlight } = harness();

    await execute({ kind: 'highlight', semanticId: 'clients.create' });

    expect(highlight).toHaveBeenCalledWith('clients.create', {});
  });
});
