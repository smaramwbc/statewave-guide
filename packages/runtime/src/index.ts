/**
 * Runtime observation for Statewave Guide.
 *
 * Static analysis answers *what the code contains*. This package answers *what
 * the running application does* — and answers nothing else. It renders no user
 * prose, holds no second product model, and produces evidence that goes through
 * the same verifier every static claim does.
 *
 * ```
 *   ApplicationGraph  ┐
 *                     ├→ Claim Opportunities → verifier → ProductModel → guidance
 *   RuntimeEvidence   ┘
 * ```
 *
 * See ADR 0019: runtime observes behaviour; vision proposes meaning.
 *
 * @packageDocumentation
 */

export { accessibleNameOf, isDisabled, isVisible, roleOf } from './accessibility.js';
export type { AccessibleName, RuntimeNameSource } from './accessibility.js';

export {
  describeRedacted,
  isSensitiveName,
  redactBody,
  redactHeaders,
  redactValue,
} from './redact.js';
export type { RedactedValue } from './redact.js';

export { GUIDE_ATTRIBUTES, observe, observeScreenNames } from './snapshot.js';
export type {
  ObservedElement,
  ObservedRegion,
  ObservedScreenName,
  ObserveInput,
  RuntimeContext,
  RuntimeEvidenceSnapshot,
} from './snapshot.js';

export { recordNetwork } from './network.js';
export type {
  NetworkRecorder,
  ObservableHttpClient,
  ObservedRequest,
  RouteHandler,
} from './network.js';

export { assertPermitted, diffSnapshots } from './interaction.js';
export type {
  DiffInput,
  InteractionAction,
  InteractionKind,
  InteractionSafety,
  InteractionTrace,
  ObservedEffect,
} from './interaction.js';

export { correlate, mayUseAsEvidence } from './correlate.js';
export type { CorrelateInput, CorrelationOutcome, OwnershipInput } from './correlate.js';

export { NO_VISION, buildVisionRequest, recordedVisionProvider } from './vision.js';
export type { VisionProposal, VisionProvider, VisionRequest } from './vision.js';

export { supportsFactualClaim, verifyRuntimeCapability } from './capabilities.js';
export type {
  RuntimeCapabilityCandidate,
  RuntimeCapabilityKind,
  RuntimeEvidenceAuthority,
  RuntimeEvidenceKind,
  RuntimeVerification,
} from './capabilities.js';

// --- Visual evidence (Closed Loop #17) -----------------------------------
export * from './visual/proposals.js';
export * from './visual/evidence-pack.js';
export * from './visual/correlate.js';
