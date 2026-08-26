#!/usr/bin/env node
/**
 * Compares two benchmark snapshots and prints a before/after table.
 *
 * Reads the JSON written by `indexer-quality.mjs --json`, so the comparison is
 * generated rather than transcribed. A hand-written before/after is a place for
 * a number to drift.
 */
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

const pct = (v) =>
  v === null || v === undefined ? '  —' : `${String(Math.round(v * 100)).padStart(3)}%`;
const num = (v, w = 3) => String(v ?? '—').padStart(w);
const arrow = (b, a) => {
  if (b === null || a === null || b === undefined || a === undefined) return ' ';
  if (Math.round(a * 100) > Math.round(b * 100)) return '▲';
  if (Math.round(a * 100) < Math.round(b * 100)) return '▼';
  return ' ';
};

function section(title, key) {
  console.log(`\n${title}`);
  console.log('-'.repeat(84));
  console.log(
    '  category            P before  P after     R before  R after      TP        FP        FN',
  );
  const names = [
    ...new Set([...Object.keys(before[key] ?? {}), ...Object.keys(after[key] ?? {})]),
  ].sort();
  for (const name of names) {
    const b = before[key]?.[name] ?? {};
    const a = after[key]?.[name] ?? {};
    console.log(
      `  ${name.padEnd(20)}${pct(b.precision)} → ${pct(a.precision)} ${arrow(b.precision, a.precision)}   ` +
        `${pct(b.recall)} → ${pct(a.recall)} ${arrow(b.recall, a.recall)}   ` +
        `${num(b.tp)}→${num(a.tp)}  ${num(b.fp)}→${num(a.fp)}  ${num(b.fn)}→${num(a.fn)}`,
    );
  }
}

console.log('\nStatewave Guide — Closed Loop #2 benchmark: PRE-FIX vs POST-FIX');
section('Nodes', 'nodes');
section('Relationships', 'relationships');

console.log('\nDiscipline');
console.log('-'.repeat(84));
const rows = [
  ['false-positive traps violated', 'trapViolations', 'trapsTotal'],
  ['refusals correctly diagnosed', 'diagnosticsReported', 'diagnosticsExpected'],
  ['relationships without evidence', 'relationshipsWithoutEvidence'],
  ['invalid confidence values', 'invalidConfidenceValues'],
  ['inferences without rules', 'inferencesWithoutRule'],
];
for (const [label, key, ofKey] of rows) {
  const b = before.discipline?.[key];
  const a = after.discipline?.[key];
  const suffix = ofKey ? ` of ${after.discipline?.[ofKey]}` : '';
  console.log(`  ${label.padEnd(34)} ${num(b, 4)} → ${num(a, 4)}${suffix}`);
}
console.log(
  `  ${'graph integrity'.padEnd(34)} ${num(before.discipline?.integrity, 4)} → ${num(after.discipline?.integrity, 4)}`,
);
console.log('');
