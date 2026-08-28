/**
 * Turning decided meaning into an English sentence.
 *
 * The only module that chooses words, and it chooses them from a typed
 * proposition — never by joining fragments of claim text or spacing out an
 * identifier. That constraint is the whole fix for the Day 2 sentence
 * *"You can create a new invoices create form and submit the invoices create
 * form form from the Invoices screen."* Nothing in it was false. It was
 * produced by a template with an identifier dropped into it twice, and no
 * amount of string repair addresses the reason it existed.
 *
 * Two rules run through everything below.
 *
 * **Quote only what the user can see.** A label that came from a visible
 * control is quoted, because the reader can go and find that word on screen. A
 * label derived from an identifier never is, because quoting it would send
 * someone looking for text that does not exist.
 *
 * **Say nothing rather than say it badly.** Where a proposition cannot be
 * phrased without inventing a connective or a noun, the realiser returns
 * nothing and the compiler drops the sentence. An omitted sentence costs a
 * reader a moment; a manufactured one costs them the assumption that the rest
 * is accurate.
 *
 * @packageDocumentation
 */

import type { CapabilityAction } from '@statewavedev/guide-shared';
import type { HumanLabel } from './labels.js';
import { isVisibleToUser } from './labels.js';
import type { GuidanceProposition } from './ir.js';

/** How a label appears in a sentence. */
function name(label: HumanLabel): string {
  return isVisibleToUser(label) ? `"${label.text}"` : label.text;
}

/** `a client`, `an invoice`. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/**
 * How each capability reads as something a person does.
 *
 * A table rather than a rule, because English does not derive these. `create`
 * becomes *create a new client* and `view` becomes *view the client* — the
 * article differs, and getting it from a pattern would produce *view a new
 * client*.
 */
const ACTION_PHRASES: Record<CapabilityAction, (object: string) => string> = {
  create: (object) => `create ${article(`new ${object}`)}`,
  view: (object) => `view ${article(object)}`,
  update: (object) => `change ${article(object)}`,
  delete: (object) => `delete ${article(object)}`,
  submit: (object) => `submit ${article(object)}`,
  navigate: (object) => `open ${article(object)}`,
  search: (object) => `search ${object}s`,
  export: (object) => `export ${object}s`,
  import: (object) => `import ${object}s`,
  send: (object) => `send ${article(object)}`,
  // Closed Loop #10, and the plural matters. Filtering acts on the collection,
  // not on one member — "filter a client" would be a different and unproven
  // claim about picking one out.
  filter: (object) => `filter ${object}s`,
  reveal: (object) => `show ${article(object)}`,
  open: (object) => `open ${article(object)}`,
  select: (object) => `select ${article(object)}`,
};

/** `a, b and c`, with no serial comma, because product copy rarely wants one. */
function list(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Realises one proposition, or returns `undefined` when it cannot be said well. */
export function realiseProposition(proposition: GuidanceProposition): string {
  const sentence = tryRealise(proposition);
  return sentence ?? '';
}

/** The same, but honest about failure. */
export function tryRealise(proposition: GuidanceProposition): string | undefined {
  switch (proposition.kind) {
    case 'perform_action': {
      const { action, object, control } = proposition;
      // Without an object there is no sentence worth making: "You can create."
      // is not guidance, and inventing the noun is what this layer exists to
      // stop. Without an action there is no verb, and inventing one is worse —
      // it asserts behaviour nothing established.
      if (object === undefined || action === undefined) {
        return control === undefined ? undefined : `Choose ${name(control)}.`;
      }
      const phrase = ACTION_PHRASES[action](object);
      return control === undefined
        ? `You can ${phrase}.`
        : `You can ${phrase} using ${name(control)}.`;
    }

    case 'navigate': {
      const { destination, via } = proposition;
      return via === undefined
        ? `Open ${destination.text}.`
        : `Choose ${name(via)} to open ${destination.text}.`;
    }

    case 'enter_fields': {
      // Field names are printed unquoted whatever their origin. A visible label
      // could be quoted, but a form's fields are usually a mixture and a list
      // that quotes some of its items and not others reads as an error.
      const fields = proposition.fields.map((field) => field.text);
      if (fields.length === 0) return undefined;
      const owner = proposition.object === undefined ? 'the' : `the ${proposition.object}'s`;
      return `Enter ${owner} ${list(fields.map((field) => field.toLowerCase()))}.`;
    }

    case 'confirm_action': {
      const { control, action, object } = proposition;
      if (action === undefined || object === undefined) return `Choose ${name(control)}.`;
      // `submit` is the mechanism. A control labelled "Save changes" already
      // tells a reader what pressing it does, and appending the internal verb
      // produces "Choose \"Save changes\" to submit a setting" — the vocabulary
      // the user was never supposed to meet, arriving through the back door.
      if (action === 'submit') return `Choose ${name(control)}.`;
      return `Choose ${name(control)} to ${ACTION_PHRASES[action](object)}.`;
    }

    case 'open_container':
      return `${name(proposition.container)} opens.`;

    case 'observe':
      return `${name(proposition.what)} is shown.`;

    case 'requires_permission': {
      // The identifier never appears. "You need the clients:create permission"
      // tells a user to go and find a string they have no way to look up; the
      // permission id stays in provenance, for the inspector.
      const { capability } = proposition;
      return capability === undefined
        ? 'You need permission to do this.'
        : `You need permission to ${capability}.`;
    }

    case 'constraint':
      return proposition.text;
  }
}

/**
 * The same proposition, as an instruction rather than a statement.
 *
 * A summary and a step are the same fact in different moods. *You can create a
 * new client* belongs under a title; inside a numbered list it reads as an
 * aside, because a list of steps is a list of things to do. Day 2 rendered both
 * positions identically and produced "1. You can open a client using New
 * client." — which tells a reader what is possible at the exact moment they
 * wanted to be told what to press.
 *
 * Returning `undefined` means this proposition has no imperative form worth
 * printing, and the step is dropped rather than padded.
 */
export function realiseInstruction(proposition: GuidanceProposition): string | undefined {
  switch (proposition.kind) {
    case 'perform_action': {
      const { control } = proposition;
      // Without a control there is nothing to instruct: an action with no
      // visible trigger is a capability, and capabilities belong in the summary.
      return control === undefined ? undefined : `Choose ${name(control)}.`;
    }
    case 'navigate': {
      const { destination, via } = proposition;
      return via === undefined
        ? `Open ${destination.text}.`
        : `Choose ${name(via)} to open ${destination.text}.`;
    }
    case 'confirm_action': {
      const { control, action, object } = proposition;
      if (action === undefined || object === undefined || action === 'submit') {
        return `Choose ${name(control)}.`;
      }
      return `Choose ${name(control)} to ${ACTION_PHRASES[action](object)}.`;
    }
    case 'enter_fields':
      return tryRealise(proposition);
    case 'open_container':
    case 'observe':
    case 'requires_permission':
    case 'constraint':
      return tryRealise(proposition);
  }
}

/**
 * The one-line summary shown under a title.
 *
 * Deliberately the single highest-ranked proposition rather than a joined list.
 * Day 2's summaries were conjunctions — *create a new client **and** submit the
 * client form* — which put the mechanism on the same footing as the outcome and
 * made the sentence longer without making it more useful.
 */
export function realiseSummary(propositions: readonly GuidanceProposition[]): string | undefined {
  const first = propositions[0];
  return first === undefined ? undefined : tryRealise(first);
}
