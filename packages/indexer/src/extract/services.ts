/**
 * Service detection.
 *
 * A service is recognised by its *shape*: an object whose members are mostly
 * functions, or a class with methods. The `*Service` naming convention is
 * recorded as {@link ServiceNode.nameSuggestsService} and never consulted to
 * decide the question — a name is a label someone chose, and labelling
 * `formatters` as a service because a colleague called it `formatService`
 * would put a fact in the graph that the code does not support.
 *
 * The thresholds are deliberately conservative. One function on an object is
 * indistinguishable from a config record with a callback in it, so two is the
 * minimum, and a spread member disqualifies the object entirely: a surface we
 * cannot enumerate is a surface we cannot describe.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { ClassDeclaration, ObjectLiteralExpression, SourceFile } from 'ts-morph';
import type { FunctionForm, ServiceNode } from '../graph.js';
import { functionId, serviceId } from '../node-id.js';
import { nodeProvenance } from '../provenance.js';
import type { ModuleInfo } from '../resolve/symbols.js';

/** Fewest function members an object literal needs before it is a service. */
export const MIN_SERVICE_MEMBERS = 2;

/** One member of a service, as the function extractor needs it. */
export interface ServiceMember {
  /** Bare member name, e.g. `create`. */
  member: string;
  form: FunctionForm;
  isAsync: boolean;
  parameterCount: number;
  /** The node the member is declared at. */
  declaration: Node;
  /**
   * Set when the member is `{ create }` shorthand: the member is a reference to
   * a declaration elsewhere in the module, so its function node is that one.
   */
  referencesLocal?: string;
}

/** What one file's services look like. */
export interface ExtractedServices {
  services: ServiceNode[];
  /** Service node id, keyed by the owning binding name. */
  serviceIdByOwner: Map<string, string>;
  /** Members, keyed by the owning binding name. */
  membersByOwner: Map<string, ServiceMember[]>;
}

function formOf(node: Node): FunctionForm {
  if (Node.isMethodDeclaration(node)) return 'method';
  if (Node.isArrowFunction(node)) return 'arrow';
  if (Node.isFunctionExpression(node)) return 'expression';
  return 'declaration';
}

function readName(node: Node): string | undefined {
  if (Node.isIdentifier(node)) return node.getText();
  if (Node.isStringLiteral(node)) return node.getLiteralValue();
  return undefined;
}

/** Every function-valued member of an object literal, in source order. */
export function objectMembers(
  object: ObjectLiteralExpression,
  module: ModuleInfo,
): ServiceMember[] {
  const members: ServiceMember[] = [];
  for (const property of object.getProperties()) {
    if (Node.isMethodDeclaration(property)) {
      const name = readName(property.getNameNode());
      if (name === undefined) continue;
      members.push({
        member: name,
        form: 'method',
        isAsync: property.isAsync(),
        parameterCount: property.getParameters().length,
        declaration: property,
      });
      continue;
    }
    if (Node.isPropertyAssignment(property)) {
      const name = readName(property.getNameNode());
      const initializer = property.getInitializer();
      if (name === undefined || initializer === undefined) continue;
      if (!Node.isArrowFunction(initializer) && !Node.isFunctionExpression(initializer)) continue;
      members.push({
        member: name,
        form: formOf(initializer),
        isAsync: initializer.isAsync(),
        parameterCount: initializer.getParameters().length,
        declaration: initializer,
      });
      continue;
    }
    if (Node.isShorthandPropertyAssignment(property)) {
      const name = property.getName();
      const binding = module.bindings.get(name);
      if (!binding || binding.kind !== 'function') continue;
      members.push({
        member: name,
        form: 'declaration',
        isAsync: false,
        parameterCount: 0,
        declaration: property,
        referencesLocal: name,
      });
    }
  }
  return members;
}

/** Every method of a class, in source order. */
export function classMethodMembers(declaration: ClassDeclaration): ServiceMember[] {
  return declaration.getMethods().map((method) => ({
    member: method.getName(),
    form: 'method' as const,
    isAsync: method.isAsync(),
    parameterCount: method.getParameters().length,
    declaration: method,
  }));
}

/**
 * `true` when an object literal's members are *mostly* functions.
 *
 * "Mostly" is half or more, on top of the two-function floor: a client object
 * that also carries a `baseUrl` string is still a service, while a config
 * record with one callback in it is not.
 */
function looksLikeService(members: readonly ServiceMember[], totalMembers: number): boolean {
  return members.length >= MIN_SERVICE_MEMBERS && members.length * 2 >= totalMembers;
}

/** Detects the services declared at the top level of one file. */
export function extractServices(
  sourceFile: SourceFile,
  relativePath: string,
  module: ModuleInfo,
): ExtractedServices {
  const services: ServiceNode[] = [];
  const serviceIdByOwner = new Map<string, string>();
  const membersByOwner = new Map<string, ServiceMember[]>();

  const add = (
    name: string,
    detectedFrom: ServiceNode['detectedFrom'],
    declaration: Node,
    members: ServiceMember[],
  ): void => {
    const id = serviceId(relativePath, name);
    if (serviceIdByOwner.has(name)) return;
    serviceIdByOwner.set(name, id);
    membersByOwner.set(name, members);
    services.push({
      kind: 'service',
      id,
      name,
      // Filled in by the pipeline once the member functions have node ids.
      memberIds: [],
      detectedFrom,
      nameSuggestsService: /Service$/.test(name),
      provenance: nodeProvenance(declaration, relativePath, name),
    });
  };

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const nameNode = declaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    const initializer = declaration.getInitializer();
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) continue;

    const binding = module.bindings.get(nameNode.getText());
    if (binding?.membersUnknown === true) continue;

    const members = objectMembers(initializer, module);
    if (!looksLikeService(members, binding?.memberCount ?? members.length)) continue;
    add(nameNode.getText(), 'object-literal', declaration, members);
  }

  for (const declaration of sourceFile.getClasses()) {
    const name = declaration.getName();
    if (name === undefined) continue;
    const members = classMethodMembers(declaration);
    if (members.length < MIN_SERVICE_MEMBERS) continue;
    add(name, 'class', declaration, members);
  }

  return { services, serviceIdByOwner, membersByOwner };
}

/** The function node id a service member is addressed by. */
export function memberFunctionId(
  relativePath: string,
  owner: string,
  member: ServiceMember,
): string {
  return member.referencesLocal !== undefined
    ? functionId(relativePath, member.referencesLocal)
    : functionId(relativePath, `${owner}.${member.member}`);
}
