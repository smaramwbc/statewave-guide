/**
 * Friend access to the element registry.
 *
 * `resolveNode` is the only function in the system that turns a semantic id
 * into a live DOM node. Keeping it off {@link GuideElementRegistry} would hide
 * it from the published types, but a type is not a boundary: anyone holding the
 * object could still reach the method at runtime. So the capability does not
 * live on the object at all. It lives in the module-private {@link WeakMap}
 * below, keyed by the public registry, and the only way to it is
 * {@link internalsOf} — which this package never exports.
 *
 * A WeakMap rather than a private field or a symbol, because the registry is a
 * plain object built by a factory, and because a WeakMap lets the registry be
 * garbage-collected with its internals rather than pinning them.
 *
 * This module is deliberately absent from `src/index.ts`.
 *
 * One rule keeps that true inside React: **never park an
 * {@link ElementRegistryInternals} in `useState`, `useMemo`, `useRef` or a
 * dependency array.** React stores hook state on the fiber and links the fiber
 * from the DOM node it rendered, so anything held there is reachable from the
 * page through `node.__reactFiber$…` — memoising the WeakMap lookup would hand
 * `resolveNode` to any host script holding any element. Call
 * {@link internalsOf} inside the closure that needs it instead; the lookup is a
 * hash probe on paths that run when a node mounts, not on every render.
 * `test/dom-boundary.test.ts` walks a rendered node's fiber tree to hold the
 * line.
 *
 * @packageDocumentation
 */

import type { GuideElementRegistry, RegisterElementInput } from './element-registry.js';

/**
 * The capabilities that must never leave this package.
 *
 * Everything here either mutates the registry or crosses into the DOM. The
 * public {@link GuideElementRegistry} carries none of it.
 */
export interface ElementRegistryInternals {
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
   * the disposer {@link ElementRegistryInternals.register} returned instead:
   * that one is identity-guarded and drops the node itself.
   */
  setNode(id: string, node: HTMLElement | null): void;
  /** Removes a registration. Returns `false` if there was nothing to remove. */
  unregister(id: string): boolean;
  /** The DOM boundary. Reachable only through this module. */
  resolveNode(id: string): HTMLElement | undefined;
  /**
   * One specific instance, by the within-snapshot handle `presentInstances` gave it.
   *
   * Returns nothing when the handle no longer names an element with that semantic
   * id — the list re-rendered, or the screen changed — rather than falling back to
   * the first match. Falling back is how a guide points confidently at the row
   * above the one somebody picked.
   */
  resolveInstanceNode(id: string, ref: string): HTMLElement | undefined;
  /** Disconnects observers and drops every registration. The registry stays usable. */
  destroy(): void;
}

/**
 * The friend table.
 *
 * Module-scoped and never exported, so an entry can only be read through
 * {@link internalsOf}, which only code inside this package can import.
 */
const internals = new WeakMap<GuideElementRegistry, ElementRegistryInternals>();

/**
 * Associates a public registry with its private capabilities.
 *
 * Called once, by `createElementRegistry`. Calling it again for the same
 * registry replaces the association, which nothing in this package does.
 *
 * @internal
 */
export function attachInternals(
  registry: GuideElementRegistry,
  value: ElementRegistryInternals,
): void {
  internals.set(registry, value);
}

/**
 * Reads the private capabilities of a registry created by
 * `createElementRegistry`.
 *
 * @throws a clear Error when the registry did not come from
 * `createElementRegistry()` — a host that hand-rolled a `GuideElementRegistry`
 * to satisfy the type has not, and cannot have, supplied the DOM half.
 *
 * @internal
 */
export function internalsOf(registry: GuideElementRegistry): ElementRegistryInternals {
  const found = internals.get(registry);
  if (found === undefined) {
    throw new Error(
      'This element registry was not created by createElementRegistry(). ' +
        'Statewave Guide keeps DOM resolution in a private side table keyed by the registry ' +
        'object itself, so a registry from anywhere else has no node access to hand out. ' +
        'Pass the value returned by createElementRegistry().',
    );
  }
  return found;
}
