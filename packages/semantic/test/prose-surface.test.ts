/**
 * The prose surfaces: every string that ships without an assertion behind it.
 *
 * The verifier checks assertions. A page prints sentences. This file is about
 * the distance between those two facts, and it is deliberately symmetric: each
 * gate is asserted to fire on a fabrication **and** to stay out of the way of an
 * honest sentence, because a gate that refuses everything protects nobody.
 *
 * Four surfaces carry generated language into the artefacts:
 *
 * | Surface | Where it ends up |
 * | --- | --- |
 * | `claim.text` | the "Verified facts" table, and each workflow step |
 * | `title` | the page's H1, the workflow's name, the index row |
 * | `purpose` / `user_question` | the interpretation section, and a runtime's search text |
 * | the renderer's `description` | the paragraph under the H1 |
 *
 * The last of those is composed from assertions by `render.ts` and cannot say
 * anything the templates do not contain. The other three are model prose, and
 * the only check that exists for them is the eleven-word watchlist in
 * `./proposition.ts`. The final section of this file pins what that watchlist
 * cannot do, so the limit stays visible instead of being rediscovered.
 */

import { describe, expect, it } from 'vitest';
import { ID, enrichment, factual, language, onlyClaim, verifyFixture } from './helpers.js';
import { featureTitleFromId } from '../src/render.js';

/** A `create` claim that is true of the fixture, with the wording under test. */
function createClaim(text: string): ReturnType<typeof factual> {
  return factual({ action: 'create', text, targets: [ID.post] });
}

describe('the wording of a verified claim', () => {
  it('POSITIVE CONTROL: an honest sentence beside a valid assertion is upheld', () => {
    const claim = onlyClaim(
      verifyFixture({ factualClaims: [createClaim('A client can be created from this screen.')] }),
    );
    expect(claim.status).toBe('structurally_verified');
  });

  it('refuses a sentence that smuggles an effect the assertion never claimed', () => {
    // The assertion is perfect: `create`, citing `POST /clients`, reached by a
    // real calls_api path. Only the sentence is a fabrication — and the sentence
    // is the half that gets printed under "Verified facts".
    const claim = onlyClaim(
      verifyFixture({
        factualClaims: [
          createClaim(
            'Creating a client automatically exports the updated list to Excel and emails it to finance.',
          ),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
    expect(claim.rejection?.detail).toContain('automatically');
    expect(claim.rejection?.detail).toContain('excel');
    // Every factual claim lands on exactly one outcome, refusals included.
    expect(claim.outcome).toBe('REJECTED_INVALID');
  });

  it('refuses the same fabrication when it arrives as a workflow step', () => {
    const claim = onlyClaim(
      verifyFixture({
        factualClaims: [
          factual({
            type: 'workflow_step',
            text: 'Press Create; the record is bulk-exported to accounting overnight.',
            targets: [ID.create],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.detail).toContain('bulk');
  });

  it('refuses an interpretation that reaches past the facts it cites', () => {
    const claim = onlyClaim(
      verifyFixture({
        languageClaims: [
          language({
            text: 'So finance gets a nightly CSV export of new clients.',
            targets: [ID.create],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.detail).toContain('csv');
  });

  it('lets a word the application itself uses through: the label is a graph fact', () => {
    // `clients.export` is a real button. A claim citing it may say "export",
    // because the indexer read that word out of the source rather than a model
    // choosing it. What the claim may not do is add anything else.
    const licensed = onlyClaim(
      verifyFixture({
        factualClaims: [
          factual({
            type: 'workflow_step',
            text: 'Press the export button.',
            targets: [ID.exportButton],
          }),
        ],
      }),
    );
    expect(licensed.status).toBe('structurally_verified');

    const unlicensed = onlyClaim(
      verifyFixture({
        factualClaims: [
          factual({
            type: 'workflow_step',
            text: 'Press the export button to email the list to finance.',
            targets: [ID.exportButton],
          }),
        ],
      }),
    );
    expect(unlicensed.status).toBe('rejected');
    expect(unlicensed.rejection?.detail).toContain('email');
  });

  it('does not let a claim license its own wording', () => {
    // The failure mode this gate is easiest to build wrong in: if a claim's own
    // text counted as backing, every sentence would back itself and the check
    // would report nothing, for ever.
    const claim = onlyClaim(
      verifyFixture({
        factualClaims: [createClaim('Clients sync automatically with the external CRM.')],
      }),
    );
    expect(claim.status).toBe('rejected');
  });

  it('does not let subjectLabel license anything either', () => {
    // `shared/src/semantic.ts` calls the label "deliberately powerless: it is
    // rendered, never resolved". A powerless field cannot be backing.
    const claim = onlyClaim(
      verifyFixture({
        factualClaims: [
          factual({
            action: 'create',
            subjectLabel: 'the CSV import module',
            text: 'Clients can be created from a CSV file.',
            targets: [ID.post],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.detail).toContain('csv');
  });
});

describe('the title', () => {
  it('POSITIVE CONTROL: keeps the generated title when nothing in it reaches past the evidence', () => {
    const result = verifyFixture({
      factualClaims: [createClaim('A client can be created.')],
      enrichmentOverrides: { title: 'Create a client' },
    });
    expect(result.title).toBe('Create a client');
    expect(result.warnings.join(' ')).not.toContain('named from its identifier');
  });

  it('replaces a title that asserts a capability nothing supports', () => {
    const result = verifyFixture({
      factualClaims: [createClaim('A client can be created.')],
      enrichmentOverrides: { title: 'Bulk export clients to Excel' },
    });
    expect(result.title).toBe(featureTitleFromId('clients.create'));
    expect(result.title).not.toContain('Excel');
    expect(result.warnings.join(' ')).toContain('named from its identifier');
  });

  it('still refuses the feature when redaction leaves no title at all', () => {
    const result = verifyFixture({
      factualClaims: [createClaim('A client can be created.')],
      enrichmentOverrides: { title: 'sk-abcdefghijklmnopqrst' },
    });
    expect(result.title).toBe('');
    expect(result.accepted).toBe(false);
  });

  it('builds the fallback from the identifier, so it can assert nothing', () => {
    expect(featureTitleFromId('clients.create')).toBe('Clients create');
    expect(featureTitleFromId('element:admin.clients.export')).toBe('Admin clients export');
  });
});

describe('what the watchlist cannot do, pinned so it stays visible', () => {
  it('accepts an invented taxonomy, because no watched word arrives with it', () => {
    // "Clients may be grouped into tiers" is a fabrication about the product and
    // nothing in this package can see it: the eleven watched words are
    // capability and effect vocabulary, and an invented noun is neither. This
    // test exists to fail the day someone claims the sentence is checked.
    const claim = onlyClaim(
      verifyFixture({
        factualClaims: [createClaim('Clients may be grouped into tiers when they are created.')],
      }),
    );
    expect(claim.status).toBe('structurally_verified');
  });

  it('accepts a business meaning the graph cannot contradict', () => {
    const claim = onlyClaim(
      verifyFixture({
        factualClaims: [
          factual({
            action: 'delete',
            text: 'Deleting a client keeps it available for thirty days.',
            targets: [ID.del],
            subjectRef: ID.remove,
          }),
        ],
      }),
    );
    expect(claim.status).toBe('structurally_verified');
  });

  it('is a gate on vocabulary, not on truth — and the enrichment fixture says so', () => {
    expect(enrichment([]).description).toBe('Adds a client record from the clients page.');
  });
});
