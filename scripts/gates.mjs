/**
 * Every quality gate, run from one place.
 *
 * Closed Loop #17's freeze audit found that none of the eighty-odd gates in this
 * repository ran automatically: no CI workflow, no git hooks, and `verify`
 * covers build, typecheck, unit tests, lint and format but not a single `test:`
 * script. Every guarantee this project has written down held only while somebody
 * remembered to type the command.
 *
 * The obvious fix — list the gates in a workflow file — is the wrong one. Two
 * lists diverge: somebody adds a gate locally, CI keeps passing without it, and
 * the gate that was supposed to catch a regression is the thing that quietly
 * stopped running. So there is no list. The `test:` scripts in `package.json`
 * *are* the manifest, this runner enumerates them, and CI invokes this runner.
 * Adding a gate is one edit in one file and it runs everywhere immediately.
 *
 * Usage:
 *   pnpm gates                 every gate, sequentially
 *   pnpm gates --list          print the manifest and exit
 *   pnpm gates --only visual   only gates whose name contains "visual"
 *   pnpm gates --json out.json write a machine-readable result
 *
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const argv = process.argv.slice(2);
const flagValue = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

/**
 * The manifest.
 *
 * Derived, not maintained. A gate exists because somebody wrote a `test:`
 * script; there is nowhere else for the two to disagree.
 */
export const GATES = Object.keys(packageJson.scripts)
  .filter((name) => name.startsWith('test:'))
  .sort();

/**
 * Commands that produce artifacts, listed here only so the distinction is
 * visible from the runner. Nothing in this file executes them, and CI must not.
 */
const CAPTURES = Object.keys(packageJson.scripts).filter((name) => name.startsWith('capture:'));

/**
 * Whether this file was run, or imported for its manifest.
 *
 * `ci-manifest.mjs` imports `GATES` to check that nothing else keeps a second
 * list — and without this guard that import ran all eighty-nine gates as a side
 * effect of asking what they are.
 */
const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith('gates.mjs');
if (!invokedDirectly) {
  // Imported. The manifest is the export; running is the caller's business.
} else {
  run();
}

function run() {
  if (argv.includes('--list')) {
    for (const gate of GATES) console.log(gate);
    process.exit(0);
  }

  const only = flagValue('--only');
  const selected = only === undefined ? GATES : GATES.filter((gate) => gate.includes(only));
  if (selected.length === 0) {
    console.error(`No gate matches ${JSON.stringify(only)}.`);
    process.exit(1);
  }

  const results = [];
  const started = Date.now();

  for (const [index, gate] of selected.entries()) {
    const at = Date.now();
    const run = spawnSync('pnpm', ['run', gate], { cwd: ROOT, encoding: 'utf8' });
    const ms = Date.now() - at;
    const passed = run.status === 0;
    results.push({
      gate,
      passed,
      ms,
      ...(passed ? {} : { output: `${run.stdout ?? ''}${run.stderr ?? ''}`.slice(-4000) }),
    });
    const mark = passed ? '·' : 'x';
    const position = `${index + 1}/${selected.length}`.padStart(7);
    console.log(`  ${mark} ${position}  ${gate.padEnd(46)} ${String(ms).padStart(6)}ms`);
  }

  const failed = results.filter((result) => !result.passed);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const jsonPath = flagValue('--json');
  if (jsonPath !== undefined) {
    writeFileSync(
      path.resolve(ROOT, jsonPath),
      `${JSON.stringify({ gates: selected.length, failed: failed.length, seconds: Number(elapsed), results }, null, 2)}\n`,
    );
  }

  console.log('');
  console.log(
    `  ${selected.length} gates, ${failed.length} failed, ${elapsed}s   (${CAPTURES.length} capture commands, none run)`,
  );

  if (failed.length > 0) {
    console.log('\n  Failures\n');
    for (const result of failed) {
      console.log(`    x ${result.gate}`);
      for (const line of (result.output ?? '').trim().split('\n').slice(-12)) {
        console.log(`        ${line}`);
      }
      console.log('');
    }
    process.exit(1);
  }

  console.log('\nPASS — every gate in the manifest.\n');
}
