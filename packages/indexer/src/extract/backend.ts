/**
 * Server route registration — Express and Fastify.
 *
 * The backend half of the join, and the only extractor that cannot work one
 * file at a time. `router.post('/clients', createClient)` lives in one module
 * and `app.use('/api', clientsRouter)` in another, so the endpoint's real path
 * only exists once both have been read and the import between them followed.
 * The pass therefore collects registrations and mounts across the whole project
 * first, then expands each *unmounted* router from its roots — expanding every
 * router would register `/clients` and `/api/clients` as two endpoints, and the
 * unprefixed one describes a route no client can reach.
 *
 * When a mount prefix cannot be read, the router is expanded at its own paths,
 * an `UNSUPPORTED_ROUTING_PATTERN` says so, and every endpoint it produces
 * carries the unknown-prefix marker of ADR 0006 — `api:GET:?/clients`.
 * Registering `/clients` and admitting the prefix is unknown is recoverable;
 * inventing `/api/clients` because that is what the neighbouring router does is
 * not, and neither is letting the unprefixed one merge into the real endpoint
 * whose string it happens to match.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { CallExpression, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { CONFIDENCE } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';
import { apiId, normaliseApiPath, partialApiPath, permissionId, toHttpMethod } from '../node-id.js';
import type { HttpMethod } from '../node-id.js';
import { createProvenance } from '../provenance.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { SymbolResolver } from '../resolve/symbols.js';
import { nodeIdForDeclaration } from './calls.js';
import { inferenceEvidence, lineOf, sourceEvidence } from './context.js';
import { resolvePathExpression } from './http.js';
import type { ApiObservation } from './http.js';
import { readPermissionCall } from './permissions.js';
import { resolveSchemaReference } from './schemas.js';
import type { PermissionObservation, PermissionRecognisers } from './permissions.js';

/** Deepest chain of router mounts expanded before the walk gives up. */
export const MAX_MOUNT_DEPTH = 8;

interface RouteRegistration {
  method: HttpMethod;
  /** Path exactly as the registration states it. */
  path: string;
  handler?: Node;
  middlewares: Node[];
  call: CallExpression;
}

interface Mount {
  /** The literal prefix; empty when the router is mounted at the root. */
  prefix: string;
  targetKey: string;
  call: CallExpression;
}

/**
 * A permission applied by `router.use(requirePermission(…))`.
 *
 * Express runs middleware in declaration order, so a router-level guard gates
 * every route registered *after* it and none registered before. `position` is
 * what makes that distinction, and it is the whole reason the guard is recorded
 * as a position rather than as a property of the router.
 */
interface RouterGuard {
  position: number;
  permissions: string[];
  node: Node;
}

interface RouterBinding {
  key: string;
  file: string;
  name: string;
  registrations: RouteRegistration[];
  mounts: Mount[];
  guards: RouterGuard[];
}

/** What the backend pass produced. */
export interface ExtractedBackendRoutes {
  observations: ApiObservation[];
  permissions: PermissionObservation[];
  relationships: Relationship[];
  diagnostics: IndexerDiagnostic[];
  /** Registrations whose full runtime path was proven. */
  resolvedApiPaths: number;
  /** Registrations recorded at a path the source could not fully state. */
  unresolvedApiPaths: number;
}

/** Inputs the backend pass needs. */
export interface BackendExtractionOptions {
  resolver: SymbolResolver;
  nodeIds: ReadonlySet<string>;
  /** Schema node ids, so validation middleware can point at one. */
  schemaIds: ReadonlySet<string>;
  recognisers: PermissionRecognisers;
}

function literalString(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  return undefined;
}

function objectProperty(object: ObjectLiteralExpression, name: string): Node | undefined {
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) continue;
    const nameNode = property.getNameNode();
    const key = Node.isStringLiteral(nameNode) ? nameNode.getLiteralValue() : nameNode.getText();
    if (key === name) return property.getInitializer();
  }
  return undefined;
}

/** Recognises `express.Router()`, `express()`, `Router()` and `Fastify()`. */
function isRouterFactory(initializer: Node, file: string, resolver: SymbolResolver): boolean {
  if (!Node.isCallExpression(initializer)) return false;
  const callee = initializer.getExpression();

  if (Node.isPropertyAccessExpression(callee)) {
    if (callee.getName() !== 'Router') return false;
    const object = callee.getExpression();
    if (!Node.isIdentifier(object)) return false;
    const target = resolver.resolveIdentifier(file, object.getText(), object);
    return target.kind === 'external' && target.specifier === 'express';
  }

  if (Node.isIdentifier(callee)) {
    const target = resolver.resolveIdentifier(file, callee.getText(), callee);
    return (
      target.kind === 'external' &&
      (target.specifier === 'express' || target.specifier === 'fastify')
    );
  }

  return false;
}

/**
 * Splits a registration's arguments into middleware and one handler.
 *
 * The last argument is the handler by convention in both frameworks; everything
 * before it runs first. Nothing here inspects arity or types, because either
 * would need a checker we deliberately do not have.
 */
function splitHandlerArguments(args: readonly Node[]): { middlewares: Node[]; handler?: Node } {
  if (args.length === 0) return { middlewares: [] };
  const handler = args[args.length - 1];
  return {
    middlewares: args.slice(0, -1),
    ...(handler !== undefined ? { handler } : {}),
  };
}

/** Reads the router a `.get(…)` / `.route(…).get(…)` chain is registered on. */
function readChain(
  expression: Node,
  file: string,
  bindings: ReadonlyMap<string, RouterBinding>,
  depth = 0,
): { key: string; path?: string } | undefined {
  if (depth > MAX_MOUNT_DEPTH) return undefined;

  if (Node.isIdentifier(expression)) {
    const key = `${file}#${expression.getText()}`;
    return bindings.has(key) ? { key } : undefined;
  }

  if (Node.isCallExpression(expression)) {
    const callee = expression.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    const name = callee.getName();
    if (name === 'route') {
      const base = readChain(callee.getExpression(), file, bindings, depth + 1);
      if (!base) return undefined;
      const argument = expression.getArguments()[0];
      const path = argument === undefined ? undefined : literalString(argument);
      return path === undefined ? { key: base.key } : { key: base.key, path };
    }
    if (toHttpMethod(name) !== undefined || name === 'all') {
      return readChain(callee.getExpression(), file, bindings, depth + 1);
    }
  }

  return undefined;
}

/**
 * One `app.use(…)` call, recorded verbatim.
 *
 * Kept unresolved on purpose: the router being mounted is nearly always
 * declared in another module, so whether an argument is a router at all is a
 * question only the whole-project pass can answer.
 */
interface MountAttempt {
  parentKey: string;
  /** The prefix, when the first argument is a string literal. */
  literalPrefix?: string;
  /** Binding key for each argument that is a resolvable identifier. */
  argumentKeys: (string | undefined)[];
  call: CallExpression;
  file: string;
}

/** The binding key an argument names, when it names a module-level binding. */
function routerKeyOf(node: Node, file: string, resolver: SymbolResolver): string | undefined {
  if (!Node.isIdentifier(node)) return undefined;
  const target = resolver.resolveIdentifier(file, node.getText(), node);
  if (target.kind === 'declaration') return `${target.ref.file}#${target.ref.name}`;
  return `${file}#${node.getText()}`;
}

interface FileScan {
  file: string;
  bindings: Map<string, RouterBinding>;
  attempts: MountAttempt[];
  diagnostics: IndexerDiagnostic[];
}

/** Collects one file's router bindings, registrations and mounts. */
function scanFile(
  sourceFile: SourceFile,
  file: string,
  resolver: SymbolResolver,
  recognisers: PermissionRecognisers,
): FileScan {
  const bindings = new Map<string, RouterBinding>();
  const attempts: MountAttempt[] = [];
  const diagnostics: IndexerDiagnostic[] = [];

  // `const app = express()` is commonly written inside a `createServer()`
  // factory, so the search is over every declaration in the file rather than
  // only the module-scope ones.
  for (const declaration of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const nameNode = declaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    const initializer = declaration.getInitializer();
    if (!initializer || !isRouterFactory(initializer, file, resolver)) continue;
    const name = nameNode.getText();
    bindings.set(`${file}#${name}`, {
      key: `${file}#${name}`,
      file,
      name,
      registrations: [],
      mounts: [],
      guards: [],
    });
  }

  if (bindings.size === 0) return { file, bindings, attempts, diagnostics };

  const refuse = (call: CallExpression, message: string): void => {
    diagnostics.push({
      code: 'UNSUPPORTED_ROUTING_PATTERN',
      severity: 'warning',
      message,
      file,
      line: lineOf(call),
      excerpt: call.getText().replace(/\s+/g, ' ').slice(0, 120),
    });
  };

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    const memberName = callee.getName();
    const args = call.getArguments();

    if (memberName === 'register') {
      const chain = readChain(callee.getExpression(), file, bindings);
      if (!chain) continue;
      const [, configuration] = args;
      const prefix =
        configuration && Node.isObjectLiteralExpression(configuration)
          ? literalString(objectProperty(configuration, 'prefix'))
          : undefined;
      if (prefix !== undefined) {
        refuse(
          call,
          `Routes registered by this plugin at "${prefix}" were not indexed: ` +
            `plugin registration is not a shape this indexer reads.`,
        );
      }
      continue;
    }

    if (memberName === 'use') {
      const chain = readChain(callee.getExpression(), file, bindings);
      if (!chain) continue;

      // `router.use(requirePermission('settings:read'))` gates everything
      // registered below it on this router.
      const binding = bindings.get(chain.key);
      if (binding) {
        for (const argument of args) {
          const found = readPermissionCall(argument, recognisers, (node) =>
            resolver.constantString(file, node),
          );
          if (!found.recognised || found.permissions.length === 0) continue;
          binding.guards.push({
            position: call.getStart(),
            permissions: found.permissions,
            node: argument,
          });
        }
      }

      // Whether an argument is a router cannot be decided here: the binding
      // usually lives in another module. Everything is recorded and the global
      // pass, which can see every router, does the deciding.
      const first = args[0];
      const declaredPrefix =
        first === undefined ? undefined : resolvePathExpression(first, file, resolver)?.path;
      attempts.push({
        parentKey: chain.key,
        ...(declaredPrefix !== undefined ? { literalPrefix: declaredPrefix } : {}),
        argumentKeys: args.map((argument) => routerKeyOf(argument, file, resolver)),
        call,
        file,
      });
      continue;
    }

    const method = toHttpMethod(memberName);
    if (method === undefined) continue;

    // `app.get('port')` is Express's settings getter, not a route. One string
    // argument and no handler is the shape that distinguishes it.
    if (memberName === 'get' && args.length === 1) continue;

    const chain = readChain(callee.getExpression(), file, bindings);
    if (!chain) continue;
    const binding = bindings.get(chain.key);
    if (!binding) continue;

    const [first] = args;
    const chainedPath = chain.path;
    const declaredPath =
      chainedPath ??
      (first === undefined ? undefined : resolvePathExpression(first, file, resolver)?.path);
    if (declaredPath === undefined) {
      refuse(call, `This route's path is not a literal, so no endpoint was recorded for it.`);
      continue;
    }

    const rest = chainedPath === undefined ? args.slice(1) : args;
    const { middlewares, handler } = splitHandlerArguments(rest);
    binding.registrations.push({
      method,
      path: declaredPath,
      ...(handler !== undefined ? { handler } : {}),
      middlewares,
      call,
    });
  }

  // `fastify.route({ method: 'POST', url: '/clients', handler })`
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== 'route') continue;
    const chain = readChain(callee.getExpression(), file, bindings);
    if (!chain) continue;
    const binding = bindings.get(chain.key);
    if (!binding) continue;
    const [configuration] = call.getArguments();
    if (!configuration || !Node.isObjectLiteralExpression(configuration)) continue;

    const url = literalString(objectProperty(configuration, 'url'));
    const declaredMethod = objectProperty(configuration, 'method');
    const methods: HttpMethod[] = [];
    if (declaredMethod && Node.isArrayLiteralExpression(declaredMethod)) {
      for (const entry of declaredMethod.getElements()) {
        const parsed = toHttpMethod(literalString(entry) ?? '');
        if (parsed !== undefined) methods.push(parsed);
      }
    } else {
      const parsed = toHttpMethod(literalString(declaredMethod) ?? '');
      if (parsed !== undefined) methods.push(parsed);
    }

    if (url === undefined || methods.length === 0) {
      refuse(
        call,
        `This route object does not state a literal method and url, so no endpoint was recorded.`,
      );
      continue;
    }

    const handler = objectProperty(configuration, 'handler');
    const preHandler = objectProperty(configuration, 'preHandler');
    for (const method of methods) {
      binding.registrations.push({
        method,
        path: url,
        ...(handler !== undefined ? { handler } : {}),
        middlewares: preHandler === undefined ? [] : [preHandler],
        call,
      });
    }
  }

  return { file, bindings, attempts, diagnostics };
}

/**
 * The identifier naming the handler, seeing through one wrapper call.
 *
 * `asyncHandler(updateSettings)` registers `updateSettings`; the wrapper adds
 * error forwarding and nothing the graph cares about. Only *one* argument may
 * name a function, because a wrapper taking two handlers gives no basis for
 * choosing between them.
 */
function unwrapHandler(
  handler: Node,
  file: string,
  options: BackendExtractionOptions,
): Node | undefined {
  if (!Node.isCallExpression(handler)) return handler;
  const named = handler
    .getArguments()
    .filter((argument) => Node.isIdentifier(argument) || Node.isPropertyAccessExpression(argument))
    .filter((argument) => {
      const target = options.resolver.resolveExpression(file, argument);
      return (
        target.kind === 'declaration' &&
        nodeIdForDeclaration(target.ref, options.nodeIds) !== undefined
      );
    });
  return named.length === 1 ? named[0] : undefined;
}

/** Every server-side endpoint the project registers. */
export function extractBackendRoutes(
  files: readonly { sourceFile: SourceFile; relativePath: string }[],
  options: BackendExtractionOptions,
): ExtractedBackendRoutes {
  const observations: ApiObservation[] = [];
  const permissions: PermissionObservation[] = [];
  const relationships: Relationship[] = [];
  const diagnostics: IndexerDiagnostic[] = [];
  let resolvedApiPaths = 0;
  let unresolvedApiPaths = 0;

  const bindings = new Map<string, RouterBinding>();
  const attempts: MountAttempt[] = [];
  for (const { sourceFile, relativePath } of files) {
    const scan = scanFile(sourceFile, relativePath, options.resolver, options.recognisers);
    diagnostics.push(...scan.diagnostics);
    attempts.push(...scan.attempts);
    for (const [key, binding] of scan.bindings) bindings.set(key, binding);
  }

  const refuseMount = (attempt: MountAttempt, message: string): void => {
    diagnostics.push({
      code: 'UNSUPPORTED_ROUTING_PATTERN',
      severity: 'warning',
      message,
      file: attempt.file,
      line: lineOf(attempt.call),
      excerpt: attempt.call.getText().replace(/\s+/g, ' ').slice(0, 120),
    });
  };

  // A router that something mounts is described by its parent, not on its own;
  // expanding both would register the same handler at two different paths, one
  // of which no client can reach.
  const mounted = new Set<string>();
  /** Routers something tried to mount at a prefix nobody can read. */
  const unreadablyMounted = new Set<string>();
  for (const attempt of attempts) {
    const parent = bindings.get(attempt.parentKey);
    if (!parent) continue;

    const [firstKey] = attempt.argumentKeys;
    const firstIsRouter = firstKey !== undefined && bindings.has(firstKey);
    const readable = attempt.literalPrefix !== undefined || firstIsRouter;
    const prefix = attempt.literalPrefix ?? '';
    const candidates =
      attempt.literalPrefix === undefined && firstIsRouter
        ? attempt.argumentKeys
        : attempt.argumentKeys.slice(1);

    const routers = candidates.filter(
      (key): key is string => key !== undefined && bindings.has(key),
    );

    if (routers.length === 0) {
      if (attempt.literalPrefix !== undefined && candidates.some((key) => key !== undefined)) {
        refuseMount(
          attempt,
          `Nothing mounted at "${attempt.literalPrefix}" was recognised as a router, so no ` +
            `endpoints were registered under it.`,
        );
      }
      continue;
    }

    for (const key of routers) {
      if (!readable) {
        unreadablyMounted.add(key);
        refuseMount(
          attempt,
          `The mount prefix here is not a literal, so the mounted router's routes were ` +
            `registered at their own unprefixed paths rather than being guessed.`,
        );
        continue;
      }
      parent.mounts.push({ prefix, targetKey: key, call: attempt.call });
      mounted.add(key);
    }
  }

  const emit = (binding: RouterBinding, prefix: string, depth: number, seen: Set<string>): void => {
    if (depth > MAX_MOUNT_DEPTH || seen.has(binding.key)) return;
    const walked = new Set(seen).add(binding.key);
    const pathless = unreadablyMounted.has(binding.key);

    for (const registration of binding.registrations) {
      // A router whose mount point is unknowable is recorded at the only path
      // the source states, marked as missing a prefix. Recording it as if the
      // prefix were empty would let it merge with a fully resolved endpoint
      // that happens to spell the same string.
      const path = pathless
        ? partialApiPath(`${prefix}${registration.path}`)
        : normaliseApiPath(`${prefix}${registration.path}`);
      const endpoint = apiId(registration.method, path);
      const { line, column } = registration.call
        .getSourceFile()
        .getLineAndColumnAtPos(registration.call.getStart());

      observations.push({
        method: registration.method,
        path,
        side: 'backend',
        provenance: createProvenance({
          file: binding.file,
          symbol: binding.name,
          line,
          column,
        }),
      });

      // The registration path is a literal, but the router it hangs off has no
      // knowable mount point, so the endpoint is recorded at the only path the
      // source states and the shortfall is said out loud rather than papered
      // over with a prefix borrowed from a neighbouring router.
      if (pathless) {
        unresolvedApiPaths += 1;
        diagnostics.push({
          code: 'UNRESOLVED_API_PATH',
          severity: 'warning',
          message:
            `"${registration.path}" was registered at its unprefixed path: the router it is ` +
            `declared on is mounted at a prefix that is not statically knowable.`,
          file: binding.file,
          line,
          excerpt: registration.call.getText().replace(/\s+/g, ' ').slice(0, 120),
        });
      } else {
        resolvedApiPaths += 1;
      }

      if (registration.handler !== undefined) {
        const handler = unwrapHandler(registration.handler, binding.file, options);
        const target =
          handler === undefined
            ? { kind: 'unknown' as const }
            : options.resolver.resolveExpression(binding.file, handler);
        if (target.kind === 'declaration') {
          const targetId = nodeIdForDeclaration(target.ref, options.nodeIds);
          if (targetId !== undefined) {
            relationships.push(
              createRelationship('invokes', endpoint, targetId, CONFIDENCE.STATIC_INFERENCE, [
                inferenceEvidence(
                  handler ?? registration.handler,
                  binding.file,
                  'router-handler-identifier',
                  binding.name,
                ),
              ]),
            );
          }
        }
      }

      const guarding = binding.guards
        .filter((guard) => guard.position < registration.call.getStart())
        .map((guard) => guard.node);

      for (const middleware of [...guarding, ...registration.middlewares]) {
        // `validate(createInvoiceSchema)` — validation declared on the route
        // rather than performed in the handler. The edge hangs off the
        // endpoint because that is where the constraint applies: every request
        // is checked before any handler sees it.
        if (Node.isCallExpression(middleware)) {
          for (const argument of middleware.getArguments()) {
            const reference = resolveSchemaReference(
              argument,
              binding.file,
              options.resolver,
              options.schemaIds,
            );
            if (reference === undefined) continue;
            relationships.push(
              createRelationship('validates_with', endpoint, reference.id, reference.confidence, [
                reference.rule === undefined
                  ? sourceEvidence(argument, binding.file, binding.name)
                  : inferenceEvidence(argument, binding.file, reference.rule, binding.name),
              ]),
            );
          }
        }

        const found = readPermissionCall(middleware, options.recognisers, (node) =>
          options.resolver.constantString(binding.file, node),
        );
        if (!found.recognised) continue;
        if (found.unresolved) {
          diagnostics.push({
            code: 'UNRESOLVED_PERMISSION',
            severity: 'info',
            message: `This permission argument is not a literal, so no permission was recorded.`,
            file: binding.file,
            line: lineOf(middleware),
            excerpt: middleware.getText().replace(/\s+/g, ' ').slice(0, 120),
          });
        }
        for (const permission of found.permissions) {
          const { line: permissionLine, column: permissionColumn } = middleware
            .getSourceFile()
            .getLineAndColumnAtPos(middleware.getStart());
          permissions.push({
            permission,
            provenance: createProvenance({
              file: binding.file,
              line: permissionLine,
              column: permissionColumn,
            }),
          });
          relationships.push(
            createRelationship(
              'requires_permission',
              endpoint,
              permissionId(permission),
              CONFIDENCE.STATIC_INFERENCE,
              [
                inferenceEvidence(
                  middleware,
                  binding.file,
                  'configured-permission-recogniser',
                  binding.name,
                ),
              ],
            ),
          );
        }
      }
    }

    for (const mount of binding.mounts) {
      const child = bindings.get(mount.targetKey);
      if (!child) continue;
      emit(child, `${prefix}${mount.prefix}`, depth + 1, walked);
    }
  };

  for (const key of [...bindings.keys()].sort()) {
    if (mounted.has(key)) continue;
    const binding = bindings.get(key);
    if (binding) emit(binding, '', 0, new Set());
  }

  return {
    observations,
    permissions,
    relationships,
    diagnostics,
    resolvedApiPaths,
    unresolvedApiPaths,
  };
}
