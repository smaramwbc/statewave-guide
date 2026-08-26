/**
 * Cross-file symbol resolution, without the type checker.
 *
 * `skipFileDependencyResolution` is on and a checkout's dependencies may never
 * have been installed, so nothing here may ask the compiler what a name means.
 * Everything is read structurally: import declarations, export declarations and
 * top-level bindings, matched by name.
 *
 * Three rules govern the whole module.
 *
 * 1. **Shadowing wins.** A binding introduced inside a function body hides a
 *    module-level one of the same name. Resolving `navigate()` to an imported
 *    `navigate` when the enclosing component declared its own is exactly the
 *    class of mistake that makes a graph untrustworthy, so local scopes are
 *    searched first, always.
 * 2. **Ambiguity resolves to `undefined`.** Two `export *` barrels that both
 *    offer the name, a chain longer than {@link MAX_BARREL_DEPTH}, an import
 *    whose module is not in the project — each produces no answer rather than a
 *    plausible one.
 * 3. **Outside the project is not an error.** `react` and `axios` resolve to
 *    {@link ExternalTarget}, silently. Only a *relative* or *aliased* specifier
 *    that names nothing earns an `UNRESOLVED_IMPORT`.
 *
 * @packageDocumentation
 */

import path from 'node:path';
import { Node } from 'ts-morph';
import type { ObjectLiteralExpression, SourceFile } from 'ts-morph';
import { CONFIDENCE, toExcerpt } from '../evidence.js';
import type { Confidence } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';

/**
 * Longest chain of `export … from` hops followed before giving up.
 *
 * Bounded because a barrel that re-exports itself is a legal, if useless,
 * program, and an unbounded walk would hang the indexer on it.
 */
export const MAX_BARREL_DEPTH = 8;

/** What a top-level binding holds, as far as syntax can tell. */
export type DeclarationKind =
  'function' | 'class' | 'object-literal' | 'variable' | 'type' | 'unknown';

/** A name declared at the top level of a module. */
export interface ModuleBinding {
  name: string;
  kind: DeclarationKind;
  exported: boolean;
  isDefaultExport: boolean;
  /** The declaration node, used for provenance. */
  declaration: Node;
  /** Initialiser of a variable declaration, when there is one. */
  initializer?: Node;
  /** Member names holding functions, for object literals and classes. */
  functionMembers: ReadonlySet<string>;
  /** `{ create }` shorthand members, mapped to the identifier they name. */
  shorthandMembers: ReadonlyMap<string, string>;
  /** Number of members the literal declares, for the "mostly functions" test. */
  memberCount: number;
  /** True when a spread element made the member list unknowable. */
  membersUnknown: boolean;
}

/** A name imported into a module. */
export interface ImportBinding {
  localName: string;
  specifier: string;
  /** `*` for a namespace import, `default` for a default import, else the name. */
  imported: string;
  /** True for `import type` and type-only specifiers. */
  typeOnly: boolean;
  node: Node;
}

/** An `export … from` declaration. */
export interface ReExport {
  specifier: string;
  /** Absent for `export * from './x'`. */
  names?: { exported: string; local: string }[];
  node: Node;
}

/** Everything the resolver knows about one module. */
export interface ModuleInfo {
  /** Project-relative POSIX path. */
  file: string;
  sourceFile: SourceFile;
  bindings: Map<string, ModuleBinding>;
  imports: Map<string, ImportBinding>;
  /** `export { local as exported }` with no module specifier. */
  localExports: Map<string, string>;
  reExports: ReExport[];
  /** Every module specifier the file imports from, in source order. */
  importedSpecifiers: string[];
}

/** Every parsed module, keyed by project-relative POSIX path. */
export interface ModuleIndex {
  modules: Map<string, ModuleInfo>;
}

/** How a reference reached its declaration. */
export type ResolutionVia =
  /** A declaration in the same module. */
  | 'local-declaration'
  /** A member of a module-scope object or class in the same module. */
  | 'local-member'
  /** `const create = clientService.create` in the same module. */
  | 'local-alias'
  /** An import followed to exactly one declaration. */
  | 'import'
  /** A member of an imported object or class. */
  | 'import-member'
  /** `import * as svc` followed by `svc.create`. */
  | 'namespace-member';

/** A declaration the resolver arrived at, addressed the way the graph does. */
export interface DeclarationRef {
  /** Project-relative POSIX path of the declaring module. */
  file: string;
  /** Name as the graph addresses it: `create` or `clientService.create`. */
  name: string;
  kind: DeclarationKind;
  /** Owning binding name when this is a member. */
  owner?: string;
  via: ResolutionVia;
  /** The declaration node, for provenance. */
  declaration: Node;
}

/** Something imported from outside the project. */
export interface ExternalTarget {
  kind: 'external';
  specifier: string;
  imported: string;
}

/** What an identifier reference denotes. */
export type SymbolTarget =
  | { kind: 'declaration'; ref: DeclarationRef }
  | { kind: 'module-namespace'; file: string }
  | ExternalTarget
  | {
      kind: 'local';
      declaration: Node;
      /** True when the binding is a parameter, or destructured from one. */
      isParameter: boolean;
      /** True when the binding holds a function written in place. */
      isFunction: boolean;
      /** The bound name, when the binding has a single one. */
      name?: string;
      /** True when the binding was destructured out of some other value. */
      isDestructured: boolean;
    }
  | { kind: 'unknown' };

/** Where a module specifier points. */
export type ModuleResolution =
  { kind: 'internal'; file: string } | { kind: 'external' } | { kind: 'unresolved' };

/** One compiled entry of a tsconfig `paths` mapping. */
export interface PathAlias {
  /** Text before the `*`, or the whole key when there is none. */
  prefix: string;
  /** Text after the `*`. */
  suffix: string;
  wildcard: boolean;
  /**
   * Project-relative POSIX substitution patterns, `*` left in place, in
   * declaration order. The `*` is substituted before the path is resolved,
   * because resolving the two halves separately would lose the separator
   * between them and silently produce `srcservices`.
   */
  targets: string[];
}

/** Confidence appropriate to how a reference was resolved. */
export function confidenceForVia(via: ResolutionVia): Confidence {
  return via === 'local-declaration' ? CONFIDENCE.DIRECT_SYNTAX : CONFIDENCE.RESOLVED_SYMBOL;
}

/**
 * Whether a resolution had to combine facts, and so owes a named rule.
 *
 * A member read off an object literal in the same file is still direct syntax —
 * the object and the call are both visible in one file — so it is recorded as
 * `source` evidence at 0.95 rather than as an inference.
 */
export function viaNeedsRule(via: ResolutionVia): boolean {
  return via !== 'local-declaration' && via !== 'local-member';
}

// ---------------------------------------------------------------------------
// Building the index
// ---------------------------------------------------------------------------

/** Every name a binding pattern introduces, destructuring included. */
export function bindingNames(nameNode: Node): string[] {
  if (Node.isIdentifier(nameNode)) return [nameNode.getText()];
  if (Node.isObjectBindingPattern(nameNode) || Node.isArrayBindingPattern(nameNode)) {
    const names: string[] = [];
    for (const element of nameNode.getElements()) {
      if (!Node.isBindingElement(element)) continue;
      names.push(...bindingNames(element.getNameNode()));
    }
    return names;
  }
  return [];
}

/**
 * Strips the wrappers that change a value's type but not its value.
 *
 * `{ … } as const` is the common one, and without this every `as const`
 * permission vocabulary would look like an opaque expression.
 */
export function unwrapExpression(node: Node): Node {
  let current = node;
  for (;;) {
    if (Node.isAsExpression(current) || Node.isSatisfiesExpression(current)) {
      current = current.getExpression();
      continue;
    }
    if (Node.isParenthesizedExpression(current) || Node.isTypeAssertion(current)) {
      current = current.getExpression();
      continue;
    }
    if (Node.isNonNullExpression(current)) {
      current = current.getExpression();
      continue;
    }
    return current;
  }
}

function isFunctionValue(node: Node | undefined): boolean {
  return node !== undefined && (Node.isArrowFunction(node) || Node.isFunctionExpression(node));
}

/** Reads a property name that is written as an identifier or a string. */
function propertyName(node: Node): string | undefined {
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  return undefined;
}

interface MemberSummary {
  functionMembers: Set<string>;
  shorthandMembers: Map<string, string>;
  memberCount: number;
  membersUnknown: boolean;
}

function emptyMembers(): MemberSummary {
  return {
    functionMembers: new Set(),
    shorthandMembers: new Map(),
    memberCount: 0,
    membersUnknown: false,
  };
}

/** Summarises an object literal's members without evaluating anything. */
export function summariseObjectMembers(object: ObjectLiteralExpression): MemberSummary {
  const summary = emptyMembers();
  for (const property of object.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      // A spread makes the member list unknowable, and a service whose surface
      // we cannot enumerate is not a service we can describe.
      summary.membersUnknown = true;
      summary.memberCount += 1;
      continue;
    }
    if (Node.isMethodDeclaration(property)) {
      const name = propertyName(property.getNameNode());
      summary.memberCount += 1;
      if (name !== undefined) summary.functionMembers.add(name);
      continue;
    }
    if (Node.isPropertyAssignment(property)) {
      const name = propertyName(property.getNameNode());
      summary.memberCount += 1;
      if (name !== undefined && isFunctionValue(property.getInitializer())) {
        summary.functionMembers.add(name);
      }
      continue;
    }
    if (Node.isShorthandPropertyAssignment(property)) {
      const name = property.getName();
      summary.memberCount += 1;
      summary.shorthandMembers.set(name, name);
      continue;
    }
    summary.memberCount += 1;
  }
  return summary;
}

function classMembers(declaration: Node): MemberSummary {
  const summary = emptyMembers();
  if (!Node.isClassDeclaration(declaration) && !Node.isClassExpression(declaration)) return summary;
  for (const method of declaration.getMethods()) {
    const name = method.getName();
    summary.memberCount += 1;
    summary.functionMembers.add(name);
  }
  for (const property of declaration.getProperties()) {
    summary.memberCount += 1;
    if (isFunctionValue(property.getInitializer())) summary.functionMembers.add(property.getName());
  }
  return summary;
}

function bindingFor(
  name: string,
  kind: DeclarationKind,
  exported: boolean,
  isDefaultExport: boolean,
  declaration: Node,
  initializer: Node | undefined,
  members: MemberSummary,
): ModuleBinding {
  return {
    name,
    kind,
    exported,
    isDefaultExport,
    declaration,
    ...(initializer !== undefined ? { initializer } : {}),
    functionMembers: members.functionMembers,
    shorthandMembers: members.shorthandMembers,
    memberCount: members.memberCount,
    membersUnknown: members.membersUnknown,
  };
}

/** Classifies a variable declaration by what it is initialised with. */
function variableKind(initializer: Node | undefined): DeclarationKind {
  if (initializer === undefined) return 'variable';
  const value = unwrapExpression(initializer);
  if (isFunctionValue(value)) return 'function';
  if (Node.isObjectLiteralExpression(value)) return 'object-literal';
  if (Node.isClassExpression(value)) return 'class';
  return 'variable';
}

/** Reads every top-level binding, import and export out of one file. */
export function readModule(sourceFile: SourceFile, file: string): ModuleInfo {
  const info: ModuleInfo = {
    file,
    sourceFile,
    bindings: new Map(),
    imports: new Map(),
    localExports: new Map(),
    reExports: [],
    importedSpecifiers: [],
  };

  for (const declaration of sourceFile.getFunctions()) {
    const name = declaration.getName();
    if (name === undefined) continue;
    info.bindings.set(
      name,
      bindingFor(
        name,
        'function',
        declaration.isExported(),
        declaration.isDefaultExport(),
        declaration,
        undefined,
        emptyMembers(),
      ),
    );
  }

  for (const declaration of sourceFile.getClasses()) {
    const name = declaration.getName();
    if (name === undefined) continue;
    info.bindings.set(
      name,
      bindingFor(
        name,
        'class',
        declaration.isExported(),
        declaration.isDefaultExport(),
        declaration,
        undefined,
        classMembers(declaration),
      ),
    );
  }

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    const value = initializer === undefined ? undefined : unwrapExpression(initializer);
    const kind = variableKind(initializer);
    const members =
      value !== undefined && Node.isObjectLiteralExpression(value)
        ? summariseObjectMembers(value)
        : value !== undefined && Node.isClassExpression(value)
          ? classMembers(value)
          : emptyMembers();
    for (const name of bindingNames(declaration.getNameNode())) {
      info.bindings.set(
        name,
        bindingFor(
          name,
          Node.isIdentifier(declaration.getNameNode()) ? kind : 'variable',
          declaration.isExported(),
          declaration.isDefaultExport(),
          declaration,
          initializer,
          members,
        ),
      );
    }
  }

  for (const group of [sourceFile.getTypeAliases(), sourceFile.getInterfaces()]) {
    for (const declaration of group) {
      info.bindings.set(
        declaration.getName(),
        bindingFor(
          declaration.getName(),
          'type',
          declaration.isExported(),
          declaration.isDefaultExport(),
          declaration,
          undefined,
          emptyMembers(),
        ),
      );
    }
  }
  for (const declaration of sourceFile.getEnums()) {
    info.bindings.set(
      declaration.getName(),
      bindingFor(
        declaration.getName(),
        'variable',
        declaration.isExported(),
        declaration.isDefaultExport(),
        declaration,
        undefined,
        emptyMembers(),
      ),
    );
  }

  for (const declaration of sourceFile.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    info.importedSpecifiers.push(specifier);
    const typeOnly = declaration.isTypeOnly();

    const defaultImport = declaration.getDefaultImport();
    if (defaultImport) {
      info.imports.set(defaultImport.getText(), {
        localName: defaultImport.getText(),
        specifier,
        imported: 'default',
        typeOnly,
        node: defaultImport,
      });
    }

    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) {
      info.imports.set(namespaceImport.getText(), {
        localName: namespaceImport.getText(),
        specifier,
        imported: '*',
        typeOnly,
        node: namespaceImport,
      });
    }

    for (const specifierNode of declaration.getNamedImports()) {
      const imported = specifierNode.getName();
      const local = specifierNode.getAliasNode()?.getText() ?? imported;
      info.imports.set(local, {
        localName: local,
        specifier,
        imported,
        typeOnly: typeOnly || specifierNode.isTypeOnly(),
        node: specifierNode,
      });
    }
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const named = declaration.getNamedExports();
    if (specifier === undefined) {
      for (const specifierNode of named) {
        const local = specifierNode.getName();
        info.localExports.set(specifierNode.getAliasNode()?.getText() ?? local, local);
      }
      continue;
    }
    info.importedSpecifiers.push(specifier);
    if (named.length === 0) {
      info.reExports.push({ specifier, node: declaration });
      continue;
    }
    info.reExports.push({
      specifier,
      names: named.map((specifierNode) => ({
        exported: specifierNode.getAliasNode()?.getText() ?? specifierNode.getName(),
        local: specifierNode.getName(),
      })),
      node: declaration,
    });
  }

  for (const assignment of sourceFile.getExportAssignments()) {
    if (assignment.isExportEquals()) continue;
    const expression = assignment.getExpression();
    if (Node.isIdentifier(expression)) {
      info.localExports.set('default', expression.getText());
      continue;
    }
    info.bindings.set(
      'default',
      bindingFor(
        'default',
        variableKind(expression),
        true,
        true,
        assignment,
        expression,
        Node.isObjectLiteralExpression(expression)
          ? summariseObjectMembers(expression)
          : emptyMembers(),
      ),
    );
  }

  return info;
}

/** Builds the index from the already-parsed source files. */
export function buildModuleIndex(
  files: readonly { sourceFile: SourceFile; relativePath: string }[],
): ModuleIndex {
  const modules = new Map<string, ModuleInfo>();
  for (const { sourceFile, relativePath } of files) {
    modules.set(relativePath, readModule(sourceFile, relativePath));
  }
  return { modules };
}

// ---------------------------------------------------------------------------
// tsconfig `paths`
// ---------------------------------------------------------------------------

function splitPattern(pattern: string): { prefix: string; suffix: string; wildcard: boolean } {
  const star = pattern.indexOf('*');
  if (star === -1) return { prefix: pattern, suffix: '', wildcard: false };
  return { prefix: pattern.slice(0, star), suffix: pattern.slice(star + 1), wildcard: true };
}

/**
 * Compiles a tsconfig `paths` map into project-relative substitutions.
 *
 * `baseUrl` is already absolute by the time ts-morph hands the options over, so
 * every target is expressed relative to the project root here — the graph never
 * sees a path that depends on where the project happens to live.
 */
export function compilePathAliases(
  paths: Record<string, string[]> | undefined,
  baseDirectory: string,
  root: string,
  toRelative: (root: string, absolute: string) => string,
): PathAlias[] {
  if (!paths) return [];
  const baseRelative = toRelative(root, baseDirectory);
  const aliases: PathAlias[] = [];
  for (const key of Object.keys(paths).sort()) {
    const values = paths[key];
    if (values === undefined) continue;
    aliases.push({
      ...splitPattern(key),
      targets: values.map((value) =>
        path.posix.join(baseRelative, value.split(path.sep).join('/')),
      ),
    });
  }
  return aliases;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Candidate files a specifier without an extension could name. */
function candidateFiles(base: string): string[] {
  const normalised = path.posix.normalize(base);
  const withoutJs = normalised.replace(/\.(mjs|cjs|jsx|js)$/, '');
  const candidates: string[] = [];
  if (/\.tsx?$/.test(normalised)) candidates.push(normalised);
  for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    candidates.push(`${withoutJs}${suffix}`);
  }
  return candidates;
}

/** Options for {@link createSymbolResolver}. */
export interface SymbolResolverOptions {
  /** Compiled tsconfig `paths` entries. */
  pathAliases?: readonly PathAlias[];
}

/** Cross-file name resolution over a {@link ModuleIndex}. */
export interface SymbolResolver {
  readonly index: ModuleIndex;
  /** Resolves a module specifier written in `file`. */
  resolveModule(file: string, specifier: string, at?: Node): ModuleResolution;
  /** Resolves a bare identifier referenced at `from`, honouring shadowing. */
  resolveIdentifier(file: string, name: string, from: Node): SymbolTarget;
  /** Resolves `object.member` referenced at `from`. */
  resolveMember(file: string, objectName: string, member: string, from: Node): SymbolTarget;
  /** Resolves an identifier or property-access expression. */
  resolveExpression(file: string, expression: Node): SymbolTarget;
  /** Resolves an exported name of a module, following barrels. */
  resolveExport(file: string, exportName: string): DeclarationRef | undefined;
  /**
   * The literal value an expression denotes, when the source states one.
   *
   * Follows an identifier to its declaration and a `Obj.MEMBER` read to the
   * object literal's property — across module boundaries, because an import
   * resolves to exactly one declaration and stopping at the boundary would
   * lose every path written as a shared constant. A local binding of the same
   * name shadows the module one, as everywhere else.
   */
  constantString(file: string, expression: Node, from?: Node): string | undefined;
  /** Diagnostics accumulated so far, deduplicated. */
  diagnostics(): IndexerDiagnostic[];
}

/** A binding declared in `container` at that level, if any. */
function bindingInStatements(statements: readonly Node[], name: string): Node | undefined {
  for (const statement of statements) {
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) {
        if (bindingNames(declaration.getNameNode()).includes(name)) return declaration;
      }
      continue;
    }
    if (Node.isFunctionDeclaration(statement) && statement.getName() === name) return statement;
    if (Node.isClassDeclaration(statement) && statement.getName() === name) return statement;
  }
  return undefined;
}

/**
 * The innermost binding of `name` visible at `from`, excluding module scope.
 *
 * Module scope is excluded on purpose: the caller looks there afterwards, and
 * keeping the two searches apart is what makes "a local beats an import" a
 * property of the algorithm rather than of the order two maps happen to be
 * consulted in.
 */
function findLocalBinding(from: Node, name: string): Node | undefined {
  for (const ancestor of from.getAncestors()) {
    if (Node.isSourceFile(ancestor)) return undefined;

    if (Node.isFunctionLikeDeclaration(ancestor)) {
      for (const parameter of ancestor.getParameters()) {
        if (bindingNames(parameter.getNameNode()).includes(name)) return parameter;
      }
    }
    if (Node.isBlock(ancestor) || Node.isCaseClause(ancestor) || Node.isDefaultClause(ancestor)) {
      const found = bindingInStatements(ancestor.getStatements(), name);
      if (found) return found;
    }
    if (Node.isCatchClause(ancestor)) {
      const variable = ancestor.getVariableDeclaration();
      if (variable && bindingNames(variable.getNameNode()).includes(name)) return variable;
    }
    if (
      Node.isForStatement(ancestor) ||
      Node.isForOfStatement(ancestor) ||
      Node.isForInStatement(ancestor)
    ) {
      const initializer = ancestor.getInitializer();
      if (initializer && Node.isVariableDeclarationList(initializer)) {
        for (const declaration of initializer.getDeclarations()) {
          if (bindingNames(declaration.getNameNode()).includes(name)) return declaration;
        }
      }
    }
  }
  return undefined;
}

/** True when a node is a parameter, or destructured out of one. */
function isParameterBinding(node: Node): boolean {
  if (Node.isParameterDeclaration(node)) return true;
  return node.getAncestors().some((ancestor) => Node.isParameterDeclaration(ancestor));
}

/**
 * The function an initialiser holds, seeing through one wrapper call.
 *
 * `const load = useCallback(() => …)` binds a function just as plainly as
 * `const load = () => …` does; treating the memoised form as an opaque value
 * would turn every call to a memoised handler into a false "dynamic call".
 */
function holdsFunction(initializer: Node | undefined): boolean {
  if (initializer === undefined) return false;
  if (isFunctionValue(initializer)) return true;
  if (!Node.isCallExpression(initializer)) return false;
  return initializer.getArguments().some((argument) => isFunctionValue(argument));
}

function localTarget(declaration: Node): SymbolTarget {
  const initializer = Node.isVariableDeclaration(declaration)
    ? declaration.getInitializer()
    : undefined;
  const nameNode = Node.isVariableDeclaration(declaration)
    ? declaration.getNameNode()
    : Node.isParameterDeclaration(declaration)
      ? declaration.getNameNode()
      : undefined;
  const name = Node.isFunctionDeclaration(declaration)
    ? declaration.getName()
    : nameNode !== undefined && Node.isIdentifier(nameNode)
      ? nameNode.getText()
      : undefined;

  return {
    kind: 'local',
    declaration,
    isParameter: isParameterBinding(declaration),
    isFunction: Node.isFunctionDeclaration(declaration) || holdsFunction(initializer),
    ...(name !== undefined ? { name } : {}),
    isDestructured:
      Node.isBindingElement(declaration) ||
      (nameNode !== undefined && !Node.isIdentifier(nameNode)),
  };
}

/** Creates a resolver over an index. */
export function createSymbolResolver(
  index: ModuleIndex,
  options: SymbolResolverOptions = {},
): SymbolResolver {
  const aliases = options.pathAliases ?? [];
  const collected = new Map<string, IndexerDiagnostic>();

  function report(diagnostic: IndexerDiagnostic): void {
    const key = `${diagnostic.code}|${diagnostic.file ?? ''}|${diagnostic.line ?? 0}|${diagnostic.message}`;
    if (!collected.has(key)) collected.set(key, diagnostic);
  }

  function firstExisting(candidates: readonly string[]): string | undefined {
    for (const candidate of candidates) {
      if (index.modules.has(candidate)) return candidate;
    }
    return undefined;
  }

  function resolveAliased(specifier: string): string | undefined {
    for (const alias of aliases) {
      if (alias.wildcard) {
        if (!specifier.startsWith(alias.prefix) || !specifier.endsWith(alias.suffix)) continue;
        const middle = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length);
        for (const target of alias.targets) {
          const found = firstExisting(candidateFiles(target.replace('*', middle)));
          if (found !== undefined) return found;
        }
        continue;
      }
      if (specifier !== alias.prefix) continue;
      for (const target of alias.targets) {
        const found = firstExisting(candidateFiles(target));
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  function resolveModule(file: string, specifier: string, at?: Node): ModuleResolution {
    if (specifier.startsWith('.')) {
      const base = path.posix.join(path.posix.dirname(file), specifier);
      const found = firstExisting(candidateFiles(base));
      if (found !== undefined) return { kind: 'internal', file: found };
      if (at) {
        const { line } = at.getSourceFile().getLineAndColumnAtPos(at.getStart());
        report({
          code: 'UNRESOLVED_IMPORT',
          severity: 'info',
          message: `"${specifier}" does not resolve to an indexed file. Its symbols cannot be linked.`,
          file,
          line,
          excerpt: toExcerpt(at.getText()),
        });
      }
      return { kind: 'unresolved' };
    }

    const aliased = resolveAliased(specifier);
    if (aliased !== undefined) return { kind: 'internal', file: aliased };

    // A bare specifier is a dependency, not a mistake. Only a specifier that
    // *looks* like it belongs to the project and still names nothing is worth
    // reporting, and an alias prefix is the only way to tell.
    const looksAliased = aliases.some(
      (alias) => alias.wildcard && alias.prefix.length > 0 && specifier.startsWith(alias.prefix),
    );
    if (looksAliased && at) {
      const { line } = at.getSourceFile().getLineAndColumnAtPos(at.getStart());
      report({
        code: 'UNRESOLVED_IMPORT',
        severity: 'info',
        message: `"${specifier}" matches a tsconfig path alias but resolves to no indexed file.`,
        file,
        line,
        excerpt: toExcerpt(at.getText()),
      });
      return { kind: 'unresolved' };
    }
    return { kind: 'external' };
  }

  function refFor(file: string, binding: ModuleBinding, via: ResolutionVia): DeclarationRef {
    return { file, name: binding.name, kind: binding.kind, via, declaration: binding.declaration };
  }

  function resolveExportInternal(
    file: string,
    exportName: string,
    depth: number,
    seen: Set<string>,
  ): DeclarationRef | undefined {
    const key = `${file}|${exportName}`;
    if (seen.has(key)) return undefined;
    seen.add(key);

    if (depth > MAX_BARREL_DEPTH) {
      report({
        code: 'UNRESOLVED_IMPORT',
        severity: 'info',
        message:
          `"${exportName}" was followed through more than ${MAX_BARREL_DEPTH} re-export hops ` +
          `from "${file}" and was abandoned rather than guessed.`,
        file,
      });
      return undefined;
    }

    const info = index.modules.get(file);
    if (!info) return undefined;

    const binding = info.bindings.get(exportName);
    if (binding && binding.exported) return refFor(file, binding, 'import');
    if (exportName === 'default') {
      for (const candidate of info.bindings.values()) {
        if (candidate.isDefaultExport) return refFor(file, candidate, 'import');
      }
    }

    const localName = info.localExports.get(exportName);
    if (localName !== undefined) {
      const local = info.bindings.get(localName);
      if (local) return refFor(file, local, 'import');
      const imported = info.imports.get(localName);
      if (imported) {
        const module = resolveModule(file, imported.specifier, imported.node);
        if (module.kind === 'internal') {
          return resolveExportInternal(module.file, imported.imported, depth + 1, seen);
        }
        return undefined;
      }
    }

    for (const reExport of info.reExports) {
      if (!reExport.names) continue;
      const match = reExport.names.find((entry) => entry.exported === exportName);
      if (!match) continue;
      const module = resolveModule(file, reExport.specifier, reExport.node);
      if (module.kind !== 'internal') return undefined;
      return resolveExportInternal(module.file, match.local, depth + 1, seen);
    }

    // `export * from` may offer the name from several barrels at once. Two
    // answers is not a better answer than none, so it is none.
    const starHits: DeclarationRef[] = [];
    for (const reExport of info.reExports) {
      if (reExport.names) continue;
      const module = resolveModule(file, reExport.specifier, reExport.node);
      if (module.kind !== 'internal') continue;
      const found = resolveExportInternal(module.file, exportName, depth + 1, seen);
      if (found) starHits.push(found);
    }
    const [only] = starHits;
    return starHits.length === 1 && only !== undefined ? only : undefined;
  }

  function resolveExport(file: string, exportName: string): DeclarationRef | undefined {
    return resolveExportInternal(file, exportName, 0, new Set());
  }

  function memberOf(
    ref: DeclarationRef,
    member: string,
    via: ResolutionVia,
  ): SymbolTarget | undefined {
    const info = index.modules.get(ref.file);
    const binding = info?.bindings.get(ref.name);
    if (!binding) return undefined;

    // `const svc = { create }` names another declaration rather than owning one.
    const shorthand = binding.shorthandMembers.get(member);
    if (shorthand !== undefined) {
      const target = info?.bindings.get(shorthand);
      if (target) return { kind: 'declaration', ref: refFor(ref.file, target, via) };
      return undefined;
    }
    if (!binding.functionMembers.has(member)) return undefined;
    return {
      kind: 'declaration',
      ref: {
        file: ref.file,
        name: `${binding.name}.${member}`,
        kind: 'function',
        owner: binding.name,
        via,
        declaration: binding.declaration,
      },
    };
  }

  function resolveModuleLevel(file: string, name: string, depth = 0): SymbolTarget {
    if (depth > MAX_BARREL_DEPTH) return { kind: 'unknown' };
    const info = index.modules.get(file);
    if (!info) return { kind: 'unknown' };

    const binding = info.bindings.get(name);
    if (binding) {
      // `const create = clientService.create` is an alias, not a declaration.
      const initializer = binding.initializer;
      if (initializer && Node.isPropertyAccessExpression(initializer)) {
        const object = initializer.getExpression();
        if (Node.isIdentifier(object)) {
          const aliased = resolveMemberInternal(
            file,
            object.getText(),
            initializer.getName(),
            initializer,
            depth + 1,
          );
          if (aliased.kind === 'declaration') {
            return { kind: 'declaration', ref: { ...aliased.ref, via: 'local-alias' } };
          }
        }
      }
      if (initializer && Node.isIdentifier(initializer)) {
        const aliased = resolveModuleLevel(file, initializer.getText(), depth + 1);
        if (aliased.kind === 'declaration') return aliased;
      }
      return { kind: 'declaration', ref: refFor(file, binding, 'local-declaration') };
    }

    const imported = info.imports.get(name);
    if (imported) {
      const module = resolveModule(file, imported.specifier, imported.node);
      if (module.kind === 'external') {
        return { kind: 'external', specifier: imported.specifier, imported: imported.imported };
      }
      if (module.kind === 'unresolved') return { kind: 'unknown' };
      if (imported.imported === '*') return { kind: 'module-namespace', file: module.file };
      const ref = resolveExport(module.file, imported.imported);
      return ref ? { kind: 'declaration', ref } : { kind: 'unknown' };
    }

    return { kind: 'unknown' };
  }

  function resolveMemberInternal(
    file: string,
    objectName: string,
    member: string,
    from: Node,
    depth: number,
  ): SymbolTarget {
    const object = resolveIdentifier(file, objectName, from);
    if (object.kind === 'module-namespace') {
      const ref = resolveExport(object.file, member);
      return ref ? { kind: 'declaration', ref: { ...ref, via: 'namespace-member' } } : object;
    }
    if (object.kind === 'declaration') {
      const via: ResolutionVia =
        object.ref.via === 'local-declaration' ? 'local-member' : 'import-member';
      const found = memberOf(object.ref, member, via);
      if (found) return found;
      return { kind: 'unknown' };
    }
    if (object.kind === 'local') {
      // `const svc = new ClientService()` then `svc.list()`.
      const declaration = object.declaration;
      if (Node.isVariableDeclaration(declaration)) {
        const initializer = declaration.getInitializer();
        if (initializer && Node.isNewExpression(initializer) && depth <= MAX_BARREL_DEPTH) {
          const constructed = initializer.getExpression();
          if (Node.isIdentifier(constructed)) {
            const classTarget = resolveIdentifier(file, constructed.getText(), from);
            if (classTarget.kind === 'declaration' && classTarget.ref.kind === 'class') {
              const via: ResolutionVia =
                classTarget.ref.via === 'local-declaration' ? 'local-member' : 'import-member';
              const found = memberOf(classTarget.ref, member, via);
              if (found) return found;
            }
          }
        }
      }
      return object;
    }
    return object;
  }

  function resolveIdentifier(file: string, name: string, from: Node): SymbolTarget {
    const local = findLocalBinding(from, name);
    if (local) {
      if (Node.isVariableDeclaration(local)) {
        const initializer = local.getInitializer();
        if (initializer && Node.isPropertyAccessExpression(initializer)) {
          const object = initializer.getExpression();
          if (Node.isIdentifier(object)) {
            const aliased = resolveMemberInternal(
              file,
              object.getText(),
              initializer.getName(),
              initializer,
              1,
            );
            if (aliased.kind === 'declaration') {
              return { kind: 'declaration', ref: { ...aliased.ref, via: 'local-alias' } };
            }
          }
        }
      }
      return localTarget(local);
    }
    return resolveModuleLevel(file, name);
  }

  function resolveExpression(file: string, expression: Node): SymbolTarget {
    if (Node.isIdentifier(expression)) {
      return resolveIdentifier(file, expression.getText(), expression);
    }
    if (Node.isPropertyAccessExpression(expression)) {
      const object = expression.getExpression();
      if (Node.isIdentifier(object)) {
        return resolveMemberInternal(file, object.getText(), expression.getName(), expression, 0);
      }
    }
    return { kind: 'unknown' };
  }

  /** A node read as a plain string, accepting only literal forms. */
  function literalOf(node: Node | undefined): string | undefined {
    if (!node) return undefined;
    const value = unwrapExpression(node);
    if (Node.isStringLiteral(value)) return value.getLiteralValue();
    if (Node.isNoSubstitutionTemplateLiteral(value)) return value.getLiteralValue();
    return undefined;
  }

  /** The string an enum member is declared as, when it is declared as one. */
  function enumMemberString(declaration: Node | undefined, member: string): string | undefined {
    if (declaration === undefined || !Node.isEnumDeclaration(declaration)) return undefined;
    for (const candidate of declaration.getMembers()) {
      if (candidate.getName() !== member) continue;
      return literalOf(candidate.getInitializer());
    }
    return undefined;
  }

  /** The string a declaration's initialiser states, when it states one. */
  function declaredString(ref: DeclarationRef): string | undefined {
    return literalOf(index.modules.get(ref.file)?.bindings.get(ref.name)?.initializer);
  }

  function constantString(file: string, expression: Node, from?: Node): string | undefined {
    const value = unwrapExpression(expression);
    const direct = literalOf(value);
    if (direct !== undefined) return direct;

    if (Node.isIdentifier(value)) {
      const target = resolveIdentifier(file, value.getText(), from ?? value);
      return target.kind === 'declaration' ? declaredString(target.ref) : undefined;
    }

    if (Node.isPropertyAccessExpression(value)) {
      const object = value.getExpression();
      if (!Node.isIdentifier(object)) return undefined;
      const target = resolveIdentifier(file, object.getText(), from ?? object);
      if (target.kind !== 'declaration') return undefined;
      const binding = index.modules.get(target.ref.file)?.bindings.get(target.ref.name);
      // `enum Permission { Delete = 'clients:delete' }` states its members as
      // plainly as an object literal does, and reads the same way at the call
      // site. An enum member has no initialiser on the *binding*, so without
      // this branch `Permission.Delete` resolved to nothing at all.
      const enumerated = enumMemberString(binding?.declaration, value.getName());
      if (enumerated !== undefined) return enumerated;
      const literal = binding?.initializer;
      if (!literal) return undefined;
      const object_ = unwrapExpression(literal);
      if (!Node.isObjectLiteralExpression(object_)) return undefined;
      for (const property of object_.getProperties()) {
        if (!Node.isPropertyAssignment(property)) continue;
        const nameNode = property.getNameNode();
        const key = Node.isStringLiteral(nameNode)
          ? nameNode.getLiteralValue()
          : nameNode.getText();
        if (key === value.getName()) return literalOf(property.getInitializer());
      }
    }

    return undefined;
  }

  return {
    index,
    resolveModule,
    resolveIdentifier,
    resolveMember: (file, objectName, member, from) =>
      resolveMemberInternal(file, objectName, member, from, 0),
    resolveExpression,
    resolveExport,
    constantString,
    diagnostics: () => [...collected.values()],
  };
}
