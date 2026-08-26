/**
 * Markdown as a projection.
 *
 * ADR 0008 says `product.json` is the artefact and Markdown is a rendering of
 * it. Two consequences are worth testing rather than trusting:
 *
 * **Nothing appears on a page that is not in the model.** The projection takes
 * one argument, and it is the model — so a sentence a model wrote that never
 * became a claim has no route to a reader. The test proves it by changing the
 * model and watching the page change, and by planting prose nowhere in the model
 * and watching it never appear.
 *
 * **Interpretation is visibly interpretation.** A generated `purpose` and a
 * verified `capability` are different guarantees, and a reader who cannot tell
 * them apart is worse off than one with no page. They live under different
 * headings, and the language section says outright that nothing establishes it
 * is true.
 */

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProductModel } from '@statewavedev/guide-shared';
import { UNSUPPORTED_CAPABILITY_ACTIONS } from '@statewavedev/guide-shared';
import { DOC_MARKER, docSlug, projectDocs, writeDocs } from '../src/docs.js';
import { enrichApplicationGraph } from '../src/enrich.js';
import { createMockProvider } from '../src/providers/mock.js';
import { clientsGraph } from './helpers.js';
import { claim, feature, productModel, summaryOf, workflow } from './model-helpers.js';

/** A small model with one verified fact, one interpretation and one refusal. */
function sampleModel(overrides: Partial<ProductModel> = {}): ProductModel {
  const claims = [
    claim({
      id: 'clients.create#capability:1',
      type: 'capability',
      text: 'A client can be created.',
      assertion: {
        subjectRef: 'feature:clients.create',
        action: 'create',
        targets: ['api:POST:/clients'],
      },
      evidence: [
        { ref: 'api:POST:/clients', kind: 'node', file: 'src/services/client.ts', line: 12 },
        {
          ref: 'function:src/services/client.ts#create|calls_api|api:POST:/clients',
          kind: 'relationship',
          file: 'src/services/client.ts',
          line: 12,
        },
      ],
    }),
    claim({
      id: 'clients.create#purpose:1',
      type: 'purpose',
      text: 'Someone uses this to keep the client list current.',
      status: 'semantically_grounded',
      assertion: undefined,
      outcome: undefined,
      evidence: [{ ref: 'element:clients.create', kind: 'node' }],
    }),
    claim({
      id: 'clients.create#capability:2',
      type: 'capability',
      text: 'Clients can be imported from a CSV file.',
      status: 'rejected',
      outcome: 'EXPLICITLY_UNSUPPORTED',
      rejection: {
        reason: 'UNSUPPORTED_CLAIM_RULE',
        detail: 'No verification rule exists for import.',
      },
      assertion: {
        subjectRef: 'feature:clients.create',
        action: 'import',
        targets: ['api:POST:/clients'],
      },
      evidence: [],
    }),
  ];

  const summary = { ...summaryOf(claims), unsupportedActions: { import: 1 } };
  return productModel({
    claims,
    features: [
      feature({
        description: 'You can create a new client from the Clients screen.',
        purpose: 'Someone uses this to keep the client list current.',
        claims: claims.map((entry) => entry.id),
        claimSummary: summary,
        confidence: 0.5,
        workflows: ['clients.create#workflow'],
        questions: ['How do I add a client?'],
      }),
    ],
    workflows: [workflow()],
    permissions: [
      {
        id: 'clients:create',
        requiredBy: ['element:clients.create'],
        evidence: [{ ref: 'permission:clients:create', kind: 'node' }],
      },
    ],
    ...overrides,
  });
}

function pageFor(model: ProductModel, target: string): string {
  const file = projectDocs(model).find((entry) => entry.path === target);
  if (file === undefined)
    throw new Error(
      `no page at ${target}: ${projectDocs(model)
        .map((f) => f.path)
        .join(', ')}`,
    );
  return file.contents;
}

describe('projectDocs', () => {
  it('produces an index, one page per feature and one per workflow', () => {
    const files = projectDocs(sampleModel());

    expect(files.map((file) => file.path)).toEqual([
      'features/clients.create.md',
      'index.md',
      'workflows/clients.create-workflow.md',
    ]);
  });

  it('is a pure function of the model', () => {
    const model = sampleModel();
    expect(projectDocs(model)).toEqual(projectDocs(model));
  });

  it('changes when the model changes, because it is derived from it', () => {
    const before = pageFor(sampleModel(), 'features/clients.create.md');
    const after = pageFor(
      sampleModel({
        features: [
          feature({
            description: 'You can delete a client from the Clients screen.',
            claimSummary: summaryOf([]),
          }),
        ],
      }),
      'features/clients.create.md',
    );

    expect(after).not.toBe(before);
    expect(after).toContain('You can delete a client');
  });

  it('never prints prose that is not in the model', () => {
    const model = sampleModel();
    const planted = 'Clients are synchronised nightly with an external CRM.';

    for (const file of projectDocs(model)) {
      expect(file.contents).not.toContain(planted);
    }
  });

  it('escapes a relationship id so it cannot split a table row', () => {
    const page = pageFor(sampleModel(), 'features/clients.create.md');

    expect(page).toContain('#create\\|calls_api\\|api:POST:/clients');
    expect(page).not.toContain('\\\\|');
  });
});

describe('source metadata', () => {
  it('travels in the front matter of every page', () => {
    for (const file of projectDocs(sampleModel())) {
      expect(file.contents.startsWith('---\n')).toBe(true);
      expect(file.contents).toContain(`${DOC_MARKER}:`);
      expect(file.contents).toContain('graph_hash: graph-hash');
      expect(file.contents).toContain('generator_version: 2.0.0');
      expect(file.contents).toContain('provider: mock');
      expect(file.contents).toContain('model: fixture');
      expect(file.contents).toContain('commit: abc1234');
      expect(file.contents).toContain('application_version: 1.2.3');
    }
  });

  it('leaves the clock out, so a regeneration is not a diff', () => {
    const model = sampleModel();
    const later: ProductModel = {
      ...model,
      source: { ...model.source, generatedAt: '2099-12-31T23:59:59.000Z' },
    };

    expect(projectDocs(later)).toEqual(projectDocs(model));
  });

  it('says the page is generated and must not be edited', () => {
    expect(pageFor(sampleModel(), 'index.md')).toContain('Do not edit');
  });
});

describe('interpretation is marked as interpretation', () => {
  const page = pageFor(sampleModel(), 'features/clients.create.md');

  it('puts verified facts and generated language under different headings', () => {
    expect(page).toContain('## Verified facts');
    expect(page).toContain('## Interpretation — not verified');
    expect(page.indexOf('## Verified facts')).toBeLessThan(
      page.indexOf('## Interpretation — not verified'),
    );
  });

  it('states plainly that the language section is not a claim of truth', () => {
    expect(page).toContain('**language, not fact**');
    expect(page).toContain('nothing here establishes that they are true');
  });

  it('prints the purpose only inside the interpretation section', () => {
    const interpretation = page.slice(page.indexOf('## Interpretation — not verified'));
    const verified = page.slice(
      page.indexOf('## Verified facts'),
      page.indexOf('## Interpretation — not verified'),
    );

    expect(interpretation).toContain('Someone uses this to keep the client list current.');
    expect(verified).not.toContain('Someone uses this to keep the client list current.');
  });

  it('marks generated questions as generated', () => {
    expect(page).toContain('_Generated phrasings, not verified facts._');
  });

  it('says the wording of a verified fact was not itself verified either', () => {
    // The feature page is the more prominent surface, and it used to print
    // `claim.text` under "Each row was checked against the ApplicationGraph and
    // upheld" with no caveat at all — while the workflow page, printing the same
    // model prose, carried the correct one. The claim column is a sentence; the
    // assertion beside it is what the graph upheld.
    expect(page).toContain('The **wording** in the first column is generated language');
    expect(page).toContain('**not** itself verified');
    expect(page).toContain('Checked assertion');
    expect(page).toContain('subject `feature:clients.create`');
  });

  it('marks the H1 and the paragraph under it as generated', () => {
    expect(page).toContain('The heading above is a generated name');
  });

  it('says a workflow step’s wording was not itself verified', () => {
    const workflowPage = pageFor(sampleModel(), 'workflows/clients.create-workflow.md');
    expect(workflowPage).toContain('was not itself verified');
    expect(workflowPage).toContain('1. Open Clients.');
    expect(workflowPage).toContain('`element:clients.create`');
  });
});

describe('refusals stay visible', () => {
  const page = pageFor(sampleModel(), 'features/clients.create.md');

  it('prints the refused claim, its reason and why', () => {
    expect(page).toContain('## Refused');
    expect(page).toContain('Clients can be imported from a CSV file.');
    expect(page).toContain('UNSUPPORTED_CLAIM_RULE');
    expect(page).toContain('No verification rule exists for import.');
  });

  it('separates what could not be checked from what was disproved', () => {
    expect(page).toContain('### Could not be checked');
    expect(page).toContain('it means nothing here can confirm or deny them');
  });

  it('says so when nothing was refused, rather than printing an empty table', () => {
    const clean = productModel({
      features: [feature({ description: 'A description.' })],
    });
    expect(pageFor(clean, 'features/clients.create.md')).toContain(
      'Nothing this model said about this feature was refused.',
    );
  });

  it('reports refusals by reason on the index', () => {
    const index = pageFor(sampleModel(), 'index.md');
    expect(index).toContain('### Refusals by reason');
    expect(index).toContain('UNSUPPORTED_CLAIM_RULE');
    expect(index).toContain('### Refusals by category');
  });

  it('does not present the category breakdown as a total of the refusals', () => {
    // The five named categories cover the refusals that are *findings about the
    // application*. A claim the matrix had no rule for was never checked, so it
    // belongs to none of them — and a table that implied otherwise would let a
    // run that refused a dozen claims print five zeroes.
    const index = pageFor(sampleModel(), 'index.md');
    expect(index).toContain('not a total of them');
    expect(index).toContain('Everything else (unchecked, or a malformed response)');
  });

  it('names every action the matrix cannot check, from the matrix itself', () => {
    const index = pageFor(sampleModel(), 'index.md');
    for (const action of UNSUPPORTED_CAPABILITY_ACTIONS) {
      expect(index, `the page must name ${action}`).toContain(`\`${action}\``);
    }
  });
});

describe('links between pages', () => {
  it('links the index to each feature', () => {
    expect(pageFor(sampleModel(), 'index.md')).toContain(
      '[Create a client](features/clients.create.md)',
    );
  });

  it('links a feature to its workflow and back again', () => {
    expect(pageFor(sampleModel(), 'features/clients.create.md')).toContain(
      '(../workflows/clients.create-workflow.md)',
    );
    expect(pageFor(sampleModel(), 'workflows/clients.create-workflow.md')).toContain(
      '(../features/clients.create.md)',
    );
  });

  it('says so when no feature survived', () => {
    expect(pageFor(productModel(), 'index.md')).toContain('No feature survived verification.');
  });
});

describe('docSlug', () => {
  it('leaves an ordinary id alone', () => {
    expect(docSlug('clients.create')).toBe('clients.create');
  });

  it('cannot name a path outside the directory it was given', () => {
    expect(docSlug('../../etc/passwd')).toBe('etc-passwd');
    expect(docSlug('..')).toBe('unnamed');
    expect(docSlug('/absolute')).toBe('absolute');
  });

  it('turns a workflow id into a file name', () => {
    expect(docSlug('clients.create#workflow')).toBe('clients.create-workflow');
  });

  it('never returns an empty name', () => {
    expect(docSlug('')).toBe('unnamed');
    expect(docSlug('///')).toBe('unnamed');
  });

  it('discriminates between ids that slug to the same name', () => {
    const model = productModel({
      features: [
        feature({ id: 'a.b', description: 'One.' }),
        feature({ id: 'a#b', description: 'Two.' }),
      ],
    });

    expect(projectDocs(model).map((file) => file.path)).toEqual([
      'features/a-b.md',
      'features/a.b.md',
      'index.md',
    ]);
  });
});

describe('writeDocs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'statewave-guide-docs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes exactly the projection', async () => {
    const result = await writeDocs(sampleModel(), { root });

    expect(result.written).toEqual([
      'docs/features/clients.create.md',
      'docs/index.md',
      'docs/workflows/clients.create-workflow.md',
    ]);
    expect(await readFile(path.join(root, 'docs/index.md'), 'utf8')).toContain('# fixture');
  });

  it('removes a generated page the model no longer produces', async () => {
    await writeDocs(sampleModel(), { root });

    const result = await writeDocs(
      productModel({ features: [feature({ id: 'other', description: 'Other.' })] }),
      { root },
    );

    expect(result.removed).toEqual([
      'docs/features/clients.create.md',
      'docs/workflows/clients.create-workflow.md',
    ]);
    expect(await readdir(path.join(root, 'docs/features'))).toEqual(['other.md']);
  });

  it('never removes Markdown it did not write', async () => {
    await mkdir(path.join(root, 'docs/features'), { recursive: true });
    const handwritten = path.join(root, 'docs/features/our-own-notes.md');
    await writeFile(handwritten, '# Our own notes\n', 'utf8');

    const result = await writeDocs(sampleModel(), { root });

    expect(result.removed).toEqual([]);
    expect(await readFile(handwritten, 'utf8')).toBe('# Our own notes\n');
  });

  it('leaves stale pages alone when pruning is off', async () => {
    await writeDocs(sampleModel(), { root });

    const result = await writeDocs(productModel(), { root, prune: false });

    expect(result.removed).toEqual([]);
    expect(await readdir(path.join(root, 'docs/features'))).toEqual(['clients.create.md']);
  });

  it('honours a docs directory of the caller’s choosing', async () => {
    const result = await writeDocs(sampleModel(), { root, docsDir: 'guide/product' });

    expect(result.written[0]).toBe('guide/product/features/clients.create.md');
    expect(await readdir(path.join(root, 'guide/product'))).toContain('index.md');
  });
});

describe('over a real enrichment run', () => {
  it('projects a page for every feature the pipeline accepted', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    const files = projectDocs(run.model);
    for (const feature of run.model.features) {
      const page = files.find((file) => file.path === `features/${feature.id}.md`);
      expect(page, `expected a page for ${feature.id}`).toBeDefined();
      expect(page?.contents).toContain(feature.description);
      expect(page?.contents).toContain(`graph_hash: ${run.model.source.graphHash}`);
    }
  });

  it('prints no page for a feature the pipeline refused', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ malformed: ['feature-enrichment:clients.create'] }),
    });

    expect(projectDocs(run.model).map((file) => file.path)).not.toContain(
      'features/clients.create.md',
    );
  });
});
