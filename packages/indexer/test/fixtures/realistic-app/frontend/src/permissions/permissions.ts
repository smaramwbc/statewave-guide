/**
 * The permission vocabulary.
 *
 * A frozen module-scope object literal rather than a TypeScript `enum`, because
 * the values have to survive to runtime for the API to check them. For the
 * indexer this is the interesting bit: `Permissions.ClientCreate` is resolvable
 * to the literal `'clients:create'` without leaving this file.
 */
export const Permissions = {
  ClientRead: 'clients:read',
  ClientCreate: 'clients:create',
  ClientUpdate: 'clients:update',
  ClientDelete: 'clients:delete',
  InvoiceRead: 'invoices:read',
  InvoiceCreate: 'invoices:create',
  SettingsRead: 'settings:read',
  SettingsUpdate: 'settings:update',
} as const;

/** Any permission this application knows about. */
export type PermissionName = (typeof Permissions)[keyof typeof Permissions];

/** The signed-in user, as far as the UI is concerned. */
export interface Session {
  userId: string;
  displayName: string;
  permissions: PermissionName[];
}

/** True when `session` holds `permission`. Signed-out users hold nothing. */
export function hasPermission(session: Session | null, permission: PermissionName): boolean {
  if (session === null) return false;
  return session.permissions.includes(permission);
}

/** True when `session` holds every one of `permissions`. */
export function hasEveryPermission(session: Session | null, permissions: PermissionName[]): boolean {
  return permissions.every((permission) => hasPermission(session, permission));
}

/** Throws unless `session` holds `permission`. Used by imperative flows. */
export function assertPermission(session: Session | null, permission: PermissionName): void {
  if (!hasPermission(session, permission)) {
    throw new Error(`Missing permission ${permission}`);
  }
}
