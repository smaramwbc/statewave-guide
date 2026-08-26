/**
 * Subjects are typed references, not free text.
 *
 * A model may *describe* a subject; it may not *invent* one. Everything here is
 * about the difference, and about the fact that resolution is exact: a subject
 * reference that differs by a space, by a capital, or by a Cyrillic character
 * that renders identically is a different string, and a different string names
 * nothing.
 *
 * Repairing any of those would be worse than useless. It would mean the field
 * that exists to bind a claim to a known identity could be satisfied by
 * something the pipeline never proposed.
 */

import { describe, expect, it } from 'vitest';
import { ID, factual, onlyClaim, verifyFixture } from './helpers.js';

/** The reason a single-claim verification refused, if it refused. */
function reasonOf(result: ReturnType<typeof verifyFixture>): string | undefined {
  return onlyClaim(result).rejection?.reason;
}

/** One workflow-step claim about `subjectRef`, citing a real in-pack element. */
function claimAbout(subjectRef: string): ReturnType<typeof verifyFixture> {
  return verifyFixture({
    factualClaims: [factual({ type: 'workflow_step', subjectRef, targets: [ID.create] })],
  });
}

describe('references the pipeline proposed', () => {
  it('resolves the candidate under verification', () => {
    const result = claimAbout('feature:clients.create');
    expect(reasonOf(result)).toBeUndefined();
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('refuses another known feature candidate, without calling it unknown', () => {
    // `invoices.create` is a real candidate from the same discovery pass, so it
    // is not an invented identity — and it is not this feature either. A
    // `workflow_step` rule names no `relationships` dimension, so nothing later
    // in the pass would notice: without the subject-scope check this claim would
    // be stored as a verified fact about `clients.create` and the renderer would
    // take its noun from `invoices`.
    const result = claimAbout('feature:invoices.create');
    expect(reasonOf(result)).toBe('SUBJECT_OUT_OF_SCOPE');
    expect(reasonOf(result)).not.toBe('UNKNOWN_SUBJECT');
    expect(onlyClaim(result).rejection?.detail).toContain('is real, but');
  });

  it('resolves a canonical graph node id inside the pack', () => {
    expect(reasonOf(claimAbout(ID.handleCreate))).toBeUndefined();
  });

  it('refuses a canonical graph node id from outside the pack', () => {
    // A real node in a different neighbourhood is a real subject — of a claim
    // about that neighbourhood. It is not the subject of a claim filed here.
    expect(reasonOf(claimAbout(ID.invoiceCreate))).toBe('SUBJECT_OUT_OF_SCOPE');
  });

  it('will not let a foreign subject put a foreign noun in the description', () => {
    // The end-to-end shape of the same attack: `capability/view` also names no
    // relationship dimension, and its subject is what `render.ts` turns into the
    // sentence's noun. The cited endpoint is one this feature owns, so the
    // subject is the only thing wrong with the claim and the only thing that can
    // account for the refusal.
    const result = verifyFixture({
      factualClaims: [
        factual({
          action: 'view',
          subjectRef: 'feature:invoices.create',
          text: 'Every invoice raised against a client is listed on this screen.',
          targets: [ID.post],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('rejected');
    expect(reasonOf(result)).toBe('SUBJECT_OUT_OF_SCOPE');
  });

  it('resolves an endpoint and a permission node as subjects', () => {
    expect(reasonOf(claimAbout(ID.post))).toBeUndefined();
    expect(reasonOf(claimAbout(ID.permissionCreate))).toBeUndefined();
  });

  it('refuses the route the feature is merely reached through', () => {
    // `/clients` is where this feature lives, not something it is: every button
    // on the page would speak as the page's route, and a claim about one of them
    // would read as a claim about all of them. Context stays citable; it just
    // cannot be spoken as.
    expect(reasonOf(claimAbout(ID.routeList))).toBe('SUBJECT_OUT_OF_SCOPE');
  });
});

describe('references a model invented', () => {
  it('rejects a feature id no candidate ever had', () => {
    expect(reasonOf(claimAbout('feature:clients.import'))).toBe('UNKNOWN_SUBJECT');
  });

  it('rejects a node id no graph node ever had', () => {
    expect(reasonOf(claimAbout('element:clients.import'))).toBe('UNKNOWN_SUBJECT');
  });

  it('rejects free text, however well it reads', () => {
    expect(reasonOf(claimAbout('the client import module'))).toBe('UNKNOWN_SUBJECT');
    expect(reasonOf(claimAbout('clients.create'))).toBe('UNKNOWN_SUBJECT');
  });

  it('rejects an empty reference', () => {
    expect(reasonOf(claimAbout(''))).toBe('UNKNOWN_SUBJECT');
  });

  it('names the reference it refused, so the failure is auditable', () => {
    const result = claimAbout('feature:clients.import');
    expect(onlyClaim(result).rejection?.detail).toContain('clients.import');
  });
});

describe('near-misses are misses', () => {
  it.each([
    ['feature:clients.create ', 'trailing space'],
    [' feature:clients.create', 'leading space'],
    ['feature:clients.create\n', 'trailing newline'],
    ['feature: clients.create', 'space after the prefix'],
    ['feature:Clients.Create', 'case variant'],
    ['FEATURE:clients.create', 'upper-case prefix'],
    ['Feature:clients.create', 'capitalised prefix'],
    ['feature:clients.crеate', 'Cyrillic е homoglyph'],
    ['feature:clients.creatе', 'Cyrillic е in the last position'],
    ['feature:clients​.create', 'zero-width space'],
    ['ELEMENT:clients.create', 'upper-case node kind'],
    ['element:Clients.Create', 'case-variant node id'],
    ['element:clients.create ', 'node id with a trailing space'],
  ])('rejects %s (%s)', (subjectRef) => {
    expect(reasonOf(claimAbout(subjectRef))).toBe('UNKNOWN_SUBJECT');
  });

  it('rejects a subject that only the label makes plausible', () => {
    // `subjectLabel` is prose and powerless: it is rendered, never resolved.
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'workflow_step',
          subjectRef: 'feature:clients.import',
          subjectLabel: 'Create a client',
          targets: [ID.create],
        }),
      ],
    });
    expect(reasonOf(result)).toBe('UNKNOWN_SUBJECT');
  });
});

describe('the subject decides what relationship evidence counts', () => {
  it('upholds a permission claim when the edge reaches the subject', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          subjectRef: 'feature:clients.create',
          permission: 'clients:create',
          targets: [ID.permissionCreate],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('refuses the same claim when the subject is a node the edge never touches', () => {
    // The handler is this feature's own, so scope has nothing to object to. The
    // permission is required by the button that invokes it, and by nothing
    // further down the chain, which leaves the missing edge as the only thing
    // the refusal can be about.
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          subjectRef: ID.handleCreate,
          permission: 'clients:create',
          targets: [ID.permissionCreate],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('rejected');
    expect(reasonOf(result)).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
  });

  it('refuses a permission claim whose subject is another feature entirely', () => {
    // The reference resolves — it is a known candidate — and it names the
    // feature next door, so it is refused before a rule is ever consulted.
    // Rules that name a `relationships` dimension would have refused it a step
    // later anyway; rules that do not would not have refused it at all.
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          subjectRef: 'feature:invoices.create',
          permission: 'clients:create',
          targets: [ID.permissionCreate],
        }),
      ],
    });
    expect(reasonOf(result)).toBe('SUBJECT_OUT_OF_SCOPE');
  });

  it('follows the behaviour chain, so a handler two hops out is still the subject', () => {
    // `clientService.create` calls the endpoint, not the button. The claim is
    // about the button all the same.
    const result = verifyFixture({
      factualClaims: [factual({ subjectRef: ID.create, action: 'create', targets: [ID.post] })],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });
});

describe('known feature ids are supplied, never assumed', () => {
  it('still resolves the candidate under verification when the set is empty', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'workflow_step',
          subjectRef: 'feature:clients.create',
          targets: [ID.create],
        }),
      ],
      knownFeatureIds: new Set<string>(),
    });
    expect(reasonOf(result)).toBeUndefined();
  });

  it('stops resolving other features when the set does not contain them', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'workflow_step',
          subjectRef: 'feature:invoices.create',
          targets: [ID.create],
        }),
      ],
      knownFeatureIds: new Set<string>(),
    });
    expect(reasonOf(result)).toBe('UNKNOWN_SUBJECT');
  });
});
