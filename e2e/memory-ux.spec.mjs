/**
 * What a returning user actually sees, after the guide stopped narrating itself.
 *
 * Closed Loop #19 asked whether memory could adapt guidance without becoming
 * product truth, and the answer held. An independent review then said something
 * more uncomfortable: two of the three adaptations were not worth what they
 * cost. The completion sentence was truthful and over-explicit, and the inferred
 * Show me preference changed nothing a person could perceive.
 *
 * This capture is the evidence for whether #19.1 fixed that. It is paired on
 * purpose — a screen on its own invites a reviewer to imagine the alternative,
 * and imagining it is where a self-assessment goes wrong. Every pair comes from
 * the same build, minutes apart.
 *
 * The interesting pair is UX03. Memory proposes emphasising Show me; Show me is
 * already primary; the two captures should be indistinguishable, and the loop's
 * claim is that reporting that honestly is better than drawing a ring around a
 * button so the report can say something happened.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT =
  process.env['GUIDE_E2E_OUT'] ?? path.join(ROOT, 'benchmarks', 'memory-ux-resolution-review-v1');
const SHOTS = path.join(OUT, 'screenshots');
const BASE = process.env['GUIDE_E2E_BASE'] ?? 'http://127.0.0.1:4319';
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const captures = {};
const pageErrors = [];
const check = (id, condition, detail) => {
  if (!condition) failures.push(`${id}: ${detail}`);
  return condition;
};

/** Secret shapes, so nothing this file writes down can carry one. */
const SECRET = /(sk|pk|api|tok|tkn|sess|pat|ghp|priv)[-_][A-Za-z0-9_-]{6,}|\b[A-Fa-f0-9]{32,}\b/;
const mask = (text) => String(text ?? '').replace(new RegExp(SECRET, 'g'), '[secret-shaped]');

const browser = await chromium.launch();

async function settle(page) {
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

/**
 * Everything about the answer a person could point at.
 *
 * Deliberately not "did the plan change" — that question is answered in core and
 * answering it here again would just agree with itself. These are the things a
 * reviewer looking at the screenshot can check.
 */
async function observe(page, name) {
  const observed = await page.evaluate(() => {
    const answer = [...document.querySelectorAll('.sw-guide__answer')].pop();
    if (!answer) return null;
    const text = (selector) => answer.querySelector(selector)?.textContent?.trim() ?? null;
    return {
      title: text('.sw-guide__answer-title'),
      purpose: text('.sw-guide__purpose'),
      condition: text('.sw-guide__condition span:last-child'),
      location: text('.sw-guide__where'),
      steps: [...answer.querySelectorAll('.sw-guide__step')].map(
        (n) => n.textContent?.trim() ?? '',
      ),
      stepsVisible: answer.querySelector('[data-testid="guide-steps"]') !== null,
      expandControl: text('[data-testid="guide-show-full-steps"]'),
      memoryLines: [...answer.querySelectorAll('.sw-guide__memory-note')].map(
        (n) => n.textContent?.trim() ?? '',
      ),
      actions: [...answer.querySelectorAll('.sw-guide__actions .sw-guide__button')].map((b) => ({
        label: (b.textContent ?? '').trim(),
        primary: b.classList.contains('sw-guide__button--primary'),
        memoryMarked: b.getAttribute('data-emphasis') === 'memory',
      })),
      answerText: (answer.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
  if (observed === null) {
    failures.push(`${name}: no answer was rendered`);
    return { name };
  }
  observed.answerText = mask(observed.answerText);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  observed.screenshot = `screenshots/${name}.png`;
  observed.screenshotSha256 = `sha256:${createHash('sha256')
    .update(readFileSync(path.join(SHOTS, `${name}.png`)))
    .digest('hex')}`;
  captures[name] = observed;
  return observed;
}

async function session({ id, url }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${id}: ${String(error)}`));
  const open = async (target = url) => {
    await page.goto(`${BASE}${target}`);
    await page.waitForSelector('[data-guide]');
    await page.click('[data-testid="guide-launcher"]');
    await page.waitForSelector('[data-testid="guide-panel"]');
  };
  const ask = async (question) => {
    const seen = await page.locator('.sw-guide__answer').count();
    await page.fill('.sw-guide__input', question);
    await page.click('.sw-guide__send');
    await page
      .waitForFunction((n) => document.querySelectorAll('.sw-guide__answer').length > n, seen, {
        timeout: 8000,
      })
      .catch(() => failures.push(`${id}: no answer arrived`));
    await settle(page);
  };
  await open();
  return { page, open, ask, close: () => context.close() };
}

/**
 * Wait until the guide has actually written something for this subject.
 *
 * Recording is fire-and-forget by design — a guide that blocked an answer on a
 * storage write would be a guide whose answers depend on storage. That makes
 * every later assertion about memory a race unless the test waits here, and a
 * flake in a capture is worse than a flake in a test: it ships as evidence.
 */
async function awaitRecorded(page, id) {
  const seen = await page
    .waitForFunction(
      () => {
        try {
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key !== null && key.startsWith('statewave-guide:')) return true;
          }
        } catch {
          return true;
        }
        return false;
      },
      undefined,
      { timeout: 9000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!seen) {
    const why = await page
      .evaluate(() => {
        const insp = document.querySelector('[data-testid="guide-memory-inspector"] pre');
        const answer = [...document.querySelectorAll('.sw-guide__answer')].pop();
        return {
          diagnostics: insp ? (insp.textContent ?? '').replace(/\s+/g, ' ').slice(0, 400) : null,
          title: answer?.querySelector('.sw-guide__answer-title')?.textContent ?? null,
          answers: document.querySelectorAll('.sw-guide__answer').length,
          url: globalThis.location.href,
        };
      })
      .catch(() => null);
    failures.push(`${id}: the guide recorded nothing for this subject — ${JSON.stringify(why)}`);
  }
  return seen;
}

/** Finish the guide, and wait for the record rather than racing it. */
async function completeStepThrough(page, id = 'unknown') {
  await page.click('[data-testid="guide-step-through"]');
  // Walked by the advance slot rather than by a label. The slot never moves and
  // its label is decided by what each step was compiled as — "Do it for me" on
  // a step the guide may take, "Next" otherwise — so a helper that clicked a
  // word could only ever walk the steps that happened to say that word.
  for (let guard = 0; guard < 12; guard += 1) {
    if ((await page.locator('[data-testid="guide-step-done"]').count()) > 0) break;
    // Skip rather than act: this helper is about reaching the end, and pressing
    // the application's own controls is a different test's business.
    const skip = page.locator('[data-testid="guide-step-skip"]');
    if ((await skip.count()) > 0) await skip.first().click();
    else await page.click('[data-testid="guide-step-next"]');
  }
  await page.click('[data-testid="guide-step-done"]');
  await page
    .waitForFunction(
      () => {
        try {
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key === null || !key.startsWith('statewave-guide:')) continue;
            if ((localStorage.getItem(key) ?? '').includes('STEP_THROUGH_COMPLETED')) return true;
          }
        } catch {
          return true;
        }
        return false;
      },
      undefined,
      { timeout: 9000 },
    )
    .catch(async () => {
      const stored = await page
        .evaluate(() => {
          const out = [];
          try {
            for (let index = 0; index < localStorage.length; index += 1) {
              const key = localStorage.key(index);
              if (key !== null && key.startsWith('statewave-guide:'))
                out.push(`${key}=${localStorage.getItem(key) ?? ''}`);
            }
          } catch {
            return ['(storage unreadable)'];
          }
          return out;
        })
        .catch(() => ['(page gone)']);
      failures.push(
        `${id}: the completion was never persisted — storage held ${stored.join(' ; ')}`,
      );
    });
}

const ASK = 'How do I create a client?';

// --- UX01 / UX02 · first time, returning, and unfolded ------------------------
{
  const s = await session({ id: 'UX01', url: '/clients?subject=ux_first' });
  await s.ask(ASK);
  await awaitRecorded(s.page, 'UX01');
  const first = await observe(s.page, 'UX01-first-time');
  check('UX01', first.stepsVisible, 'a first-time user did not get the steps');
  check(
    'UX01',
    first.memoryLines.length === 0,
    'a first-time user was told something about memory',
  );

  await completeStepThrough(s.page, 'UX02');
  await settle(s.page);
  await s.open('/clients?subject=ux_first');
  await s.ask(ASK);
  const collapsed = await observe(s.page, 'UX02-returning-collapsed');
  check('UX02', !collapsed.stepsVisible, 'a returning user was not given a shorter answer');
  check('UX02', collapsed.expandControl !== null, 'a fold with no way to unfold it');
  check(
    'UX02',
    collapsed.memoryLines.length === 0,
    `the guide narrated its own memory: ${collapsed.memoryLines.join(' / ')}`,
  );
  // Reversibility, at the DOM: the same three steps come back, in order.
  await s.page.click('[data-testid="guide-show-full-steps"]');
  await settle(s.page);
  const expanded = await observe(s.page, 'UX02-returning-expanded');
  check('UX02', expanded.stepsVisible, 'unfolding did not show the steps');
  check(
    'UX02',
    JSON.stringify(expanded.steps) === JSON.stringify(first.steps),
    `unfolding produced different steps: ${JSON.stringify(expanded.steps)}`,
  );
  check(
    'UX02',
    String(collapsed.expandControl).includes(String(first.steps.length)),
    `the expand control did not name all ${first.steps.length} steps: ${collapsed.expandControl}`,
  );
  await s.close();
}

// --- UX03 · a derived pattern that changes nothing ----------------------------
{
  const base = await session({ id: 'UX03-base', url: '/clients?subject=ux_base' });
  await base.ask(ASK);
  const baseline = await observe(base.page, 'UX03-base');
  await base.close();

  const s = await session({ id: 'UX03', url: '/clients?subject=ux_pattern' });
  for (let round = 0; round < 3; round += 1) {
    await s.ask(ASK);
    await s.page.click('.sw-guide__answer:last-of-type button:has-text("Show me")');
    await settle(s.page);
    // Each press has to land before the next one, or the read-modify-write
    // behind them races and three presses become one.
    await s.page.waitForFunction(
      (want) => {
        try {
          for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key === null || !key.startsWith('statewave-guide:')) continue;
            const uses = ((localStorage.getItem(key) ?? '').match(/SHOW_ME_USED/g) ?? []).length;
            if (uses >= want) return true;
          }
        } catch {
          return true;
        }
        return false;
      },
      round + 1,
      { timeout: 9000 },
    );
  }
  await s.open('/clients?subject=ux_pattern');
  await s.ask(ASK);
  const derived = await observe(s.page, 'UX03-derived-show-me');
  check(
    'UX03',
    derived.actions.some((a) => a.memoryMarked),
    'the derived pattern stopped reaching the panel',
  );
  const strip = (capture) =>
    JSON.stringify(capture.actions.map(({ label, primary }) => [label, primary]));
  check(
    'UX03',
    strip(derived) === strip(baseline),
    `a no-op emphasis moved the actions: ${strip(derived)} vs ${strip(baseline)}`,
  );
  check('UX03', derived.memoryLines.length === 0, 'the pattern was captioned instead of applied');
  await s.close();
}

// --- UX04 · an explicit request for everything --------------------------------
{
  const base = await session({ id: 'UX04-base', url: '/clients?subject=ux_full_base' });
  await base.ask(ASK);
  await observe(base.page, 'UX04-base-full');
  await base.close();

  const s = await session({ id: 'UX04', url: '/clients?subject=ux_full' });
  await s.ask(ASK);
  await awaitRecorded(s.page, 'UX04');
  await completeStepThrough(s.page, 'UX04');
  await s.page.click('[aria-label="More options"]');
  await s.page.click('[data-testid="guide-detail-full"]');
  await s.open('/clients?subject=ux_full');
  await s.ask(ASK);
  const explicit = await observe(s.page, 'UX04-explicit-full');
  check('UX04', explicit.stepsVisible, 'an explicit request for full detail was overruled');
  check('UX04', explicit.expandControl === null, 'full detail still folded something');
  await s.close();
}

// --- UX05 · where the New client button is ------------------------------------
{
  const s = await session({ id: 'UX05', url: '/clients?subject=ux_context' });
  await s.ask(ASK);
  const after = await observe(s.page, 'UX05-context-after');
  check('UX05', after.location !== null, 'the location sentence disappeared entirely');
  check(
    'UX05',
    !String(after.location).includes('inside'),
    `a toolbar button is still described as inside something: ${after.location}`,
  );
  await s.close();

  // The search field keeps the sentence Closed Loop #18 shipped. This is the
  // constraint the container rule had to work around rather than through.
  const search = await session({ id: 'UX05-search', url: '/clients?subject=ux_context2' });
  await search.ask('How do I filter clients?');
  const filtered = await observe(search.page, 'UX05-search-after');
  check(
    'UX05',
    String(filtered.location) === 'Use the field showing "Search clients" above the list.',
    `the runtime-visible-language sentence moved: ${filtered.location}`,
  );
  await search.close();
}

// --- UX06 · memory on and memory off ------------------------------------------
{
  const on = await session({ id: 'UX06-on', url: '/clients?subject=ux_on' });
  await on.ask(ASK);
  await awaitRecorded(on.page, 'UX06');
  await completeStepThrough(on.page, 'UX06');
  await on.open('/clients?subject=ux_on');
  await on.ask(ASK);
  const memoryOn = await observe(on.page, 'UX06-memory-on');
  await on.close();

  const off = await session({ id: 'UX06-off', url: '/clients?memory=off' });
  await off.ask(ASK);
  const memoryOff = await observe(off.page, 'UX06-memory-off');
  check('UX06', memoryOff.stepsVisible, 'memory-off folded the steps');
  check('UX06', memoryOff.memoryLines.length === 0, 'memory-off produced a memory line');
  check(
    'UX06',
    memoryOn.purpose === memoryOff.purpose && memoryOn.condition === memoryOff.condition,
    'memory changed what the answer asserts',
  );
  await off.close();
}

await browser.close();

// --- the historical half of UX05 ----------------------------------------------
//
// The "before" sentence is not re-captured. It is quoted from the frozen Closed
// Loop #19 evidence, with the file and hash it was read from, because rebuilding
// the old behaviour to photograph it would mean shipping it again.
const FROZEN = path.join(ROOT, 'benchmarks', 'memory-adaptation-review-v1', 'memory-evidence.json');
const frozenBytes = readFileSync(FROZEN);
const frozenText = frozenBytes.toString('utf8');
const beforeSentence = 'On this screen, it is inside the list.';
const historical = {
  source: 'benchmarks/memory-adaptation-review-v1/memory-evidence.json',
  sha256: `sha256:${createHash('sha256').update(frozenBytes).digest('hex')}`,
  sentence: beforeSentence,
  present: frozenText.includes(beforeSentence),
};
check(
  'UX05',
  historical.present,
  'the frozen evidence no longer contains the sentence this loop replaced',
);

/**
 * Which captures are pixel-identical, said out loud.
 *
 * Eleven screenshots and five distinct images is a finding, not an accident: it
 * is what "this adaptation changes nothing" looks like from outside. A previous
 * package let six distinct images stand in for fourteen captures and said
 * nothing about it, which invited a reviewer to imagine differences that were
 * not there.
 */
const identicalGroups = Object.values(
  Object.entries(captures).reduce((groups, [name, capture]) => {
    const key = capture.screenshotSha256 ?? name;
    return { ...groups, [key]: [...(groups[key] ?? []), name] };
  }, {}),
).filter((group) => group.length > 1);

const metrics = {
  captures: Object.keys(captures).length,
  pageErrors: pageErrors.length,
  memoryLinesRendered: Object.values(captures).reduce(
    (n, c) => n + (c.memoryLines?.length ?? 0),
    0,
  ),
  distinctScreenshots: new Set(Object.values(captures).map((c) => c.screenshotSha256)).size,
  identicalGroups,
};

writeFileSync(
  path.join(OUT, 'memory-ux-evidence.json'),
  `${JSON.stringify(
    {
      experiment: 'memory-ux-resolution-review-v1',
      purpose:
        'Whether the adaptations that survived Closed Loop #19.1 are worth what they cost, and whether the one that changed nothing is honestly reported as changing nothing.',
      harness: 'playwright/chromium 1440x900, one build, captures minutes apart',
      historical,
      metrics,
      identicalGroups,
      pageErrors,
      captures,
    },
    null,
    2,
  )}\n`,
);

const say = (line = '') => console.log(line);
say('\nMemory UX resolution — real browser\n');
for (const [name, capture] of Object.entries(captures)) {
  say(
    `  ${name.padEnd(26)} steps=${
      capture.stepsVisible ? 'shown' : capture.expandControl ? 'folded' : 'none'
    }  lines=${capture.memoryLines?.length ?? 0}  actions=${(capture.actions ?? [])
      .map((a) => `${a.label}${a.primary ? '*' : ''}`)
      .join(',')}`,
  );
}
say(
  `\n  captures ${metrics.captures}   distinct images ${metrics.distinctScreenshots}   page errors ${metrics.pageErrors}   memory lines ${metrics.memoryLinesRendered}`,
);
for (const group of identicalGroups) say(`  identical: ${group.join(' = ')}`);
if (failures.length > 0 || pageErrors.length > 0) {
  say('\n  Failures\n');
  for (const failure of [...failures, ...pageErrors]) say(`    x ${failure}`);
  say('\nFAIL - the adaptations did not resolve.\n');
  process.exit(1);
}
say('\nPASS - what changed is what a person can see.\n');
