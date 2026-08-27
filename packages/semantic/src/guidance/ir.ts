/**
 * What we have decided to tell the user, before anybody writes a sentence.
 *
 * Three representations now exist, and collapsing any two of them is what
 * produced the Day 2 result:
 *
 * - **ApplicationGraph** — what the code does. Technical truth.
 * - **ProductModel** — what that means about the product. Verified meaning.
 * - **GuidanceIR** — what a user should be told. Communicative intent.
 *
 * The renderer then decides only *how to phrase it*. Previously there was no
 * third layer, so the ProductModel was rendered directly and its internal
 * vocabulary went with it: an independent reviewer flagged
 * `too_technical` on fourteen of twenty-one features, and every one of the ten
 * carrying the sentence *"No capability, route or permission has been verified
 * for this feature"* was among them.
 *
 * The distinction that matters most here is that a ProductModel holds more
 * truth than a GuidanceDocument chooses to say. `Input is validated before it
 * is accepted` was true, verified, and flagged as irrelevant three times — it
 * answered no question the user had asked. Selecting is a first-class job, and
 * this is the layer that does it.
 *
 * What this layer may **not** do is add anything. Every proposition carries
 * provenance to the claims and graph facts it was compiled from, and a
 * proposition with no provenance is a proposition nobody proved.
 *
 * @packageDocumentation
 */

import type { CapabilityAction } from '@statewavedev/guide-shared';
import type { HumanLabel } from './labels.js';

/**
 * Where a piece of guidance came from.
 *
 * Non-optional throughout. The renderer-introduced-propositions invariant is
 * only checkable because every user-visible fragment can name what produced it,
 * and the same invariant now extends to the compiler.
 */
export interface GuidanceProvenance {
  /** ProductClaim ids. */
  claims: readonly string[];
  /** Graph node and relationship ids. */
  facts: readonly string[];
}

/**
 * One thing worth saying, as meaning rather than as words.
 *
 * A closed union on purpose. Guidance is assembled by *choosing* propositions
 * and then realising them, never by joining fragments of claim text — which is
 * how `submit the invoices create form form` was produced, twice over, from a
 * template and an identifier.
 */
export type GuidanceProposition =
  /** The user can do something. The central kind. */
  | {
      kind: 'perform_action';
      /**
       * What the user does, when a claim establishes it.
       *
       * Optional, and the optionality is load-bearing. A workflow step often
       * knows only *which control is pressed* — the claim behind it asserts
       * that the control is a step, not what pressing it accomplishes.
       * Defaulting the field to a plausible action made three features assert a
       * navigation no claim established, which the no-expansion check caught.
       * An absent action produces "Choose X." and says no more than is known.
       */
      action?: CapabilityAction;
      /** What it acts on: a client, an invoice. */
      object?: string;
      /** The control that does it, when the user can see one. */
      control?: HumanLabel;
      provenance: GuidanceProvenance;
    }
  /** The user can get somewhere. */
  | {
      kind: 'navigate';
      destination: HumanLabel;
      /** The control that takes them there. */
      via?: HumanLabel;
      provenance: GuidanceProvenance;
    }
  /** Doing this needs permission. Phrased for a user, never as an identifier. */
  | {
      kind: 'requires_permission';
      /** The raw permission string. For the inspector only — never rendered. */
      permission: string;
      /** What the permission gates, as a user would say it. */
      capability?: string;
      provenance: GuidanceProvenance;
    }
  /** There are fields to fill in. */
  | {
      kind: 'enter_fields';
      fields: readonly HumanLabel[];
      object?: string;
      provenance: GuidanceProvenance;
    }
  /** Something opens: a dialog, a panel. */
  | {
      kind: 'open_container';
      container: HumanLabel;
      via?: HumanLabel;
      provenance: GuidanceProvenance;
    }
  /** The user commits: Save, Create, Delete. */
  | {
      kind: 'confirm_action';
      control: HumanLabel;
      action?: CapabilityAction;
      object?: string;
      provenance: GuidanceProvenance;
    }
  /** Something is shown to the user. */
  | {
      kind: 'observe';
      what: HumanLabel;
      provenance: GuidanceProvenance;
    }
  /** A rule about what is allowed. Rendered only when it changes what to do. */
  | {
      kind: 'constraint';
      text: string;
      provenance: GuidanceProvenance;
    };

/**
 * Why a step sits where it does in a procedure.
 *
 * The Day 2 review found `clients.create` rendered in reverse: *the form
 * contains fields*, then *the dialog contains the form*, then *New client opens
 * the dialog*. Every sentence was true and the order was backwards, because the
 * steps were sorted by how deep each node sat in the ownership path — and
 * containment depth runs the opposite way from use. A form is *inside* a dialog
 * that is *opened by* a button, so the deepest node is the first thing built and
 * the last thing reached.
 *
 * Roles fix the order by naming what each step *is to the user*, which is
 * independent of how the interface nests. Sorting by role gives the sequence a
 * person actually performs.
 */
export type WorkflowRole =
  /** Where the user has to be. A screen. */
  | 'entry'
  /** What they press to begin. */
  | 'trigger'
  /** What appears as a result. Usually context, not an action. */
  | 'container'
  /** What they fill in. */
  | 'input'
  /** What commits it. */
  | 'confirmation'
  /** What happens afterwards. */
  | 'result';

/** The order a user meets the roles in. Not the order a graph discovers them. */
export const WORKFLOW_ROLE_ORDER: readonly WorkflowRole[] = [
  'entry',
  'trigger',
  'container',
  'input',
  'confirmation',
  'result',
];

/**
 * A step, and whether it is something to do or something to know.
 *
 * *The dialog holds the form* is true, and it is not a step: nobody performs
 * it. Interactive guidance prefers actions, and informational steps exist so
 * that useful context has somewhere to live that is not the numbered list.
 */
export interface GuidanceStep {
  index: number;
  role: WorkflowRole;
  kind: 'action' | 'informational';
  proposition: GuidanceProposition;
  provenance: GuidanceProvenance;
}

/** One sentence, with what it was compiled from. */
export interface GuidanceSentence {
  text: string;
  provenance: GuidanceProvenance;
}

/** A question a user might ask, kept only when it is about user intent. */
export interface GuidanceQuestion {
  text: string;
  provenance: GuidanceProvenance;
}

/** Something the user must satisfy: a permission, a rule about values. */
export interface GuidanceCondition {
  proposition: GuidanceProposition;
  provenance: GuidanceProvenance;
}

/**
 * Something a developer should know and a user should not.
 *
 * The reason the user-facing fallback could be deleted rather than reworded:
 * the information did not stop existing, it moved to where it belongs. A
 * feature with nothing provable now produces `NO_VERIFIED_CAPABILITY` here and
 * silence in the guidance.
 */
export interface GuidanceDiagnostic {
  code:
    | 'NO_VERIFIED_CAPABILITY'
    | 'NO_USER_VISIBLE_LABEL'
    | 'NO_WORKFLOW_ORDER'
    | 'CONSTRAINT_WITHHELD_AS_IRRELEVANT'
    | 'LANGUAGE_CLAIM_UNSUPPORTED'
    | 'QUESTION_DISCARDED_AS_TECHNICAL';
  detail: string;
  /** What it concerns, when it concerns something nameable. */
  subject?: string;
}

/**
 * How much a feature was able to say.
 *
 * Diagnostic only, and never shown to a user. It exists because the Day 2
 * correlation was weak in an informative way: features with a verified
 * capability scored 1.43 against 1.14 without, a quarter of a point. If
 * capability presence is not what separates useful guidance from useless
 * guidance, something else is, and this is the candidate — a feature that
 * reaches `ACTIONABLE` has told the user something they can do, whatever the
 * claim taxonomy underneath.
 */
export type GuidanceCompleteness =
  /** Nothing worth saying. */
  | 'EMPTY'
  /** We can name it and no more. */
  | 'IDENTIFICATION_ONLY'
  /** We can explain it, but not what to do. */
  | 'DESCRIPTIVE'
  /** At least one thing the user can do. */
  | 'ACTIONABLE'
  /** Actions, purpose, and the conditions that govern them. */
  | 'COMPLETE';

/** Everything decided about one feature, before phrasing. */
export interface GuidanceDocument {
  featureId: string;
  title: HumanLabel;
  summary?: GuidanceSentence;
  purpose?: GuidanceSentence;
  steps: readonly GuidanceStep[];
  questions: readonly GuidanceQuestion[];
  conditions: readonly GuidanceCondition[];
  /** Developer-facing. Never rendered into user copy. */
  diagnostics: readonly GuidanceDiagnostic[];
  completeness: GuidanceCompleteness;
}

/** Merges provenance without duplicating refs, keeping order stable. */
export function mergeProvenance(...records: readonly GuidanceProvenance[]): GuidanceProvenance {
  const claims: string[] = [];
  const facts: string[] = [];
  for (const record of records) {
    for (const claim of record.claims) if (!claims.includes(claim)) claims.push(claim);
    for (const fact of record.facts) if (!facts.includes(fact)) facts.push(fact);
  }
  return { claims, facts };
}

/** True when a proposition is something the user performs. */
export function isActionProposition(proposition: GuidanceProposition): boolean {
  return (
    proposition.kind === 'perform_action' ||
    proposition.kind === 'navigate' ||
    proposition.kind === 'enter_fields' ||
    proposition.kind === 'confirm_action'
  );
}
