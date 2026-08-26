/**
 * Fixtures for the verification tests.
 *
 * The graph is built with the indexer's own id builders and
 * `createRelationship`, so a test can never assert against an id shape the real
 * pipeline would not produce, and no relationship can exist here without the
 * evidence the indexer would demand.
 *
 * The application it describes is deliberately ordinary: a clients page with a
 * create button behind a permission, a form that submits through a handler into
 * a service and out to `POST /clients`, a delete button that calls `DELETE`, an
 * edit button that calls `PATCH`, a search box that calls `GET`, an export
 * button whose endpoint the indexer could not resolve — plus a completely
 * separate invoices feature, which exists so that "a real id belonging to
 * another feature" is a case the tests can actually construct.
 */

import {
  CONFIDENCE,
  NODE_KINDS,
  RELATIONSHIP_TYPES,
  apiId,
  componentId,
  createRelationship,
  elementId,
  functionId,
  permissionId,
  routeId,
  schemaId,
} from '@statewavedev/guide-indexer';
import type {
  ApplicationGraph,
  ApplicationNode,
  ApplicationNodeKind,
  HttpMethod,
  Relationship,
  RelationshipType,
} from '@statewavedev/guide-indexer';
import type {
  ClaimProvenance,
  FactualClaimEnrichment,
  FeatureEnrichment,
  GeneratorAttribution,
  LanguageClaimEnrichment,
} from '@statewavedev/guide-shared';
import type { ProductElementType, ProvenanceReference } from '@statewavedev/guide-shared';
import { discoverFeatureCandidates } from '../src/candidates.js';
import type { FeatureCandidate } from '../src/candidates.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import type { EvidencePack } from '../src/evidence-pack.js';
import { verifyEnrichment } from '../src/verifier.js';
import type { SemanticVerificationResult } from '../src/verifier.js';
import type { ClaimVerifierRegistry } from '../src/registry.js';

const PAGE = 'src/pages/Clients.tsx';
const SERVICE = 'src/services/clientService.ts';
const SCHEMA_FILE = 'src/schemas/client.ts';
const INVOICES = 'src/pages/Invoices.tsx';

let line = 1;
/** A distinct provenance per node, so no two nodes share a fingerprint. */
function where(file: string): ProvenanceReference {
  line += 1;
  return { source: 'source-code', file, line, column: 1 };
}

function element(id: string, type: ProductElementType, file = PAGE): ApplicationNode {
  return {
    id: elementId(id),
    kind: 'element',
    provenance: where(file),
    elementId: id,
    type,
    attribute: 'data-guide',
    tagName: type === 'form' ? 'form' : 'button',
  };
}

function route(path: string): ApplicationNode {
  return {
    id: routeId(path),
    kind: 'route',
    provenance: where(PAGE),
    path,
    detectedFrom: 'jsx-route',
  };
}

function component(name: string, file = PAGE): ApplicationNode {
  return {
    id: componentId(file, name),
    kind: 'component',
    provenance: where(file),
    name,
    exported: true,
    isDefaultExport: false,
  };
}

function fn(name: string, file = PAGE): ApplicationNode {
  return {
    id: functionId(file, name),
    kind: 'function',
    provenance: where(file),
    name,
    form: 'arrow',
    exported: false,
    isAsync: true,
    parameterCount: 1,
    side: 'frontend',
  };
}

function api(method: HttpMethod, path: string): ApplicationNode {
  return {
    id: apiId(method, path),
    kind: 'api',
    provenance: where(SERVICE),
    method,
    path,
    observedOn: ['frontend', 'backend'],
    provenances: [where(SERVICE)],
  };
}

function permission(value: string, file = PAGE): ApplicationNode {
  return {
    id: permissionId(value),
    kind: 'permission',
    provenance: where(file),
    permission: value,
    provenances: [where(file)],
  };
}

function schema(name: string): ApplicationNode {
  return {
    id: schemaId(SCHEMA_FILE, name),
    kind: 'schema',
    provenance: where(SCHEMA_FILE),
    name,
    library: 'zod',
  };
}

function edge(type: RelationshipType, source: string, target: string, file = PAGE): Relationship {
  return createRelationship(type, source, target, CONFIDENCE.DIRECT_SYNTAX, [
    { type: 'source', file, line: 12, column: 3 },
  ]);
}

/** Assembles a graph with the stats and health block a real one carries. */
export function makeGraph(
  nodes: readonly ApplicationNode[],
  relationships: readonly Relationship[],
): ApplicationGraph {
  const byKind = {} as Record<ApplicationNodeKind, number>;
  for (const kind of NODE_KINDS) byKind[kind] = nodes.filter((node) => node.kind === kind).length;
  const byRelationship = {} as Record<RelationshipType, number>;
  for (const type of RELATIONSHIP_TYPES) {
    byRelationship[type] = relationships.filter(
      (relationship) => relationship.type === type,
    ).length;
  }
  return {
    version: 2,
    application: 'fixture',
    nodes: [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    relationships: [...relationships].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    stats: { nodes: nodes.length, relationships: relationships.length, byKind, byRelationship },
    health: {
      resolvedCalls: relationships.length,
      unresolvedCalls: 0,
      resolvedApiPaths: 3,
      unresolvedApiPaths: 1,
      joinedEndpoints: 4,
      frontendOnlyEndpoints: 0,
      backendOnlyEndpoints: 0,
      integrity: 'PASS',
      danglingRelationships: [],
    },
    diagnostics: [],
  };
}

/** Canonical ids the tests refer to by name. */
export const ID = {
  routeList: routeId('/clients'),
  routeDetail: routeId('/clients/:clientId'),
  page: componentId(PAGE, 'ClientsPage'),
  create: elementId('clients.create'),
  form: elementId('clients.form'),
  list: elementId('clients.list'),
  remove: elementId('clients.delete'),
  edit: elementId('clients.edit'),
  search: elementId('clients.search'),
  exportButton: elementId('clients.export'),
  handleCreate: functionId(PAGE, 'handleCreate'),
  handleDelete: functionId(PAGE, 'handleDelete'),
  handleEdit: functionId(PAGE, 'handleEdit'),
  loadClients: functionId(PAGE, 'loadClients'),
  handleExport: functionId(PAGE, 'handleExport'),
  serviceCreate: functionId(SERVICE, 'clientService.create'),
  post: apiId('POST', '/clients'),
  get: apiId('GET', '/clients'),
  del: apiId('DELETE', '/clients/:clientId'),
  patch: apiId('PATCH', '/clients/:clientId'),
  unresolvedExport: apiId('GET', '?/clients/export'),
  permissionCreate: permissionId('clients:create'),
  permissionExport: permissionId('clients:export'),
  schema: schemaId(SCHEMA_FILE, 'createClientSchema'),
  invoiceCreate: elementId('invoices.create'),
  invoiceApi: apiId('POST', '/invoices'),
  invoicePermission: permissionId('invoices:create'),
  createPermissionEdge: `${elementId('clients.create')}|requires_permission|${permissionId('clients:create')}`,
} as const;

/** The fixture application. */
export function clientsGraph(): ApplicationGraph {
  line = 1;
  const nodes: ApplicationNode[] = [
    route('/clients'),
    route('/clients/:clientId'),
    component('ClientsPage'),
    element('clients.create', 'button'),
    element('clients.form', 'form'),
    element('clients.list', 'table'),
    element('clients.delete', 'button'),
    element('clients.edit', 'button'),
    element('clients.search', 'input'),
    element('clients.export', 'button'),
    fn('handleCreate'),
    fn('handleDelete'),
    fn('handleEdit'),
    fn('loadClients'),
    fn('handleExport'),
    fn('clientService.create', SERVICE),
    api('POST', '/clients'),
    api('GET', '/clients'),
    api('DELETE', '/clients/:clientId'),
    api('PATCH', '/clients/:clientId'),
    // The indexer could not prove this endpoint's mount point, so its path
    // keeps the marker that says so.
    api('GET', '?/clients/export'),
    permission('clients:create'),
    permission('clients:export'),
    schema('createClientSchema'),
    // --- A different feature entirely, unreachable from the clients cluster.
    element('invoices.create', 'button', INVOICES),
    fn('handleInvoice', INVOICES),
    api('POST', '/invoices'),
    permission('invoices:create', INVOICES),
  ];

  const relationships: Relationship[] = [
    edge('renders', ID.routeList, ID.page),
    edge('contains', ID.page, ID.create),
    edge('contains', ID.page, ID.form),
    edge('contains', ID.page, ID.list),
    edge('contains', ID.page, ID.remove),
    edge('contains', ID.page, ID.edit),
    edge('contains', ID.page, ID.search),
    edge('contains', ID.page, ID.exportButton),
    edge('invokes', ID.create, ID.handleCreate),
    edge('requires_permission', ID.create, ID.permissionCreate),
    edge('submits_to', ID.form, ID.handleCreate),
    edge('calls', ID.handleCreate, ID.serviceCreate),
    edge('calls_api', ID.serviceCreate, ID.post, SERVICE),
    edge('validates_with', ID.serviceCreate, ID.schema, SERVICE),
    edge('invokes', ID.remove, ID.handleDelete),
    edge('calls_api', ID.handleDelete, ID.del),
    edge('invokes', ID.edit, ID.handleEdit),
    edge('calls_api', ID.handleEdit, ID.patch),
    edge('invokes', ID.search, ID.loadClients),
    edge('calls_api', ID.loadClients, ID.get),
    edge('navigates_to', ID.list, ID.routeDetail),
    edge('invokes', ID.exportButton, ID.handleExport),
    edge('calls_api', ID.handleExport, ID.unresolvedExport),
    edge('requires_permission', ID.exportButton, ID.permissionExport),
    edge('invokes', ID.invoiceCreate, functionId(INVOICES, 'handleInvoice'), INVOICES),
    edge('calls_api', functionId(INVOICES, 'handleInvoice'), ID.invoiceApi, INVOICES),
    edge('requires_permission', ID.invoiceCreate, ID.invoicePermission, INVOICES),
  ];

  return makeGraph(nodes, relationships);
}

/** The candidate whose id is `featureId`, and the pack it may be described from. */
export function featureFixture(
  graph: ApplicationGraph,
  featureId: string,
): { candidate: FeatureCandidate; pack: EvidencePack; knownFeatureIds: Set<string> } {
  const candidates = discoverFeatureCandidates(graph);
  const candidate = candidates.find((entry) => entry.id === featureId);
  if (candidate === undefined) {
    throw new Error(`No candidate named ${featureId}: ${candidates.map((c) => c.id).join(', ')}`);
  }
  return {
    candidate,
    pack: buildEvidencePack(graph, candidate),
    knownFeatureIds: new Set(candidates.map((entry) => entry.id)),
  };
}

export const ATTRIBUTION: GeneratorAttribution = {
  provider: 'mock',
  model: 'fixture',
  version: '2.0.0',
};

export const PROVENANCE: ClaimProvenance = {
  graphHash: 'graph-hash',
  applicationVersion: '1.2.3',
  commit: 'abc123',
  dependencyFingerprint: 'feature-hash',
};

/** One factual claim, with the fields a test does not care about filled in. */
export function factual(claim: Partial<FactualClaimEnrichment>): FactualClaimEnrichment {
  return {
    type: 'capability',
    text: 'A client can be created.',
    subjectRef: `feature:clients.create`,
    targets: [],
    ...claim,
  };
}

/** One language claim. */
export function language(claim: Partial<LanguageClaimEnrichment>): LanguageClaimEnrichment {
  return {
    type: 'purpose',
    text: 'So a user can keep the client list current.',
    targets: [],
    ...claim,
  };
}

/** A model response carrying the given claims. */
export function enrichment(
  factualClaims: FactualClaimEnrichment[],
  languageClaims: LanguageClaimEnrichment[] = [],
  overrides: Partial<FeatureEnrichment> = {},
): FeatureEnrichment {
  return {
    title: 'Create a client',
    description: 'Adds a client record from the clients page.',
    factualClaims,
    decisions: [],
    languageClaims,
    confidenceReason: 'Every claim points at the clients neighbourhood.',
    ...overrides,
  };
}

/** Runs one verification pass over the fixture application. */
export function verifyFixture(options: {
  featureId?: string;
  graph?: ApplicationGraph;
  factualClaims?: FactualClaimEnrichment[];
  languageClaims?: LanguageClaimEnrichment[];
  enrichmentOverrides?: Partial<FeatureEnrichment>;
  knownFeatureIds?: Set<string>;
  registry?: ClaimVerifierRegistry;
}): SemanticVerificationResult {
  const graph = options.graph ?? clientsGraph();
  const { candidate, pack, knownFeatureIds } = featureFixture(
    graph,
    options.featureId ?? 'clients.create',
  );
  return verifyEnrichment({
    candidate,
    knownFeatureIds: options.knownFeatureIds ?? knownFeatureIds,
    pack,
    graph,
    enrichment: enrichment(
      options.factualClaims ?? [],
      options.languageClaims ?? [],
      options.enrichmentOverrides ?? {},
    ),
    attribution: ATTRIBUTION,
    provenance: PROVENANCE,
    ...(options.registry === undefined ? {} : { registry: options.registry }),
  });
}

/** The single claim a one-claim verification produced. */
export function onlyClaim(
  result: SemanticVerificationResult,
): SemanticVerificationResult['claims'][number] {
  const claim = result.claims[0];
  if (claim === undefined) throw new Error('expected exactly one claim');
  return claim;
}
