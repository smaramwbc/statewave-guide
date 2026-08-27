/**
 * The guidance layer: verified product knowledge compiled into human help.
 *
 * `ProductModel` answers "what do we know". `GuidanceIR` answers "what should
 * we tell the user". The renderer answers "how should we phrase it". Keeping
 * the three apart is the subject of ADR 0012, and collapsing the first two is
 * what the Day 2 usefulness review measured.
 *
 * @packageDocumentation
 */

export { compileGuidance, mentionsIdentifier } from './compile.js';
export type { CompileGuidanceInput } from './compile.js';
export { realiseInstruction, realiseProposition, realiseSummary, tryRealise } from './realise.js';
export {
  createLabelIndex,
  entityNoun,
  isVisibleToUser,
  labelForNode,
  normaliseIdentifier,
} from './labels.js';
export type { HumanLabel, LabelIndex, LabelOrigin } from './labels.js';
export { WORKFLOW_ROLE_ORDER, isActionProposition, mergeProvenance } from './ir.js';
export { isActionableNode, resolveActionTarget } from './action-target.js';
export { isUserVisible, resolveTitle, titleEvidenceNode } from './title.js';
export type { ResolveTitleInput, TitleCandidate, TitleOrigin, TitleOutcome } from './title.js';
export { ACTION_SURFACE_RELATIONSHIPS, recoverActionTarget } from './action-recovery.js';
export {
  PRESENTATIONAL_TERMS,
  auditLanguageEvidence,
  buildGroundedTerms,
  compilePurpose,
  isPresentational,
  realisePurpose,
  singular,
} from './language.js';
export type {
  CompiledQuestion,
  CompilePurposeInput,
  GroundedTerm,
  GroundedTerms,
  LanguageEvidenceAudit,
  LanguageProposition,
  LanguagePropositionType,
  LanguageRefusal,
  LanguageSupport,
  PurposeIR,
  WithheldProposition,
} from './language.js';
export type {
  ActionRecoveryProvenance,
  ActionRecoveryRule,
  ActionTargetRecoveryOutcome,
  RecoverActionTargetInput,
} from './action-recovery.js';
export type {
  ActionTargetOutcome,
  ActionTargetSource,
  ResolveActionTargetInput,
  WorkflowActionTarget,
} from './action-target.js';
export type {
  ActionAccountingEntry,
  GuidanceCompleteness,
  GuidanceCondition,
  GuidanceDiagnostic,
  GuidanceDocument,
  GuidanceProposition,
  GuidanceProvenance,
  GuidanceQuestion,
  GuidanceSentence,
  GuidanceStep,
  StepOrigin,
  TaskCompletion,
  WorkflowRole,
} from './ir.js';
