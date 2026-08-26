/** Renders its children only when the session holds a permission. */
import type { ReactNode } from 'react';
import { useCan } from './SessionContext';
import type { PermissionName } from './permissions';

/** Props of {@link PermissionGate}. */
export interface PermissionGateProps {
  /** The permission the subtree needs. Always a static value in this app. */
  permission: PermissionName;
  /** Shown instead of `children` when the permission is missing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * The component half of the permission story. The function half is
 * `hasPermission`, used where there is no subtree to gate.
 */
export function PermissionGate({ permission, fallback = null, children }: PermissionGateProps) {
  const allowed = useCan(permission);
  return <>{allowed ? children : fallback}</>;
}
