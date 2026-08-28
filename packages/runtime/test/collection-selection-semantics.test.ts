/**
 * Ten ways to make the system believe in a selection that never happened.
 *
 * Closed Loop #10 left a live false-positive path: `COLLECTION_CHANGED` counted
 * the children of any container carrying a semantic id, and `select` accepted a
 * membership change as evidence of selection. Clicking **New client** opened a
 * dialog inside the clients `<section>`, the section's child count went 6 to 7,
 * and that verified as a selection. Nothing shipped on it — but only because no
 * probe happened to propose `select` for a button that opens a dialog.
 *
 * The fix is not a tighter count. It is that membership and selection are
 * different dimensions of state, and neither is inferable from a container's
 * child list. So these tests attack from every direction that has ever worked
 * here: structural coincidence, plausible labels, suggestive identifiers, a
 * model's opinion, and the three effects that used to be treated as good enough.
 *
 * Each builds snapshots directly rather than driving the fixture, because the
 * point is the *rule*, and a rule tested only against the one application that
 * happens to exercise it is a rule tested by coincidence.
 */

import { describe, expect, it } from 'vitest';
import { diffSnapshots } from '../src/interaction.js';
import { verifyRuntimeCapability } from '../src/capabilities.js';
import type { ObservedElement, RuntimeEvidenceSnapshot } from '../src/snapshot.js';
import type { InteractionTrace } from '../src/interaction.js';

/** An element, with only what these tests care about. */
function el(over: Partial<ObservedElement> & { ref: string; role: string }): ObservedElement {
  return {
    tagName: 'div',
    visible: true,
    disabled: false,
    semanticAncestry: [],
    ...over,
  } as ObservedElement;
}

function snap(elements: ObservedElement[], route = '/x'): RuntimeEvidenceSnapshot {
  return {
    route,
    elements,
    regions: [],
    context: { route, fixtureState: 'test', permissions: [], featureFlags: {} },
  } as unknown as RuntimeEvidenceSnapshot;
}

const trace = (
  effects: ReturnType<typeof diffSnapshots>,
  kind: 'click' | 'type' | 'submit' = 'click',
): InteractionTrace =>
  ({
    traceId: 't',
    beforeSnapshot: snap([]),
    afterSnapshot: snap([]),
    action: { kind, targetSemanticId: 'ctl', safety: 'SAFE_PROBE' },
    observedEffects: effects,
  }) as unknown as InteractionTrace;

const ask = (
  kind: string,
  effects: ReturnType<typeof diffSnapshots>,
  actionKind?: 'click' | 'type' | 'submit',
) =>
  verifyRuntimeCapability(
    {
      kind: kind as never,
      subjectRef: 'element:ctl',
      runtimeEvidence: effects,
      staticEvidence: [],
      visualProposals: [],
      traceId: 't',
    },
    trace(effects, actionKind),
  );

const kinds = (effects: ReturnType<typeof diffSnapshots>) => effects.map((e) => e.kind);

// ---------------------------------------------------------------------------
// A. The one that was actually live
// ---------------------------------------------------------------------------

describe('a dialog opening inside a section', () => {
  const section = el({ ref: 'r1', semanticId: 'clients', role: 'region', tagName: 'section' });
  const existing = Array.from({ length: 5 }, (_, i) =>
    el({ ref: `r${i + 2}`, semanticId: `x${i}`, role: 'generic', semanticAncestry: ['clients'] }),
  );
  const dialog = el({
    ref: 'rd',
    semanticId: 'clients.create-dialog',
    role: 'generic',
    semanticAncestry: ['clients'],
  });
  const effects = diffSnapshots({
    before: snap([section, ...existing]),
    after: snap([section, ...existing, dialog]),
  });

  it('A. is not a collection change, however many children the section gained', () => {
    expect(kinds(effects)).not.toContain('COLLECTION_MEMBERS_CHANGED');
    expect(kinds(effects)).toContain('ELEMENT_APPEARED');
  });

  it('A. cannot be verified as a selection', () => {
    const verdict = ask('select', effects);
    expect(verdict.status).toBe('rejected');
    if (verdict.status === 'rejected') expect(verdict.reason).toBe('NO_SELECTION_EFFECT');
  });

  it('A. cannot be verified as a cleared selection either', () => {
    expect(ask('clear_selection', effects).status).toBe('rejected');
  });

  it('A. is still an ordinary reveal, because that is what it is', () => {
    expect(ask('reveal', effects).status).toBe('verified');
  });
});

// ---------------------------------------------------------------------------
// B. A notification arriving in a region
// ---------------------------------------------------------------------------

it('B. a notification added to a region is not a collection change', () => {
  const region = el({ ref: 'r1', semanticId: 'shell', role: 'region', tagName: 'div' });
  const toast = el({ ref: 'r2', semanticId: 'toast', role: 'status', semanticAncestry: ['shell'] });
  const effects = diffSnapshots({ before: snap([region]), after: snap([region, toast]) });
  expect(kinds(effects)).not.toContain('COLLECTION_MEMBERS_CHANGED');
  expect(kinds(effects)).not.toContain('SELECTION_CHANGED');
});

// ---------------------------------------------------------------------------
// C & D. What a real collection looks like
// ---------------------------------------------------------------------------

const table = el({ ref: 't', semanticId: 'clients.table', role: 'table', tagName: 'table' });
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    el({
      ref: `row${i}`,
      semanticId: `clients.table.row.${i}`,
      role: 'row',
      tagName: 'tr',
      semanticAncestry: ['clients.table'],
    }),
  );

it('C. a table gaining a row is a member change', () => {
  const effects = diffSnapshots({
    before: snap([table, ...rows(5)]),
    after: snap([table, ...rows(6)]),
  });
  const change = effects.find((e) => e.kind === 'COLLECTION_MEMBERS_CHANGED');
  expect(change).toMatchObject({
    containerSemanticId: 'clients.table',
    collectionRole: 'table',
    memberRole: 'row',
    before: 5,
    after: 6,
  });
});

it('D. a table narrowing from five rows to two is a member change', () => {
  const effects = diffSnapshots({
    before: snap([table, ...rows(5)]),
    after: snap([table, ...rows(2)]),
  });
  expect(effects.find((e) => e.kind === 'COLLECTION_MEMBERS_CHANGED')).toMatchObject({
    before: 5,
    after: 2,
  });
  // And it is a filter only when an input produced it.
  expect(ask('filter', effects, 'type').status).toBe('verified');
  const byClick = ask('filter', effects, 'click');
  expect(byClick.status).toBe('rejected');
  if (byClick.status === 'rejected') expect(byClick.reason).toBe('WRONG_INTERACTION_KIND');
});

it('D. a caption is not a row, so a table gaining one changes no membership', () => {
  const caption = el({
    ref: 'cap',
    semanticId: 'clients.table.caption',
    role: 'caption',
    semanticAncestry: ['clients.table'],
  });
  const effects = diffSnapshots({
    before: snap([table, ...rows(5)]),
    after: snap([table, ...rows(5), caption]),
  });
  expect(kinds(effects)).not.toContain('COLLECTION_MEMBERS_CHANGED');
});

// ---------------------------------------------------------------------------
// E, F, G. Selection, and the three things that are not selection
// ---------------------------------------------------------------------------

const selectableRows = (selectedIndex: number | null, n = 3) =>
  Array.from({ length: n }, (_, i) =>
    el({
      ref: `row${i}`,
      semanticId: `row.${i}`,
      role: 'row',
      tagName: 'tr',
      semanticAncestry: ['clients.table'],
      ...(selectedIndex === null ? { selected: false } : { selected: i === selectedIndex }),
    }),
  );

it('E. a row declaring aria-selected true where it declared false is a selection change', () => {
  const effects = diffSnapshots({
    before: snap([table, ...selectableRows(null)]),
    after: snap([table, ...selectableRows(1)]),
  });
  const change = effects.find((e) => e.kind === 'SELECTION_CHANGED');
  expect(change).toMatchObject({ containerSemanticId: 'clients.table', selected: ['row.1'] });
  expect(ask('select', effects).status).toBe('verified');
});

it('E. a selection moving from one row to another is still a selection', () => {
  const effects = diffSnapshots({
    before: snap([table, ...selectableRows(0)]),
    after: snap([table, ...selectableRows(2)]),
  });
  const change = effects.find((e) => e.kind === 'SELECTION_CHANGED');
  // Counts are equal on both sides. Identity is what moved.
  expect(change).toMatchObject({ selectedBefore: 1, selectedAfter: 1 });
  expect(ask('select', effects).status).toBe('verified');
});

it('E. clearing requires the selection to be gone, not merely different', () => {
  const cleared = diffSnapshots({
    before: snap([table, ...selectableRows(0)]),
    after: snap([table, ...selectableRows(null)]),
  });
  expect(ask('clear_selection', cleared).status).toBe('verified');

  const moved = diffSnapshots({
    before: snap([table, ...selectableRows(0)]),
    after: snap([table, ...selectableRows(2)]),
  });
  const verdict = ask('clear_selection', moved);
  expect(verdict.status).toBe('rejected');
  if (verdict.status === 'rejected') expect(verdict.reason).toBe('SELECTION_REPLACED_NOT_CLEARED');
});

it('F. a row disappearing is not a selection change', () => {
  const effects = diffSnapshots({
    before: snap([table, ...rows(5)]),
    after: snap([table, ...rows(4)]),
  });
  expect(kinds(effects)).toContain('COLLECTION_MEMBERS_CHANGED');
  expect(kinds(effects)).not.toContain('SELECTION_CHANGED');
  expect(ask('select', effects).status).toBe('rejected');
});

it('G. navigation is not a selection, whatever else came with it', () => {
  const effects = diffSnapshots({
    before: snap([table, ...selectableRows(null)], '/a'),
    after: snap([table, ...selectableRows(1)], '/b'),
  });
  expect(kinds(effects)).toContain('SELECTION_CHANGED');
  const verdict = ask('select', effects);
  expect(verdict.status).toBe('rejected');
  if (verdict.status === 'rejected') expect(verdict.reason).toBe('NAVIGATION_OCCURRED');
});

// ---------------------------------------------------------------------------
// H, I, J. Opinion, label, identifier
// ---------------------------------------------------------------------------

it('H. a visual proposal of selection establishes nothing', () => {
  const verdict = verifyRuntimeCapability(
    {
      kind: 'select' as never,
      subjectRef: 'element:ctl',
      runtimeEvidence: [],
      staticEvidence: [],
      visualProposals: ['the highlighted row looks selected'],
      traceId: 't',
    },
    trace([]),
  );
  expect(verdict.status).toBe('rejected');
  if (verdict.status === 'rejected') expect(verdict.reason).toBe('VISION_ONLY');
});

it('I. a control labelled "Select" selects nothing without a state change', () => {
  const button = el({
    ref: 'b',
    semanticId: 'ctl',
    role: 'button',
    accessibleName: { text: 'Select all', origin: 'ui-label' },
  } as never);
  const effects = diffSnapshots({
    before: snap([table, ...rows(3)]),
    after: snap([table, ...rows(3), button]),
  });
  expect(kinds(effects)).not.toContain('SELECTION_CHANGED');
  expect(ask('select', effects).status).toBe('rejected');
});

it('J. an identifier containing "select" is not evidence of selecting', () => {
  const before = snap([table, ...rows(3)]);
  const after = snap([
    table,
    ...rows(3),
    el({
      ref: 'z',
      semanticId: 'invoices.list.select-row',
      role: 'generic',
      semanticAncestry: ['clients.table'],
    }),
  ]);
  const effects = diffSnapshots({ before, after });
  expect(kinds(effects)).not.toContain('SELECTION_CHANGED');
  expect(ask('select', effects).status).toBe('rejected');
  // The identifier is inside a real collection and still buys nothing.
  expect(kinds(effects)).not.toContain('COLLECTION_MEMBERS_CHANGED');
});
