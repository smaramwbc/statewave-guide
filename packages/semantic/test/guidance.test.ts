/**
 * The guidance compiler, and the eight sentences that made it necessary.
 *
 * Every named case below is a real string an independent reviewer read in the
 * Day 2 usefulness review and marked down. They are pinned here as structural
 * invariants rather than as exact sentences, because the point is not that one
 * phrasing was bad — it is that a whole class of phrasing was reachable. A test
 * asserting the replacement text word for word would pass while the class stayed
 * open.
 *
 * The compiler is run against the Round 2 ProductModel captured on disk. That
 * model is frozen deliberately: this milestone changes how knowledge is
 * presented and nothing about what is known, so the input to both sides of the
 * comparison has to be the same object.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createProjectIndexer } from '@statewavedev/guide-indexer';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import type { ProductModel } from '@statewavedev/guide-shared';
import { compileGuidance } from '../src/guidance/compile.js';
import type { GuidanceDocument } from '../src/guidance/ir.js';
import { realiseInstruction, tryRealise } from '../src/guidance/realise.js';
import { entityNoun, normaliseIdentifier } from '../src/guidance/labels.js';

const BENCH = new URL('../../../benchmarks/provider-reality-check/', import.meta.url).pathname;
const FIXTURE = new URL('../../indexer/test/fixtures/realistic-app', import.meta.url).pathname;

let model: ProductModel;
let graph: ApplicationGraph;
const documents = new Map<string, GuidanceDocument>();

beforeAll(async () => {
  const captured = JSON.parse(readFileSync(`${BENCH}round-2-product-model.json`, 'utf8'));
  model = captured.model as ProductModel;
  graph = (
    await createProjectIndexer({
      root: FIXTURE,
      config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
    }).index()
  ).graph;
  for (const feature of model.features) {
    documents.set(feature.id, compileGuidance({ model, feature, graph }));
  }
});

/** Everything one document would put in front of a reader, as one string. */
function userCopy(featureId: string): string {
  const document = documents.get(featureId);
  if (document === undefined) throw new Error(`no document for ${featureId}`);
  const parts = [
    document.title?.text,
    document.summary?.text ?? '',
    document.purpose?.text ?? '',
    ...document.steps.map((step) => realiseInstruction(step.proposition) ?? ''),
    ...document.conditions.map((condition) => tryRealise(condition.proposition) ?? ''),
    ...document.questions.map((question) => question.text),
  ];
  return parts.join(' \n ');
}

function documentFor(featureId: string): GuidanceDocument {
  const document = documents.get(featureId);
  if (document === undefined) throw new Error(`no document for ${featureId}`);
  return document;
}

// ---------------------------------------------------------------------------
// The named regressions
// ---------------------------------------------------------------------------

describe('internal epistemology never reaches a user', () => {
  // R04, R06, R10 and seven others carried the same sentence. It was accurate,
  // and it told someone trying to use a product about our confidence in our own
  // analysis. On R04 and R06 it sat above a confident description of what the
  // control does, so the page contradicted itself in consecutive lines.
  for (const featureId of ['clients.export', 'settings.rotate-key', 'invoices.list.clear']) {
    it(`says nothing rather than disclaiming knowledge: ${featureId}`, () => {
      const copy = userCopy(featureId).toLowerCase();
      expect(copy).not.toContain('verified');
      expect(copy).not.toContain('no capability');
      expect(copy).not.toMatch(/could not be (established|determined)/);
    });
  }

  it('records the reason as a developer diagnostic instead of deleting it', () => {
    // The information did not stop existing. It moved to where it belongs.
    const document = documentFor('settings.new-key');
    expect(document.summary).toBeUndefined();
    expect(document.diagnostics.map((entry) => entry.code)).toContain('NO_VERIFIED_CAPABILITY');
  });

  it('never both disclaims knowledge and describes behaviour', () => {
    for (const [featureId, document] of documents) {
      const copy = userCopy(featureId);
      const disclaims = /nothing (is|was) known|could not be (established|verified)/i.test(copy);
      const describes = document.summary !== undefined || document.steps.length > 0;
      expect(disclaims && describes, `${featureId} does both`).toBe(false);
    }
  });
});

describe('identifiers are addresses, not grammar', () => {
  it('R15: never renders a form as its own identifier, doubled', () => {
    // "You can create a new invoices create form and submit the invoices create
    // form form from the Invoices screen." Correct facts, unusable sentence.
    const copy = userCopy('invoices.create-form.submit');
    expect(copy).not.toMatch(/\b(\w+)\s+\1\b/i);
    expect(copy.toLowerCase()).not.toContain('invoices create form');
  });

  it('R16: names the destination rather than the link identifier', () => {
    // "You can open nav clients from the Clients screen."
    const copy = userCopy('nav.clients');
    expect(copy.toLowerCase()).not.toContain('nav clients');
    expect(copy.toLowerCase()).not.toContain('open a nav');
    expect(copy).toContain('Clients');
  });

  it('R17: speaks about the client, not about the page namespace', () => {
    // "You can update a client detail rename."
    const copy = userCopy('client-detail.rename').toLowerCase();
    expect(copy).not.toContain('client detail rename');
    expect(copy).not.toContain('a client detail');
  });

  it('R19: does not turn an identifier into a verb phrase', () => {
    // "You can view client detail audit."
    const copy = userCopy('client-detail.audit').toLowerCase();
    expect(copy).not.toContain('view client detail audit');
    expect(copy).not.toContain('client detail audit');
  });

  it('leaks no identifier-shaped token into any unquoted prose', () => {
    for (const featureId of documents.keys()) {
      // Quoted spans are text on screen; an application may label a control
      // anything it likes. Only prose we composed is checked.
      const unquoted = userCopy(featureId).replace(/"[^"]*"/g, '');
      expect(unquoted, featureId).not.toMatch(/\b[a-z][a-z0-9]*(?:[.-][a-z0-9]+){1,}\b/);
    }
  });
});

describe('R05: a workflow is what a person does, in the order they do it', () => {
  it('puts the trigger before the form it opens', () => {
    // Day 2 sorted steps by ownership-path depth and produced the reverse:
    // fields, then the dialog holding them, then the button that opens it.
    const document = documentFor('clients.create');
    const roles = document.steps.map((step) => step.role);
    const trigger = roles.indexOf('trigger');
    const input = roles.indexOf('input');
    const confirmation = roles.indexOf('confirmation');

    expect(trigger).toBeGreaterThanOrEqual(0);
    expect(input).toBeGreaterThan(trigger);
    expect(confirmation).toBeGreaterThan(input);
  });

  it('begins by putting the user on the right screen', () => {
    const document = documentFor('clients.create');
    expect(document.steps[0]?.role).toBe('entry');
    expect(realiseInstruction(document.steps[0]!.proposition)).toBe('Open Clients.');
  });

  it('reads as instructions, not as a list of things that are possible', () => {
    const document = documentFor('clients.create');
    for (const step of document.steps) {
      const text = realiseInstruction(step.proposition) ?? '';
      expect(text, `step ${step.index}`).not.toMatch(/^You can /);
    }
  });

  it('never renders a passive container as something the user does', () => {
    // "The dialog holds the form." is true and nobody performs it.
    for (const document of documents.values()) {
      for (const step of document.steps) {
        expect(step.kind === 'action' && step.role === 'container').toBe(false);
      }
    }
  });
});

describe('permissions are explained, never identified', () => {
  it('says what the permission is for instead of naming it', () => {
    const copy = userCopy('clients.create');
    expect(copy).not.toContain('clients:create');
    expect(copy).toContain('You need permission to create a client.');
  });

  it('keeps the identifier where a developer can still find it', () => {
    const document = documentFor('clients.create');
    const permission = document.conditions.find(
      (condition) => condition.proposition.kind === 'requires_permission',
    );
    expect(permission).toBeDefined();
    if (permission?.proposition.kind === 'requires_permission') {
      expect(permission.proposition.permission).toBe('clients:create');
    }
  });

  it('leaks no permission identifier into any user copy', () => {
    for (const featureId of documents.keys()) {
      const unquoted = userCopy(featureId).replace(/"[^"]*"/g, '');
      expect(unquoted, featureId).not.toMatch(/\b[a-z][a-z0-9-]*:[a-z][a-z0-9-]*\b/);
    }
  });
});

describe('relevance: the model may know more than the guide says', () => {
  it('withholds a constraint that changes nothing the user does', () => {
    // "Input is validated before it is accepted." — flagged irrelevant three
    // times. True of nearly every form ever written.
    for (const featureId of documents.keys()) {
      expect(userCopy(featureId).toLowerCase()).not.toContain('input is validated');
    }
  });

  it('records the withholding rather than silently dropping it', () => {
    const withheld = [...documents.values()].flatMap((document) =>
      document.diagnostics.filter((entry) => entry.code === 'CONSTRAINT_WITHHELD_AS_IRRELEVANT'),
    );
    expect(withheld.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('properties that must hold for every feature', () => {
  it('gives every sentence and every step provenance', () => {
    for (const [featureId, document] of documents) {
      for (const key of ['summary', 'purpose'] as const) {
        const sentence = document[key];
        if (sentence === undefined) continue;
        const cited = sentence.provenance.claims.length + sentence.provenance.facts.length;
        expect(cited, `${featureId}.${key}`).toBeGreaterThan(0);
      }
      for (const step of document.steps) {
        const cited = step.provenance.claims.length + step.provenance.facts.length;
        expect(cited, `${featureId} step ${step.index}`).toBeGreaterThan(0);
      }
    }
  });

  it('never repeats a word immediately', () => {
    for (const featureId of documents.keys()) {
      expect(userCopy(featureId), featureId).not.toMatch(/\b(\w+)\s+\1\b/i);
    }
  });

  it('quotes only text a user can find on screen', () => {
    for (const document of documents.values()) {
      for (const step of document.steps) {
        const text = realiseInstruction(step.proposition) ?? '';
        for (const quoted of text.matchAll(/"([^"]+)"/g)) {
          const label = quoted[1]!;
          const onScreen = graph.nodes.some(
            (node) => (node as unknown as Record<string, unknown>)['label'] === label,
          );
          expect(onScreen, `"${label}" is quoted but appears on no control`).toBe(true);
        }
      }
    }
  });

  it('emits no empty section', () => {
    for (const [featureId, document] of documents) {
      // A title may now be absent — Closed Loop #8 removed the identifier
      // fallback, so a feature the interface does not name goes without. What it
      // may never be is present and empty.
      if (document.title !== undefined) {
        expect(document.title.text.trim().length, featureId).toBeGreaterThan(0);
      }
      for (const question of document.questions) {
        expect(question.text.trim().length, featureId).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic', () => {
    for (const feature of model.features) {
      const first = compileGuidance({ model, feature, graph });
      const second = compileGuidance({ model, feature, graph });
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });
});

// ---------------------------------------------------------------------------
// The label rules, directly
// ---------------------------------------------------------------------------

describe('label normalisation', () => {
  it('takes a noun from an identifier and never a verb phrase', () => {
    expect(normaliseIdentifier('nav.clients')).toBe('Clients');
    expect(normaliseIdentifier('clients.create')).toBe('Create');
    expect(normaliseIdentifier('invoices.create-form')).toBe('Create');
  });

  it('finds the entity a compound namespace is about', () => {
    expect(entityNoun('clients.create')).toBe('client');
    expect(entityNoun('invoices.create-form.submit')).toBe('invoice');
    // `client-detail` is the detail screen *of a client*.
    expect(entityNoun('client-detail.rename')).toBe('client');
  });

  it('refuses to treat scaffolding as a thing the user has', () => {
    // "You can open a nav." was grammatical, derived from real data, and
    // meaningless.
    expect(entityNoun('nav.clients')).toBeUndefined();
    expect(entityNoun('app.shell')).toBeUndefined();
  });
});
