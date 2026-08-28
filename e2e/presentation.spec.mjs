/**
 * Presentation screenshots for design review.
 *
 * Not an evaluation artefact. `interactive-review-v1-r1` is frozen and this does
 * not touch it — these are pictures of what the product looks like, taken to be
 * looked at by people, and deliberately not shown to a vision model yet.
 *
 * Capture waits for the same settled condition Closed Loop #13.1 established:
 * fonts loaded, animations finished, answer at full opacity. Every duplicate
 * screenshot in the first review was a picture of a panel mid-fade.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'docs', 'product', 'screenshots');
const BASE = process.env['GUIDE_E2E_BASE'] ?? 'http://127.0.0.1:4319';
mkdirSync(OUT, { recursive: true });

const frames = [];
const failures = [];

/** Nothing is photographed until it has stopped moving. */
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

async function shot(page, file, meta) {
  await settle(page);
  const target = path.join(OUT, file);
  await page.screenshot({ path: target });
  frames.push({ file, ...meta });
  return file;
}

async function ask(page, question) {
  const before = await page.locator('.sw-guide__answer').count();
  await page.fill('.sw-guide__input', question);
  await page.click('.sw-guide__send');
  await page.waitForFunction(
    (count) => document.querySelectorAll('.sw-guide__answer').length > count,
    before,
    { timeout: 8000 },
  );
}

const openGuide = async (page, url) => {
  await page.goto(url);
  await page.waitForSelector('[data-guide]');
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => failures.push(`page error: ${error}`));

// A — the host, guide collapsed
await page.goto(`${BASE}/clients`);
await page.waitForSelector('[data-guide="clients.table.row"]');
await shot(page, 'A-guide-closed.png', {
  state: 'The demo application with the guide collapsed to its launcher.',
});

// B — open, empty
await page.click('[data-testid="guide-launcher"]');
await page.waitForSelector('[data-testid="guide-panel"]');
await shot(page, 'B-guide-open-empty.png', {
  state: 'The panel open, before anything has been asked.',
});

// C — create client
await ask(page, 'How do I create a client?');
await shot(page, 'C-create-client.png', {
  state: 'A structured answer: title, purpose, condition, numbered procedure.',
});

// D — filter clients, highlighted
await ask(page, 'How do I filter clients?');
await page.click('.sw-guide__answer:last-of-type button:has-text("Show me")');
await page
  .waitForFunction(
    () =>
      document.activeElement?.closest?.('[data-guide]')?.getAttribute('data-guide') ===
      'clients.search',
    undefined,
    { timeout: 8000 },
  )
  .catch(() => failures.push('Show me did not reach the filter input'));
await shot(page, 'D-show-me-highlight.png', {
  state: 'Show me: the unnamed filter input highlighted and focused in the running application.',
});

// E — step through
await openGuide(page, `${BASE}/clients`);
await ask(page, 'How do I create a client?');
await page.click('button:has-text("Step through")');
await page.click('button:has-text("Next")');
await shot(page, 'E-step-through.png', { state: 'Step-through mode, on step 2 of 3.' });

// F — ambiguity
await openGuide(page, `${BASE}/clients`);
await ask(page, 'What does this do?');
await shot(page, 'F-ambiguity.png', {
  state: 'An ambiguous question answered with a choice, using supported names only.',
});

// G — dark
await openGuide(page, `${BASE}/clients?appearance=dark`);
await ask(page, 'How do I create a client?');
await shot(page, 'G-dark-mode.png', {
  state: 'The same answer in dark mode, from theme tokens rather than inversion.',
});

// H — a different brand
await openGuide(page, `${BASE}/clients?brand=acme`);
await ask(page, 'How do I create a client?');
await shot(page, 'H-custom-brand.png', {
  state: 'A host-branded theme: Acme CRM, #006BFF, 12px radius. No recompilation.',
});

// I — the playground
await openGuide(page, `${BASE}/clients?playground=1`);
await ask(page, 'How do I create a client?');
await page.waitForSelector('[data-testid="customizer"]');
await shot(page, 'I-theme-customizer.png', {
  state: 'The development-only theme playground, with live preview.',
});

// J — narrow viewport
await page.setViewportSize({ width: 600, height: 860 });
await openGuide(page, `${BASE}/clients`);
await ask(page, 'How do I create a client?');
await shot(page, 'J-mobile-sheet.png', {
  state: 'A narrow viewport: the panel becomes a bottom sheet.',
});

await browser.close();

const digests = new Map();
for (const frame of frames) {
  const file = path.join(OUT, frame.file);
  frame.sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  digests.set(frame.sha256, [...(digests.get(frame.sha256) ?? []), frame.file]);
}
for (const group of [...digests.values()].filter((entry) => entry.length > 1)) {
  failures.push(`${group.join(' and ')} are byte-identical`);
}

writeFileSync(
  path.join(ROOT, 'docs', 'product', 'screenshots.json'),
  `${JSON.stringify({ purpose: 'design review; not an evaluation artefact', frames }, null, 2)}\n`,
);

const say = (line = '') => console.log(line);
say('\nPresentation screenshots\n');
for (const frame of frames)
  say(`    ${frame.file.padEnd(28)} ${frame.sha256.slice(0, 12)}  ${frame.state}`);
say('');
if (failures.length > 0) {
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — a presentation frame is not what it claims.\n');
  process.exit(1);
}
say(`PASS — ${frames.length} frames, all distinct, all settled.\n`);
