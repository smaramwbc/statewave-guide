/**
 * Markdown: a projection of the Product Model, and nothing else.
 *
 * ADR 0008 fixes the chain of authority — source code, then the
 * ApplicationGraph, then `product.json`, then Markdown — and this module sits at
 * the bottom of it. Every sentence here is read out of a
 * {@link ProductModel}; **no model response reaches this file**, and there is no
 * parameter through which one could. A page that could reach past the Product
 * Model would be a second, unverified source of product truth wearing the
 * clothes of a rendering.
 *
 * Three things every page does.
 *
 * **It marks interpretation as interpretation.** Verified facts and generated
 * language are printed under different headings, with different framing, and the
 * language section says outright that nothing establishes it is true. Collapsing
 * the two into one readable paragraph is the single most misleading thing this
 * package could do, and a reader who cannot tell them apart is worse off than
 * one with no page at all.
 *
 * **It shows what was refused.** A feature's rejected claims are printed with
 * their reasons. "What did the model try to say that we would not let it" is the
 * question that tells a reviewer whether verification is working, and an empty
 * refusals table is itself informative.
 *
 * **It says which application it describes.** Commit, graph hash, generator
 * version, provider and model travel in the front matter of every file.
 * `generatedAt` deliberately does not: it is the one field with a clock in it,
 * and including it would make every regeneration a diff.
 *
 * Generated Markdown is never hand-edited. It is regenerated, and it may be
 * deleted at any time without loss.
 *
 * @packageDocumentation
 */

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ProductClaim,
  ProductFeature,
  ProductModel,
  ProductWorkflow,
} from '@statewavedev/guide-shared';
import { UNSUPPORTED_CAPABILITY_ACTIONS } from '@statewavedev/guide-shared';
import { compareStrings } from './compare.js';

/** The marker that identifies a file as ours, in the front matter of every page. */
export const DOC_MARKER = 'statewave_guide';

/** Default directory Markdown is projected into. */
export const DEFAULT_DOCS_DIR = 'docs';

/** One projected file. */
export interface DocFile {
  /** POSIX path relative to the docs directory, e.g. `features/clients.create.md`. */
  path: string;
  contents: string;
}

/** Where to write the projection. */
export interface WriteDocsOptions {
  root: string;
  /** Defaults to {@link DEFAULT_DOCS_DIR}. */
  docsDir?: string;
  /**
   * Remove generated pages this projection no longer produces. Default `true`.
   *
   * Only files under `features/` and `workflows/` whose front matter carries
   * {@link DOC_MARKER} are ever removed — a directory a team also keeps its own
   * writing in must survive intact, so recognising our own output is the
   * condition rather than the file extension.
   */
  prune?: boolean;
}

/** What was written. */
export interface WriteDocsResult {
  /** Project-relative paths written, sorted. */
  written: string[];
  /** Project-relative paths removed as stale, sorted. */
  removed: string[];
}

// ---------------------------------------------------------------------------
// Markdown primitives
// ---------------------------------------------------------------------------

/** One line, with surrounding space removed. Never escapes. */
function oneLine(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim();
}

/**
 * A value safe to place in a table cell.
 *
 * Escaping happens here and only here. A relationship id is
 * `source|type|target`, so an unescaped one silently splits a row into extra
 * columns — and escaping twice, once in a helper and once in the table, turns
 * `\|` into `\\|` and prints the backslash. One place, one pass.
 */
function cell(value: string): string {
  return oneLine(value).replace(/\|/g, '\\|');
}

/** Back-ticked code, or an em dash when there is nothing to show. */
function code(values: readonly string[]): string {
  if (values.length === 0) return '—';
  return values.map((value) => `\`${oneLine(value)}\``).join(', ');
}

/** A Markdown table, or nothing at all when there are no rows. */
function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  if (rows.length === 0) return [];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ];
}

/** A whole-number percentage, without `Intl` and therefore without a locale. */
function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * A file name for an id.
 *
 * Ids are already constrained — a semantic id matches
 * `GUIDE_ELEMENT_ID_PATTERN` and a derived id is built from slugged segments —
 * so this is defence in depth rather than the first line of it. A leading dot is
 * stripped and separators are collapsed, because a projection should never be
 * able to name a path outside the directory it was pointed at.
 */
export function docSlug(id: string): string {
  const slug = id
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');
  return slug === '' ? 'unnamed' : slug;
}

/**
 * Assigns one path per id, resolving the collisions slugging can create.
 *
 * `a.b` and `a-b` slug to different names, but a hostile or unusual id could
 * still collide. Ids are visited in sorted order and a discriminator is
 * appended, so the assignment is a pure function of the id set rather than of
 * iteration order.
 */
function assignPaths(directory: string, ids: readonly string[]): Map<string, string> {
  const taken = new Set<string>();
  const paths = new Map<string, string>();
  for (const id of [...ids].sort(compareStrings)) {
    const base = docSlug(id);
    let name = base;
    for (let discriminator = 2; taken.has(name); discriminator += 1) {
      name = `${base}-${discriminator}`;
    }
    taken.add(name);
    paths.set(id, `${directory}/${name}.md`);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------

/** A YAML scalar that cannot be misread as structure. */
function yamlValue(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._/:-]*$/.test(value) ? value : JSON.stringify(value);
}

/**
 * The source block every page carries.
 *
 * `generatedAt` is excluded on purpose. It is the only non-deterministic field
 * in the model, and a page that changed on every run would drown a real change
 * in noise — which is the failure ADR 0008 exists to avoid.
 */
function frontMatter(model: ProductModel, kind: string, id: string): string[] {
  const { source } = model;
  return [
    '---',
    `${DOC_MARKER}: ${kind}`,
    `id: ${yamlValue(id)}`,
    ...(model.application === undefined ? [] : [`application: ${yamlValue(model.application)}`]),
    ...(source.applicationVersion === undefined
      ? []
      : [`application_version: ${yamlValue(source.applicationVersion)}`]),
    ...(source.commit === undefined ? [] : [`commit: ${yamlValue(source.commit)}`]),
    `graph_hash: ${yamlValue(source.graphHash)}`,
    `generator_version: ${yamlValue(source.generatorVersion)}`,
    `provider: ${yamlValue(source.provider)}`,
    `model: ${yamlValue(source.model)}`,
    '---',
    '',
    '<!-- Generated by Statewave Guide from .statewave-guide/product.json.',
    '     Do not edit: this file is a projection and is overwritten on every run.',
    '     Correct it by changing the code, not the page. -->',
    '',
  ];
}

// ---------------------------------------------------------------------------
// Feature pages
// ---------------------------------------------------------------------------

/** The claims belonging to one feature, in id order. */
function claimsOf(model: ProductModel, featureId: string): ProductClaim[] {
  return model.claims
    .filter((claim) => claim.featureId === featureId)
    .sort((a, b) => compareStrings(a.id, b.id));
}

/** `capability/create`, or just `navigation` for a type with no verb. */
function claimLabel(claim: ProductClaim): string {
  const action = claim.assertion?.action;
  return action === undefined ? claim.type : `${claim.type}/${action}`;
}

/**
 * The part of a claim that was actually checked, printed beside the part that
 * was not.
 *
 * A row in the verified table used to be a sentence, a label and a list of ids,
 * which reads as though the sentence is what the graph upheld. It is not: the
 * verifier resolves `{ subjectRef, action, route, permission, targets }`, and
 * the sentence is a rendering of that a model wrote. Showing the assertion is
 * the cheapest way to make the difference visible on the page rather than only
 * in the type definitions.
 */
function assertionSummary(claim: ProductClaim): string {
  const assertion = claim.assertion;
  if (assertion === undefined) return '—';
  const parts = [`subject \`${oneLine(assertion.subjectRef)}\``];
  if (assertion.route !== undefined) parts.push(`route \`${oneLine(assertion.route)}\``);
  if (assertion.permission !== undefined) {
    parts.push(`permission \`${oneLine(assertion.permission)}\``);
  }
  return parts.join(', ');
}

/** One feature, as a page. */
export function renderFeatureDoc(
  model: ProductModel,
  feature: ProductFeature,
  links: { workflows: ReadonlyMap<string, string> },
): string {
  const claims = claimsOf(model, feature.id);
  const verified = claims.filter((claim) => claim.status === 'structurally_verified');
  const grounded = claims.filter((claim) => claim.status === 'semantically_grounded');
  const refused = claims.filter((claim) => claim.status === 'rejected');
  const summary = feature.claimSummary;

  const lines: string[] = [
    ...frontMatter(model, 'feature', feature.id),
    `# ${feature.title}`,
    '',
    feature.description,
    '',
    '_The heading above is a generated name, and the paragraph under it is composed from the verified',
    'assertions below. Neither is itself a verified claim._',
    '',
    `**${percentage(feature.confidence)} of this feature's factual claims were structurally verified** ` +
      `(${summary.structurallyVerified} of ${summary.factualClaims}). ` +
      `Its identifier is \`${feature.id}\`, ${
        feature.idOrigin === 'semantic-id'
          ? 'taken from a `data-guide` identifier in the source.'
          : 'derived from graph identities and provisional.'
      }`,
    '',
    '## Where it lives',
    '',
    ...table(
      ['', ''],
      [
        ['Routes', code(feature.routes)],
        ['Elements', code(feature.elements)],
        ['Permissions', code(feature.permissions)],
        ['Entry points', code(feature.entryPoints)],
      ],
    ),
    '',
  ];

  lines.push(
    '## Verified facts',
    '',
    ...(verified.length === 0
      ? [
          'Nothing about this feature was structurally verified. Everything below, if anything, is interpretation.',
        ]
      : [
          'The **assertion** in each row — its kind, its subject, and any route or permission it names —',
          'was checked against the ApplicationGraph and upheld. The evidence column names the graph facts',
          'that satisfied the verification rule.',
          '',
          '> The **wording** in the first column is generated language and was **not** itself verified.',
          '> It is scanned for capability and effect words no accepted claim supports, and a sentence that',
          '> passes that scan can still say more than the assertion beside it does. Read the assertion for',
          '> what is established; read the wording for how someone phrased it.',
        ]),
    '',
    ...table(
      ['Wording (generated)', 'Kind', 'Checked assertion', 'Evidence'],
      verified.map((claim) => [
        claim.text,
        claimLabel(claim),
        assertionSummary(claim),
        code(claim.evidence.map((record) => record.ref)),
      ]),
    ),
    '',
  );

  lines.push(
    '## Interpretation — not verified',
    '',
    '> The sentences in this section are **language, not fact**. They were checked only for',
    '> pointing at evidence that exists; nothing here establishes that they are true.',
    '> Treat them as a reading of the facts above, written by a model.',
    '',
  );
  if (grounded.length === 0) {
    lines.push('No interpretation was recorded for this feature.', '');
  } else {
    for (const claim of grounded) {
      lines.push(`- _${claim.type}_ — ${cell(claim.text)}`);
    }
    lines.push('');
  }

  lines.push(
    '## Refused',
    '',
    refused.length === 0
      ? 'Nothing this model said about this feature was refused.'
      : 'These were proposed and not allowed through. They are kept so a refusal stays visible rather than becoming an absence nobody can audit.',
    '',
    ...table(
      ['Refused claim', 'Kind', 'Reason', 'Why'],
      refused.map((claim) => [
        claim.text,
        claimLabel(claim),
        claim.rejection?.reason ?? 'UNKNOWN',
        claim.rejection?.detail ?? '',
      ]),
    ),
    '',
  );

  const unsupported = Object.entries(summary.unsupportedActions).sort((a, b) =>
    compareStrings(a[0], b[0]),
  );
  if (unsupported.length > 0) {
    lines.push(
      '### Could not be checked',
      '',
      'The verification matrix has no rule for these. That is not the same as their being disproved —',
      'it means nothing here can confirm or deny them.',
      '',
      ...table(
        ['Assertion', 'Attempts'],
        unsupported.map(([key, count]) => [key, String(count)]),
      ),
      '',
    );
  }

  const workflowLinks = feature.workflows
    .map((id) => ({ id, target: links.workflows.get(id) }))
    .filter((entry): entry is { id: string; target: string } => entry.target !== undefined);
  if (workflowLinks.length > 0) {
    lines.push('## Steps', '');
    for (const entry of workflowLinks) {
      const workflow = model.workflows.find((candidate) => candidate.id === entry.id);
      lines.push(`- [${workflow?.title ?? entry.id}](../${entry.target})`);
    }
    lines.push('');
  }

  if (feature.questions.length > 0) {
    lines.push(
      '## Questions this may answer',
      '',
      '_Generated phrasings, not verified facts._',
      '',
      ...feature.questions.map((question) => `- ${cell(question)}`),
      '',
    );
  }

  if (feature.relatedFeatures.length > 0) {
    lines.push('## Related', '', code(feature.relatedFeatures), '');
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// Workflow pages
// ---------------------------------------------------------------------------

/** One workflow, as a page. */
export function renderWorkflowDoc(
  model: ProductModel,
  workflow: ProductWorkflow,
  links: { features: ReadonlyMap<string, string> },
): string {
  const feature = model.features.find((entry) => entry.id === workflow.featureId);
  const featurePath = links.features.get(workflow.featureId);

  const lines: string[] = [
    ...frontMatter(model, 'workflow', workflow.id),
    `# ${workflow.title}`,
    '',
    ...(feature === undefined || featurePath === undefined
      ? []
      : [`Part of [${feature.title}](../${featurePath}).`, '']),
    'Every step below is a `workflow_step` claim that was verified: its targets exist in the',
    'ApplicationGraph and belong to this feature. The **wording** of a step is generated language',
    'and was not itself verified — only what it points at was.',
    '',
    ...(workflow.orderBasis === 'ownership-path'
      ? ['## Steps', '']
      : [
          '## Steps, in no particular order',
          '',
          'The graph does not establish which of these happens first, so they are listed rather',
          'than sequenced. An order nobody proved would send a reader to the wrong control first',
          'and teach them the product works in a way it does not.',
          '',
        ]),
  ];

  const ordered = workflow.orderBasis === 'ownership-path';
  for (const step of workflow.steps) {
    lines.push(`${ordered ? `${step.index}.` : '-'} ${cell(step.text)}`);
    lines.push(`   - Points at: ${code(step.targets)}`);
  }
  lines.push('');

  const provenance = workflow.evidence.filter((record) => record.file !== undefined);
  if (provenance.length > 0) {
    lines.push(
      '## Source of each fact',
      '',
      ...table(
        ['Graph fact', 'File'],
        provenance.map((record) => [
          `\`${record.ref}\``,
          `${record.file ?? ''}${record.line === undefined ? '' : `:${record.line}`}`,
        ]),
      ),
      '',
    );
  }

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/** The landing page. */
export function renderIndexDoc(
  model: ProductModel,
  links: { features: ReadonlyMap<string, string>; workflows: ReadonlyMap<string, string> },
): string {
  const { verification } = model;
  const title = model.application ?? 'Product guide';

  const lines: string[] = [
    ...frontMatter(model, 'index', model.application ?? 'index'),
    `# ${title}`,
    '',
    'This guide is generated from source code. Nothing in it was written by hand, and nothing in it',
    'is a source of truth: the application is. Facts come from an ApplicationGraph built',
    'deterministically from the code; the sentences that explain them were generated and then checked',
    'against that graph, and anything that could not be checked is reported as refused rather than',
    'quietly dropped.',
    '',
    '## Features',
    '',
    ...table(
      ['Feature', 'Verified', 'Interpretation', 'Refused', 'Confidence'],
      model.features.map((feature) => {
        const target = links.features.get(feature.id);
        const name = target === undefined ? feature.title : `[${feature.title}](${target})`;
        return [
          name,
          String(feature.claimSummary.structurallyVerified),
          String(feature.claimSummary.semanticallyGrounded),
          String(feature.claimSummary.factualRejected + feature.claimSummary.languageRejected),
          percentage(feature.confidence),
        ];
      }),
    ),
    '',
  ];
  if (model.features.length === 0) {
    lines.push('No feature survived verification.', '');
  }

  if (model.workflows.length > 0) {
    lines.push(
      '## Workflows',
      '',
      ...table(
        ['Workflow', 'Steps'],
        model.workflows.map((workflow) => {
          const target = links.workflows.get(workflow.id);
          const name = target === undefined ? workflow.title : `[${workflow.title}](${target})`;
          return [name, String(workflow.steps.length)];
        }),
      ),
      '',
    );
  }

  if (model.permissions.length > 0) {
    lines.push(
      '## Permissions',
      '',
      '_Lifted from the graph, not generated._',
      '',
      ...table(
        ['Permission', 'Required by'],
        model.permissions.map((permission) => [
          `\`${permission.id}\``,
          String(permission.requiredBy.length),
        ]),
      ),
      '',
    );
  }

  const { blocked } = verification;
  const categorised =
    blocked.unsupportedCapabilities +
    blocked.unsupportedConstraints +
    blocked.unsupportedPermissions +
    blocked.workflowStepsWithoutEvidence +
    blocked.unknownReferences;
  // A candidate the provider never answered for is neither enriched nor refused.
  // Printing the gap keeps the four numbers above it from having to add up to
  // something they were never counting.
  const notAttempted = Math.max(0, verification.featureCandidates - verification.featuresEnriched);

  lines.push(
    '## What verification established',
    '',
    ...table(
      ['', ''],
      [
        ['Feature candidates', String(verification.featureCandidates)],
        ['Enriched (a response was verified)', String(verification.featuresEnriched)],
        ['Accepted', String(verification.featuresAccepted)],
        ['Refused by verification', String(verification.featuresRejected)],
        ...(notAttempted === 0
          ? []
          : [['Not attempted (no answer, or cancelled)', String(notAttempted)]]),
        ['Factual claims attempted', String(verification.factualClaimsGenerated)],
        ['Structurally verified', String(verification.structurallyVerified)],
        ['Semantically grounded', String(verification.semanticallyGrounded)],
        ['Claims refused', String(verification.claimsRejected)],
        [
          'Evidence coverage (accepted claims of either kind)',
          percentage(verification.evidenceCoverage),
        ],
      ],
    ),
    '',
    '### Refusals by category',
    '',
    'These five categories are a breakdown of the refusals above, not a total of them: a claim refused',
    'because the matrix has no rule for it was not *stopped*, it was never checked, and it is counted',
    'in the last row and in "Could not be checked" on the feature page.',
    '',
    ...table(
      ['Category', 'Refused'],
      [
        ['Unsupported capabilities', String(blocked.unsupportedCapabilities)],
        ['Unsupported constraints', String(blocked.unsupportedConstraints)],
        ['Unsupported permissions', String(blocked.unsupportedPermissions)],
        ['Workflow steps without evidence', String(blocked.workflowStepsWithoutEvidence)],
        ['Unknown references', String(blocked.unknownReferences)],
        [
          'Everything else (unchecked, or a malformed response)',
          String(Math.max(0, verification.claimsRejected - categorised)),
        ],
      ],
    ),
    '',
  );

  const reasons = Object.entries(verification.rejectionsByReason).sort((a, b) =>
    compareStrings(a[0], b[0]),
  );
  if (reasons.length > 0) {
    lines.push(
      '### Refusals by reason',
      '',
      ...table(
        ['Reason', 'Count'],
        reasons.map(([reason, count]) => [reason, String(count)]),
      ),
      '',
    );
  }

  lines.push(
    '## How to read this',
    '',
    '- **Verified** means an assertion was checked against the graph and upheld. It is the strong claim.',
    '- **Interpretation** means a sentence points at evidence that exists. It is _not_ a claim that the',
    '  sentence is true, and it is printed separately for that reason.',
    '- **Refused** means the pipeline would not let something through. The reason is recorded on the',
    '  feature page.',
    `- Some assertions cannot be checked at all — ${UNSUPPORTED_CAPABILITY_ACTIONS.map((action) => `\`${action}\``).join(', ')} have no`,
    '  verification rule. Those are counted apart, because "we could not check this" is not "this is',
    '  false". The list comes from the matrix itself, so it cannot drift out of date on this page.',
    '',
  );

  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// The projection
// ---------------------------------------------------------------------------

/**
 * Projects a whole model into Markdown.
 *
 * Pure: no clock, no filesystem, no network. Given the same model it returns the
 * same files with the same bytes, which is what makes `writeDocs` a no-op when
 * nothing about the product changed.
 */
export function projectDocs(model: ProductModel): DocFile[] {
  const featurePaths = assignPaths(
    'features',
    model.features.map((feature) => feature.id),
  );
  const workflowPaths = assignPaths(
    'workflows',
    model.workflows.map((workflow) => workflow.id),
  );
  const links = { features: featurePaths, workflows: workflowPaths };

  const files: DocFile[] = [{ path: 'index.md', contents: renderIndexDoc(model, links) }];
  for (const feature of model.features) {
    const target = featurePaths.get(feature.id);
    /* c8 ignore next -- every feature id was just given a path. */
    if (target === undefined) continue;
    files.push({ path: target, contents: renderFeatureDoc(model, feature, links) });
  }
  for (const workflow of model.workflows) {
    const target = workflowPaths.get(workflow.id);
    /* c8 ignore next -- every workflow id was just given a path. */
    if (target === undefined) continue;
    files.push({ path: target, contents: renderWorkflowDoc(model, workflow, links) });
  }
  return files.sort((a, b) => compareStrings(a.path, b.path));
}

/** True when a file on disk is one of ours, judged by its front matter. */
async function isGeneratedPage(filePath: string): Promise<boolean> {
  try {
    const head = (await readFile(filePath, 'utf8')).slice(0, 512);
    return head.startsWith('---') && head.includes(`${DOC_MARKER}:`);
  } catch {
    /* c8 ignore next 2 -- unreadable means "not ours", which is the safe answer. */
    return false;
  }
}

/** Generated pages under `features/` and `workflows/` that the projection did not produce. */
async function findStalePages(docsRoot: string, keep: ReadonlySet<string>): Promise<string[]> {
  const stale: string[] = [];
  for (const directory of ['features', 'workflows']) {
    let entries: string[];
    try {
      entries = await readdir(path.join(docsRoot, directory));
    } catch {
      continue;
    }
    for (const entry of entries.sort(compareStrings)) {
      if (!entry.endsWith('.md')) continue;
      const relativePath = `${directory}/${entry}`;
      if (keep.has(relativePath)) continue;
      const filePath = path.join(docsRoot, directory, entry);
      if (await isGeneratedPage(filePath)) stale.push(relativePath);
    }
  }
  return stale;
}

/**
 * Writes the projection to disk.
 *
 * Pruning removes only pages this module wrote, recognised by the marker in
 * their front matter. A team's own Markdown living in the same directory is
 * never touched — deleting someone's writing because it shared a folder with a
 * build artefact is not a trade worth making for tidiness.
 */
export async function writeDocs(
  model: ProductModel,
  options: WriteDocsOptions,
): Promise<WriteDocsResult> {
  const root = path.resolve(options.root);
  const docsDir = options.docsDir ?? DEFAULT_DOCS_DIR;
  const docsRoot = path.resolve(root, docsDir);
  const files = projectDocs(model);

  await mkdir(path.join(docsRoot, 'features'), { recursive: true });
  await mkdir(path.join(docsRoot, 'workflows'), { recursive: true });

  for (const file of files) {
    await writeFile(path.join(docsRoot, file.path), file.contents, 'utf8');
  }

  const removed: string[] = [];
  if (options.prune !== false) {
    const keep = new Set(files.map((file) => file.path));
    for (const relativePath of await findStalePages(docsRoot, keep)) {
      await unlink(path.join(docsRoot, relativePath));
      removed.push(`${docsDir}/${relativePath}`);
    }
  }

  return {
    written: files.map((file) => `${docsDir}/${file.path}`).sort(compareStrings),
    removed: removed.sort(compareStrings),
  };
}
