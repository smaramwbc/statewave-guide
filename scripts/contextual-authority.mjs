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
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'all' : (process.argv[aspectIndex + 1] ?? 'all');
const runs = (aspect) => ASPECT === 'all' || ASPECT === aspect;

const failures = [];
const notes = [];

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);
const bundle = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'), 'utf8'),
);

if (runs('verification')) {
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
    // Two rows. One row is a container holding a thing; a list is a repetition,
    // and since Closed Loop #19.1 the describer asks for one before it calls
    // anything "the list".
    runtimeInstances: [
      {
        semanticId: 'clients.table.row',
        ref: 'i1',
        containerSemanticId: 'clients.table',
        route: '/clients',
      },
      {
        semanticId: 'clients.table.row',
        ref: 'i2',
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
}

// ---------------------------------------------------------------------------
// A structural container is not a collection a person perceives
// ---------------------------------------------------------------------------
//
// The failure this closes was found by looking at a screenshot: the "New client"
// button sits in a toolbar above the client table, and the guide said it was
// *inside the list*. Nothing was broken — a page section really did contain it,
// in the document and in the coordinates. The word "list" was the lie.

if (runs('container')) {
  const PAGE = { x: 30, y: 103, width: 1380, height: 424 };
  const CREATE = { x: 184, y: 103, width: 91, height: 34 };
  const ROWS = { x: 30, y: 203, width: 1380, height: 324 };
  const member = (semanticId, ref, containerSemanticId) => ({
    semanticId,
    ref,
    containerSemanticId,
    route: '/clients',
  });
  const page = (overrides = {}) => ({
    route: '/clients',
    snapshotId: 's1',
    applicationVersion: bundle.applicationVersion,
    visibleSemanticIds: ['clients', 'clients.create', 'clients.table'],
    runtimeInstances: [
      member('clients.create', 'a1', 'clients'),
      member('clients.search', 'a2', 'clients'),
      member('clients.table', 'a3', 'clients'),
      member('clients.table.row', 'r1', 'clients.table'),
      member('clients.table.row', 'r2', 'clients.table'),
    ],
    elementBoxes: { clients: PAGE, 'clients.create': CREATE, 'clients.table': ROWS },
    elementContainers: { 'clients.create': ['clients'], 'clients.table': ['clients'] },
    elementRoles: { clients: 'section', 'clients.create': 'button', 'clients.table': 'table' },
    ...overrides,
  });

  const toolbar = core.describeVisualContext({
    bundle,
    context: page(),
    targetSemanticId: 'clients.create',
  });
  const toolbarSentence = toolbar?.sentences?.geometryOnly ?? '';
  if (toolbarSentence.includes('inside'))
    failures.push(`a toolbar button was described as inside something: ${toolbarSentence}`);
  if (toolbarSentence !== 'On this screen, it is directly above the list.')
    failures.push(`the toolbar button lost its true relation: ${toolbarSentence || '(nothing)'}`);
  if (
    !(toolbar?.receipt?.refusals ?? []).some((line) =>
      line.includes('not described as a collection'),
    )
  )
    failures.push('the wrapper was passed over with no explanation in the receipt');

  // The permitted case, so the rule is not simply "never say inside".
  const inRow = core.describeVisualContext({
    bundle,
    context: page({
      visibleSemanticIds: ['clients.table', 'clients.table.delete'],
      elementBoxes: {
        'clients.table': ROWS,
        'clients.table.delete': { x: 1200, y: 240, width: 80, height: 30 },
      },
      elementContainers: { 'clients.table.delete': ['clients.table'] },
      elementRoles: { 'clients.table': 'table', 'clients.table.delete': 'button' },
    }),
    targetSemanticId: 'clients.table.delete',
  });
  if (inRow?.targetDescription !== 'inside the list')
    failures.push(
      `a control genuinely inside a repeated collection lost it: ${inRow?.targetDescription}`,
    );

  // The shapes an adversarial audit walked through the first version of this
  // rule. Each one produced "inside the list" about something that was not in
  // any list a person would recognise, and each one is ordinary rather than
  // hostile: a grid root that also holds a toolbar is what most data-grid
  // components render.
  const attacks = [
    [
      'a toolbar button transitively inside a grid root',
      {
        visibleSemanticIds: ['clients.grid', 'clients.grid.toolbar', 'clients.export'],
        runtimeInstances: [
          member('clients.grid.toolbar', 'w0', 'clients.grid'),
          member('clients.export', 'w1', 'clients.grid.toolbar'),
          member('clients.grid.row', 'r1', 'clients.grid'),
          member('clients.grid.row', 'r2', 'clients.grid'),
        ],
        elementBoxes: {
          'clients.grid': PAGE,
          'clients.grid.toolbar': { x: 30, y: 103, width: 1380, height: 42 },
          'clients.export': { x: 364, y: 103, width: 97, height: 34 },
        },
        elementContainers: {
          'clients.grid.toolbar': ['clients.grid'],
          'clients.export': ['clients.grid.toolbar', 'clients.grid'],
        },
        elementRoles: {
          'clients.grid': 'grid',
          'clients.grid.toolbar': 'toolbar',
          'clients.export': 'button',
        },
      },
      'clients.export',
    ],
    [
      'a custom-element wrapper whose children repeat',
      {
        visibleSemanticIds: ['clients', 'clients.create'],
        runtimeInstances: [
          member('clients.create', 'w1', 'clients'),
          member('clients.card', 'c1', 'clients'),
          member('clients.card', 'c2', 'clients'),
        ],
        elementBoxes: { clients: PAGE, 'clients.create': CREATE },
        elementContainers: { 'clients.create': ['clients'] },
        elementRoles: { clients: 'sw-page', 'clients.create': 'button' },
      },
      'clients.create',
    ],
    [
      'a wrapper reporting no role at all',
      {
        visibleSemanticIds: ['clients', 'clients.create'],
        runtimeInstances: [
          member('clients.create', 'w1', 'clients'),
          member('clients.card', 'c1', 'clients'),
          member('clients.card', 'c2', 'clients'),
        ],
        elementBoxes: { clients: PAGE, 'clients.create': CREATE },
        elementContainers: { 'clients.create': ['clients'] },
      },
      'clients.create',
    ],
    [
      'a single list item holding repeated chips',
      {
        visibleSemanticIds: ['clients.card', 'clients.card.delete'],
        runtimeInstances: [
          member('clients.card.tag', 't1', 'clients.card'),
          member('clients.card.tag', 't2', 'clients.card'),
          member('clients.card.delete', 'd1', 'clients.card'),
        ],
        elementBoxes: {
          'clients.card': { x: 30, y: 240, width: 320, height: 180 },
          'clients.card.delete': { x: 250, y: 380, width: 80, height: 30 },
        },
        elementContainers: { 'clients.card.delete': ['clients.card'] },
        elementRoles: { 'clients.card': 'li', 'clients.card.delete': 'button' },
      },
      'clients.card.delete',
    ],
    [
      'a table row holding repeated action buttons',
      {
        visibleSemanticIds: ['clients.table.row', 'clients.row.name'],
        runtimeInstances: [
          member('toolbar.action', 'a1', 'clients.table.row'),
          member('toolbar.action', 'a2', 'clients.table.row'),
          member('clients.row.name', 'n1', 'clients.table.row'),
        ],
        elementBoxes: {
          'clients.table.row': { x: 31, y: 241, width: 1378, height: 57 },
          'clients.row.name': { x: 40, y: 252, width: 200, height: 34 },
        },
        elementContainers: { 'clients.row.name': ['clients.table.row'] },
        elementRoles: { 'clients.table.row': 'row', 'clients.row.name': 'textbox' },
      },
      'clients.row.name',
    ],
  ];
  for (const [label, overrides, target] of attacks) {
    const described = core.describeVisualContext({
      bundle,
      context: page(overrides),
      targetSemanticId: target,
    });
    if (JSON.stringify(described?.sentences ?? {}).includes('inside'))
      failures.push(`${label} was allowed to contain something`);
  }

  // And the permitted shapes, so the rule is not simply "never say inside".
  // A control the list itself holds, and a control inside one of its items.
  const listHeldControl = core.describeVisualContext({
    bundle,
    context: page({
      route: '/invoices',
      visibleSemanticIds: ['invoices.list', 'invoices.list.clear'],
      runtimeInstances: [
        {
          semanticId: 'invoices.list.clear',
          ref: 'c0',
          containerSemanticId: 'invoices.list',
          route: '/invoices',
        },
        {
          semanticId: 'invoices.list.row',
          ref: 'r1',
          containerSemanticId: 'invoices.list',
          route: '/invoices',
        },
        {
          semanticId: 'invoices.list.row',
          ref: 'r2',
          containerSemanticId: 'invoices.list',
          route: '/invoices',
        },
      ],
      elementBoxes: {
        'invoices.list': { x: 30, y: 300, width: 1380, height: 300 },
        'invoices.list.clear': { x: 40, y: 310, width: 80, height: 30 },
      },
      elementContainers: { 'invoices.list.clear': ['invoices.list'] },
      elementRoles: { 'invoices.list': 'ul', 'invoices.list.clear': 'button' },
    }),
    targetSemanticId: 'invoices.list.clear',
  });
  if (listHeldControl?.targetDescription !== 'inside the list')
    failures.push(`a control the list itself holds lost it: ${listHeldControl?.targetDescription}`);

  // A collection with one item is still a collection. Requiring a repetition to
  // *name* one made Closed Loop #18's sentence disappear whenever the search
  // matched a single client.
  const oneRow = core.describeVisualContext({
    bundle,
    context: page({
      visibleSemanticIds: ['clients.search', 'clients.table'],
      runtimeInstances: [member('clients.table.row', 'r1', 'clients.table')],
      elementBoxes: {
        'clients.search': { x: 30, y: 169, width: 240, height: 34 },
        'clients.table': ROWS,
      },
      elementRoles: { 'clients.search': 'searchbox', 'clients.table': 'table' },
    }),
    targetSemanticId: 'clients.search',
  });
  if (oneRow?.regionDescription !== 'the list')
    failures.push('a table with one row stopped being a list');

  // And the sentence Closed Loop #18 shipped is unchanged, which is the constraint
  // this rule had to work around rather than through. Recomputed here rather than
  // borrowed, so this aspect stands on its own.
  const shipped =
    core.describeVisualContext({
      bundle,
      context: {
        route: '/clients',
        snapshotId: 's1',
        applicationVersion: bundle.applicationVersion,
        visibleSemanticIds: ['clients.search', 'clients.table'],
        runtimeInstances: [
          member('clients.table.row', 'r1', 'clients.table'),
          member('clients.table.row', 'r2', 'clients.table'),
        ],
        elementBoxes: {
          'clients.search': { x: 32, y: 170, width: 238, height: 36 },
          'clients.table': { x: 32, y: 210, width: 1376, height: 320 },
        },
        elementRoles: { 'clients.search': 'textbox', 'clients.table': 'table' },
        runtimeVisibleLanguage: [
          {
            semanticId: 'clients.search',
            sourceKind: 'PLACEHOLDER',
            text: 'Search clients',
            route: '/clients',
            snapshotId: 's1',
            privacyClass: 'SAFE',
            trust: 'HOST_UI',
          },
        ],
      },
      targetSemanticId: 'clients.search',
    })?.sentences?.withVisibleText ?? '';
  if (shipped !== 'Use the field showing "Search clients" above the list.')
    failures.push(`the runtime-visible-language sentence moved: ${shipped}`);
  notes.push(
    'a collection is an element that reports itself one; containment runs through its own items',
  );
}

const say = (line = '') => console.log(line);
say(`\nContextual authority — ${ASPECT}\n`);
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — a word on screen got further than describing the screen.\n');
  process.exit(1);
}
say('\nPASS — visible now, not named forever.\n');
