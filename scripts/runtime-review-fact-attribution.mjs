/**
 * Whether a review fact says what actually happened.
 *
 * These sentences are the reviewer's only independent check on a behavioural
 * claim, which makes a wrong one worse than a missing one — it does not fail to
 * help, it certifies something nobody verified. Round 8 issued three:
 *
 *   "Typing into the control labelled "Rotate API key" reduced a visible
 *    collection on the screen from 1 items to 2."
 *
 * The interaction was a click. The count went up. "1 items" is not English. And
 * the "collection" was a page `<section>` that gained a child because an element
 * was revealed. Four errors in one sentence, every one of them invented by the
 * renderer rather than observed, because the record it was rendering did not
 * record what had been done.
 *
 * So this checks the chain end to end — rendered fact → effect → trace →
 * action.kind → action.target → graph node → user-visible name — for every
 * runtime fact in the corrected revision, and then constructs the five ways it
 * went wrong and requires each to be caught.
 *
 * Usage:
 *   pnpm test:runtime-review-fact-attribution
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  describeRuntimeFacts,
  isCollectionContainer,
  isRuntimeFact,
  parseEffect,
} from './lib/runtime-review-facts.mjs';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

const loaded = await loadEverything(ROOT);
const { accepted } = enrich(loaded);
const nodeById = new Map(loaded.graph.nodes.map((node) => [node.id, node]));
const revision = JSON.parse(readFileSync(path.join(BENCH, 'human-review-round-8-r1.json'), 'utf8'));

const failures = [];
const VERB_FOR = { type: 'Typing into', click: 'Activating', submit: 'Submitting' };
let checked = 0;

// --- 1. Every issued runtime fact traces to its interaction ---------------
const factsByFeature = new Map(
  revision.items.map((item) => [item.featureId, item.knownSupportedFacts.filter(isRuntimeFact)]),
);

for (const entry of accepted) {
  const record = entry.record;
  const issued = factsByFeature.get(record.featureId) ?? [];

  if (record.actionKind === undefined || record.actionTarget === undefined) {
    failures.push(`${record.traceId}: the record does not say what was done`);
    continue;
  }
  const verb = VERB_FOR[record.actionKind];
  if (verb === undefined) {
    failures.push(`${record.traceId}: unknown action kind "${record.actionKind}"`);
    continue;
  }

  // The target named in a sentence must be the trace's target, and its name
  // must be one the interface displays.
  const targetNode = nodeById.get(record.actionTarget);
  if (targetNode === undefined) {
    failures.push(`${record.traceId}: acted on ${record.actionTarget}, which is not in the graph`);
  }
  const label = typeof targetNode?.label === 'string' ? targetNode.label.trim() : '';

  for (const sentence of issued) {
    checked += 1;
    if (sentence.startsWith('All of this was observed')) continue;

    if (!sentence.startsWith(`${verb} `)) {
      failures.push(
        `${record.featureId}: "${sentence.slice(0, 64)}…" does not use the verb for a ${record.actionKind} interaction ("${verb}")`,
      );
    }
    if (label.length > 0 && !sentence.includes(`labelled "${label}"`)) {
      failures.push(`${record.featureId}: a fact does not name the control that was acted on`);
    }
    if (label.length === 0 && sentence.includes('labelled "')) {
      failures.push(
        `${record.featureId}: "${sentence.slice(0, 64)}…" names a control the interface does not name`,
      );
    }
    // No fact may borrow the feature's own title or another control's label.
    for (const node of loaded.graph.nodes) {
      if (typeof node.label !== 'string' || node.label.trim().length === 0) continue;
      if (node.id === record.actionTarget) continue;
      if (node.label.trim() === label) continue;
      if (sentence.includes(`labelled "${node.label.trim()}"`)) {
        failures.push(
          `${record.featureId}: a fact names "${node.label.trim()}", which is not what was acted on`,
        );
      }
    }
  }

  // Effects must belong to this trace, and a collection must be a collection.
  const rendered = describeRuntimeFacts(record, nodeById);
  for (const sentence of rendered) {
    if (!issued.includes(sentence)) {
      failures.push(
        `${record.featureId}: "${sentence.slice(0, 56)}…" is not in the issued revision`,
      );
    }
  }
  for (const raw of record.effects) {
    const { kind, fields } = parseEffect(raw);
    if (kind !== 'COLLECTION_MEMBERS_CHANGED') continue;
    const container = nodeById.get(`element:${fields['containerSemanticId']}`);
    const describedAsCollection = rendered.some((s) => s.includes('the number of items in'));
    if (!isCollectionContainer(container) && describedAsCollection) {
      const others = record.effects
        .filter((e) => e.startsWith('COLLECTION_MEMBERS_CHANGED'))
        .map((e) => parseEffect(e).fields['containerSemanticId'])
        .filter((id) => isCollectionContainer(nodeById.get(`element:${id}`)));
      if (others.length === 0) {
        failures.push(
          `${record.featureId}: a change to <${container?.tagName ?? '?'}> ${fields['containerSemanticId']} is rendered as a collection`,
        );
      }
    }
  }
}

// --- 2. The five ways it went wrong, each required to be caught -----------
const node = (over = {}) => ({
  id: 'element:x',
  kind: 'element',
  tagName: 'Button',
  label: 'A',
  ...over,
});
const graph = new Map([
  ['element:a', node({ id: 'element:a', label: 'A' })],
  ['element:b', node({ id: 'element:b', tagName: 'input', type: 'input', label: undefined })],
  ['element:list', node({ id: 'element:list', tagName: 'ul', type: 'list', label: undefined })],
  [
    'element:panel',
    node({ id: 'element:panel', tagName: 'section', type: 'section', label: undefined }),
  ],
]);
const base = {
  context: { route: '/x', fixtureState: 'seeded', permissions: [], featureFlags: {} },
  traceId: 't',
};
const probes = [
  {
    name: 'A. a click that reveals must not be described as typing',
    record: {
      ...base,
      actionKind: 'click',
      actionTarget: 'element:a',
      effects: ['ELEMENT_APPEARED|role=code,semanticId=z'],
    },
    expect: (out) =>
      out.some((s) => s.startsWith('Activating the control labelled "A"')) &&
      !out.some((s) => s.startsWith('Typing')),
  },
  {
    name: 'B. typing that narrows a list may be described as typing',
    record: {
      ...base,
      actionKind: 'type',
      actionTarget: 'element:b',
      effects: ['COLLECTION_MEMBERS_CHANGED|after=2,before=5,containerSemanticId=list'],
    },
    expect: (out) =>
      out.some(
        (s) =>
          s.startsWith('Typing into an unnamed text input') &&
          s.includes('reduced the number of items in a list'),
      ),
  },
  {
    name: 'C. a submit is neither a click nor a keystroke',
    record: {
      ...base,
      actionKind: 'submit',
      actionTarget: 'element:b',
      effects: ['NETWORK_REQUEST|method=PUT,path=/api/x,statusCategory=2xx'],
    },
    expect: (out) => out.some((s) => s.startsWith('Submitting ')),
  },
  {
    name: 'D. the target wins over any other labelled control',
    record: {
      ...base,
      actionKind: 'click',
      actionTarget: 'element:b',
      effects: ['ELEMENT_APPEARED|role=x,semanticId=z'],
    },
    expect: (out) => !out.some((s) => s.includes('labelled "A"')),
  },
  {
    name: 'E. an unnamed target stays unnamed',
    record: {
      ...base,
      actionKind: 'type',
      actionTarget: 'element:b',
      effects: ['ELEMENT_APPEARED|role=x,semanticId=z'],
    },
    expect: (out) =>
      out.some((s) => s.includes('an unnamed text input')) &&
      !out.some((s) => s.includes('labelled')),
  },
  {
    name: 'F. a panel gaining a child is not a collection',
    record: {
      ...base,
      actionKind: 'click',
      actionTarget: 'element:a',
      effects: ['COLLECTION_MEMBERS_CHANGED|after=2,before=1,containerSemanticId=panel'],
    },
    expect: (out) => !out.some((s) => s.includes('the number of items in')),
  },
  {
    name: 'G. a record that cannot say what was done supports no sentence',
    record: { ...base, actionTarget: 'element:a', effects: [] },
    throws: true,
  },
];

let caught = 0;
for (const probe of probes) {
  let out;
  try {
    out = describeRuntimeFacts(probe.record, graph);
  } catch {
    if (probe.throws === true) {
      caught += 1;
      continue;
    }
    failures.push(`${probe.name} — the renderer threw`);
    continue;
  }
  if (probe.throws === true) {
    failures.push(`${probe.name} — the renderer produced a sentence anyway`);
    continue;
  }
  if (probe.expect(out)) caught += 1;
  else failures.push(`${probe.name} — got: ${JSON.stringify(out)}`);
}

const say = (line = '') => console.log(line);
say('\nRuntime review fact attribution\n');
say(`  accepted records                     ${accepted.length}`);
say(`  runtime facts in the revision        ${checked}`);
say(`  attribution probes                   ${caught}/${probes.length}`);
say('');
for (const entry of accepted) {
  const r = entry.record;
  const label = nodeById.get(r.actionTarget)?.label;
  say(
    `    ${r.traceId.padEnd(16)} ${String(r.actionKind).padEnd(7)} ${r.actionTarget.padEnd(30)} ${label ? `"${label}"` : '(unnamed)'}`,
  );
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures.slice(0, 30)) say(`    ✗ ${failure}`);
  say('\nFAIL — a review fact does not describe the interaction that produced it.\n');
  process.exit(1);
}
say('\nPASS — every review fact names the verb, the target and the effect of its own trace.\n');
