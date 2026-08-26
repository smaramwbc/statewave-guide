/**
 * Freshness: what has to move a hash, and what a hash is allowed to ignore.
 *
 * A fingerprint decides whether a stored answer may be reused **without asking a
 * model again**. So the property under test is not "the hash is stable" — a
 * constant would be stable — but the exact opposite: every fact that would
 * change what the model is told has to change the hash. A hash over a chosen
 * subset of fields passes a stability test and fails at the only job it has,
 * silently, on the day someone adds a field to the graph.
 *
 * Each case below changes one readable fact and nothing else. No node moves, no
 * id changes, no relationship is added, and the prompt the model would receive
 * is different in every one of them.
 */

import { describe, expect, it } from 'vitest';
import type { ApplicationGraph, ApplicationNode } from '@statewavedev/guide-indexer';
import { discoverFeatureCandidates } from '../src/candidates.js';
import { enrichApplicationGraph } from '../src/enrich.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { dependencyFingerprint, graphHash } from '../src/fingerprint.js';
import { buildFeatureEnrichmentRequest } from '../src/prompt.js';
import { createMockProvider } from '../src/providers/mock.js';
import { ID, clientsGraph } from './helpers.js';

/** The fingerprint of `clients.create` in this graph. */
function fingerprintOf(graph: ApplicationGraph): string {
  const candidate = discoverFeatureCandidates(graph).find((entry) => entry.id === 'clients.create');
  if (candidate === undefined) throw new Error('the fixture lost its candidate');
  return dependencyFingerprint(buildEvidencePack(graph, candidate)).hash;
}

/** The prompt `clients.create` would be sent from this graph. */
function promptOf(graph: ApplicationGraph): string {
  const candidate = discoverFeatureCandidates(graph).find((entry) => entry.id === 'clients.create');
  if (candidate === undefined) throw new Error('the fixture lost its candidate');
  return buildFeatureEnrichmentRequest(buildEvidencePack(graph, candidate)).evidence;
}

/** The fixture graph with one node rewritten in place. */
function graphWith(
  change: (node: ApplicationNode) => ApplicationNode | undefined,
): ApplicationGraph {
  const graph = clientsGraph();
  return { ...graph, nodes: graph.nodes.map((node) => change(node) ?? node) };
}

describe('a readable fact that reaches the prompt reaches the hash', () => {
  it('a relabelled button', () => {
    // The failure this pins: relabel "Create client" to "Archive client
    // permanently" without moving a line, and a hash over ids and provenance
    // cannot tell. The stored sentence — written for the old label — would be
    // republished for the new one, with nothing reported as stale.
    const relabelled = graphWith((node) =>
      node.id === ID.create && node.kind === 'element'
        ? { ...node, label: 'Archive client permanently' }
        : undefined,
    );
    expect(promptOf(relabelled)).toContain('Archive client permanently');
    expect(fingerprintOf(relabelled)).not.toBe(fingerprintOf(clientsGraph()));
    expect(graphHash(relabelled)).not.toBe(graphHash(clientsGraph()));
  });

  it('an endpoint proven on one tier rather than two', () => {
    // `observedOn` is what `candidates.ts` reads to decide whether an endpoint
    // is a feature at all, and it is shown to the model as a fact.
    const oneTier = graphWith((node) =>
      node.id === ID.post && node.kind === 'api'
        ? { ...node, observedOn: ['frontend'] }
        : undefined,
    );
    expect(graphHash(oneTier)).not.toBe(graphHash(clientsGraph()));
    expect(fingerprintOf(oneTier)).not.toBe(fingerprintOf(clientsGraph()));
  });

  it('a relationship excerpt', () => {
    const graph = clientsGraph();
    const rewritten: ApplicationGraph = {
      ...graph,
      relationships: graph.relationships.map((relationship) =>
        relationship.source === ID.create
          ? {
              ...relationship,
              evidence: relationship.evidence.map((record) => ({
                ...record,
                excerpt: 'onClick={() => archiveClient(id)}',
              })),
            }
          : relationship,
      ),
    };
    expect(promptOf(rewritten)).toContain('archiveClient');
    expect(fingerprintOf(rewritten)).not.toBe(fingerprintOf(graph));
    expect(graphHash(rewritten)).not.toBe(graphHash(graph));
  });

  it('POSITIVE CONTROL: an identical graph hashes identically', () => {
    expect(fingerprintOf(clientsGraph())).toBe(fingerprintOf(clientsGraph()));
    expect(graphHash(clientsGraph())).toBe(graphHash(clientsGraph()));
  });
});

describe('reuse follows the hash', () => {
  it('regenerates the feature whose button was relabelled, and only that one', async () => {
    const first = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    const relabelled = graphWith((node) =>
      node.id === ID.create && node.kind === 'element'
        ? { ...node, label: 'Archive client permanently' }
        : undefined,
    );
    const provider = createMockProvider();
    const second = await enrichApplicationGraph({
      graph: relabelled,
      provider,
      previous: first.model,
    });

    expect(provider.calls.map((call) => call.featureId)).toContain('clients.create');
    expect(second.reused).not.toContain('clients.create');
  });
});
