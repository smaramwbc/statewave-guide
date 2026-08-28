/**
 * Painting over a secret that a screenshot faithfully recorded.
 *
 * The RV03 scene exists because the settings screen displays an API key, and a
 * screenshot of a screen displaying a key displays a key. Closed Loop #18's
 * capture already masks secret shapes in every *textual* record — the answer,
 * the receipts, the rendered-text field — and an audit of the freeze pointed out
 * the obvious remaining surface: the pixels.
 *
 * The requirement is unconditional, so the region is painted out rather than
 * disclosed as an exception. What survives is everything the scene is evidence
 * for: a screen that is showing a secret, and a guide that did not repeat it.
 * What is lost is the ability to read the value off the picture, which was never
 * evidence of anything.
 *
 * This is an image transform, not a capture. It does not run the application, it
 * does not re-render the guide, and it cannot change what the guide said. It is
 * a `capture:` command because it writes into a review artifact, and nothing
 * that only reads is allowed to do that.
 *
 * Usage:
 *   node scripts/redact-screenshot.mjs <png> <x> <y> <width> <height>
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const [file, x, y, width, height] = process.argv.slice(2);
if (file === undefined || height === undefined) {
  console.error(
    'Usage: node scripts/redact-screenshot.mjs <png> <x> <y> <width> <height>\n' +
      'Coordinates are in the image’s own pixels.',
  );
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const target = path.resolve(ROOT, file);
const source = readFileSync(target);

const browser = await chromium.launch();
const page = await browser.newPage();

const masked = await page.evaluate(
  async ({ dataUrl, box }) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = dataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    // A flat block and a label, so the picture says a value was removed rather
    // than looking like a rendering glitch a reviewer has to guess about.
    context.fillStyle = '#1f2937';
    context.fillRect(box.x, box.y, box.width, box.height);
    context.fillStyle = '#f8fafc';
    context.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.textBaseline = 'middle';
    context.fillText('[secret redacted]', box.x + 8, box.y + box.height / 2);

    return canvas.toDataURL('image/png');
  },
  {
    dataUrl: `data:image/png;base64,${source.toString('base64')}`,
    box: { x: Number(x), y: Number(y), width: Number(width), height: Number(height) },
  },
);

await browser.close();

writeFileSync(target, Buffer.from(masked.split(',')[1], 'base64'));
console.log(
  `\nRedacted ${path.relative(ROOT, target)} at ${x},${y} ${width}x${height}.\n` +
    '  The screen still shows that a secret was displayed. It no longer shows which.\n',
);
