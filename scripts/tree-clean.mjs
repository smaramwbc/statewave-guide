/**
 * Whether running the checks left the repository as it found it.
 *
 * A second line of defence behind `test:artifact-integrity`, and it exists
 * because that one was not enough. Integrity hashes the watched artefacts before
 * and after a run, which catches a check that mutates them — and cannot catch a
 * check that mutates them **deterministically**. `build-human-review-6.mjs` put
 * its `--check` exit below the `writeFileSync` calls, so
 * `test:review-fact-coverage` rewrote the issued Round 6 package on every
 * invocation with the current compiler's output. Once the damage was done the
 * before-and-after hashes agreed, and integrity reported PASS for a whole loop.
 * It was found by reading `git status` after a commit, which is not a gate.
 *
 * So: after the suite, the working tree must be byte-clean. Not the watched
 * artefacts — **everything**. A gate that writes a file has either produced
 * output it should have put in a temp directory, or edited evidence it was
 * supposed to be reading, and this cannot tell the two apart on purpose. Both
 * are worth stopping for.
 *
 * Use it *with* `test:artifact-integrity`, never instead of it. Integrity says
 * which record changed and when; this says only that something did, and works
 * even for files nothing is watching yet.
 *
 * Usage:
 *   pnpm test:tree-clean
 *
 * @packageDocumentation
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

console.log('\nWorking tree after the gate suite\n');

let status;
try {
  status = git(['status', '--porcelain']);
} catch {
  console.log('  not a git repository — nothing to compare against\n');
  process.exit(0);
}

const lines = status.split('\n').filter((line) => line.trim().length > 0);
if (lines.length === 0) {
  console.log('  clean — the checks read the repository and wrote nothing to it.\n');
  console.log('PASS — git diff --exit-code equivalent, including untracked files.\n');
  process.exit(0);
}

console.log(`  ${lines.length} path(s) changed by running the suite:\n`);
for (const line of lines.slice(0, 40)) console.log(`    ${line}`);
console.log('');
console.log('  A gate may read the repository. It may not write to it. Output belongs in a');
console.log('  temp directory; evidence belongs where it was checkpointed.');
console.log('');
console.log('FAIL — the suite modified the repository.\n');
process.exit(1);
