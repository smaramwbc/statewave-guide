/**
 * Runtime validation for every contract in this package.
 *
 * The type layer stops mistakes at compile time; these schemas stop them at the
 * boundary, where data arrives from a config file, an indexer artefact, or —
 * eventually — a language model. Anything crossing into the runtime is parsed
 * here first.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import {
  GUIDE_ELEMENT_ID_MAX_LENGTH,
  GUIDE_ELEMENT_ID_MAX_SEGMENTS,
  isValidGuideElementId,
} from './semantic-id.js';

/** `Record<string, unknown>` bag used for the `metadata` field everywhere. */
export const metadataSchema = z.record(z.string(), z.unknown());

/**
 * A semantic guide identifier.
 *
 * The refinement is the enforcement point for the "no selectors" rule: a value
 * that fails here can never reach an action handler.
 */
export const guideElementIdSchema = z
  .string()
  .min(1)
  .max(GUIDE_ELEMENT_ID_MAX_LENGTH)
  .refine(isValidGuideElementId, {
    message:
      `Must be dot-separated lowercase segments (e.g. "clients.create"), ` +
      `at most ${GUIDE_ELEMENT_ID_MAX_SEGMENTS} segments. ` +
      `CSS selectors and DOM paths are not valid guide element ids.`,
  });

// ---------------------------------------------------------------------------
// Product model
// ---------------------------------------------------------------------------

/** Validates {@link ProvenanceReference}. */
export const provenanceReferenceSchema = z.object({
  source: z.enum(['source-code', 'test', 'openapi', 'docs', 'git']),
  file: z.string().optional(),
  symbol: z.string().optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  commit: z.string().optional(),
});

/** Validates {@link ProductElementType}. */
export const productElementTypeSchema = z.enum([
  'button',
  'link',
  'tab',
  'input',
  'form',
  'menu',
  'dialog',
  'table',
  'section',
  'other',
]);

/** Validates {@link ProductElement}. */
export const productElementSchema = z.object({
  id: guideElementIdSchema,
  type: productElementTypeSchema,
  label: z.string().optional(),
  description: z.string().optional(),
  featureId: z.string().optional(),
  provenance: z.array(provenanceReferenceSchema).optional(),
  metadata: metadataSchema.optional(),
});

/** Validates {@link ProductFeature}. */
export const productFeatureSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('feature'),
  title: z.string().min(1),
  description: z.string().optional(),
  routes: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  elements: z.array(productElementSchema).optional(),
  actions: z.array(z.string()).optional(),
  relationships: z.array(z.string()).optional(),
  provenance: z.array(provenanceReferenceSchema).optional(),
  metadata: metadataSchema.optional(),
});

/** Validates {@link ProductModel}. */
export const productModelSchema = z.object({
  version: z.literal(1),
  application: z.string().optional(),
  features: z.array(productFeatureSchema),
});

// ---------------------------------------------------------------------------
// Application context
// ---------------------------------------------------------------------------

/** Validates {@link AppContextEntity}. */
export const appContextEntitySchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

/** Validates {@link AppContext}. */
export const appContextSchema = z.object({
  route: z.string().optional(),
  screen: z.string().optional(),
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  selectedEntity: appContextEntitySchema.optional(),
  visibleElements: z.array(z.string()).optional(),
  metadata: metadataSchema.optional(),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Validates {@link GuideErrorCode}. */
export const guideErrorCodeSchema = z.enum([
  'target_not_found',
  'target_not_mounted',
  'target_not_visible',
  'timeout',
  'cancelled',
  'invalid_input',
  'action_not_found',
  'permission_denied',
  'confirmation_required',
  'execution_failed',
]);

/** Validates {@link GuideError}. */
export const guideErrorSchema = z.object({
  code: guideErrorCodeSchema,
  message: z.string(),
  issues: z
    .array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }))
    .optional(),
  details: metadataSchema.optional(),
});

/** Validates {@link GuideActionRisk}. */
export const guideActionRiskSchema = z.enum(['safe', 'confirm', 'restricted']);

/** Validates {@link GuideActionSource}. */
export const guideActionSourceSchema = z.enum(['user', 'agent', 'system']);

/**
 * Validates the serialisable part of a {@link GuideActionRequest}.
 *
 * `signal` is deliberately absent: an `AbortSignal` cannot cross a wire, so it
 * is attached by the caller after parsing rather than validated here.
 */
export const guideActionRequestSchema = z.object({
  action: z.string().min(1),
  input: z.unknown().optional(),
  requestId: z.string().min(1).optional(),
  source: guideActionSourceSchema.optional(),
  reason: z.string().optional(),
});

/** Validates {@link GuideActionDescriptor}. */
export const guideActionDescriptorSchema = z.object({
  name: z.string().min(1),
  title: z.string(),
  description: z.string(),
  risk: guideActionRiskSchema,
  metadata: metadataSchema.optional(),
});

// ---------------------------------------------------------------------------
// Built-in action inputs
// ---------------------------------------------------------------------------

/** How a highlight should be positioned relative to its target. */
export const highlightPlacementSchema = z.enum(['top', 'bottom', 'left', 'right', 'auto']);

/** Input for the built-in `navigate` action. */
export const navigateInputSchema = z.object({
  /** Application route to navigate to, e.g. `/clients`. */
  route: z.string().min(1),
  /** Replace the current history entry instead of pushing a new one. */
  replace: z.boolean().optional(),
});

/** Input for the built-in `highlight` action. */
export const highlightInputSchema = z.object({
  /** Semantic id of the element to highlight. */
  elementId: guideElementIdSchema,
  /** Optional heading shown in the popover. */
  title: z.string().optional(),
  /** Optional body text shown in the popover. */
  message: z.string().optional(),
  /** Preferred popover placement. Defaults to `auto`. */
  placement: highlightPlacementSchema.optional(),
  /** Scroll the target into view before highlighting. Defaults to `true`. */
  scrollIntoView: z.boolean().optional(),
  /** Clear the highlight automatically after this many milliseconds. */
  durationMs: z.number().int().positive().optional(),
  /** Padding in pixels between the target and the spotlight edge. */
  padding: z.number().int().nonnegative().optional(),
});

/** Input for the built-in `scroll` action. */
export const scrollInputSchema = z.object({
  /** Semantic id of the element to scroll to. */
  elementId: guideElementIdSchema,
  /** Vertical alignment of the target. Defaults to `center`. */
  block: z.enum(['start', 'center', 'end', 'nearest']).optional(),
  /** Scroll behaviour. Defaults to `smooth`. */
  behavior: z.enum(['auto', 'smooth']).optional(),
});

/**
 * Input for the built-in `open` action.
 *
 * "Opening" a menu, dialog or section is application-specific, so the host
 * supplies the implementation; the contract only names the target.
 */
export const openInputSchema = z.object({
  /** Semantic id of the element to open. */
  elementId: guideElementIdSchema,
});

/** Input for the built-in `startGuide` action. */
export const startGuideInputSchema = z.object({
  /** Identifier of a multi-step guide known to the host. */
  guideId: z.string().min(1),
  /** Zero-based step to begin at. Defaults to `0`. */
  startAtStep: z.number().int().nonnegative().optional(),
});

/**
 * Input schemas for the built-in action vocabulary, keyed by action name.
 *
 * Hosts implement the handlers; the shapes are fixed here so an indexer, a
 * React binding and a future agent all describe `highlight` the same way.
 */
export const builtinActionSchemas = {
  navigate: navigateInputSchema,
  highlight: highlightInputSchema,
  scroll: scrollInputSchema,
  open: openInputSchema,
  startGuide: startGuideInputSchema,
} as const;

/** Validated input of the built-in `navigate` action. */
export type NavigateInput = z.infer<typeof navigateInputSchema>;
/** Validated input of the built-in `highlight` action. */
export type HighlightInput = z.infer<typeof highlightInputSchema>;
/** Validated input of the built-in `scroll` action. */
export type ScrollInput = z.infer<typeof scrollInputSchema>;
/** Validated input of the built-in `open` action. */
export type OpenInput = z.infer<typeof openInputSchema>;
/** Validated input of the built-in `startGuide` action. */
export type StartGuideInput = z.infer<typeof startGuideInputSchema>;
/** Where a highlight popover is placed relative to its target. */
export type HighlightPlacement = z.infer<typeof highlightPlacementSchema>;
