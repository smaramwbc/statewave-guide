/**
 * Evidence and confidence: why the graph believes what it believes.
 *
 * The rule that governs this whole package is **no evidence, no relationship**.
 * A relationship that cannot name the file, line and reason that produced it is
 * not recorded at all — not recorded with low confidence, not recorded with a
 * caveat. Unknown is better than wrong.
 *
 * That matters because a later AI layer will consume this graph as its factual
 * substrate. A hallucination that originates in the deterministic layer is far
 * more dangerous than one that originates in a model, because it arrives
 * wearing the authority of static analysis.
 *
 * @packageDocumentation
 */

/**
 * Where a piece of knowledge came from.
 *
 * Deliberately does not include an `ai` member. When semantic enrichment
 * arrives it gets its own evidence type, so an enriched claim never becomes
 * indistinguishable from an extracted one.
 */
export type EvidenceType =
  /** Read directly from the syntax tree. The strongest kind. */
  | 'source'
  /** Derived by a named, documented rule from several source facts. */
  | 'static-inference'
  /** Observed in a test file. */
  | 'test'
  /** Read from an OpenAPI document. */
  | 'openapi'
  /** Read from prose documentation. */
  | 'documentation'
  /** Confirmed by executing the application. */
  | 'runtime-verification';

/**
 * One justification for a relationship.
 *
 * `rule` is required for `static-inference` and forbidden otherwise: an
 * inference that cannot name the rule that produced it is indistinguishable
 * from a guess.
 */
export interface Evidence {
  /** How this was learned. */
  type: EvidenceType;
  /** Project-relative POSIX path. */
  file: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column?: number;
  /** Enclosing symbol, when known. */
  symbol?: string;
  /**
   * The exact source text that justified the relationship, collapsed to one
   * line and truncated. This is what the Inspector shows when a developer asks
   * "why do you think that?".
   */
  excerpt?: string;
  /** Name of the inference rule. Required when `type` is `static-inference`. */
  rule?: InferenceRule;
}

/**
 * The complete set of named inference rules.
 *
 * A closed union on purpose. Adding a rule means adding a member here and a row
 * in `docs/confidence.md`, which keeps the catalogue of things we are willing to
 * infer small, reviewable, and impossible to extend by accident.
 */
export type InferenceRule =
  /** A JSX handler prop referencing a locally-bound function identifier. */
  | 'jsx-handler-identifier'
  /** An import specifier resolved to a declaration in another file. */
  | 'import-symbol-resolution'
  /** A `useState` setter called in a handler, whose flag gates a JSX element. */
  | 'state-flag-gates-element'
  /** An object literal assigned to an exported const, whose members are functions. */
  | 'object-literal-service'
  /** An HTTP method call on a module-scope client binding. */
  | 'http-client-member-call'
  /** A string constant resolved to its literal initialiser within one module. */
  | 'module-constant-string'
  /** A router registration call whose handler is a resolvable identifier. */
  | 'router-handler-identifier'
  /** A permission recogniser configured by name. */
  | 'configured-permission-recogniser'
  /** A `handleSubmit(fn)` wrapper in a form's `onSubmit`. */
  | 'form-submit-wrapper';

/**
 * The confidence scale.
 *
 * Three levels, and only three. Arbitrary values such as `0.87` are never
 * produced, because a number nobody can explain is worse than no number: it
 * invites downstream consumers to threshold on noise.
 *
 * See `docs/confidence.md` for the full definition of each level and the rules
 * that may claim it.
 */
export const CONFIDENCE = {
  /**
   * `1.0` — direct syntactic relationship. The fact is written in one
   * expression in one file, e.g. `<Route path="/clients" element={<Clients/>}/>`
   * or `foo()` calling a `foo` declared in the same module.
   */
  DIRECT_SYNTAX: 1.0,
  /**
   * `0.95` — deterministically resolved symbol relationship. The fact spans
   * files but every hop was resolved by following an import to exactly one
   * declaration, with no ambiguity.
   */
  RESOLVED_SYMBOL: 0.95,
  /**
   * `0.9` — strong static inference under an explicit named rule. Several
   * source facts were combined by a rule listed in {@link InferenceRule}.
   */
  STATIC_INFERENCE: 0.9,
} as const;

/** A value from the {@link CONFIDENCE} scale. */
export type Confidence = (typeof CONFIDENCE)[keyof typeof CONFIDENCE];

/** Every confidence value the indexer is permitted to emit. */
export const ALLOWED_CONFIDENCE_VALUES: readonly number[] = Object.values(CONFIDENCE);

/**
 * Builds a `source` evidence record.
 *
 * The excerpt is collapsed to a single line and truncated so the graph stays
 * diffable — a multi-line excerpt would make one formatting change rewrite
 * unrelated parts of the file.
 */
export const MAX_EXCERPT_LENGTH = 120;

/** Collapses source text to a single truncated line for use as an excerpt. */
export function toExcerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_EXCERPT_LENGTH
    ? `${collapsed.slice(0, MAX_EXCERPT_LENGTH - 1)}…`
    : collapsed;
}
