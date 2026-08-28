/**
 * Remembering what the user was looking at, across the act of asking about it.
 *
 * The defect this exists for is small and completely disabling. A person focuses
 * a control, opens the guide, and asks *"What does this do?"* — and by the time
 * the question is submitted, focus is in the guide's own composer, so the host
 * reports no focused element and the question has no subject. **The act of
 * asking destroys the context the question is about.** Closed Loop #13 shipped
 * that, and its own scenario for the focused path silently exercised the
 * unfocused one instead.
 *
 * So host focus is *remembered* rather than *sampled*. The rules are the whole
 * design:
 *
 *   - only a host element carrying a semantic id ever becomes the remembered
 *     target — the guide's own controls are not product context;
 *   - focus moving into the guide leaves the memory alone, because that
 *     movement is the user reaching for the guide, not changing subject;
 *   - focus landing on a different host element replaces it, because that
 *     movement *is* changing subject;
 *   - a target that leaves the document is forgotten, so a stale id cannot be
 *     answered about after the thing is gone.
 *
 * No selectors. The element is identified by the semantic attribute it already
 * declares, read through the registry's own resolution.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuideElementRegistry } from '../element-registry.js';
import { internalsOf } from '../registry-internals.js';

/** What {@link useHostFocus} needs. */
export interface UseHostFocusOptions {
  registry: GuideElementRegistry;
  /**
   * Test for "this node belongs to the guide, not the application".
   *
   * Defaults to the panel's own container. A host with its own guide chrome may
   * widen it; nothing here inspects styling or position to guess.
   */
  isGuideOwned?: (node: Element) => boolean;
  /** Injectable for tests. */
  document?: Document;
}

const GUIDE_ATTRIBUTES = ['data-guide', 'data-ai-id'];

/** The semantic id an element declares, or the nearest ancestor that declares one. */
function semanticIdOf(node: Element | null): string | undefined {
  let current: Element | null = node;
  while (current !== null) {
    for (const attribute of GUIDE_ATTRIBUTES) {
      const value = current.getAttribute?.(attribute);
      if (typeof value === 'string' && value.length > 0) return value;
    }
    current = current.parentElement;
  }
  return undefined;
}

/**
 * The last host element the user focused, still valid.
 *
 * Returns `undefined` when the user has focused nothing in the application, or
 * when what they focused has since left the page. Both are honest answers to
 * "what is *this*?" and better than the nearest plausible control.
 */
export function useHostFocus(options: UseHostFocusOptions): string | undefined {
  const [remembered, setRemembered] = useState<string | undefined>(undefined);
  const registry = options.registry;
  const rememberedRef = useRef<string | undefined>(undefined);
  rememberedRef.current = remembered;

  const isGuideOwned = useCallback(
    (node: Element): boolean => {
      if (options.isGuideOwned !== undefined) return options.isGuideOwned(node);
      return node.closest?.('.swg-panel') !== null;
    },
    [options],
  );

  useEffect(() => {
    const doc = options.document ?? (typeof document === 'undefined' ? undefined : document);
    if (doc === undefined) return;

    const onFocusIn = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Reaching for the guide is not changing subject. Leave the memory alone.
      if (isGuideOwned(target)) return;
      const id = semanticIdOf(target);
      // Focusing a part of the host that declares nothing is also not a subject.
      // The previous answer stays, rather than being replaced by silence.
      if (id === undefined) return;
      setRemembered(id);
    };

    doc.addEventListener('focusin', onFocusIn);
    return () => doc.removeEventListener('focusin', onFocusIn);
  }, [options.document, isGuideOwned]);

  // A remembered target that has left the page is forgotten. Checked against the
  // registry's own resolution rather than by searching the document.
  useEffect(() => {
    const current = rememberedRef.current;
    if (current === undefined) return;
    const unsubscribe = registry.subscribe(() => {
      const node = internalsOf(registry).resolveNode(current);
      if (node === undefined || node === null) setRemembered(undefined);
    });
    return unsubscribe;
  }, [registry, remembered]);

  return remembered;
}
