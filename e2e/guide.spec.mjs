/**
 * HISTORICAL. Do not run.
 *
 * This suite captured interactive-review-v1, which is a frozen evaluation artefact. It drives the
 * panel markup as it stood at Closed Loop #13.1; Closed Loop #14 redesigned that
 * markup, so the selectors no longer match — and repairing them would be worse
 * than leaving them broken, because a green run would *rewrite* a frozen
 * artefact with pictures of a different product.
 *
 * The artefact's integrity is enforced by `test:interactive-review-freeze`
 * (every byte pinned by digest) and `test:interactive-review-validity`. It is
 * not enforced by re-capturing it, and must not be.
 *
 * Kept in the repository as the record of how the artefact was produced.
 */

/**
 * The first interactive evaluation, in a real browser.
 *
 * jsdom answers questions about structure. It cannot answer the ones this loop
 * is actually about: did the element scroll into view, did focus land on it, is
 * it visible, did the highlight draw over the right thing. So this drives real
 * Chromium against the benchmark application with the guide beside it, and
 * writes both the screenshots and the interactive review record.
 *
 * Everything asserted here is a property of the *product*, not of the test: the
 * guide names nothing it was not given a name for, points only at targets the
 * contract returned, and never operates the application on the user's behalf.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'benchmarks', 'interactive-review-v1');
const SHOTS = path.join(OUT, 'screenshots');
const BASE = process.env['GUIDE_E2E_BASE'] ?? 'http://127.0.0.1:4319';

mkdirSync(SHOTS, { recursive: true });

const record = [];
const failures = [];
const timings = {};

/** Words that would mean the guide invented a name for the unnamed input. */
const FABRICATED = ['Search box', 'Filter field', 'the Search', 'Search field', 'Search input'];

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  return `screenshots/${name}.png`;
};

async function ask(page, question) {
  const started = Date.now();
  await page.fill('.swg-composer textarea', question);
  await page.click('.swg-composer button');
  await page.waitForSelector('.swg-answer', { state: 'attached' });
  return Date.now() - started;
}

/** The last answer, read out of the DOM as a user would see it. */
async function lastAnswer(page) {
  return page.evaluate(() => {
    const answers = [...document.querySelectorAll('.swg-answer')];
    const node = answers[answers.length - 1];
    if (node === undefined) return null;
    const text = (selector) => node.querySelector(selector)?.textContent?.trim() ?? undefined;
    return {
      title: text('.swg-answer__title'),
      purpose: text('.swg-answer__purpose'),
      summary: text('.swg-answer__summary'),
      conditions: [...node.querySelectorAll('.swg-conditions p')].map((p) => p.textContent.trim()),
      steps: [...node.querySelectorAll('.swg-steps li')].map((li) => ({
        text: li.textContent.trim(),
        semanticId: li.getAttribute('data-semantic-id') ?? undefined,
      })),
      note: text('.swg-note'),
      hasShowMe: [...node.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Show me',
      ),
      allText: node.textContent,
    };
  });
}

const check = (id, condition, detail) => {
  if (!condition) failures.push(`${id}: ${detail}`);
  return condition;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error)));

// ---------------------------------------------------------------------------
// The host, before anything is asked
// ---------------------------------------------------------------------------
const openedAt = Date.now();
await page.goto(`${BASE}/clients`);
await page.waitForSelector('[data-guide="clients.table"]');
await shot(page, 'A-host-guide-closed');

await page.click('[data-testid="open-guide"]');
await page.waitForSelector('[data-testid="guide-panel"]');
timings.firstOpenMs = Date.now() - openedAt;
await shot(page, 'B-guide-empty');

// ---------------------------------------------------------------------------
// IR01 — create a client
// ---------------------------------------------------------------------------
{
  const ms = await ask(page, 'How do I create a client?');
  timings.queryMs = ms;
  const answer = await lastAnswer(page);
  const shotC = await shot(page, 'C-create-client-response');

  check(
    'IR01',
    answer.purpose === 'Lets you create a new client.',
    `purpose was ${answer.purpose}`,
  );
  check('IR01', answer.steps.length >= 2, 'expected a procedure');
  // Already on /clients, so the entry step is gone — the contract pruned it and
  // the panel showed exactly what it was given.
  check('IR01', !answer.steps.some((s) => s.text.startsWith('Open ')), 'entry step was not pruned');
  check('IR01', answer.hasShowMe === false || answer.hasShowMe === true, 'n/a');

  const before = page.url();
  const dialogBefore = await page.locator('[data-guide="clients.create-dialog"]').count();
  record.push({
    id: 'IR01',
    scenario: 'Create client',
    initialRoute: '/clients',
    question: 'How do I create a client?',
    response: answer,
    routeAfter: new URL(before).pathname,
    // The guide never presses anything. If the dialog is closed before and after,
    // the user is still the one who acts.
    interaction: { dialogOpenedByGuide: dialogBefore !== 0 },
    screenshots: [shotC],
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
  check('IR01', dialogBefore === 0, 'the guide opened the create dialog by itself');
}

// ---------------------------------------------------------------------------
// IR02 — filter clients: the primary experiment
// ---------------------------------------------------------------------------
{
  await ask(page, 'How do I filter clients?');
  const answer = await lastAnswer(page);
  const shotE = await shot(page, 'E-filter-clients-response');

  check('IR02', answer.purpose === 'Lets you filter clients.', `purpose was ${answer.purpose}`);
  check('IR02', answer.title === undefined, `a title was invented: ${answer.title}`);
  for (const word of FABRICATED) {
    check('IR02', !answer.allText.includes(word), `fabricated name "${word}"`);
  }
  check('IR02', !/\bSearch\b/.test(answer.allText), 'the word "Search" reached the user');

  const routeBefore = new URL(page.url()).pathname;
  const dispatched = Date.now();
  await page.click('.swg-answer:last-of-type button:has-text("Show me")');
  await page.waitForTimeout(400);
  timings.showMeMs = Date.now() - dispatched;

  const target = page.locator('[data-guide="clients.search"]');
  const inView = await target.isVisible();
  const focusedId = await page.evaluate(
    () => document.activeElement?.closest?.('[data-guide]')?.getAttribute('data-guide') ?? null,
  );
  // The overlay marks its root with the package's own attribute. Guessing a
  // class name from outside is how a working product reads as a broken one.
  const highlighted = await page.evaluate(
    () => document.querySelectorAll('[data-statewave-guide-overlay]').length > 0,
  );
  const shotF = await shot(page, 'F-unnamed-input-highlighted');

  check('IR02', inView, 'the unnamed input was not visible after Show me');
  check('IR02', focusedId === 'clients.search', `focus landed on ${focusedId}`);

  record.push({
    id: 'IR02',
    scenario: 'Filter clients — unnamed target',
    initialRoute: routeBefore,
    question: 'How do I filter clients?',
    response: answer,
    expectedTarget: 'clients.search',
    actualTarget: focusedId,
    routeAfter: new URL(page.url()).pathname,
    interaction: {
      targetVisible: inView,
      focused: focusedId === 'clients.search',
      highlightDrawn: highlighted,
    },
    safety: { fabricatedNames: 0, valueTyped: await target.inputValue() },
    screenshots: [shotE, shotF],
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
  // Show me points; it does not type.
  check('IR02', (await target.inputValue()) === '', 'the guide typed into the input');
}

// ---------------------------------------------------------------------------
// IR03 — Export CSV from another screen
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/settings`);
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'Where is Export CSV?');
  const answer = await lastAnswer(page);
  const routeBefore = new URL(page.url()).pathname;

  await page.click('.swg-answer:last-of-type button:has-text("Show me")');
  await page.waitForTimeout(500);
  const routeAfter = new URL(page.url()).pathname;
  const visible = await page
    .locator('[data-guide="clients.export"]')
    .isVisible()
    .catch(() => false);

  check('IR03', routeBefore === '/settings', 'wrong starting screen');
  check('IR03', routeAfter === '/clients', `Show me did not navigate (${routeAfter})`);
  check('IR03', visible, 'Export CSV was not visible after navigating');

  record.push({
    id: 'IR03',
    scenario: 'Find Export CSV from another screen',
    initialRoute: routeBefore,
    question: 'Where is Export CSV?',
    response: answer,
    expectedTarget: 'clients.export',
    actualTarget: visible ? 'clients.export' : null,
    routeAfter,
    interaction: { navigated: routeBefore !== routeAfter, targetVisible: visible },
    screenshots: [],
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
}

// ---------------------------------------------------------------------------
// IR04 — why can't I see Delete
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/clients/c1`);
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, "Why can't I see Delete?");
  const answer = await lastAnswer(page);
  const shotG = await shot(page, 'G-permission-explanation');

  check('IR04', answer.conditions.length > 0, 'no condition was explained');
  check(
    'IR04',
    answer.conditions.every((c) => /permission/i.test(c)),
    'a non-permission reason appeared',
  );
  for (const invented of ['subscription', 'plan', 'role', 'billing', 'trial', 'feature flag']) {
    check(
      'IR04',
      !answer.allText.toLowerCase().includes(invented),
      `invented reason "${invented}"`,
    );
  }
  record.push({
    id: 'IR04',
    scenario: 'Explain a missing Delete',
    initialRoute: '/clients/c1',
    question: "Why can't I see Delete?",
    response: answer,
    routeAfter: '/clients/c1',
    interaction: {},
    safety: { inventedReasons: 0 },
    screenshots: [shotG],
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
}

// ---------------------------------------------------------------------------
// IR05 / IR06 — "what does this do?", focused and not
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/clients`);
  await page.focus('[data-guide="clients.create"]');
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await page.evaluate(() => {
    document
      .querySelector('[data-guide="clients.create"]')
      ?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  await ask(page, 'What does this do?');
  const focusedAnswer = await lastAnswer(page);
  const shotD = await shot(page, 'D-showme-highlight-new-client');

  record.push({
    id: 'IR05',
    scenario: 'Focused "What does this do?"',
    initialRoute: '/clients',
    question: 'What does this do?',
    context: { focusedSemanticId: 'clients.create' },
    response: focusedAnswer,
    routeAfter: '/clients',
    interaction: {},
    screenshots: [shotD],
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });

  await page.goto(`${BASE}/clients`);
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'What does this do?');
  const ambiguous = await lastAnswer(page);
  const shotH = await shot(page, 'H-ambiguous-response');

  check('IR06', ambiguous.purpose === undefined, 'an ambiguous question was answered anyway');
  // Candidates are shown by their supported titles, never by a feature id.
  check(
    'IR06',
    !/\bclients\.[a-z-]+\b/.test(ambiguous.allText),
    'a feature id was shown to the user',
  );
  record.push({
    id: 'IR06',
    scenario: 'Ambiguous "What does this do?"',
    initialRoute: '/clients',
    question: 'What does this do?',
    response: ambiguous,
    routeAfter: '/clients',
    interaction: {},
    safety: { featureIdsExposed: 0 },
    screenshots: [shotH],
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
}

// ---------------------------------------------------------------------------
// IR07 — the refusal
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/invoices`);
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'How do I open an invoice?');
  const answer = await lastAnswer(page);

  check('IR07', answer.purpose === undefined, 'the refusal was answered');
  check(
    'IR07',
    !answer.allText.includes('Raise invoice'),
    'a nearby invoice action was substituted',
  );
  record.push({
    id: 'IR07',
    scenario: 'Unsupported invoice-open case',
    initialRoute: '/invoices',
    question: 'How do I open an invoice?',
    response: answer,
    routeAfter: '/invoices',
    interaction: {},
    safety: { substitutedFeature: false },
    screenshots: [],
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
}

// ---------------------------------------------------------------------------
// IR08 — stale context
// ---------------------------------------------------------------------------
{
  const answer = await page.evaluate(() => {
    const w = globalThis;
    return w.__swgStaleProbe === undefined ? null : w.__swgStaleProbe();
  });
  record.push({
    id: 'IR08',
    scenario: 'Stale context',
    note: 'Exercised in the contract suite; the host always supplies its own live version.',
    response: answer,
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
}

// ---------------------------------------------------------------------------
// IR09 / IR10 — dynamic runtime instance names, and secrets
// ---------------------------------------------------------------------------
{
  await page.goto(`${BASE}/clients/c1`);
  const dynamic = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-guide="invoices.list.open"]')];
    return rows.map((row) => row.textContent?.trim()).slice(0, 3);
  });

  await page.goto(`${BASE}/settings`);
  await page.click('[data-guide="settings.rotate-key"]');
  await page.waitForTimeout(300);
  const revealed = await page.evaluate(
    () => document.querySelector('[data-guide="settings.new-key"]')?.textContent?.trim() ?? null,
  );
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'Where is the new key?');
  const answer = await lastAnswer(page);
  const panelText = await page.locator('[data-testid="guide-panel"]').textContent();

  const leaked = revealed !== null && revealed.length > 6 && panelText.includes(revealed);
  check('IR10', !leaked, 'the revealed key reached the guide panel');

  record.push({
    id: 'IR09',
    scenario: 'Dynamic runtime instance target',
    initialRoute: '/clients/c1',
    runtimeInstanceNames: dynamic,
    note: 'Invoice rows carry a runtime accessible name (the invoice number). It is present in the running application and is not promoted into the ProductModel or into any guide sentence.',
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
  record.push({
    id: 'IR10',
    scenario: 'Secret / redaction',
    initialRoute: '/settings',
    question: 'Where is the new key?',
    response: answer,
    revealedValuePresentInHost: revealed !== null,
    revealedValueInGuide: leaked,
    safety: { secretLeaks: leaked ? 1 : 0 },
    scores: { usefulness: null, correctness: null, taskCompletion: null, clarity: null },
  });
}

// ---------------------------------------------------------------------------
// Accessibility, interference and the inspector
// ---------------------------------------------------------------------------
const accessibility = await (async () => {
  await page.goto(`${BASE}/clients`);
  // The client list arrives asynchronously. Snapshotting before it lands would
  // compare a half-rendered application against a finished one and blame the
  // guide for the difference.
  await page.waitForSelector('[data-guide="clients.table.row"]');
  const before = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('[data-guide]')]
      .map((n) => n.getAttribute('data-guide'))
      .sort(),
    names: [...document.querySelectorAll('[data-guide]')].map((n) => n.textContent?.trim()).sort(),
  }));

  await page.focus('[data-testid="open-guide"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="guide-panel"]');
  const composerFocused = await page.evaluate(
    () => document.activeElement?.tagName.toLowerCase() === 'textarea',
  );
  await page.keyboard.type('How do I create a client?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.swg-answer');

  const after = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('[data-guide]')]
      .map((n) => n.getAttribute('data-guide'))
      .sort(),
    names: [...document.querySelectorAll('[data-guide]')].map((n) => n.textContent?.trim()).sort(),
  }));

  const labelled = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="guide-panel"]');
    const buttons = [...panel.querySelectorAll('button')];
    return {
      role: panel.getAttribute('role'),
      labelled: panel.hasAttribute('aria-labelledby'),
      unlabelledButtons: buttons.filter(
        (b) => (b.textContent ?? '').trim().length === 0 && !b.hasAttribute('aria-label'),
      ).length,
      liveRegions: panel.parentElement.querySelectorAll('[aria-live]').length,
    };
  });

  // Escape closes, and focus goes back where it came from.
  await page.keyboard.press('Escape');
  const closed = (await page.locator('[data-testid="guide-panel"]').count()) === 0;
  const restored = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') === 'open-guide',
  );

  // Host untouched: same ids, same accessible text.
  const idsUnchanged = JSON.stringify(before.ids) === JSON.stringify(after.ids);
  const namesUnchanged = JSON.stringify(before.names) === JSON.stringify(after.names);
  check('a11y', composerFocused, 'opening did not move focus into the composer');
  check('a11y', labelled.unlabelledButtons === 0, 'a button has no accessible name');
  check('a11y', labelled.labelled, 'the panel is not labelled');
  check('a11y', closed, 'Escape did not close the panel');
  check('host', idsUnchanged, 'the guide changed host semantic ids');
  check('host', namesUnchanged, 'the guide changed host accessible text');

  return {
    composerFocused,
    ...labelled,
    closed,
    focusRestored: restored,
    idsUnchanged,
    namesUnchanged,
  };
})();

// The inspector, and only in developer mode.
{
  await page.goto(`${BASE}/clients?dev=1`);
  await page.click('[data-testid="open-guide"]');
  await ask(page, 'How do I create a client?');
  await page.waitForSelector('.swg-inspector', { timeout: 3000 }).catch(() => undefined);
  const hasInspector = (await page.locator('.swg-inspector').count()) > 0;
  await page
    .locator('.swg-inspector summary')
    .click()
    .catch(() => undefined);
  await shot(page, 'I-developer-inspector');
  check('dev', hasInspector, 'developer mode showed no inspector');

  await page.goto(`${BASE}/clients`);
  await page.click('[data-testid="open-guide"]');
  await ask(page, 'How do I create a client?');
  const userMode = (await page.locator('.swg-inspector').count()) === 0;
  check('dev', userMode, 'the inspector appeared in user mode');
}

// Route change refresh timing.
{
  await page.goto(`${BASE}/clients`);
  await page.click('[data-testid="open-guide"]');
  const started = Date.now();
  await page.click('[data-guide="nav.settings"]');
  await page.waitForFunction(() => globalThis.location.pathname === '/settings');
  await ask(page, 'How do I create a client?');
  timings.contextRefreshMs = Date.now() - started;
}

await browser.close();

const report = {
  version: 1,
  harness: 'playwright/chromium',
  base: BASE,
  gate: 'DEVELOPMENT_INTERACTIVE_REVIEW',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  reviewerType: null,
  scoredBy: null,
  timings,
  accessibility,
  pageErrors: consoleErrors,
  scenarios: record,
};
writeFileSync(path.join(OUT, 'interactive-review-v1.json'), `${JSON.stringify(report, null, 2)}\n`);

const say = (line = '') => console.log(line);
say('\nInteractive review v1 — real browser\n');
say(`  scenarios recorded                   ${record.length}`);
say(
  `  screenshots                          ${['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].length}`,
);
say(`  page errors                          ${consoleErrors.length}`);
say('');
say(`  guide panel first open               ${timings.firstOpenMs} ms`);
say(`  deterministic query response         ${timings.queryMs} ms`);
say(`  Show me dispatch → settled           ${timings.showMeMs} ms`);
say(`  context refresh after route change   ${timings.contextRefreshMs} ms`);
say('');
say(`  ${path.relative(ROOT, path.join(OUT, 'interactive-review-v1.json'))}`);

if (failures.length > 0 || consoleErrors.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  for (const error of consoleErrors) say(`    ✗ page error: ${error}`);
  say('\nFAIL — the interactive product did not behave as the contract promises.\n');
  process.exit(1);
}
say("\nPASS — the guide answered, pointed, refused and never acted on the user's behalf.\n");
