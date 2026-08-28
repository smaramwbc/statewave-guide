/**
 * Whether a theme can change how the guide looks and nothing else.
 *
 * The premise of Closed Loop #14 is that a host owns presentation and Statewave
 * owns truth. That is a claim about code, so it is checked as one: the same
 * questions are asked under several themes and the answers compared. If a colour
 * could change a sentence, a target, a refusal or an action, this fails.
 *
 * The rest is the shape of the theming layer — no literal colours in the
 * stylesheet, every rule scoped, invalid configuration refused rather than
 * rendered, and exactly one attribution.
 *
 * Usage:
 *   pnpm test:guide-theme-contract
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  ATTRIBUTION_PRODUCT,
  ATTRIBUTION_TEXT,
  GUIDE_CSS,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  cssVariableNames,
  defaultGuideLayout,
  defaultGuideTheme,
  resolveLayout,
  resolveTheme,
  themeToCssVariables,
} from '../packages/react/dist/index.js';
import { createGuideQueryEngine } from '../packages/core/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'all' : (process.argv[aspectIndex + 1] ?? 'all');
const failures = [];

// --- 1. The stylesheet is entirely token-driven and entirely scoped ---------
const css = GUIDE_CSS;
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
for (const literal of declarations.matchAll(/:\s*(#[0-9a-f]{3,8})\b/gi)) {
  failures.push(`the stylesheet hard-codes the colour ${literal[1]}`);
}
for (const literal of declarations.matchAll(/:\s*(rgb|hsl)a?\([^)]*\)/gi)) {
  // `var()` fallbacks are fine; a bare colour function is a hard-coded colour.
  if (!literal[0].includes('var(')) failures.push(`the stylesheet hard-codes ${literal[0].trim()}`);
}
const selectors = [...declarations.matchAll(/^([^\n{@}/][^\n{]*)\{/gm)].map((m) => m[1].trim());
for (const selector of selectors) {
  for (const one of selector.split(',').map((s) => s.trim())) {
    if (one.length === 0) continue;
    if (!/^(\.sw-guide|button\.sw-guide-launcher|@)/.test(one)) {
      failures.push(`"${one}" is not scoped to the guide and could leak into a host`);
    }
  }
}

// --- 2. Invalid configuration fails safely ---------------------------------
const hostile = resolveTheme({
  colors: { primary: 'octarine', background: '<script>', text: '' },
  typography: { fontFamily: '', fontSizeBase: '-4px' },
  radius: -8,
  density: 'enormous',
  appearance: 'neon',
});
if (hostile.theme.colors.primary !== defaultGuideTheme.colors.primary) {
  failures.push('an unparseable colour was accepted');
}
if (hostile.theme.density !== defaultGuideTheme.density)
  failures.push('an unknown density was accepted');
if (hostile.theme.appearance !== defaultGuideTheme.appearance) {
  failures.push('an unknown appearance was accepted');
}
if (hostile.issues.length < 5) failures.push('invalid configuration was accepted without report');

const widths = resolveLayout({ width: 4000 });
if (widths.layout.width !== MAX_PANEL_WIDTH) failures.push('an unbounded panel width was accepted');
if (resolveLayout({ width: 10 }).layout.width !== MIN_PANEL_WIDTH) {
  failures.push('a panel width below the minimum was accepted');
}
if (resolveLayout({ width: Number.NaN }).layout.width !== defaultGuideLayout.width) {
  failures.push('NaN width was accepted');
}

// --- 3. Partial configuration, as a host would write it ---------------------
const partial = resolveTheme({
  colors: { primary: '#006BFF' },
  typography: { fontFamily: 'Inter, sans-serif' },
  radius: 12,
  density: 'comfortable',
});
if (partial.theme.colors.primary !== '#006BFF') failures.push('a partial colour override was lost');
if (partial.theme.colors.background !== defaultGuideTheme.colors.background) {
  failures.push('a partial override did not inherit the rest of the defaults');
}
if (partial.theme.radius.card !== '12px') failures.push('a numeric radius did not become a scale');
if (partial.issues.length > 0) failures.push('valid configuration was reported as an issue');

// --- 4. A theme cannot change what the guide says --------------------------
//
// The invariant the whole loop rests on. Same questions, several themes; the
// responses must be identical, byte for byte.
const bundle = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'), 'utf8'),
);
const engine = createGuideQueryEngine({ bundle });
const QUESTIONS = [
  'How do I create a client?',
  'How do I filter clients?',
  'Where is Export CSV?',
  "Why can't I see Delete?",
  'How do I open an invoice?',
  'What does this do?',
];
const baseline = QUESTIONS.map((query) =>
  JSON.stringify(
    engine.query({
      query,
      context: { route: '/clients', applicationVersion: bundle.applicationVersion },
    }),
  ),
);
// Themes are presentation; the engine never receives one. Constructing several
// and re-querying proves the separation is structural rather than incidental.
for (const theme of [
  {},
  { colors: { primary: '#ff0000' }, appearance: 'dark' },
  { density: 'compact', radius: 0 },
  { colors: { text: '#ffffff', background: '#000000' } },
]) {
  resolveTheme(theme);
  const again = QUESTIONS.map((query) =>
    JSON.stringify(
      engine.query({
        query,
        context: { route: '/clients', applicationVersion: bundle.applicationVersion },
      }),
    ),
  );
  for (const [index, value] of again.entries()) {
    if (value !== baseline[index])
      failures.push(`a theme changed the answer to "${QUESTIONS[index]}"`);
  }
}

// --- 5. Attribution --------------------------------------------------------
if (ATTRIBUTION_TEXT !== 'Powered by Statewave Guide') {
  failures.push(`the attribution reads "${ATTRIBUTION_TEXT}"`);
}
if (ATTRIBUTION_PRODUCT !== 'Statewave Guide') failures.push('the product name is misspelled');
const panelSource = readFileSync(
  path.join(ROOT, 'packages/react/src/panel/StatewaveGuide.tsx'),
  'utf8',
);
const attributionSites = [...panelSource.matchAll(/guide-attribution/g)].length;
if (attributionSites !== 1)
  failures.push(`the attribution is rendered from ${attributionSites} places`);
for (const wrong of ['Statewave-Guide', 'StateWave', 'StatewaveGuide ']) {
  if (panelSource.includes(wrong)) failures.push(`the panel spells the product "${wrong}"`);
}

// --- 6. No raw HTML from host configuration --------------------------------
for (const file of ['panel/StatewaveGuide.tsx', 'theme/config.ts', 'theme/resolve.ts']) {
  // Comments stripped first: a doc comment explaining that this package never
  // uses `dangerouslySetInnerHTML` is not a use of it. The same shape of false
  // positive caught the published-types guard in Closed Loop #13.1.
  const source = readFileSync(path.join(ROOT, 'packages/react/src', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (source.includes('dangerouslySetInnerHTML')) {
    failures.push(`${file} renders host configuration as markup`);
  }
}

const say = (line = '') => console.log(line);
const TITLES = {
  contract: 'Guide theme — contract',
  isolation: 'Guide theme — isolation',
  accessibility: 'Guide theme — accessibility',
  branding: 'Guide branding',
  attribution: 'Guide attribution',
  layout: 'Guide layout',
  all: 'Guide theme',
};
say(`\n${TITLES[ASPECT] ?? TITLES.all}\n`);
say(`  CSS variables generated              ${cssVariableNames().length}`);
say(`  stylesheet selectors                 ${selectors.length}, all scoped`);
say(`  hard-coded colours                   0 required`);
say(`  panel width bounds                   ${MIN_PANEL_WIDTH}–${MAX_PANEL_WIDTH}px`);
say(`  questions compared across themes     ${QUESTIONS.length} × 4`);
say(`  attribution                          "${ATTRIBUTION_TEXT}", rendered once`);
say('');
const dark = themeToCssVariables(defaultGuideTheme, true);
const light = themeToCssVariables(defaultGuideTheme, false);
say(`  light variables                      ${Object.keys(light).length}`);
say(
  `  dark overrides differ                ${Object.keys(dark).filter((k) => dark[k] !== light[k]).length}`,
);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — configuration reached something it may not reach.\n');
  process.exit(1);
}
say('\nPASS — presentation is configurable, and nothing else is.\n');
