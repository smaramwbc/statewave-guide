/**
 * Closed Loop #19's capture, pinned by content.
 *
 * Every other issued review round has a freeze gate that hashes its files. This
 * one did not, and an audit pointed out what that meant: `pnpm capture:memory`
 * still defaults to writing straight into the directory, so the loop that was
 * rebuilding exactly what that round measured could have overwritten the
 * evidence it was being measured against, and only a package-vs-record mismatch
 * would have said so — repairable by re-running the builder.
 *
 * Adding the directory to FROZEN_LOCATIONS in capture-immutability.mjs was not
 * enough either. That analyser walks `test:` scripts; frozen locations are
 * *supposed* to be written by `capture:` commands, so the entry bought nothing
 * for a capture pointed at a frozen round.
 *
 * A changed hash here is not automatically wrong. It is a statement that
 * something moved during a round that was declared finished, and it has to be
 * acknowledged rather than re-blessed by re-running a builder.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'memory-adaptation-review-v1');
const sha = (value) => createHash('sha256').update(value).digest('hex');

const failures = [];
const notes = [];

/** The two issued files, byte for byte. */
const FROZEN = {
  'memory-evidence.json': 'efbe7f636e4ff5273e244ef9e7c05ed1391b235298907ed11a2642460127d311',
  'memory-adaptation-review-v1.package.json':
    '017349fc6799a8e1dfacc8f250db5f59c2e27967a3a4b4db658dc0ca76687289',
};

for (const [file, expected] of Object.entries(FROZEN)) {
  let actual;
  try {
    actual = sha(readFileSync(path.join(DIR, file)));
  } catch {
    failures.push(`${file} is missing from the frozen round`);
    continue;
  }
  if (actual !== expected) failures.push(`${file} changed (${actual.slice(0, 16)}…)`);
}

/** The screenshots, as one digest over names and bytes. */
const SCREENSHOTS = 'f765a4f2f08a61c7dd7b212098f43f2ca1dde7f95fd6196c6df280f6f374a6d6';
const SCREENSHOT_COUNT = 15;
let names = [];
try {
  names = readdirSync(path.join(DIR, 'screenshots')).sort();
} catch {
  failures.push('the screenshot directory is missing');
}
if (names.length !== SCREENSHOT_COUNT)
  failures.push(`${names.length} screenshots, not ${SCREENSHOT_COUNT}`);
const digest = createHash('sha256');
for (const name of names) {
  digest.update(name);
  digest.update(readFileSync(path.join(DIR, 'screenshots', name)));
}
const actualShots = digest.digest('hex');
if (names.length === SCREENSHOT_COUNT && actualShots !== SCREENSHOTS)
  failures.push(`the screenshots changed (${actualShots.slice(0, 16)}…)`);

notes.push(`${Object.keys(FROZEN).length} issued files and ${names.length} screenshots pinned`);

/**
 * The round was issued unscored, and stays that way.
 *
 * A frozen artifact that quietly acquires scores is the failure this project
 * has already had once, in a different round, where one gate hashed the record
 * and another read the status and neither noticed the two disagreeing.
 */
try {
  const package_ = JSON.parse(
    readFileSync(path.join(DIR, 'memory-adaptation-review-v1.package.json'), 'utf8'),
  );
  if (package_.reviewerType !== 'non_human_independent')
    failures.push(`reviewerType is ${package_.reviewerType}`);
  for (const item of package_.items ?? []) {
    if (item.preferred !== null) failures.push(`${item.id} acquired a preference`);
    for (const [dimension, pair] of Object.entries(item.scores ?? {})) {
      for (const [side, value] of Object.entries(pair)) {
        if (value !== null) failures.push(`${item.id}.${dimension}.${side} acquired a score`);
      }
    }
  }
  notes.push(`${(package_.items ?? []).length} items, still unscored`);
} catch {
  failures.push('the issued package could not be read');
}

const say = (line = '') => console.log(line);
say('\nClosed Loop #19 capture — frozen\n');
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — a finished round moved.\n');
  process.exit(1);
}
say('\nPASS — the round is where it was left.\n');
