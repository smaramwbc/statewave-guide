/**
 * Whether an absent title renders as an absence.
 *
 * Closed Loop #8 removed the identifier fallback from titles, so a feature whose
 * interface supplies no name now has none — eight of Round 7's twenty-one. The
 * JSON package said so correctly: `"title": null`. The Markdown handed to the
 * reviewer said
 *
 *   **null**
 *
 * eight times, in bold, at the top of the item.
 *
 * That is not the product's output. A reviewer scoring correctness on those
 * items would have been scoring the renderer, and the failure is the same shape
 * as the one Closed Loop #8 was written to fix — a placeholder standing where a
 * name should be — reintroduced one layer further out, where no gate was
 * looking.
 *
 * The rule the renderer now follows is the compiler's own: absence renders as
 * absence. Not `Untitled`, not `Feature`, not an empty bold pair, not the
 * identifier. Nothing.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderReviewItem } from '../../../scripts/lib/review-markdown.mjs';

const BENCH = new URL('../../../benchmarks/provider-reality-check/', import.meta.url).pathname;

/** A review item with the fields the renderer reads. */
function item(productOutput: Record<string, unknown>) {
  return {
    reviewId: 'R01',
    featureId: 'settings.form',
    userContext: { screen: 'Settings', goal: 'Understand or use this feature' },
    productOutput: {
      title: null,
      summary: null,
      purpose: null,
      steps: [],
      conditions: [],
      questions: [],
      ...productOutput,
    },
    knownSupportedFacts: ['There is a screen at /settings.'],
    factsNote: null,
  };
}

describe('a withheld title renders as nothing at all', () => {
  const markdown = renderReviewItem(
    item({ title: null, summary: null, purpose: null, steps: ['Open Settings.'] }),
  ).join('\n');

  it('still renders the rest of the item', () => {
    expect(markdown).toContain('Open Settings.');
    expect(markdown).toContain('## R01');
    expect(markdown).toContain('There is a screen at /settings.');
  });

  it('prints no placeholder in place of the missing name', () => {
    for (const forbidden of ['null', 'Untitled', 'Unknown', 'Feature', 'Control', 'undefined']) {
      expect(markdown, forbidden).not.toContain(forbidden);
    }
  });

  it('leaves no empty bold pair behind', () => {
    expect(markdown).not.toContain('****');
  });
});

describe('a real title is untouched', () => {
  it('renders in bold, as before', () => {
    const markdown = renderReviewItem(
      item({ title: 'Save changes', steps: ['Open Settings.', 'Choose "Save changes".'] }),
    ).join('\n');
    expect(markdown).toContain('**Save changes**');
    expect(markdown).toContain('1. Open Settings.');
    expect(markdown).toContain('2. Choose "Save changes".');
  });

  it('does not treat an empty string as a name', () => {
    // Defence in depth. A title should never be `""`, and if one ever is, the
    // renderer must not print an empty bold pair and call it copy. Asserted on
    // the title line rather than on the whole item, because `**Screen:**` and
    // `**Goal:**` are bold on purpose.
    const lines = renderReviewItem(item({ title: '   ' }));
    expect(lines.filter((line: string) => /^\*\*\s*\*\*$/.test(line))).toEqual([]);
    expect(lines).not.toContain('**   **');
  });
});

describe('the issued Round 7 package', () => {
  it('contains no literal null title', () => {
    // The artefact itself, not a reconstruction. This is what a reviewer opens.
    const markdown = readFileSync(`${BENCH}human-review-round-7.md`, 'utf8');
    expect(markdown).not.toContain('**null**');
    expect(markdown).not.toContain('null');
  });

  it('still shows a title for the thirteen features that have one', () => {
    const markdown = readFileSync(`${BENCH}human-review-round-7.md`, 'utf8');
    const json = JSON.parse(readFileSync(`${BENCH}human-review-round-7.json`, 'utf8')) as {
      items: { productOutput: { title: string | null } }[];
    };
    const titled = json.items.filter((entry) => entry.productOutput.title !== null);
    expect(titled).toHaveLength(13);
    for (const entry of titled) {
      expect(markdown).toContain(`**${entry.productOutput.title}**`);
    }
  });

  it('withholds exactly the eight the compiler withheld', () => {
    const json = JSON.parse(readFileSync(`${BENCH}human-review-round-7.json`, 'utf8')) as {
      items: { featureId: string; productOutput: { title: string | null } }[];
    };
    const withheld = json.items
      .filter((entry) => entry.productOutput.title === null)
      .map((entry) => entry.featureId)
      .sort();
    expect(withheld).toEqual([
      'api.get.partial-clients',
      'clients.error',
      'clients.search',
      'clients.table',
      'invoices.list.open',
      'settings.danger-zone',
      'settings.form',
      'settings.new-key',
    ]);
  });
});
