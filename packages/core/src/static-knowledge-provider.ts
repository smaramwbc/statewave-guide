/**
 * A {@link KnowledgeProvider} backed by a Product Model held in memory.
 *
 * This is the reference implementation of the knowledge port: no network, no
 * index, no model. It exists so an application can answer "what can I do here?"
 * from nothing but the artefact the indexer produced, and so the port itself
 * can be tested honestly.
 *
 * @packageDocumentation
 */

import type {
  AppContext,
  ProductElement,
  ProductFeature,
  ProductKnowledgeResult,
  ProductModel,
} from '@statewavedev/guide-shared';
import type { KnowledgeProvider, KnowledgeSearchOptions } from './providers.js';
import { byScoreThenId, scoreFields, tokenize, type ScoredField } from './lexical-score.js';

/** Options for {@link createStaticKnowledgeProvider}. */
export interface StaticKnowledgeProviderOptions {
  /** Default maximum number of results. Defaults to `5`. */
  limit?: number;
  /**
   * Extra score added when the current route matches one of a feature's routes.
   * Defaults to `0.15`. Set to `0` to ignore the application context.
   */
  routeBoost?: number;
}

/** Weights chosen so an element label or a title beats a passing mention. */
function featureFields(feature: ProductFeature): ScoredField[] {
  const fields: ScoredField[] = [
    { text: feature.title, weight: 3 },
    { text: feature.id, weight: 2 },
  ];
  if (feature.description) fields.push({ text: feature.description, weight: 2 });
  for (const route of feature.routes ?? []) fields.push({ text: route, weight: 1 });
  for (const element of feature.elements ?? []) {
    fields.push({ text: element.id, weight: 2 });
    if (element.label) fields.push({ text: element.label, weight: 2 });
    if (element.description) fields.push({ text: element.description, weight: 1 });
  }
  return fields;
}

function elementMatches(element: ProductElement, queryTokens: readonly string[]): boolean {
  const fields: ScoredField[] = [
    { text: element.id, weight: 1 },
    { text: element.label ?? '', weight: 1 },
    { text: element.description ?? '', weight: 1 },
  ];
  return scoreFields(queryTokens, fields) > 0;
}

/**
 * Route patterns match when they are equal, or when the pattern's static prefix
 * covers the current route. `/clients/:id` matches `/clients/42`; `/settings`
 * does not match `/clients`.
 */
function routeMatches(pattern: string, route: string): boolean {
  if (pattern === route) return true;
  const staticPrefix = pattern.split('/:')[0] ?? pattern;
  return staticPrefix.length > 1 && route.startsWith(staticPrefix);
}

/**
 * Creates a knowledge provider over a static {@link ProductModel}.
 *
 * @example
 * ```ts
 * const knowledge = createStaticKnowledgeProvider(productModel);
 * const hits = await knowledge.search('how do I add a client?', { route: '/clients' });
 * ```
 */
export function createStaticKnowledgeProvider(
  model: ProductModel,
  options: StaticKnowledgeProviderOptions = {},
): KnowledgeProvider {
  const defaultLimit = options.limit ?? 5;
  const routeBoost = options.routeBoost ?? 0.15;

  const features = new Map(model.features.map((feature) => [feature.id, feature]));
  const elements = new Map<string, ProductElement>();
  for (const feature of model.features) {
    for (const element of feature.elements ?? []) {
      if (!elements.has(element.id)) elements.set(element.id, element);
    }
  }

  return {
    name: 'static-product-model',

    async search(query, context?: AppContext, searchOptions?: KnowledgeSearchOptions) {
      const queryTokens = tokenize(query);
      if (queryTokens.length === 0) return [];

      const route = context?.route;
      const results: ProductKnowledgeResult[] = [];

      for (const feature of model.features) {
        let score = scoreFields(queryTokens, featureFields(feature));
        if (score === 0) continue;

        if (route && routeBoost > 0 && (feature.routes ?? []).some((p) => routeMatches(p, route))) {
          score = Math.min(1, score + routeBoost);
        }

        const matchedElements = (feature.elements ?? []).filter((element) =>
          elementMatches(element, queryTokens),
        );

        const result: ProductKnowledgeResult = { id: feature.id, feature, score };
        if (matchedElements.length > 0) result.matchedElements = matchedElements;
        if (feature.description) result.excerpt = feature.description;
        results.push(result);
      }

      return results.sort(byScoreThenId).slice(0, searchOptions?.limit ?? defaultLimit);
    },

    async getFeature(id) {
      return features.get(id);
    },

    async getElement(id) {
      return elements.get(id);
    },
  };
}
