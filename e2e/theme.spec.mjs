/**
 * The theming layer, in a real browser and under a hostile host.
 *
 * Specificity is not decidable by reading CSS — the first attempt at scoping
 * looked correct and lost every primary button to the demo's own
 * `body.demo button { … }`, which was visible only in a screenshot. So the host
 * page is given aggressive global rules on purpose, and the panel is required to
 * survive them.
 */

import process from 'node:process';
import { chromium } from 'playwright';

const BASE = process.env['GUIDE_E2E_BASE'] ?? 'http://127.0.0.1:4319';
const failures = [];
const check = (id, condition, detail) => {
  if (!condition) failures.push(`${id}: ${detail}`);
};

/**
 * A hostile host, of the kind that actually exists.
 *
 * Global element rules and a Tailwind-style reset — the cases Closed Loop #14
 * names. Deliberately without `!important`: a host that marks its reset
 * `!important` wins against any stylesheet in the same document, and pretending
 * otherwise would make this test pass by lowering the bar rather than by the
 * panel being robust. That limitation is documented rather than hidden.
 */
const HOSTILE_CSS = `
  *, *::before, *::after { box-sizing: content-box; }
  button { background: hotpink; color: lime; border-radius: 0; font-size: 30px; padding: 40px; border: 4px dashed lime; }
  input, textarea, select { background: hotpink; font-size: 30px; padding: 30px; }
  h1, h2, h3 { font-size: 44px; margin: 40px; font-weight: 900; }
  p, ol, ul, li { margin: 30px; }
  a { color: hotpink; text-decoration: underline; }
  body.demo button { background: hotpink; }
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => failures.push(`page error: ${error}`));

const openGuide = async (url) => {
  await page.goto(`${BASE}${url}`);
  await page.waitForSelector('[data-guide]');
  await page.click('[data-testid="guide-launcher"]');
  await page.waitForSelector('[data-testid="guide-panel"]');
};
const ask = async (question) => {
  const before = await page.locator('.sw-guide__answer').count();
  await page.fill('.sw-guide__input', question);
  await page.click('.sw-guide__send');
  await page.waitForFunction(
    (n) => document.querySelectorAll('.sw-guide__answer').length > n,
    before,
    {
      timeout: 8000,
    },
  );
  await page.waitForFunction(
    () => {
      const a = [...document.querySelectorAll('.sw-guide__answer')].pop();
      return a !== undefined && getComputedStyle(a).opacity === '1';
    },
    undefined,
    { timeout: 6000 },
  );
};

// --- themes land -----------------------------------------------------------
for (const [name, query, primary, background] of [
  ['default', '', 'rgb(99, 91, 255)', 'rgb(255, 255, 255)'],
  ['acme', '?brand=acme', 'rgb(0, 107, 255)', 'rgb(255, 255, 255)'],
  ['dark', '?appearance=dark', 'rgb(139, 132, 255)', 'rgb(15, 17, 23)'],
]) {
  await openGuide(`/clients${query}`);
  await ask('How do I create a client?');
  const button = page.locator('.sw-guide__button--primary').first();
  check(
    name,
    (await button.evaluate((n) => getComputedStyle(n).backgroundColor)) === primary,
    'primary colour did not apply',
  );
  check(
    name,
    (await page.locator('.sw-guide').evaluate((n) => getComputedStyle(n).backgroundColor)) ===
      background,
    'panel background did not apply',
  );
  check(
    name,
    (await page.locator('[data-testid="guide-attribution"]').count()) === 1,
    'attribution is not present exactly once',
  );
}

// --- host branding ---------------------------------------------------------
await openGuide('/clients?brand=acme');
check(
  'branding',
  (await page.locator('.sw-guide__host').textContent()) === 'Acme CRM',
  'host name missing',
);
check(
  'branding',
  (await page.locator('.sw-guide__title').textContent()) === 'Statewave Guide',
  'guide name missing',
);

// --- hostile host CSS ------------------------------------------------------
await openGuide('/clients');
await page.addStyleTag({ content: HOSTILE_CSS });
await ask('How do I create a client?');
const survived = await page.evaluate(() => {
  const panel = document.querySelector('.sw-guide');
  const button = panel.querySelector('.sw-guide__button--primary');
  const input = panel.querySelector('.sw-guide__input');
  const title = panel.querySelector('.sw-guide__answer-title');
  const step = panel.querySelector('.sw-guide__step');
  const link = panel.querySelector('.sw-guide__footer a');
  const px = (node, prop) => parseFloat(getComputedStyle(node)[prop]);
  return {
    buttonBg: getComputedStyle(button).backgroundColor,
    buttonFont: px(button, 'fontSize'),
    buttonPad: px(button, 'paddingTop'),
    inputBg: getComputedStyle(input).backgroundColor,
    titleFont: px(title, 'fontSize'),
    stepMargin: px(step, 'marginTop'),
    linkColor: getComputedStyle(link).color,
    boxSizing: getComputedStyle(button).boxSizing,
  };
});
check(
  'isolation',
  survived.buttonBg === 'rgb(99, 91, 255)',
  `primary button became ${survived.buttonBg}`,
);
check('isolation', survived.buttonFont < 20, `button font became ${survived.buttonFont}px`);
check('isolation', survived.buttonPad < 20, `button padding became ${survived.buttonPad}px`);
check(
  'isolation',
  survived.inputBg !== 'rgb(255, 105, 180)',
  'the composer took the host background',
);
check('isolation', survived.titleFont < 24, `the answer title became ${survived.titleFont}px`);
check('isolation', survived.stepMargin < 10, `steps took a ${survived.stepMargin}px margin`);
check('isolation', survived.boxSizing === 'border-box', `box-sizing became ${survived.boxSizing}`);

// --- the guide does not leak outward ---------------------------------------
const hostUntouched = await page.evaluate(() => {
  const hostButton = document.querySelector('[data-guide="clients.create"]');
  return {
    display: getComputedStyle(hostButton).display,
    hasGuideClass: hostButton.className.includes('sw-guide'),
  };
});
check('isolation', !hostUntouched.hasGuideClass, 'a guide class reached the host');

// --- layout ----------------------------------------------------------------
await openGuide('/clients?playground=1');
await page.click('[data-testid="pg-side-left"]');
await page.waitForTimeout(150);
check(
  'layout',
  (await page.locator('.sw-guide').getAttribute('data-side')) === 'left',
  'the panel did not move left',
);
const leftEdge = await page.locator('.sw-guide').evaluate((n) => n.getBoundingClientRect().left);
// A floating card is inset 24px from the edge by design; docked would be 0.
check('layout', leftEdge <= 24, `a left panel sat at ${leftEdge}px`);

await page.click('[data-testid="pg-side-right"]');
await page.waitForTimeout(150);
const width = await page.locator('.sw-guide').evaluate((n) => n.getBoundingClientRect().width);
check('layout', width >= 340 && width <= 520, `panel width ${width} is outside the clamp`);

// --- customizer ------------------------------------------------------------
await page.click('[data-testid="pg-color-0ea5e9"]');
await page.waitForTimeout(150);
const live = await page
  .locator('.sw-guide')
  .evaluate((n) => getComputedStyle(n).getPropertyValue('--statewave-guide-primary').trim());
check('customizer', live.toLowerCase() === '#0ea5e9', `live preview did not update (${live})`);
await page
  .waitForFunction(
    () =>
      (document.querySelector('[data-testid="pg-config"]')?.textContent ?? '').includes('#0ea5e9'),
    undefined,
    { timeout: 4000 },
  )
  .catch(() => undefined);
const config = await page.locator('[data-testid="pg-config"]').textContent();
check(
  'customizer',
  config.toLowerCase().includes('#0ea5e9'),
  'the exported config omits the chosen colour',
);
check('customizer', config.includes('StatewaveGuide'), 'the exported config is not usable code');
await page.click('[data-testid="pg-reset"]');
await page.waitForTimeout(150);
const afterReset = await page
  .locator('.sw-guide')
  .evaluate((n) => getComputedStyle(n).getPropertyValue('--statewave-guide-primary').trim());
check('customizer', afterReset === '#635bff', `reset did not restore the default (${afterReset})`);

// --- launcher and keyboard --------------------------------------------------
await page.goto(`${BASE}/clients`);
await page.waitForSelector('[data-guide="clients.table.row"]');
const launcherName = await page
  .locator('[data-testid="guide-launcher"]')
  .getAttribute('aria-label');
check('a11y', launcherName === 'Open Statewave Guide', `launcher is named "${launcherName}"`);
await page.focus('[data-testid="guide-launcher"]');
await page.keyboard.press('Enter');
await page.waitForSelector('[data-testid="guide-panel"]');
check(
  'a11y',
  await page.evaluate(() => document.activeElement?.tagName.toLowerCase() === 'textarea'),
  'focus did not enter the composer',
);
await page.keyboard.press('Escape');
check(
  'a11y',
  (await page.locator('[data-testid="guide-panel"]').count()) === 0,
  'Escape did not close the panel',
);
check(
  'a11y',
  await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') === 'guide-launcher',
  ),
  'focus was not restored to the launcher',
);

// --- contrast, in both appearances -----------------------------------------
for (const [name, query] of [
  ['light', ''],
  ['dark', '?appearance=dark'],
]) {
  await openGuide(`/clients${query}`);
  await ask('How do I create a client?');
  const ratios = await page.evaluate(() => {
    const lum = (color) => {
      const [r, g, b] = color
        .match(/\d+/g)
        .slice(0, 3)
        .map((v) => Number(v) / 255);
      const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
      return (hi + 0.05) / (lo + 0.05);
    };
    const panel = document.querySelector('.sw-guide');
    const bg = getComputedStyle(panel).backgroundColor;
    const button = panel.querySelector('.sw-guide__button--primary');
    const muted = panel.querySelector('.sw-guide__status');
    return {
      text: ratio(getComputedStyle(panel).color, bg),
      primary: ratio(getComputedStyle(button).color, getComputedStyle(button).backgroundColor),
      muted: ratio(getComputedStyle(muted).color, bg),
    };
  });
  check(`contrast/${name}`, ratios.text >= 4.5, `text ${ratios.text.toFixed(2)}:1`);
  check(`contrast/${name}`, ratios.primary >= 4.5, `primary button ${ratios.primary.toFixed(2)}:1`);
  check(`contrast/${name}`, ratios.muted >= 4.5, `muted text ${ratios.muted.toFixed(2)}:1`);
}

// --- mobile ----------------------------------------------------------------
await page.setViewportSize({ width: 600, height: 860 });
await openGuide('/clients');
await page
  .waitForFunction(
    () => document.querySelector('.sw-guide')?.getAttribute('data-mobile') === 'true',
    undefined,
    { timeout: 4000 },
  )
  .catch(() => undefined);
const sheet = await page.locator('.sw-guide').evaluate((n) => ({
  mobile: n.getAttribute('data-mobile'),
  width: n.getBoundingClientRect().width,
}));
check('mobile', sheet.mobile === 'true', 'the panel did not become a sheet');
check('mobile', Math.abs(sheet.width - 600) < 2, `the sheet is ${sheet.width}px wide`);

await browser.close();

const say = (line = '') => console.log(line);
say('\nGuide theming — real browser\n');
say('  themes verified                      default, acme, dark');
say('  hostile host CSS                     survived');
say('  layout                               left, right, clamped width, mobile sheet');
say('  customizer                           live preview, export, reset');
say('  contrast                             light and dark');
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — the theming layer did not hold.\n');
  process.exit(1);
}
say('\nPASS — themed, isolated, accessible, and still saying the same things.\n');
