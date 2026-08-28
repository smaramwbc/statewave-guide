/**
 * The correlations, written down.
 *
 * Until now every verdict this loop produced lived inside a test assertion,
 * which is enough to keep the code honest and not enough for a reviewer to read.
 * A frozen review needs the verdicts as bytes: this proposal, that status, these
 * reasons — inspectable without running anything.
 *
 * Pure re-projection. The recorded proposals are the committed fixture, the
 * correlation is the shipped function, and no browser and no provider are
 * involved. Running it twice on unchanged inputs produces identical output,
 * which is what makes it freezable.
 *
 * The fixture is TypeScript, so it is transpiled to a scratch directory first
 * rather than duplicated as data. Two copies of the same recorded proposals
 * would eventually disagree, and the one a reviewer read would be the wrong one.
 *
 * Usage:
 *   node scripts/build-visual-correlations.mjs [--check]
 *
 * @packageDocumentation
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'benchmarks/visual-context-review-v1/visual-correlations.json');
const FIXTURE = path.join(ROOT, 'packages/runtime/test/fixtures/visual-scenes.ts');
const CHECK = process.argv.includes('--check');

const scratch = mkdtempSync(path.join(tmpdir(), 'statewave-correlations-'));
let scenes;
try {
  execFileSync(
    'npx',
    ['tsup', FIXTURE, '--format', 'esm', '--out-dir', scratch, '--silent', '--no-splitting'],
    { cwd: ROOT, stdio: 'pipe' },
  );
  // tsup emits `.js`, and a bare `.js` outside a package is CJS to Node.
  writeFileSync(path.join(scratch, 'package.json'), '{ "type": "module" }\n');
  scenes = await import(pathToFileURL(path.join(scratch, 'visual-scenes.js')).href);
} catch (error) {
  console.error(`Could not transpile the recorded fixture: ${String(error)}`);
  process.exit(1);
}

const { buildVisualEvidencePack, correlateVisualProposals } = await import(
  pathToFileURL(path.join(ROOT, 'packages/runtime/dist/index.js')).href
);

const VIEWPORT = { width: 1440, height: 900 };

/** The guide panel, as the adversarial set positions it. */
const GUIDE_PANEL = {
  semanticId: 'statewave.guide.panel',
  ref: 'guide-panel',
  tagName: 'aside',
  semanticAncestry: [],
  role: 'complementary',
  box: { x: 1020, y: 0, width: 420, height: 900 },
  visible: true,
  disabled: false,
  guideOwned: true,
};

/** A host control the panel is sitting on top of, from the real capture. */
const COVERED_DELETE = {
  semanticId: 'clients.table.delete',
  ref: 'i9',
  tagName: 'button',
  semanticAncestry: [],
  role: 'button',
  accessibleName: { text: 'Delete', source: 'text-content' },
  box: { x: 1157, y: 252, width: 66, height: 34 },
  visible: true,
  disabled: false,
};

const results = [];

for (const scene of scenes.RECORDED_SCENES) {
  const pack = buildVisualEvidencePack({
    route: scene.route,
    snapshotId: scene.snapshotId,
    viewport: VIEWPORT,
    elements: scene.elements,
    regions: [],
    screenshotHash: `sha256:recorded-${scene.snapshotId}`,
  });
  results.push({
    scene: scene.id,
    route: scene.route,
    description: scene.description,
    establishedConcepts: scene.establishedConcepts,
    proposals: scene.proposals,
    correlations: correlateVisualProposals({
      pack,
      proposals: scene.proposals,
      mountedSemanticIds: scene.mountedSemanticIds,
      establishedConcepts: scene.establishedConcepts,
    }),
  });
}

// The guide describing itself, and the guide covering what it describes. Both
// are correlation cases with no recorded scene of their own.
const selfPack = buildVisualEvidencePack({
  route: '/clients',
  snapshotId: 'snap-v02',
  viewport: VIEWPORT,
  elements: [...scenes.V02_CLIENTS.elements, GUIDE_PANEL],
  regions: [],
  screenshotHash: 'sha256:recorded-snap-v02',
  guideRegion: GUIDE_PANEL.box,
});
results.push({
  scene: 'VX-guide',
  route: '/clients',
  description: 'A proposal about the guide panel rather than the application.',
  establishedConcepts: ['client'],
  proposals: [scenes.GUIDE_SELF_REFERENCE],
  correlations: correlateVisualProposals({
    pack: selfPack,
    proposals: [scenes.GUIDE_SELF_REFERENCE],
    mountedSemanticIds: [...scenes.V02_CLIENTS.mountedSemanticIds, 'statewave.guide.panel'],
    establishedConcepts: ['client'],
  }),
});

const occludedPack = buildVisualEvidencePack({
  route: '/clients',
  snapshotId: 'snap-occluded',
  viewport: VIEWPORT,
  elements: [...scenes.V02_CLIENTS.elements, COVERED_DELETE],
  regions: [],
  screenshotHash: 'sha256:recorded-occluded',
  guideRegion: { x: 976, y: 24, width: 440, height: 852 },
});
const OCCLUSION_PROPOSAL = {
  id: 'OCC-p1',
  type: 'VISIBLE_STATE',
  statement: 'There is no Delete button on this screen.',
  targetSemanticIds: ['clients.table.delete'],
  provenance: {
    provider: 'recorded',
    model: 'recorded-vlm-1',
    screenshotHash: 'sha256:recorded-occluded',
    route: '/clients',
    snapshotId: 'snap-occluded',
    redactionManifest: [],
    visibleSemanticIds: ['clients.table.delete'],
  },
};
results.push({
  scene: 'VX-occlusion',
  route: '/clients',
  description:
    'A true statement about the frame, about a control the panel is covering. The DOM says visible; the picture does not show it; neither is wrong.',
  establishedConcepts: ['client'],
  occludedSemanticIds: occludedPack.occludedSemanticIds,
  proposals: [OCCLUSION_PROPOSAL],
  correlations: correlateVisualProposals({
    pack: occludedPack,
    proposals: [OCCLUSION_PROPOSAL],
    mountedSemanticIds: [...scenes.V02_CLIENTS.mountedSemanticIds, 'clients.table.delete'],
    establishedConcepts: ['client'],
  }),
});

rmSync(scratch, { recursive: true, force: true });

const every = results.flatMap((entry) => entry.correlations);
const artifact = {
  artifact: 'visual-correlations',
  version: 1,
  producedBy: 'scripts/build-visual-correlations.mjs',
  source: 'packages/runtime/test/fixtures/visual-scenes.ts',
  visionProvider: 'none - these are recorded proposals, not a transcript of any model',
  note: 'Several proposals here are deliberately wrong. A correlation layer only proves something if the wrong ones lose.',
  summary: {
    proposals: every.length,
    supported: every.filter((entry) => entry.status === 'SUPPORTED').length,
    contradicted: every.filter((entry) => entry.status === 'CONTRADICTED').length,
    unresolved: every.filter((entry) => entry.status === 'UNRESOLVED').length,
    eligibleForContextualPresentation: every.filter(
      (entry) => entry.eligibleForContextualPresentation,
    ).length,
  },
  scenes: results,
};

const serialised = `${JSON.stringify(artifact, null, 2)}\n`;

if (CHECK) {
  let existing;
  try {
    existing = readFileSync(OUT, 'utf8');
  } catch {
    console.error('The correlations artifact has not been built. Run this script without --check.');
    process.exit(1);
  }
  if (existing !== serialised) {
    console.error(
      '\nThe committed correlations no longer match what the recorded proposals produce.\n\n' +
        '  That is either a change in the correlation rules or a change in the fixture.\n' +
        '  Both are real events. Neither may happen silently during a frozen review.\n',
    );
    process.exit(1);
  }
  console.log(
    `\nVisual correlations — ${every.length} proposals, ${artifact.summary.contradicted} contradicted, ${artifact.summary.eligibleForContextualPresentation} eligible.\n`,
  );
  process.exit(0);
}

writeFileSync(OUT, serialised);
console.log(`\nWrote ${path.relative(ROOT, OUT)} — ${every.length} correlated proposals.\n`);
