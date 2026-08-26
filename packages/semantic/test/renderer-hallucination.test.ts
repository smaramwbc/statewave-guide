/**
 * Brief section 8: does the renderer invent capabilities?
 *
 * The scenario is fixed. A feature with exactly three verified facts — a client
 * can be created, it lives at `/clients`, it needs `clients:create` — and six
 * fabrications a model reaches for when it fills the gaps around them:
 *
 * 1. an automatic email notification
 * 2. CSV import
 * 3. client types
 * 4. bulk creation
 * 5. an admin-only restriction
 * 6. external sync
 *
 * The first half of this file asserts the deterministic renderer produces none
 * of them. On its own that would prove very little: a renderer that emitted the
 * empty string would pass it too, and so would a check that never fires.
 *
 * So the second half feeds a **stub renderer that deliberately adds each one**
 * and asserts `checkRenderedPropositions` catches it. Without that half, a green
 * run means "we looked for six phrases in one paragraph and did not find them",
 * which is not a claim about the renderer at all.
 *
 * ## One fabrication is caught obliquely, and that is the honest result
 *
 * "Client types" is a *noun the application does not have*, and the watchlist is
 * capability and effect vocabulary — `email`, `notify`, `sync`, `import`,
 * `export`, `csv`, `excel`, `bulk`, `admin-only`, `automatically`, `external`.
 * An invented taxonomy is not on it and cannot be, because the space of nouns a
 * model can invent is not enumerable.
 *
 * What catches it here is `automatically`, the effect verb that came with it —
 * which is exactly how a real watchlist behaves and exactly why
 * `./proposition.ts` documents itself as a detector for this suite rather than a
 * proof. The test asserts that outcome explicitly rather than papering over it:
 * the deterministic renderer's clean sheet is meaningful because of how it is
 * built, not because this detector is thorough.
 */

import { describe, expect, it } from 'vitest';
import type { ProductClaim } from '@statewavedev/guide-shared';
import { checkRenderedPropositions } from '../src/proposition.js';
import type { ProseRenderRequest, ProseRenderer } from '../src/render.js';
import { createDeterministicRenderer } from '../src/render.js';
import { claim, feature, summaryOf } from './model-helpers.js';

/** The only three things anyone verified about this feature. */
const ACCEPTED: ProductClaim[] = [
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
    text: 'The client list lives at /clients.',
    assertion: {
      subjectRef: 'feature:clients.create',
      route: '/clients',
      targets: ['route:/clients'],
    },
  }),
  claim({
    id: 'clients.create#permission:1',
    type: 'permission',
    text: 'Creating a client needs a permission.',
    assertion: {
      subjectRef: 'feature:clients.create',
      permission: 'clients:create',
      targets: ['permission:clients:create'],
    },
  }),
];

const REQUEST: ProseRenderRequest = {
  feature: feature({ claimSummary: summaryOf(ACCEPTED) }),
  claims: ACCEPTED,
};

/** The six fabrications, as a model would phrase them. */
const FABRICATIONS = [
  {
    name: 'automatic email notification',
    sentence: 'Creating a client automatically sends an email notification to the account owner.',
    absent: /e-?mail|notification|automatic/i,
    caught: ['automatically', 'email', 'notify'],
  },
  {
    name: 'CSV import',
    sentence: 'Clients can also be imported in bulk from a CSV file.',
    absent: /csv|import/i,
    caught: ['bulk', 'csv', 'import'],
  },
  {
    name: 'client types',
    sentence: 'New clients are automatically assigned a client type.',
    absent: /client type/i,
    // Caught by the effect verb, not by the invented noun. See the file header.
    caught: ['automatically'],
  },
  {
    name: 'bulk creation',
    sentence: 'Several clients can be created in bulk from the list screen.',
    absent: /\bbulk\b/i,
    caught: ['bulk'],
  },
  {
    name: 'admin-only restriction',
    sentence: 'Only administrators can create a client.',
    absent: /admin/i,
    caught: ['admin-only'],
  },
  {
    name: 'external sync',
    sentence: 'Client records sync with an external CRM overnight.',
    absent: /\bsync|external/i,
    caught: ['external', 'sync'],
  },
] as const;

/** A renderer that appends one sentence nobody verified. */
function stubRenderer(extra: string): ProseRenderer {
  return {
    name: 'stub-that-invents',
    render(request) {
      const verified = request.claims.length;
      return Promise.resolve({
        description: `You can create a new client from the Clients screen. ${extra}`,
        workflowIntro: `${verified} facts were checked.`,
      });
    },
  };
}

describe('the deterministic renderer invents none of the six', () => {
  it('produces prose containing none of them', async () => {
    const rendered = await createDeterministicRenderer().render(REQUEST);

    for (const fabrication of FABRICATIONS) {
      expect(
        rendered.description,
        `the deterministic renderer must not mention ${fabrication.name}`,
      ).not.toMatch(fabrication.absent);
    }
  });

  it('introduces no watched proposition at all', async () => {
    const rendered = await createDeterministicRenderer().render(REQUEST);

    const result = checkRenderedPropositions(rendered.description, ACCEPTED);

    expect(result.introduced).toEqual([]);
    expect(result.checked).toBe(11);
  });

  it('renders exactly the three verified facts and nothing more', async () => {
    const rendered = await createDeterministicRenderer().render(REQUEST);

    expect(rendered.description).toBe(
      'You can create a new client from the Clients screen. ' +
        'It is reached at /clients. ' +
        'It requires the clients:create permission.',
    );
  });
});

describe('the check catches a renderer that does invent them', () => {
  for (const fabrication of FABRICATIONS) {
    it(`catches ${fabrication.name}`, async () => {
      const rendered = await stubRenderer(fabrication.sentence).render(REQUEST);

      const result = checkRenderedPropositions(rendered.description, ACCEPTED);

      expect(result.introduced.length).toBeGreaterThan(0);
      for (const proposition of fabrication.caught) {
        expect(result.introduced).toContain(proposition);
      }
    });
  }

  it('catches every one of them at once', async () => {
    const all = FABRICATIONS.map((fabrication) => fabrication.sentence).join(' ');
    const rendered = await stubRenderer(all).render(REQUEST);

    const result = checkRenderedPropositions(rendered.description, ACCEPTED);

    expect(result.introduced).toEqual([
      'admin-only',
      'automatically',
      'bulk',
      'csv',
      'email',
      'external',
      'import',
      'notify',
      'sync',
    ]);
  });

  it('checks the workflow intro too, when a caller passes it in', async () => {
    const rendered = await stubRenderer('Clients sync with an external system.').render(REQUEST);
    const prose = `${rendered.description} ${rendered.workflowIntro ?? ''}`;

    expect(checkRenderedPropositions(prose, ACCEPTED).introduced).toEqual(['external', 'sync']);
  });
});

describe('what counts as backing', () => {
  it('licenses a word an accepted claim already used', async () => {
    const withExport = [
      ...ACCEPTED,
      claim({
        id: 'clients.create#capability:2',
        type: 'capability',
        text: 'A client list can be exported.',
        assertion: {
          subjectRef: 'feature:clients.create',
          action: 'export',
          targets: ['api:GET:/clients/export'],
        },
      }),
    ];

    const rendered = await stubRenderer('The list can be exported.').render({
      ...REQUEST,
      claims: withExport,
    });

    expect(checkRenderedPropositions(rendered.description, withExport).introduced).toEqual([]);
  });

  it('licenses a word that appears in a verified route', async () => {
    const withRoute = [
      ...ACCEPTED,
      claim({
        id: 'clients.create#navigation:2',
        type: 'navigation',
        text: 'There is a second screen.',
        assertion: {
          subjectRef: 'feature:clients.create',
          route: '/clients/export',
          targets: ['route:/clients/export'],
        },
      }),
    ];

    const rendered = await stubRenderer('Use /clients/export to export the list.').render({
      ...REQUEST,
      claims: withRoute,
    });

    expect(checkRenderedPropositions(rendered.description, withRoute).introduced).toEqual([]);
  });

  it('refuses to let a rejected claim license anything', async () => {
    const withRejected = [
      ...ACCEPTED,
      claim({
        id: 'clients.create#capability:2',
        type: 'capability',
        text: 'Clients can be imported from a CSV file.',
        status: 'rejected',
        outcome: 'EXPLICITLY_UNSUPPORTED',
        rejection: { reason: 'UNSUPPORTED_CLAIM_RULE', detail: 'No rule exists for import.' },
        assertion: {
          subjectRef: 'feature:clients.create',
          action: 'import',
          targets: ['api:POST:/clients'],
        },
      }),
    ];

    const rendered = await stubRenderer('Clients can be imported from a CSV file.').render({
      ...REQUEST,
      claims: withRejected,
    });

    // A refusal is not a permit. If it were, every rejected claim would become a
    // licence to say the very thing it was rejected for.
    expect(checkRenderedPropositions(rendered.description, withRejected).introduced).toEqual([
      'csv',
      'import',
    ]);
  });
});
