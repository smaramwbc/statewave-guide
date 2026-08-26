/** Session plumbing. One provider at the root, one hook everywhere else. */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { hasPermission } from './permissions';
import type { PermissionName, Session } from './permissions';

const SessionContext = createContext<Session | null>(null);

/** Props of {@link SessionProvider}. */
export interface SessionProviderProps {
  children: ReactNode;
  /** Supplied by tests; the real app reads the session from the bootstrap payload. */
  value?: Session;
}

/** Publishes the current session to the tree. */
export function SessionProvider({ children, value }: SessionProviderProps) {
  const session = useMemo<Session>(
    () =>
      value ?? {
        userId: 'usr_bootstrap',
        displayName: 'Bootstrap User',
        permissions: ['clients:read', 'clients:create', 'clients:update', 'invoices:read'],
      },
    [value],
  );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** The current session, or `null` when signed out. */
export function useSession(): Session | null {
  return useContext(SessionContext);
}

/** True when the current session holds `permission`. */
export function useCan(permission: PermissionName): boolean {
  const session = useSession();
  return hasPermission(session, permission);
}
