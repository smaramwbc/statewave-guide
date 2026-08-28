/**
 * What the interface calls a control, according to the interface.
 *
 * Closed Loop #8 taught the indexer to read visible names out of source, and it
 * did well — eight labels recovered from wrapping `<label>` elements and props
 * proven to reach a text position. It also had to refuse a great deal, because
 * source is a description of what will be rendered and rendering is where names
 * actually happen.
 *
 * A running DOM removes that gap. `element.textContent` is not an inference
 * about what a component might render; it is what is on the screen. That makes
 * the accessibility layer the strongest naming evidence this system has ever
 * had — and it is still **naming** evidence. A button whose accessible name is
 * "Delete" is a button called Delete. ADR 0018's rule holds exactly as written:
 * a label never proves behaviour, at runtime any more than in source.
 *
 * The computation here is a deliberate subset of the ARIA accessible-name
 * algorithm. `aria-labelledby`, `aria-label`, an associated `<label>`, then
 * content — and no `title` attribute, no placeholder, no alt-text guessing. A
 * partial algorithm that refuses is better than a complete one that invents,
 * and the missing branches are recorded rather than silently skipped.
 *
 * @packageDocumentation
 */

import { isSensitiveName } from './redact.js';

/** Where a runtime name came from. */
export type RuntimeNameSource =
  'aria-labelledby' | 'aria-label' | 'label-element' | 'text-content' | 'value';

/** A control's name, as the accessibility tree would report it. */
export interface AccessibleName {
  text: string;
  source: RuntimeNameSource;
}

/** Implicit ARIA roles for the tags this fixture uses. Explicit `role` wins. */
const IMPLICIT_ROLES: ReadonlyMap<string, string> = new Map([
  ['button', 'button'],
  ['a', 'link'],
  ['select', 'combobox'],
  ['textarea', 'textbox'],
  ['table', 'table'],
  ['tr', 'row'],
  ['td', 'cell'],
  ['th', 'columnheader'],
  ['ul', 'list'],
  ['ol', 'list'],
  ['li', 'listitem'],
  ['nav', 'navigation'],
  ['form', 'form'],
  ['dialog', 'dialog'],
  ['h1', 'heading'],
  ['h2', 'heading'],
  ['h3', 'heading'],
  ['section', 'region'],
  ['main', 'main'],
  ['header', 'banner'],
  ['footer', 'contentinfo'],
  ['p', 'paragraph'],
  ['code', 'code'],
  ['span', 'generic'],
  ['div', 'generic'],
]);

/** The role an element reports, explicit first. */
export function roleOf(element: Element): string {
  const explicit = element.getAttribute('role');
  if (explicit !== null && explicit.trim().length > 0) return explicit.trim();

  const tag = element.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'search') return 'searchbox';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    return 'textbox';
  }
  return IMPLICIT_ROLES.get(tag) ?? 'generic';
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The element's accessible name, or nothing.
 *
 * Ordered as the ARIA specification orders it, and stopping where certainty
 * stops. A control with no name returns `undefined`, which is the honest answer
 * and the one Closed Loop #8 built a whole authority layer to be able to give.
 */
export function accessibleNameOf(element: Element): AccessibleName | undefined {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const parts: string[] = [];
    for (const id of labelledBy.split(/\s+/).filter((entry) => entry.length > 0)) {
      const referenced = element.ownerDocument.getElementById(id);
      if (referenced === null) return undefined;
      const text = collapse(referenced.textContent ?? '');
      if (text.length === 0) return undefined;
      parts.push(text);
    }
    if (parts.length > 0) return { text: parts.join(' '), source: 'aria-labelledby' };
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel !== null && collapse(ariaLabel).length > 0) {
    return { text: collapse(ariaLabel), source: 'aria-label' };
  }

  // A `<label for=…>`, or a `<label>` wrapping the control. Both are what a user
  // reads beside the field, and the second is how this fixture writes them.
  const id = element.getAttribute('id');
  if (id !== null) {
    const explicit = element.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (explicit !== null) {
      const text = labelTextExcludingControls(explicit);
      if (text !== undefined) return { text, source: 'label-element' };
    }
  }
  const wrapping = element.closest('label');
  if (wrapping !== null) {
    const text = labelTextExcludingControls(wrapping);
    if (text !== undefined) return { text, source: 'label-element' };
  }

  // Only some roles are named by what they contain.
  //
  // This is ARIA's rule and skipping it produced something worse than a wrong
  // name: `app.shell` named itself
  // "DashboardClientsInvoicesSettingsHelpSettingsOrganisation…sk_live_fixture_0000"
  // — every string on the page concatenated, including a live API key from a
  // `<code>` block four levels down. A container is not named by its contents;
  // a button is. The roles below are the ones the specification says support
  // name-from-content, and a `region`, a `form` and a `generic` are pointedly
  // not among them.
  if (!NAME_FROM_CONTENT.has(roleOf(element))) return undefined;

  // The content of a value element is a value, not a name.
  //
  // This distinction cost a test failure to find, which is the best kind. The
  // fixture renders `<code data-guide="settings.new-key">{rotatedKey}</code>`,
  // and reading its text content as an accessible name put a live API key into
  // an evidence record — through the naming path, which is the one part of this
  // subsystem designed to read text *on purpose*.
  //
  // A `<button>` contains its own name. A `<code>` block contains data the
  // application is displaying. Treating the second as a name is wrong even when
  // the data is harmless: `<code>` showing an order number does not mean the
  // control is called that order number.
  if (VALUE_ELEMENTS.has(element.tagName.toLowerCase())) return undefined;

  // And a belt for the braces. Where the application's own name for a control
  // says it holds a secret, nothing about it is repeated — not even a shape.
  const semantic = element.getAttribute('data-guide') ?? element.getAttribute('data-ai-id') ?? '';
  if (semantic.length > 0 && isSensitiveName(semantic)) return undefined;

  const own = collapse(element.textContent ?? '');
  if (own.length > 0) return { text: own, source: 'text-content' };

  return undefined;
}

/**
 * Elements whose content is data rather than a label.
 *
 * Closed and short. Each of these exists in HTML to display a *value* — a code
 * sample, a computed result, a timestamp — and none of them names the thing it
 * sits in.
 */
/**
 * Roles whose accessible name may be computed from their contents.
 *
 * Straight from the ARIA specification's `nameFrom: contents` list, minus the
 * ones this DOM never produces. Everything else must be named explicitly — by
 * `aria-label`, `aria-labelledby` or an associated `<label>` — or has no name,
 * which is a perfectly good answer and the one Closed Loop #8 built an authority
 * layer to be able to give.
 */
const NAME_FROM_CONTENT: ReadonlySet<string> = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'gridcell',
  'heading',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
]);

const VALUE_ELEMENTS: ReadonlySet<string> = new Set([
  'code',
  'pre',
  'samp',
  'kbd',
  'var',
  'output',
  'time',
  'data',
  'meter',
  'progress',
]);

/**
 * A label's text, with every control inside it removed.
 *
 * Removed rather than skipped: a `<label>` wrapping a `<select>` contains the
 * option text, and a label wrapping an input contains its value once one is
 * typed. Either would make the field name itself change as a user works, which
 * is not what a name is.
 */
function labelTextExcludingControls(label: Element): string | undefined {
  const clone = label.cloneNode(true) as Element;
  for (const candidate of [...clone.querySelectorAll('input, select, textarea, button')]) {
    candidate.remove();
  }
  const text = collapse(clone.textContent ?? '');
  return text.length > 0 ? text : undefined;
}

/** Whether the element is rendered and reachable, as far as jsdom can tell. */
export function isVisible(element: Element): boolean {
  if (element.getAttribute('hidden') !== null) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style !== undefined && (style.display === 'none' || style.visibility === 'hidden')) {
    return false;
  }
  return true;
}

/** Whether the control refuses interaction. */
export function isDisabled(element: Element): boolean {
  if (element.hasAttribute('disabled')) return true;
  return element.getAttribute('aria-disabled') === 'true';
}
