/**
 * Freshness: deciding what has to be regenerated.
 *
 * Enrichment is the expensive half of the pipeline, and almost none of it needs
 * to happen twice. A fingerprint is a hash of the *facts a feature was derived
 * from* — not of the generated prose, and not of the whole graph. Same facts,
 * same hash, and the stored language can be reused verbatim; any change inside
 * the neighbourhood and the hash moves, so that feature — and only that feature
 * — is stale.
 *
 * Hashing the facts rather than the file is what makes this selective. A commit
 * that reformats a component leaves every node id, provenance and relationship
 * exactly where it was, so nothing regenerates. A commit that moves a handler to
 * a different line changes the provenance of one node, and one feature
 * regenerates.
 *
 * "The facts" means **every** fact, not the identifying ones. Both hashes here
 * cover whole records — labels, tiers, excerpts, the lot — because a hash that
 * covered a chosen subset would answer "did anything change?" with "no" for
 * every change to a field nobody remembered to add to the list, and the cost of
 * that answer is stale prose presented as current.
 *
 * `dependsOn` is kept alongside the hash so a human can see *why* something went
 * stale, which a hash alone can never explain.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import { compareStrings } from './compare.js';
import type { EvidencePack } from './evidence-pack.js';
import { toEvidenceDocument } from './prompt.js';

/** Hex-encoded SHA-256 of a canonical string. */
function sha256(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * A value as one stable string, with object keys in sorted order.
 *
 * Hashing whole records rather than a hand-picked list of fields is the whole
 * point. A subset has to be maintained, and the failure mode when it is not is
 * silent: an element's label, an endpoint's `observedOn` tier, a relationship's
 * excerpt are all facts that reach the model and change what it is told, and a
 * hash that ignored them would report "nothing changed" about two applications
 * that describe differently. Adding a field to the graph must move the hash
 * without anyone remembering to come here.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => compareStrings(a, b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

/**
 * Hashes the graph facts one feature depends on.
 *
 * The payload is **exactly what the model would be shown**: the evidence
 * document `./prompt.ts` builds, canonicalised. That is the right question to
 * ask, because the fingerprint decides whether the stored answer may be reused,
 * and an answer may be reused precisely when the question has not changed.
 *
 * It matters that this is the projection rather than a summary of it. Hashing
 * ids, kinds, provenance and relationship types — which is what this used to do
 * — leaves out every readable fact in the pack: a button relabelled from "Create
 * client" to "Archive client permanently" does not move a single line, so the
 * prose written for the old label is copied forward for the new one, and the run
 * reports nothing stale. The projection carries labels, endpoint tiers, schema
 * libraries, evidence excerpts and the graph's own refusals, so a change in any
 * of them is a change here.
 *
 * Deliberately excluded, because the projection excludes them: generated prose,
 * the pack's limits, and anything with a clock in it.
 */
export function dependencyFingerprint(pack: EvidencePack): { hash: string; dependsOn: string[] } {
  const dependsOn = [
    ...new Set([
      ...pack.nodes.map((node) => node.id),
      ...pack.relationships.map((relationship) => relationship.id),
    ]),
  ].sort(compareStrings);

  return { hash: sha256(canonical(toEvidenceDocument(pack))), dependsOn };
}

/**
 * Hashes a whole graph.
 *
 * Recorded on a Product Model so a reader can answer "which version of the
 * application does this describe?" without a commit id — useful when the model
 * was generated from a working tree, which is most of the time.
 */
export function graphHash(graph: ApplicationGraph): string {
  const nodeLines = graph.nodes.map((node) => `node\t${canonical(node)}`).sort(compareStrings);
  const relationshipLines = graph.relationships
    .map((relationship) => `relationship\t${canonical(relationship)}`)
    .sort(compareStrings);
  const diagnosticLines = graph.diagnostics
    .map((diagnostic) => `diagnostic\t${canonical(diagnostic)}`)
    .sort(compareStrings);

  return sha256(
    [
      `version\t${graph.version}`,
      `application\t${graph.application ?? ''}`,
      ...nodeLines,
      ...relationshipLines,
      ...diagnosticLines,
    ].join('\n'),
  );
}
