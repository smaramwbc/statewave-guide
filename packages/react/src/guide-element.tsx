/**
 * `<GuideElement>` — the declarative form of {@link useGuideElement}.
 *
 * @packageDocumentation
 */

import {
  Children,
  cloneElement,
  Fragment,
  useCallback,
  useEffect,
  useRef,
  version as reactVersion,
  type ReactElement,
  type Ref,
  type RefCallback,
} from 'react';
import { GUIDE_ATTRIBUTE } from '@statewavedev/guide-shared';
import type { RegisterElementInput } from './element-registry.js';
import { useGuideElement } from './use-guide-element.js';
import { useGuideInternals } from './internal-context.js';

/** Props for {@link GuideElement}. */
export interface GuideElementProps extends RegisterElementInput {
  /**
   * Exactly one child element, and one that can receive a ref.
   *
   * Every intrinsic DOM element can. A custom component must forward its ref to
   * a DOM node — in React 19 by accepting `ref` as a prop, before that with
   * `forwardRef` — or the guide has nothing to point at.
   */
  children: ReactElement;
}

/** React 19 moved `ref` into props and deprecated reading `element.ref`. */
const IS_REACT_19_OR_NEWER = Number.parseInt(reactVersion.split('.')[0] ?? '0', 10) >= 19;

/** What a React 19 ref callback may hand back: nothing, or its own teardown. */
type RefCleanup = (() => void) | undefined;

/** Reads whatever ref the child already had, without tripping React 19's deprecation. */
function readChildRef(child: ReactElement<Record<string, unknown>>): Ref<HTMLElement> | null {
  const fromProps = child.props['ref'];
  if (fromProps !== undefined && fromProps !== null) return fromProps as Ref<HTMLElement>;
  if (IS_REACT_19_OR_NEWER) return null;
  const legacy = (child as unknown as { ref?: Ref<HTMLElement> | null }).ref;
  return legacy ?? null;
}

/**
 * Gives the child's own ref the node, and keeps its cleanup if it returned one.
 *
 * React 19 promises a ref callback that returns a cleanup that it will never be
 * called with `null` — the cleanup is called instead. `cloneElement` replaces
 * the child's ref with ours, so React cannot keep that promise on the child's
 * behalf: {@link detachChildRef} keeps it here.
 */
function attachChildRef(ref: Ref<HTMLElement> | null, node: HTMLElement): RefCleanup {
  if (typeof ref === 'function') {
    const returned: unknown = ref(node);
    return typeof returned === 'function' ? (returned as () => void) : undefined;
  }
  if (ref && typeof ref === 'object') {
    (ref as { current: HTMLElement | null }).current = node;
  }
  return undefined;
}

/** Undoes {@link attachChildRef}: the cleanup if there was one, `null` otherwise. */
function detachChildRef(ref: Ref<HTMLElement> | null, cleanup: RefCleanup): void {
  if (cleanup) {
    cleanup();
    return;
  }
  if (typeof ref === 'function') {
    ref(null);
    return;
  }
  if (ref && typeof ref === 'object') {
    (ref as { current: HTMLElement | null }).current = null;
  }
}

/**
 * Registers its child with the guide and stamps `data-guide` onto it.
 *
 * @example
 * ```tsx
 * <GuideElement id="clients.create" type="button" label="New Client">
 *   <button onClick={createClient}>New Client</button>
 * </GuideElement>
 * ```
 */
export function GuideElement(props: GuideElementProps): ReactElement {
  const { children, ...input } = props;
  const { registry, onWarning } = useGuideInternals('<GuideElement>');
  const guideRef = useGuideElement(input);

  // Resolved without throwing, so the hooks below always run in the same order.
  // A Fragment counts as one child but can never receive a ref, so it is
  // rejected here rather than silently doing nothing.
  const only =
    Children.count(children) === 1
      ? (Children.only(children) as ReactElement<Record<string, unknown>>)
      : null;
  const child = only && only.type !== Fragment ? only : null;
  const childRef = child ? readChildRef(child) : null;

  const nodeRef = useRef<HTMLElement | null>(null);
  const attachedRef = useRef<Ref<HTMLElement> | null>(null);
  const cleanupRef = useRef<RefCleanup>(undefined);
  // Read during render, used by a ref callback that must not change identity.
  const latestChildRef = useRef<Ref<HTMLElement> | null>(childRef);
  latestChildRef.current = childRef;

  // Deliberately stable. `childRef` is a *new* function on every render whenever
  // the child was written with an inline arrow — the common case — so depending
  // on it here would make React detach and re-attach this ref on every parent
  // render. Each detach unregisters the element and each re-attach registers it
  // again, `visibleElements` changes twice, the provider patches the context,
  // every context consumer re-renders, and the whole thing starts over: an
  // unbounded render loop rather than mere churn.
  const composedRef = useCallback<RefCallback<HTMLElement>>(
    (node) => {
      nodeRef.current = node;
      guideRef(node);
      if (node) {
        attachedRef.current = latestChildRef.current;
        cleanupRef.current = attachChildRef(attachedRef.current, node);
        return;
      }
      detachChildRef(attachedRef.current, cleanupRef.current);
      attachedRef.current = null;
      cleanupRef.current = undefined;
    },
    [guideRef],
  );

  // The child's own ref is reconciled here instead, which keeps React's
  // semantics for it: a ref whose identity changed is detached and the new one
  // attached, exactly as React would do if it still owned the child's ref.
  // Nothing here touches the registry, so no amount of ref churn can loop.
  useEffect(() => {
    if (attachedRef.current === childRef) return;
    detachChildRef(attachedRef.current, cleanupRef.current);
    const node = nodeRef.current;
    attachedRef.current = node ? childRef : null;
    cleanupRef.current = node ? attachChildRef(childRef, node) : undefined;
  }, [childRef]);

  const { id } = input;
  useEffect(() => {
    if (registry.get(id)?.mounted === true) return;
    onWarning(
      `<GuideElement id="${id}"> never received a DOM node. Its child must be able to accept a ref: ` +
        `any intrinsic element can, but a custom component has to forward it.`,
    );
  }, [registry, id, onWarning]);

  if (!child) {
    throw new Error(
      only
        ? `<GuideElement id="${id}"> cannot use a Fragment as its child: a Fragment renders no DOM ` +
            `node and cannot receive a ref. Give it a single element instead.`
        : `<GuideElement id="${id}"> expects exactly one child element, and got ` +
            `${Children.count(children)}. Wrap the children in a single element.`,
    );
  }

  return cloneElement(child, { ref: composedRef, [GUIDE_ATTRIBUTE]: id });
}
