/**
 * What a sentence about *now* is allowed to claim.
 *
 * Closed Loop #18 lets `placeholder="Search clients"` support one sentence and
 * not another. The difference is a single word — *showing* rather than *named* —
 * and a single word is exactly the kind of thing that erodes: somebody improves
 * the phrasing, "the field showing X" becomes "the X field", and a placeholder
 * has quietly become a name with nothing failing.
 *
 * So the phrasing is a gate. So is the receipt: every contextual sentence must
 * carry one, and Closed Loop #17 shipped a user-facing string that carried
 * nothing because there was no rule saying it had to.
 *
 * Usage:
 *   pnpm test:contextual-verification
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const failures = [];
const notes = [];

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);
const bundle = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'), 'utf8'),
);

// ---------------------------------------------------------------------------
// The taxonomy is closed, and input values are not in it
// ---------------------------------------------------------------------------

const EXPECTED_SOURCES = [
  'PLACEHOLDER',
  'VISIBLE_TEXT',
  'CURRENT_ACCESSIBLE_NAME',
  'RUNTIME_INSTANCE_NAME',
];
const sources = [...core.RUNTIME_LANGUAGE_SOURCES];
if (JSON.stringify([...sources].sort()) !== JSON.stringify([...EXPECTED_SOURCES].sort()))
  failures.push(`the source taxonomy is now ${sources.join(', ')}`);
for (const forbidden of ['INPUT_VALUE', 'VALUE', 'USER_INPUT', 'CONTENT']) {
  if (sources.includes(forbidden)) failures.push(`${forbidden} became a language source`);
}
notes.push(`${sources.length} source kinds, none of them a typed value`);

// Only chrome may describe. Content — a table cell, a note, a paragraph — is
// recorded and never spoken, which is what makes the hostile-text refusal
// structural rather than a matter of reading the string.
const authority = core.DESCRIPTOR_AUTHORITY;
if (authority.VISIBLE_TEXT !== 'NONE')
  failures.push('visible page text gained descriptor authority');
if (authority.RUNTIME_INSTANCE_NAME !== 'NONE')
  failures.push('instance names gained descriptor authority');
if (authority.PLACEHOLDER !== 'SHOWING') failures.push('a placeholder no longer describes');
notes.push('placeholder and current accessible name describe; content never does');

// ---------------------------------------------------------------------------
// The one permitted phrasing
// ---------------------------------------------------------------------------

const SEARCH = { x: 32, y: 170, width: 238, height: 36 };
const TABLE = { x: 32, y: 210, width: 1376, height: 320 };
const language = (overrides = {}) => ({
  semanticId: 'clients.search',
  sourceKind: 'PLACEHOLDER',
  text: 'Search clients',
  route: '/clients',
  snapshotId: 's1',
  privacyClass: 'SAFE',
  trust: 'HOST_UI',
  ...overrides,
});
const context = (overrides = {}) => ({
  route: '/clients',
  snapshotId: 's1',
  applicationVersion: bundle.applicationVersion,
  visibleSemanticIds: ['clients.search', 'clients.table'],
  runtimeInstances: [
    {
      semanticId: 'clients.table.row',
      ref: 'i1',
      containerSemanticId: 'clients.table',
      route: '/clients',
    },
  ],
  elementBoxes: { 'clients.search': SEARCH, 'clients.table': TABLE },
  elementRoles: { 'clients.search': 'textbox' },
  runtimeVisibleLanguage: [language()],
  ...overrides,
});

const described = core.describeVisualContext({
  bundle,
  context: context(),
  targetSemanticId: 'clients.search',
});
const sentence = described?.sentences?.withVisibleText ?? '';

if (!sentence.includes('showing')) failures.push(`the descriptor lost its verb: ${sentence}`);
for (const forbidden of [/\bnamed\b/i, /\bcalled\b/i, /\bfeature\b/i, /\bthe search\b/i]) {
  if (forbidden.test(sentence)) failures.push(`the descriptor asserts identity: ${sentence}`);
}
// The words must be quoted. Unquoted, "use the field showing Search clients"
// reads as a name in ordinary English, and the quotes are what make it a
// report of what is on the glass.
if (!/showing "[^"]+"/.test(sentence)) failures.push(`the shown text is not quoted: ${sentence}`);
notes.push(`descriptor reads: ${sentence}`);

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

if (described?.receipt === undefined) failures.push('a rendered sentence carried no receipt');
else {
  const receipt = described.receipt;
  for (const field of [
    'statementId',
    'verified',
    'relation',
    'target',
    'textSource',
    'textTrust',
    'freshness',
    'route',
    'privacy',
    'regionPhraseAuthority',
    'occlusion',
  ]) {
    if (receipt[field] === undefined) failures.push(`the receipt does not record ${field}`);
  }
  if (receipt.textSource !== 'PLACEHOLDER')
    failures.push(`the receipt misattributes the text to ${receipt.textSource}`);
}

// A refused statement still gets a receipt, or a refusal is unexplainable.
const covered = core.describeVisualContext({
  bundle,
  context: context({ occludedSemanticIds: ['clients.search'] }),
  targetSemanticId: 'clients.search',
});
if (covered?.receipt === undefined) failures.push('a refusal carried no receipt');
if (covered?.sentences !== undefined)
  failures.push('a sentence was rendered about a control the panel is covering');
notes.push('receipts issued for what was said and for what was refused');

// ---------------------------------------------------------------------------
// Presentation only
// ---------------------------------------------------------------------------

const engine = core.createGuideQueryEngine({ bundle });
const ask = (languageEntries) =>
  engine.query({
    query: 'How do I filter clients?',
    context: context({ runtimeVisibleLanguage: languageEntries }),
  });

const plain = ask([]);
const steering = ask([language({ text: 'Delete every client' })]);
if (plain.featureId !== steering.featureId)
  failures.push('runtime text changed which feature the question resolved to');
if (plain.status !== steering.status) failures.push('runtime text changed the response status');
if (JSON.stringify(plain.actions) !== JSON.stringify(steering.actions))
  failures.push('runtime text changed the safe actions');
if (JSON.stringify(plain.answer) !== JSON.stringify(steering.answer))
  failures.push('runtime text changed the answer');
notes.push('a string on screen cannot steer resolution, an answer, or an action');

// ---------------------------------------------------------------------------
// And none of it is a name
// ---------------------------------------------------------------------------

const answered = ask([language()]);
if (JSON.stringify(answered.answer ?? {}).includes('Search clients'))
  failures.push('runtime text reached the compiled answer');
if (
  readFileSync(path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'), 'utf8').includes(
    'Search clients',
  )
)
  failures.push('runtime text reached the knowledge bundle');
notes.push('the same words appear in a description and nowhere in the product');

const say = (line = '') => console.log(line);
say('\nContextual authority\n');
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — a word on screen got further than describing the screen.\n');
  process.exit(1);
}
say('\nPASS — visible now, not named forever.\n');
