/**
 * What a runtime observer is allowed to remember.
 *
 * Static analysis reads source that is already in the repository. Runtime
 * observation watches a real interface with real values in it, and the value a
 * user types is theirs rather than the application's.
 *
 * Two of the tests below were written before the code they check and failed —
 * which is how the two genuine leaks in this subsystem were found. A `<code>`
 * block displaying a rotated API key was naming itself with the key, through the
 * one path designed to read text on purpose; and every container on the page was
 * naming itself with its entire concatenated subtree, key included. Both are
 * fixed at the root rather than filtered: a value element has no name, and only
 * the ARIA roles that support name-from-content get one.
 */

import { describe, expect, it } from 'vitest';
import { mountApp } from './harness/app-harness.js';
import { probe } from './harness/probe.js';
import {
  describeRedacted,
  isSensitiveName,
  redactBody,
  redactHeaders,
  redactValue,
} from '../src/index.js';

describe('redaction', () => {
  it('keeps a value s shape and never its content', () => {
    expect(describeRedacted(redactValue('search', 'Acme Corporation'))).toBe(
      '<redacted:string:16>',
    );
    expect(describeRedacted(redactValue('notifications', true))).toBe('<redacted:boolean>');
    expect(describeRedacted(redactValue('name', ''))).toBe('<empty>');
  });

  it('withholds even the shape of a value whose name says it is a secret', () => {
    for (const name of ['password', 'apiKey', 'api_key', 'authToken', 'sessionId', 'cvv']) {
      expect(isSensitiveName(name), name).toBe(true);
      expect(describeRedacted(redactValue(name, 'hunter2hunter2'))).toBe(
        '<withheld:sensitive-name>',
      );
    }
  });

  it('keeps a request s field names and none of its values', () => {
    const body = redactBody({ name: 'Acme', email: 'ops@acme.test', plan: 'enterprise' });
    expect(Object.keys(body ?? {}).sort()).toEqual(['email', 'name', 'plan']);
    expect(JSON.stringify(body)).not.toContain('Acme');
    expect(JSON.stringify(body)).not.toContain('enterprise');
  });

  it('removes identity headers rather than redacting them', () => {
    const headers = redactHeaders({
      Authorization: 'Bearer abc.def.ghi',
      Cookie: 'session=1',
      'Content-Type': 'application/json',
    });
    expect(headers).toEqual({ 'content-type': 'application/json' });
  });

  it('never lets a typed value reach an interaction trace', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      const trace = await probe({
        app,
        traceId: 'typed',
        action: {
          kind: 'type',
          targetSemanticId: 'clients.search',
          safety: 'SAFE_PROBE',
          valueShape: 'Acme',
        },
        settleMs: 400,
      });
      // Two different things, and the test asserts both.
      //
      // What the user typed is a shape in the record and a literal only in the
      // harness, which has to pass it for the application to behave.
      //
      // And what the application *displayed* in response — five client names,
      // then two — is not recorded either. A table cell's ARIA name is its
      // contents, which is right for a screen reader and wrong for an evidence
      // file: it is not naming evidence about any control, and it is somebody's
      // customer list.
      const serialised = JSON.stringify({
        before: trace.beforeSnapshot,
        after: trace.afterSnapshot,
        effects: trace.observedEffects,
      });
      expect(serialised).not.toContain('Acme Corp');
      expect(serialised).not.toContain('ops@acme.test');
      expect(serialised).toContain('<redacted:string:4>');

      // The membership change survives, because counting is what the rule uses.
      expect(
        trace.observedEffects.some(
          (effect) =>
            effect.kind === 'COLLECTION_MEMBERS_CHANGED' &&
            effect.before === 5 &&
            effect.after === 2,
        ),
      ).toBe(true);
    } finally {
      app.destroy();
    }
  });
});
