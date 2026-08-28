/**
 * The runtime-instance path, in a real browser.
 *
 * Deliberately narrow: this is an engineering experiment for one capability, not
 * another subjective benchmark. Interactive Review V2 is frozen and untouched.
 *
 * The measurement that matters is *which row got highlighted*. Everything else
 * can look right while the guide points confidently at the wrong one — it did,
 * during this loop, because a semantic id shared by two rows resolves to the
 * first, and only comparing the highlight geometry against each row caught it.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// The committed experiment lives under `benchmarks/`, and re-running this spec
// as a *check* must not rewrite it — a record that changes every time somebody
// verifies it is not a record. `GUIDE_E2E_OUT` sends a verification run's bytes
// somewhere disposable; without it, this is the capture that issues them.
const OUT =
  process.env['GUIDE_E2E_OUT'] ?? path.join(ROOT, 'benchmarks', 'runtime-instance-experiment');
const SHOTS = path.join(OUT, 'screenshots');
const BASE = process.env['GUIDE_E2E_BASE'] ?? 'http://127.0.0.1:4319';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const failures = [];
const frames = [];
const check = (id, condition, detail) => {
  if (!condition) failures.push(`${id}: ${detail}`);
  return condition;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

async function settle() {
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

async function shot(file, meta) {
  await settle();
  await page.screenshot({ path: path.join(SHOTS, file) });
  frames.push({
    file: `screenshots/${file}`,
    ...meta,
    sha256: createHash('sha256')
      .update(readFileSync(path.join(SHOTS, file)))
      .digest('hex'),
  });
  return `screenshots/${file}`;
}

const open = async (url) => {
  await page.goto(`${BASE}${url}`);
  await page.waitForSelector('[data-guide]');
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
};
const ask = async (question) => {
  const before = await page.locator('.sw-guide__answer').count();
  await page.fill('.sw-guide__input', question);
  await page.click('.sw-guide__send');
  await page
    .waitForFunction((n) => document.querySelectorAll('.sw-guide__answer').length > n, before, {
      timeout: 8000,
    })
    .catch(() => undefined);
};

/** Which row the ring actually surrounds. Geometry, not intention. */
const highlightedRow = () =>
  page.evaluate(() => {
    const ring = document.querySelector('.sw-guide-ring');
    if (ring === null) return null;
    const box = ring.getBoundingClientRect();
    const rows = [...document.querySelectorAll('[data-guide="invoices.list.open"]')];
    const hit = rows.find((node) => {
      const r = node.getBoundingClientRect();
      return r.top >= box.top - 14 && r.bottom <= box.bottom + 14;
    });
    return hit === undefined ? null : hit.textContent.trim();
  });

// --- the choice ------------------------------------------------------------
await open('/invoices');
await ask('How do I open an invoice?');
const choices = await page.locator('.sw-guide__choices button').allTextContents();
const answered = await page.locator('.sw-guide__answer:last-of-type').textContent();
const choiceShot = await shot('01-instance-choice.png', {
  scenario: 'choice',
  route: '/invoices',
  state: 'Two invoices on screen: the guide offers both rather than picking one.',
});
check('choice', choices.length === 2, `offered ${JSON.stringify(choices)}`);
check('choice', choices.includes('INV-001') && choices.includes('INV-002'), 'wrong labels');
check('choice', !answered.includes('Invoice INV'), 'a runtime name was expanded into a phrase');
results.push({
  id: 'choice',
  route: '/invoices',
  question: 'How do I open an invoice?',
  choices,
  screenshots: [choiceShot],
});

// --- each choice points at its own row --------------------------------------
for (const pick of ['INV-001', 'INV-002']) {
  await open('/invoices');
  await ask('How do I open an invoice?');
  await page.waitForSelector('.sw-guide__choices button');
  await page.click(`.sw-guide__choices button:has-text("${pick}")`);
  await ask('How do I open an invoice?');
  await page.click('.sw-guide__answer:last-of-type button:has-text("Show me")');
  await page
    .waitForFunction(() => document.querySelector('.sw-guide-ring') !== null, undefined, {
      timeout: 6000,
    })
    .catch(() => undefined);
  const highlighted = await highlightedRow();
  const file = await shot(`0${pick === 'INV-001' ? 2 : 3}-${pick.toLowerCase()}-highlighted.png`, {
    scenario: pick,
    route: '/invoices',
    highlightedTarget: 'invoices.list.open',
    instance: pick,
    state: `After choosing ${pick}: that row is highlighted and the other is untouched.`,
  });
  check(pick, highlighted === pick, `the ring landed on ${highlighted}`);
  results.push({ id: pick, route: '/invoices', chosen: pick, highlighted, screenshots: [file] });
}

// --- the concept is not established on the client screen --------------------
await open('/clients/c1');
await ask('How do I open an invoice?');
const onClient = await page.locator('.sw-guide__answer:last-of-type').textContent();
const clientChoices = await page.locator('.sw-guide__choices button').count();
check(
  'client-detail',
  clientChoices === 0,
  'instances were offered where nothing establishes the concept',
);
check('client-detail', !onClient.includes('INV-00'), 'a runtime name appeared in a refusal');
results.push({
  id: 'concept-not-established',
  route: '/clients/c1',
  question: 'How do I open an invoice?',
  choicesOffered: clientChoices,
  note: 'The same two rows render here. Nothing on this screen establishes "invoice" — the component is named InvoiceList and the ids begin invoices., and neither is evidence — so no instance is offered.',
});

// --- no Show me where there is nothing to point at ---------------------------
await open('/clients/c1?permissions=clients:read,invoices:read');
const deleteCount = await page.locator('[data-guide="client-detail.delete"]').count();
await ask("Why can't I see Delete?");
const deleteButtons = await page.locator('.sw-guide__answer:last-of-type button').allTextContents();
check('delete', deleteCount === 0, 'Delete was rendered, so the question was meaningless');
check('delete', !deleteButtons.includes('Show me'), 'Show me was offered for an absent control');
results.push({
  id: 'delete-show-me',
  route: '/clients/c1',
  deleteRendered: deleteCount,
  buttons: deleteButtons,
});

// --- the secret target -------------------------------------------------------
await page.goto(`${BASE}/settings`);
await page.click('[data-guide="settings.rotate-key"]');
await page.waitForSelector('[data-guide="settings.new-key"]');
const revealed = await page.evaluate(
  () => document.querySelector('[data-guide="settings.new-key"]')?.textContent?.trim() ?? null,
);
await page.click('[data-testid="guide-launcher"]');
await page.waitForSelector('[data-testid="guide-panel"]');
await ask('Where is the new key?');
const keyButtons = await page.locator('.sw-guide__answer:last-of-type button').allTextContents();
const panelText = await page.locator('[data-testid="guide-panel"]').textContent();
const leaked = revealed !== null && revealed.length > 6 && panelText.includes(revealed);
check('secret', !leaked, 'the revealed key reached the panel');
// Show me is legitimate here *if* the target is proven. It resolves to the
// button labelled "Rotate API key" — a supported name — and not to the code
// block displaying the key, which Closed Loop #9 refuses to name at all.
if (keyButtons.includes('Show me')) {
  await page.click('.sw-guide__answer:last-of-type button:has-text("Show me")');
  await page
    .waitForFunction(() => document.querySelector('.sw-guide-ring') !== null, undefined, {
      timeout: 6000,
    })
    .catch(() => undefined);
  const ringOn = await page.evaluate(() => {
    const ring = document.querySelector('.sw-guide-ring');
    if (ring === null) return null;
    const box = ring.getBoundingClientRect();
    const found = [...document.querySelectorAll('[data-guide]')].find((node) => {
      const r = node.getBoundingClientRect();
      return r.top >= box.top - 14 && r.bottom <= box.bottom + 14 && r.width > 0;
    });
    return found === undefined || found === null ? null : found.getAttribute('data-guide');
  });
  check('secret', ringOn === 'settings.rotate-key', `Show me resolved to ${ringOn}`);
  results.push({ id: 'secret-show-me-target', resolvedTo: ringOn });
}
const finalPanel = await page.locator('[data-testid="guide-panel"]').textContent();
check('secret', !finalPanel.includes('sk_live'), 'a secret reached the panel');
results.push({
  id: 'secret-target',
  route: '/settings',
  revealedPresentInHost: revealed !== null,
  revealedInGuide: leaked,
  buttons: keyButtons,
  note: 'No screenshot: the host is displaying a secret.',
});

await browser.close();

const report = {
  experiment: 'runtime-instance-grounding',
  version: 1,
  purpose: 'engineering evidence for one capability; not a subjective benchmark',
  harness: 'playwright/chromium',
  pageErrors,
  frames,
  results,
};
writeFileSync(
  path.join(OUT, 'runtime-instance-experiment.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

const say = (line = '') => console.log(line);
say('\nRuntime instance grounding — real browser\n');
for (const entry of results)
  say(
    `  ${String(entry.id).padEnd(24)} ${JSON.stringify(entry.highlighted ?? entry.choices ?? entry.buttons ?? entry.choicesOffered ?? '')}`,
  );
say(`\n  screenshots ${frames.length}   page errors ${pageErrors.length}`);
if (failures.length > 0 || pageErrors.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  for (const error of pageErrors) say(`    ✗ page error: ${error}`);
  say('\nFAIL — the instance path did not behave.\n');
  process.exit(1);
}
say('\nPASS — the chosen instance is the one highlighted, and the concept stayed earned.\n');
