/**
 * One interaction, observed end to end.
 *
 * Wraps the before/act/after sequence so every experiment records the same
 * things in the same order, and so the causal window is opened and closed by the
 * harness rather than remembered by each test.
 */

import { act, fireEvent } from '@testing-library/react';
import { assertPermitted, diffSnapshots, verifyRuntimeCapability } from '../../src/index.js';
import type {
  InteractionAction,
  InteractionSafety,
  InteractionTrace,
  ObservedEffect,
  RuntimeCapabilityCandidate,
  RuntimeCapabilityKind,
  RuntimeVerification,
} from '../../src/index.js';
import type { Harness } from './app-harness.js';

export interface ProbeInput {
  app: Harness;
  traceId: string;
  action: InteractionAction;
  /** Milliseconds to let the application settle. Debounces need this. */
  settleMs?: number;
  allowed?: InteractionSafety;
}

/** Runs one interaction and returns the trace. */
export async function probe(input: ProbeInput): Promise<InteractionTrace> {
  const { app, action } = input;
  assertPermitted(action, input.allowed ?? 'SAFE_PROBE');

  await app.settle();
  const beforeSnapshot = app.snapshot(`${input.traceId}:before`);

  const target = app.find(action.targetSemanticId);
  if (target === null) {
    throw new Error(`No rendered control carries the semantic id ${action.targetSemanticId}.`);
  }

  app.beginWindow(input.traceId);
  await act(async () => {
    switch (action.kind) {
      case 'click':
        fireEvent.click(target);
        break;
      case 'type':
        fireEvent.change(target, { target: { value: input.action.valueShape ?? 'probe' } });
        break;
      case 'select':
        fireEvent.change(target, { target: { value: input.action.valueShape ?? '' } });
        break;
      case 'submit':
        fireEvent.submit(target);
        break;
      case 'focus':
        fireEvent.focus(target);
        break;
    }
  });
  if (input.settleMs !== undefined) await app.advance(input.settleMs);
  await app.settle();

  const afterSnapshot = app.snapshot(`${input.traceId}:after`);
  const requests = app.requestsInWindow();
  app.endWindow();

  return {
    traceId: input.traceId,
    beforeSnapshot,
    action,
    afterSnapshot,
    observedEffects: diffSnapshots({ before: beforeSnapshot, after: afterSnapshot, requests }),
  };
}

/** Proposes a capability from a trace and asks the verifier about it. */
export function ask(
  trace: InteractionTrace,
  kind: RuntimeCapabilityKind,
  extras: { visualProposals?: readonly string[]; effects?: readonly ObservedEffect[] } = {},
): { candidate: RuntimeCapabilityCandidate; verdict: RuntimeVerification } {
  const candidate: RuntimeCapabilityCandidate = {
    kind,
    subjectRef: `element:${trace.action.targetSemanticId}`,
    runtimeEvidence: extras.effects ?? trace.observedEffects,
    staticEvidence: [],
    visualProposals: extras.visualProposals ?? [],
    traceId: trace.traceId,
  };
  return { candidate, verdict: verifyRuntimeCapability(candidate, trace) };
}
