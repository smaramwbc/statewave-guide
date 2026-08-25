/**
 * `@statewavedev/guide-actions`
 *
 * The framework-independent action runtime. It holds the set of named,
 * schema-validated capabilities the guide is allowed to invoke, gates them by
 * declared risk, and turns every possible failure into data rather than an
 * exception.
 *
 * It has no opinion about what an action *does* — a `navigate` handler is
 * supplied by the host and might call a React router, a Tauri window, or a
 * no-op in a test.
 *
 * @packageDocumentation
 */

export { createActionRegistry } from './registry.js';
export type {
  ActionRegistry,
  ActionRegistryOptions,
  ListOptions,
  RegisterOptions,
} from './registry.js';

export { defaultActionPolicy } from './policy.js';
export type { ActionPolicy, ActionPolicyDecision, ActionPolicyInput } from './policy.js';

export { ActionRegistrationError, actionError } from './errors.js';

export { toGuideActionIssues } from './issues.js';
