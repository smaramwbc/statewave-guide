/**
 * One manifest, and proof that there is only one.
 *
 * The failure this prevents is quiet and specific: somebody adds a gate, CI
 * keeps passing without it, and the check that was supposed to catch a
 * regression is itself the thing that silently stopped running. It happens
 * whenever a workflow file carries its own list of what to run.
 *
 * So the rule is that the workflow may name the runner and nothing else. It may
 * not enumerate gates, and it may not invoke a `capture:` command — a CI job
 * that regenerated the evidence a frozen review was scored against would destroy
 * the thing it exists to protect.
 *
 * Usage:
 *   pnpm test:ci-gate-manifest
 *
 * @packageDocumentation
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { GATES } from './gates.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const failures = [];
const notes = [];

const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = packageJson.scripts;
const captures = Object.keys(scripts).filter((name) => name.startsWith('capture:'));

// --- the runner exists and is reachable -------------------------------------

if (scripts.gates === undefined) failures.push('there is no `gates` script to run');
else if (!scripts.gates.includes('scripts/gates.mjs'))
  failures.push('`gates` does not run the manifest runner');

if (GATES.length === 0) failures.push('the manifest is empty');
notes.push(`${GATES.length} gates in the manifest, derived from package.json`);

// --- a workflow exists, and it defers to the runner -------------------------

let workflows;
try {
  workflows = readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name));
} catch {
  workflows = [];
}
if (workflows.length === 0) {
  failures.push('no workflow runs the gates, so none of them run automatically');
}

for (const file of workflows) {
  const source = readFileSync(path.join(WORKFLOWS, file), 'utf8');
  // Comments are prose about the rule, not the rule. This repository has now
  // shipped four gates that accused their own documentation.
  const code = source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  if (!code.includes('pnpm gates') && !code.includes('scripts/gates.mjs')) {
    failures.push(`${file} does not invoke the gate runner`);
  }

  // A second list. Naming even one gate individually is the beginning of the
  // divergence this file exists to prevent.
  const named = GATES.filter((gate) => code.includes(gate));
  if (named.length > 0) {
    failures.push(
      `${file} names ${named.length} gate(s) directly (${named.slice(0, 3).join(', ')}…); the manifest is the only list`,
    );
  }

  for (const capture of captures) {
    if (code.includes(capture))
      failures.push(`${file} runs ${capture}; CI must not write artifacts`);
  }
  if (/\bcapture:/.test(code)) failures.push(`${file} invokes a capture command`);
}
if (workflows.length > 0)
  notes.push(`${workflows.length} workflow(s), none carrying a second list`);

// --- and the manifest is what a person would run locally --------------------

const local = Object.keys(scripts)
  .filter((name) => name.startsWith('test:'))
  .sort();
if (JSON.stringify(local) !== JSON.stringify([...GATES].sort()))
  failures.push('the runner and package.json disagree about what the gates are');
notes.push(`${captures.length} capture commands, none reachable from CI`);

const say = (line = '') => console.log(line);
say('\nCI gate manifest\n');
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — the gates that run and the gates that exist are not the same set.\n');
  process.exit(1);
}
say('\nPASS — one manifest, one runner, and CI uses it.\n');
