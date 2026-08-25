/**
 * What the application is showing right now.
 *
 * {@link AppContext} is the runtime counterpart to the Product Model: the model
 * describes what the application *can* do, the context describes where the user
 * *is*. The host application owns this value and pushes it into the runtime; no
 * part of Statewave Guide reads it out of the DOM or a router.
 *
 * @packageDocumentation
 */

/** The entity a screen is currently focused on, e.g. a specific client. */
export interface AppContextEntity {
  /** Domain type of the entity, e.g. `client`. */
  type: string;
  /** Identifier of the entity within its type. */
  id: string;
}

/**
 * A snapshot of the application's current state.
 *
 * Every field is optional: a host that only reports its route still gets useful
 * guidance, and a host that reports permissions gets guidance that respects
 * them.
 */
export interface AppContext {
  /** Current route path, e.g. `/clients/42`. */
  route?: string;
  /** Logical screen name, when the host distinguishes it from the route. */
  screen?: string;
  /** Identifier of the signed-in user. */
  userId?: string;
  /** Identifier of the active workspace, tenant or organisation. */
  workspaceId?: string;
  /** Permissions the current user holds. Used to filter guidance. */
  permissions?: string[];
  /** The entity currently in focus. */
  selectedEntity?: AppContextEntity;
  /** Semantic identifiers of guide elements currently mounted and visible. */
  visibleElements?: string[];
  /** Host-specific extras. Never interpreted by the runtime. */
  metadata?: Record<string, unknown>;
}

/**
 * A partial context update.
 *
 * `undefined` for a key means "leave it alone"; to clear a field, pass `null`.
 * The distinction matters because a host that reports only a route change must
 * not accidentally erase the permission list.
 */
export type AppContextPatch = {
  [K in keyof AppContext]?: AppContext[K] | null;
};
