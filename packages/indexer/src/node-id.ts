/**
 * Canonical node identifiers.
 *
 * Every node in the application graph is addressed by a string of the form
 * `kind:…`. The format matters more than it looks: it is what lets the frontend
 * and the backend independently discover `POST /clients` and land on the *same*
 * node, which is the join that makes a UI element traceable to a controller.
 *
 * Identifiers must be stable across runs and across machines, so they are built
 * only from project-relative paths and source-visible names.
 *
 * @packageDocumentation
 */

/** The kinds of node the graph can hold. */
export type ApplicationNodeKind =
  | 'file'
  | 'route'
  | 'component'
  | 'element'
  | 'function'
  | 'hook'
  | 'service'
  | 'api'
  | 'schema'
  | 'permission'
  | 'type';

/** `file:src/pages/Clients.tsx` */
export function fileId(relativePath: string): string {
  return `file:${relativePath}`;
}

/** `route:/clients/:id` */
export function routeId(path: string): string {
  return `route:${path}`;
}

/** `component:src/pages/Clients.tsx#Clients` */
export function componentId(relativePath: string, name: string): string {
  return `component:${relativePath}#${name}`;
}

/** `element:clients.create` — the semantic id, not a location. */
export function elementId(semanticId: string): string {
  return `element:${semanticId}`;
}

/**
 * `function:src/services/clientService.ts#clientService.create`
 *
 * `name` may be dotted for a method on an object literal, which is how a
 * service member is addressed.
 */
export function functionId(relativePath: string, name: string): string {
  return `function:${relativePath}#${name}`;
}

/** `hook:src/hooks/useClients.ts#useClients` */
export function hookId(relativePath: string, name: string): string {
  return `hook:${relativePath}#${name}`;
}

/** `service:src/services/clientService.ts#clientService` */
export function serviceId(relativePath: string, name: string): string {
  return `service:${relativePath}#${name}`;
}

/** `schema:src/schemas/client.ts#createClientSchema` */
export function schemaId(relativePath: string, name: string): string {
  return `schema:${relativePath}#${name}`;
}

/** `permission:clients:create` — location-free, so one permission is one node. */
export function permissionId(permission: string): string {
  return `permission:${permission}`;
}

/** `type:src/types/client.ts#Client` */
export function typeId(relativePath: string, name: string): string {
  return `type:${relativePath}#${name}`;
}

/** Prefix marking a path whose mount point or base URL could not be resolved. */
export const UNKNOWN_PREFIX = '?';

/** HTTP methods the graph recognises. */
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/** An HTTP method the graph recognises. */
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Narrows an arbitrary string to a known {@link HttpMethod}. */
export function toHttpMethod(value: string): HttpMethod | undefined {
  const upper = value.toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(upper) ? (upper as HttpMethod) : undefined;
}

/**
 * Normalises an API path's shape, leaving its parameter names alone.
 *
 * Rules, all purely syntactic:
 * - ensure exactly one leading slash
 * - drop a trailing slash (except for the root path)
 * - collapse repeated slashes
 *
 * This is what an endpoint's human-readable `path` keeps, so a route's
 * parameter is still called what its author called it.
 */
export function normaliseApiPath(path: string): string {
  let value = path.trim();
  if (value.startsWith(UNKNOWN_PREFIX)) {
    return `${UNKNOWN_PREFIX}${normaliseApiPath(value.slice(UNKNOWN_PREFIX.length))}`;
  }
  if (!value.startsWith('/')) value = `/${value}`;
  value = value.replace(/\/{2,}/g, '/');
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

/**
 * Marks a path whose mount prefix could not be proven.
 *
 * ADR 0006: a `partial` endpoint and a `full` one must never merge, even when
 * their path strings coincide. A router mounted at a prefix that reads an
 * environment variable registers `/clients` just as the real one does, and
 * merging the two attaches a handler that has never seen `/api/clients` to
 * `/api/clients` — a fabricated relationship carrying real provenance. The
 * marker makes the collision impossible by construction rather than by
 * convention, because the thing that distinguishes the two is present in the
 * identity.
 */
export function partialApiPath(path: string): string {
  return `${UNKNOWN_PREFIX}${normaliseApiPath(path)}`;
}

/** The placeholder every path parameter is addressed by. */
export const API_PATH_PARAMETER = ':param';

/**
 * Reduces a path to the endpoint it identifies.
 *
 * This is the crux of the frontend/backend join, and the parameter *name* is
 * the part that has to go. The frontend writes `` api.delete(`/clients/${id}`) ``
 * and the server writes `router.delete('/clients/:clientId')`; those are one
 * endpoint, and no server can serve both, because `:id` and `:clientId` are the
 * same route pattern under every router that exists. Keeping the names apart
 * split the endpoint into a frontend-only node and a backend-only node — two
 * endpoints that do not exist, and a join reported as a miss on both sides.
 *
 * The name is not discarded, only moved: it survives on the node's `path`,
 * where it is a label rather than an identity. Identity stays a pure function
 * of the path, so a consumer holding either spelling computes the same id.
 */
export function canonicaliseApiPath(path: string): string {
  return normaliseApiPath(path)
    .split('/')
    .map((segment) =>
      segment.startsWith(':') && segment.length > 1 ? API_PATH_PARAMETER : segment,
    )
    .join('/');
}

/** `api:POST:/clients` — parameters addressed positionally, never by name. */
export function apiId(method: HttpMethod, path: string): string {
  return `api:${method}:${canonicaliseApiPath(path)}`;
}

/** Splits a canonical id back into its kind and remainder. */
export function parseNodeId(id: string): { kind: string; rest: string } {
  const index = id.indexOf(':');
  if (index === -1) return { kind: '', rest: id };
  return { kind: id.slice(0, index), rest: id.slice(index + 1) };
}
