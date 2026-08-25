/**
 * A small deterministic relevance scorer.
 *
 * Day 0 has no embeddings, no index and no model. This is enough to make the
 * in-memory knowledge and memory providers genuinely useful for a demo and, more
 * importantly, to make the provider *contract* exercisable in tests without any
 * external service. Real providers are expected to replace it entirely.
 *
 * @packageDocumentation
 */

/** A weighted piece of text a record can be matched against. */
export interface ScoredField {
  text: string;
  /** Higher means a match here counts for more. */
  weight: number;
}

const TOKEN_PATTERN = /[a-z0-9]+/g;

/**
 * Splits text into lowercase alphanumeric tokens.
 *
 * Dots and hyphens are separators, so the id `clients.create` tokenises to
 * `['clients', 'create']` and matches a query for "create client".
 */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

/**
 * Scores `fields` against `queryTokens`, returning a value in `[0, 1]`.
 *
 * A query token counts once, at the weight of the best field it appears in, and
 * a prefix match counts for less than an exact one. The result is the fraction
 * of the query that was matched, weighted — so a short precise query that
 * matches a title outranks a long vague one that grazes a description.
 */
export function scoreFields(
  queryTokens: readonly string[],
  fields: readonly ScoredField[],
): number {
  if (queryTokens.length === 0) return 0;

  const indexed = fields.map((field) => ({
    tokens: new Set(tokenize(field.text)),
    weight: field.weight,
  }));
  const maxWeight = indexed.reduce((max, field) => Math.max(max, field.weight), 0);
  if (maxWeight === 0) return 0;

  let matched = 0;
  for (const token of queryTokens) {
    let best = 0;
    for (const field of indexed) {
      if (field.tokens.has(token)) {
        best = Math.max(best, field.weight);
        continue;
      }
      // A prefix match is real but weaker: "client" should find "clients".
      for (const candidate of field.tokens) {
        if (candidate.startsWith(token) || token.startsWith(candidate)) {
          best = Math.max(best, field.weight * 0.5);
          break;
        }
      }
    }
    matched += best;
  }

  return Math.min(1, matched / (queryTokens.length * maxWeight));
}

/**
 * Orders by descending score, then by ascending id.
 *
 * The id tie-break is what makes results reproducible: equal scores must not
 * depend on insertion or iteration order.
 */
export function byScoreThenId<T extends { id: string; score: number }>(a: T, b: T): number {
  if (a.score !== b.score) return b.score - a.score;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
