/**
 * Translation from Zod's validation issues to the runtime's own issue shape.
 *
 * The action contract does not expose Zod types to its callers. A model reading
 * a failure should see a plain path and a message, not a library-specific error
 * object, and the runtime should be able to swap validators later without
 * changing what callers observe.
 *
 * @packageDocumentation
 */

import type { GuideActionIssue } from '@statewavedev/guide-shared';
import type { z } from 'zod';

/** Zod paths may contain symbols; the wire format may not. */
function normaliseSegment(segment: PropertyKey): string | number {
  if (typeof segment === 'number') return segment;
  if (typeof segment === 'string') return segment;
  return segment.toString();
}

/** Converts Zod issues into {@link GuideActionIssue} values. */
export function toGuideActionIssues(issues: readonly z.core.$ZodIssue[]): GuideActionIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map(normaliseSegment),
    message: issue.message,
  }));
}
