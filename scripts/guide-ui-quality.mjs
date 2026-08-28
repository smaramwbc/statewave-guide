/**
 * What the panel is allowed to be.
 *
 * The UI is the newest and least examined place in this system, and it is the
 * one place a fabricated sentence would be cheapest to add and hardest to
 * notice — a component that writes "Untitled" when a title is missing looks like
 * good defensive coding and is a product claim nobody verified.
 *
 * So this reads the panel's source and its recorded behaviour: no second
 * guidance compiler, no placeholder copy, no selector, no analysis vocabulary,
 * and a closed set of executable actions. `--aspect` selects which of the gate
 * names in Closed Loop #13 reports, over one traversal.
 *
 * Usage:
 *   pnpm test:guide-ui-contract
 *
 * @packageDocumentation
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { GUIDE_SAFE_ACTION_KINDS } from '../packages/core/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PANEL = path.join(ROOT, 'packages', 'react', 'src', 'panel');
const REVIEW = path.join(ROOT, 'benchmarks', 'interactive-review-v1', 'interactive-review-v1.json');
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'all' : (process.argv[aspectIndex + 1] ?? 'all');

const failures = [];
const files = readdirSync(PANEL).filter((name) => /\.tsx?$/.test(name));
const sources = new Map(files.map((name) => [name, readFileSync(path.join(PANEL, name), 'utf8')]));
const uiSource =
  [...sources.values()].join('\n') +
  readFileSync(path.join(ROOT, 'packages/react/src/use-guide-query.ts'), 'utf8');

/** Strips comments and regex literals before looking for code. */
const codeOf = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/(?![*/])(?:\\.|\[[^\]]*\]|[^\\/\n])+\/[gimsuy]*/g, 'REGEX');

// --- 1. No second guidance compiler ---------------------------------------
//
// The panel may render a field and may not decide what belongs in it. Checked
// by looking for the *verbs*: a component that resolves, prunes, or composes
// guidance has taken a decision the query contract already took.
const code = codeOf(uiSource);
const FORBIDDEN = [
  [/\bresolveFeature\b/, 'resolves features'],
  [/\bcompileGuidance\b/, 'compiles guidance'],
  [/\bauthorisedScreenName\b/, 'decides screen-name authority'],
  [/\bclassifyIntent\b/, 'classifies intent'],
  [/\.filter\(\s*\(?step/, 'prunes steps'],
  [/kind:\s*'(navigate|highlight|scroll|focus|open_guide_step)'/, 'constructs safe actions'],
  [/querySelector(All)?\s*\(/, 'uses a selector to find a host element'],
  // `getElementById(GUIDE_PANEL_STYLE_ID)` is the panel checking whether its own
  // stylesheet is already injected — a constant this package owns, not a search
  // for anything in the host application. Everything else is forbidden.
  [
    /getElementById\s*\((?!GUIDE_PANEL_STYLE_ID\)|GUIDE_STYLE_ID\))/,
    'uses a selector to find a host element',
  ],
];
for (const [pattern, what] of FORBIDDEN) {
  if (pattern.test(code)) failures.push(`the panel ${what}; that belongs to the query contract`);
}

// --- 2. No placeholder copy ------------------------------------------------
//
// "Missing means omitted." A placeholder is a sentence a user reads, and this
// component may not write sentences about the product.
for (const placeholder of [
  'Untitled',
  'Unknown feature',
  'N/A',
  'No description',
  'Not available',
]) {
  for (const [name, source] of sources) {
    if (source.includes(`'${placeholder}'`) || source.includes(`>${placeholder}<`)) {
      failures.push(`${name}: renders the placeholder "${placeholder}"`);
    }
  }
}

// --- 3. No analysis vocabulary in anything a user sees ---------------------
const INTERNALS = [
  'BEHAVIOR_VERIFIED',
  'FeatureScope',
  'ProductClaim',
  'structurally_verified',
  'graphHash',
  'evidenceHash',
  'COLLECTION_MEMBERS_CHANGED',
];
const panelText = sources.get('GuidePanel.tsx') ?? '';
for (const internal of INTERNALS) {
  // Allowed inside the inspector, which is developer-only and serialised whole.
  const outsideInspector = panelText.split('swg-inspector')[0] ?? '';
  if (outsideInspector.includes(internal)) failures.push(`the panel shows ${internal} to users`);
}

// --- 4. The recorded run ---------------------------------------------------
let review;
if (!existsSync(REVIEW)) {
  failures.push('no interactive review has been recorded; run pnpm test:guide-ui-e2e');
} else {
  review = JSON.parse(readFileSync(REVIEW, 'utf8'));
  if (review.pageErrors.length > 0)
    failures.push(`${review.pageErrors.length} page error(s) during the run`);
  if (review.reviewerType !== null || review.scoredBy !== null) {
    failures.push('the interactive review carries scores; it is a development artefact');
  }
  if (review.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE') {
    failures.push('the interactive review claims to be human validation');
  }
  for (const scenario of review.scenarios) {
    for (const [key, value] of Object.entries(scenario.scores ?? {})) {
      if (value !== null) failures.push(`${scenario.id}: ${key} was scored by the harness`);
    }
    const safety = scenario.safety ?? {};
    if ((safety.secretLeaks ?? 0) > 0) failures.push(`${scenario.id}: a secret reached the guide`);
    if ((safety.fabricatedNames ?? 0) > 0) failures.push(`${scenario.id}: a name was fabricated`);
    if ((safety.featureIdsExposed ?? 0) > 0)
      failures.push(`${scenario.id}: a feature id was shown`);
    if (safety.valueTyped !== undefined && safety.valueTyped !== '') {
      failures.push(`${scenario.id}: the guide typed into the application`);
    }
    if (scenario.interaction?.dialogOpenedByGuide === true) {
      failures.push(`${scenario.id}: the guide operated the application`);
    }
  }
  const a11y = review.accessibility ?? {};
  for (const [key, expected] of [
    ['composerFocused', true],
    ['labelled', true],
    ['closed', true],
    ['focusRestored', true],
    ['idsUnchanged', true],
    ['namesUnchanged', true],
  ]) {
    if (a11y[key] !== expected) failures.push(`accessibility: ${key} was ${a11y[key]}`);
  }
  if ((a11y.unlabelledButtons ?? 1) !== 0) failures.push('a panel button has no accessible name');
  if ((a11y.liveRegions ?? 0) < 1) failures.push('no live region announces a new answer');
}

const say = (line = '') => console.log(line);
const TITLES = {
  contract: 'Guide UI — contract discipline',
  'safe-actions': 'Guide UI — safe actions',
  context: 'Guide UI — runtime context',
  accessibility: 'Guide UI — accessibility',
  'secret-redaction': 'Guide UI — secret redaction',
  all: 'Guide UI',
};
say(`\n${TITLES[ASPECT] ?? TITLES.all}\n`);
say(`  panel source files                   ${files.length}`);
say(`  executable action kinds              ${GUIDE_SAFE_ACTION_KINDS.length}`);
if (review !== undefined) {
  say(`  scenarios recorded                   ${review.scenarios.length}`);
  say(`  page errors                          ${review.pageErrors.length}`);
  say(`  secret leaks                         0 required`);
  say(`  harness-assigned scores              0 required`);
  say('');
  say(`  first open                           ${review.timings.firstOpenMs} ms`);
  say(`  deterministic query                  ${review.timings.queryMs} ms`);
  say(`  Show me dispatch                     ${review.timings.showMeMs} ms`);
  say(`  context refresh after route change   ${review.timings.contextRefreshMs} ms`);
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — the UI took a decision that is not its to take.\n');
  process.exit(1);
}
say('\nPASS — the panel renders and executes; it does not interpret.\n');
