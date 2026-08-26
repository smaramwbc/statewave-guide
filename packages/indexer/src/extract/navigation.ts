/**
 * `navigates_to` — which route a control or a function sends the user to.
 *
 * Two shapes carry a destination: a router link's `to` prop, and a call on a
 * navigator the router handed out. The second is where the care goes.
 *
 * `navigate('/clients')` is only a navigation when `navigate` is the binding
 * `useNavigate()` returned. A component may perfectly well declare a local
 * function of that name that parks a highlight in state and changes no URL at
 * all — and because its argument is route-shaped, an extractor keyed on the
 * *name* will emit a route change that never happens. So every navigator is
 * resolved back to its declaration, the declaration has to be a call, and that
 * call's callee has to resolve to a hook a *router package* exports. Resolving
 * the callee is what separates `react-router`'s `useNavigate` from a project
 * hook of the same name, and matching the exported name rather than the local
 * one is what keeps `useNavigate as useNav` recognised. The same reasoning
 * gives `router.push(…)` its check.
 *
 * A destination is only recorded when it names a route the graph already holds.
 * Inventing a `route:` node from a navigation would make every typo a screen,
 * and would let a storage key or an external URL that happens to start with a
 * slash become part of the application's map. Where the destination cannot be
 * pinned to a declared route, an `UNRESOLVED_DYNAMIC_ROUTE` says so.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import { CONFIDENCE } from '../evidence.js';
import type { Evidence } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';
import { routeId } from '../node-id.js';
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
import { resolvePathExpression } from './http.js';
import { getJsxAttribute, getJsxTagNodes, getTagName } from './jsx.js';

/** Tags whose `to` prop is a client-side destination. */
const LINK_TAGS: ReadonlySet<string> = new Set(['Link', 'NavLink', 'Navigate', 'Redirect']);

/** Hooks that hand out a navigator. */
const NAVIGATOR_HOOKS: ReadonlySet<string> = new Set(['useNavigate', 'useHistory']);

/** Hooks that hand out a router object. */
const ROUTER_HOOKS: ReadonlySet<string> = new Set(['useRouter']);

/**
 * Packages that hand out navigators.
 *
 * A hook is a navigator because of where it came from, not because of what it
 * is called. A project may perfectly well declare its own `useNavigate` that
 * parks a highlight in state, and a name test alone reads its result as a URL
 * change that never happens.
 */
const ROUTER_PACKAGES: ReadonlySet<string> = new Set([
  'react-router',
  'react-router-dom',
  'next/router',
  'next/navigation',
  '@remix-run/react',
  'expo-router',
]);

/** Modules whose default export is a router object. */
const ROUTER_MODULES: ReadonlySet<string> = new Set(['next/router', 'next/navigation']);

/** Router methods that change the URL. */
const ROUTER_METHODS: ReadonlySet<string> = new Set(['push', 'replace', 'navigate']);

/** What one file's navigation produced. */
export interface ExtractedNavigation {
  relationships: Relationship[];
  diagnostics: IndexerDiagnostic[];
}

/** Inputs {@link extractNavigation} needs beyond the file itself. */
export interface NavigationExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
  owners: ReadonlyMap<number, string>;
  /** Element node ids keyed by the start offset of the JSX tag declaring them. */
  elementIdsByTagStart: ReadonlyMap<number, string>;
  /** Route node ids the graph holds, so no navigation can invent one. */
  routeIds: ReadonlySet<string>;
}

/**
 * The route path a destination string names.
 *
 * A query string and a fragment are not part of a route path — `/invoices?x=1`
 * and `/invoices` are the same screen — so both are dropped. Anything that is
 * not an absolute in-application path is rejected outright: an external URL is
 * not a route of this application however much of one it looks like.
 */
function toRoutePath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return undefined;
  if (trimmed.startsWith('//')) return undefined;
  const cut = trimmed.search(/[?#]/);
  const path = cut === -1 ? trimmed : trimmed.slice(0, cut);
  if (path.length === 0) return '/';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * The route path a template states outright, when its query string starts
 * before the first interpolation.
 *
 * `` `/invoices?highlight=${id}` `` names one screen and nothing about the
 * interpolation matters: everything after the `?` is a query string, which is
 * not part of a route path. That is a fact about where the `?` sits, not an
 * inference about what `id` holds — so the head alone settles the destination,
 * and a template whose *path* contains an interpolation is left to the general
 * rule.
 */
function pathFromTemplateHead(destination: Node): string | undefined {
  if (!Node.isTemplateExpression(destination)) return undefined;
  const head = destination.getHead().getLiteralText();
  const cut = head.search(/[?#]/);
  return cut === -1 ? undefined : head.slice(0, cut);
}

/** The `useState`-style declaration an identifier is bound to, if any. */
function initializerOf(node: Node): Node | undefined {
  if (Node.isVariableDeclaration(node)) return node.getInitializer();
  if (Node.isBindingElement(node)) {
    const declaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    return declaration?.getInitializer();
  }
  return undefined;
}

/** The callee of a call expression, when it is written as a name. */
function calleeOf(node: Node | undefined): Node | undefined {
  if (node === undefined || !Node.isCallExpression(node)) return undefined;
  const callee = node.getExpression();
  return Node.isIdentifier(callee) || Node.isPropertyAccessExpression(callee) ? callee : undefined;
}

/**
 * The name a router package exports a symbol under, when it exports it at all.
 *
 * The *imported* name is what matters, not the local one:
 * `import { useNavigate as useNav }` is a real navigator wearing a name no test
 * of the binding would recognise, and a project's own `useNavigate` is not one
 * however exactly it is spelled.
 */
function routerExportName(target: SymbolTarget): string | undefined {
  if (target.kind !== 'external' || !ROUTER_PACKAGES.has(target.specifier)) return undefined;
  return target.imported;
}

/**
 * True when `identifier` is bound to the result of one of `hooks`, called on a
 * hook a router package exports.
 *
 * Both halves are load-bearing. Without the declaration lookup, any call to
 * anything named `navigate` becomes a route change; without the package check,
 * a project hook called `useNavigate` does too. The check is made against the
 * name the *package* exports, so an aliased import is still recognised and a
 * local declaration never is.
 */
function boundToHook(
  identifier: Node,
  hooks: ReadonlySet<string>,
  options: NavigationExtractionOptions,
): boolean {
  if (!Node.isIdentifier(identifier)) return false;
  const target = options.resolver.resolveIdentifier(
    options.relativePath,
    identifier.getText(),
    identifier,
  );
  if (target.kind !== 'local') return false;

  const callee = calleeOf(initializerOf(target.declaration));
  if (callee === undefined) return false;
  const exported = routerExportName(
    options.resolver.resolveExpression(options.relativePath, callee),
  );
  return exported !== undefined && hooks.has(exported);
}

/** True when `identifier` is the router object a router module exports. */
function isRouterModuleImport(identifier: Node, options: NavigationExtractionOptions): boolean {
  if (!Node.isIdentifier(identifier)) return false;
  const target = options.resolver.resolveIdentifier(
    options.relativePath,
    identifier.getText(),
    identifier,
  );
  return target.kind === 'external' && ROUTER_MODULES.has(target.specifier);
}

/** The element a call sits inside the JSX of, when it sits inside one. */
function enclosingElementId(node: Node, options: NavigationExtractionOptions): string | undefined {
  for (const ancestor of node.getAncestors()) {
    const id = options.elementIdsByTagStart.get(ancestor.getStart());
    if (id !== undefined) return id;
    // A JSX attribute belongs to the tag that carries it, and the tag's own
    // start is what the element registry is keyed by.
    if (Node.isJsxOpeningElement(ancestor) || Node.isJsxSelfClosingElement(ancestor)) {
      return options.elementIdsByTagStart.get(ancestor.getStart());
    }
  }
  return undefined;
}

/** Every provable `navigates_to` edge in one file. */
export function extractNavigation(
  sourceFile: SourceFile,
  options: NavigationExtractionOptions,
): ExtractedNavigation {
  const relationships: Relationship[] = [];
  const diagnostics: IndexerDiagnostic[] = [];

  /**
   * A destination that produced no edge, and why.
   *
   * Severity separates the two kinds of gap. A destination that is not
   * statically knowable is a `warning`: something a developer could make
   * knowable. A destination that reads perfectly well but names no route this
   * project declares is `info`: usually the route table simply lives outside
   * the indexed file set, and warning about every link would drown the cases
   * where the value itself is the problem.
   */
  const refuse = (at: Node, reason: string, severity: 'info' | 'warning' = 'warning'): void => {
    diagnostics.push({
      code: 'UNRESOLVED_DYNAMIC_ROUTE',
      severity,
      message: `This destination was not linked to a route because ${reason}.`,
      file: options.relativePath,
      line: lineOf(at),
      excerpt: at.getText().replace(/\s+/g, ' ').slice(0, 120),
    });
  };

  /** Records one destination, or says why it could not be recorded. */
  const record = (sourceId: string | undefined, destination: Node, at: Node): void => {
    if (sourceId === undefined) return;

    const head = pathFromTemplateHead(destination);
    const resolved =
      head !== undefined
        ? { path: head, rules: [] }
        : resolvePathExpression(destination, options.relativePath, options.resolver);
    if (resolved === undefined) {
      refuse(at, 'it is not a statically known path');
      return;
    }

    const path = toRoutePath(resolved.path);
    if (path === undefined) {
      // An absolute URL, a mailto:, a bare fragment. Not a route, and not a gap
      // in the graph either — but saying so costs nothing and a silent skip
      // would be indistinguishable from a missed pattern.
      refuse(at, `"${resolved.path}" is not an in-application path`, 'info');
      return;
    }

    const target = routeId(path);
    if (!options.routeIds.has(target)) {
      refuse(at, `no route "${path}" is declared in this application`, 'info');
      return;
    }

    const [rule] = resolved.rules;
    const symbol = symbolOfNodeId(sourceId);
    const evidence: Evidence =
      rule === undefined
        ? sourceEvidence(destination, options.relativePath, symbol)
        : inferenceEvidence(destination, options.relativePath, rule, symbol);
    relationships.push(
      createRelationship(
        'navigates_to',
        sourceId,
        target,
        rule === undefined ? CONFIDENCE.DIRECT_SYNTAX : CONFIDENCE.STATIC_INFERENCE,
        [evidence],
      ),
    );
  };

  // `<Link to="/settings">` — the element is the thing a user clicks, so it is
  // the source when the tag declares one.
  for (const tag of getJsxTagNodes(sourceFile)) {
    if (!LINK_TAGS.has(getTagName(tag))) continue;
    const attribute = getJsxAttribute(tag, 'to');
    if (attribute === undefined) continue;

    const initializer = attribute.getInitializer();
    const destination = Node.isJsxExpression(initializer)
      ? initializer.getExpression()
      : initializer;
    if (destination === undefined) continue;

    const sourceId =
      options.elementIdsByTagStart.get(tag.getStart()) ?? findOwnerId(tag, options.owners);
    record(sourceId, destination, attribute);
  }

  // `navigate('/clients')` and `router.push('/clients')`.
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();

    const isNavigator = Node.isIdentifier(callee)
      ? boundToHook(callee, NAVIGATOR_HOOKS, options)
      : Node.isPropertyAccessExpression(callee) &&
        ROUTER_METHODS.has(callee.getName()) &&
        (boundToHook(callee.getExpression(), ROUTER_HOOKS, options) ||
          isRouterModuleImport(callee.getExpression(), options));
    if (!isNavigator) continue;

    const [destination] = call.getArguments();
    if (destination === undefined) continue;

    // A navigation leaves from the control a user operated or from the function
    // that ran it — never from a whole screen. An inline arrow in a handler prop
    // is not a function node, so walking owners alone lands on the enclosing
    // component and says "this page navigates to /clients", which is both a
    // coarser claim than the source supports and a source kind the contract
    // does not allow. The element that declares the handler is the honest
    // answer, exactly as it is for `<Link to=…>`.
    const sourceId = enclosingElementId(call, options) ?? findOwnerId(call, options.owners);
    if (sourceId === undefined) continue;
    if (sourceId.startsWith('component:')) {
      refuse(
        call,
        'it runs inside a component rather than inside a named function or an ' +
          'addressable element, so there is nothing for the edge to leave from',
      );
      continue;
    }

    record(sourceId, destination, call);
  }

  return { relationships, diagnostics };
}
