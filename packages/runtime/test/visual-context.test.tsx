/**
 * Vision proposes. Evidence decides what survives.
 *
 * Closed Loop #9 proved a visual proposal cannot mint a capability. This is the
 * larger claim: a visual proposal cannot mint *anything* — not a name, not a
 * concept, not a screen's identity, not a control's effect — and the proposals
 * recorded here are the ones a real model would actually make, including the
 * ones that sound most useful.
 *
 * The adversarial set is lettered so failures name themselves in CI.
 */

import { describe, expect, it } from 'vitest';
import {
  buildVisualEvidencePack,
  classifyForProvider,
  correlateVisualProposals,
  hostElements,
  isKnownProposalType,
  maskName,
  spatialRelation,
  VISUAL_PROPOSAL_TYPES,
} from '../src/index.js';
import type { VisualCorrelation } from '../src/index.js';
import {
  GUIDE_SELF_REFERENCE,
  RECORDED_SCENES,
  V02_CLIENTS,
  V03_CLIENT_DETAIL,
  V06_RESTRICTED,
  V10_HOSTILE,
} from './fixtures/visual-scenes.js';

const correlate = (scene: (typeof RECORDED_SCENES)[number]): VisualCorrelation[] =>
  correlateVisualProposals({
    pack: buildVisualEvidencePack({
      route: scene.route,
      snapshotId: scene.snapshotId,
      viewport: { width: 1440, height: 900 },
      elements: scene.elements,
      regions: [],
      screenshotHash: `sha256:recorded-${scene.snapshotId}`,
    }),
    proposals: scene.proposals,
    mountedSemanticIds: scene.mountedSemanticIds,
    establishedConcepts: scene.establishedConcepts,
  });

const byId = (results: VisualCorrelation[], id: string): VisualCorrelation => {
  const found = results.find((result) => result.proposalId === id);
  if (found === undefined) throw new Error(`no correlation for ${id}`);
  return found;
};

// ---------------------------------------------------------------------------
// A · a proposal naming a thing the interface never names
// ---------------------------------------------------------------------------

describe('A · a label a model read off the screen', () => {
  it('never resolves, and is never eligible to be shown', () => {
    const search = byId(correlate(V02_CLIENTS), 'V02-p2');
    expect(search.status).toBe('UNRESOLVED');
    expect(search.eligibleForContextualPresentation).toBe(false);
  });

  it('leaves the true spatial claim about the same element standing', () => {
    // The distinction the whole loop rests on: *where* it is survives, *what it
    // is called* does not. Both proposals name `clients.search`.
    const group = byId(correlate(V02_CLIENTS), 'V02-p1');
    expect(group.status).toBe('SUPPORTED');
    expect(group.eligibleForContextualPresentation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B · a proposal asserting what a control does
// ---------------------------------------------------------------------------

describe('B · a control relation vision is confident about', () => {
  it('may be spatially supported without asserting an effect', () => {
    const created = byId(correlate(V02_CLIENTS), 'V02-p3');
    // A single element with no second element to relate to has no geometry to
    // check, so nothing supports it. Confidence 0.95 buys nothing.
    expect(created.status).not.toBe('SUPPORTED');
  });
});

// ---------------------------------------------------------------------------
// C · the critical negative — an invoice list on a client screen
// ---------------------------------------------------------------------------

describe('C · a collection vision recognises but the product has not established', () => {
  const results = correlate(V03_CLIENT_DETAIL);

  it('is contradicted, because the route establishes no such concept', () => {
    expect(byId(results, 'V03-p1').status).toBe('CONTRADICTED');
  });

  it('takes the screen-purpose claim down with it', () => {
    expect(byId(results, 'V03-p2').status).toBe('CONTRADICTED');
  });

  it('makes nothing eligible for presentation', () => {
    expect(results.every((result) => !result.eligibleForContextualPresentation)).toBe(true);
  });

  it('never carries the concept into anything a user could read', () => {
    // `invoices.list.open` is an *address*, and addresses are allowed — Closed
    // Loop #12 settled that a control may be pointed at without being named.
    // What must not survive is the word reaching prose or eligibility.
    const presentable = results.filter((result) => result.eligibleForContextualPresentation);
    expect(presentable).toEqual([]);
    const evidence = results.flatMap((result) => [
      ...result.supportingEvidence,
      ...result.contradictionEvidence,
    ]);
    expect(evidence.some((line) => /invoice list|invoices module/i.test(line))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D · a proposal about something that is not on screen
// ---------------------------------------------------------------------------

describe('D · visible-state claims', () => {
  const results = correlate(V06_RESTRICTED);

  it('are contradicted when the element is not mounted at all', () => {
    expect(byId(results, 'V06-p1').status).toBe('CONTRADICTED');
  });

  it('are contradicted when the element is mounted but not visible', () => {
    const exported = byId(results, 'V06-p2');
    expect(exported.status).toBe('CONTRADICTED');
    expect(exported.contradictionEvidence.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// E · the screenshot is a prompt
// ---------------------------------------------------------------------------

describe('E · a screenshot containing instructions', () => {
  const results = correlate(V10_HOSTILE);

  it('does not let the instruction become a supported claim', () => {
    expect(results.every((result) => result.status !== 'SUPPORTED')).toBe(true);
  });

  it('does not let it reach a user', () => {
    expect(results.every((result) => !result.eligibleForContextualPresentation)).toBe(true);
  });

  it('carries no provider sentence into the correlation output', () => {
    // The statement stays on the proposal, where the inspector can show it as a
    // diagnostic. Nothing in the correlated result repeats it.
    const serialised = JSON.stringify(results);
    expect(serialised).not.toContain('deletes the user account');
    expect(serialised).not.toContain('Invoices module');
  });
});

// ---------------------------------------------------------------------------
// F · the guide may not describe itself
// ---------------------------------------------------------------------------

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
} as const;

describe('F · a proposal about the guide panel', () => {
  it('is refused rather than answered', () => {
    const results = correlateVisualProposals({
      pack: buildVisualEvidencePack({
        route: '/clients',
        snapshotId: 'snap-v02',
        viewport: { width: 1440, height: 900 },
        elements: [...V02_CLIENTS.elements, GUIDE_PANEL],
        regions: [],
        screenshotHash: 'sha256:recorded-snap-v02',
      }),
      proposals: [GUIDE_SELF_REFERENCE],
      mountedSemanticIds: [...V02_CLIENTS.mountedSemanticIds, 'statewave.guide.panel'],
      establishedConcepts: ['client'],
    });
    expect(byId(results, 'VX-guide').status).toBe('CONTRADICTED');
  });

  it('is excluded from the elements a provider is shown', () => {
    const pack = buildVisualEvidencePack({
      route: '/clients',
      snapshotId: 'snap-v02',
      viewport: { width: 1440, height: 900 },
      elements: [...V02_CLIENTS.elements, GUIDE_PANEL],
      regions: [],
      screenshotHash: 'sha256:recorded-snap-v02',
      guideRegion: { x: 1020, y: 0, width: 420, height: 900 },
    });
    expect(hostElements(pack).some((element) => element.guideOwned === true)).toBe(false);
    expect(pack.redactionManifest.some((entry) => entry.placeholder === '[guide panel]')).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// F2 · the guide covers what it is describing
// ---------------------------------------------------------------------------

describe('F2 · an element underneath the panel', () => {
  // Found in the real capture rather than reasoned about: the panel floats over
  // the client table, so five Delete buttons are `visible: true` in the DOM and
  // absent from the picture. A model describing the frame correctly would be
  // scored as contradicting the DOM, and the thing that hid the button was this
  // system.
  const covered = {
    semanticId: 'clients.table.delete',
    ref: 'i9',
    tagName: 'button',
    semanticAncestry: [],
    role: 'button',
    accessibleName: { text: 'Delete', source: 'text-content' as const },
    box: { x: 1157, y: 252, width: 66, height: 34 },
    visible: true,
    disabled: false,
  };
  const pack = buildVisualEvidencePack({
    route: '/clients',
    snapshotId: 'snap-occluded',
    viewport: { width: 1440, height: 900 },
    elements: [...V02_CLIENTS.elements, covered],
    regions: [],
    screenshotHash: 'sha256:recorded-occluded',
    guideRegion: { x: 976, y: 24, width: 440, height: 852 },
  });

  it('is recorded as covered', () => {
    expect(pack.occludedSemanticIds).toContain('clients.table.delete');
  });

  it('leaves a claim about it unresolved rather than contradicted', () => {
    const [result] = correlateVisualProposals({
      pack,
      proposals: [
        {
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
        },
      ],
      mountedSemanticIds: [...V02_CLIENTS.mountedSemanticIds, 'clients.table.delete'],
      establishedConcepts: ['client'],
    });
    expect(result?.status).toBe('UNRESOLVED');
    expect(result?.unresolvedEvidence.join(' ')).toMatch(/underneath the guide panel/);
    expect(result?.eligibleForContextualPresentation).toBe(false);
  });

  it('records nothing as covered when the guide is not over anything', () => {
    const clear = buildVisualEvidencePack({
      route: '/clients',
      snapshotId: 'snap-clear',
      viewport: { width: 1440, height: 900 },
      elements: V02_CLIENTS.elements,
      regions: [],
      screenshotHash: 'sha256:recorded-clear',
      guideRegion: { x: 1420, y: 0, width: 20, height: 900 },
    });
    expect(clear.occludedSemanticIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// G · secrets never reach a provider
// ---------------------------------------------------------------------------

describe('G · what a screenshot is allowed to carry outward', () => {
  it.each([
    ['sk_live_51H8xQ2eZvKYlo2C', 'SECRET'],
    ['ghp_aBcDeFgHiJkLmNoPqRsTuV', 'SECRET'],
    ['eyJhbGciOiJIUzI1NiJ9.payload', 'SECRET'],
    ['Bearer abcdefghijklmnop', 'SECRET'],
    ['ada@example.com', 'PERSONAL_INSTANCE_VALUE'],
    ['New client', 'SAFE_UI_LABEL'],
  ])('classifies %s by shape', (name, expected) => {
    expect(classifyForProvider({ name })).toBe(expected);
  });

  it('refuses a password field without reading what is in it', () => {
    // The field's *type* is enough. Waiting to recognise the value would mean
    // every unrecognised secret travels.
    expect(classifyForProvider({ name: 'hunter2', inputType: 'password' })).toBe('CREDENTIAL');
    expect(classifyForProvider({ name: undefined, inputType: 'password' })).toBe('CREDENTIAL');
  });

  it('replaces a secret rather than passing it through', () => {
    expect(maskName('sk_live_51H8xQ2eZvKYlo2C', 'SECRET')).toBe('[redacted]');
    expect(maskName('ada@example.com', 'PERSONAL_INSTANCE_VALUE')).toBe('EMAIL_1');
    expect(maskName('New client', 'SAFE_UI_LABEL')).toBe('New client');
  });

  it('records every masked region in the manifest that travels with the pack', () => {
    const pack = buildVisualEvidencePack({
      route: '/settings',
      snapshotId: 'snap-v05',
      viewport: { width: 1440, height: 900 },
      elements: [
        {
          semanticId: 'settings.api-key',
          ref: 'i1',
          tagName: 'input',
          semanticAncestry: [],
          role: 'textbox',
          accessibleName: { text: 'sk_live_51H8xQ2eZvKYlo2C', source: 'value' },
          box: { x: 32, y: 300, width: 400, height: 36 },
          visible: true,
          disabled: false,
        },
      ],
      regions: [],
      screenshotHash: 'sha256:recorded-snap-v05',
    });
    const [entry] = pack.redactionManifest;
    expect(entry?.classification).toBe('SECRET');
    expect(JSON.stringify(pack)).not.toContain('sk_live_51H8xQ2eZvKYlo2C');
  });
});

// ---------------------------------------------------------------------------
// H · geometry is arithmetic, not opinion
// ---------------------------------------------------------------------------

describe('H · spatial relations', () => {
  const search = { x: 32, y: 170, width: 238, height: 36 };
  const table = { x: 32, y: 210, width: 1376, height: 320 };

  it('are computed from boxes', () => {
    expect(spatialRelation(search, table)).toBe('above');
    expect(spatialRelation(table, search)).toBe('below');
  });

  it('report overlap rather than picking a side', () => {
    expect(
      spatialRelation(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 },
      ),
    ).toBe('overlapping');
  });
});

// ---------------------------------------------------------------------------
// I · the taxonomy is closed
// ---------------------------------------------------------------------------

describe('I · proposal types', () => {
  it('accepts only what the taxonomy declares', () => {
    expect(isKnownProposalType('SCREEN_PURPOSE')).toBe(true);
    expect(isKnownProposalType('CAPABILITY')).toBe(false);
    expect(isKnownProposalType('PRODUCT_CLAIM')).toBe(false);
  });

  it('contains no type that could name a capability', () => {
    expect(VISUAL_PROPOSAL_TYPES.join(' ')).not.toMatch(/CAPABILITY|CLAIM|ACTION|EFFECT/);
  });
});

// ---------------------------------------------------------------------------
// J · every recorded scene, in bulk
// ---------------------------------------------------------------------------

describe('J · across every recorded scene', () => {
  it('a proposal is never eligible unless the evidence supports it', () => {
    for (const scene of RECORDED_SCENES) {
      for (const result of correlate(scene)) {
        if (result.eligibleForContextualPresentation) expect(result.status).toBe('SUPPORTED');
      }
    }
  });

  it('nothing eligible is a purpose, a concept, or a label', () => {
    for (const scene of RECORDED_SCENES) {
      for (const result of correlate(scene)) {
        if (!result.eligibleForContextualPresentation) continue;
        expect([
          'SCREEN_PURPOSE',
          'REGION_PURPOSE',
          'COLLECTION_RELATION',
          'VISUAL_LABEL_CANDIDATE',
        ]).not.toContain(result.type);
      }
    }
  });
});
