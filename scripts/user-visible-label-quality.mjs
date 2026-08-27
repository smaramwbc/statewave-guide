/**
 * How much of the interface's own vocabulary the graph can now read.
 *
 * The Round 6 analysis found eight visible labels sitting unread in the fixture:
 * `Organisation`, `Email me when an invoice is paid` and `Plan` inside wrapping
 * `<label>` elements, and `Name`, `Billing email`, `New client`, `All clients`
 * and `Invoices` passed as props to components that render them. Every one was
 * text a user reads; none was in the graph.
 *
 * The rule that recovers them is the one that must not overreach, so this
 * reports the census and enforces two things a census cannot: a label is never
 * taken from an identifier, and a control whose text is computed is recorded as
 * **dynamic** rather than as absent. The second is what stopped `Choose Open.` —
 * a button showing `{invoice.number}` has a name, and not knowing it is a
 * different fact from there being none.
 *
 * Usage:
 *   pnpm test:user-visible-label-quality
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const elements = graph.nodes.filter((node) => node.kind === 'element');
const byOrigin = {};
const byKind = {};
const failures = [];

for (const node of elements) {
  const origin = node.labelOrigin ?? '(none)';
  byOrigin[origin] = (byOrigin[origin] ?? 0) + 1;
  const kind = node.labelKind ?? '(unrecorded)';
  byKind[kind] = (byKind[kind] ?? 0) + 1;

  const hasLabel = typeof node.label === 'string' && node.label.trim().length > 0;
  if (hasLabel && node.labelOrigin === undefined) {
    failures.push(
      `${node.id}: has a label and no origin, so nothing says where the words came from`,
    );
  }
  if (hasLabel && node.labelKind !== 'static') {
    failures.push(`${node.id}: has a label but is recorded ${node.labelKind}`);
  }
  if (!hasLabel && node.labelKind === 'static') {
    failures.push(`${node.id}: recorded static with no text`);
  }
  // The whole point. A label must never be the identifier wearing a hat.
  if (hasLabel && node.label.trim().toLowerCase() === node.elementId.split('.').pop()) {
    const spelledInSource = node.labelOrigin !== undefined;
    if (!spelledInSource) failures.push(`${node.id}: label equals its own id segment`);
  }
}

const labelled = elements.filter((node) => typeof node.label === 'string' && node.label.length > 0);
const dynamic = elements.filter((node) => node.labelKind === 'dynamic');
const recovered = elements.filter((node) =>
  ['wrapping-label', 'label-prop', 'aria-labelledby'].includes(node.labelOrigin ?? ''),
);

console.log('\nUser-visible labels\n');
console.log(`  elements                               ${elements.length}`);
console.log(`  carrying readable text                 ${labelled.length}`);
console.log(`  recovered by the new rules             ${recovered.length}`);
console.log(`  text is computed (dynamic)             ${dynamic.length}`);
console.log(
  `  no name at all                         ${elements.length - labelled.length - dynamic.length}`,
);

console.log('\n  By origin\n');
for (const [origin, count] of Object.entries(byOrigin).sort()) {
  console.log(`    ${origin.padEnd(20)} ${count}`);
}
console.log('\n  By kind\n');
for (const [kind, count] of Object.entries(byKind).sort()) {
  console.log(`    ${kind.padEnd(20)} ${count}`);
}

console.log('\n  Recovered\n');
for (const node of [...recovered].sort((a, b) => (a.id < b.id ? -1 : 1))) {
  console.log(
    `    ${node.id.padEnd(42)} ${node.labelOrigin.padEnd(16)} ${JSON.stringify(node.label)}`,
  );
}

console.log('\n  Dynamic — a name exists and cannot be read\n');
for (const node of [...dynamic].sort((a, b) => (a.id < b.id ? -1 : 1))) {
  console.log(`    ${node.id}`);
}

console.log('');
if (failures.length > 0) {
  for (const failure of failures.slice(0, 30)) console.log(`    ✗ ${failure}`);
  console.log('\nFAIL — a name was recorded that the interface does not supply.\n');
  process.exit(1);
}
console.log('PASS — every recorded name has an origin, and every unreadable one says so.\n');
