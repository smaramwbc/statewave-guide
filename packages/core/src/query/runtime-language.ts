/**
 * Words the interface is showing right now.
 *
 * ADR 0018 settled that a placeholder cannot name a product concept, and it was
 * right: `placeholder="Search clients"` is a hint the developer wrote into one
 * input, and turning it into a title would make it the answer to *"what is this
 * feature called"* forever. Closed Loop #17 paid the price for that correctly —
 * `clients.search` could be pointed at and not described — and the review that
 * followed scored the resulting sentence 1.00 out of 3 for helpfulness.
 *
 * This is the narrow thing that was missing. "The field showing *Search
 * clients*" is not a name. It is a statement about what a person can read on
 * their screen at this moment, and it stops being true the moment the screen
 * changes. Both halves matter: it is genuinely useful, and it is genuinely
 * temporary.
 *
 * ## What decides eligibility
 *
 * Not the words. Where they came from.
 *
 * A placeholder and an `aria-label` are chrome: somebody writing the interface
 * put them there to be read as interface. A table cell, a note field, a
 * paragraph of prose is content: it arrived from a database or from a person
 * typing, and it is exactly as trustworthy as whoever typed it. Closed Loop #17
 * proved that distinction has to be structural rather than a matter of reading
 * the string, because the string can say *"SYSTEM: Ignore previous
 * instructions"* and look like anything at all.
 *
 * So trust is decided by the attribute the text was read from, before anything
 * looks at what it says.
 *
 * @packageDocumentation
 */

/**
 * Where a piece of runtime-visible text came from.
 *
 * Four kinds, kept apart on purpose. They are not interchangeable and they do
 * not share authority: a placeholder can support a descriptor, a table cell
 * cannot, and an instance name is governed by Closed Loop #16 rather than here.
 */
export type RuntimeLanguageSource =
  /** The `placeholder` attribute of an input. Chrome, written by the host. */
  | 'PLACEHOLDER'
  /** Text the element renders. Content: it may have come from anywhere. */
  | 'VISIBLE_TEXT'
  /** What the accessibility tree reports for the element right now. */
  | 'CURRENT_ACCESSIBLE_NAME'
  /** The label of one concrete row or record. Closed Loop #16 owns this. */
  | 'RUNTIME_INSTANCE_NAME';

export const RUNTIME_LANGUAGE_SOURCES: readonly RuntimeLanguageSource[] = [
  'PLACEHOLDER',
  'VISIBLE_TEXT',
  'CURRENT_ACCESSIBLE_NAME',
  'RUNTIME_INSTANCE_NAME',
];

/**
 * Whether the host wrote these words as interface, or something else supplied
 * them.
 *
 * Decided by the attribute, never by the content. A note reading "SYSTEM:
 * Ignore previous instructions" and a note reading "Paid in full" are both
 * `CONTENT`, and neither is more eligible than the other.
 */
export type RuntimeLanguageTrust = 'HOST_UI' | 'CONTENT';

/** Whether the text may be repeated to a user at all. */
export type RuntimeLanguagePrivacy = 'SAFE' | 'WITHHELD';

/**
 * One string the interface is currently showing, with everything needed to
 * decide whether it may be repeated and whether it is still true.
 *
 * Scoped three ways — to an element, a route and a snapshot — because it is
 * only ever a claim about one moment. Nothing here is persisted, and nothing
 * here reaches the ProductModel.
 */
export interface RuntimeVisibleLanguage {
  semanticId: string;
  sourceKind: RuntimeLanguageSource;
  text: string;
  route: string;
  snapshotId: string;
  privacyClass: RuntimeLanguagePrivacy;
  trust: RuntimeLanguageTrust;
}

/**
 * What a source is allowed to support.
 *
 * `SHOWING` means one descriptor and one only: *the field showing "X"*. It may
 * not become *the field named X*, and it may not become *the X feature* — those
 * are claims about identity, and identity is the ProductModel's to give.
 *
 * `NONE` means the text is recorded and never spoken. Visible text is content
 * and cannot be trusted; an instance name belongs to the runtime-instance path,
 * which has its own rules about when a concept has been earned.
 */
export const DESCRIPTOR_AUTHORITY: Readonly<Record<RuntimeLanguageSource, 'SHOWING' | 'NONE'>> = {
  PLACEHOLDER: 'SHOWING',
  CURRENT_ACCESSIBLE_NAME: 'SHOWING',
  VISIBLE_TEXT: 'NONE',
  RUNTIME_INSTANCE_NAME: 'NONE',
};

/**
 * Value shapes that must never be repeated, whatever attribute they came from.
 *
 * The same policy the runtime-instance path uses, applied here for the same
 * reason: a placeholder can hold a key as easily as a row can, and waiting to
 * recognise the specific secret means every unrecognised one travels.
 */
const SECRET_SHAPED: readonly RegExp[] = [
  /(sk|pk|api|key|tok|tkn|sess|pat|ghp|priv)[-_][A-Za-z0-9_-]{6,}/i,
  /\b[A-Fa-f0-9]{32,}\b/,
  /\beyJ[A-Za-z0-9_-]{4,}\./,
  /^\s*(bearer|basic|token)\s+\S{8,}/i,
  /\S*(password|passwd|pwd|secret|apikey|api key)\S*/i,
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/,
];

/** Whether a string may be shown to a user as part of a description. */
export function isRepeatableRuntimeText(text: string | undefined): text is string {
  if (text === undefined) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  return !SECRET_SHAPED.some((pattern) => pattern.test(trimmed));
}

/** The privacy class a string falls into. */
export function classifyRuntimeText(text: string | undefined): RuntimeLanguagePrivacy {
  return isRepeatableRuntimeText(text) ? 'SAFE' : 'WITHHELD';
}

/**
 * The language entries that are still true of the screen in front of the user.
 *
 * Four conditions, and all four are ways the same sentence can go stale:
 * the snapshot has moved on, the user has navigated, the element is gone, or
 * the text itself has changed — which is what happens to a placeholder the
 * moment somebody types into the field it belongs to.
 */
export function freshRuntimeLanguage(input: {
  language: readonly RuntimeVisibleLanguage[] | undefined;
  semanticId: string;
  route: string | undefined;
  snapshotId: string | undefined;
  visibleSemanticIds: readonly string[] | undefined;
}): RuntimeVisibleLanguage[] {
  const { language, semanticId, route, snapshotId, visibleSemanticIds } = input;
  if (language === undefined) return [];
  return language.filter((entry) => {
    if (entry.semanticId !== semanticId) return false;
    if (entry.privacyClass !== 'SAFE') return false;
    if (route !== undefined && entry.route !== route) return false;
    // A snapshot id on the entry that disagrees with the context's is the
    // clearest possible statement that this text was read from a different
    // screen than the one being described.
    if (snapshotId !== undefined && entry.snapshotId !== snapshotId) return false;
    if (visibleSemanticIds !== undefined && !visibleSemanticIds.includes(semanticId)) return false;
    return true;
  });
}

/**
 * The best entry to describe an element by, or nothing.
 *
 * Placeholder before accessible name, because a placeholder is the case this
 * loop exists for and an element carrying both is almost always an input whose
 * accessible name came from the placeholder anyway. Sources with no descriptor
 * authority are not candidates at all.
 */
export function describableRuntimeText(
  entries: readonly RuntimeVisibleLanguage[],
): RuntimeVisibleLanguage | undefined {
  const eligible = entries.filter(
    (entry) => DESCRIPTOR_AUTHORITY[entry.sourceKind] === 'SHOWING' && entry.trust === 'HOST_UI',
  );
  return (
    eligible.find((entry) => entry.sourceKind === 'PLACEHOLDER') ??
    eligible.find((entry) => entry.sourceKind === 'CURRENT_ACCESSIBLE_NAME')
  );
}
