/**
 * The renderer, and the authority it does not have.
 *
 * Three things are being pinned here, and only the first is about prose.
 *
 * 1. The deterministic renderer's output is **exact**. Not "contains", not
 *    "matches a pattern" — the byte-for-byte sentence a user will read. A
 *    renderer whose output is only asserted loosely can drift a long way before
 *    a test notices, and drift in this file is drift in what the product claims
 *    to do.
 * 2. It composes from claim *assertions*, never from claim prose, so a rejected
 *    claim's words cannot reach a page even if a caller passes one in.
 * 3. `checkRenderedPropositions` finds nothing in its output. That zero is the
 *    whole point of the templates.
 * 4. What it no longer says. Routes, permissions and validation rules are still
 *    in the Product Model; they stopped being spoken. Several tests below pin
 *    that absence, because a fact finding its way back into a sentence is a
 *    regression a "contains" assertion would never catch.
 */

import { describe, expect, it } from 'vitest';
import type { ProductClaim } from '@statewavedev/guide-shared';
import { checkRenderedPropositions } from '../src/proposition.js';
import { NO_VERIFIED_DESCRIPTION, createDeterministicRenderer } from '../src/render.js';
import { claim, feature, summaryOf, workflow } from './model-helpers.js';

const renderer = createDeterministicRenderer();

/** The three claims the brief's worked example is built from. */
function clientCreationClaims(): ProductClaim[] {
  return [
    claim({
      id: 'clients.create#capability:1',
      type: 'capability',
      text: 'A client can be created.',
      assertion: {
        subjectRef: 'feature:clients.create',
        action: 'create',
        targets: ['api:POST:/clients'],
      },
    }),
    claim({
      id: 'clients.create#navigation:1',
      type: 'navigation',
      text: 'Clients live at /clients.',
      assertion: {
        subjectRef: 'feature:clients.create',
        route: '/clients',
        targets: ['route:/clients'],
      },
    }),
    claim({
      id: 'clients.create#permission:1',
      type: 'permission',
      text: 'Creating a client requires a permission.',
      assertion: {
        subjectRef: 'feature:clients.create',
        permission: 'clients:create',
        targets: ['permission:clients:create'],
      },
    }),
  ];
}

async function renderClaims(
  claims: ProductClaim[],
  overrides: Parameters<typeof feature>[0] = {},
): Promise<{ description: string; workflowIntro?: string }> {
  return renderer.render({
    feature: feature({ claimSummary: summaryOf(claims), ...overrides }),
    claims,
  });
}

describe('createDeterministicRenderer', () => {
  it('names itself, so a reader can tell which renderer wrote a page', () => {
    expect(renderer.name).toBe('deterministic');
  });

  it('composes the exact sentence the brief specifies', async () => {
    const rendered = await renderClaims(clientCreationClaims());

    // Three claims go in — a capability, a route and a permission — and one is
    // spoken. The other two are facts a reader cannot act on as prose: an
    // address, and an identifier they have no way to look up.
    expect(rendered.description).toBe('You can create a new client from the Clients screen.');
    expect(rendered.description).not.toContain('/clients');
    expect(rendered.description).not.toContain('clients:create');
  });

  it('produces the same bytes on every call', async () => {
    const claims = clientCreationClaims();
    const first = await renderClaims(claims);
    const second = await renderClaims(claims);
    expect(second).toEqual(first);
  });

  it('orders verbs by the capability vocabulary, not by the order claims arrived', async () => {
    const actions = ['delete', 'create', 'search', 'view'] as const;
    const claims = actions.map((action, index) =>
      claim({
        id: `clients#capability:${index + 1}`,
        type: 'capability',
        text: `A client can be ${action}d.`,
        assertion: { subjectRef: 'feature:clients.list', action, targets: ['api:GET:/clients'] },
      }),
    );

    const rendered = await renderClaims(claims);

    expect(rendered.description).toBe(
      'You can create a new client, view clients, delete a client and search clients from the Clients screen.',
    );
  });

  it('derives its noun from the subject reference, never from the label a model wrote', async () => {
    const rendered = await renderClaims([
      claim({
        assertion: {
          subjectRef: 'feature:clients.create',
          // A label is free text. If it could reach the page, a model could put
          // an unverifiable capability into a sentence built from a verified one.
          subjectLabel: 'the CSV import module for external systems',
          action: 'create',
          targets: ['api:POST:/clients'],
        },
      }),
    ]);

    expect(rendered.description).toBe('You can create a new client from the Clients screen.');
    expect(rendered.description).not.toMatch(/csv|import|external/i);
  });

  it('reads a node id as a subject as readily as a feature id', async () => {
    const rendered = await renderClaims([
      claim({
        assertion: {
          subjectRef: 'element:invoices.create',
          action: 'create',
          targets: ['api:POST:/invoices'],
        },
      }),
    ]);

    expect(rendered.description).toBe('You can create a new invoice from the Clients screen.');
  });

  it('drops structural segments so a button id does not become a noun', async () => {
    const rendered = await renderClaims([
      claim({
        assertion: {
          subjectRef: 'feature:admin.clients.form',
          action: 'submit',
          targets: ['element:admin.clients.form'],
        },
      }),
    ]);

    expect(rendered.description).toBe(
      'You can submit the admin client form from the Clients screen.',
    );
  });

  it('keeps a subject that is nothing but structure rather than rendering a hole', async () => {
    const rendered = await renderClaims([
      claim({
        assertion: { subjectRef: 'feature:form', action: 'submit', targets: ['element:form'] },
      }),
    ]);

    expect(rendered.description).toBe('You can submit the form form from the Clients screen.');
  });

  it('skips parameterised routes when naming a screen', async () => {
    const rendered = await renderClaims(clientCreationClaims(), {
      routes: ['/clients/:clientId'],
    });

    // There is no screen to name, so the sentence ends after the capability
    // rather than falling back to the path the navigation claim carries.
    expect(rendered.description).toBe('You can create a new client.');
    expect(rendered.description).not.toContain('/clients');
  });

  it('names the home screen when the feature lives at the root', async () => {
    const rendered = await renderClaims(
      [
        claim({
          assertion: { subjectRef: 'feature:dashboard', action: 'view', targets: ['route:/'] },
        }),
      ],
      { routes: ['/'] },
    );

    expect(rendered.description).toBe('You can view dashboard from the home screen.');
  });

  it('says nothing about permissions, however many a feature requires', async () => {
    const rendered = await renderClaims([
      claim({
        id: 'clients.create#permission:1',
        type: 'permission',
        text: 'One permission.',
        assertion: {
          subjectRef: 'feature:clients.create',
          permission: 'clients:create',
          targets: ['permission:clients:create'],
        },
      }),
      claim({
        id: 'clients.create#permission:2',
        type: 'permission',
        text: 'Another permission.',
        assertion: {
          subjectRef: 'feature:clients.create',
          permission: 'clients:write',
          targets: ['permission:clients:write'],
        },
      }),
    ]);

    // A permission identifier is a string a reader cannot look up, so no number
    // of them adds up to a sentence worth showing them. Both remain on the
    // feature and in claim provenance, and the guidance layer states the
    // requirement in words a reader can act on.
    expect(rendered.description).toBe('');
  });

  it('says only what a constraint rule actually establishes', async () => {
    const rendered = await renderClaims([
      claim({
        id: 'clients.create#constraint:1',
        type: 'constraint',
        text: 'The name must be at most 200 characters and is checked against a schema.',
        assertion: {
          subjectRef: 'feature:clients.create',
          targets: ['schema:src/schemas/client.ts#createClientSchema'],
        },
      }),
    ]);

    // Which is nothing a reader needs. The rule proves a schema exists, not
    // what it says, and the sentence that used to stand in for it — "Input is
    // validated before it is accepted" — is true of nearly every form ever
    // written. The claim stays in the model; the description says nothing.
    expect(rendered.description).toBe('');
  });

  it('says nothing when nothing was verified rather than writing around it', async () => {
    const rendered = await renderClaims([
      claim({
        id: 'clients.create#purpose:1',
        type: 'purpose',
        text: 'Keeps the client list current.',
        status: 'semantically_grounded',
        assertion: undefined,
        outcome: undefined,
      }),
    ]);

    // Internal uncertainty is a developer diagnostic. Somebody who wants to
    // know how to use the product has no use for a statement about our own
    // epistemology, so the fallback is silence and the reason travels as a
    // `GuidanceDiagnostic` instead.
    expect(NO_VERIFIED_DESCRIPTION).toBe('');
    expect(rendered.description).toBe(NO_VERIFIED_DESCRIPTION);
  });
});

describe('the renderer sees accepted claims and nothing else', () => {
  const rejected = claim({
    id: 'clients.create#capability:2',
    type: 'capability',
    text: 'Clients can be imported from a CSV file and synced with an external system.',
    status: 'rejected',
    outcome: 'EXPLICITLY_UNSUPPORTED',
    rejection: {
      reason: 'UNSUPPORTED_CLAIM_RULE',
      detail: 'No verification rule exists for import.',
    },
    assertion: {
      subjectRef: 'feature:clients.create',
      subjectLabel: 'the CSV importer',
      action: 'import',
      targets: ['api:POST:/clients'],
    },
  });

  it('never renders a rejected claim, even when one is handed to it', async () => {
    const claims = [...clientCreationClaims(), rejected];

    const rendered = await renderClaims(claims);

    expect(rendered.description).toBe('You can create a new client from the Clients screen.');
    expect(rendered.description).not.toContain('CSV');
    expect(rendered.description).not.toContain('import');
    expect(rendered.description).not.toContain('external');
    // Every word only the refused claim used is absent from the page. Words the
    // accepted claims also use are excluded, because "clients" appearing is a
    // fact about the accepted claims rather than a leak from the refused one.
    const allowed = new Set(
      clientCreationClaims()
        .flatMap((entry) => `${entry.text} ${entry.assertion?.subjectRef ?? ''}`.split(/[\s.:/]+/))
        .map((word) => word.toLowerCase()),
    );
    const distinctive = rejected.text
      .toLowerCase()
      .split(/[\s.]+/)
      .filter((word) => word.length >= 5 && !allowed.has(word));
    expect(distinctive).toContain('imported');
    for (const word of distinctive) {
      expect(rendered.description.toLowerCase()).not.toContain(word);
    }
  });

  it('introduces no watched proposition', async () => {
    const claims = clientCreationClaims();
    const rendered = await renderClaims(claims);

    const result = checkRenderedPropositions(rendered.description, claims);

    expect(result.introduced).toEqual([]);
    expect(result.checked).toBeGreaterThan(0);
  });

  it('introduces nothing even when a rejected import claim is in the list', async () => {
    const claims = [...clientCreationClaims(), rejected];
    const rendered = await renderClaims(claims);

    // The rejected claim is ignored on both sides: it cannot put a word on the
    // page, and it cannot license one either.
    expect(checkRenderedPropositions(rendered.description, claims).introduced).toEqual([]);
  });
});

describe('workflow intro', () => {
  it('is absent when the feature has no workflow', async () => {
    const rendered = await renderClaims(clientCreationClaims());
    expect(rendered.workflowIntro).toBeUndefined();
  });

  it('is absent when the workflow has no steps', async () => {
    const claims = clientCreationClaims();
    const rendered = await renderer.render({
      feature: feature({ claimSummary: summaryOf(claims) }),
      claims,
      workflow: workflow({ steps: [] }),
    });
    expect(rendered.workflowIntro).toBeUndefined();
  });

  it('leads with the feature’s first capability', async () => {
    const claims = clientCreationClaims();
    const rendered = await renderer.render({
      feature: feature({ claimSummary: summaryOf(claims) }),
      claims,
      workflow: workflow(),
    });
    expect(rendered.workflowIntro).toBe('To create a new client:');
  });

  it('falls back to a neutral lead when nothing was verified', async () => {
    const rendered = await renderer.render({
      feature: feature(),
      claims: [],
      workflow: workflow(),
    });
    expect(rendered.workflowIntro).toBe('The steps below follow this feature.');
  });

  it('introduces no watched proposition either', async () => {
    const claims = clientCreationClaims();
    const rendered = await renderer.render({
      feature: feature({ claimSummary: summaryOf(claims) }),
      claims,
      workflow: workflow(),
    });

    const prose = `${rendered.description} ${rendered.workflowIntro ?? ''}`;
    expect(checkRenderedPropositions(prose, claims).introduced).toEqual([]);
  });
});
