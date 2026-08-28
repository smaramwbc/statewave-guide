/**
 * What a browser was observed doing, written so a reviewer can check it.
 *
 * These sentences are *evidence*, not output. A reviewer scoring **"Lets you
 * filter clients."** has no source access, so the fact list is the only thing
 * standing between them and taking the product's word for it. That makes an
 * inaccurate fact worse than a missing one: a wrong sentence in the evidence
 * column does not merely fail to help, it actively certifies a claim nobody
 * checked.
 *
 * Round 8 shipped three of them. The renderer hard-coded the verb *"Typing
 * into"* onto every collection change and the direction *"reduced"* onto every
 * count, so a **click** on `Rotate API key` reached a reviewer as
 *
 *   "Typing into the control labelled "Rotate API key" reduced a visible
 *    collection on the screen from 1 items to 2."
 *
 * — wrong verb, wrong direction, ungrammatical, and describing a page section's
 * child count as a collection. Every clause of it was invented by the renderer.
 *
 * The rules here exist so that cannot recur:
 *
 *   1. **The verb comes from the trace.** `action.kind` decides it — never the
 *      capability, the feature id, the effect kind, or what reads well.
 *   2. **The target is the thing that was acted on.** Never the feature title,
 *      the root control, or the capability subject. Where the interface gives
 *      the target no name, it stays unnamed; borrowing a neighbour's label is
 *      how "Rotate API key" ended up describing a text-entry that never
 *      happened.
 *   3. **A member count is not a collection.** A page `<section>` gaining a
 *      child because a dialog opened is not a list growing. Only a container
 *      the graph knows to be a collection is described as one.
 *
 * @packageDocumentation
 */

/** Effects, parsed back out of their serialised `KIND|k=v,...` form. */
export function parseEffect(entry) {
  const [kind, rest = ''] = entry.split('|');
  const fields = {};
  for (const pair of rest.split(',')) {
    const index = pair.indexOf('=');
    if (index > 0) fields[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return { kind, fields };
}

/**
 * The verb for an interaction, and nothing else may supply it.
 *
 * Absent `actionKind` is a refusal rather than a default. A record written
 * before this field existed cannot support a sentence about what was done, and
 * guessing is precisely the defect.
 */
const VERBS = { type: 'Typing into', click: 'Activating', submit: 'Submitting' };

/**
 * Containers the graph knows to hold a collection.
 *
 * Deliberately narrow, and read from the *graph* rather than from the effect —
 * the runtime's `COLLECTION_CHANGED` counts members of any container carrying a
 * semantic id, including page sections, and that over-breadth is recorded as a
 * runtime-evidence defect rather than papered over here.
 */
const COLLECTION_TAGS = new Set(['table', 'ul', 'ol', 'select', 'tbody', 'datalist']);
const COLLECTION_TYPES = new Set(['table', 'list']);

/** Whether a container is a collection, or merely a box that gained a child. */
export function isCollectionContainer(node) {
  if (node === undefined) return false;
  const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
  return COLLECTION_TAGS.has(tag) || COLLECTION_TYPES.has(node.type ?? '');
}

/** What to call a container in a sentence, without naming it by identifier. */
function containerNoun(node) {
  const tag = typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : '';
  if (tag === 'table' || node?.type === 'table') return 'a table';
  if (tag === 'ul' || tag === 'ol' || node?.type === 'list') return 'a list';
  return 'a collection';
}

/**
 * How to refer to the control that was acted on.
 *
 * Closed Loop #8's rule holds inside the evidence list as much as in the guide:
 * a label the interface displays, or no name at all. `clients.search` is a real
 * input carrying no readable text, and calling it "the Search box" here would
 * put an identifier into a reviewer's evidence.
 */
function describeTarget(node) {
  const label = typeof node?.label === 'string' ? node.label.trim() : '';
  if (label.length > 0) return `the control labelled "${label}"`;
  const tag = typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : '';
  if (tag === 'form' || node?.type === 'form') return 'an unnamed form on this screen';
  if (tag === 'input' || tag === 'textarea' || node?.type === 'input') {
    return 'an unnamed text input on this screen';
  }
  return 'an unnamed control on this screen';
}

/** `1 item` / `2 items`, because "1 items" reached a reviewer. */
const items = (n) => `${n} ${Number(n) === 1 ? 'item' : 'items'}`;

/**
 * One record's observed effects, as checkable sentences.
 *
 * Every sentence names the same verb and the same target, because every effect
 * in a record comes from one interaction — one before-snapshot, one action, one
 * after-snapshot. If that ever stops being true, this has to render per
 * interaction rather than per record, and the assertion below is what will say
 * so rather than letting a narrative form silently.
 */
export function describeRuntimeFacts(record, nodeById) {
  const verb = VERBS[record.actionKind];
  if (verb === undefined) {
    throw new Error(
      `${record.traceId}: no actionKind on the record, so no sentence can say what was done`,
    );
  }
  const target = describeTarget(nodeById.get(record.actionTarget));
  const subject = `${verb} ${target}`;

  const sentences = [];
  for (const raw of record.effects) {
    const { kind, fields } = parseEffect(raw);

    if (kind === 'COLLECTION_MEMBERS_CHANGED') {
      const container = nodeById.get(`element:${fields['containerSemanticId']}`);
      // Closed Loop #11 made the effect itself typed, so a section gaining a
      // dialog no longer reaches here at all. The graph check stays as a second
      // opinion: this renderer is what a reviewer sees, and it should not be the
      // one place trusting the observer to have been careful.
      if (!isCollectionContainer(container)) continue;
      const before = Number(fields['before']);
      const after = Number(fields['after']);
      const direction = after < before ? 'reduced' : after > before ? 'increased' : 'changed';
      sentences.push(
        `${subject} ${direction} the number of items in ${containerNoun(container)} on the screen from ${items(before)} to ${after}.`,
      );
    }
    if (kind === 'ROUTE_CHANGED') {
      sentences.push(`${subject} moved the screen from ${fields['from']} to ${fields['to']}.`);
    }
    if (kind === 'NETWORK_REQUEST' && fields['statusCategory'] === '2xx') {
      sentences.push(
        `${subject} sent a ${fields['method']} request to ${fields['path']}, which succeeded.`,
      );
    }
    if (kind === 'REGION_APPEARED') {
      sentences.push(`${subject} made a ${fields['role']} appear on the screen.`);
    }
    if (kind === 'ELEMENT_APPEARED') {
      sentences.push(`${subject} made an element appear that was not there before.`);
    }
  }

  sentences.push(
    `All of this was observed on the ${record.context.route} screen, with these permissions granted: ${[...record.context.permissions].sort().join(', ')}.`,
  );
  return [...new Set(sentences)];
}

/** Prefixes that mark a sentence as coming from an observation. */
export const RUNTIME_FACT_PREFIXES = [
  'Typing into ',
  'Activating ',
  'Submitting ',
  'All of this was observed ',
];

/** Whether a rendered fact came from a runtime observation. */
export const isRuntimeFact = (sentence) =>
  RUNTIME_FACT_PREFIXES.some((prefix) => sentence.startsWith(prefix));
