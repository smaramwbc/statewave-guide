/**
 * The endpoint table.
 *
 * Method and path are object *properties* here rather than the callee name and
 * its first argument, and the request is issued by `callEndpoint` in this
 * module rather than by the service member that owns the endpoint. Every rule
 * keyed on the `api.<method>(<path>, …)` shape misses all of it.
 */
import { api, unwrap } from './http';

/** One endpoint: a (method, path) pair. */
export interface EndpointSpec {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
}

/**
 * Endpoints reached through {@link callEndpoint} instead of a service member.
 *
 * An object whose members are *objects*, not functions, so it is a table and
 * not a service however service-shaped it looks.
 */
export const endpoints = {
  createClient: { method: 'post', path: '/clients' },
} as const;

/** Issues the one request an {@link EndpointSpec} describes. */
export async function callEndpoint<T>(spec: EndpointSpec, body?: unknown): Promise<T> {
  return unwrap(api.request<T>({ method: spec.method, url: spec.path, data: body }));
}

/** Where the deployment put the CSV export. A setting, not a source fact. */
function readExportPath(): string {
  return (window as { exportPath?: string }).exportPath ?? '/clients/export.csv';
}

/**
 * Downloads the export.
 *
 * The path is read from a deployment setting, so this call site has no knowable
 * path at all — the `?? …` fallback is one of two possible values, not the
 * value. This is what `UNRESOLVED_API_PATH` is for: an HTTP call whose path is
 * not statically knowable. A router registration is a different failure.
 */
export async function callConfiguredExport(): Promise<Blob> {
  return unwrap(api.get<Blob>(readExportPath()));
}
