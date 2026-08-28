/**
 * What a visual model is allowed to see, and what is removed before it does.
 *
 * Two separations do the work here.
 *
 * **Redaction precedes access.** A screenshot showing an API key is not sent and
 * then apologised for; the region is masked before the bytes exist as provider
 * input, and the manifest records what was covered. The policy is stricter than
 * what a user may see on their own screen — `INV-001` is fine in the guide
 * because the user is looking at it, and sending a customer's email to a third
 * party is a different decision with a different answer.
 *
 * **The guide is not the application.** The panel renders words like "Delete"
 * and "New client" that came *from* the guide, and a model shown the whole frame
 * would read them back as evidence about the host — a citation loop that ends
 * with the product proving itself. The panel is masked out of any frame used to
 * interpret host semantics, and the mask is recorded so a reader can see it
 * happened.
 *
 * @packageDocumentation
 */

import type { ObservedElement, ObservedRegion } from '../snapshot.js';
import type { RedactionClass, RedactionEntry } from './proposals.js';

/** A rectangle in viewport coordinates. */
export interface VisualBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One element, as vision needs to see it: identity, role, name, geometry. */
export interface VisualElement {
  semanticId?: string;
  role: string;
  /** The accessible name, after redaction. */
  name?: string;
  box: VisualBox;
  visible: boolean;
  disabled: boolean;
  /** Whether this belongs to the guide rather than the application. */
  guideOwned?: boolean;
}

/** Everything a provider is given, bounded and already cleaned. */
export interface VisualEvidencePack {
  route: string;
  snapshotId: string;
  viewport: { width: number; height: number };
  /** PNG bytes, already masked. */
  screenshot?: Uint8Array;
  screenshotHash: string;
  elements: readonly VisualElement[];
  regions: readonly ObservedRegion[];
  focusedSemanticId?: string;
  selectedInstanceRef?: string;
  /** Rectangles covered before the provider saw anything. */
  redactionManifest: readonly RedactionEntry[];
  /** The guide panel's own rectangle, masked out of host interpretation. */
  guideRegion?: VisualBox;
  /**
   * Host elements the guide's own panel is sitting on top of.
   *
   * A floating panel covers part of the application it is describing, and those
   * elements are `visible: true` in the DOM while being absent from the picture.
   * Both facts are true. Recording which ones are covered is what stops a
   * correct visual observation — "there is no Delete button on this screen" —
   * from being scored as a contradiction of the DOM, when the thing that hid it
   * was this system.
   */
  occludedSemanticIds: readonly string[];
}

/**
 * Names that must never leave the machine.
 *
 * Deliberately broader than the display policy: this decides what a third party
 * receives, and the answer to "would this help a model understand a layout?" is
 * almost always no for a value and almost always yes for a label.
 */
const SECRET_SHAPES: readonly RegExp[] = [
  /(sk|pk|api|key|tok|tkn|sess|pat|ghp|priv)[-_][A-Za-z0-9_-]{6,}/i,
  /\b[A-Fa-f0-9]{32,}\b/,
  /\beyJ[A-Za-z0-9_-]{4,}\./,
  /^\s*(bearer|basic|token)\s+\S{8,}/i,
  /^\S*(password|passwd|pwd|secret|apikey)\S*$/i,
];

/** Shapes that identify a person or a record rather than a control. */
const PERSONAL_SHAPES: readonly { pattern: RegExp; placeholder: string }[] = [
  { pattern: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/, placeholder: 'EMAIL_1' },
  { pattern: /\b(\+?\d[\d\s-]{7,}\d)\b/, placeholder: 'PHONE_1' },
];

/** Input types whose rendered value is never appropriate to send. */
const SENSITIVE_INPUT_TYPES = new Set(['password']);

/** How a name should be treated before it reaches a provider. */
export function classifyForProvider(input: {
  name: string | undefined;
  inputType?: string;
  role?: string;
}): RedactionClass {
  if (input.inputType !== undefined && SENSITIVE_INPUT_TYPES.has(input.inputType)) {
    return 'CREDENTIAL';
  }
  const name = input.name?.trim();
  if (name === undefined || name.length === 0) return 'SAFE_UI_LABEL';
  if (SECRET_SHAPES.some((pattern) => pattern.test(name))) return 'SECRET';
  if (PERSONAL_SHAPES.some((entry) => entry.pattern.test(name))) return 'PERSONAL_INSTANCE_VALUE';
  return 'SAFE_UI_LABEL';
}

/**
 * A name as the provider should receive it.
 *
 * Structure-preserving placeholders where the shape helps and the value does
 * not: a model reasoning about a table benefits from knowing a column holds
 * email addresses and benefits nothing from the addresses.
 */
export function maskName(
  name: string | undefined,
  classification: RedactionClass,
): string | undefined {
  if (name === undefined) return undefined;
  switch (classification) {
    case 'SECRET':
    case 'CREDENTIAL':
      return '[redacted]';
    case 'PERSONAL_INSTANCE_VALUE': {
      let masked = name;
      for (const entry of PERSONAL_SHAPES)
        masked = masked.replace(entry.pattern, entry.placeholder);
      return masked;
    }
    default:
      return name;
  }
}

/** What {@link buildVisualEvidencePack} needs. */
export interface VisualPackInput {
  route: string;
  snapshotId: string;
  viewport: { width: number; height: number };
  elements: readonly (ObservedElement & { box?: VisualBox; guideOwned?: boolean })[];
  regions: readonly ObservedRegion[];
  screenshot?: Uint8Array;
  /** sha256 of the screenshot, computed by the caller that has crypto. */
  screenshotHash: string;
  focusedSemanticId?: string;
  selectedInstanceRef?: string;
  guideRegion?: VisualBox;
}

/**
 * The pack, with everything sensitive already removed.
 *
 * Returns the manifest alongside the pack rather than logging it, because "what
 * did we send" has to be answerable later by reading an artefact rather than by
 * trusting that a function behaved.
 */
export function buildVisualEvidencePack(input: VisualPackInput): VisualEvidencePack {
  const manifest: RedactionEntry[] = [];
  const elements: VisualElement[] = [];

  for (const element of input.elements) {
    const box = element.box ?? { x: 0, y: 0, width: 0, height: 0 };
    const classification = classifyForProvider({
      name: element.accessibleName?.text,
      ...(element.inputType === undefined ? {} : { inputType: element.inputType }),
      role: element.role,
    });
    const masked = maskName(element.accessibleName?.text, classification);

    if (classification !== 'SAFE_UI_LABEL') {
      manifest.push({
        ...(element.semanticId === undefined ? {} : { semanticId: element.semanticId }),
        region: box,
        classification,
        ...(masked === undefined ? {} : { placeholder: masked }),
      });
    }

    elements.push({
      ...(element.semanticId === undefined ? {} : { semanticId: element.semanticId }),
      role: element.role,
      ...(masked === undefined ? {} : { name: masked }),
      box,
      visible: element.visible,
      disabled: element.disabled,
      ...(element.guideOwned === true ? { guideOwned: true } : {}),
    });
  }

  // The panel's own rectangle is recorded as redacted too. A model interpreting
  // host semantics from a frame containing the guide's own words would be
  // reading this system's output back as input.
  if (input.guideRegion !== undefined) {
    manifest.push({
      region: input.guideRegion,
      classification: 'SENSITIVE_VALUE',
      placeholder: '[guide panel]',
    });
  }

  // What the panel is covering. Half-covered counts: a model cannot read a
  // control it can see a third of, either.
  const occluded = new Set<string>();
  const panel = input.guideRegion;
  if (panel !== undefined) {
    for (const element of elements) {
      if (element.semanticId === undefined || element.guideOwned === true) continue;
      const b = element.box;
      if (b.width === 0 || b.height === 0) continue;
      const overlapWidth = Math.max(
        0,
        Math.min(b.x + b.width, panel.x + panel.width) - Math.max(b.x, panel.x),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(b.y + b.height, panel.y + panel.height) - Math.max(b.y, panel.y),
      );
      if ((overlapWidth * overlapHeight) / (b.width * b.height) >= 0.5)
        occluded.add(element.semanticId);
    }
  }

  return {
    route: input.route,
    snapshotId: input.snapshotId,
    viewport: input.viewport,
    ...(input.screenshot === undefined ? {} : { screenshot: input.screenshot }),
    screenshotHash: input.screenshotHash,
    elements,
    regions: input.regions,
    ...(input.focusedSemanticId === undefined
      ? {}
      : { focusedSemanticId: input.focusedSemanticId }),
    ...(input.selectedInstanceRef === undefined
      ? {}
      : { selectedInstanceRef: input.selectedInstanceRef }),
    redactionManifest: manifest,
    ...(input.guideRegion === undefined ? {} : { guideRegion: input.guideRegion }),
    occludedSemanticIds: [...occluded].sort(),
  };
}

/** Elements the host rendered. The guide's own controls are not evidence about it. */
export function hostElements(pack: VisualEvidencePack): readonly VisualElement[] {
  return pack.elements.filter((element) => element.guideOwned !== true);
}

/**
 * Deterministic spatial relations, computed rather than asked for.
 *
 * Bounding boxes already prove "above", "below" and "inside". Spending a model's
 * judgement on arithmetic is both wasteful and worse: the answer here is exact,
 * and the model's is a guess that has to be checked against this anyway.
 */
export function spatialRelation(
  a: VisualBox,
  b: VisualBox,
): 'above' | 'below' | 'left-of' | 'right-of' | 'inside' | 'overlapping' {
  const insideOf =
    a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
  if (insideOf) return 'inside';
  if (a.y + a.height <= b.y) return 'above';
  if (a.y >= b.y + b.height) return 'below';
  if (a.x + a.width <= b.x) return 'left-of';
  if (a.x >= b.x + b.width) return 'right-of';
  return 'overlapping';
}
