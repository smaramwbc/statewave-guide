/**
 * The application graph: every fact the indexer can prove, and how those facts
 * connect.
 *
 * Version 2 replaces the flat per-kind arrays of Closed Loop #1 with a single
 * typed node union plus an evidence-bearing relationship list. The change is
 * what makes behaviour representable: a UI element, the handler it invokes, the
 * service that handler calls and the endpoint that service hits are now the same
 * kind of thing — nodes — joined by edges that each carry their justification.
 *
 * @packageDocumentation
 */

import type { LabelKind, LabelOrigin } from './extract/labels.js';
import type { ProductElementType, ProvenanceReference } from '@statewavedev/guide-shared';
import type { Evidence } from './evidence.js';
import type { ApplicationNodeKind, HttpMethod } from './node-id.js';
import type { Relationship, RelationshipType } from './relationships.js';

/** What every node has in common. */
export interface ApplicationNodeBase {
  /** Canonical `kind:…` identifier. Stable across runs and machines. */
  id: string;
  /** Discriminator. */
  kind: ApplicationNodeKind;
  /** Where this node was observed. */
  provenance: ProvenanceReference;
}

/** A parsed source file. */
export interface SourceFileNode extends ApplicationNodeBase {
  kind: 'file';
  /** Project-relative POSIX path. */
  path: string;
  /** Which side of the application this file belongs to. */
  side: 'frontend' | 'backend' | 'shared';
  hasJsx: boolean;
}

/** A route in a client-side router. */
export interface RouteNode extends ApplicationNodeBase {
  kind: 'route';
  /** The route path pattern, e.g. `/clients/:clientId`. */
  path: string;
  /** Component rendered at the route, when statically determinable. */
  componentName?: string;
  detectedFrom: 'jsx-route' | 'router-object';
}

/** A React component. */
export interface ComponentNode extends ApplicationNodeBase {
  kind: 'component';
  name: string;
  exported: boolean;
  isDefaultExport: boolean;
}

/** An addressable UI element, declared by `data-guide` / `data-ai-id`. */
export interface UIElementNode extends ApplicationNodeBase {
  kind: 'element';
  /** The semantic identifier as written in source, e.g. `clients.create`. */
  elementId: string;
  type: ProductElementType;
  label?: string;
  /**
   * Where {@link label} came from.
   *
   * Recorded because the sources are not equally strong and a consumer has to be
   * able to weigh them: an author's `data-guide-label` is a statement, a
   * wrapping `<label>` is markup a user reads, and a prop proven to reach a text
   * position is an inference — a sound one, and still an inference.
   */
  labelOrigin?: LabelOrigin;
  /**
   * Whether the control has a readable name at all.
   *
   * `dynamic` is the load-bearing value. `<button>{invoice.number}</button>` has
   * a name that changes per row, and a consumer that cannot tell that from "no
   * name" will fall back on the identifier and send a user looking for a control
   * called `Open`. Round 6 shipped exactly that.
   */
  labelKind?: LabelKind;
  /** Which attribute declared it. */
  attribute: string;
  /** JSX tag exactly as written. */
  tagName: string;
  /** Conventional feature namespace of the semantic id. */
  featureId?: string;
}

/** How a function was written. Affects nothing but is useful for diagnostics. */
export type FunctionForm = 'declaration' | 'arrow' | 'expression' | 'method';

/** A function, method or arrow function. */
export interface FunctionNode extends ApplicationNodeBase {
  kind: 'function';
  /** Bare name, or `owner.member` for a service or object method. */
  name: string;
  form: FunctionForm;
  exported: boolean;
  isAsync: boolean;
  parameterCount: number;
  /** Owning service node id, when this is a service member. */
  ownerId?: string;
  /** Which side of the application this runs on. */
  side: 'frontend' | 'backend' | 'shared';
}

/** A React hook — a function whose name matches `use[A-Z]`. */
export interface HookNode extends ApplicationNodeBase {
  kind: 'hook';
  name: string;
  /** True for React's own hooks, which have no declaration in the project. */
  builtin: boolean;
}

/** An object that groups related operations, e.g. an API client wrapper. */
export interface ServiceNode extends ApplicationNodeBase {
  kind: 'service';
  name: string;
  /** Function node ids for its members, sorted. */
  memberIds: string[];
  /**
   * How the service was recognised. `naming` is recorded as metadata only and
   * never on its own sufficient — a thing is a service because of its shape.
   */
  detectedFrom: 'object-literal' | 'class';
  /** True when the name also matches the `*Service` convention. Metadata only. */
  nameSuggestsService: boolean;
}

/**
 * An HTTP endpoint.
 *
 * The join point between frontend and backend. One endpoint is one node no
 * matter how many callers and how many route registrations refer to it.
 */
export interface ApiEndpointNode extends ApplicationNodeBase {
  kind: 'api';
  method: HttpMethod;
  /** Normalised path, e.g. `/clients` or `/clients/:id`. */
  path: string;
  /** Which sides declared this endpoint. Both means the graph joined them. */
  observedOn: ('frontend' | 'backend')[];
  /** Every place the endpoint was observed, sorted. */
  provenances: ProvenanceReference[];
}

/** A validation schema, e.g. a Zod object. */
export interface SchemaNode extends ApplicationNodeBase {
  kind: 'schema';
  name: string;
  library: 'zod' | 'yup' | 'unknown';
}

/** A permission string, recognised by a configured recogniser. */
export interface PermissionNode extends ApplicationNodeBase {
  kind: 'permission';
  /** The permission itself, e.g. `clients:create`. */
  permission: string;
  /** Every place it was seen, sorted. */
  provenances: ProvenanceReference[];
}

/** An exported interface, type alias or enum. */
export interface TypeNode extends ApplicationNodeBase {
  kind: 'type';
  name: string;
  typeKind: 'interface' | 'type-alias' | 'enum';
  exported: boolean;
}

/** Any node in the graph. */
export type ApplicationNode =
  | SourceFileNode
  | RouteNode
  | ComponentNode
  | UIElementNode
  | FunctionNode
  | HookNode
  | ServiceNode
  | ApiEndpointNode
  | SchemaNode
  | PermissionNode
  | TypeNode;

/**
 * Machine-readable diagnostics.
 *
 * Everything the indexer *could not* determine becomes one of these. Silence
 * would be the worst outcome: a missing relationship that produced no
 * diagnostic is indistinguishable from a relationship that genuinely does not
 * exist.
 */
export type IndexerDiagnosticCode =
  // --- Closed Loop #1 -------------------------------------------------------
  | 'INVALID_ELEMENT_ID'
  | 'DUPLICATE_ELEMENT_ID'
  | 'MISSING_TSCONFIG'
  | 'NO_SOURCE_FILES'
  // --- Closed Loop #2 -------------------------------------------------------
  /** A call whose callee could not be resolved to a declaration. */
  | 'UNRESOLVED_DYNAMIC_CALL'
  /** A navigation target that is not a static string. */
  | 'UNRESOLVED_DYNAMIC_ROUTE'
  /** A form whose submit handler could not be traced. */
  | 'UNSUPPORTED_FORM_PATTERN'
  /** A modal opened by a string key with no discoverable registry. */
  | 'UNRESOLVED_MODAL_REGISTRY'
  /** An HTTP call whose path is not statically knowable. */
  | 'UNRESOLVED_API_PATH'
  /** An import that could not be resolved to a file in the project. */
  | 'UNRESOLVED_IMPORT'
  /** A permission argument that is not a static string. */
  | 'UNRESOLVED_PERMISSION'
  /** A router registration shape the extractor does not understand. */
  | 'UNSUPPORTED_ROUTING_PATTERN'
  /** A file that failed to parse. */
  | 'PARSE_FAILURE';

/** One thing the indexer could not determine. */
export interface IndexerDiagnostic {
  code: IndexerDiagnosticCode;
  severity: 'info' | 'warning';
  message: string;
  file?: string;
  line?: number;
  /** Source text that triggered it, collapsed and truncated. */
  excerpt?: string;
}

/** Node counts by kind. */
export interface ApplicationGraphStats {
  nodes: number;
  relationships: number;
  byKind: Record<ApplicationNodeKind, number>;
  byRelationship: Record<RelationshipType, number>;
}

/** Aggregate quality signals for the graph. */
export interface GraphHealth {
  /** Call sites whose callee resolved, over all call sites seen. */
  resolvedCalls: number;
  unresolvedCalls: number;
  /** HTTP call sites whose path was statically known, over all seen. */
  resolvedApiPaths: number;
  unresolvedApiPaths: number;
  /** Endpoints observed on both sides, so the frontend/backend join succeeded. */
  joinedEndpoints: number;
  /** Endpoints seen only on the frontend — a call with no matching route. */
  frontendOnlyEndpoints: number;
  /** Endpoints seen only on the backend — a route nothing calls. */
  backendOnlyEndpoints: number;
  /** False when a relationship references a node that does not exist. */
  integrity: 'PASS' | 'FAIL';
  /** Relationship ids whose source or target is missing. Empty when integrity passes. */
  danglingRelationships: string[];
}

/**
 * A complete application graph.
 *
 * Free of timestamps, absolute paths and anything else machine-specific. Two
 * runs over unchanged source produce byte-identical output.
 */
export interface ApplicationGraph {
  version: 2;
  application?: string;
  /** Every node, sorted by id. */
  nodes: ApplicationNode[];
  /** Every relationship, sorted by id. */
  relationships: Relationship[];
  stats: ApplicationGraphStats;
  health: GraphHealth;
  diagnostics: IndexerDiagnostic[];
}

/** Narrows a node to a kind. */
export function isNodeOfKind<K extends ApplicationNodeKind>(
  node: ApplicationNode,
  kind: K,
): node is Extract<ApplicationNode, { kind: K }> {
  return node.kind === kind;
}

export type { Evidence, Relationship, RelationshipType };
