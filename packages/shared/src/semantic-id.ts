/**
 * The semantic identifier convention that links source code to the live DOM.
 *
 * A guide element is addressed by a stable, human-authored identifier such as
 * `clients.create` — never by a CSS selector or a DOM path. This is the single
 * most important safety boundary in Statewave Guide: an agent may ask to
 * highlight `clients.create`, but it can never ask to click
 * `#app > div:nth-child(4)`, because no part of the system accepts a selector.
 *
 * @packageDocumentation
 */

/**
 * The recommended JSX/HTML attribute for marking a semantic guide element.
 *
 * @example
 * ```tsx
 * <button data-guide="clients.create">New Client</button>
 * ```
 */
export const GUIDE_ATTRIBUTE = 'data-guide';

/**
 * Compatibility attribute. Recognised by the indexer and the runtime, but
 * {@link GUIDE_ATTRIBUTE} is the documented convention for new code.
 */
export const LEGACY_GUIDE_ATTRIBUTE = 'data-ai-id';

/**
 * All attributes that carry a semantic guide identifier, in precedence order.
 * When an element declares several, the first match wins.
 */
export const GUIDE_ATTRIBUTES = [GUIDE_ATTRIBUTE, LEGACY_GUIDE_ATTRIBUTE] as const;

/** A recognised guide identifier attribute name. */
export type GuideAttribute = (typeof GUIDE_ATTRIBUTES)[number];

/**
 * Identifiers are dot-separated lowercase segments: `clients`,
 * `clients.create`, `clients.create.submit-button`.
 *
 * Deliberately narrow. The pattern excludes whitespace, `#`, `>`, `[` and every
 * other character that could turn an identifier into a selector if it ever
 * reached a DOM query by mistake.
 */
export const GUIDE_ELEMENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;

/** Maximum number of dot-separated segments in a guide identifier. */
export const GUIDE_ELEMENT_ID_MAX_SEGMENTS = 8;

/** Maximum total length of a guide identifier. */
export const GUIDE_ELEMENT_ID_MAX_LENGTH = 128;

/**
 * Returns `true` when `id` is a well-formed semantic guide identifier.
 *
 * The indexer and the runtime both call this, so a value that survives static
 * analysis is guaranteed to be addressable at runtime and vice versa.
 */
export function isValidGuideElementId(id: string): boolean {
  if (id.length === 0 || id.length > GUIDE_ELEMENT_ID_MAX_LENGTH) return false;
  if (id.split('.').length > GUIDE_ELEMENT_ID_MAX_SEGMENTS) return false;
  return GUIDE_ELEMENT_ID_PATTERN.test(id);
}

/**
 * Splits a guide identifier into its segments.
 *
 * `clients.create` → `['clients', 'create']`. Callers use the leading segments
 * to group elements under a feature.
 */
export function guideElementIdSegments(id: string): string[] {
  return id.split('.');
}

/**
 * Returns the conventional feature namespace of an identifier: everything
 * except the last segment, or the identifier itself when it has only one.
 *
 * `clients.create` → `clients`. Used as a *hint* only — an explicit
 * `featureId` always wins over the inferred namespace.
 */
export function guideElementNamespace(id: string): string {
  const segments = guideElementIdSegments(id);
  return segments.length > 1 ? segments.slice(0, -1).join('.') : id;
}
