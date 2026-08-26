# 2. Keep the DOM node resolver private to the browser runtime

- **Status:** Accepted
- **Date:** 2026-08-25
- **Supersedes:** the weaker boundary shipped in Day 0

## Context

Statewave Guide's central safety property is that guidance is expressed over registered semantic
elements, never over the DOM:

```ts
highlight('clients.create'); // the only thing any API accepts
click('#app > div:nth-child(4)'); // no API in the system takes this
```

The Day 0 implementation upheld that for hooks and the provider — the React context stored the
registry typed as its public interface, so no component could reach a node.

It did not uphold it at the package boundary. `createElementRegistry()` was exported and declared its
return type as `InternalElementRegistry`, which carries `resolveNode(id): HTMLElement | null`. An
adversarial review built the real declaration output and confirmed it:

```
declare function createElementRegistry(options?): InternalElementRegistry;
interface InternalElementRegistry extends GuideElementRegistry {
    resolveNode(id: string): HTMLElement | null;
}
```

along with a runtime reproduction returning a live `<button>`. `HighlightControllerOptions.registry`
was a second, independent route to the same capability.

So the emitted `.d.ts` contradicted the documentation. That is worse than an undocumented seam: the
project was making a safety claim its own build output disproved.

## Decision

Make the node resolver **private at runtime**, not merely absent from the exported types.

`createElementRegistry()` returns a public read-only facade. The capabilities that must not escape —
`resolveNode`, `register`, `update`, `setNode`, `unregister`, `destroy` — live on a separate internal
object, associated with the facade through a module-private `WeakMap`:

```ts
// registry-internals.ts — not exported from the package index
const internals = new WeakMap<GuideElementRegistry, ElementRegistryInternals>();

export function attachInternals(registry, value): void;
export function internalsOf(registry): ElementRegistryInternals; // throws for a foreign object
```

The provider, the hooks and the highlight engine reach the internals through `internalsOf()`. Nothing
outside the package can, because the WeakMap is not reachable from any export.

## Why a WeakMap rather than simply not exporting the factory

Not exporting `createElementRegistry` would also have closed the leak, and it is simpler. We rejected
it because it closes the wrong thing: the engine genuinely should be constructible by a host wiring it
themselves, and that use case survives into the Vue and Tauri adapters on the roadmap.

The WeakMap keeps the factory public while making the boundary **provable rather than conventional**.
A type-level boundary can only be tested by grepping declarations. A runtime boundary can be tested
directly:

```ts
expect('resolveNode' in registry).toBe(false); // including the prototype chain
```

That distinction matters for a property the whole architecture rests on. A test that asserts a fact
about the emitted `.d.ts` is checking a build artefact; a test that asserts the object does not carry
the capability is checking reality.

## Consequences

**We accept:**

- One indirection on every internal registry access. It is a `WeakMap.get`, and it is not on a render
  path — the provider resolves the internals once.
- `internalsOf()` throws for an object that did not come from `createElementRegistry()`. That is a
  developer error with a clear message, but it is a new failure mode.
- The package must keep its `exports` map narrow, or a deep import could reach
  `registry-internals.js` directly. This is now part of what the boundary tests check.

**We gain:**

- The claim is true as stated, with no seam to caveat in the README.
- `HTMLElement` appears nowhere in the package's exported type graph.
- The boundary is verifiable by test rather than by convention, which means it stays true as the
  package grows.

## Verification

`packages/react/test/dom-boundary.test.ts` proves the boundary four ways: a runtime property check
walking the prototype chain, a recursive value scan of everything reachable from every hook and from
a `GuideActionResult`, a scan of the built `dist/index.d.ts` for `resolveNode` and
`ElementRegistryInternals`, and a check that `internalsOf` rejects a foreign object.
