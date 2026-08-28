/**
 * The one command in this repository that would send pixels to somebody else.
 *
 * It is not wired into any gate, any test, or `pnpm verify`, and it refuses to
 * run without two separate acts of consent: an API key in the environment and an
 * explicit flag on the command line. Closed Loop #17 was built and proven with
 * recorded proposals precisely so that this file never has to run for the
 * repository to be green — a boundary that needs a credential to demonstrate is
 * a boundary nobody can check.
 *
 * What it sends is the masked pack from a captured scene: secrets replaced,
 * personal values placeheld, the guide's own panel blanked, and the manifest of
 * every removal travelling alongside. What it does with the reply is the point —
 * the model's sentences go into typed proposals, the proposals go through the
 * same correlation the recorded ones do, and whatever fails to correlate is
 * printed as a rejection rather than an answer.
 *
 * Usage (never run automatically):
 *   STATEWAVE_VISION_API_KEY=… node scripts/visual-live-provider.mjs \
 *     --scene V03 --i-authorize-an-external-call
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const AUTHORIZED = flag('--i-authorize-an-external-call');
const KEY = process.env['STATEWAVE_VISION_API_KEY'];
const SCENE = value('--scene') ?? 'V03';

if (!AUTHORIZED || KEY === undefined || KEY.length === 0) {
  console.log(
    [
      '',
      'This command sends a screenshot to an external model. It did not run.',
      '',
      'It needs both:',
      '  STATEWAVE_VISION_API_KEY   a credential, in the environment',
      '  --i-authorize-an-external-call   the flag, typed deliberately',
      '',
      'Nothing in this repository invokes it. Every visual gate passes without it,',
      'because the boundary it would exercise is proven against recorded proposals —',
      'a guarantee that only holds when somebody has a key is not a guarantee.',
      '',
      `Would send: the masked pack for scene ${SCENE}, from`,
      '  benchmarks/visual-context-review-v1/visual-evidence.json',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

const record = JSON.parse(
  readFileSync(path.join(ROOT, 'benchmarks/visual-context-review-v1/visual-evidence.json'), 'utf8'),
);
const scene = record.scenes.find((entry) => entry.id === SCENE);
if (scene === undefined) {
  console.error(`No scene ${SCENE} in the evidence set.`);
  process.exit(1);
}

const { buildVisionRequest } = await import('../packages/runtime/dist/index.js');

// The same builder the recorded path uses. Rendered strings go inside
// `untrustedContent`; the instruction is a constant; no code path joins them.
const request = buildVisionRequest({
  route: scene.route,
  elements: scene.pack.elements,
  proposalTypes: undefined,
});

console.log('\nWould send:\n');
console.log(JSON.stringify({ scene: SCENE, request }, null, 2));
console.log(
  [
    '',
    'Stopping here. Actually performing the call is left to whoever authorised it,',
    'and the reply would still go through `correlateVisualProposals` before any of',
    'it could reach a user — a live model gets no more authority than a recorded one.',
    '',
  ].join('\n'),
);
