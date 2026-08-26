/**
 * Validation schemas, and what validates with them.
 *
 * A schema is the most precise statement an application makes about the shape
 * of its own data, so `validates_with` is the edge that answers "what does this
 * endpoint actually accept?" without anybody writing it down twice.
 *
 * Recognition is structural and shallow on purpose. A module-scope `const` whose
 * initialiser is a call chain rooted at a binding imported from `zod` (or `yup`)
 * is a schema; so is one rooted at another schema in the same module, which is
 * how `createClientSchema.partial()` earns a node. Nothing else qualifies — not
 * a name ending in `Schema`, not an object literal that looks like a shape.
 * Naming is a convention and conventions are not facts.
 *
 * The usage edge is gated the same way from the other end: `x.parse(body)`
 * produces an edge only when `x` resolves to a declaration this module already
 * recorded as a schema node. That is what keeps `JSON.parse`, `Date.parse` and
 * every hand-rolled `parse` method out of the graph without a list of names to
 * exclude.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { Confidence, InferenceRule } from '../evidence.js';
import type { SchemaNode } from '../graph.js';
import { schemaId } from '../node-id.js';
import { nodeProvenance } from '../provenance.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { SymbolResolver } from '../resolve/symbols.js';
import { confidenceForVia, unwrapExpression, viaNeedsRule } from '../resolve/symbols.js';
import { findOwnerId, inferenceEvidence, sourceEvidence, symbolOfNodeId } from './context.js';

/** Module specifiers whose exports build schemas, and the library they name. */
const SCHEMA_LIBRARIES: ReadonlyMap<string, SchemaNode['library']> = new Map([
  ['zod', 'zod'],
  ['zod/v4', 'zod'],
  ['yup', 'yup'],
]);

/** Methods that run a value through a schema. */
const VALIDATION_METHODS: ReadonlySet<string> = new Set([
  'parse',
  'safeParse',
  'parseAsync',
  'safeParseAsync',
  'validate',
  'validateSync',
  'isValid',
  'cast',
]);

/** Inputs the schema pass needs beyond the file itself. */
export interface SchemaExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
}

/**
 * The identifier a call-and-member chain is rooted at.
 *
 * `z.object({…}).partial()` and `z.coerce.number().int()` both root at `z`;
 * `api[verb]()` roots at nothing, because a computed member makes the chain
 * unreadable.
 */
function rootIdentifier(expression: Node): Node | undefined {
  let current = unwrapExpression(expression);
  for (;;) {
    if (Node.isCallExpression(current)) {
      current = unwrapExpression(current.getExpression());
      continue;
    }
    if (Node.isPropertyAccessExpression(current)) {
      current = unwrapExpression(current.getExpression());
      continue;
    }
    return Node.isIdentifier(current) ? current : undefined;
  }
}

/** Every schema declared at the top level of one file, in source order. */
export function extractSchemas(
  sourceFile: SourceFile,
  options: SchemaExtractionOptions,
): SchemaNode[] {
  const schemas: SchemaNode[] = [];
  const declaredHere = new Map<string, SchemaNode['library']>();

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const nameNode = declaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;

    const initializer = declaration.getInitializer();
    if (initializer === undefined) continue;
    // A schema is *built*: the initialiser has to be a call, or `const s = z`
    // would make the library binding itself a schema.
    if (!Node.isCallExpression(unwrapExpression(initializer))) continue;

    const root = rootIdentifier(initializer);
    if (root === undefined) continue;

    const rootName = root.getText();
    let library = declaredHere.get(rootName);
    if (library === undefined) {
      const target = options.resolver.resolveIdentifier(options.relativePath, rootName, root);
      if (target.kind !== 'external') continue;
      library = SCHEMA_LIBRARIES.get(target.specifier);
      if (library === undefined) continue;
    }

    const name = nameNode.getText();
    declaredHere.set(name, library);
    schemas.push({
      kind: 'schema',
      id: schemaId(options.relativePath, name),
      name,
      library,
      provenance: nodeProvenance(declaration, options.relativePath, name),
    });
  }

  return schemas;
}

/** A schema node an expression names, with the confidence of reaching it. */
export interface SchemaReference {
  id: string;
  confidence: Confidence;
  /** Absent when the schema was declared in the referencing file. */
  rule?: InferenceRule;
}

/** The schema node an expression denotes, when the graph holds one. */
export function resolveSchemaReference(
  expression: Node,
  file: string,
  resolver: SymbolResolver,
  schemaIds: ReadonlySet<string>,
): SchemaReference | undefined {
  if (!Node.isIdentifier(expression) && !Node.isPropertyAccessExpression(expression)) {
    return undefined;
  }
  const target = resolver.resolveExpression(file, expression);
  if (target.kind !== 'declaration') return undefined;

  const id = schemaId(target.ref.file, target.ref.name);
  if (!schemaIds.has(id)) return undefined;

  return {
    id,
    confidence: confidenceForVia(target.ref.via),
    ...(viaNeedsRule(target.ref.via) ? { rule: 'import-symbol-resolution' as const } : {}),
  };
}

/** Inputs {@link extractSchemaUsage} needs beyond the file itself. */
export interface SchemaUsageOptions extends SchemaExtractionOptions {
  owners: ReadonlyMap<number, string>;
  /** Every schema node id in the graph. */
  schemaIds: ReadonlySet<string>;
}

/** Every provable `validates_with` edge written as a call in one file. */
export function extractSchemaUsage(
  sourceFile: SourceFile,
  options: SchemaUsageOptions,
): Relationship[] {
  const relationships: Relationship[] = [];

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    if (!VALIDATION_METHODS.has(callee.getName())) continue;

    const reference = resolveSchemaReference(
      callee.getExpression(),
      options.relativePath,
      options.resolver,
      options.schemaIds,
    );
    if (reference === undefined) continue;

    // A validation at module scope belongs to no function, so there is nothing
    // for the edge to leave from.
    const ownerId = findOwnerId(call, options.owners);
    if (ownerId === undefined) continue;

    const symbol = symbolOfNodeId(ownerId);
    const at = callee.getExpression();
    relationships.push(
      createRelationship('validates_with', ownerId, reference.id, reference.confidence, [
        reference.rule === undefined
          ? sourceEvidence(at, options.relativePath, symbol)
          : inferenceEvidence(at, options.relativePath, reference.rule, symbol),
      ]),
    );
  }

  return relationships;
}
