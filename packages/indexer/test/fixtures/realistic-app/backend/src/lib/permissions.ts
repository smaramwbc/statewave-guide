/**
 * The server's copy of the permission vocabulary.
 *
 * Deliberately a separate declaration from the frontend's: there is no shared
 * package here, so `permission:clients:create` is a node the two sides can only
 * meet at because the *strings* agree. Getting that join right is the point.
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

/** Any permission the API knows about. */
export type PermissionName = (typeof Permissions)[keyof typeof Permissions];
