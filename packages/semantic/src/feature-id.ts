/**
 * Feature identifiers, and the rules that mint them.
 *
 * A feature id is the join key between the Product Model, the graph and the
 * running application, so it has exactly two legitimate origins:
 *
 * - **`semantic-id`** — a `data-guide` identifier a developer wrote. It *is*
 *   the feature id, verbatim. Nothing in the pipeline may rename it, least of
 *   all a model: the string in the source file is what the runtime will look
 *   for in the DOM, and a "better" name breaks the join silently.
 * - **`derived`** — computed here, from stable graph identities only. Given the
 *   same graph, the same id; given the same route, the same id on every machine
 *   and in every run. No UUIDs, no counters seeded by discovery order, no
 *   randomness.
 *
 * Derived ids are provisional by design. They exist so a feature without a
 * semantic id can still be described, and they carry a `derived` marker so a
 * consumer can tell "the team named this" from "we named this".
 *
 * @packageDocumentation
 */

import type { ApplicationNode } from '@statewavedev/guide-indexer';
import { UNKNOWN_API_PATH_PREFIX } from './constants.js';

/** Returned when a name slugs down to nothing at all. */
const EMPTY_SLUG = 'unnamed';

/**
 * Lowercases one identifier fragment into `kebab-case`.
 *
 * `NewClientDialog` becomes `new-client-dialog` and `handleSubmit` becomes
 * `handle-submit`, so a derived id reads like something a person wrote rather
 * than like a mangled symbol.
 */
export function slugSegment(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  const slug = spaced
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? EMPTY_SLUG : slug;
}

/** Slugs a dotted or colon-separated name into dotted segments. */
function slugDotted(value: string): string {
  const parts = value
    .split(/[.:]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return EMPTY_SLUG;
  return parts.map(slugSegment).join('.');
}

/** Splits a URL-ish path into slugged segments, dropping parameter markers. */
function pathSegments(path: string): string[] {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '')
    .map((segment) => slugSegment(segment.replace(/^[:*]/, '')));
}

/**
 * Slugs an API path into one flat segment: `/api/clients` → `api-clients`.
 *
 * A path whose mount point could not be resolved keeps that fact in its id
 * (`partial-clients`), because a partial endpoint and a fully resolved one are
 * different endpoints — see ADR 0006 — and their features must not share a
 * name.
 */
function apiPathSlug(path: string): string {
  const partial = path.startsWith(UNKNOWN_API_PATH_PREFIX);
  const segments = pathSegments(partial ? path.slice(UNKNOWN_API_PATH_PREFIX.length) : path);
  const joined = segments.length === 0 ? 'root' : segments.join('-');
  return partial ? `partial-${joined}` : joined;
}

/**
 * The feature id a graph node implies, before collision handling.
 *
 * Pure, total, and a function of the node's stable identity alone — never of
 * discovery order, and never of anything a model said.
 *
 * | Node                              | Derived id             |
 * | --------------------------------- | ---------------------- |
 * | `element:clients.create`          | `clients.create`       |
 * | `route:/clients/:id`              | `route.clients.id`     |
 * | `api:POST:/api/clients`           | `api.post.api-clients` |
 * | `component:src/x.tsx#ClientsPage` | `component.clients-page` |
 * | `permission:clients:create`       | `permission.clients.create` |
 */
export function deriveFeatureId(node: ApplicationNode): string {
  switch (node.kind) {
    // A semantic id is not derived: it is adopted, exactly as written.
    case 'element':
      return node.elementId;
    case 'route': {
      const segments = pathSegments(node.path);
      return segments.length === 0 ? 'route.root' : `route.${segments.join('.')}`;
    }
    case 'api':
      return `api.${node.method.toLowerCase()}.${apiPathSlug(node.path)}`;
    case 'component':
      return `component.${slugDotted(node.name)}`;
    case 'function':
      return `function.${slugDotted(node.name)}`;
    case 'hook':
      return `hook.${slugDotted(node.name)}`;
    case 'service':
      return `service.${slugDotted(node.name)}`;
    case 'permission':
      return `permission.${slugDotted(node.permission)}`;
    case 'schema':
      return `schema.${slugDotted(node.name)}`;
    case 'type':
      return `type.${slugDotted(node.name)}`;
    case 'file': {
      const segments = pathSegments(node.path);
      return segments.length === 0 ? 'file.root' : `file.${segments.join('.')}`;
    }
  }
}

/**
 * Reserves an id, appending a numeric discriminator when it is already taken.
 *
 * `route.clients.id`, then `route.clients.id.2`, then `route.clients.id.3`. The
 * discriminator is a function of how many nodes claimed the same base name, and
 * candidates are minted in a fixed order (semantic ids first, then by node id),
 * so the same graph assigns the same suffix to the same node every time.
 *
 * Semantic ids are reserved before any derived id is minted, which is why a
 * derived id can never shadow one a developer chose.
 */
export function reserveFeatureId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let discriminator = 2; discriminator < 100_000; discriminator += 1) {
    const candidate = `${base}.${discriminator}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  /* c8 ignore next 3 */
  throw new Error(
    `Refusing to mint a feature id for ${base}: 100000 candidates were already taken.`,
  );
}
