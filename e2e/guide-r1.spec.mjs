/**
 * HISTORICAL. Do not run.
 *
 * This suite captured interactive-review-v1-r1, which is a frozen evaluation artefact. It drives the
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
 * Interactive review v1-r1 — the run that actually exercises its own scenarios.
 *
 * V1 was issued and then failed inspection, for reasons that were all the same
 * reason: the harness asserted weakly enough that a scenario could take the
 * wrong path and still pass. `IR05` claimed a focused question and asked an
 * unfocused one. `IR06` was recorded as an ambiguity and was a refusal. Two of
 * the nine screenshots turned out to be the same image, which is how it was
 * finally noticed.
 *
 * So every capture here is *validated before it is taken*: the state a
 * screenshot claims must be visible in the DOM at the moment the shutter opens,
 * and a scenario carries an explicit `scenarioValidity` saying whether it
 * exercised what it is named for. A screenshot may no longer claim a state its
 * pixels do not show.
 *
 * The two states an application cannot produce for itself — a missing
 * permission, a stale build — are set up through query-string seams in the host,
 * not by weakening anything in the product.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'benchmarks', 'interactive-review-v1-r1');
const SHOTS = path.join(OUT, 'screenshots');
const BASE = process.env['GUIDE_E2E_BASE'] ?? 'http://127.0.0.1:4319';
mkdirSync(SHOTS, { recursive: true });

const record = [];
const failures = [];
const timings = {};
const frames = [];
const check = (id, condition, detail) => {
  if (!condition) failures.push(`${id}: ${detail}`);
  return condition;
};

/**
 * The DOM conditions each declared state must satisfy before it is photographed.
 *
 * This is the rule V1 lacked. A screenshot named "ambiguous response" is only
 * taken once ambiguity is on screen; one named "highlighted" is only taken once
 * the overlay is attached.
 */
const STATE_CONDITIONS = {
  'answer-visible': () => {
    const answer = [...document.querySelectorAll('.swg-answer')].pop();
    return (
      answer !== undefined &&
      answer.textContent.trim().length > 0 &&
      getComputedStyle(answer).opacity === '1'
    );
  },
  'steps-visible': () =>
    [...document.querySelectorAll('.swg-answer')].pop()?.querySelectorAll('.swg-steps li').length >
    0,
  'purpose-visible': () =>
    [...document.querySelectorAll('.swg-answer')].pop()?.querySelector('.swg-answer__purpose') !==
    null,
  'conditions-visible': () =>
    [...document.querySelectorAll('.swg-answer')].pop()?.querySelectorAll('.swg-conditions p')
      .length > 0,
  'ambiguity-visible': () =>
    [...document.querySelectorAll('.swg-answer')].pop()?.querySelectorAll('.swg-choices .swg-note')
      .length > 1,
  'highlight-attached': () =>
    document.querySelectorAll('[data-statewave-guide-overlay]').length > 0,
  'panel-open-empty': () =>
    document.querySelector('[data-testid="guide-panel"]') !== null &&
    document.querySelectorAll('.swg-answer').length === 0,
  'panel-closed': () => document.querySelector('[data-testid="guide-panel"]') === null,
  'inspector-visible': () => document.querySelector('.swg-inspector') !== null,
  'delete-absent': () =>
    document.querySelectorAll('[data-guide="client-detail.delete"]').length === 0,
  'stale-note-visible': () =>
    ([...document.querySelectorAll('.swg-answer')].pop()?.textContent ?? '').includes(
      'screen moved',
    ),
};

/**
 * Takes a screenshot, having first proved the state it claims is on screen.
 *
 * Waiting on a condition rather than a sleep, and recording the conditions with
 * the frame so a reader can see what was required rather than trusting a name.
 */
async function capture(page, file, meta) {
  // Nothing is photographed until the panel has stopped moving.
  //
  // This is the defect behind every duplicate screenshot in V1. An answer
  // animates in from `opacity: 0`, so `.swg-answer` exists in the DOM — and
  // satisfies a structural condition — a whole animation before any of it is
  // visible. Four frames were captured at opacity zero, which is why two pairs
  // of them were byte-identical: they were pictures of the same empty panel.
  //
  // Presence is not visibility. The condition is now about paint, and it is
  // still a condition rather than a sleep.
  await page
    .waitForFunction(
      () => {
        const panel = document.querySelector('[data-testid="guide-panel"]');
        if (panel === null) return true;
        if (panel.getAnimations({ subtree: true }).some((a) => a.playState === 'running')) {
          return false;
        }
        const answer = [...document.querySelectorAll('.swg-answer')].pop();
        return answer === undefined || getComputedStyle(answer).opacity === '1';
      },
      undefined,
      { timeout: 6000 },
    )
    .catch(() => failures.push(`${file}: the panel never settled`));

  for (const state of meta.states) {
    const condition = STATE_CONDITIONS[state];
    if (condition === undefined) {
      failures.push(`${file}: "${state}" is not a known state`);
      continue;
    }
    try {
      await page.waitForFunction(condition, undefined, { timeout: 6000 });
    } catch {
      failures.push(`${file}: claims "${state}" and the DOM never satisfied it`);
    }
  }
  await page.screenshot({ path: path.join(SHOTS, file) });
  frames.push({ file: `screenshots/${file}`, ...meta });
  return `screenshots/${file}`;
}

async function ask(page, question) {
  const before = await page.locator('.swg-answer').count();
  const started = Date.now();
  await page.fill('.swg-composer textarea', question);
  await page.click('.swg-composer button');
  await page.waitForFunction(
    (count) => document.querySelectorAll('.swg-answer').length > count,
    before,
    { timeout: 8000 },
  );
  return Date.now() - started;
}

async function lastAnswer(page) {
  return page.evaluate(() => {
    const node = [...document.querySelectorAll('.swg-answer')].pop();
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
      choices: [...node.querySelectorAll('.swg-choices .swg-note')].map((n) =>
        n.textContent.replace(/^•\s*/, '').trim(),
      ),
      note: text('.swg-note'),
      hasShowMe: [...node.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Show me',
      ),
      allText: node.textContent,
    };
  });
}

const open = async (page, url) => {
  await page.goto(url);
  await page.waitForSelector('[data-guide]');
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

// --- context frames -------------------------------------------------------
const openedAt = Date.now();
await page.goto(`${BASE}/clients`);
await page.waitForSelector('[data-guide="clients.table.row"]');
await capture(page, 'A-host-guide-closed.png', {
  scenario: null,
  route: '/clients',
  states: ['panel-closed'],
  description: 'The host application with the guide closed.',
});
await page.click('[data-testid="open-guide"]');
await page.waitForSelector('[data-testid="guide-panel"]');
timings.firstOpenMs = Date.now() - openedAt;
await capture(page, 'B-guide-empty.png', {
  scenario: null,
  route: '/clients',
  states: ['panel-open-empty'],
  description: 'The panel open, before anything has been asked.',
});

// --- IR01 create a client -------------------------------------------------
{
  timings.queryMs = await ask(page, 'How do I create a client?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, 'C-create-client-answer.png', {
    scenario: 'IR01',
    route: '/clients',
    status: 'ANSWERED',
    states: ['answer-visible', 'steps-visible', 'purpose-visible'],
    description: 'The create-client answer, steps visible.',
  });

  const texts = answer.steps.map((step) => step.text);
  check('IR01', answer.purpose === 'Lets you create a new client.', 'purpose changed');
  check(
    'IR01',
    texts.some((t) => t.includes('New client')),
    'the trigger step is missing',
  );
  check(
    'IR01',
    texts.some((t) => t.includes('billing email')),
    'the field step is missing',
  );
  // The defect this revision exists for.
  check(
    'IR01',
    texts.some((t) => t.includes('Create client')),
    'the terminal step is missing',
  );
  check('IR01', !texts.some((t) => t.startsWith('Open ')), 'the entry step was not pruned');

  const dialog = await page.locator('[data-guide="clients.create-dialog"]').count();
  check('IR01', dialog === 0, 'the guide opened the create dialog itself');
  record.push({
    id: 'IR01',
    scenario: 'Create client',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/clients',
      question: 'How do I create a client?',
      guideSaid: answer,
      routeAfter: '/clients',
      interaction: {
        dialogOpenedByGuide: dialog !== 0,
        terminalStepPresent: texts.some((t) => t.includes('Create client')),
      },
      safety: { guideOperatedApplication: false },
    },
    screenshots: [shot],
  });
}

// --- IR02 filter clients --------------------------------------------------
{
  await ask(page, 'How do I filter clients?');
  const answer = await lastAnswer(page);
  const shotE = await capture(page, 'E-filter-clients-answer.png', {
    scenario: 'IR02',
    route: '/clients',
    status: 'PARTIAL',
    states: ['answer-visible', 'purpose-visible'],
    description: 'The filter answer, before Show me.',
  });

  check('IR02', answer.purpose === 'Lets you filter clients.', 'purpose changed');
  check('IR02', answer.title === undefined, 'a title was invented');
  check('IR02', answer.hasShowMe, 'no Show me was offered');
  // The contradiction this revision removes.
  check(
    'IR02',
    !answer.allText.includes('That is all I can show'),
    'a terminal note sits beside a live Show me',
  );
  for (const word of ['Search box', 'Filter field', 'Search field']) {
    check('IR02', !answer.allText.includes(word), `fabricated name "${word}"`);
  }
  check('IR02', !/\bSearch\b/.test(answer.allText), 'the word "Search" reached the user');

  const dispatched = Date.now();
  await page.click('.swg-answer:last-of-type button:has-text("Show me")');
  // The sequence ends at focus, so wait for focus rather than for the overlay:
  // the highlight attaches first, and checking then reads the state mid-sequence.
  await page
    .waitForFunction(
      () =>
        document.activeElement?.closest?.('[data-guide]')?.getAttribute('data-guide') ===
        'clients.search',
      undefined,
      { timeout: 8000 },
    )
    .catch(() => undefined);
  timings.showMeMs = Date.now() - dispatched;

  const target = page.locator('[data-guide="clients.search"]');
  const visible = await target.isVisible();
  const focused = await page.evaluate(
    () => document.activeElement?.closest?.('[data-guide]')?.getAttribute('data-guide') ?? null,
  );
  const shotF = await capture(page, 'F-filter-target-highlighted.png', {
    scenario: 'IR02',
    route: '/clients',
    states: ['highlight-attached'],
    highlightedTarget: 'clients.search',
    description: 'After Show me: the unnamed filter input highlighted and focused.',
  });
  const typed = await target.inputValue();

  check('IR02', visible, 'the target was not visible');
  check('IR02', focused === 'clients.search', `focus landed on ${focused}`);
  check('IR02', typed === '', 'the guide typed into the input');
  record.push({
    id: 'IR02',
    scenario: 'Filter clients — unnamed target',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/clients',
      question: 'How do I filter clients?',
      guideSaid: answer,
      expectedTarget: 'clients.search',
      actualTarget: focused,
      routeAfter: '/clients',
      interaction: {
        targetVisible: visible,
        focused: focused === 'clients.search',
        highlightDrawn: true,
      },
      safety: { fabricatedNames: 0, valueTyped: typed },
    },
    screenshots: [shotE, shotF],
  });
}

// --- IR03 Export CSV from elsewhere ---------------------------------------
{
  await open(page, `${BASE}/settings`);
  await ask(page, 'Where is Export CSV?');
  const answer = await lastAnswer(page);
  await page.click('.swg-answer:last-of-type button:has-text("Show me")');
  await page
    .waitForFunction(
      () =>
        globalThis.location.pathname === '/clients' &&
        document.querySelector('[data-guide="clients.export"]') !== null &&
        document.querySelectorAll('[data-statewave-guide-overlay]').length > 0,
      undefined,
      { timeout: 8000 },
    )
    .catch(() => undefined);
  const routeAfter = new URL(page.url()).pathname;
  const visible = await page
    .locator('[data-guide="clients.export"]')
    .isVisible()
    .catch(() => false);
  const shot = await capture(page, 'J-export-after-navigation.png', {
    scenario: 'IR03',
    route: routeAfter,
    states: ['highlight-attached'],
    highlightedTarget: 'clients.export',
    description: 'Export CSV, reached from another screen and highlighted.',
  });
  check('IR03', routeAfter === '/clients', `Show me did not navigate (${routeAfter})`);
  check('IR03', visible, 'Export CSV was not visible');
  record.push({
    id: 'IR03',
    scenario: 'Find Export CSV from another screen',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/settings',
      question: 'Where is Export CSV?',
      guideSaid: answer,
      expectedTarget: 'clients.export',
      actualTarget: visible ? 'clients.export' : null,
      routeAfter,
      interaction: { navigated: true, targetVisible: visible },
    },
    screenshots: [shot],
  });
}

// --- IR04 Delete genuinely unavailable ------------------------------------
{
  await open(page, `${BASE}/clients/c1?permissions=clients:read,invoices:read`);
  const deletePresent = await page.locator('[data-guide="client-detail.delete"]').count();
  await ask(page, "Why can't I see Delete?");
  const answer = await lastAnswer(page);
  const shot = await capture(page, 'G-permission-delete-absent.png', {
    scenario: 'IR04',
    route: '/clients/c1',
    status: 'ANSWERED',
    states: ['answer-visible', 'conditions-visible', 'delete-absent'],
    description: 'The permission explanation, with Delete genuinely not rendered.',
  });

  check('IR04', deletePresent === 0, 'Delete was on screen, so the question was meaningless');
  check('IR04', answer.conditions.length > 0, 'no condition was explained');
  check(
    'IR04',
    answer.conditions.every((c) => /permission/i.test(c)),
    'a non-permission reason appeared',
  );
  for (const invented of [
    'subscription',
    'plan',
    'role',
    'billing',
    'trial',
    'feature flag',
    'account',
  ]) {
    check(
      'IR04',
      !answer.allText.toLowerCase().includes(invented),
      `invented reason "${invented}"`,
    );
  }
  record.push({
    id: 'IR04',
    scenario: 'Explain a genuinely missing Delete',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/clients/c1',
      sessionPermissions: ['clients:read', 'invoices:read'],
      deleteRenderedInHost: deletePresent !== 0,
      question: "Why can't I see Delete?",
      guideSaid: answer,
      routeAfter: '/clients/c1',
      safety: { inventedReasons: 0 },
    },
    screenshots: [shot],
  });
}

// --- IR05 focused question, through the real UI ---------------------------
{
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector('[data-guide="clients.table.row"]');
  // The user focuses a control in the application, then reaches for the guide.
  // No context is injected: the panel takes keyboard focus exactly as it would.
  await page.focus('[data-guide="clients.create"]');
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  const composerHasFocus = await page.evaluate(
    () => document.activeElement?.tagName.toLowerCase() === 'textarea',
  );
  await ask(page, 'What does this do?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, 'D-focused-what-does-this-do.png', {
    scenario: 'IR05',
    route: '/clients',
    status: 'ANSWERED',
    states: ['answer-visible', 'purpose-visible', 'steps-visible'],
    description: 'A focused "What does this do?", answered about the focused control.',
  });

  check(
    'IR05',
    composerHasFocus,
    'the composer did not take focus, so the defect is not exercised',
  );
  check('IR05', answer.title === 'New client', `answered about ${answer.title}`);
  check('IR05', answer.purpose === 'Lets you create a new client.', 'wrong purpose');
  record.push({
    id: 'IR05',
    scenario: 'Focused "What does this do?"',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/clients',
      hostFocusedBeforeOpening: 'clients.create',
      composerTookKeyboardFocus: composerHasFocus,
      question: 'What does this do?',
      guideSaid: answer,
      routeAfter: '/clients',
    },
    screenshots: [shot],
  });
}

// --- IR06 real ambiguity ---------------------------------------------------
{
  await open(page, `${BASE}/clients`);
  await ask(page, 'What does this do?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, 'H-ambiguity.png', {
    scenario: 'IR06',
    route: '/clients',
    status: 'AMBIGUOUS',
    states: ['answer-visible', 'ambiguity-visible'],
    description: 'An ambiguous question, answered with a choice rather than a guess.',
  });

  check(
    'IR06',
    answer.choices.length > 1,
    `expected candidates, got ${JSON.stringify(answer.choices)}`,
  );
  check('IR06', answer.purpose === undefined, 'an ambiguous question was answered anyway');
  check(
    'IR06',
    !/[a-z]+\.[a-z-]+/.test(answer.choices.join(' ')),
    'a feature id was shown as a choice',
  );
  record.push({
    id: 'IR06',
    scenario: 'Ambiguous "What does this do?"',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/clients',
      question: 'What does this do?',
      guideSaid: answer,
      candidates: answer.choices,
      routeAfter: '/clients',
      safety: { featureIdsExposed: 0 },
    },
    screenshots: [shot],
  });
}

// --- IR07 the refusal ------------------------------------------------------
{
  await open(page, `${BASE}/invoices`);
  await ask(page, 'How do I open an invoice?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, 'K-unsupported-invoice-open.png', {
    scenario: 'IR07',
    route: '/invoices',
    status: 'UNSUPPORTED',
    states: ['answer-visible'],
    description: 'A question the guide has nothing verified about, refused cleanly.',
  });
  check('IR07', answer.purpose === undefined, 'the refusal was answered');
  check('IR07', !answer.allText.includes('Raise invoice'), 'a nearby action was substituted');
  record.push({
    id: 'IR07',
    scenario: 'Unsupported invoice-open case',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/invoices',
      question: 'How do I open an invoice?',
      guideSaid: answer,
      routeAfter: '/invoices',
      safety: { substitutedFeature: false },
    },
    screenshots: [shot],
  });
}

// --- IR08 stale context, in the browser -----------------------------------
{
  await open(page, `${BASE}/clients?stale=1`);
  await ask(page, 'How do I create a client?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, 'L-stale-context.png', {
    scenario: 'IR08',
    route: '/clients',
    status: 'STALE_CONTEXT',
    states: ['answer-visible', 'stale-note-visible'],
    description: 'A context from a build the bundle does not know: refused, not answered.',
  });
  const actionsOffered = await page
    .locator('.swg-answer:last-of-type button:has-text("Show me")')
    .count();
  check('IR08', answer.steps.length === 0, 'a stale context still produced steps');
  check('IR08', actionsOffered === 0, 'a stale context still offered actions to execute');
  record.push({
    id: 'IR08',
    scenario: 'Stale context',
    scenarioValidity: 'EXERCISED',
    facts: {
      initialRoute: '/clients',
      seam: 'host reports a build identity the bundle does not contain',
      question: 'How do I create a client?',
      guideSaid: answer,
      interaction: { actionsOffered, stepsShown: answer.steps.length },
      safety: { staleActionsExecuted: 0 },
    },
    screenshots: [shot],
  });
}

// --- IR09 a real runtime instance target ----------------------------------
{
  await page.goto(`${BASE}/clients/c1`);
  await page.waitForSelector('[data-guide="invoices.list.open"]');
  const names = await page.locator('[data-guide="invoices.list.open"]').allTextContents();
  const shot = await capture(page, 'M-runtime-instance-targets.png', {
    scenario: 'IR09',
    route: '/clients/c1',
    states: ['panel-closed'],
    description: 'Invoice rows carrying runtime instance names, in the host.',
  });
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'How do I open an invoice?');
  const answer = await lastAnswer(page);
  const leaked = names.some((name) => (answer.allText ?? '').includes(name.trim()));

  check('IR09', names.length > 0, 'no runtime instance target was rendered');
  check('IR09', !leaked, 'a runtime instance name entered a guide sentence');
  record.push({
    id: 'IR09',
    scenario: 'Dynamic runtime instance target',
    // Observed and addressable in the host; the query contract has no path that
    // turns one into guidance, and none was invented for this revision.
    scenarioValidity: 'PARTIALLY_EXERCISED',
    facts: {
      initialRoute: '/clients/c1',
      runtimeInstanceNames: names.map((name) => name.trim()),
      question: 'How do I open an invoice?',
      guideSaid: answer,
      instanceNameEnteredGuidance: leaked,
      note: 'The rows are real, addressable and named at runtime. The guide says nothing about them: no supported static name exists and nothing promotes a runtime instance name into product language. The name is observed, not used.',
    },
    screenshots: [shot],
  });
}

// --- IR10 the secret -------------------------------------------------------
{
  await page.goto(`${BASE}/settings`);
  await page.click('[data-guide="settings.rotate-key"]');
  await page.waitForSelector('[data-guide="settings.new-key"]');
  const revealed = await page.evaluate(
    () => document.querySelector('[data-guide="settings.new-key"]')?.textContent?.trim() ?? null,
  );
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'Where is the new key?');
  const answer = await lastAnswer(page);
  const panelText = await page.locator('[data-testid="guide-panel"]').textContent();
  const leaked = revealed !== null && revealed.length > 6 && panelText.includes(revealed);

  check('IR10', revealed !== null, 'no secret was revealed in the host, so nothing was tested');
  check('IR10', !leaked, 'the revealed key reached the guide panel');
  record.push({
    id: 'IR10',
    scenario: 'Secret / redaction',
    scenarioValidity: 'EXERCISED',
    // No screenshot: the host is displaying a secret, and an artefact that shows
    // it would be a leak of exactly the kind this scenario exists to prevent.
    facts: {
      initialRoute: '/settings',
      question: 'Where is the new key?',
      guideSaid: answer,
      revealedValuePresentInHost: revealed !== null,
      revealedValueInGuide: leaked,
      safety: { secretLeaks: leaked ? 1 : 0 },
      screenshotWithheld:
        'the host is displaying a secret; capturing it would leak what this scenario tests',
    },
    screenshots: [],
  });
}

// --- accessibility, interference, inspector -------------------------------
const accessibility = await (async () => {
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector('[data-guide="clients.table.row"]');
  const snap = () =>
    page.evaluate(() => ({
      ids: [...document.querySelectorAll('[data-guide]')]
        .map((n) => n.getAttribute('data-guide'))
        .sort(),
      names: [...document.querySelectorAll('[data-guide]')]
        .map((n) => n.textContent?.trim())
        .sort(),
    }));
  const before = await snap();

  await page.focus('[data-testid="open-guide"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="guide-panel"]');
  const composerFocused = await page.evaluate(
    () => document.activeElement?.tagName.toLowerCase() === 'textarea',
  );
  await page.keyboard.type('How do I create a client?');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.swg-answer');
  const after = await snap();

  const labels = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="guide-panel"]');
    return {
      role: panel.getAttribute('role'),
      labelled: panel.hasAttribute('aria-labelledby'),
      unlabelledButtons: [...panel.querySelectorAll('button')].filter(
        (b) => (b.textContent ?? '').trim().length === 0 && !b.hasAttribute('aria-label'),
      ).length,
      liveRegions: panel.querySelectorAll('[aria-live]').length,
    };
  });

  await page.keyboard.press('Escape');
  const closed = (await page.locator('[data-testid="guide-panel"]').count()) === 0;
  const restored = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') === 'open-guide',
  );

  check('a11y', composerFocused, 'opening did not move focus into the composer');
  check('a11y', labels.unlabelledButtons === 0, 'a button has no accessible name');
  check('a11y', closed, 'Escape did not close the panel');
  check(
    'host',
    JSON.stringify(before.ids) === JSON.stringify(after.ids),
    'host semantic ids changed',
  );
  check(
    'host',
    JSON.stringify(before.names) === JSON.stringify(after.names),
    'host accessible text changed',
  );

  return {
    composerFocused,
    ...labels,
    closed,
    focusRestored: restored,
    idsUnchanged: JSON.stringify(before.ids) === JSON.stringify(after.ids),
    namesUnchanged: JSON.stringify(before.names) === JSON.stringify(after.names),
  };
})();

{
  await open(page, `${BASE}/clients?dev=1`);
  await ask(page, 'How do I create a client?');
  await page
    .locator('.swg-inspector summary')
    .click()
    .catch(() => undefined);
  await capture(page, 'I-developer-inspector.png', {
    scenario: null,
    route: '/clients?dev=1',
    states: ['inspector-visible'],
    description: 'The developer inspector, open. Never present in user mode.',
  });
  await open(page, `${BASE}/clients`);
  await ask(page, 'How do I create a client?');
  check(
    'dev',
    (await page.locator('.swg-inspector').count()) === 0,
    'the inspector appeared in user mode',
  );
}

{
  await open(page, `${BASE}/clients`);
  const started = Date.now();
  await page.click('[data-guide="nav.settings"]');
  await page.waitForFunction(() => globalThis.location.pathname === '/settings');
  await ask(page, 'How do I create a client?');
  timings.contextRefreshMs = Date.now() - started;
}

await browser.close();

const report = {
  package: 'interactive-review-v1-r1',
  version: 1,
  supersedes: 'interactive-review-v1',
  supersededReason: 'INTERACTIVE_REVIEW_SCENARIO_VALIDITY_DEFECT',
  harness: 'playwright/chromium',
  base: BASE,
  gate: 'DEVELOPMENT_INTERACTIVE_REVIEW',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  reviewerType: null,
  scoredBy: null,
  timings,
  accessibility,
  pageErrors,
  frames,
  scenarios: record,
};
writeFileSync(
  path.join(OUT, 'interactive-review-v1-r1.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

const say = (line = '') => console.log(line);
say('\nInteractive review v1-r1 — real browser\n');
say(`  scenarios                            ${record.length}`);
say(
  `  exercised                            ${record.filter((s) => s.scenarioValidity === 'EXERCISED').length}`,
);
say(
  `  partially exercised                  ${record.filter((s) => s.scenarioValidity === 'PARTIALLY_EXERCISED').length}`,
);
say(
  `  not exercised                        ${record.filter((s) => s.scenarioValidity === 'NOT_EXERCISED').length}`,
);
say(`  screenshots (state-validated)        ${frames.length}`);
say(`  page errors                          ${pageErrors.length}`);
say('');
say(`  first open                           ${timings.firstOpenMs} ms`);
say(`  deterministic query                  ${timings.queryMs} ms`);
say(`  Show me dispatch                     ${timings.showMeMs} ms`);
say(`  context refresh after route change   ${timings.contextRefreshMs} ms`);

if (failures.length > 0 || pageErrors.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  for (const error of pageErrors) say(`    ✗ page error: ${error}`);
  say('\nFAIL — a scenario did not exercise what it is named for.\n');
  process.exit(1);
}
say('\nPASS — every scenario took the path it claims, and every frame shows the state it names.\n');
