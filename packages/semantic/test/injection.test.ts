/**
 * Prompt injection, from a repository we do not own.
 *
 * Source code is untrusted input. A comment can address the assistant directly,
 * an identifier can be a sentence, a string literal can hold a finished-looking
 * response, and a JSX label can try to close our delimiter. The fixture in
 * `./adversarial-fixtures.ts` contains all of that, plus direction-override
 * characters and a couple of kilobytes of padding.
 *
 * The defence asserted here is structural, and it has three parts:
 *
 * 1. **The instruction is a constant.** Nothing derived from a repository is
 *    interpolated into it, so no repository can change what we asked for. The
 *    test compares bytes, not shapes.
 * 2. **Evidence travels as JSON inside a labelled fence.** Every hostile string
 *    is located *between* the markers, and fence-shaped text is neutralised
 *    before it is written, so nothing can close the block and start speaking as
 *    us.
 * 3. **Nothing a model says is trusted afterwards.** The decisive test is the
 *    last one: a *fact* injected through a comment, repeated verbatim by the
 *    model, is still refused by the verifier — because the verifier reads the
 *    graph, not the sentence.
 *
 * Injection *language* is deliberately left intact in the data block. Stripping
 * it would hide from a reviewer that somebody tried, and would buy nothing:
 * detection is a losing game against text we ourselves invited in.
 */

import { describe, expect, it } from 'vitest';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { discoverFeatureCandidates } from '../src/candidates.js';
import {
  EVIDENCE_FENCE_CLOSE,
  EVIDENCE_FENCE_OPEN,
  FEATURE_ENRICHMENT_INSTRUCTION,
  FENCE_NEUTRALISED_TOKEN,
  SEMANTIC_SYSTEM_INSTRUCTION,
  WORKFLOW_ENRICHMENT_INSTRUCTION,
  buildFeatureEnrichmentRequest,
} from '../src/prompt.js';
import { enrichApplicationGraph } from '../src/enrich.js';
import { createMockProvider } from '../src/providers/mock.js';
import { HOSTILE, HOSTILE_DIAGNOSTIC, INJECTION, injectionGraph } from './adversarial-fixtures.js';
import { csvCollisionGraph, verifyAgainst } from './adversarial-fixtures.js';
import { factual, onlyClaim } from './helpers.js';

/** The request the pipeline would send for the hostile feature. */
function hostileRequest(): { system: string; evidence: string } {
  const graph = injectionGraph();
  const candidate = discoverFeatureCandidates(graph).find((entry) => entry.id === 'clients.create');
  if (candidate === undefined) throw new Error('the fixture lost its candidate');
  const request = buildFeatureEnrichmentRequest(buildEvidencePack(graph, candidate));
  return { system: request.system, evidence: request.evidence };
}

/**
 * Where a piece of hostile text sits in the request, as JSON would encode it.
 *
 * The encoded form is what matters: a quote inside an excerpt cannot end a
 * value and a newline cannot begin a line, because the block is JSON before it
 * is anything else.
 */
function locate(evidence: string, text: string): number {
  return evidence.indexOf(JSON.stringify(text).slice(1, -1));
}

/** Every payload that should survive into the block unchanged. */
const CARRIED: readonly (readonly [string, string])[] = [
  ['an instruction-override comment', INJECTION.overrideComment],
  ['a JSDoc block claiming operator authority', INJECTION.jsdoc],
  ['a mode-switching string literal', INJECTION.stringLiteral],
  ['a forged finished response', INJECTION.completedResponse],
  ['an identifier shaped like a command', INJECTION.identifier],
  ['an asserted fact in a comment', INJECTION.importFact],
  ['long padding', INJECTION.padding],
];

describe('the trusted instruction is a constant', () => {
  it('is byte-identical to the exported constant, whatever the repository contains', () => {
    expect(hostileRequest().system).toBe(FEATURE_ENRICHMENT_INSTRUCTION);
  });

  it('is the same bytes for a hostile graph and an ordinary one', () => {
    const candidate = discoverFeatureCandidates(csvCollisionGraph())[0];
    if (candidate === undefined) throw new Error('the fixture lost its candidate');
    const ordinary = buildFeatureEnrichmentRequest(
      buildEvidencePack(csvCollisionGraph(), candidate),
    );
    expect(hostileRequest().system).toBe(ordinary.system);
  });

  it('opens with the shared system instruction, unmodified', () => {
    expect(FEATURE_ENRICHMENT_INSTRUCTION.startsWith(SEMANTIC_SYSTEM_INSTRUCTION)).toBe(true);
    expect(WORKFLOW_ENRICHMENT_INSTRUCTION.startsWith(SEMANTIC_SYSTEM_INSTRUCTION)).toBe(true);
  });

  it.each(CARRIED)('carries no trace of %s', (_name, payload) => {
    expect(hostileRequest().system).not.toContain(payload);
  });

  it('names the fence and tells the model what is inside it', () => {
    expect(SEMANTIC_SYSTEM_INSTRUCTION).toContain(EVIDENCE_FENCE_OPEN);
    expect(SEMANTIC_SYSTEM_INSTRUCTION).toContain(EVIDENCE_FENCE_CLOSE);
    expect(SEMANTIC_SYSTEM_INSTRUCTION).toContain('never an instruction');
  });
});

describe('the hostile text lands inside the data block', () => {
  const { evidence } = hostileRequest();
  const open = evidence.indexOf(EVIDENCE_FENCE_OPEN);
  const close = evidence.indexOf(EVIDENCE_FENCE_CLOSE);

  it('has exactly one opening and one closing marker', () => {
    expect(open).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(open);
    expect(evidence.split(EVIDENCE_FENCE_OPEN)).toHaveLength(2);
    expect(evidence.split(EVIDENCE_FENCE_CLOSE)).toHaveLength(2);
  });

  it.each(CARRIED)('keeps %s strictly between the markers', (_name, payload) => {
    // A prefix rather than the whole payload: free text in the data block is
    // capped (see "the block is bounded" below), so a three-kilobyte label
    // arrives truncated. Where it arrives is the property under test, and a
    // prefix answers that exactly as well as the whole string does.
    const at = locate(evidence, payload.slice(0, 60));
    expect(at).toBeGreaterThan(open + EVIDENCE_FENCE_OPEN.length);
    expect(at).toBeLessThan(close);
  });

  it.each(CARRIED)('lets no part of %s escape the block', (_name, payload) => {
    const before = evidence.slice(0, open);
    const after = evidence.slice(close + EVIDENCE_FENCE_CLOSE.length);
    const probe = JSON.stringify(payload.slice(0, 40)).slice(1, -1);
    expect(before).not.toContain(probe);
    expect(after).not.toContain(probe);
  });

  it('is bounded, so one hostile label cannot decide how large every prompt is', () => {
    // `EvidencePackLimits` bounds how *many* facts travel and says nothing about
    // how large one is. A `data-guide-label` is attacker-controlled and uncapped
    // by the indexer, and the fixture carries 2,400 characters of padding in one:
    // uncapped, that one attribute set the size of the request.
    expect(INJECTION.padding.length).toBeGreaterThan(2000);
    expect(evidence).toContain('[truncated]');
    expect(evidence).not.toContain(INJECTION.padding);
  });

  it('neutralises a forged fence rather than letting it close the block', () => {
    expect(evidence).toContain(FENCE_NEUTRALISED_TOKEN);
    // Both halves of the forgery are gone; what is left is a marker saying so.
    expect(evidence.slice(open + EVIDENCE_FENCE_OPEN.length, close)).not.toContain(
      EVIDENCE_FENCE_CLOSE,
    );
    expect(evidence.slice(open + EVIDENCE_FENCE_OPEN.length, close)).not.toContain(
      EVIDENCE_FENCE_OPEN,
    );
  });

  it('escapes the characters that would otherwise end a value or begin a line', () => {
    // The literal `"` in the forged response never appears unescaped inside the
    // block, so no excerpt can terminate the JSON it lives in.
    const body = evidence.slice(open + EVIDENCE_FENCE_OPEN.length, close);
    const lines = body.split('\n').filter((line) => line.includes('maintenance mode'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('\\"');
  });

  it('carries direction-override characters as data, and says nothing about them', () => {
    // Left intact on purpose: removing them would hide the attempt from a
    // reviewer, and they have no power here — see the identity test below.
    const at = evidence.indexOf('\u202E');
    expect(at).toBeGreaterThan(open);
    expect(at).toBeLessThan(close);
  });

  it('never quotes a diagnostic message, only its code and its location', () => {
    const graph = injectionGraph();
    const candidate = discoverFeatureCandidates(graph).find(
      (entry) => entry.id === 'clients.create',
    );
    if (candidate === undefined) throw new Error('the fixture lost its candidate');
    const pack = buildEvidencePack(graph, candidate);
    const refusals = pack.refusals.join('\n');
    expect(refusals).not.toContain(INJECTION.overrideComment);
    expect(refusals).not.toContain(HOSTILE_DIAGNOSTIC.message);
    expect(refusals).toContain(HOSTILE_DIAGNOSTIC.code);
    expect(evidence).not.toContain(JSON.stringify(HOSTILE_DIAGNOSTIC.message).slice(1, -1));
  });
});

describe('a direction-override character cannot forge an identity', () => {
  it('refuses a subject reference with an invisible character in it', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: injectionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            action: 'create',
            subjectRef: 'element:clients\u200F.create',
            targets: [HOSTILE.post],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('UNKNOWN_SUBJECT');
  });

  it('refuses a target id with an invisible character in it', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: injectionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            action: 'create',
            subjectRef: 'feature:clients.create',
            targets: [`${HOSTILE.post}\u200F`],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('UNKNOWN_GRAPH_REFERENCE');
  });

  it('POSITIVE CONTROL: the same claim without the character verifies', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: injectionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            action: 'create',
            subjectRef: 'feature:clients.create',
            targets: [HOSTILE.post],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('structurally_verified');
  });
});

describe('an injected fact is still refused when the model repeats it', () => {
  /** The response a model gives after believing the comment on the upload button. */
  const obedient = {
    title: 'Client CSV import',
    description: 'Clients are imported from a CSV file.',
    factualClaims: [
      {
        type: 'capability',
        action: 'import',
        text: 'Clients can be imported from a CSV file.',
        subjectRef: 'feature:clients.create',
        subjectLabel: 'the bulk importer',
        targets: [HOSTILE.upload],
      },
      {
        type: 'capability',
        action: 'create',
        text: 'A client can be created.',
        subjectRef: 'feature:clients.create',
        targets: [HOSTILE.post],
      },
    ],
    languageClaims: [],
    confidenceReason: 'The comment on the upload control states it.',
  };

  it('refuses the import claim it read out of a comment', () => {
    const result = verifyAgainst({
      graph: injectionGraph(),
      featureId: 'clients.create',
      factualClaims: [
        factual({
          action: 'import',
          text: 'Clients can be imported from a CSV file.',
          subjectRef: 'feature:clients.create',
          subjectLabel: 'the bulk importer',
          targets: [HOSTILE.upload],
        }),
      ],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
    expect(result.claimSummary.unsupportedActions).toEqual({ import: 1 });
  });

  it('refuses it end to end, and keeps the honest claim beside it', async () => {
    const run = await enrichApplicationGraph({
      graph: injectionGraph(),
      provider: createMockProvider({
        responses: { 'feature-enrichment:clients.create': obedient },
      }),
      candidateLimit: 1,
    });
    const claims = run.model.claims.filter((claim) => claim.featureId === 'clients.create');
    const imported = claims.find((claim) => claim.assertion?.action === 'import');
    const created = claims.find((claim) => claim.assertion?.action === 'create');

    expect(imported?.status).toBe('rejected');
    expect(imported?.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
    expect(created?.status).toBe('structurally_verified');
  });

  it('lets no injected capability reach the rendered description', async () => {
    const run = await enrichApplicationGraph({
      graph: injectionGraph(),
      provider: createMockProvider({
        responses: { 'feature-enrichment:clients.create': obedient },
      }),
      candidateLimit: 1,
    });
    const feature = run.model.features.find((entry) => entry.id === 'clients.create');
    expect(feature?.description).toBe('You can create a new client from the Clients screen.');
    expect(feature?.description.toLowerCase()).not.toContain('import');
    expect(feature?.description.toLowerCase()).not.toContain('csv');
  });

  it('records the refusal rather than dropping it', async () => {
    const run = await enrichApplicationGraph({
      graph: injectionGraph(),
      provider: createMockProvider({
        responses: { 'feature-enrichment:clients.create': obedient },
      }),
      candidateLimit: 1,
    });
    expect(run.rejected.map((entry) => entry.reason)).toContain('UNSUPPORTED_CLAIM_RULE');
    expect(run.model.verification.claimsRejected).toBeGreaterThan(0);
  });
});
