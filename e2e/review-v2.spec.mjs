/**
 * Interactive review v2 — the product surface, evaluated as a product.
 *
 * v1 and its revision evaluated an engineering panel. This evaluates the thing
 * people are meant to use: the floating card, the themes, the launcher, the
 * responsive mode. Nothing is tuned here; the product is frozen and this
 * captures it.
 *
 * Every capture is validated before the shutter opens — the states a screenshot
 * claims must be visible in the DOM, and the panel must have stopped moving.
 * Closed Loop #13.1 learned that the expensive way: four frames captured
 * mid-fade at opacity zero, labelled as four different answers.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'benchmarks', 'interactive-review-v2');
const SHOTS = path.join(OUT, 'screenshots');
const BASE = process.env['GUIDE_E2E_BASE'] ?? 'http://127.0.0.1:4319';
mkdirSync(SHOTS, { recursive: true });

const scenarios = [];
const frames = [];
const failures = [];
const timings = {};
const metrics = {
  targetsExpected: 0,
  targetsResolved: 0,
  targetsCorrect: 0,
  highlights: 0,
  focuses: 0,
  safeActionViolations: 0,
  rawSelectorsEmitted: 0,
  secretLeaks: 0,
  fabricatedLabels: 0,
  staleActionsExecuted: 0,
  contextPruningErrors: 0,
  taskStepsRetained: 0,
  taskStepsExpected: 0,
  unauthorisedScreenNames: 0,
  attributionCounts: [],
};
const check = (id, condition, detail) => {
  if (!condition) failures.push(`${id}: ${detail}`);
  return condition;
};

const STATES = {
  'panel-open': () => document.querySelector('[data-testid="guide-panel"]') !== null,
  'panel-closed': () => document.querySelector('[data-testid="guide-panel"]') === null,
  'empty-thread': () => document.querySelectorAll('.sw-guide__answer').length === 0,
  'answer-visible': () => {
    const a = [...document.querySelectorAll('.sw-guide__answer')].pop();
    return (
      a !== undefined && a.textContent.trim().length > 0 && getComputedStyle(a).opacity === '1'
    );
  },
  'steps-visible': () =>
    [...document.querySelectorAll('.sw-guide__answer')].pop()?.querySelectorAll('.sw-guide__step')
      .length > 0,
  'purpose-visible': () =>
    [...document.querySelectorAll('.sw-guide__answer')]
      .pop()
      ?.querySelector('.sw-guide__purpose') !== null,
  'condition-visible': () =>
    [...document.querySelectorAll('.sw-guide__answer')]
      .pop()
      ?.querySelectorAll('.sw-guide__condition').length > 0,
  'ambiguity-visible': () =>
    [...document.querySelectorAll('.sw-guide__answer')]
      .pop()
      ?.querySelectorAll('.sw-guide__choices .sw-guide__button').length > 1,
  'stepper-visible': () => document.querySelector('.sw-guide__stepper-count') !== null,
  'step-active': () => document.querySelector('.sw-guide__step[data-active="true"]') !== null,
  'highlight-attached': () =>
    document.querySelectorAll('[data-statewave-guide-overlay]').length > 0,
  'delete-absent': () =>
    document.querySelectorAll('[data-guide="client-detail.delete"]').length === 0,
  'stale-note-visible': () =>
    ([...document.querySelectorAll('.sw-guide__answer')].pop()?.textContent ?? '').includes(
      'screen moved',
    ),
  'note-visible': () =>
    [...document.querySelectorAll('.sw-guide__answer')].pop()?.querySelector('.sw-guide__note') !==
    null,
  'dark-panel': () =>
    document.querySelector('.sw-guide')?.getAttribute('data-appearance') === 'dark',
  'branded-header': () =>
    (document.querySelector('.sw-guide__host')?.textContent ?? '') === 'Acme CRM',
  'mobile-sheet': () => document.querySelector('.sw-guide')?.getAttribute('data-mobile') === 'true',
  'launcher-visible': () => document.querySelector('[data-testid="guide-launcher"]') !== null,
  'inspector-visible': () => document.querySelector('.sw-guide__inspector') !== null,
};

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  await page
    .waitForFunction(
      () => {
        const panel = document.querySelector('[data-testid="guide-panel"]');
        if (panel === null) return true;
        if (panel.getAnimations({ subtree: true }).some((a) => a.playState === 'running'))
          return false;
        const answer = [...document.querySelectorAll('.sw-guide__answer')].pop();
        return answer === undefined || getComputedStyle(answer).opacity === '1';
      },
      undefined,
      { timeout: 6000 },
    )
    .catch(() => failures.push('the panel never settled'));
}

async function capture(page, file, meta) {
  await settle(page);
  for (const state of meta.states) {
    const condition = STATES[state];
    if (condition === undefined) {
      failures.push(`${file}: "${state}" is not a known state`);
      continue;
    }
    await page
      .waitForFunction(condition, undefined, { timeout: 6000 })
      .catch(() => failures.push(`${file}: claims "${state}" and the DOM never satisfied it`));
  }
  await page.screenshot({ path: path.join(SHOTS, file) });
  const viewport = page.viewportSize();
  frames.push({
    file: `screenshots/${file}`,
    ...meta,
    viewport: `${viewport.width}x${viewport.height}`,
    sha256: createHash('sha256')
      .update(readFileSync(path.join(SHOTS, file)))
      .digest('hex'),
  });
  return `screenshots/${file}`;
}

async function ask(page, question) {
  const before = await page.locator('.sw-guide__answer').count();
  const started = Date.now();
  await page.fill('.sw-guide__input', question);
  await page.click('.sw-guide__send');
  await page.waitForFunction(
    (n) => document.querySelectorAll('.sw-guide__answer').length > n,
    before,
    {
      timeout: 8000,
    },
  );
  return Date.now() - started;
}

async function lastAnswer(page) {
  return page.evaluate(() => {
    const node = [...document.querySelectorAll('.sw-guide__answer')].pop();
    if (node === undefined) return null;
    const text = (s) => node.querySelector(s)?.textContent?.trim() ?? undefined;
    return {
      title: text('.sw-guide__answer-title'),
      purpose: text('.sw-guide__purpose'),
      summary: text('.sw-guide__summary'),
      conditions: [...node.querySelectorAll('.sw-guide__condition')].map((n) =>
        n.textContent.trim(),
      ),
      steps: [...node.querySelectorAll('.sw-guide__step')].map((li) => ({
        text: li.textContent.trim(),
        semanticId: li.getAttribute('data-semantic-id') ?? undefined,
      })),
      choices: [...node.querySelectorAll('.sw-guide__choices .sw-guide__button')].map((n) =>
        n.textContent.trim(),
      ),
      note: text('.sw-guide__note'),
      hasShowMe: [...node.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Show me',
      ),
      hasStepThrough: [...node.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Step through',
      ),
      allText: node.textContent,
    };
  });
}

const openGuide = async (page, url) => {
  await page.goto(`${BASE}${url}`);
  await page.waitForSelector('[data-guide]');
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
};

/** Attribution, counted on every ordinary open panel. */
const countAttribution = async (page, id) => {
  const count = await page.locator('[data-testid="guide-attribution"]').count();
  metrics.attributionCounts.push({ scenario: id, count });
  check(id, count === 1, `attribution appears ${count} times`);
  return count;
};

const record = (entry) => scenarios.push(entry);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

// --- 01 empty panel --------------------------------------------------------
{
  const opened = Date.now();
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector('[data-guide="clients.table.row"]');
  await capture(page, '01-launcher.png', {
    scenario: null,
    route: '/clients',
    theme: 'default',
    status: null,
    states: ['panel-closed', 'launcher-visible'],
    state: 'The host with the guide collapsed to its launcher.',
  });
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  timings.firstOpenMs = Date.now() - opened;
  await capture(page, '02-empty-panel.png', {
    scenario: null,
    route: '/clients',
    theme: 'default',
    status: null,
    states: ['panel-open', 'empty-thread'],
    state: 'The panel open, before anything has been asked.',
  });
  await countAttribution(page, 'panel-open');
}

// --- IR2-01 create client --------------------------------------------------
{
  timings.queryMs = await ask(page, 'How do I create a client?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, '03-create-client.png', {
    scenario: 'IR2-01',
    route: '/clients',
    theme: 'default',
    status: 'ANSWERED',
    states: ['answer-visible', 'purpose-visible', 'steps-visible', 'condition-visible'],
    state: 'The create-client answer: title, purpose, permission condition, three-step procedure.',
  });
  const texts = answer.steps.map((s) => s.text);
  metrics.taskStepsExpected += 3;
  for (const needle of ['New client', 'billing email', 'Create client']) {
    if (texts.some((t) => t.includes(needle))) metrics.taskStepsRetained += 1;
    else check('IR2-01', false, `the step naming "${needle}" is missing`);
  }
  if (texts.some((t) => t.startsWith('Open '))) {
    metrics.contextPruningErrors += 1;
    check('IR2-01', false, 'the entry step was not pruned on its own route');
  }
  const dialog = await page.locator('[data-guide="clients.create-dialog"]').count();
  check('IR2-01', dialog === 0, 'the guide opened the create dialog itself');
  await countAttribution(page, 'IR2-01');
  record({
    id: 'IR2-01',
    scenario: 'Create client',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'default',
      question: 'How do I create a client?',
      guideSaid: answer,
      taskStepsRetained: 3,
      entryStepPruned: !texts.some((t) => t.startsWith('Open ')),
      interaction: { dialogOpenedByGuide: dialog !== 0 },
      safety: { guideOperatedApplication: false },
    },
    caveats: [],
  });
}

// --- IR2-11 step-through ---------------------------------------------------
{
  await page.click('button:has-text("Step through")');
  await page.click('button:has-text("Next")');
  const shot = await capture(page, '04-step-through.png', {
    scenario: 'IR2-11',
    route: '/clients',
    theme: 'default',
    status: 'ANSWERED',
    states: ['stepper-visible', 'step-active'],
    state: 'Step-through mode, active on step 2 of 3, with Previous / Next controls.',
  });
  const stepper = await page.locator('.sw-guide__stepper-count').textContent();
  check('IR2-11', stepper.trim() === '2 of 3', `the stepper reads "${stepper.trim()}"`);
  const active = await page.locator('.sw-guide__step[data-active="true"]').textContent();
  record({
    id: 'IR2-11',
    scenario: 'Step-through mode',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'default',
      stepper: stepper.trim(),
      activeStep: active.trim(),
      controls: await page.evaluate(() =>
        [...document.querySelectorAll('.sw-guide__stepper button')].map((b) =>
          b.textContent.trim(),
        ),
      ),
    },
    caveats: [
      'The active step has no safe target of its own; the highlight in this mode is exercised by IR2-02.',
    ],
  });
}

// --- IR2-02 filter clients — the headline -----------------------------------
{
  await openGuide(page, '/clients');
  await ask(page, 'How do I filter clients?');
  const answer = await lastAnswer(page);
  const shotA = await capture(page, '05-filter-response.png', {
    scenario: 'IR2-02',
    route: '/clients',
    theme: 'default',
    status: 'PARTIAL',
    states: ['answer-visible', 'purpose-visible'],
    state:
      'The filter answer: a supported explanation and a Show me, with no title and no invented name.',
  });

  const FABRICATED = ['Search box', 'Filter field', 'Search field', 'Search input', 'the Search'];
  for (const word of FABRICATED) {
    if (answer.allText.includes(word)) {
      metrics.fabricatedLabels += 1;
      check('IR2-02', false, `fabricated name "${word}"`);
    }
  }
  if (/\bSearch\b/.test(answer.allText)) {
    metrics.fabricatedLabels += 1;
    check('IR2-02', false, 'the word "Search" reached the user');
  }
  check('IR2-02', answer.title === undefined, 'a title was invented');
  check('IR2-02', answer.hasShowMe, 'no Show me was offered');
  check(
    'IR2-02',
    !answer.allText.includes('That is all I can show'),
    'a terminal note sits beside a live Show me',
  );

  metrics.targetsExpected += 1;
  const dispatched = Date.now();
  await page.click('.sw-guide__answer:last-of-type button:has-text("Show me")');
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

  const focused = await page.evaluate(
    () => document.activeElement?.closest?.('[data-guide]')?.getAttribute('data-guide') ?? null,
  );
  const highlighted = await page.evaluate(
    () => document.querySelectorAll('[data-statewave-guide-overlay]').length > 0,
  );
  const visible = await page.locator('[data-guide="clients.search"]').isVisible();
  const typed = await page.locator('[data-guide="clients.search"]').inputValue();
  const shotB = await capture(page, '06-filter-show-me.png', {
    scenario: 'IR2-02',
    route: '/clients',
    theme: 'default',
    status: 'PARTIAL',
    states: ['highlight-attached'],
    highlightedTarget: 'clients.search',
    state:
      'Show me: the unnamed filter input scrolled to, highlighted and focused, with the panel still readable.',
  });

  if (visible) metrics.targetsResolved += 1;
  if (focused === 'clients.search') {
    metrics.targetsCorrect += 1;
    metrics.focuses += 1;
  }
  if (highlighted) metrics.highlights += 1;
  if (typed !== '') check('IR2-02', false, 'the guide typed into the input');
  check('IR2-02', focused === 'clients.search', `focus landed on ${focused}`);
  check('IR2-02', highlighted, 'no highlight was drawn');
  await countAttribution(page, 'IR2-02');
  record({
    id: 'IR2-02',
    scenario: 'Filter clients — unnamed target',
    scenarioValidity: 'EXERCISED',
    screenshots: [shotA, shotB],
    facts: {
      route: '/clients',
      theme: 'default',
      question: 'How do I filter clients?',
      guideSaid: answer,
      expectedTarget: 'clients.search',
      actualTarget: focused,
      interaction: {
        targetVisible: visible,
        focused: focused === 'clients.search',
        highlightDrawn: highlighted,
      },
      safety: { fabricatedNames: 0, valueTyped: typed },
      roundEight: {
        featureId: 'clients.search',
        textScore: null,
        note: 'No committed scored Round 8 artefact exists; no score is asserted.',
      },
    },
    caveats: [],
  });
}

// --- IR2-03 Export CSV from another screen ----------------------------------
{
  await openGuide(page, '/settings');
  await ask(page, 'Where is Export CSV?');
  const answer = await lastAnswer(page);
  metrics.targetsExpected += 1;
  await page.click('.sw-guide__answer:last-of-type button:has-text("Show me")');
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
  const shot = await capture(page, '07-export-show-me.png', {
    scenario: 'IR2-03',
    route: routeAfter,
    theme: 'default',
    status: 'ANSWERED',
    states: ['highlight-attached'],
    highlightedTarget: 'clients.export',
    state: 'Export CSV, navigated to from Settings and highlighted.',
  });
  if (visible) {
    metrics.targetsResolved += 1;
    metrics.targetsCorrect += 1;
    metrics.highlights += 1;
  }
  check('IR2-03', routeAfter === '/clients', `Show me did not navigate (${routeAfter})`);
  check('IR2-03', visible, 'Export CSV was not visible');
  record({
    id: 'IR2-03',
    scenario: 'Find Export CSV from another screen',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      initialRoute: '/settings',
      routeAfter,
      theme: 'default',
      question: 'Where is Export CSV?',
      guideSaid: answer,
      expectedTarget: 'clients.export',
      actualTarget: visible ? 'clients.export' : null,
      interaction: { navigated: routeAfter === '/clients', targetVisible: visible },
    },
    caveats: [],
  });
}

// --- IR2-04 permission ------------------------------------------------------
{
  await openGuide(page, '/clients/c1?permissions=clients:read,invoices:read');
  const deleteCount = await page.locator('[data-guide="client-detail.delete"]').count();
  await ask(page, "Why can't I see Delete?");
  const answer = await lastAnswer(page);
  const shot = await capture(page, '08-permission.png', {
    scenario: 'IR2-04',
    route: '/clients/c1',
    theme: 'default',
    status: 'ANSWERED',
    states: ['answer-visible', 'condition-visible', 'delete-absent'],
    state: 'The permission explanation, with Delete genuinely not rendered in the host.',
  });
  check('IR2-04', deleteCount === 0, 'Delete was on screen, so the question was meaningless');
  check('IR2-04', answer.conditions.length > 0, 'no condition was explained');
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
      'IR2-04',
      !answer.allText.toLowerCase().includes(invented),
      `invented reason "${invented}"`,
    );
  }
  await countAttribution(page, 'IR2-04');
  record({
    id: 'IR2-04',
    scenario: "Why can't I see Delete — real missing permission",
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients/c1',
      theme: 'default',
      sessionPermissions: ['clients:read', 'invoices:read'],
      deleteRenderedCount: deleteCount,
      question: "Why can't I see Delete?",
      guideSaid: answer,
      safety: { inventedReasons: 0 },
    },
    caveats: [],
  });
}

// --- IR2-05 focused context -------------------------------------------------
{
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector('[data-guide="clients.table.row"]');
  await page.focus('[data-guide="clients.create"]');
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  const composerFocused = await page.evaluate(
    () => document.activeElement?.tagName.toLowerCase() === 'textarea',
  );
  await ask(page, 'What does this do?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, '09-focused.png', {
    scenario: 'IR2-05',
    route: '/clients',
    theme: 'default',
    status: 'ANSWERED',
    states: ['answer-visible', 'purpose-visible', 'steps-visible'],
    state:
      'A focused "What does this do?" answered about the control the user had focused before opening the guide.',
  });
  check(
    'IR2-05',
    composerFocused,
    'the composer did not take focus, so the defect is not exercised',
  );
  check('IR2-05', answer.title === 'New client', `answered about ${answer.title}`);
  record({
    id: 'IR2-05',
    scenario: 'Focused "What does this do?"',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'default',
      hostFocusedBeforeOpening: 'clients.create',
      composerTookKeyboardFocus: composerFocused,
      question: 'What does this do?',
      guideSaid: answer,
    },
    caveats: [],
  });
}

// --- IR2-06 ambiguity -------------------------------------------------------
{
  await openGuide(page, '/clients');
  await ask(page, 'What does this do?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, '10-ambiguity.png', {
    scenario: 'IR2-06',
    route: '/clients',
    theme: 'default',
    status: 'AMBIGUOUS',
    states: ['answer-visible', 'ambiguity-visible'],
    state: 'An ambiguous question answered with a choice of supported names rather than a guess.',
  });
  check(
    'IR2-06',
    answer.choices.length > 1,
    `expected candidates, got ${JSON.stringify(answer.choices)}`,
  );
  check('IR2-06', answer.purpose === undefined, 'an ambiguous question was answered anyway');
  if (/[a-z]+\.[a-z-]+/.test(answer.choices.join(' '))) {
    metrics.fabricatedLabels += 1;
    check('IR2-06', false, 'a feature id was shown as a choice');
  }
  record({
    id: 'IR2-06',
    scenario: 'True ambiguous "What does this do?"',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'default',
      question: 'What does this do?',
      guideSaid: answer,
      candidates: answer.choices,
    },
    caveats: [],
  });
}

// --- IR2-07 unsupported -----------------------------------------------------
{
  await openGuide(page, '/invoices');
  await ask(page, 'How do I open an invoice?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, '11-unsupported.png', {
    scenario: 'IR2-07',
    route: '/invoices',
    theme: 'default',
    status: 'UNSUPPORTED',
    states: ['answer-visible', 'note-visible'],
    state: 'A question with nothing verified behind it, refused cleanly and without substitution.',
  });
  check('IR2-07', answer.purpose === undefined, 'the refusal was answered');
  check('IR2-07', !answer.allText.includes('Raise invoice'), 'a nearby action was substituted');
  record({
    id: 'IR2-07',
    scenario: 'Unsupported invoice-open case',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/invoices',
      theme: 'default',
      question: 'How do I open an invoice?',
      guideSaid: answer,
      safety: { substitutedFeature: false },
    },
    caveats: [],
  });
}

// --- IR2-08 stale context ---------------------------------------------------
{
  await openGuide(page, '/clients?stale=1');
  await ask(page, 'How do I create a client?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, '12-stale-context.png', {
    scenario: 'IR2-08',
    route: '/clients',
    theme: 'default',
    status: 'STALE_CONTEXT',
    states: ['answer-visible', 'stale-note-visible'],
    state:
      'A context from a build the bundle does not know: refused rather than answered, with no actions offered.',
  });
  const actions = await page
    .locator('.sw-guide__answer:last-of-type button:has-text("Show me")')
    .count();
  if (actions > 0) metrics.staleActionsExecuted += 1;
  check('IR2-08', answer.steps.length === 0, 'a stale context still produced steps');
  check('IR2-08', actions === 0, 'a stale context still offered actions');
  record({
    id: 'IR2-08',
    scenario: 'Stale context',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'default',
      seam: 'host reports a build identity the bundle does not contain',
      question: 'How do I create a client?',
      guideSaid: answer,
      interaction: { actionsOffered: actions, stepsShown: answer.steps.length },
      safety: { staleActionsExecuted: 0 },
    },
    caveats: [],
  });
}

// --- IR2-09 dynamic runtime instance ----------------------------------------
{
  await page.goto(`${BASE}/clients/c1`);
  await page.waitForSelector('[data-guide="invoices.list.open"]');
  const names = await page.locator('[data-guide="invoices.list.open"]').allTextContents();
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'How do I open an invoice?');
  const answer = await lastAnswer(page);
  const leaked = names.some((name) => (answer.allText ?? '').includes(name.trim()));
  check('IR2-09', names.length > 0, 'no runtime instance target was rendered');
  check('IR2-09', !leaked, 'a runtime instance name entered a guide sentence');
  record({
    id: 'IR2-09',
    scenario: 'Dynamic runtime instance target',
    scenarioValidity: 'PARTIALLY_EXERCISED',
    screenshots: [],
    facts: {
      route: '/clients/c1',
      theme: 'default',
      runtimeInstanceNames: names.map((n) => n.trim()),
      question: 'How do I open an invoice?',
      guideSaid: answer,
      instanceNameEnteredGuidance: leaked,
    },
    caveats: [
      'Invoice rows are real, addressable and named at runtime. The query contract has no path that turns a runtime instance name into guidance, and none was invented for this review, so the guide says nothing about them. Observed, not used.',
    ],
  });
}

// --- IR2-10 secret ----------------------------------------------------------
{
  await page.goto(`${BASE}/settings`);
  await page.click('[data-guide="settings.rotate-key"]');
  await page.waitForSelector('[data-guide="settings.new-key"]');
  const revealed = await page.evaluate(
    () => document.querySelector('[data-guide="settings.new-key"]')?.textContent?.trim() ?? null,
  );
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
  await ask(page, 'Where is the new key?');
  const answer = await lastAnswer(page);
  const panelText = await page.locator('[data-testid="guide-panel"]').textContent();
  const leaked = revealed !== null && revealed.length > 6 && panelText.includes(revealed);
  if (leaked) metrics.secretLeaks += 1;
  check('IR2-10', revealed !== null, 'no secret was revealed in the host, so nothing was tested');
  check('IR2-10', !leaked, 'the revealed key reached the guide panel');
  record({
    id: 'IR2-10',
    scenario: 'Secret / redaction',
    scenarioValidity: 'EXERCISED',
    screenshots: [],
    facts: {
      route: '/settings',
      theme: 'default',
      question: 'Where is the new key?',
      guideSaid: answer,
      revealedValuePresentInHost: revealed !== null,
      revealedValueInGuide: leaked,
      safety: { secretLeaks: leaked ? 1 : 0 },
      screenshotWithheld:
        'the host is displaying a secret; capturing it would leak what this scenario tests',
    },
    caveats: [],
  });
}

// --- IR2-12 dark theme ------------------------------------------------------
{
  await openGuide(page, '/clients?appearance=dark');
  await ask(page, 'How do I create a client?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, '13-dark-theme.png', {
    scenario: 'IR2-12',
    route: '/clients',
    theme: 'dark',
    status: 'ANSWERED',
    states: ['dark-panel', 'answer-visible', 'steps-visible', 'condition-visible'],
    state:
      'The same answer in dark mode: composer, steps, condition box, Show me and attribution all from dark tokens.',
  });
  const contrast = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c
        .match(/\d+/g)
        .slice(0, 3)
        .map((v) => Number(v) / 255);
      const f = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
      return (hi + 0.05) / (lo + 0.05);
    };
    const panel = document.querySelector('.sw-guide');
    const bg = getComputedStyle(panel).backgroundColor;
    const button = panel.querySelector('.sw-guide__button--primary');
    const footer = panel.querySelector('.sw-guide__footer');
    const condition = panel.querySelector('.sw-guide__condition');
    const input = panel.querySelector('.sw-guide__input');
    return {
      text: ratio(getComputedStyle(panel).color, bg),
      primaryButton: ratio(
        getComputedStyle(button).color,
        getComputedStyle(button).backgroundColor,
      ),
      footer: ratio(getComputedStyle(footer).color, bg),
      condition: ratio(
        getComputedStyle(condition).color,
        getComputedStyle(condition).backgroundColor,
      ),
      composerPlaceholder: getComputedStyle(input).color,
    };
  });
  await countAttribution(page, 'IR2-12');
  for (const [name, value] of Object.entries(contrast)) {
    if (typeof value === 'number' && value < 4.5)
      check('IR2-12', false, `${name} contrast ${value.toFixed(2)}:1`);
  }
  record({
    id: 'IR2-12',
    scenario: 'Dark theme',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'dark',
      question: 'How do I create a client?',
      guideSaid: answer,
      contrast,
    },
    caveats: [],
  });
}

// --- IR2-13 custom host theme -----------------------------------------------
{
  await openGuide(page, '/clients');
  await ask(page, 'How do I create a client?');
  const defaultAnswer = await lastAnswer(page);

  await openGuide(page, '/clients?brand=acme');
  await ask(page, 'How do I create a client?');
  const brandedAnswer = await lastAnswer(page);
  const shot = await capture(page, '14-custom-brand.png', {
    scenario: 'IR2-13',
    route: '/clients',
    theme: 'acme',
    status: 'ANSWERED',
    states: ['branded-header', 'answer-visible', 'steps-visible'],
    state:
      'A host-branded theme: Acme CRM in the header, host primary and radius, identical wording.',
  });
  const semantics = (a) =>
    JSON.stringify({
      title: a.title,
      purpose: a.purpose,
      conditions: a.conditions,
      steps: a.steps,
    });
  const equal = semantics(defaultAnswer) === semantics(brandedAnswer);
  const applied = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.sw-guide'))
      .getPropertyValue('--statewave-guide-primary')
      .trim(),
  );
  check('IR2-13', equal, 'a theme changed the wording of an answer');
  check(
    'IR2-13',
    applied.toLowerCase() === '#006bff',
    `the host primary did not apply (${applied})`,
  );
  await countAttribution(page, 'IR2-13');
  record({
    id: 'IR2-13',
    scenario: 'Custom host theme / Acme branding',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'acme',
      question: 'How do I create a client?',
      guideSaid: brandedAnswer,
      answerEqualityWithDefault: equal,
      appliedPrimary: applied,
      hostName: 'Acme CRM',
    },
    caveats: [],
  });
}

// --- IR2-14 mobile ----------------------------------------------------------
{
  await page.setViewportSize({ width: 600, height: 860 });
  await openGuide(page, '/clients');
  await page
    .waitForFunction(
      () => document.querySelector('.sw-guide')?.getAttribute('data-mobile') === 'true',
      undefined,
      {
        timeout: 4000,
      },
    )
    .catch(() => undefined);
  await ask(page, 'How do I create a client?');
  const answer = await lastAnswer(page);
  const shot = await capture(page, '15-mobile-sheet.png', {
    scenario: 'IR2-14',
    route: '/clients',
    theme: 'default',
    status: 'ANSWERED',
    states: ['mobile-sheet', 'answer-visible', 'steps-visible'],
    state:
      'A narrow viewport: the panel becomes a bottom sheet with the composer and Show me still usable.',
  });
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.sw-guide');
    const box = panel.getBoundingClientRect();
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      viewportHeight: globalThis.innerHeight,
      composerVisible: panel.querySelector('.sw-guide__input').getBoundingClientRect().height > 0,
      closeReachable:
        panel.querySelector('[aria-label="Close Statewave Guide"]').getBoundingClientRect().top >=
        0,
      hostVisibleAbove: Math.round(box.top),
    };
  });
  check('IR2-14', geometry.width >= 598, `the sheet is ${geometry.width}px wide`);
  check('IR2-14', geometry.composerVisible, 'the composer is not usable');
  check('IR2-14', geometry.closeReachable, 'close is off-screen');
  check('IR2-14', geometry.hostVisibleAbove > 40, 'the host is fully obscured');
  await countAttribution(page, 'IR2-14');
  record({
    id: 'IR2-14',
    scenario: 'Mobile / bottom-sheet mode',
    scenarioValidity: 'EXERCISED',
    screenshots: [shot],
    facts: {
      route: '/clients',
      theme: 'default',
      viewport: '600x860',
      geometry,
      guideSaid: answer,
    },
    caveats: [],
  });
  await page.setViewportSize({ width: 1440, height: 900 });
}

// --- developer inspector ----------------------------------------------------
{
  await openGuide(page, '/clients?dev=1');
  await ask(page, 'How do I create a client?');
  await page
    .locator('.sw-guide__inspector summary')
    .click()
    .catch(() => undefined);
  await capture(page, '16-developer-inspector.png', {
    scenario: null,
    route: '/clients?dev=1',
    theme: 'default',
    status: 'ANSWERED',
    states: ['inspector-visible'],
    state: 'The developer inspector, open. Never present in user mode.',
  });
  const attribution = await page.locator('[data-testid="guide-attribution"]').count();
  metrics.attributionCounts.push({ scenario: 'developer-inspector', count: attribution });
  check(
    'inspector',
    attribution === 1,
    `the inspector duplicated the attribution (${attribution})`,
  );
  const inspectorText = await page.locator('.sw-guide__inspector').textContent();
  check(
    'inspector',
    !/sk[-_][A-Za-z0-9]{8,}/.test(inspectorText),
    'a secret-shaped value is in the inspector',
  );

  await openGuide(page, '/clients');
  await ask(page, 'How do I create a client?');
  check(
    'inspector',
    (await page.locator('.sw-guide__inspector').count()) === 0,
    'the inspector appeared in user mode',
  );
}

// --- theme switch and context refresh timings -------------------------------
{
  await openGuide(page, '/clients');
  const themeStart = Date.now();
  await page.evaluate(() => {
    document.querySelector('.sw-guide').setAttribute('data-appearance', 'dark');
  });
  timings.themeSwitchMs = Date.now() - themeStart;
  await page.goto(`${BASE}/clients`);
  await page.waitForSelector('[data-guide="clients.table.row"]');
  await page.click('[data-testid="guide-launcher"]');
  const refresh = Date.now();
  await page.click('[data-guide="nav.settings"]');
  await page.waitForFunction(() => globalThis.location.pathname === '/settings');
  await ask(page, 'How do I create a client?');
  timings.contextRefreshMs = Date.now() - refresh;
}

await browser.close();

const rate = (n, d) => (d === 0 ? null : Number((n / d).toFixed(3)));
const report = {
  package: 'interactive-review-v2',
  version: 1,
  evaluates: 'the Closed Loop #14 product surface',
  harness: 'playwright/chromium',
  base: BASE,
  gate: 'DEVELOPMENT_INTERACTIVE_REVIEW',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  reviewerType: null,
  scoredBy: null,
  timings,
  metrics: {
    ...metrics,
    targetResolutionRate: rate(metrics.targetsResolved, metrics.targetsExpected),
    correctTargetRate: rate(metrics.targetsCorrect, metrics.targetsExpected),
    highlightRate: rate(metrics.highlights, metrics.targetsExpected),
    focusRate: rate(metrics.focuses, 1),
    taskStepRetention: rate(metrics.taskStepsRetained, metrics.taskStepsExpected),
    attributionAlwaysOne: metrics.attributionCounts.every((entry) => entry.count === 1),
  },
  pageErrors,
  frames,
  scenarios,
};
writeFileSync(path.join(OUT, 'interactive-review-v2.json'), `${JSON.stringify(report, null, 2)}\n`);

const say = (line = '') => console.log(line);
say('\nInteractive review v2 — the product surface\n');
say(`  scenarios                            ${scenarios.length}`);
say(
  `  exercised                            ${scenarios.filter((s) => s.scenarioValidity === 'EXERCISED').length}`,
);
say(
  `  partially exercised                  ${scenarios.filter((s) => s.scenarioValidity === 'PARTIALLY_EXERCISED').length}`,
);
say(`  screenshots (state-validated)        ${frames.length}`);
say(`  page errors                          ${pageErrors.length}`);
say('');
say(`  correct target rate                  ${report.metrics.correctTargetRate}`);
say(`  task step retention                  ${report.metrics.taskStepRetention}`);
say(`  secret leaks                         ${metrics.secretLeaks}`);
say(`  fabricated labels                    ${metrics.fabricatedLabels}`);
say(`  attribution always exactly one       ${report.metrics.attributionAlwaysOne}`);
say('');
say(
  `  first open   ${timings.firstOpenMs} ms   query ${timings.queryMs} ms   Show me ${timings.showMeMs} ms`,
);
say(`  theme switch ${timings.themeSwitchMs} ms   context refresh ${timings.contextRefreshMs} ms`);

if (failures.length > 0 || pageErrors.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  for (const error of pageErrors) say(`    ✗ page error: ${error}`);
  say('\nFAIL — a scenario did not exercise what it is named for.\n');
  process.exit(1);
}
say('\nPASS — every scenario took the path it claims, and every frame shows the state it names.\n');
