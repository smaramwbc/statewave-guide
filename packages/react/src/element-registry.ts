/**
 * The live registry of mounted semantic elements.
 *
 * This file is where source code meets the running DOM. A `data-guide` string
 * written by a developer is indexed into the Product Model, registered here
 * when the component mounts, and resolved back to a real node when — and only
 * when — the guidance engine needs to draw on it.
 *
 * The asymmetry between {@link GuideElementRegistry} and
 * {@link InternalElementRegistry} is the point of the whole module. The public
 * interface has no method that can hand out an `HTMLElement`; node resolution
 * lives on the internal interface, which is never exported from the package
 * index. An agent addresses elements by semantic id, and raw DOM nodes stop at
 * this boundary.
 *
 * @packageDocumentation
 */

import {
  GUIDE_ATTRIBUTES,
  guideElementNamespace,
  isValidGuideElementId,
  type ProductElementType,
} from '@statewavedev/guide-shared';

/**
 * The public, DOM-free view of a registered element.
 *
 * Every field is a primitive. Nothing here can be used to reach into the page.
 */
export interface RegisteredElement {
  /** Semantic identifier, e.g. `clients.create`. */
  id: string;
  /** What kind of thing this is to a user. */
  type: ProductElementType;
  /** Short human-readable label, usually the visible text. */
  label?: string;
  /** Longer explanation of what the element does. */
  description?: string;
  /** The feature this element belongs to. Defaults to the id's namespace. */
  featureId?: string;
  /** True while the element is mounted AND intersecting the viewport. */
  visible: boolean;
  /** True while a DOM node is attached to the registration. */
  mounted: boolean;
}

/** What a caller supplies when registering an element. */
export interface RegisterElementInput {
  /** Semantic identifier. Must satisfy `isValidGuideElementId`. */
  id: string;
  /** Semantic kind. Defaults to `other`. */
  type?: ProductElementType;
  /** Short human-readable label. */
  label?: string;
  /** Longer explanation, written for a model to read. */
  description?: string;
  /** Owning feature. Defaults to `guideElementNamespace(id)`. */
  featureId?: string;
}

/**
 * The set of guide elements the application currently has on screen.
 *
 * Note what is *not* here: any way to obtain an `HTMLElement`.
 */
export interface GuideElementRegistry {
  /**
   * Registers an element.
   *
   * @returns a disposer that removes this registration.
   * @throws if `id` is not a valid semantic guide id. That is an authoring
   * mistake, and a mistake a developer should see immediately.
   */
  register(input: RegisterElementInput): () => void;
  /** Merges metadata into an existing registration. `undefined` fields are ignored. */
  update(id: string, patch: Partial<Omit<RegisterElementInput, 'id'>>): void;
  /**
   * Attaches or detaches the DOM node for an id. Called by ref callbacks.
   *
   * Addressed by id alone, so `setNode(id, null)` detaches whatever is
   * registered under that id *now* — which is not necessarily the registration
   * the caller attached to. Where two mounts of one id can overlap, detach with
   * the disposer {@link GuideElementRegistry.register} returned instead: that
   * one is identity-guarded and drops the node itself.
   */
  setNode(id: string, node: HTMLElement | null): void;
  /** Removes a registration. Returns `false` if there was nothing to remove. */
  unregister(id: string): boolean;
  /** Whether an element is registered under this id. */
  has(id: string): boolean;
  /** The registration for an id, if there is one. */
  get(id: string): RegisteredElement | undefined;
  /** All registrations, sorted by id. */
  list(): RegisteredElement[];
  /** Ids that are currently mounted and visible, sorted. */
  visibleIds(): string[];
  /** Subscribe to registry changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Immutable snapshot for `useSyncExternalStore`.
   *
   * The identity of the returned array changes only when the registry actually
   * changed. Returning a fresh array on every read would spin React forever.
   */
  getSnapshot(): readonly RegisteredElement[];
  /** Disconnects observers and drops every registration. The registry stays usable. */
  destroy(): void;
}

/**
 * @internal
 *
 * Not exported from the package index, and deliberately so: `resolveNode` is
 * the only function in the system that turns a semantic id into a live DOM
 * node, and the highlight engine is its only consumer. Nothing an agent or a
 * host component can reach returns an `HTMLElement`.
 */
export interface InternalElementRegistry extends GuideElementRegistry {
  /** Resolves a semantic id to the live node backing it, or `null`. */
  resolveNode(id: string): HTMLElement | null;
}

/** Configuration for {@link createElementRegistry}. */
export interface ElementRegistryOptions {
  /** Document to operate on. Defaults to the ambient `document`. Injectable for tests. */
  document?: Document;
  /** Also resolve elements declared only by a `data-guide` attribute in the DOM. Default true. */
  resolveFromDom?: boolean;
  /** Where development warnings go. This package never writes to the console itself. */
  onWarning?: (message: string) => void;
}

/** The mutable record the registry keeps for each element. */
interface Registration {
  id: string;
  type: ProductElementType;
  label: string | undefined;
  description: string | undefined;
  featureId: string;
  node: HTMLElement | null;
  /** Mirrors `node !== null && node.isConnected` as of the last report. */
  mounted: boolean;
  /** Last reported intersection state. */
  intersecting: boolean;
}

/**
 * Builds the public view of a registration.
 *
 * Undefined metadata keys are omitted rather than set to `undefined`, so the
 * value reads cleanly in a debugger and compares cleanly in a test.
 */
function toRegisteredElement(registration: Registration): RegisteredElement {
  const element: RegisteredElement = {
    id: registration.id,
    type: registration.type,
    featureId: registration.featureId,
    mounted: registration.mounted,
    visible: registration.mounted && registration.intersecting,
  };
  if (registration.label !== undefined) element.label = registration.label;
  if (registration.description !== undefined) element.description = registration.description;
  return element;
}

/**
 * Escapes an id for use inside a quoted attribute selector.
 *
 * `resolveNode` has already run the id through `isValidGuideElementId`, which
 * rejects every selector metacharacter — quotes, backslashes, brackets, `>`,
 * whitespace — so nothing that reaches here needs escaping at all. This is the
 * second layer under that one: `CSS.escape` where the environment has it, and a
 * hand-written escape of the two characters that could end a quoted attribute
 * selector where it does not. A jsdom, happy-dom or prerender document supplied
 * through `options.document` frequently has no `CSS` global, and that must not
 * be the difference between a safe query and an injectable one.
 */
function escapeAttributeValue(value: string): string {
  const api: { escape?: (value: string) => string } | undefined =
    typeof CSS === 'undefined' ? undefined : CSS;
  if (typeof api?.escape === 'function') return api.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

/** Creates a {@link InternalElementRegistry}. */
export function createElementRegistry(
  options: ElementRegistryOptions = {},
): InternalElementRegistry {
  const registrations = new Map<string, Registration>();
  const listeners = new Set<() => void>();
  const nodeIds = new Map<Element, string>();

  const resolveFromDom = options.resolveFromDom ?? true;
  const ownerDocument = options.document ?? (typeof document === 'undefined' ? null : document);

  let observer: IntersectionObserver | null = null;
  let snapshot: readonly RegisteredElement[] | null = null;

  function warn(message: string): void {
    options.onWarning?.(message);
  }

  function notify(): void {
    // Copy first: a listener that unsubscribes while being notified must not
    // shift the set out from under the iteration.
    for (const listener of [...listeners]) listener();
  }

  /** Drops the cached snapshot and tells subscribers something moved. */
  function invalidate(): void {
    snapshot = null;
    notify();
  }

  function handleIntersections(entries: IntersectionObserverEntry[]): void {
    let changed = false;
    for (const entry of entries) {
      const id = nodeIds.get(entry.target);
      if (id === undefined) continue;
      const registration = registrations.get(id);
      if (!registration || registration.node !== entry.target) continue;
      if (registration.intersecting === entry.isIntersecting) continue;
      registration.intersecting = entry.isIntersecting;
      changed = true;
    }
    if (changed) invalidate();
  }

  /**
   * Returns the shared observer, creating it on demand.
   *
   * jsdom has no `IntersectionObserver`, and neither does a server render, so
   * everything downstream has to work when this returns `null`.
   */
  function ensureObserver(): IntersectionObserver | null {
    if (typeof IntersectionObserver === 'undefined') return null;
    observer ??= new IntersectionObserver(handleIntersections);
    return observer;
  }

  function detachNode(registration: Registration): void {
    if (registration.node) {
      observer?.unobserve(registration.node);
      nodeIds.delete(registration.node);
    }
    registration.node = null;
    registration.mounted = false;
    registration.intersecting = false;
  }

  function register(input: RegisterElementInput): () => void {
    const { id } = input;
    if (typeof id !== 'string' || !isValidGuideElementId(id)) {
      throw new Error(
        `"${String(id)}" is not a valid Statewave Guide element id. ` +
          `Ids are dot-separated lowercase segments such as "clients.create". ` +
          `CSS selectors and DOM paths are never valid ids.`,
      );
    }

    const existing = registrations.get(id);
    if (existing) {
      warn(
        `Two guide elements are registered as "${id}". The newer registration replaces the older one; ` +
          `semantic ids must be unique across the mounted tree.`,
      );
      detachNode(existing);
    }

    const registration: Registration = {
      id,
      type: input.type ?? 'other',
      label: input.label,
      description: input.description,
      featureId: input.featureId ?? guideElementNamespace(id),
      node: null,
      mounted: false,
      intersecting: false,
    };
    registrations.set(id, registration);
    invalidate();

    return () => {
      // Identity-safe: a stale disposer (React StrictMode double-mounts, and a
      // replaced registration leaves one behind) must never delete the live
      // registration that took its place.
      if (registrations.get(id) !== registration) return;
      detachNode(registration);
      registrations.delete(id);
      invalidate();
    };
  }

  function update(id: string, patch: Partial<Omit<RegisterElementInput, 'id'>>): void {
    const registration = registrations.get(id);
    if (!registration) {
      warn(`Cannot update guide element "${id}": nothing is registered under that id.`);
      return;
    }

    let changed = false;
    if (patch.type !== undefined && patch.type !== registration.type) {
      registration.type = patch.type;
      changed = true;
    }
    if (patch.label !== undefined && patch.label !== registration.label) {
      registration.label = patch.label;
      changed = true;
    }
    if (patch.description !== undefined && patch.description !== registration.description) {
      registration.description = patch.description;
      changed = true;
    }
    if (patch.featureId !== undefined && patch.featureId !== registration.featureId) {
      registration.featureId = patch.featureId;
      changed = true;
    }
    if (changed) invalidate();
  }

  function setNode(id: string, node: HTMLElement | null): void {
    // By id, not by registration identity: the signature carries no handle to
    // check against, which is why `useGuideElement` detaches through the
    // identity-guarded disposer rather than through this function.
    const registration = registrations.get(id);
    // Silently ignored on purpose. React tears a subtree down parent-first, so
    // a ref detaching after its registration was already disposed is a normal
    // ordering, not a mistake worth warning about.
    if (!registration) return;

    const mounted = node !== null && node.isConnected;
    if (registration.node === node && registration.mounted === mounted) return;

    detachNode(registration);

    if (node) {
      registration.node = node;
      registration.mounted = mounted;

      const intersectionObserver = ensureObserver();
      if (intersectionObserver) {
        // With a real observer the element is not considered visible until the
        // observer says so; the first callback arrives within a frame.
        registration.intersecting = false;
        nodeIds.set(node, id);
        intersectionObserver.observe(node);
      } else {
        // Without one — jsdom, a server render — a mounted, connected node is
        // treated as visible.
        registration.intersecting = mounted;
      }
    }

    invalidate();
  }

  function unregister(id: string): boolean {
    const registration = registrations.get(id);
    if (!registration) return false;
    detachNode(registration);
    registrations.delete(id);
    invalidate();
    return true;
  }

  function getSnapshot(): readonly RegisteredElement[] {
    snapshot ??= [...registrations.values()]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(toRegisteredElement);
    return snapshot;
  }

  function resolveNode(id: string): HTMLElement | null {
    // 0. Only a well-formed semantic id gets to look at the document at all.
    //    `register` validates what it stores, but the DOM fallback below exists
    //    precisely for ids that were never registered, and the highlight
    //    engine reaches this function with whatever string `highlight(id)` or
    //    `scrollTo(id)` was handed. This is the check that keeps a selector out
    //    of `querySelector`, so it belongs on this side of the boundary.
    if (typeof id !== 'string' || !isValidGuideElementId(id)) return null;

    // 1. The registration owns a node that is still in the document.
    const registration = registrations.get(id);
    if (registration?.node && registration.node.isConnected) return registration.node;

    // 2. Fall back to an element that declares the id in the DOM only — a
    //    plain `<button data-guide="...">` that was never registered through
    //    React still belongs to the Product Model and is still addressable.
    if (!resolveFromDom || !ownerDocument) return null;
    const value = escapeAttributeValue(id);
    for (const attribute of GUIDE_ATTRIBUTES) {
      const found = ownerDocument.querySelector<HTMLElement>(`[${attribute}="${value}"]`);
      if (found) return found;
    }

    // 3. Nothing on screen carries this id.
    return null;
  }

  return {
    register,
    update,
    setNode,
    unregister,
    has: (id) => registrations.has(id),
    get(id) {
      const registration = registrations.get(id);
      return registration ? toRegisteredElement(registration) : undefined;
    },
    list: () => [...getSnapshot()],
    visibleIds: () =>
      getSnapshot()
        .filter((element) => element.visible)
        .map((element) => element.id),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot,
    destroy() {
      observer?.disconnect();
      observer = null;
      nodeIds.clear();
      registrations.clear();
      invalidate();
    },
    resolveNode,
  };
}
