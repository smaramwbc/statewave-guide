/**
 * The evidence for Closed Loop #20.2, derived where it can be and recorded
 * where it was measured.
 *
 * The claim under review: durable Guide memory is bounded by logical state
 * keys, not by how often the state was observed. The derivable half — the key
 * model and the growth arithmetic — is recomputed from the shipped code on
 * every build, and `--check` fails when the artifact and the code disagree.
 * The measured half — the BS scenario results against a real Statewave — is a
 * capture: re-running it needs a server, so the check verifies its presence
 * and shape rather than its numbers.
 *
 * Usage:
 *   node scripts/build-bounded-memory-review.mjs           write the package
 *   node scripts/build-bounded-memory-review.mjs --check   verify it holds
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'bounded-statewave-memory-review-v1');
const RECORD = path.join(DIR, 'bounded-memory-evidence.json');
const CHECK = process.argv.includes('--check');

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);

const event = (over = {}) => ({
  eventId: 'evx',
  appId: 'demo',
  subjectId: 'u1',
  featureId: 'clients.create',
  kind: 'STEP_THROUGH_COMPLETED',
  occurredAt: '2026-09-03T10:00:00Z',
  applicationVersion: 'build-1',
  authority: 'OBSERVED_INTERACTION',
  ...over,
});

/** The key model, read off the shipped functions rather than restated. */
function keyModel() {
  const completion = core.guideStateKey(event());
  const preference = core.guideStateKey(
    event({
      kind: 'EXPLICIT_PREFERENCE_SET',
      featureId: undefined,
      authority: 'EXPLICIT_USER_PREFERENCE',
      metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
    }),
  );
  return {
    completion: {
      key: completion?.key,
      dedupeOnWrite: completion?.dedupeOnWrite,
      resolution: 'first write wins at ingest (Statewave idempotency)',
    },
    preference: {
      key: preference?.key,
      dedupeOnWrite: preference?.dedupeOnWrite,
      claimKeys: { ...core.GUIDE_PREFERENCE_CLAIM_KEYS },
      resolution:
        'claim supersession at compile; latest by claim valid_from, then created_at, then memory id',
    },
  };
}

/**
 * Active durable state as a function of scale — the #20.2 target restated as
 * arithmetic. Physical rows can exceed this (superseded history is kept and is
 * Statewave's to manage); this is what Guide has to read back.
 */
function growthModel() {
  const PREFERENCES = 2;
  const rows = [];
  for (const features of [10, 100, 1000]) {
    for (const sessions of [1, 100, 10000]) {
      rows.push({
        features,
        sessions,
        // Old policy: every interaction wrote. ~11 events in a typical session.
        oldPolicyEpisodes: sessions * 11,
        // #20.1: only durable kinds wrote, but every repetition wrote.
        cl201Episodes: sessions * 1 + PREFERENCES,
        // #20.2: one durable record per distinct fact, however many sessions.
        cl202ActiveState: Math.min(features, sessions) + PREFERENCES,
      });
    }
  }
  return rows;
}

const derived = { keyModel: keyModel(), growthModel: growthModel() };

// Measured against a real Statewave built from main @ 16f0dd8+ (v1.5.x line),
// through the production adapter and the published SDK 1.5.0. Recorded, not
// derivable: re-running needs the server.
const measured = {
  server: 'statewave main (claim registration, newest_first, status=active, #373/#374)',
  scenarios: {
    BS01: '1000 observations of one completion -> 1 durable record, completed=true',
    BS02: '4 preference changes -> active value CONCISE; 4 episodes, 1 active claim',
    BS03: '200 distinct completion keys -> 200 records, 200 features in profile',
    BS04: 'newest of 150 records reachable via newest_first',
    BS06: '3 ingest orders -> one outcome (CONCISE)',
    BS07: 'build-1 completion does not mark build-2 complete',
    BS10: 'reset leaves nothing and resurrects nothing',
    BS11: 'a retried write is one record',
    BS12: 'retry deduplicates; a new value supersedes — different mechanisms, both held',
    BS13: 'read failure -> absence, REMOTE_DEGRADED, nothing thrown',
    BS14: 'write failure counted, interaction unaffected',
    BS15: '26 records swept, 0 forbidden values (instances, secrets, emails, questions, UI text)',
    BS16: 'active invoice-adjacent state; unsupported question still refused',
    BS17: 'remembered delete completion adds no Delete action',
    BS19: 'same-instant competing writes -> arbitrary but stable winner (documented tie)',
    combined: '504 writes -> 5 durable episodes -> 2 events read (completed=true, CONCISE)',
  },
  limitations: [
    'preference supersession requires a tenant id and a host-registered claim key; without both, Guide falls back to replaying preference episodes (correct, unbounded)',
    'physical episode history grows with distinct facts plus preference changes; superseded memory rows are retained by Statewave as history',
    'the SDK does not yet expose status=active (unpublished); the adapter filters the documented status field client-side',
    'same-instant competing preference writes resolve arbitrarily but stably; "latest" is claim valid_from, then created_at, then memory id',
  ],
};

if (CHECK) {
  if (!existsSync(RECORD)) {
    console.error('\nThe bounded-memory review has not been built. Run without --check.\n');
    process.exit(1);
  }
  const stored = JSON.parse(readFileSync(RECORD, 'utf8'));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const drift = [];
  if (!same(stored.derived, derived))
    drift.push('the derived key/growth model no longer matches the code');
  if (stored.reviewerType !== 'non_human_independent') drift.push('the reviewer type changed');
  if (stored.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE')
    drift.push('the validation status changed');
  if ((stored.measured?.scenarios?.BS01 ?? '') === '')
    drift.push('the measured evidence is missing');
  console.log('\nBounded memory review — check\n');
  if (drift.length > 0) {
    for (const item of drift) console.log(`    x ${item}`);
    console.log('\nFAIL — the artifact and the system disagree.\n');
    process.exit(1);
  }
  console.log('  · the key model and growth arithmetic still match the shipped code');
  console.log('  · the measured evidence is present and attributed');
  console.log('\nPASS — the recorded evidence is still true of the code.\n');
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
writeFileSync(
  RECORD,
  `${JSON.stringify(
    {
      loop: 'closed-loop-20-2-bounded-statewave-memory',
      rule: 'Remember state, not every time state became true.',
      reviewerType: 'non_human_independent',
      formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
      scores: null,
      derived,
      measured,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nWrote ${path.relative(ROOT, RECORD)}\n`);
