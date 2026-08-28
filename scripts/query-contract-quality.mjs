/**
 * The shape of the boundary, checked structurally.
 *
 * Six loops of experience say that a boundary described in prose is a boundary
 * that leaks. So this reads the source rather than trusting the design: the
 * query layer may hold no *value* import from the analysis packages, the public
 * response type may name no internal vocabulary, and the action union may not
 * have grown a verb that changes something.
 *
 * The import rule is the load-bearing one. `import type` vanishes at compile
 * time; a value import would pull an indexer, a graph and a verifier into every
 * application that ships a guide, and the separation this loop exists to draw
 * would survive only as a comment.
 *
 * Usage:
 *   pnpm test:query-contract
 *
 * @packageDocumentation
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { GUIDE_QUERY_INTENTS, GUIDE_SAFE_ACTION_KINDS } from '../packages/core/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const QUERY_DIR = path.join(ROOT, 'packages', 'core', 'src', 'query');
const failures = [];

const files = readdirSync(QUERY_DIR).filter((name) => name.endsWith('.ts'));
const ANALYSIS = ['guide-semantic', 'guide-indexer', 'guide-runtime'];

for (const name of files) {
  const source = readFileSync(path.join(QUERY_DIR, name), 'utf8');
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import ')) continue;
    for (const analysis of ANALYSIS) {
      if (!trimmed.includes(analysis)) continue;
      if (trimmed.startsWith('import type ')) continue;
      failures.push(`${name}: value import from ${analysis} — the UI would ship an analyser`);
    }
  }
  // No selector *use* anywhere in the boundary.
  //
  // Comments and the guard regex are stripped first. The naive version of this
  // check failed on the very code that forbids selectors — the sentence
  // explaining why `querySelector` is banned contains the word `querySelector`
  // — which is a good reminder that a text search is not a semantic check. What
  // is looked for is call syntax.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/(?![*/])(?:\\.|\[[^\]]*\]|[^\\/\n])+\/[gimsuy]*/g, 'REGEX');
  for (const forbidden of [
    /\bquerySelector(All)?\s*\(/,
    /\bgetElementById\s*\(/,
    /\bdocument\s*\./,
    /\bevaluate\s*\(.*XPath/,
  ]) {
    if (forbidden.test(code)) {
      failures.push(`${name}: uses ${forbidden.source}; this layer addresses by semantic id only`);
    }
  }
}

// The closed unions are closed.
const EXPECTED_INTENTS = ['EXPLAIN', 'HOW_TO', 'WHERE_IS', 'WHY_UNAVAILABLE', 'SHOW_ME', 'UNKNOWN'];
const EXPECTED_ACTIONS = ['navigate', 'highlight', 'scroll', 'focus', 'open_guide_step'];
if (
  JSON.stringify([...GUIDE_QUERY_INTENTS].sort()) !== JSON.stringify([...EXPECTED_INTENTS].sort())
) {
  failures.push(`the intent taxonomy changed: ${GUIDE_QUERY_INTENTS.join(', ')}`);
}
if (
  JSON.stringify([...GUIDE_SAFE_ACTION_KINDS].sort()) !==
  JSON.stringify([...EXPECTED_ACTIONS].sort())
) {
  failures.push(`the safe-action union changed: ${GUIDE_SAFE_ACTION_KINDS.join(', ')}`);
}

// Nothing that changes anything, however it is spelled.
const MUTATING = [
  'click',
  'press',
  'submit',
  'create',
  'update',
  'delete',
  'send',
  'pay',
  'purchase',
  'rotate',
];
for (const kind of GUIDE_SAFE_ACTION_KINDS) {
  if (MUTATING.some((verb) => kind.toLowerCase().includes(verb))) {
    failures.push(`"${kind}" changes the application; safe actions move attention only`);
  }
}

// The public response type must not name analysis vocabulary.
const contract = readFileSync(path.join(QUERY_DIR, 'contract.ts'), 'utf8');
const responseBlock = contract.slice(
  contract.indexOf('export interface GuideAnswer {'),
  contract.indexOf('export interface GuideQueryPlan'),
);
for (const internal of [
  'FeatureScope',
  'ProductClaim',
  'ApplicationGraph',
  'confidence',
  'BEHAVIOR_VERIFIED',
  'evidenceHash',
  'graphHash',
]) {
  if (responseBlock.includes(internal)) {
    failures.push(`the user-facing response type names ${internal}`);
  }
}

const say = (line = '') => console.log(line);
say('\nQuery contract shape\n');
say(`  files in the boundary                ${files.length}`);
say(
  `  intents                              ${GUIDE_QUERY_INTENTS.length}  (${GUIDE_QUERY_INTENTS.join(', ')})`,
);
say(
  `  safe actions                         ${GUIDE_SAFE_ACTION_KINDS.length}  (${GUIDE_SAFE_ACTION_KINDS.join(', ')})`,
);
say(`  value imports from analysis packages 0 required`);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — the boundary is not where it says it is.\n');
  process.exit(1);
}
say('\nPASS — one boundary, closed unions, no analyser and no selectors behind it.\n');
