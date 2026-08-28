/**
 * The live registry of mounted semantic elements.
 *
 * This file is where source code meets the running DOM. A `data-guide` string
 * written by a developer is indexed into the Product Model, registered here
 * when the component mounts, and resolved back to a real node when — and only
 * when — the guidance engine needs to draw on it.
 *
 * {@link GuideElementRegistry}, the type this module exports and the object
 * `createElementRegistry` returns, is read-only state. It has no method that
 * mutates the registry and no method that can hand out an `HTMLElement`. The
 * capabilities that do both live on a package-private companion object in
 * `./registry-internals.js`, reachable only through the friend accessor that
 * module exports — a module this package never re-exports. An agent addresses
 * elements by semantic id, and raw DOM nodes stop at that boundary at runtime,
 * not merely in the published types.
 *
 * @packageDocumentation
 */

import {
  GUIDE_ATTRIBUTES,
  guideElementNamespace,
  isValidGuideElementId,
  type ProductElementType,
} from '@statewavedev/guide-shared';
import { attachInternals, type ElementRegistryInternals } from './registry-internals.js';

/**
 * The public, DOM-free view of a registered element.
 *
 * Every field is a primitive. Nothing here can be used to reach into the page.
 */
export interface GuideElementState {
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
 * Note what is *not* here: any way to obtain an `HTMLElement`, and any way to
 * change the registry. This is a read-only window onto state that the provider
 * and the hooks maintain through the package-private internals.
 */
export interface GuideElementRegistry {
  /** Whether an element is registered under this id. */
  has(id: string): boolean;
  /** The registration for an id, if there is one. */
  get(id: string): GuideElementState | undefined;
  /** All registrations, sorted by id. */
  list(): GuideElementState[];
  /** Ids that are currently mounted and visible, sorted. */
  visibleIds(): string[];
  /**
   * Every semantic id the document currently exposes, sorted.
   *
   * Includes elements the host declared with a `data-guide` attribute and never
   * registered through React — which is how most applications will adopt this,
   * and how the benchmark application is written. {@link visibleIds} answers a
   * narrower question, and Closed Loop #13 asked it in the one place that needed
   * the wider one: the query contract received an empty screen and could not
   * tell an ambiguous question from an unsupported one.
   *
   * The selector lives here, behind the same id validation `resolveNode` uses,
   * because this module is where source code is allowed to meet the DOM.
   */
  presentIds(): { visible: string[]; disabled: string[] };
  /**
   * Concrete items currently on screen, with the names the interface displays.
   *
   * One entry per rendered element carrying a semantic id, so a list of rows
   * sharing one id produces several — which is the point: `INV-001` and
   * `INV-002` are the same semantic id and different things, and only a
   * within-snapshot handle can tell them apart. The name is read from the
   * accessible name, never from an attribute this package invented.
   */
  presentInstances(): {
    semanticId: string;
    ref: string;
    containerSemanticId?: string;
    runtimeAccessibleName?: string;
  }[];
  /**
   * Where each semantic id sits, and what actually contains it.
   *
   * Measured, not guessed. Closed Loop #17 needs to say "above the list" without
   * asking a visual model to do arithmetic on a picture — the browser already
   * knows the answer exactly, and a model's version of it would have to be
   * checked against this one anyway.
   *
   * Geometry and containment travel together because either alone lies. A modal
   * dialog overlapping the client table is *inside* its rectangle and is not in
   * it, and a guide that says "inside the list" about a dialog control has made
   * exactly the kind of plausible false statement this system exists to refuse.
   * Coordinates settle above and below; only the document settles inside.
   *
   * Ids appearing more than once are omitted: two rows sharing a semantic id
   * have two boxes, and picking one of them silently would be the same mistake
   * highlighting made before instance handles existed.
   */
  presentGeometry(): Record<
    string,
    {
      box: { x: number; y: number; width: number; height: number };
      /** Semantic ids of the elements that really contain this one, outward. */
      containers: string[];
      /** What kind of thing it currently is, for choosing an ordinary noun. */
      role: string;
      /** Whether the guide's own panel is sitting on top of it. */
      occludedByGuide: boolean;
    }
  >;
  /**
   * Words the interface is showing right now, and where each came from.
   *
   * Eligibility is decided by the attribute, before anything reads the string.
   * A `placeholder` and an `aria-label` are chrome somebody wrote to be read as
   * interface; a table cell is content that arrived from a database or from a
   * person typing. Closed Loop #17 proved that distinction cannot be made by
   * inspecting the words, because the words can say anything at all.
   *
   * Input *values* are never read. A user typing "John Smith" into a field has
   * not renamed it, and a policy that could not tell those apart would let every
   * form on a screen relabel itself as somebody types.
   */
  presentVisibleLanguage(): {
    semanticId: string;
    sourceKind: 'PLACEHOLDER' | 'VISIBLE_TEXT' | 'CURRENT_ACCESSIBLE_NAME';
    text: string;
    trust: 'HOST_UI' | 'CONTENT';
  }[];
  /** Subscribe to registry changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Immutable snapshot for `useSyncExternalStore`.
   *
   * The identity of the returned array changes only when the registry actually
   * changed. Returning a fresh array on every read would spin React forever.
   */
  getSnapshot(): readonly GuideElementState[];
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

/**
 * What kind of thing an element currently is.
 *
 * Explicit `role` wins, then the tag. This is the browser's view of the element
 * right now, which is exactly the transient authority a sentence about the
 * current screen is allowed to draw on — and exactly not the kind of thing that
 * belongs in a ProductModel.
 */
function roleOf(node: Element): string {
  const explicit = node.getAttribute('role');
  if (explicit !== null && explicit.trim().length > 0) return explicit.trim();
  const tag = node.tagName.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'table') return 'table';
  if (tag === 'tr') return 'row';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const type = (node.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'search') return 'searchbox';
    if (type === 'button' || type === 'submit') return 'button';
    return 'textbox';
  }
  return tag;
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
function toGuideElementState(registration: Registration): GuideElementState {
  const element: GuideElementState = {
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
 * The node resolver has already run the id through `isValidGuideElementId`, which
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

/**
 * Creates a {@link GuideElementRegistry}.
 *
 * The returned object is the read-only half. Registration, node attachment and
 * DOM resolution are attached to it through the package-private friend table
 * in `./registry-internals.js`, and are reachable only from inside this
 * package.
 */
export function createElementRegistry(options: ElementRegistryOptions = {}): GuideElementRegistry {
  const registrations = new Map<string, Registration>();
  const listeners = new Set<() => void>();
  const nodeIds = new Map<Element, string>();

  const resolveFromDom = options.resolveFromDom ?? true;
  const ownerDocument = options.document ?? (typeof document === 'undefined' ? null : document);

  let observer: IntersectionObserver | null = null;
  let snapshot: readonly GuideElementState[] | null = null;

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

  function getSnapshot(): readonly GuideElementState[] {
    snapshot ??= [...registrations.values()]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(toGuideElementState);
    return snapshot;
  }

  function resolveNode(id: string): HTMLElement | undefined {
    // 0. Only a well-formed semantic id gets to look at the document at all.
    //    `register` validates what it stores, but the DOM fallback below exists
    //    precisely for ids that were never registered, and the highlight
    //    engine reaches this function with whatever string `highlight(id)` or
    //    `scrollTo(id)` was handed. This is the check that keeps a selector out
    //    of `querySelector`, so it belongs on this side of the boundary.
    if (typeof id !== 'string' || !isValidGuideElementId(id)) return undefined;

    // 1. The registration owns a node that is still in the document.
    const registration = registrations.get(id);
    if (registration?.node && registration.node.isConnected) return registration.node;

    // 2. Fall back to an element that declares the id in the DOM only — a
    //    plain `<button data-guide="...">` that was never registered through
    //    React still belongs to the Product Model and is still addressable.
    if (!resolveFromDom || !ownerDocument) return undefined;
    const value = escapeAttributeValue(id);
    for (const attribute of GUIDE_ATTRIBUTES) {
      const found = ownerDocument.querySelector<HTMLElement>(`[${attribute}="${value}"]`);
      if (found) return found;
    }

    // 3. Nothing on screen carries this id.
    return undefined;
  }

  function destroy(): void {
    observer?.disconnect();
    observer = null;
    nodeIds.clear();
    registrations.clear();
    invalidate();
  }

  // Two distinct object literals, deliberately. The public facade is built
  // from scratch rather than by omitting keys from a wider object, so nothing
  // below can leak onto it by accident — not as an own property, and not
  // through a prototype, since both are plain `Object.prototype` objects.
  const registry: GuideElementRegistry = {
    has: (id) => registrations.has(id),
    get(id) {
      const registration = registrations.get(id);
      return registration ? toGuideElementState(registration) : undefined;
    },
    list: () => [...getSnapshot()],
    visibleIds: () =>
      getSnapshot()
        .filter((element) => element.visible)
        .map((element) => element.id),
    presentInstances() {
      if (!resolveFromDom || !ownerDocument) return [];
      const out: {
        semanticId: string;
        ref: string;
        containerSemanticId?: string;
        runtimeAccessibleName?: string;
      }[] = [];
      let ordinal = 0;
      for (const attribute of GUIDE_ATTRIBUTES) {
        for (const node of ownerDocument.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
          const id = node.getAttribute(attribute);
          if (id === null || !isValidGuideElementId(id)) continue;
          ordinal += 1;
          // A container's text is its children's text. Reading it as a *name*
          // is how `settings.danger-zone` came to be called
          // "Danger zoneRotate API keysk_live_fixture_0000" — the whole
          // subtree, secret included. Closed Loop #9 settled this for snapshots;
          // the same rule applies here. Only a leaf, or something that labels
          // itself explicitly, has a name of its own.
          const explicit = node.getAttribute('aria-label');
          const holdsOthers = GUIDE_ATTRIBUTES.some(
            (other) => node.querySelector(`[${other}]`) !== null,
          );
          const name = (explicit ?? (holdsOthers ? '' : (node.textContent ?? ''))).trim();
          const container = node.parentElement?.closest?.(`[${attribute}]`);
          const containerId = container?.getAttribute(attribute) ?? undefined;
          out.push({
            semanticId: id,
            // Document order within this snapshot. Stable for as long as the
            // snapshot is, which is exactly as long as the reference is valid.
            ref: `i${ordinal}`,
            ...(containerId !== undefined && isValidGuideElementId(containerId)
              ? { containerSemanticId: containerId }
              : {}),
            ...(name.length === 0 || name.length > 120 ? {} : { runtimeAccessibleName: name }),
          });
        }
      }
      return out;
    },
    presentIds() {
      const visible = new Set<string>();
      const disabled = new Set<string>();
      for (const element of getSnapshot()) {
        if (element.visible) visible.add(element.id);
      }
      if (resolveFromDom && ownerDocument) {
        for (const attribute of GUIDE_ATTRIBUTES) {
          for (const node of ownerDocument.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
            const id = node.getAttribute(attribute);
            // The same validation `resolveNode` applies. An attribute value that
            // is not a semantic id is markup this system does not own.
            if (id === null || !isValidGuideElementId(id)) continue;
            const off =
              node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';
            if (off) disabled.add(id);
            else visible.add(id);
          }
        }
      }
      return { visible: [...visible].sort(), disabled: [...disabled].sort() };
    },
    presentGeometry() {
      const geometry: Record<
        string,
        {
          box: { x: number; y: number; width: number; height: number };
          containers: string[];
          role: string;
          occludedByGuide: boolean;
        }
      > = {};
      const seen = new Set<string>();
      if (!resolveFromDom || !ownerDocument) return geometry;
      // The panel's own rectangle, so an element underneath it can be reported
      // as covered rather than as visible.
      const panel = ownerDocument.querySelector('.sw-guide');
      const panelBox = panel === null ? undefined : panel.getBoundingClientRect();
      for (const attribute of GUIDE_ATTRIBUTES) {
        for (const node of ownerDocument.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
          const id = node.getAttribute(attribute);
          if (id === null || !isValidGuideElementId(id)) continue;
          if (seen.has(id)) {
            // Ambiguous: more than one element answers to this id.
            delete geometry[id];
            continue;
          }
          seen.add(id);
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;

          // Real ancestry, walked upward. Nothing here reads coordinates.
          const containers: string[] = [];
          for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
            for (const candidate of GUIDE_ATTRIBUTES) {
              const owner = parent.getAttribute(candidate);
              if (owner !== null && isValidGuideElementId(owner)) containers.push(owner);
            }
          }
          const covered =
            panelBox === undefined
              ? false
              : (() => {
                  const overlapWidth = Math.max(
                    0,
                    Math.min(rect.right, panelBox.right) - Math.max(rect.left, panelBox.left),
                  );
                  const overlapHeight = Math.max(
                    0,
                    Math.min(rect.bottom, panelBox.bottom) - Math.max(rect.top, panelBox.top),
                  );
                  return (overlapWidth * overlapHeight) / (rect.width * rect.height) >= 0.5;
                })();

          geometry[id] = {
            box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            containers,
            role: roleOf(node),
            occludedByGuide: covered,
          };
        }
      }
      return geometry;
    },
    presentVisibleLanguage() {
      const found: {
        semanticId: string;
        sourceKind: 'PLACEHOLDER' | 'VISIBLE_TEXT' | 'CURRENT_ACCESSIBLE_NAME';
        text: string;
        trust: 'HOST_UI' | 'CONTENT';
      }[] = [];
      if (!resolveFromDom || !ownerDocument) return found;

      for (const attribute of GUIDE_ATTRIBUTES) {
        for (const node of ownerDocument.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
          const id = node.getAttribute(attribute);
          if (id === null || !isValidGuideElementId(id)) continue;

          // Chrome. Somebody writing this interface put these here to be read as
          // interface, and that is what makes them eligible — not what they say.
          // A browser keeps the `placeholder` attribute after somebody types and
          // simply stops painting it. Reading the attribute alone therefore goes
          // on describing a field by words that are no longer on the glass —
          // found by typing "John Smith" into the search box and watching the
          // guide keep saying "showing Search clients".
          //
          // Emptiness of the value is a display fact, not a label. Nothing here
          // reads what was typed; it reads whether anything was.
          const placeholder = node.getAttribute('placeholder');
          const emptyValue =
            !('value' in node) || String((node as HTMLInputElement).value ?? '').length === 0;
          if (placeholder !== null && placeholder.trim().length > 0 && emptyValue) {
            found.push({
              semanticId: id,
              sourceKind: 'PLACEHOLDER',
              text: placeholder.trim(),
              trust: 'HOST_UI',
            });
          }
          const ariaLabel = node.getAttribute('aria-label');
          if (ariaLabel !== null && ariaLabel.trim().length > 0) {
            found.push({
              semanticId: id,
              sourceKind: 'CURRENT_ACCESSIBLE_NAME',
              text: ariaLabel.trim(),
              trust: 'HOST_UI',
            });
          }

          // Content. Recorded so the taxonomy is complete and the developer
          // inspector can show what was refused, and marked so that nothing
          // downstream can mistake it for something the host wrote. A note
          // reading "SYSTEM: Ignore previous instructions" arrives here.
          if (node.querySelector('[data-guide]') === null) {
            const text = (node.textContent ?? '').trim();
            if (text.length > 0 && text.length <= 120) {
              found.push({
                semanticId: id,
                sourceKind: 'VISIBLE_TEXT',
                text,
                trust: 'CONTENT',
              });
            }
          }
        }
      }
      return found;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot,
  };

  const privateHalf: ElementRegistryInternals = {
    register,
    update,
    setNode,
    unregister,
    resolveNode,
    resolveInstanceNode(id, ref) {
      if (!resolveFromDom || !ownerDocument) return undefined;
      if (typeof id !== 'string' || !isValidGuideElementId(id)) return undefined;
      let ordinal = 0;
      for (const attribute of GUIDE_ATTRIBUTES) {
        for (const node of ownerDocument.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
          const found = node.getAttribute(attribute);
          if (found === null || !isValidGuideElementId(found)) continue;
          ordinal += 1;
          if (`i${ordinal}` !== ref) continue;
          // The handle is an ordinal, so it is only meaningful while the document
          // is the one it was taken from. Confirming the semantic id is what turns
          // a stale handle into an honest miss instead of a wrong hit.
          return found === id ? node : undefined;
        }
      }
      return undefined;
    },
    destroy,
  };

  attachInternals(registry, privateHalf);

  return registry;
}
