/**
 * Saying where something is, without saying what it is.
 *
 * A control the interface never names is still a thing a person can be pointed
 * at — Closed Loop #12 established that an action may address what a sentence
 * may not name. This adds the smaller, safer half: a *description* of where it
 * sits, built from geometry the host measured and membership the runtime
 * observed.
 *
 * Nothing here consults a visual model. Bounding boxes prove "above" and
 * "inside" exactly, and a model's opinion about arithmetic would have to be
 * checked against this anyway. Vision's contribution is noticing groupings;
 * this is the part that never needed it.
 *
 * The interesting rule is which noun a region may be called by. A table of rows
 * is "the list" — generic, and true of anything with members. It becomes "the
 * client list" only when the feature owning that container earned the noun
 * *and* the route establishes it. Both conditions matter: a route noun alone
 * would let an invoice table on a client screen be called the client list, and
 * that sentence is false in the ordinary way a user would notice.
 *
 * Everything produced is transient and additive: removing it changes how an
 * answer reads and never what it asserts.
 *
 * @packageDocumentation
 */

import type { GuideKnowledgeBundle } from './bundle.js';
import { routeMatches } from './bundle.js';
import type { GuideQueryContext, GuideVisualContext } from './contract.js';
import type { ContextualStatement } from './contextual.js';
import { renderContextualSentence, verifyContextualStatement } from './contextual.js';
import { conceptNounsOnRoute } from './instances.js';
import {
  DESCRIPTOR_AUTHORITY,
  describableRuntimeText,
  freshRuntimeLanguage,
} from './runtime-language.js';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Exact spatial relation between two rectangles, or nothing when they overlap. */
export function spatialRelationOf(
  a: Box,
  b: Box,
): 'above' | 'below' | 'left-of' | 'right-of' | 'inside' | undefined {
  const inside =
    a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
  if (inside) return 'inside';
  if (a.y + a.height <= b.y) return 'above';
  if (a.y >= b.y + b.height) return 'below';
  if (a.x + a.width <= b.x) return 'left-of';
  if (a.x >= b.x + b.width) return 'right-of';
  return undefined;
}

/**
 * Roles the runtime reports for something that holds a collection.
 *
 * An allow-list, and the second attempt at this. The first version asked only
 * whether the runtime had observed a *repetition* inside a region, which sounds
 * like the definition of a list and is not: an adversarial audit walked a
 * toolbar button, a card, a table row and a custom-element page wrapper through
 * it, and each was called "the list" because something inside it happened to
 * repeat. Repetition is a property of *content*; being a list is a property of
 * the *element*, and the runtime already reports which element this is.
 *
 * It also fixes the opposite failure, which the same audit found: a client table
 * filtered down to one row stopped being a collection and took Closed Loop #18's
 * sentence with it. A table with one row is still a table.
 *
 * Tag names appear beside ARIA roles because `roleOf` falls back to the tag, so
 * `<ul>` reports "ul" and never "list".
 */
const COLLECTION_ROLES: ReadonlySet<string> = new Set([
  'table',
  'grid',
  'treegrid',
  'list',
  'listbox',
  'tree',
  'feed',
  'menu',
  'menubar',
  'tablist',
  'rowgroup',
  'ul',
  'ol',
  'dl',
  'tbody',
  'select',
]);

/** Whether the runtime reported anything at all inside this region. */
function holdsMembers(context: GuideQueryContext, regionSemanticId: string): boolean {
  return (context.runtimeInstances ?? []).some(
    (instance) => instance.containerSemanticId === regionSemanticId,
  );
}

/**
 * Did the runtime observe a repetition inside this region?
 *
 * Used now only to decide which of a collection's members are its *items* — the
 * things it repeats — because containment is authorised through an item and not
 * through whatever else the collection happens to hold.
 *
 * The definition is not invented here: `resolveRuntimeChoices` already decides
 * what a collection's items are by exactly this test.
 */
function repeatedMembers(context: GuideQueryContext, regionSemanticId: string): Set<string> {
  const counts = new Map<string, number>();
  for (const instance of context.runtimeInstances ?? []) {
    if (instance.containerSemanticId !== regionSemanticId) continue;
    counts.set(instance.semanticId, (counts.get(instance.semanticId) ?? 0) + 1);
  }
  const repeated = new Set<string>();
  for (const [semanticId, count] of counts) if (count > 1) repeated.add(semanticId);
  return repeated;
}

/**
 * May this region be described as containing the target?
 *
 * Being a collection is not enough. A grid root that also holds a toolbar
 * contains that toolbar's buttons — in the document and in the coordinates — and
 * a reader told a button is "inside the list" looks at the rows. So containment
 * is authorised only through the collection itself or through one of the things
 * it repeats:
 *
 *   - the target's nearest marked container **is** the region (a control the
 *     list itself holds, like the Clear button at the top of the invoice list),
 *     or
 *   - the target's nearest marked container is one of the region's repeated
 *     items (a delete button in a table row).
 *
 * A toolbar between the two is neither, which is the whole point.
 */
function mayContain(
  context: GuideQueryContext,
  regionSemanticId: string,
  targetSemanticId: string,
): boolean {
  const containers = context.elementContainers?.[targetSemanticId] ?? [];
  const nearest = containers[0];
  if (nearest === undefined) return false;
  if (nearest === regionSemanticId) return true;
  return repeatedMembers(context, regionSemanticId).has(nearest);
}

function collectionPhrase(
  bundle: GuideKnowledgeBundle,
  context: GuideQueryContext,
  containerSemanticId: string,
): string | undefined {
  // What kind of element this is, as the runtime reports it. Membership is not
  // collection-hood: a page section holds things and is not a list.
  const role = context.elementRoles?.[containerSemanticId];
  if (role === undefined || !COLLECTION_ROLES.has(role)) return undefined;

  const owner = bundle.features.find((feature) =>
    feature.controls.some((control) => control.semanticId === containerSemanticId),
  );
  if (owner === undefined) return 'the list';
  const route = context.route;
  const onRoute =
    route === undefined || owner.routes.some((candidate) => routeMatches(candidate, route));
  if (!onRoute) return 'the list';

  const routeNouns = conceptNounsOnRoute(bundle, context.route);
  const noun = owner.conceptNouns.find((candidate) => routeNouns.has(candidate));
  return noun === undefined ? 'the list' : `the ${noun} list`;
}

/**
 * An ordinary word for what the target currently is.
 *
 * Read from the role the browser reports, which is transient like everything
 * else in a contextual sentence. Closed Loop #17 refused to say "the field"
 * because the *bundle* does not record what kind of thing a control is — and
 * that was the right refusal about the wrong source. The runtime knows.
 */
function nounFor(role: string | undefined): ContextualStatement['targetNoun'] {
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return 'field';
  if (role === 'button') return 'button';
  if (role === 'link') return 'link';
  return 'control';
}

/**
 * A description of the target and its surroundings, when the evidence supports
 * one. Returns nothing rather than something vague: "somewhere on this page"
 * helps nobody and reads like the system knows less than it does.
 */
export function describeVisualContext(input: {
  bundle: GuideKnowledgeBundle;
  context: GuideQueryContext;
  targetSemanticId: string | undefined;
}): GuideVisualContext | undefined {
  const { bundle, context, targetSemanticId } = input;
  if (targetSemanticId === undefined) return undefined;

  // --- geometry ------------------------------------------------------------
  const boxes = context.elementBoxes;
  const target = boxes?.[targetSemanticId];

  /** Containments this screen refused, so a receipt can explain a short sentence. */
  const containmentRefusals: string[] = [];

  let best:
    | {
        phrase: string;
        relation: 'above' | 'below' | 'left-of' | 'right-of' | 'inside';
        authority: 'GENERIC' | 'PRODUCT_NOUN';
        semanticId: string;
        distance: number;
      }
    | undefined;

  if (boxes !== undefined && target !== undefined) {
    for (const [semanticId, box] of Object.entries(boxes)) {
      if (semanticId === targetSemanticId) continue;
      const phrase = collectionPhrase(bundle, context, semanticId);
      if (phrase === undefined) {
        // Worth writing down only for a region that holds something and that the
        // target has a computable relation to — the set that would have produced
        // a sentence before this rule existed. Anything wider is noise about
        // every box on the page.
        if (holdsMembers(context, semanticId) && spatialRelationOf(target, box) !== undefined) {
          const role = context.elementRoles?.[semanticId] ?? 'nothing';
          containmentRefusals.push(
            `${semanticId} holds members but reports ${role}, so it is not described as a collection`,
          );
        }
        continue;
      }
      const relation = spatialRelationOf(target, box);
      // Coordinates cannot tell containment from overlap. A dialog rendered over
      // the client table sits exactly inside its rectangle and is not in it, so
      // `inside` is only allowed when the document agrees — and where it does
      // not, the overlap is not silently downgraded to "above", it is dropped.
      if (relation === 'inside') {
        const containers = context.elementContainers?.[targetSemanticId] ?? [];
        if (!containers.includes(semanticId)) continue;
        // Structural containment is not the containment a person perceives. A
        // wrapper holding a toolbar and a table contains the toolbar's buttons
        // in the document and in the coordinates, and a reader told one of them
        // is "inside the list" will look in the wrong half of the screen.
        if (!mayContain(context, semanticId, targetSemanticId)) {
          containmentRefusals.push(
            `${targetSemanticId} is inside ${semanticId} in the document but is neither one of its items nor held by it directly`,
          );
          continue;
        }
      } else if (relation === undefined) {
        continue;
      }
      const distance = Math.abs(box.y - target.y) + Math.abs(box.x - target.x);
      if (best === undefined || distance < best.distance) {
        best = {
          phrase,
          relation,
          authority: phrase === 'the list' ? 'GENERIC' : 'PRODUCT_NOUN',
          semanticId,
          distance,
        };
      }
    }
  }

  // --- words the interface is showing --------------------------------------
  const fresh = freshRuntimeLanguage({
    language: context.runtimeVisibleLanguage,
    semanticId: targetSemanticId,
    route: context.route,
    snapshotId: context.snapshotId,
    visibleSemanticIds: context.visibleSemanticIds,
  });
  const describable = describableRuntimeText(fresh);

  // A sentence that was refused still owes an explanation. Returning nothing at
  // all leaves "why is there no location here?" answerable only by re-deriving
  // it, which is the thing receipts exist to avoid.
  if (best === undefined && describable === undefined && containmentRefusals.length === 0) {
    return undefined;
  }

  const statement: ContextualStatement = {
    targetSemanticId,
    targetNoun: nounFor(context.elementRoles?.[targetSemanticId]),
    ...(best === undefined
      ? {}
      : {
          relation: {
            kind: best.relation,
            regionSemanticId: best.semanticId,
            regionPhrase: best.phrase,
            regionAuthority: best.authority,
          },
        }),
    ...(describable === undefined
      ? {}
      : {
          visibleText: {
            text: describable.text,
            sourceKind: describable.sourceKind,
            form:
              DESCRIPTOR_AUTHORITY[describable.sourceKind] === 'SHOWING' ? 'SHOWING' : 'SHOWING',
          },
        }),
    occludedByGuide: (context.occludedSemanticIds ?? []).includes(targetSemanticId),
    route: context.route,
    snapshotId: context.snapshotId,
  };

  // --- and only then, a sentence -------------------------------------------
  const { receipt, statement: verified } = verifyContextualStatement({
    statement,
    visibleSemanticIds: context.visibleSemanticIds,
    snapshotId: context.snapshotId,
    route: context.route,
    freshTextSnapshotIds: fresh.map((entry) => entry.snapshotId),
    textTrust: describable?.trust ?? 'NONE',
    textPrivacy: describable === undefined ? 'NOT_APPLICABLE' : describable.privacyClass,
    relationProof:
      best === undefined ? 'NONE' : best.relation === 'inside' ? 'DOCUMENT' : 'GEOMETRY',
    containmentRefusals,
  });

  if (verified === undefined) return { receipt };

  const geometryOnly = renderContextualSentence(verified, 'GEOMETRY_ONLY');
  const withVisibleText = renderContextualSentence(verified, 'WITH_VISIBLE_TEXT');
  const where =
    verified.relation === undefined
      ? undefined
      : verified.relation.kind === 'inside'
        ? `inside ${verified.relation.regionPhrase}`
        : verified.relation.kind === 'above'
          ? `directly above ${verified.relation.regionPhrase}`
          : verified.relation.kind === 'below'
            ? `directly below ${verified.relation.regionPhrase}`
            : `${verified.relation.kind.replace('-', ' ')} ${verified.relation.regionPhrase}`;

  return {
    ...(where === undefined ? {} : { targetDescription: where }),
    ...(verified.relation === undefined
      ? {}
      : { regionDescription: verified.relation.regionPhrase }),
    sentences: {
      ...(geometryOnly === undefined ? {} : { geometryOnly }),
      ...(withVisibleText === undefined ? {} : { withVisibleText }),
    },
    receipt,
  };
}
