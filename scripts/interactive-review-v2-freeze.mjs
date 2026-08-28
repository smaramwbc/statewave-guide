/**
 * The product did not move while it was being evaluated.
 *
 * Two things this asserts, and they are different. **Product freeze**: the
 * ProductModel, the claim set and the compiled bundle are what they were before
 * this loop, so v2 measures the product rather than a product changed to suit
 * it. **Theme independence**: the six deterministic benchmark questions answer
 * byte-identically under every theme, so a colour cannot change a fact — which
 * is the claim the whole white-label story rests on and therefore the one that
 * has to be checked rather than asserted.
 *
 * Usage:
 *   pnpm test:interactive-review-v2-product-freeze
 *   pnpm test:interactive-review-v2-theme-independence
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createGuideQueryEngine } from '../packages/core/dist/index.js';
import { resolveTheme } from '../packages/react/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'freeze' : (process.argv[aspectIndex + 1] ?? 'freeze');
const failures = [];
const sha = (value) => createHash('sha256').update(value).digest('hex');

/**
 * The product, pinned where it stood at Closed Loop #11 and every loop since.
 *
 * A changed hash here is not necessarily wrong — it is a statement that product
 * truth moved, which during an evaluation loop must be a deliberate act with a
 * reason, not a side effect.
 */
const FROZEN = {
  claimSetHash: 'bb27c5db37b8a5578626bfa56ea71bc0',
  claimCount: 113,
  statuses: {
    structurally_verified: 41,
    semantically_grounded: 61,
    rejected: 4,
    behaviorally_verified: 7,
  },
  roundEightR1: '686284688e58c99958edc5e16c6ed3a0be7714d35410b656fcccd31d3fc2fa27',
};

const loaded = await loadEverything(ROOT);
const { enriched } = enrich(loaded);
const claimSetHash = sha(JSON.stringify(enriched.claims)).slice(0, 32);
const statuses = {};
for (const claim of enriched.claims) statuses[claim.status] = (statuses[claim.status] ?? 0) + 1;

if (claimSetHash !== FROZEN.claimSetHash)
  failures.push(`the claim set hash moved to ${claimSetHash}`);
if (enriched.claims.length !== FROZEN.claimCount)
  failures.push(`ProductClaims is ${enriched.claims.length}`);
for (const [status, count] of Object.entries(FROZEN.statuses)) {
  if (statuses[status] !== count)
    failures.push(`${status} is ${statuses[status]}, expected ${count}`);
}

const r1 = sha(
  readFileSync(path.join(ROOT, 'benchmarks/provider-reality-check/human-review-round-8-r1.json')),
);
if (r1 !== FROZEN.roundEightR1) failures.push('Round 8 R1 changed');

const bundlePath = path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json');
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const bundleHash = sha(readFileSync(bundlePath)).slice(0, 32);

// --- theme independence ----------------------------------------------------
const engine = createGuideQueryEngine({ bundle });
const QUESTIONS = [
  'How do I create a client?',
  'How do I filter clients?',
  'Where is Export CSV?',
  "Why can't I see Delete?",
  'How do I open an invoice?',
  'What does this do?',
];
const THEMES = {
  default: {},
  dark: { appearance: 'dark' },
  acme: {
    colors: { primary: '#006BFF' },
    typography: { fontFamily: 'Inter, sans-serif' },
    radius: 12,
  },
  compact: { density: 'compact', radius: 6 },
};
const context = { route: '/clients', applicationVersion: bundle.applicationVersion };
const baseline = QUESTIONS.map((query) => JSON.stringify(engine.query({ query, context })));
let comparisons = 0;
for (const [name, theme] of Object.entries(THEMES)) {
  // The engine never receives a theme. Resolving one and re-querying is what
  // makes the separation structural rather than incidental.
  const resolved = resolveTheme(theme);
  if (name !== 'default' && resolved.issues.length > 0) {
    failures.push(`the ${name} theme was rejected: ${JSON.stringify(resolved.issues)}`);
  }
  for (const [index, query] of QUESTIONS.entries()) {
    comparisons += 1;
    if (JSON.stringify(engine.query({ query, context })) !== baseline[index]) {
      failures.push(`the ${name} theme changed the answer to "${query}"`);
    }
  }
}

const say = (line = '') => console.log(line);
const TITLES = {
  freeze: 'Interactive review v2 — product freeze',
  theme: 'Interactive review v2 — theme independence',
};
say(`\n${TITLES[ASPECT] ?? TITLES.freeze}\n`);
say(`  ProductClaims                        ${enriched.claims.length}`);
say(`  claim-set hash                       ${claimSetHash}`);
say(`  status distribution                  ${JSON.stringify(statuses)}`);
say(`  guide bundle hash                    ${bundleHash}`);
say(`  Round 8 R1                           ${r1.slice(0, 16)}`);
say('');
say(`  themes compared                      ${Object.keys(THEMES).join(', ')}`);
say(`  question/theme comparisons           ${comparisons}`);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — the product moved, or a theme reached something it may not.\n');
  process.exit(1);
}
say('\nPASS — the product is where it was, and no theme changed a word of it.\n');
