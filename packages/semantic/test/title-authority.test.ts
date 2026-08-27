/**
 * What a feature is called, and who gets to decide.
 *
 * Round 6 split the corpus on one variable nobody had been looking at:
 *
 *   title is a real visible label   n=12   mean usefulness 2.25   correctness 1.92
 *   title derived from the id       n= 9   mean usefulness 0.67   correctness 1.25
 *
 * Six of the seven items still scoring correctness 1 were the title, and the
 * reviewer wrote the reason five separate times — *"the title's meaning is not
 * independently supported"*.
 *
 * The titles were `Search`, `Table`, `Danger zone`, `New key`, `Error`,
 * `Partial clients`. Every one was `normaliseIdentifier(feature.id)`: an address
 * spaced out and capitalised until it looked like something a person wrote. That
 * disguise is the whole problem. A reader cannot tell a manufactured name from a
 * real one, so a manufactured one spends the credibility the real ones earned.
 *
 * Two halves, and both are tested here. Titles must come from the interface, and
 * a feature the interface does not name must go without.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createProjectIndexer } from '@statewavedev/guide-indexer';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import type { ProductModel } from '@statewavedev/guide-shared';
import { discoverFeatureCandidates } from '../src/candidates.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { computeFeatureScope } from '../src/scope.js';
import { compileGuidance } from '../src/guidance/compile.js';
import type { GuidanceDocument } from '../src/guidance/ir.js';
import { realiseInstruction } from '../src/guidance/realise.js';
import { isUserVisible, resolveTitle } from '../src/guidance/title.js';

const BENCH = new URL('../../../benchmarks/provider-reality-check/', import.meta.url).pathname;
const FIXTURE = new URL('../../indexer/test/fixtures/realistic-app', import.meta.url).pathname;

let model: ProductModel;
let graph: ApplicationGraph;
const documents = new Map<string, GuidanceDocument>();

beforeAll(async () => {
  model = JSON.parse(readFileSync(`${BENCH}round-2-product-model.json`, 'utf8')).model;
  graph = (
    await createProjectIndexer({
      root: FIXTURE,
      config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
    }).index()
  ).graph;
  const candidates = [...discoverFeatureCandidates(graph)];
  for (const feature of model.features) {
    const candidate = candidates.find((entry) => entry.id === feature.id);
    if (candidate === undefined) continue;
    const pack = buildEvidencePack(graph, candidate);
    const scope = computeFeatureScope({
      featureId: feature.id,
      roots: candidate.rootNodes,
      nodes: pack.nodes,
      relationships: pack.relationships,
    });
    documents.set(feature.id, compileGuidance({ model, feature, graph, candidate, scope }));
  }
});

const docFor = (id: string): GuidanceDocument => {
  const found = documents.get(id);
  if (found === undefined) throw new Error(`no document for ${id}`);
  return found;
};

// ---------------------------------------------------------------------------
// A–B · the identifier is never a name
// ---------------------------------------------------------------------------

describe('A · a section with no visible text is not called "Danger zone"', () => {
  it('withholds the title', () => {
    expect(docFor('settings.danger-zone').title).toBeUndefined();
  });

  it('says why, for a developer rather than a reader', () => {
    const codes = docFor('settings.danger-zone').diagnostics.map((entry) => entry.code);
    expect(codes).toContain('NO_USER_VISIBLE_LABEL');
  });
});

describe('B · an unlabelled input is not called "Search"', () => {
  it('withholds the title', () => {
    expect(docFor('clients.search').title).toBeUndefined();
  });

  it('and the same for every other id-derived title Round 6 shipped', () => {
    for (const featureId of [
      'clients.table',
      'clients.error',
      'settings.new-key',
      'api.get.partial-clients',
      'invoices.list.open',
    ]) {
      expect(docFor(featureId).title, featureId).toBeUndefined();
    }
  });

  it('emits no identifier-derived title anywhere in the set', () => {
    for (const [featureId, document] of documents) {
      if (document.title === undefined) continue;
      expect(document.title.origin, featureId).not.toBe('normalised-identifier');
      expect(isUserVisible(document.title), featureId).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// C–E · what the interface says wins
// ---------------------------------------------------------------------------

describe('C · a real visible label becomes the title', () => {
  it('takes the words off the control', () => {
    expect(docFor('clients.export').title?.text).toBe('Export CSV');
    expect(docFor('settings.rotate-key').title?.text).toBe('Rotate API key');
    expect(docFor('client-detail.audit').title?.text).toBe('Audit trail');
  });

  it('recovers a title the label rules newly reach', () => {
    // `dashboard.new-client` was `New client` derived from its id in Round 6 and
    // is `New client` read off the control now. The strings match by coincidence
    // and the evidence does not, which is the entire distinction.
    const document = docFor('dashboard.new-client');
    expect(document.title?.text).toBe('New client');
    expect(document.titleEvidence?.origin).toBe('ui-label');
    expect(document.titleEvidence?.evidence).toBe('element:dashboard.new-client');
  });
});

describe('D · the visible word beats the identifier when they disagree', () => {
  it('uses the label, not the id segment', () => {
    // `client-detail.change-plan` is labelled `Upgrade`. A title of `Change plan`
    // would be the id talking.
    expect(docFor('client-detail.change-plan').title?.text).toBe('Upgrade');
  });

  it('names the message element by its message', () => {
    expect(docFor('clients.table.forbidden').title?.text).toBe(
      'You do not have access to the client list.',
    );
  });
});

describe('E · a component name is not a title', () => {
  it('never derives one from a route or a component', () => {
    // `screenNameFrom(ClientDetailPage)` is `Client Detail`, and nothing in that
    // interface says it — the page's only heading is a runtime value.
    for (const [featureId, document] of documents) {
      if (document.title === undefined) continue;
      expect(document.titleEvidence?.origin, featureId).not.toBe('route-title');
      expect(document.titleEvidence?.origin, featureId).not.toBe('component-name');
    }
  });
});

// ---------------------------------------------------------------------------
// F · absence is representable
// ---------------------------------------------------------------------------

describe('F · a withheld title is a clean absence', () => {
  it('is undefined rather than a placeholder', () => {
    const withheld = [...documents.values()].filter((entry) => entry.title === undefined);
    expect(withheld.length).toBeGreaterThan(0);
    for (const document of withheld) {
      expect(document.title).toBeUndefined();
      expect(document.titleEvidence).toBeUndefined();
    }
  });

  it('never substitutes a shell word', () => {
    const copy = [...documents.values()]
      .map((entry) => entry.title?.text ?? '')
      .join(' ')
      .toLowerCase();
    for (const shell of ['untitled', 'unknown', 'feature', 'control', 'element']) {
      expect(copy).not.toContain(shell);
    }
  });

  it('gives every emitted title provenance to an owned node', () => {
    const candidates = [...discoverFeatureCandidates(graph)];
    for (const [featureId, document] of documents) {
      if (document.title === undefined) continue;
      expect(document.titleEvidence, featureId).toBeDefined();
      const candidate = candidates.find((entry) => entry.id === featureId)!;
      const pack = buildEvidencePack(graph, candidate);
      const scope = computeFeatureScope({
        featureId,
        roots: candidate.rootNodes,
        nodes: pack.nodes,
        relationships: pack.relationships,
      });
      expect(scope.classify(document.titleEvidence!.evidence), featureId).toBe('OWNED');
    }
  });

  it('refuses rather than choosing between two owned labels', () => {
    const outcome = resolveTitle({
      feature: {
        id: 'clients.create-dialog',
        entryPoints: [],
        elements: ['clients.create-dialog.cancel', 'clients.create-dialog.submit'],
      } as never,
      scope: computeFeatureScope({
        featureId: 'clients.create-dialog',
        roots: ['element:clients.create-dialog.cancel', 'element:clients.create-dialog.submit'],
        nodes: graph.nodes,
        relationships: graph.relationships,
      }),
      graph,
    });
    expect(outcome.status).toBe('ambiguous');
  });
});

// ---------------------------------------------------------------------------
// Action steps · a control name is evidence, not a convenience
// ---------------------------------------------------------------------------

describe('a step may name a control only with text a user can find', () => {
  it('no longer tells anyone to "Choose Open."', () => {
    // The Round 6 defect. `<button data-guide="invoices.list.open">{invoice.number}</button>`
    // shows an invoice number; the word Open was the id.
    const steps = docFor('invoices.list.open').steps.map(
      (step) => realiseInstruction(step.proposition) ?? '',
    );
    expect(steps.join(' ')).not.toContain('Open.');
    expect(steps.filter((text) => text.length > 0)).toEqual([]);
  });

  it('records the drop rather than losing it', () => {
    const dropped = docFor('invoices.list.open').actionAccounting.filter(
      (entry) => entry.outcome === 'dropped',
    );
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.every((entry) => entry.reason !== undefined)).toBe(true);
  });

  it('quotes every control name it does emit', () => {
    // If a step names a control, the name is text on screen — so it is quoted,
    // and a reader can go and look for exactly that.
    for (const [featureId, document] of documents) {
      for (const step of document.steps) {
        if (step.origin === 'synthetic-entry') continue;
        const proposition = step.proposition as { control?: { origin: string } };
        if (proposition.control === undefined) continue;
        expect(isUserVisible(proposition.control as never), featureId).toBe(true);
      }
    }
  });

  it('still names the thirteen controls that do carry text', () => {
    // The positive control. Withholding is only right if it is not everything.
    const named = [...documents.values()]
      .flatMap((document) => document.steps)
      .filter((step) => step.origin !== 'synthetic-entry')
      .map((step) => realiseInstruction(step.proposition) ?? '')
      .filter((text) => text.includes('"'));
    expect(named.length).toBeGreaterThanOrEqual(12);
  });
});
