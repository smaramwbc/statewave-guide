/**
 * Route extraction.
 *
 * Two detectors, both syntactic. Nothing here evaluates code, so a route only
 * enters the graph when its path is written as a literal — a path assembled at
 * runtime is not a fact about the application's shape, it is a fact about one
 * execution of it.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type {
  ArrayLiteralExpression,
  Expression,
  ObjectLiteralExpression,
  SourceFile,
} from 'ts-morph';
import type { RouteNode } from '../graph.js';
import { nodeProvenance } from '../provenance.js';
import { getJsxTagNodes, getStringAttributeValue, getTagName } from './jsx.js';
import type { JsxTagNode } from './jsx.js';

/** Data-router factories whose first argument is an array of route objects. */
const ROUTER_FACTORIES = new Set(['createBrowserRouter', 'createHashRouter', 'createMemoryRouter']);

/** Object properties that name the component rendered at a route. */
const COMPONENT_PROPERTIES = ['element', 'Component', 'component'] as const;

function makeRoute(
  routePath: string,
  componentName: string | undefined,
  detectedFrom: RouteNode['detectedFrom'],
  node: Node,
  relativePath: string,
): RouteNode {
  return {
    kind: 'route',
    id: routePath,
    path: routePath,
    ...(componentName !== undefined ? { componentName } : {}),
    detectedFrom,
    provenance: nodeProvenance(node, relativePath),
  };
}

/** Reads `<Foo />` or `Foo` down to the identifier `Foo`. */
function readComponentName(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isJsxExpression(node)) return readComponentName(node.getExpression());
  if (Node.isJsxSelfClosingElement(node)) return node.getTagNameNode().getText();
  if (Node.isJsxElement(node)) return node.getOpeningElement().getTagNameNode().getText();
  if (Node.isIdentifier(node)) return node.getText();
  return undefined;
}

// ---------------------------------------------------------------------------
// `<Route path="/clients" element={<Clients />} />`
// ---------------------------------------------------------------------------

function extractJsxRoutes(sourceFile: SourceFile, relativePath: string): RouteNode[] {
  const routes: RouteNode[] = [];
  for (const node of getJsxTagNodes(sourceFile)) {
    if (getTagName(node) !== 'Route') continue;
    const routePath = getStringAttributeValue(node, 'path');
    if (routePath === undefined) continue;
    routes.push(makeRoute(routePath, readJsxComponentName(node), 'jsx-route', node, relativePath));
  }
  return routes;
}

function readJsxComponentName(node: JsxTagNode): string | undefined {
  for (const attributeName of COMPONENT_PROPERTIES) {
    for (const attribute of node.getAttributes()) {
      if (!Node.isJsxAttribute(attribute)) continue;
      if (attribute.getNameNode().getText() !== attributeName) continue;
      const name = readComponentName(attribute.getInitializer());
      if (name !== undefined) return name;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// `createBrowserRouter([{ path: '/clients', children: [{ path: 'new' }] }])`
// ---------------------------------------------------------------------------

/** Property value of `object.name`, when the property is a plain assignment. */
function getProperty(object: ObjectLiteralExpression, name: string): Expression | undefined {
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) continue;
    const nameNode = property.getNameNode();
    const key = Node.isStringLiteral(nameNode) ? nameNode.getLiteralValue() : nameNode.getText();
    if (key === name) return property.getInitializer();
  }
  return undefined;
}

/**
 * Combines a nested route path with the path it is nested under.
 *
 * The rule is deliberately shallow, and mirrors how React Router reads: a child
 * path starting with `/` is absolute and replaces the parent entirely, an empty
 * child path is an index route and resolves to the parent, and anything else is
 * appended with a single separator. No parameter substitution, no splat
 * handling and no normalisation beyond collapsing the joining slash — those
 * would be guesses about routing semantics the indexer cannot verify.
 */
function joinRoutePath(parent: string | undefined, child: string): string {
  if (child.startsWith('/')) return child;
  if (parent === undefined) return child;
  if (child.length === 0) return parent;
  return `${parent.replace(/\/+$/, '')}/${child}`;
}

function collectRouteObjects(
  array: ArrayLiteralExpression,
  parentPath: string | undefined,
  relativePath: string,
  routes: RouteNode[],
): void {
  for (const entry of array.getElements()) {
    if (!Node.isObjectLiteralExpression(entry)) continue;

    const declared = getProperty(entry, 'path');
    const rawPath =
      declared && Node.isStringLiteral(declared) ? declared.getLiteralValue() : undefined;
    const resolved = rawPath === undefined ? parentPath : joinRoutePath(parentPath, rawPath);

    if (rawPath !== undefined && resolved !== undefined) {
      let componentName: string | undefined;
      for (const property of COMPONENT_PROPERTIES) {
        componentName ??= readComponentName(getProperty(entry, property));
      }
      routes.push(makeRoute(resolved, componentName, 'router-object', entry, relativePath));
    }

    const children = getProperty(entry, 'children');
    if (children && Node.isArrayLiteralExpression(children)) {
      collectRouteObjects(children, resolved, relativePath, routes);
    }
  }
}

function extractRouterObjectRoutes(sourceFile: SourceFile, relativePath: string): RouteNode[] {
  const routes: RouteNode[] = [];
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const name = Node.isPropertyAccessExpression(callee)
      ? callee.getName()
      : Node.isIdentifier(callee)
        ? callee.getText()
        : undefined;
    if (name === undefined || !ROUTER_FACTORIES.has(name)) continue;

    const first = call.getArguments()[0];
    if (first === undefined || !Node.isArrayLiteralExpression(first)) continue;
    collectRouteObjects(first, undefined, relativePath, routes);
  }
  return routes;
}

/** Every statically detectable route in `sourceFile`, in document order. */
export function extractRoutes(sourceFile: SourceFile, relativePath: string): RouteNode[] {
  return [
    ...extractJsxRoutes(sourceFile, relativePath),
    ...extractRouterObjectRoutes(sourceFile, relativePath),
  ];
}
