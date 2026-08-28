/**
 * Whether a "collection" is a collection.
 *
 * The predecessor of `COLLECTION_MEMBERS_CHANGED` counted the children of any
 * element carrying a semantic id. Every container was therefore a collection and
 * every child a member, so a page `<section>` gaining a dialog reported a
 * collection changing size — and `select`, which required exactly that, accepted
 * it. Clicking a button that opens a dialog verified as a selection.
 *
 * This walks the committed evidence and requires every membership fact in it to
 * name a container whose role is a collection and a member role that collection
 * admits, then requires the two containers that used to produce false
 * membership to produce none.
 *
 * Usage:
 *   pnpm test:runtime-collection-semantics
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  COLLECTION_ROLES,
  isCollectionRole,
  memberRolesFor,
} from '../packages/shared/dist/index.js';
import { parseEffect } from './lib/runtime-review-facts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');
const runtime = JSON.parse(readFileSync(path.join(BENCH, 'runtime-evidence-v1.json'), 'utf8'));

const failures = [];
const found = [];

/** Containers that produced a false membership fact before Closed Loop #11. */
const FORMERLY_FALSE = ['clients', 'settings.danger-zone'];

for (const record of runtime.records) {
  for (const raw of record.effects) {
    const { kind, fields } = parseEffect(raw);
    if (kind !== 'COLLECTION_MEMBERS_CHANGED') continue;
    found.push({ trace: record.traceId, ...fields });

    const role = fields['collectionRole'];
    const member = fields['memberRole'];
    if (role === undefined || !isCollectionRole(role)) {
      failures.push(
        `${record.traceId}: ${fields['containerSemanticId']} reports membership as role "${role}", which is not a collection`,
      );
      continue;
    }
    if (member === undefined || !memberRolesFor(role).includes(member)) {
      failures.push(
        `${record.traceId}: a ${role} counted "${member}" members, which it does not admit`,
      );
    }
    if (fields['before'] === fields['after']) {
      failures.push(
        `${record.traceId}: ${fields['containerSemanticId']} reported a change with no difference`,
      );
    }
    if (FORMERLY_FALSE.includes(fields['containerSemanticId'] ?? '')) {
      failures.push(
        `${record.traceId}: ${fields['containerSemanticId']} is a page section and is reporting membership again`,
      );
    }
  }
}

// The positive control. A rule that refuses everything passes every test above.
const filter = runtime.records.find((record) => record.action === 'filter');
if (filter === undefined) {
  failures.push('no filter capability survives, so the rules are simply suppressing changes');
} else {
  const membership = filter.effects.find((e) => e.startsWith('COLLECTION_MEMBERS_CHANGED'));
  if (membership === undefined) {
    failures.push('the filter capability rests on no membership change');
  } else {
    const { fields } = parseEffect(membership);
    if (fields['containerSemanticId'] !== 'clients.table') {
      failures.push(
        `the filter rests on ${fields['containerSemanticId']} rather than the client table`,
      );
    }
    if (fields['before'] !== '5' || fields['after'] !== '2') {
      failures.push(
        `the client table narrowed ${fields['before']} to ${fields['after']}, not 5 to 2`,
      );
    }
  }
}

const say = (line = '') => console.log(line);
say('\nRuntime collection semantics\n');
say(`  recognised collection roles          ${COLLECTION_ROLES.length}`);
say(`  membership facts in the evidence     ${found.length}`);
say('');
for (const entry of found) {
  say(
    `    ${entry.trace.padEnd(16)} ${entry.containerSemanticId.padEnd(20)} <${entry.collectionRole}> ${entry.before} → ${entry.after} ${entry.memberRole}(s)`,
  );
}
say('');
say('  containers that previously reported false membership:');
for (const id of FORMERLY_FALSE) {
  const still = found.some((entry) => entry.containerSemanticId === id);
  say(
    `    ${still ? '✗' : '✓'} ${id.padEnd(22)} ${still ? 'STILL REPORTING' : 'silent, as a page section should be'}`,
  );
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — something that is not a collection is reporting membership.\n');
  process.exit(1);
}
say('\nPASS — only typed collections report membership, and the real one still does.\n');
