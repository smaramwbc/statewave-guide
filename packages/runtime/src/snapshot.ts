/**
 * What the application looks like at one moment, recorded as evidence.
 *
 * A snapshot is deliberately dumb. It says *an element with this semantic id has
 * this role, this accessible name, and is enabled* — and says nothing about what
 * any of it means. Meaning is decided later, by rules, against effects; this
 * layer exists so that those rules have something to be decided against.
 *
 * Two properties matter more than completeness.
 *
 * **It is deterministic.** The same fixture in the same state produces the same
 * snapshot, byte for byte. Nothing here reads a clock, a random id, a pixel or
 * a DOM ordering that is not document order. A capability proved by comparing
 * two snapshots is only as trustworthy as the snapshots' stability, and an
 * evidence record that differs between runs cannot support anything.
 *
 * **It carries no content.** Values are shapes (`redact.ts`), never text. What a
 * user typed is theirs; that a twelve-character string was present is the
 * application's, and it is also all any rule here needs.
 *
 * @packageDocumentation
 */

import { accessibleNameOf, isDisabled, isVisible, roleOf } from './accessibility.js';
import type { AccessibleName } from './accessibility.js';
import { describeRedacted, redactValue } from './redact.js';

/** The attribute an application uses to name a control for this system. */
export const GUIDE_ATTRIBUTES = ['data-guide', 'data-ai-id'] as const;

/** One rendered element, as evidence. */
export interface ObservedElement {
  /** The semantic id, when the application declares one. */
  semanticId?: string;
  /** Which attribute declared it. */
  attribute?: string;
  /** A stable within-snapshot handle, assigned in document order. */
  ref: string;
  tagName: string;
  role: string;
  accessibleName?: AccessibleName;
  /** `type` for inputs. Absent otherwise. */
  inputType?: string;
  visible: boolean;
  disabled: boolean;
  /** The current value, as a shape. Never as content. */
  value?: string;
  /**
   * Whether the element declares itself selected, when it declares anything.
   *
   * `undefined` means the element says nothing about selection — which is not
   * the same as saying it is unselected, and the difference is the whole reason
   * Closed Loop #11 exists. A row that never mentions `aria-selected` has no
   * selection state to observe, and a rule that treats its silence as `false`
   * has invented the very evidence it is supposed to be checking.
   *
   * Read from ARIA and from native form state only. A CSS class such as
   * `is-active` is an implementation detail, not something the interface tells
   * anybody, and Closed Loop #8 already settled that identifiers are not
   * user-visible evidence.
   */
  selected?: boolean;
  /** The descendant a composite widget declares active, when it declares one. */
  activeDescendant?: string;
  /** The nearest ancestor that carries a semantic id. */
  semanticParent?: string;
  /** Semantic ids of ancestors, outermost first. */
  semanticAncestry: readonly string[];
}

/**
 * What an element says about being selected, or nothing.
 *
 * Three deterministic sources, in the order an assistive technology would take
 * them: the explicit ARIA declaration, the native `<option>` property, and the
 * checked state of controls whose checkedness *is* their selection. Anything
 * else — a class, a colour, a data attribute — is not a declaration and is not
 * read here.
 */
function selectionState(element: Element): boolean | undefined {
  const aria = element.getAttribute('aria-selected');
  if (aria === 'true') return true;
  if (aria === 'false') return false;

  if (element instanceof HTMLOptionElement) return element.selected;

  const checked = element.getAttribute('aria-checked');
  if (checked === 'true') return true;
  if (checked === 'false') return false;

  const role = element.getAttribute('role') ?? '';
  const tag = element.tagName.toLowerCase();
  const type = element instanceof HTMLInputElement ? element.type : '';
  const checkable =
    role === 'radio' ||
    role === 'menuitemradio' ||
    role === 'menuitemcheckbox' ||
    (tag === 'input' && (type === 'radio' || type === 'checkbox'));
  if (checkable && element instanceof HTMLInputElement) return element.checked;

  return undefined;
}

/** The descendant a composite widget declares active, if it declares one. */
function activeDescendantOf(element: Element): string | undefined {
  const value = element.getAttribute('aria-activedescendant');
  return value === null || value.trim().length === 0 ? undefined : value;
}

/** A rendered structural group. Existence only — never purpose. */
export interface ObservedRegion {
  ref: string;
  role: string;
  semanticId?: string;
  /** The region's own heading, when it has one. */
  heading?: string;
  /** Refs of the elements rendered inside it. */
  contains: readonly string[];
}

/** What a screen calls itself, in the interface rather than in the code. */
export interface ObservedScreenName {
  text: string;
  source: 'heading' | 'landmark-label' | 'document-title';
}

/** The state of the application at one moment. */
export interface RuntimeEvidenceSnapshot {
  version: 1;
  /** Identifies this snapshot within a session. Deterministic, not a clock. */
  snapshotId: string;
  route: string;
  screenNames: readonly ObservedScreenName[];
  elements: readonly ObservedElement[];
  regions: readonly ObservedRegion[];
  /** The graph this run is being correlated against. */
  sourceGraphHash?: string;
  /** What was true of the world when this was taken. */
  context: RuntimeContext;
}

/**
 * The circumstances one observation was made under.
 *
 * A single run proves what happened *in that run*. A button observed disabled
 * says nothing about whether it is always disabled, and a capability recovered
 * under one permission set is not a capability everyone has. Recording the
 * context is what stops a snapshot becoming a universal claim — see ADR 0019.
 *
 * `permissions` is a list of permission strings and nothing more. A role is not
 * inferred from it: holding `clients:update` does not make anybody an account
 * manager, which Closed Loop #7 established at some cost.
 */
export interface RuntimeContext {
  route: string;
  fixtureState: string;
  permissions: readonly string[];
  featureFlags: Readonly<Record<string, boolean>>;
}

const INTERACTIVE = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'menuitem',
  'tab',
  'switch',
]);

/**
 * Roles whose text is the application's data rather than a control's name.
 *
 * ARIA computes a name from the contents of a `cell` and a `row`, and for a
 * screen reader that is right — a user needs to hear what is in the row. For an
 * *evidence record* it is wrong twice over. It is not naming evidence: nothing
 * about "Acme Corp" tells us what any control is called. And it is somebody's
 * customer list, written to a file that outlives the run.
 *
 * Found by a redaction test rather than by inspection, which is the argument for
 * having written the test. Membership is still counted — `COLLECTION_CHANGED`
 * carries a before and an after — and counting is all any rule here uses.
 */
const DATA_ROLES = new Set(['cell', 'row', 'gridcell', 'rowheader', 'columnheader', 'option']);

const REGION_ROLES = new Set([
  'form',
  'dialog',
  'table',
  'navigation',
  'list',
  'region',
  'main',
  'banner',
  'contentinfo',
  'toolbar',
]);

function semanticIdOf(element: Element): { id: string; attribute: string } | undefined {
  for (const attribute of GUIDE_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value !== null && value.trim().length > 0) {
      return { id: value.trim(), attribute };
    }
  }
  return undefined;
}

/** Semantic ids of every ancestor that carries one, outermost first. */
function semanticAncestry(element: Element): string[] {
  const chain: string[] = [];
  let current = element.parentElement;
  while (current !== null) {
    const found = semanticIdOf(current);
    if (found !== undefined) chain.unshift(found.id);
    current = current.parentElement;
  }
  return chain;
}

/** What {@link observe} needs. */
export interface ObserveInput {
  root: ParentNode;
  route: string;
  snapshotId: string;
  context: Omit<RuntimeContext, 'route'>;
  sourceGraphHash?: string;
}

/**
 * One snapshot of a rendered application.
 *
 * Every element carrying a semantic id is recorded, plus every element whose
 * role is interactive — the second so that a control the application forgot to
 * name is *visible as unmapped* rather than absent. An observer that only sees
 * what it was told about cannot report that it was not told about something.
 */
export function observe(input: ObserveInput): RuntimeEvidenceSnapshot {
  const elements: ObservedElement[] = [];
  const regions: (Omit<ObservedRegion, 'contains'> & { contains: string[] })[] = [];
  const refByElement = new Map<Element, string>();

  const all = [...input.root.querySelectorAll('*')];
  let index = 0;

  for (const element of all) {
    const semantic = semanticIdOf(element);
    const role = roleOf(element);
    const interactive = INTERACTIVE.has(role);
    const region = REGION_ROLES.has(role);
    if (semantic === undefined && !interactive && !region) continue;

    // Document order, so the handle is stable across runs of the same state.
    const ref = `e${String(index).padStart(3, '0')}`;
    index += 1;
    refByElement.set(element, ref);

    if (semantic !== undefined || interactive) {
      const name = DATA_ROLES.has(role) ? undefined : accessibleNameOf(element);
      const tag = element.tagName.toLowerCase();
      const inputType = tag === 'input' ? (element.getAttribute('type') ?? 'text') : undefined;
      const ancestry = semanticAncestry(element);
      const rawValue =
        tag === 'input' || tag === 'select' || tag === 'textarea'
          ? (element as HTMLInputElement).value
          : undefined;
      const valueName = semantic?.id ?? element.getAttribute('name') ?? tag;

      elements.push({
        ...(semantic === undefined
          ? {}
          : { semanticId: semantic.id, attribute: semantic.attribute }),
        ref,
        tagName: tag,
        role,
        ...(name === undefined ? {} : { accessibleName: name }),
        ...(inputType === undefined ? {} : { inputType }),
        visible: isVisible(element),
        disabled: isDisabled(element),
        ...(selectionState(element) === undefined ? {} : { selected: selectionState(element) }),
        ...(activeDescendantOf(element) === undefined
          ? {}
          : { activeDescendant: activeDescendantOf(element) }),
        ...(rawValue === undefined
          ? {}
          : { value: describeRedacted(redactValue(valueName, rawValue)) }),
        ...(ancestry.length === 0 ? {} : { semanticParent: ancestry[ancestry.length - 1] }),
        semanticAncestry: ancestry,
      });
    }

    if (region) {
      const heading = element.querySelector('h1, h2, h3, h4, h5, h6');
      regions.push({
        ref,
        role,
        ...(semantic === undefined ? {} : { semanticId: semantic.id }),
        ...(heading === null
          ? {}
          : { heading: (heading.textContent ?? '').replace(/\s+/g, ' ').trim() }),
        contains: [],
      });
    }
  }

  // Fill region membership by containment, after every ref exists.
  for (const region of regions) {
    const element = [...refByElement.entries()].find(([, ref]) => ref === region.ref)?.[0];
    if (element === undefined) continue;
    const inside: string[] = [];
    for (const [candidate, ref] of refByElement) {
      if (candidate !== element && element.contains(candidate)) inside.push(ref);
    }
    region.contains = inside.sort();
  }

  return {
    version: 1,
    snapshotId: input.snapshotId,
    route: input.route,
    screenNames: observeScreenNames(input.root),
    elements,
    regions,
    ...(input.sourceGraphHash === undefined ? {} : { sourceGraphHash: input.sourceGraphHash }),
    context: { route: input.route, ...input.context },
  };
}

/**
 * What the screen calls itself.
 *
 * Collected and **not used** in this loop. Closed Loop #8 left one identifier
 * derived string in user-facing output — every entry step says
 * *"Open Client Detail."*, from `screenNameFrom(ComponentName)`, and nothing in
 * that interface says those words. A rendered `<h1>` is the evidence that would
 * replace it. Changing entry-step rendering is out of scope here; measuring what
 * is available is not.
 */
export function observeScreenNames(root: ParentNode): ObservedScreenName[] {
  const names: ObservedScreenName[] = [];
  const heading = root.querySelector('h1');
  if (heading !== null) {
    const text = (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length > 0) names.push({ text, source: 'heading' });
  }
  for (const landmark of root.querySelectorAll(
    '[aria-label][role], nav[aria-label], main[aria-label]',
  )) {
    const text = (landmark.getAttribute('aria-label') ?? '').trim();
    if (text.length > 0) names.push({ text, source: 'landmark-label' });
  }
  return names;
}
