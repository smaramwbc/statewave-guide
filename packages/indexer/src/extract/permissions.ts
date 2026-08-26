/**
 * Permission extraction.
 *
 * A permission is a string that some *configured* recogniser turns into a gate:
 * `requirePermission('clients:create')` on a route, `<Can permission="…">`
 * around a button. Nothing is recognised by shape alone, because a bare string
 * that happens to contain a colon is not a permission — and inventing an
 * authorisation fact is the single most dangerous thing this indexer could do.
 * If the config names no recogniser, no permission enters the graph.
 *
 * The permission node is location-free — `permission:clients:create` — so the
 * route that requires it and the button that is hidden without it point at one
 * node and the question "what does this permission control?" has an answer.
 *
 * A recogniser matches the name a call site *states*: `requirePermission` for a
 * call by name, `session.can` for a method call, written out in full. Matching
 * the last segment of a member call would make every `x.authorize(…)` in every
 * dependency an authorisation fact, which is how Passport's OAuth middleware
 * became a `permission:google` node.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { ProvenanceReference } from '@statewavedev/guide-shared';
import { CONFIDENCE } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';
import { permissionId } from '../node-id.js';
import { createProvenance } from '../provenance.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import { findOwnerId, inferenceEvidence, lineOf, symbolOfNodeId } from './context.js';
import { getJsxAttribute, getJsxTagNodes, getStringAttributeValue, getTagName } from './jsx.js';
import type { JsxTagNode } from './jsx.js';

/** A permission seen somewhere it can gate something. */
export interface PermissionObservation {
  permission: string;
  provenance: ProvenanceReference;
}

/** Recognisers that turn a call or a component into a permission. */
export interface PermissionRecognisers {
  functions: readonly string[];
  components: readonly string[];
}

/** Permission-checking functions recognised when the config says nothing. */
export const DEFAULT_PERMISSION_FUNCTIONS: readonly string[] = [
  'requirePermission',
  'requirePermissions',
  'hasPermission',
  'checkPermission',
  'authorize',
];

/** Permission-gate components recognised when the config says nothing. */
export const DEFAULT_PERMISSION_COMPONENTS: readonly string[] = [
  'RequirePermission',
  'PermissionGate',
  'Can',
];

/** Attributes a gate component may carry its permission in. */
const PERMISSION_ATTRIBUTES: readonly string[] = ['permission', 'permissions', 'require', 'can'];

function literalString(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  if (Node.isNoSubstitutionTemplateLiteral(node)) return node.getLiteralValue();
  return undefined;
}

/** What a call to a configured recogniser states. */
export interface PermissionCall {
  /** False when the call is not a recogniser at all. */
  recognised: boolean;
  permissions: string[];
  /** True when no argument named a permission, so the gate is unknowable. */
  unresolved: boolean;
}

/** Reads a permission argument as a string. Literals only, unless extended. */
export type ConstantReader = (node: Node) => string | undefined;

/**
 * The name a call site offers a recogniser to match, if any.
 *
 * Only two forms are offered, and the difference between them is the whole
 * point. `requirePermission(…)` is a call to a function by name, which is what
 * the config describes. `passport.authorize('google')` is a method on some
 * object, and comparing only its last segment recognised Passport's OAuth
 * middleware, a local object literal and a parameter with a structural type as
 * authorisation facts — three different objects, one shared method name, and an
 * invented `permission:` node from each. A permission the code does not state is
 * the single most dangerous thing this indexer could put in the graph, so a
 * member call is offered as its *whole* dotted name: it is recognised only when
 * a config names `session.can` in full, never because something, somewhere, has
 * a method called `can`.
 */
function recogniserName(callee: Node): string | undefined {
  if (Node.isIdentifier(callee)) return callee.getText();
  if (!Node.isPropertyAccessExpression(callee)) return undefined;
  const object = callee.getExpression();
  return Node.isIdentifier(object) ? `${object.getText()}.${callee.getName()}` : undefined;
}

/**
 * Reads the permissions a call to a configured recogniser states.
 *
 * `readConstant` lets a caller widen "a literal" to "a literal, or a constant
 * this resolver can follow to one" — which is what turns
 * `requirePermission(Permissions.ClientCreate)` into a fact rather than a gap.
 * It never widens it to a guess: a value with no single literal stays absent.
 */
export function readPermissionCall(
  node: Node,
  recognisers: PermissionRecognisers,
  readConstant: ConstantReader = () => undefined,
): PermissionCall {
  if (!Node.isCallExpression(node))
    return { recognised: false, permissions: [], unresolved: false };
  const name = recogniserName(node.getExpression());
  if (name === undefined || !recognisers.functions.includes(name)) {
    return { recognised: false, permissions: [], unresolved: false };
  }

  const read = (candidate: Node): string | undefined =>
    literalString(candidate) ?? readConstant(candidate);

  const permissions: string[] = [];
  for (const argument of node.getArguments()) {
    if (Node.isArrayLiteralExpression(argument)) {
      for (const entry of argument.getElements()) {
        const value = read(entry);
        if (value !== undefined) permissions.push(value);
      }
      continue;
    }
    const value = read(argument);
    if (value !== undefined) permissions.push(value);
  }

  // A recogniser is only *unresolved* when it yielded nothing at all.
  // `hasPermission(session, 'clients:read')` names a permission perfectly well;
  // reporting it because its other argument is a session object would raise a
  // diagnostic on every correct call site in the codebase.
  return { recognised: true, permissions, unresolved: permissions.length === 0 };
}

/** What one file's permission gates produced. */
export interface ExtractedPermissions {
  observations: PermissionObservation[];
  relationships: Relationship[];
  diagnostics: IndexerDiagnostic[];
}

/** Inputs {@link extractPermissions} needs beyond the file itself. */
export interface PermissionExtractionOptions {
  relativePath: string;
  recognisers: PermissionRecognisers;
  owners: ReadonlyMap<number, string>;
  /** Element node ids keyed by the start offset of the JSX tag declaring them. */
  elementIdsByTagStart: ReadonlyMap<number, string>;
  /** Reads a constant the source states, e.g. `Permissions.ClientCreate`. */
  readConstant: ConstantReader;
}

/** What a gate component's permission attribute yielded. */
interface AttributeReading {
  /** The permission, when the attribute states one this indexer can follow. */
  value?: string;
  /** The attribute node, when one is present but could not be read. */
  unreadable?: Node;
}

/** `permission={Permissions.ClientCreate}` — a constant the source can name. */
function readPermissionAttribute(
  tag: JsxTagNode,
  attribute: string,
  options: PermissionExtractionOptions,
): AttributeReading {
  const literal = getStringAttributeValue(tag, attribute);
  if (literal !== undefined) return { value: literal };

  const found = getJsxAttribute(tag, attribute);
  if (found === undefined) return {};

  const initializer = found.getInitializer();
  if (!initializer || !Node.isJsxExpression(initializer)) return { unreadable: found };
  const expression = initializer.getExpression();
  if (expression === undefined) return { unreadable: found };
  const value = options.readConstant(expression);
  return value === undefined ? { unreadable: found } : { value };
}

/** Every permission gate in one file, on either side of the application. */
export function extractPermissions(
  sourceFile: SourceFile,
  options: PermissionExtractionOptions,
): ExtractedPermissions {
  const observations: PermissionObservation[] = [];
  const relationships: Relationship[] = [];
  const diagnostics: IndexerDiagnostic[] = [];

  const record = (permission: string, node: Node): void => {
    const { line, column } = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
    observations.push({
      permission,
      provenance: createProvenance({ file: options.relativePath, line, column }),
    });
  };

  // `if (hasPermission('clients:create'))` inside a function.
  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const found = readPermissionCall(node, options.recognisers, options.readConstant);
    if (!found.recognised) return;

    const ownerId = findOwnerId(node, options.owners);
    if (found.unresolved) {
      diagnostics.push({
        code: 'UNRESOLVED_PERMISSION',
        severity: 'info',
        message: `This permission argument is not a literal, so no permission was recorded.`,
        file: options.relativePath,
        line: lineOf(node),
        excerpt: node.getText().replace(/\s+/g, ' ').slice(0, 120),
      });
    }
    if (ownerId === undefined) return;

    for (const permission of found.permissions) {
      record(permission, node);
      relationships.push(
        createRelationship(
          'requires_permission',
          ownerId,
          permissionId(permission),
          CONFIDENCE.STATIC_INFERENCE,
          [
            inferenceEvidence(
              node,
              options.relativePath,
              'configured-permission-recogniser',
              symbolOfNodeId(ownerId),
            ),
          ],
        ),
      );
    }
  });

  // `<Can permission="clients:create"><button data-guide="…" /></Can>`
  for (const tag of getJsxTagNodes(sourceFile)) {
    if (!options.recognisers.components.includes(getTagName(tag))) continue;

    const permissions: string[] = [];
    for (const attribute of PERMISSION_ATTRIBUTES) {
      const reading = readPermissionAttribute(tag, attribute, options);
      if (reading.value !== undefined) {
        permissions.push(reading.value);
        continue;
      }
      // A gate whose permission cannot be read gates *something* — refusing in
      // silence would be indistinguishable from a gate that names no permission
      // at all, which is the one thing an authorisation graph must not blur.
      if (reading.unreadable !== undefined) {
        diagnostics.push({
          code: 'UNRESOLVED_PERMISSION',
          severity: 'info',
          message: `This permission attribute is not a literal, so no permission was recorded.`,
          file: options.relativePath,
          line: lineOf(reading.unreadable),
          excerpt: reading.unreadable.getText().replace(/\s+/g, ' ').slice(0, 120),
        });
      }
    }
    if (permissions.length === 0) continue;

    const container = Node.isJsxOpeningElement(tag) ? tag.getParent() : tag;
    const gated: string[] = [];
    container.forEachDescendant((descendant) => {
      const id = options.elementIdsByTagStart.get(descendant.getStart());
      if (id !== undefined) gated.push(id);
    });

    for (const permission of permissions) {
      record(permission, tag);
      for (const elementNodeId of gated) {
        relationships.push(
          createRelationship(
            'requires_permission',
            elementNodeId,
            permissionId(permission),
            CONFIDENCE.STATIC_INFERENCE,
            [inferenceEvidence(tag, options.relativePath, 'configured-permission-recogniser')],
          ),
        );
      }
    }
  }

  return { observations, relationships, diagnostics };
}
