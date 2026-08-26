/**
 * Outgoing HTTP calls.
 *
 * The frontend half of the join. Everything here exists to answer one question
 * exactly: *which endpoint, spelled the way the server spells it, does this
 * function call?* Spelling it the server's way is the whole difficulty, because
 * the client writes `api.post('/clients')` against a client configured with
 * `baseURL: '/api'` while the server writes `app.use('/api', router)` and
 * `router.post('/clients')`. Both must arrive at `api:POST:/api/clients` or the
 * two halves of the application never meet.
 *
 * A path is only ever assembled from things the source states: a literal, a
 * module-scope constant resolved inside its own module, or a template whose
 * variable segments are plain identifiers and become `:name` placeholders.
 * Anything else — a concatenation, a helper call, a property access — produces
 * an `UNRESOLVED_API_PATH` and no endpoint. An invented path is worse than a
 * missing one: it would sit in the graph looking exactly like a real route.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { CallExpression, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import type { ProvenanceReference } from '@statewavedev/guide-shared';
import { CONFIDENCE } from '../evidence.js';
import type { Confidence, Evidence, InferenceRule } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';
import { HTTP_METHODS, apiId, normaliseApiPath, toHttpMethod } from '../node-id.js';
import type { HttpMethod } from '../node-id.js';
import { createProvenance } from '../provenance.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { SymbolResolver, SymbolTarget } from '../resolve/symbols.js';
import {
  findOwnerId,
  inferenceEvidence,
  lineOf,
  sourceEvidence,
  symbolOfNodeId,
} from './context.js';

/** One sighting of an endpoint, before endpoints are merged into nodes. */
export interface ApiObservation {
  method: HttpMethod;
  /** Normalised path, with the base URL or mount prefix already applied. */
  path: string;
  /** Which role saw it: a call is a client sighting, a route a server one. */
  side: 'frontend' | 'backend';
  provenance: ProvenanceReference;
}

/** A module-scope binding that speaks HTTP. */
export interface HttpClientBinding {
  /** Base URL to prepend, when the source states one. */
  baseUrl?: string;
  /** Where the binding was declared, for evidence. */
  declaration: Node;
}

/** Client bindings across the project, keyed by `file#binding`. */
export type HttpClientIndex = Map<string, HttpClientBinding>;

/** Method names an HTTP client exposes, lowercased. */
const CLIENT_METHOD_NAMES: ReadonlySet<string> = new Set(
  HTTP_METHODS.map((method) => method.toLowerCase()),
);

/**
 * Binding names treated as HTTP clients when nothing else identifies them.
 *
 * `client` is deliberately absent even though it reads naturally, because in a
 * CRM `client.get(id)` is a domain object, not a request — and a default that
 * turns domain calls into endpoints would poison the join it exists to serve.
 * Projects that do name their client `client` can say so in the config.
 */
export const DEFAULT_HTTP_CLIENTS: readonly string[] = ['api', 'http', 'apiClient', 'httpClient'];

/** Packages whose default or namespace import is an HTTP client. */
const HTTP_PACKAGES: ReadonlySet<string> = new Set(['axios']);

function objectProperty(object: ObjectLiteralExpression, name: string): Node | undefined {
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) continue;
    const nameNode = property.getNameNode();
    const key = Node.isStringLiteral(nameNode) ? nameNode.getLiteralValue() : nameNode.getText();
    if (key === name) return property.getInitializer();
  }
  return undefined;
}

/** Reads a node as a plain string, accepting only literal forms. */
function literalString(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  return undefined;
}

/** Finds `const api = axios.create({ baseURL: '/api' })` in one file. */
export function extractHttpClients(
  sourceFile: SourceFile,
  relativePath: string,
  resolver: SymbolResolver,
): HttpClientIndex {
  const clients: HttpClientIndex = new Map();

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const nameNode = declaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const callee = initializer.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'create') continue;
    const object = callee.getExpression();
    if (!Node.isIdentifier(object)) continue;

    const target = resolver.resolveIdentifier(relativePath, object.getText(), object);
    if (target.kind !== 'external' || !HTTP_PACKAGES.has(target.specifier)) continue;

    const [configuration] = initializer.getArguments();
    let baseUrl: string | undefined;
    if (configuration && Node.isObjectLiteralExpression(configuration)) {
      const declared = objectProperty(configuration, 'baseURL');
      baseUrl =
        declared === undefined ? undefined : resolver.constantString(relativePath, declared);
    }
    clients.set(`${relativePath}#${nameNode.getText()}`, {
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      declaration,
    });
  }

  return clients;
}

/** A path the extractor was able to spell out, and how it managed it. */
interface ResolvedPath {
  path: string;
  rules: InferenceRule[];
}

/**
 * Rewrites a path to the form both sides agree on.
 *
 * The query string is dropped: `/clients?page=2` and `/clients` are one
 * endpoint, and no server route ever includes a query in its pattern.
 */
function cleanPath(value: string): string {
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? value;
  return normaliseApiPath(withoutQuery);
}

/**
 * Spells out a path expression, or gives up.
 *
 * A template's variable segment becomes `:name` when the expression is a plain
 * identifier — the name is the one thing the source does tell us, and dropping
 * it would turn `/clients/:id` and `/clients/:orderId` into the same node.
 */
export function resolvePathExpression(
  expression: Node,
  file: string,
  resolver: SymbolResolver,
): ResolvedPath | undefined {
  const literal = literalString(expression);
  if (literal !== undefined) return { path: literal, rules: [] };

  if (Node.isIdentifier(expression) || Node.isPropertyAccessExpression(expression)) {
    const constant = resolver.constantString(file, expression);
    if (constant === undefined) return undefined;
    return { path: constant, rules: ['module-constant-string'] };
  }

  if (Node.isTemplateExpression(expression)) {
    const rules = new Set<InferenceRule>();
    let path = expression.getHead().getLiteralText();
    for (const span of expression.getTemplateSpans()) {
      const inner = span.getExpression();
      const constant = resolver.constantString(file, inner);
      if (constant !== undefined) {
        rules.add('module-constant-string');
        path += constant;
        path += span.getLiteral().getLiteralText();
        continue;
      }

      // A placeholder is only honest where a whole segment is being filled in.
      // `${base}${path}` is not a parameter, it is an expression whose value we
      // do not know, and `:base` would be a route nobody serves.
      const following = span.getLiteral().getLiteralText();
      const fillsSegment =
        Node.isIdentifier(inner) &&
        path.endsWith('/') &&
        (following.length === 0 || following.startsWith('/') || following.startsWith('?'));
      if (!fillsSegment) return undefined;

      path += `:${inner.getText()}`;
      path += following;
    }
    return { path, rules: [...rules] };
  }

  return undefined;
}

/** Where a call's method and path come from. */
interface HttpCallShape {
  method: HttpMethod | undefined;
  /** `undefined` when the method is stated but not statically knowable. */
  methodKnown: boolean;
  pathArgument: Node | undefined;
  baseUrl: string | undefined;
  rules: InferenceRule[];
}

function readFetchShape(call: CallExpression): HttpCallShape {
  const [pathArgument, options] = call.getArguments();
  let method: HttpMethod | undefined = 'GET';
  let methodKnown = true;
  if (options && Node.isObjectLiteralExpression(options)) {
    const declared = objectProperty(options, 'method');
    if (declared !== undefined) {
      const literal = literalString(declared);
      const parsed = literal === undefined ? undefined : toHttpMethod(literal);
      method = parsed;
      methodKnown = parsed !== undefined;
    }
  }
  return {
    method,
    methodKnown,
    ...(pathArgument !== undefined ? { pathArgument } : { pathArgument: undefined }),
    baseUrl: undefined,
    rules: [],
  };
}

/** Options {@link extractHttpCalls} needs beyond the file itself. */
export interface HttpExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
  owners: ReadonlyMap<number, string>;
  clients: HttpClientIndex;
  /** Binding names the config declares to be HTTP clients. */
  httpClients: readonly string[];
}

/** What one file's HTTP calls produced. */
export interface ExtractedHttpCalls {
  observations: ApiObservation[];
  relationships: Relationship[];
  diagnostics: IndexerDiagnostic[];
  resolvedApiPaths: number;
  unresolvedApiPaths: number;
}

/**
 * True when the resolver can see that a binding is not an HTTP client.
 *
 * {@link DEFAULT_HTTP_CLIENTS} recognises a client by name because a client is
 * often built somewhere the indexer cannot follow. A name is the weakest kind of
 * evidence there is, so it may only speak where nothing better is available: a
 * binding the resolver followed to a plain object, a function, a class or a type
 * is not a client whatever it is called, and a binding introduced *inside* a
 * function is never one of the module-scope clients the index holds. Letting the
 * name win over the declaration is how `const api = { get: (k) => k }` becomes
 * an endpoint nobody serves.
 */
function contradictsHttpClient(target: SymbolTarget): boolean {
  if (target.kind === 'local' || target.kind === 'module-namespace') return true;
  if (target.kind !== 'declaration') return false;
  const { kind } = target.ref;
  return kind === 'object-literal' || kind === 'function' || kind === 'class' || kind === 'type';
}

/** Identifies the client a member call is made on, when it is one. */
function readClientShape(
  call: CallExpression,
  options: HttpExtractionOptions,
): HttpCallShape | undefined {
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) return undefined;
  const method = toHttpMethod(callee.getName());
  if (method === undefined || !CLIENT_METHOD_NAMES.has(callee.getName())) return undefined;

  const object = callee.getExpression();
  if (!Node.isIdentifier(object)) return undefined;
  const name = object.getText();

  const target = options.resolver.resolveIdentifier(options.relativePath, name, object);

  let binding: HttpClientBinding | undefined;
  if (target.kind === 'declaration') {
    binding = options.clients.get(`${target.ref.file}#${target.ref.name}`);
  }
  binding ??= options.clients.get(`${options.relativePath}#${name}`);

  const isPackageClient = target.kind === 'external' && HTTP_PACKAGES.has(target.specifier);
  const isConfigured = options.httpClients.includes(name) && !contradictsHttpClient(target);
  if (binding === undefined && !isPackageClient && !isConfigured) return undefined;

  const [pathArgument] = call.getArguments();
  return {
    method,
    methodKnown: true,
    ...(pathArgument !== undefined ? { pathArgument } : { pathArgument: undefined }),
    baseUrl: binding?.baseUrl,
    rules: ['http-client-member-call'],
  };
}

/** Every provable outgoing HTTP call in one file. */
export function extractHttpCalls(
  sourceFile: SourceFile,
  options: HttpExtractionOptions,
): ExtractedHttpCalls {
  const observations: ApiObservation[] = [];
  const relationships: Relationship[] = [];
  const diagnostics: IndexerDiagnostic[] = [];
  let resolvedApiPaths = 0;
  let unresolvedApiPaths = 0;

  const refuse = (call: CallExpression, reason: string): void => {
    unresolvedApiPaths += 1;
    diagnostics.push({
      code: 'UNRESOLVED_API_PATH',
      severity: 'info',
      message: `No endpoint was recorded for this request because ${reason}.`,
      file: options.relativePath,
      line: lineOf(call),
      excerpt: call.getText().replace(/\s+/g, ' ').slice(0, 120),
    });
  };

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();

    let shape: HttpCallShape | undefined;
    if (Node.isIdentifier(callee) && callee.getText() === 'fetch') {
      const target = options.resolver.resolveIdentifier(options.relativePath, 'fetch', callee);
      // Only a `fetch` this project does not declare is the global one. A
      // module-scope declaration, a binding introduced inside a function and a
      // namespace import all name something else, and reading a cache lookup's
      // key as a URL would put a route in the graph that no server ever sees.
      const isGlobal = target.kind === 'external' || target.kind === 'unknown';
      if (isGlobal) shape = readFetchShape(call);
    } else {
      shape = readClientShape(call, options);
    }
    if (shape === undefined) continue;

    if (!shape.methodKnown || shape.method === undefined) {
      refuse(call, 'its HTTP method is not a literal');
      continue;
    }
    if (shape.pathArgument === undefined) {
      refuse(call, 'it has no path argument');
      continue;
    }

    const resolved = resolvePathExpression(
      shape.pathArgument,
      options.relativePath,
      options.resolver,
    );
    if (resolved === undefined) {
      refuse(call, 'its path is not statically knowable');
      continue;
    }

    const path = cleanPath(`${shape.baseUrl ?? ''}${resolved.path}`);
    const rules = [...new Set([...shape.rules, ...resolved.rules])].sort();
    const ownerId = findOwnerId(call, options.owners);
    const symbol = symbolOfNodeId(ownerId);

    const { line, column } = call.getSourceFile().getLineAndColumnAtPos(call.getStart());
    observations.push({
      method: shape.method,
      path,
      side: 'frontend',
      provenance: createProvenance({
        file: options.relativePath,
        ...(symbol !== undefined ? { symbol } : {}),
        line,
        column,
      }),
    });
    resolvedApiPaths += 1;

    if (ownerId === undefined) continue;
    const confidence: Confidence =
      rules.length === 0 ? CONFIDENCE.DIRECT_SYNTAX : CONFIDENCE.STATIC_INFERENCE;
    const evidence: Evidence[] =
      rules.length === 0
        ? [sourceEvidence(call, options.relativePath, symbol)]
        : rules.map((rule) => inferenceEvidence(call, options.relativePath, rule, symbol));

    relationships.push(
      createRelationship('calls_api', ownerId, apiId(shape.method, path), confidence, evidence),
    );
  }

  return { observations, relationships, diagnostics, resolvedApiPaths, unresolvedApiPaths };
}
