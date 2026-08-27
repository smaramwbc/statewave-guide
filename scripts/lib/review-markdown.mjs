/**
 * One review item, as the reviewer reads it.
 *
 * Split out of the package builder for one reason: a renderer that cannot be
 * called with a hand-written object cannot be tested with one, and the defect
 * this module exists to fix was a rendering defect that reached a reviewer.
 *
 * Round 7 withholds a title for eight of twenty-one features — Closed Loop #8
 * removed the identifier fallback, so a feature the interface does not name goes
 * without. The JSON said so correctly, `"title": null`. The Markdown printed
 *
 *   **null**
 *
 * eight times. That is not the product's output and it is not an absence; it is
 * a word, in bold, at the top of the item, and a reviewer scoring correctness
 * would have been scoring the renderer.
 *
 * The fix is the same rule the compiler already follows: **absence renders as
 * absence.** No `Untitled`, no `Feature`, no `Control`, no identifier — a
 * placeholder would be the mistake Closed Loop #8 removed, reintroduced one
 * layer further out where no gate was looking.
 *
 * @packageDocumentation
 */

/**
 * Markdown for a single blinded review item.
 *
 * @param {object} item - one entry of a review package's `items` array.
 * @returns {string[]} lines, ready to join with a newline.
 */
export function renderReviewItem(item) {
  const md = [];
  const output = item.productOutput;

  md.push(`## ${item.reviewId}`, '');
  md.push(`**Screen:** ${item.userContext.screen}  `);
  md.push(`**Goal:** ${item.userContext.goal}`, '');
  md.push('### What the product says', '');

  // A title the interface does not supply is not printed. Anything else here —
  // a placeholder, an empty bold, the word null — would be text the reviewer
  // judges and the product never wrote.
  if (typeof output.title === 'string' && output.title.trim().length > 0) {
    md.push(`**${output.title}**`, '');
  }

  if (output.summary) md.push(output.summary, '');
  if (output.purpose) md.push(`_${output.purpose}_`, '');

  if (output.steps.length > 0) {
    md.push('Steps:', '');
    output.steps.forEach((step, index) => md.push(`${index + 1}. ${step}`));
    md.push('');
  }

  for (const condition of output.conditions) md.push(`- ${condition}`);
  if (output.conditions.length > 0) md.push('');

  if (output.questions.length > 0) {
    md.push('Questions it answers:', '');
    for (const question of output.questions) md.push(`- ${question}`);
    md.push('');
  }

  md.push('### What the application actually does', '');
  if (item.knownSupportedFacts.length === 0) {
    md.push(`_${item.factsNote}_`, '');
  } else {
    for (const fact of item.knownSupportedFacts) md.push(`- ${fact}`);
    md.push('');
  }

  md.push(
    '| usefulness | correctness | clarity | actionability | naturalLanguage |',
    '| --- | --- | --- | --- | --- |',
    '|  |  |  |  |  |',
    '',
    'Flags: ',
    '',
    'Note: ',
    '',
    '---',
    '',
  );

  return md;
}
