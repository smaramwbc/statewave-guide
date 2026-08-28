/**
 * A step is displayed whether or not a guide could perform it.
 *
 * Closed Loop #13 shipped a create-client answer that opened a dialog, filled in
 * three fields, and never mentioned submitting it. The terminal step existed in
 * the stored guidance and was lost in a second implementation of "turn a
 * proposition into a sentence" that did not handle `confirm_action` — so it
 * disappeared *silently*, which is the failure mode this project has spent
 * several loops removing everywhere else.
 *
 * Instruction and automation permission are different questions. The guide will
 * never click "Create client"; that is precisely why the user has to be told to.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGuideQueryEngine } from '../src/query/engine.js';
import type { GuideKnowledgeBundle } from '../src/query/bundle.js';

const bundle = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures', 'guide-bundle.json'), 'utf8'),
) as GuideKnowledgeBundle;
const guide = createGuideQueryEngine({ bundle });

describe('terminal steps', () => {
  it('keeps the step that finishes the task', () => {
    const response = guide.query({ query: 'How do I create a client?' });
    const texts = response.answer?.steps.map((step) => step.text) ?? [];
    expect(texts).toContain('Choose "New client".');
    expect(texts).toContain("Enter the client's billing email, name and plan.");
    expect(texts).toContain('Choose "Create client".');
  });

  it('keeps it when the user is already on the screen', () => {
    const response = guide.query({
      query: 'How do I create a client?',
      context: { route: '/clients', applicationVersion: bundle.applicationVersion },
    });
    const texts = response.answer?.steps.map((step) => step.text) ?? [];
    expect(texts.some((text) => text.startsWith('Open '))).toBe(false);
    expect(texts).toContain('Choose "Create client".');
  });

  it('keeps it when the control it names is already visible', () => {
    // Seeing a button is not the same as having pressed it.
    const response = guide.query({
      query: 'How do I create a client?',
      context: {
        route: '/clients',
        applicationVersion: bundle.applicationVersion,
        visibleSemanticIds: ['clients.create', 'clients.create-dialog.submit'],
      },
    });
    expect(response.answer?.steps.map((step) => step.text)).toContain('Choose "Create client".');
  });

  it('never prunes anything that is not an entry step', () => {
    for (const feature of bundle.features) {
      const response = guide.query({
        query: `How do I ${feature.guidance.title?.text ?? feature.featureId}?`,
        context: { route: '/clients', applicationVersion: bundle.applicationVersion },
      });
      for (const entry of response.pruned) {
        expect(entry.text.startsWith('Choose ')).toBe(false);
        expect(entry.text.startsWith('Enter ')).toBe(false);
      }
    }
  });

  it('carries every stored step into the bundle, phrased', () => {
    // The defect was a kind the query layer did not know about. Nothing may be
    // in the guidance and absent from the realised steps.
    for (const feature of bundle.features) {
      expect(feature.steps.length).toBe(feature.guidance.steps.length);
      for (const step of feature.steps) expect(step.text.length).toBeGreaterThan(0);
    }
  });

  it('renders a terminal step even though no safe action can perform it', () => {
    const response = guide.query({
      query: 'How do I create a client?',
      context: { route: '/clients', applicationVersion: bundle.applicationVersion },
    });
    const terminal = response.answer?.steps.find((step) => step.text.includes('Create client'));
    expect(terminal).toBeDefined();
    // It is addressable, and nothing in the closed union operates it.
    expect(terminal?.semanticId).toBe('clients.create-dialog.submit');
    for (const action of response.actions) {
      expect(['navigate', 'highlight', 'scroll', 'focus', 'open_guide_step']).toContain(
        action.kind,
      );
    }
  });
});
