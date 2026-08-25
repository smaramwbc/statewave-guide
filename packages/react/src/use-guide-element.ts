/**
 * `useGuideElement()` — registers a DOM node under a semantic id.
 *
 * This hook is the join between the three views of the same element: the
 * `data-guide` string the indexer read out of the source, the registration the
 * runtime can reason about, and the live node the guidance engine draws on. It
 * writes the attribute onto the node when it is missing, which is what keeps
 * the indexed model and the running DOM agreeing even for elements a developer
 * marked up only through this hook.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useRef, type RefCallback } from 'react';
import {
  GUIDE_ATTRIBUTE,
  GUIDE_ATTRIBUTES,
  guideElementNamespace,
} from '@statewavedev/guide-shared';
import type { RegisterElementInput } from './element-registry.js';
import { useGuideInternals } from './internal-context.js';

/**
 * Stamps the semantic id onto the node, unless it already declares one.
 *
 * A node that already carries a *different* id is left alone: the developer
 * wrote that attribute on purpose, and silently rewriting it would break the
 * link back to the indexed source.
 *
 * @returns true when this call wrote the attribute, and is therefore the one
 * responsible for taking it off again.
 */
function applyGuideAttribute(
  node: HTMLElement,
  id: string,
  onWarning: (message: string) => void,
): boolean {
  for (const attribute of GUIDE_ATTRIBUTES) {
    const current = node.getAttribute(attribute);
    if (current === null) continue;
    if (current !== id) {
      onWarning(
        `The element registered as "${id}" already declares ${attribute}="${current}" in the DOM. ` +
          `The existing attribute is kept; give the element a single semantic id to remove the ambiguity.`,
      );
    }
    return false;
  }
  node.setAttribute(GUIDE_ATTRIBUTE, id);
  return true;
}

/**
 * Takes back an attribute this hook wrote.
 *
 * Without this a node that outlives an id change keeps advertising the old id,
 * and the registry's DOM fallback happily resolves a semantic id that nothing
 * is registered under any more — a highlight aimed at a dead id would land on a
 * live element. The value is checked first so a node that was re-stamped by
 * something else is left alone.
 */
function releaseGuideAttribute(node: HTMLElement, id: string): void {
  if (node.getAttribute(GUIDE_ATTRIBUTE) === id) node.removeAttribute(GUIDE_ATTRIBUTE);
}

/**
 * Registers an element with the guide and returns the ref to put on the node.
 *
 * @example
 * ```tsx
 * const ref = useGuideElement<HTMLButtonElement>({
 *   id: 'clients.create',
 *   type: 'button',
 *   label: 'New Client',
 * });
 * return <button ref={ref}>New Client</button>;
 * ```
 *
 * @throws if used outside `<StatewaveGuideProvider>`.
 */
export function useGuideElement<T extends HTMLElement = HTMLElement>(
  input: RegisterElementInput,
): RefCallback<T> {
  const { registry, onWarning } = useGuideInternals('useGuideElement()');
  const { id, type, label, description, featureId } = input;

  // The latest-input ref, kept current during render. The ref callback runs
  // before any effect on the very first commit, so it has to be able to read
  // the current props from somewhere that an effect has not written yet.
  const latest = useRef(input);
  latest.current = input;

  const disposeRef = useRef<(() => void) | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const ownsAttributeRef = useRef(false);

  const setRef = useCallback<RefCallback<T>>(
    (node) => {
      if (node) {
        nodeRef.current = node;
        disposeRef.current ??= registry.register(latest.current);
        ownsAttributeRef.current = applyGuideAttribute(node, id, onWarning);
        registry.setNode(id, node);
      } else {
        const previous = nodeRef.current;
        nodeRef.current = null;
        if (previous && ownsAttributeRef.current) releaseGuideAttribute(previous, id);
        ownsAttributeRef.current = false;
        // Detach through the disposer, never through `setNode(id, null)`. The
        // disposer is identity-guarded and drops the node itself; `setNode`
        // resolves by id alone, so a detach arriving after another component
        // has claimed the same id — overlapping mounts, an exit animation,
        // a genuine duplicate — would tear the node off the live registration
        // and take a mounted element out of `visibleElements`.
        disposeRef.current?.();
        disposeRef.current = null;
      }
      // Returns nothing on purpose: React 19 treats a value returned from a ref
      // callback as a cleanup function.
    },
    [registry, id, onWarning],
  );

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const current = registry.get(id);
    // `update()` ignores `undefined` fields by contract, so a metadata prop that
    // went away cannot be cleared through it — the registration would keep
    // describing the element to a model with a label the component no longer
    // has. `type` and `featureId` are patched with their resolved defaults,
    // which leaves only the genuinely optional two needing a re-registration.
    const mustClear =
      current !== undefined &&
      ((label === undefined && current.label !== undefined) ||
        (description === undefined && current.description !== undefined));

    if (current !== undefined && !mustClear) {
      // Metadata changed. Update the registration rather than replacing it, so
      // the element never briefly disappears from `useGuide().elements`.
      registry.update(id, {
        type: type ?? 'other',
        label,
        description,
        featureId: featureId ?? guideElementNamespace(id),
      });
      return;
    }

    // Either a field has to be cleared, or the registration went away
    // underneath us — a StrictMode remount, or a provider that destroyed its
    // registry — while our node stayed attached. Both are rare, which is why
    // re-registering (and so re-observing) is an acceptable price here.
    disposeRef.current?.();
    disposeRef.current = registry.register(latest.current);
    registry.setNode(id, node);
  }, [registry, id, type, label, description, featureId]);

  useEffect(() => {
    return () => {
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, []);

  return setRef;
}
