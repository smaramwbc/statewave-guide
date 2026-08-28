/**
 * The benchmark application, as this harness expects to find it.
 *
 * Declared rather than imported by path. The fixture lives outside this
 * package, has its own `node_modules` and its own React, and letting `tsc`
 * follow a relative import into it drags that whole tree into this program —
 * which fails on `rootDir` and then, more confusingly, on two copies of React's
 * types disagreeing about JSX.
 *
 * So the harness names a module and states what it needs from it. The alias in
 * `vitest.config.ts` resolves it at run time. If the fixture ever stops
 * exporting one of these, the failure is a missing export at the boundary rather
 * than a thousand lines of resolution noise.
 */
declare module 'fixture-app' {
  import type { ReactNode } from 'react';

  export function App(): JSX.Element;

  export interface Session {
    userId: string;
    displayName: string;
    permissions: string[];
  }

  export function SessionProvider(props: { children: ReactNode; value?: Session }): JSX.Element;

  /** The one axios instance every service in the fixture goes through. */
  export const api: {
    defaults: Record<string, unknown>;
    interceptors: unknown;
  };
}
