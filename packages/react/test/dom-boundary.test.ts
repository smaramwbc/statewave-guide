/**
 * Proofs that a live DOM node cannot leave this package.
 *
 * The claim under test is not "the types hide `resolveNode`" — it is that no
 * object a host, a hook or an agent can reach carries node access at all, at
 * runtime, and that the published declaration file says so too. Each test below
 * tries to break that rather than restate it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, useContext, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { GuideActionResult } from '@statewavedev/guide-shared';
import { createElementRegistry, type GuideElementRegistry } from '../src/element-registry.js';
import { internalsOf } from '../src/registry-internals.js';
import { createHighlightController } from '../src/highlight/controller.js';
import { GuideReactContext } from '../src/internal-context.js';
import { GuideElement } from '../src/guide-element.js';
import { StatewaveGuideProvider } from '../src/provider.js';
import { useGuide } from '../src/use-guide.js';
import { useGuideActions } from '../src/use-guide-actions.js';
import { useGuideContext } from '../src/use-guide-context.js';

/** Everything the registry must not carry, own or inherited. */
const FORBIDDEN = ['resolveNode', 'register', 'setNode', 'update', 'unregister', 'destroy'];

/** Every property key reachable on `value`, walking the whole prototype chain. */
function reachableKeys(value: object): Set<string | symbol> {
  const keys = new Set<string | symbol>();
  let current: object | null = value;
  while (current !== null && current !== Object.prototype) {
    for (const key of Reflect.ownKeys(current)) keys.add(key);
    current = Object.getPrototypeOf(current) as object | null;
  }
  return keys;
}

/**
 * Finds a DOM node anywhere reachable from `root` by property traversal.
 *
 * Iterative rather than recursive, because the runtime hangs Zod schemas off
 * the action definitions and those nest deeply. Cycles are cut with a seen-set,
 * and a getter that throws is treated as "nothing there" rather than a failure
 * of the walk.
 *
 * @returns the path to the offending value, or `null` when the graph is clean.
 */
function findDomNode(root: unknown): string | null {
  const seen = new Set<unknown>();
  const stack: { value: unknown; path: string }[] = [{ value: root, path: 'root' }];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) break;
    const { value, path } = entry;

    if (value === null || value === undefined) continue;
    const kind = typeof value;
    if (kind !== 'object' && kind !== 'function') continue;

    if (value instanceof Node || value instanceof HTMLElement) return path;
    // A Window, a Document and a DOMRect are not Nodes but are just as much a
    // handle onto the page.
    if (value === globalThis.window || value === globalThis.document) return path;

    if (seen.has(value)) continue;
    seen.add(value);

    if (value instanceof Map) {
      let index = 0;
      for (const [key, item] of value) {
        stack.push({ value: key, path: `${path}.<mapKey ${index}>` });
        stack.push({ value: item, path: `${path}.<mapValue ${index}>` });
        index += 1;
      }
      continue;
    }
    if (value instanceof Set) {
      let index = 0;
      for (const item of value) {
        stack.push({ value: item, path: `${path}.<setItem ${index}>` });
        index += 1;
      }
      continue;
    }

    for (const key of Object.keys(value as Record<string, unknown>)) {
      let item: unknown;
      try {
        item = (value as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      stack.push({ value: item, path: `${path}.${key}` });
    }
  }

  return null;
}

/** The whole public surface a component can reach, in one render. */
function renderEverything() {
  const wrapper = ({ children }: { children: ReactNode }): ReactNode =>
    createElement(StatewaveGuideProvider, null, children);

  return renderHook(
    () => ({
      guide: useGuide(),
      guideContext: useGuideContext(),
      guideActions: useGuideActions(),
      reactContextValue: useContext(GuideReactContext),
    }),
    { wrapper },
  );
}

function mountedButton(id: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.setAttribute('data-guide', id);
  document.body.appendChild(node);
  return node;
}

describe('the DOM boundary', () => {
  it('does not carry node access, or any mutator, at runtime', () => {
    const registry = createElementRegistry();

    for (const name of FORBIDDEN) {
      // `in` walks the prototype chain, which is the point: a method inherited
      // from a base object would be just as reachable as an own one.
      expect(name in registry, `"${name}" must not be reachable on the registry`).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(registry, name)).toBe(false);
      expect((registry as unknown as Record<string, unknown>)[name]).toBeUndefined();
    }

    // Belt and braces: enumerate the chain by hand and compare sets, so a name
    // hidden behind a non-enumerable definition is caught too.
    const keys = reachableKeys(registry);
    for (const name of FORBIDDEN) expect(keys.has(name)).toBe(false);

    expect([...keys].sort()).toEqual([
      'get',
      'getSnapshot',
      'has',
      'list',
      'subscribe',
      'visibleIds',
    ]);

    // And the registry's prototype is the plain one, so nothing can be added
    // to a shared base later and appear here.
    expect(Object.getPrototypeOf(registry)).toBe(Object.prototype);
  });

  it('hands out no DOM node anywhere in what React can reach', async () => {
    const node = mountedButton('clients.create');
    const { result } = renderEverything();

    await waitFor(() => {
      expect(result.current.guideActions.has('highlight')).toBe(true);
    });

    // A *successful* highlight is the interesting case: the engine is holding
    // the node at that moment, so if anything were going to leak one, it is
    // this result.
    const actionResult: GuideActionResult = await result.current.guide.executeAction({
      action: 'highlight',
      input: { elementId: 'clients.create', scrollIntoView: false },
    });
    expect(actionResult.success).toBe(true);
    expect(document.querySelector('[data-statewave-guide-overlay]')).not.toBeNull();

    // Sanity check on the scanner itself: it must be able to find a node.
    expect(findDomNode({ nested: [{ node }] })).toBe('root.nested.0.node');

    for (const [label, value] of [
      ['useGuide()', result.current.guide],
      ['useGuideContext()', result.current.guideContext],
      ['useGuideActions()', result.current.guideActions],
      ['React context value', result.current.reactContextValue],
      ['GuideActionResult', actionResult],
    ] as const) {
      expect(findDomNode(value), `${label} leaked a DOM node`).toBeNull();
    }
  });

  it('publishes no node access in the built declaration file', () => {
    // From `process.cwd()`, not from `import.meta.url`: under the jsdom
    // environment the module URL is an `http:` one and cannot be resolved to a
    // path. Vitest sets the cwd to the package root.
    const declarations = resolve(process.cwd(), 'dist', 'index.d.ts');

    let source: string;
    try {
      source = readFileSync(declarations, 'utf8');
    } catch {
      // Never pass vacuously. A missing build is a reason to fail loudly, not
      // a reason to skip the one test that reads what consumers actually get.
      throw new Error(
        `${declarations} does not exist, so the published type surface could not be checked. ` +
          `Run \`pnpm build\` in packages/react first; CI builds before it tests.`,
      );
    }

    expect(source).not.toContain('resolveNode');
    expect(source).not.toContain('ElementRegistryInternals');
    expect(source).not.toContain('internalsOf');
    // The rename is part of the same promise: the published vocabulary is
    // `GuideElementState`, and the old name is gone.
    expect(source).not.toContain('RegisteredElement');
    expect(source).toContain('GuideElementState');
  });

  it('leaves no deep import that could reach the private half', () => {
    const root = process.cwd();
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };

    // A wildcard subpath, or an entry pointing anywhere but the bundle, would
    // hand back `registry-internals.js` and undo the whole thing.
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './package.json']);
    expect(manifest.exports['.']).toEqual({
      types: './dist/index.d.ts',
      import: './dist/index.js',
    });

    // And the build is a single bundle, so there is no private module sitting
    // in `dist` for a deep import to find even if the map were widened.
    expect(readdirSync(resolve(root, 'dist')).filter((name) => name.includes('registry'))).toEqual(
      [],
    );
  });

  it('accepts no selector, from any public entry point', async () => {
    const registry = createElementRegistry();
    const controller = createHighlightController({ registry });
    const before = document.body.innerHTML;

    for (const selector of ['#app > div', '#app > div:nth-child(4)', 'input[type="password"]']) {
      const highlighted = await controller.highlight(selector, { scrollIntoView: false });
      expect(highlighted.success).toBe(false);
      if (!highlighted.success) {
        expect(highlighted.error.code).toBe('invalid_input');
        expect(highlighted.error.details).toEqual({ elementId: selector });
      }

      const scrolled = await controller.scrollTo(selector);
      expect(scrolled.success).toBe(false);
      if (!scrolled.success) expect(scrolled.error.code).toBe('invalid_input');
    }

    // Nothing was drawn, nothing was queried, nothing was touched.
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelector('[data-statewave-guide-overlay]')).toBeNull();
    expect(controller.activeId).toBeNull();

    controller.destroy();
  });

  it('parks nothing node-resolving on a React fiber', () => {
    // React keeps every hook's state on the fiber, and links that fiber from
    // the DOM node it rendered — so `node.__reactFiber$…` is a public road from
    // any element on the page into whatever the provider and the hooks above it
    // put in `useState`, `useMemo` or a dependency array. An
    // `ElementRegistryInternals` held in any of those is therefore reachable
    // from host page code, and with it `resolveNode` over the whole document.
    // The friend table is exempt only for as long as nothing memoises what it
    // hands back, which is why this walk exists rather than a comment.
    render(
      createElement(
        StatewaveGuideProvider,
        null,
        createElement(GuideElement, {
          id: 'clients.create',
          type: 'button',
          label: 'New Client',
          children: createElement(
            'button',
            { type: 'button', 'data-testid': 'target' },
            'New Client',
          ),
        }),
      ),
    );

    const node = screen.getByTestId('target');
    // The road is open — this is React's doing, not something we can close.
    expect(Object.keys(node).some((key) => key.startsWith('__reactFiber$'))).toBe(true);

    const hits: string[] = [];
    const seen = new Set<unknown>();
    const stack: { value: unknown; path: string; depth: number }[] = [
      { value: node, path: 'node', depth: 12 },
    ];
    while (stack.length > 0) {
      const entry = stack.pop();
      if (entry === undefined) break;
      const { value, path, depth } = entry;
      if (depth < 0 || value === null || typeof value !== 'object') continue;
      if (seen.has(value)) continue;
      seen.add(value);
      for (const key of Object.keys(value as Record<string, unknown>)) {
        let child: unknown;
        try {
          child = (value as Record<string, unknown>)[key];
        } catch {
          continue;
        }
        if (child === null || typeof child !== 'object') continue;
        const candidate = child as Record<string, unknown>;
        // Duck-typed rather than by identity: the point is that nothing with
        // this shape is reachable, whoever built it.
        if (
          typeof candidate['resolveNode'] === 'function' &&
          typeof candidate['setNode'] === 'function'
        ) {
          hits.push(`${path}.${key}`);
        }
        stack.push({ value: child, path: `${path}.${key}`, depth: depth - 1 });
      }
    }

    expect(hits).toEqual([]);
  });

  it('refuses a foreign registry, with an error that says what to do', () => {
    const impostor: GuideElementRegistry = {
      has: () => false,
      get: () => undefined,
      list: () => [],
      visibleIds: () => [],
      subscribe: () => () => undefined,
      getSnapshot: () => [],
    };

    // Satisfying the public interface is easy. Satisfying it does not, and
    // cannot, come with node access.
    expect(() => internalsOf(impostor)).toThrow(/createElementRegistry\(\)/);
    expect(() => createHighlightController({ registry: impostor })).toThrow(
      /createElementRegistry\(\)/,
    );
  });
});
