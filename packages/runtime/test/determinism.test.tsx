/**
 * The same run, twice.
 *
 * An evidence record that differs between runs cannot support anything: a
 * capability proved by comparing two snapshots is exactly as trustworthy as the
 * snapshots' stability. So nothing here reads a clock, a random id, a pixel or a
 * DOM ordering that is not document order — and this is where that is checked
 * rather than asserted in a comment.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { mountApp } from './harness/app-harness.js';
import { probe } from './harness/probe.js';

const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function runScript(): Promise<{ snapshot: unknown; trace: unknown }> {
  const app = await mountApp({ route: '/clients' });
  try {
    await app.settle();
    const snapshot = app.snapshot('fixed');
    const trace = await probe({
      app,
      traceId: 'fixed',
      action: {
        kind: 'type',
        targetSemanticId: 'clients.search',
        safety: 'SAFE_PROBE',
        valueShape: 'Acme',
      },
      settleMs: 400,
    });
    return { snapshot, trace };
  } finally {
    app.destroy();
  }
}

describe('replay', () => {
  it('produces byte-identical evidence from the same fixture and script', async () => {
    const first = await runScript();
    const second = await runScript();
    expect(hash(second.snapshot)).toBe(hash(first.snapshot));
    expect(hash(second.trace)).toBe(hash(first.trace));
  });

  it('assigns element handles in document order, not discovery order', async () => {
    const app = await mountApp({ route: '/settings' });
    try {
      await app.settle();
      const snapshot = app.snapshot('order');
      const refs = snapshot.elements.map((element) => element.ref);
      expect([...refs].sort()).toEqual(refs);
    } finally {
      app.destroy();
    }
  });

  it('records no timestamp anywhere in a snapshot', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      await app.settle();
      const serialised = JSON.stringify(app.snapshot('clock'));
      expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(serialised).not.toMatch(/"capturedAt"/);
    } finally {
      app.destroy();
    }
  });
});

describe('interaction safety', () => {
  it('refuses a consequential action in a harness that permits probes', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      await expect(
        probe({
          app,
          traceId: 'unsafe',
          action: {
            kind: 'click',
            targetSemanticId: 'clients.create',
            safety: 'CONSEQUENTIAL',
          },
          allowed: 'SAFE_PROBE',
        }),
      ).rejects.toThrow(/Refusing a CONSEQUENTIAL interaction/);
    } finally {
      app.destroy();
    }
  });

  it('refuses every interaction in an observe-only harness', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      await expect(
        probe({
          app,
          traceId: 'observe-only',
          action: { kind: 'click', targetSemanticId: 'clients.create', safety: 'SAFE_PROBE' },
          allowed: 'OBSERVE_ONLY',
        }),
      ).rejects.toThrow(/permits OBSERVE_ONLY/);
    } finally {
      app.destroy();
    }
  });
});
