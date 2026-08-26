/**
 * `product.json`: the artefact, and the bytes it is written in.
 *
 * ADR 0008 puts this file at the top of the output chain — Markdown is a
 * projection of it, never the other way round — which makes two properties load
 * bearing rather than tidy.
 *
 * **The bytes are deterministic.** Two runs over the same graph with the same
 * responses produce the same file, so a diff shows a real change in product
 * understanding instead of churn. That needs more than sorting arrays:
 * `JSON.stringify` preserves *insertion* order, so an object assembled by two
 * different code paths serialises to two different files even when it is the
 * same object. {@link normaliseProductModel} rebuilds every shape through one
 * literal, which makes key order a property of this module rather than a
 * property of whichever function happened to build the value.
 *
 * **One field has a clock in it, and it is quarantined.**
 * {@link ProductModelSource.generatedAt} is the only non-deterministic value in
 * the model, and {@link productModelHash} excludes it. A hash that moved every
 * time the file was regenerated would answer no question worth asking.
 *
 * Optional keys are omitted rather than written as `null`, because `null` and
 * absent are different states and a reader should not have to guess which one a
 * writer meant.
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_OUT_DIR,
  GRAPH_FILE_NAME,
  normaliseApplicationGraph,
} from '@statewavedev/guide-indexer';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import type {
  ClaimAssertion,
  ClaimProvenance,
  FeatureClaimSummary,
  GeneratorAttribution,
  ProductClaim,
  ProductFeature,
  ProductModel,
  ProductModelSource,
  ProductPermission,
  ProductWorkflow,
  ProductWorkflowStep,
  SemanticEvidence,
  SemanticVerificationSummary,
} from '@statewavedev/guide-shared';
import { productModelSchema } from '@statewavedev/guide-shared';
import { compareStrings } from './compare.js';

/** File name the Product Model is always written under. */
export const PRODUCT_FILE_NAME = 'product.json';

/** Where to read or write artefacts. */
export interface ProductFileOptions {
  root: string;
  /** Defaults to the indexer's `.statewave-guide`. */
  outDir?: string;
}

/** What was written. */
export interface WriteProductResult {
  path: string;
  /** Project-relative, because an absolute path in a committed artefact is a leak. */
  relativePath: string;
  bytes: number;
}

// ---------------------------------------------------------------------------
// Canonical shapes
// ---------------------------------------------------------------------------

/** Sorted, de-duplicated copy of a string array. */
function sortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

/** A record rebuilt with its keys in sorted order. */
function sortedRecord(record: Readonly<Record<string, number>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of Object.keys(record).sort(compareStrings)) {
    const value = record[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function normaliseEvidence(evidence: readonly SemanticEvidence[]): SemanticEvidence[] {
  const byRef = new Map<string, SemanticEvidence>();
  for (const record of evidence) {
    if (byRef.has(record.ref)) continue;
    byRef.set(record.ref, {
      ref: record.ref,
      kind: record.kind,
      ...(record.file === undefined ? {} : { file: record.file }),
      ...(record.line === undefined ? {} : { line: record.line }),
    });
  }
  return [...byRef.values()].sort((a, b) => compareStrings(a.ref, b.ref));
}

function normaliseAttribution(attribution: GeneratorAttribution): GeneratorAttribution {
  return {
    provider: attribution.provider,
    model: attribution.model,
    ...(attribution.version === undefined ? {} : { version: attribution.version }),
  };
}

function normaliseProvenance(provenance: ClaimProvenance): ClaimProvenance {
  return {
    graphHash: provenance.graphHash,
    ...(provenance.applicationVersion === undefined
      ? {}
      : { applicationVersion: provenance.applicationVersion }),
    ...(provenance.commit === undefined ? {} : { commit: provenance.commit }),
    dependencyFingerprint: provenance.dependencyFingerprint,
  };
}

/**
 * An assertion, with `targets` sorted.
 *
 * The order a model listed its targets in carries no meaning — the verifier
 * treats the list as a set — so preserving it would make the file depend on
 * something nobody reads.
 */
function normaliseAssertion(assertion: ClaimAssertion): ClaimAssertion {
  return {
    subjectRef: assertion.subjectRef,
    ...(assertion.subjectLabel === undefined ? {} : { subjectLabel: assertion.subjectLabel }),
    ...(assertion.action === undefined ? {} : { action: assertion.action }),
    ...(assertion.route === undefined ? {} : { route: assertion.route }),
    ...(assertion.permission === undefined ? {} : { permission: assertion.permission }),
    targets: sortedStrings(assertion.targets),
  };
}

function normaliseClaim(claim: ProductClaim): ProductClaim {
  return {
    id: claim.id,
    featureId: claim.featureId,
    type: claim.type,
    text: claim.text,
    ...(claim.assertion === undefined ? {} : { assertion: normaliseAssertion(claim.assertion) }),
    evidence: normaliseEvidence(claim.evidence),
    status: claim.status,
    ...(claim.outcome === undefined ? {} : { outcome: claim.outcome }),
    ...(claim.rejection === undefined
      ? {}
      : { rejection: { reason: claim.rejection.reason, detail: claim.rejection.detail } }),
    provenance: normaliseProvenance(claim.provenance),
    ...(claim.generatedBy === undefined
      ? {}
      : { generatedBy: normaliseAttribution(claim.generatedBy) }),
  };
}

/** Steps keep their own order: `index` is the meaning, not the sort key. */
function normaliseStep(step: ProductWorkflowStep): ProductWorkflowStep {
  return {
    index: step.index,
    text: step.text,
    targets: sortedStrings(step.targets),
    evidence: normaliseEvidence(step.evidence),
  };
}

function normaliseWorkflow(workflow: ProductWorkflow): ProductWorkflow {
  return {
    id: workflow.id,
    featureId: workflow.featureId,
    title: workflow.title,
    orderBasis: workflow.orderBasis,
    steps: [...workflow.steps].sort((a, b) => a.index - b.index).map(normaliseStep),
    evidence: normaliseEvidence(workflow.evidence),
    ...(workflow.generatedBy === undefined
      ? {}
      : { generatedBy: normaliseAttribution(workflow.generatedBy) }),
  };
}

function normalisePermission(permission: ProductPermission): ProductPermission {
  return {
    id: permission.id,
    requiredBy: sortedStrings(permission.requiredBy),
    evidence: normaliseEvidence(permission.evidence),
  };
}

function normaliseClaimSummary(summary: FeatureClaimSummary): FeatureClaimSummary {
  return {
    factualClaims: summary.factualClaims,
    structurallyVerified: summary.structurallyVerified,
    factualRejected: summary.factualRejected,
    languageClaims: summary.languageClaims,
    semanticallyGrounded: summary.semanticallyGrounded,
    languageRejected: summary.languageRejected,
    unsupportedActions: sortedRecord(summary.unsupportedActions),
  };
}

function normaliseFeature(feature: ProductFeature): ProductFeature {
  return {
    id: feature.id,
    kind: 'feature',
    title: feature.title,
    description: feature.description,
    ...(feature.purpose === undefined ? {} : { purpose: feature.purpose }),
    entryPoints: sortedStrings(feature.entryPoints),
    routes: sortedStrings(feature.routes),
    elements: sortedStrings(feature.elements),
    permissions: sortedStrings(feature.permissions),
    workflows: sortedStrings(feature.workflows),
    relatedFeatures: sortedStrings(feature.relatedFeatures),
    questions: sortedStrings(feature.questions),
    claims: sortedStrings(feature.claims),
    evidence: normaliseEvidence(feature.evidence),
    confidence: feature.confidence,
    claimSummary: normaliseClaimSummary(feature.claimSummary),
    idOrigin: feature.idOrigin,
    dependencyFingerprint: feature.dependencyFingerprint,
    dependsOn: sortedStrings(feature.dependsOn),
    ...(feature.generatedBy === undefined
      ? {}
      : { generatedBy: normaliseAttribution(feature.generatedBy) }),
  };
}

function normaliseSource(source: ProductModelSource): ProductModelSource {
  return {
    ...(source.commit === undefined ? {} : { commit: source.commit }),
    ...(source.applicationVersion === undefined
      ? {}
      : { applicationVersion: source.applicationVersion }),
    graphHash: source.graphHash,
    generatorVersion: source.generatorVersion,
    provider: source.provider,
    model: source.model,
    generatedAt: source.generatedAt,
  };
}

function normaliseVerification(
  verification: SemanticVerificationSummary,
): SemanticVerificationSummary {
  return {
    featureCandidates: verification.featureCandidates,
    featuresEnriched: verification.featuresEnriched,
    featuresAccepted: verification.featuresAccepted,
    featuresRejected: verification.featuresRejected,
    factualClaimsGenerated: verification.factualClaimsGenerated,
    structurallyVerified: verification.structurallyVerified,
    semanticallyGrounded: verification.semanticallyGrounded,
    claimsRejected: verification.claimsRejected,
    blocked: {
      unsupportedCapabilities: verification.blocked.unsupportedCapabilities,
      unsupportedConstraints: verification.blocked.unsupportedConstraints,
      unsupportedPermissions: verification.blocked.unsupportedPermissions,
      workflowStepsWithoutEvidence: verification.blocked.workflowStepsWithoutEvidence,
      unknownReferences: verification.blocked.unknownReferences,
    },
    evidenceCoverage: verification.evidenceCoverage,
    rejectionsByReason: sortedRecord(verification.rejectionsByReason),
  };
}

/**
 * Rebuilds a model in canonical order.
 *
 * Idempotent, and a pure function of its input: normalising twice produces the
 * same value as normalising once, which is what lets a caller compare a written
 * file against a freshly built model without knowing which of the two has been
 * through here.
 */
export function normaliseProductModel(model: ProductModel): ProductModel {
  return {
    version: 2,
    ...(model.application === undefined ? {} : { application: model.application }),
    source: normaliseSource(model.source),
    features: [...model.features].sort((a, b) => compareStrings(a.id, b.id)).map(normaliseFeature),
    workflows: [...model.workflows]
      .sort((a, b) => compareStrings(a.id, b.id))
      .map(normaliseWorkflow),
    claims: [...model.claims].sort((a, b) => compareStrings(a.id, b.id)).map(normaliseClaim),
    permissions: [...model.permissions]
      .sort((a, b) => compareStrings(a.id, b.id))
      .map(normalisePermission),
    verification: normaliseVerification(model.verification),
  };
}

/**
 * The exact bytes written to `product.json`.
 *
 * Two-space indentation and a trailing newline, so the file is a well-formed
 * text file that a diff viewer and `git` both handle without complaint.
 */
export function serializeProductModel(model: ProductModel): string {
  return `${JSON.stringify(normaliseProductModel(model), null, 2)}\n`;
}

/**
 * A hash of everything about a model except when it was generated.
 *
 * The one field with a clock in it is blanked rather than deleted, so the hash
 * still covers the *shape* of `source` — a model that lost its provider name
 * hashes differently from one that has it.
 */
export function productModelHash(model: ProductModel): string {
  const canonical = normaliseProductModel(model);
  const withoutClock: ProductModel = {
    ...canonical,
    source: { ...canonical.source, generatedAt: '' },
  };
  return createHash('sha256').update(JSON.stringify(withoutClock), 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Disk
// ---------------------------------------------------------------------------

/** Absolute path `product.json` lives at, given a project root. */
export function productModelPath(options: ProductFileOptions): string {
  return path.join(
    path.resolve(options.root),
    options.outDir ?? DEFAULT_OUT_DIR,
    PRODUCT_FILE_NAME,
  );
}

/** Absolute path `application.json` lives at, given a project root. */
export function applicationGraphPath(options: ProductFileOptions): string {
  return path.join(path.resolve(options.root), options.outDir ?? DEFAULT_OUT_DIR, GRAPH_FILE_NAME);
}

/** POSIX, project-relative, for anything a human reads. */
function relative(root: string, target: string): string {
  return path.relative(path.resolve(root), target).split(path.sep).join('/');
}

/** Writes the model, creating the output directory if it is not there. */
export async function writeProductModel(
  model: ProductModel,
  options: ProductFileOptions,
): Promise<WriteProductResult> {
  const filePath = productModelPath(options);
  const contents = serializeProductModel(model);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
  return {
    path: filePath,
    relativePath: relative(options.root, filePath),
    bytes: Buffer.byteLength(contents, 'utf8'),
  };
}

/** Parses JSON with a message that names the file rather than the offset alone. */
function parseJsonFile(contents: string, filePath: string): unknown {
  try {
    return JSON.parse(contents);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath} is not valid JSON: ${detail}`);
  }
}

/**
 * Reads and validates `product.json`.
 *
 * Validated on the way in, not trusted. The file is a build artefact that may
 * have been produced by an older generator, hand-edited against ADR 0008's
 * advice, or truncated by a failed write, and every one of those produces a
 * clearer failure here than a `TypeError` three modules later.
 */
export async function readProductModel(options: ProductFileOptions): Promise<ProductModel> {
  const filePath = productModelPath(options);
  const contents = await readFile(filePath, 'utf8');
  const parsed = productModelSchema.safeParse(parseJsonFile(contents, filePath));
  if (!parsed.success) {
    throw new Error(`${filePath} is not a valid Product Model: ${parsed.error.message}`);
  }
  return normaliseProductModel(parsed.data as ProductModel);
}

/**
 * Reads `application.json`.
 *
 * The graph has no runtime schema in `@statewavedev/guide-shared` — it is
 * validated structurally by the indexer that writes it — so this checks the
 * shape it depends on and says plainly what is missing rather than failing
 * somewhere downstream with a graph that is half a graph.
 */
export async function readApplicationGraph(options: ProductFileOptions): Promise<ApplicationGraph> {
  const filePath = applicationGraphPath(options);
  const parsed = parseJsonFile(await readFile(filePath, 'utf8'), filePath);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${filePath} does not contain an ApplicationGraph.`);
  }
  const graph = parsed as Partial<ApplicationGraph>;
  if (graph.version !== 2 || !Array.isArray(graph.nodes) || !Array.isArray(graph.relationships)) {
    throw new Error(
      `${filePath} is not a version 2 ApplicationGraph. Re-run the indexer to regenerate it.`,
    );
  }
  return normaliseApplicationGraph(parsed as ApplicationGraph);
}
