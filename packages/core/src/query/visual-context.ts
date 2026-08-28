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
 * What a container may be called, when the runtime proves it holds members.
 *
 * Returns `the list` for any observed collection, and a named list only when
 * the container's owning feature and the current route agree on the noun.
 */
function collectionPhrase(
  bundle: GuideKnowledgeBundle,
  context: GuideQueryContext,
  containerSemanticId: string,
): string | undefined {
  // Membership is runtime-observed, never inferred from a shape on screen.
  const hasMembers = (context.runtimeInstances ?? []).some(
    (instance) => instance.containerSemanticId === containerSemanticId,
  );
  if (!hasMembers) return undefined;

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
      if (phrase === undefined) continue;
      const relation = spatialRelationOf(target, box);
      // Coordinates cannot tell containment from overlap. A dialog rendered over
      // the client table sits exactly inside its rectangle and is not in it, so
      // `inside` is only allowed when the document agrees — and where it does
      // not, the overlap is not silently downgraded to "above", it is dropped.
      if (relation === 'inside') {
        const containers = context.elementContainers?.[targetSemanticId] ?? [];
        if (!containers.includes(semanticId)) continue;
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

  if (best === undefined && describable === undefined) return undefined;

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
