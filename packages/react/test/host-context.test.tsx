/**
 * What the guide knows about the application while somebody is asking about it.
 *
 * Two defects, both found only by running the panel in a real browser, and both
 * of the same shape: a question was asked about a screen the query contract
 * could not see.
 *
 * `useHostFocus` exists because opening the panel moves keyboard focus into its
 * composer — so sampling focus at query time answers "the composer", and *"What
 * does this do?"* loses its subject at the moment it is asked.
 *
 * `presentIds` exists because a host that marks its markup with `data-guide` and
 * registers nothing has an empty registry, so the contract received a blank
 * screen and could not tell an ambiguous question from an unsupported one.
 */

import { describe, expect, it } from 'vitest';
import { createElementRegistry } from '../src/element-registry.js';

/** A document with a few semantic elements and one guide-owned control. */
function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('presentIds', () => {
  it('sees elements the host declared and never registered', () => {
    mount(`
      <button data-guide="clients.create">New client</button>
      <button data-guide="clients.export">Export CSV</button>
      <input data-guide="clients.search" />
    `);
    const registry = createElementRegistry({});
    const { visible } = registry.presentIds();
    expect(visible).toEqual(['clients.create', 'clients.export', 'clients.search']);
  });

  it('separates disabled controls from visible ones', () => {
    mount(`
      <button data-guide="clients.create">New client</button>
      <button data-guide="clients.export" disabled>Export CSV</button>
      <button data-guide="clients.refresh" aria-disabled="true">Refresh</button>
    `);
    const { visible, disabled } = createElementRegistry({}).presentIds();
    expect(visible).toEqual(['clients.create']);
    expect(disabled).toEqual(['clients.export', 'clients.refresh']);
  });

  it('ignores an attribute value that is not a semantic id', () => {
    // The same validation `resolveNode` applies. Markup this system does not own
    // must not become product context.
    mount(`<div data-guide="not a valid id!"></div><div data-guide="clients.table"></div>`);
    expect(createElementRegistry({}).presentIds().visible).toEqual(['clients.table']);
  });

  it('reflects the document as it is now, not as it was', () => {
    mount(`<button data-guide="clients.create">New client</button>`);
    const registry = createElementRegistry({});
    expect(registry.presentIds().visible).toEqual(['clients.create']);
    mount(`<button data-guide="clients.export">Export CSV</button>`);
    expect(registry.presentIds().visible).toEqual(['clients.export']);
  });
});

describe('remembered host focus', () => {
  // The hook's rules, exercised through the same logic it uses. A React render
  // is not needed to state what the rules are, and stating them here means a
  // change to them has to be deliberate.
  const semanticIdOf = (node: Element | null): string | undefined => {
    let current: Element | null = node;
    while (current !== null) {
      for (const attribute of ['data-guide', 'data-ai-id']) {
        const value = current.getAttribute?.(attribute);
        if (typeof value === 'string' && value.length > 0) return value;
      }
      current = current.parentElement;
    }
    return undefined;
  };

  it('reads the semantic id from the nearest declaring ancestor', () => {
    mount(`<div data-guide="clients.table"><tr><td><span id="deep">x</span></td></tr></div>`);
    expect(semanticIdOf(document.querySelector('#deep'))).toBe('clients.table');
  });

  it('finds nothing in markup that declares nothing', () => {
    mount(`<div><span id="plain">x</span></div>`);
    expect(semanticIdOf(document.querySelector('#plain'))).toBeUndefined();
  });

  it('treats the panel as not part of the application', () => {
    mount(`<div class="swg-panel"><textarea id="composer"></textarea></div>`);
    const composer = document.querySelector('#composer')!;
    expect(composer.closest('.swg-panel')).not.toBeNull();
    // Guide-owned, so it never becomes product context whatever it declares.
    expect(semanticIdOf(composer)).toBeUndefined();
  });
});
