/**
 * Which graph node a rendered control is — and when the honest answer is "none".
 *
 * The bridge between a running interface and static identity, and the place a
 * runtime subsystem most easily becomes a second source of truth. It earns an
 * identity through the semantic id the application already declares and through
 * nothing else: no CSS proximity, no selector heuristics, no matching a control's
 * name against a feature's title. Every one of those shortcuts has a failure this
 * project has already paid for.
 */

import { describe, expect, it } from 'vitest';
import { correlate, mayUseAsEvidence } from '../src/index.js';

describe('an element the application does not name', () => {
  it('is recorded as unmapped rather than guessed at', () => {
    const outcome = correlate({
      element: {
        ref: 'e001',
        tagName: 'button',
        role: 'button',
        visible: true,
        disabled: false,
        semanticAncestry: [],
      },
      graphElementIds: new Set(['element:clients.create']),
    });
    expect(outcome.status).toBe('unmapped');
    if (outcome.status === 'unmapped') expect(outcome.reason).toBe('UNMAPPED_RUNTIME_ELEMENT');
  });

  it('does not invent a node for an id the graph has never seen', () => {
    const outcome = correlate({
      element: {
        ref: 'e001',
        semanticId: 'invoices.list.paid',
        tagName: 'span',
        role: 'generic',
        visible: true,
        disabled: false,
        semanticAncestry: [],
      },
      graphElementIds: new Set(['element:clients.create']),
    });
    expect(outcome.status).toBe('unknown-id');
  });
});

describe('ownership is not suspended because two controls share a screen', () => {
  it('refuses a node the feature does not own', () => {
    expect(
      mayUseAsEvidence({
        nodeId: 'element:settings.rotate-key',
        featureId: 'settings.new-key',
        scopeClass: 'OUTSIDE',
      }),
    ).toBe(false);
  });

  it('permits the feature that owns it', () => {
    expect(
      mayUseAsEvidence({
        nodeId: 'element:settings.rotate-key',
        featureId: 'settings.rotate-key',
        scopeClass: 'OWNED',
      }),
    ).toBe(true);
  });

  it('refuses REACHABLE and CONTEXTUAL too, which are the tempting ones', () => {
    for (const scopeClass of ['REACHABLE', 'CONTEXTUAL'] as const) {
      expect(mayUseAsEvidence({ nodeId: 'element:x', featureId: 'f', scopeClass })).toBe(false);
    }
  });
});
