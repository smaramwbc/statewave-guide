/**
 * Barrel.
 *
 * `useClients` and `ClientsPage` import `clientService` from here rather than
 * from the module that declares it, so resolution has to follow the star
 * re-export to find the declaration. A resolver that stops at the barrel loses
 * every service edge in the application.
 */
export * from './clientService';
export * from './invoiceService';
export * from './settingsService';
