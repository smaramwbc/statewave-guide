/**
 * Interactive review v1 is issued. These are its bytes.
 *
 * A screenshot is a persuasive artefact, and persuasive artefacts drift: one
 * re-run of the end-to-end suite on a slightly different build silently
 * replaces nine images and a run record, and a reviewer ends up scoring
 * something nobody meant to issue. The end-to-end suite *writes into this
 * directory*, so this is not hypothetical — it is one `pnpm test:guide-ui-e2e`
 * away at all times.
 *
 * So every issued byte is pinned here by digest. The digests are in the source
 * rather than in a sibling file on purpose: a manifest that travels with the
 * artefacts it describes can be regenerated along with them, which is how a
 * whole round of evidence was falsified in Closed Loop #8.
 *
 * Usage:
 *   pnpm test:interactive-review-freeze
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'interactive-review-v1');

/**
 * The issued artefacts, by digest.
 *
 * Frozen 2026-08-28 at commit `d343db5`. Changing a value here is a deliberate
 * act that re-issues the review; it is not something a re-run may do.
 */
const FROZEN = {
  'interactive-review-v1.json': '1cac8938ae9e3a48d3a90f32a7992c4b0ce1881f21d6209b4bf4e010ec52626c',
  'interactive-review-v1.package.json':
    '8e47f53b6e52877fbed597d0e27d5d6ac52fd8f381ed303a53493db7e26adde9',
  'screenshots/A-host-guide-closed.png':
    'f46ef682b898772298415a89ea6e4fdb3259b267203f89d76a3eb3fc30929069',
  'screenshots/B-guide-empty.png':
    '500da26f16b5195a19e915ddab498da68669cba75b8cfb65ab42a5c78c39aa7f',
  'screenshots/C-create-client-response.png':
    'e72cc41df4a3a811378fc1d97c4c5f3545d7f1c08407725fd4a0025099d120d0',
  'screenshots/D-showme-highlight-new-client.png':
    '66c0b0aebf5a4754993e6c390a5dc7a00599f8762dacf00248e574cf5fd288f7',
  'screenshots/E-filter-clients-response.png':
    '19ada269003495c795493044ce1e036fccd9345c5f9556b2066bf08155306fd6',
  'screenshots/F-unnamed-input-highlighted.png':
    '628a343320fe3107318303accc681bc7ddc82d3e682601e1ec7368feb3fd4514',
  'screenshots/G-permission-explanation.png':
    'c7b02ed021a247572850fcb50d29c659edd81126aa5754e77805a0f000b63999',
  'screenshots/H-ambiguous-response.png':
    '66c0b0aebf5a4754993e6c390a5dc7a00599f8762dacf00248e574cf5fd288f7',
  'screenshots/I-developer-inspector.png':
    'e0942147d39d072191f76c787c75f1cea5de5448427453173c278c13215ac45e',
};

const failures = [];
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

for (const [relative, expected] of Object.entries(FROZEN)) {
  const file = path.join(DIR, relative);
  if (!existsSync(file)) {
    failures.push(`${relative} is missing`);
    continue;
  }
  const actual = sha(file);
  if (actual !== expected) {
    failures.push(`${relative} changed since it was issued (${actual.slice(0, 16)}…)`);
  }
}

// Nothing extra may appear in the issued set either.
const present = [
  ...readdirSync(DIR).filter((name) => name.endsWith('.json')),
  ...readdirSync(path.join(DIR, 'screenshots')).map((name) => `screenshots/${name}`),
];
for (const relative of present) {
  if (relative.includes('.scored')) continue;
  if (FROZEN[relative] === undefined) failures.push(`${relative} appeared after the freeze`);
}

const say = (line = '') => console.log(line);
say('\nInteractive review v1 — freeze\n');
say(`  artefacts pinned                     ${Object.keys(FROZEN).length}`);
say(
  `  screenshots                          ${Object.keys(FROZEN).filter((k) => k.startsWith('screenshots/')).length}`,
);
say('');
for (const [relative, digest] of Object.entries(FROZEN)) {
  say(`    ${relative.replace('screenshots/', '').padEnd(36)} ${digest.slice(0, 16)}`);
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — the issued review is not the review on disk.\n');
  process.exit(1);
}
say('\nPASS — every issued byte is the byte that was issued.\n');
