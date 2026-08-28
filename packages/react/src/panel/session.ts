/**
 * A conversation, held in memory for as long as the panel is open.
 *
 * Deliberately small. Turns, an optional last-resolved feature, and nothing
 * else — no summarisation, no retrieval, no durable store. A refresh loses it,
 * and that is the intended behaviour rather than a shortcoming to apologise for:
 * a guide that remembered across sessions would need a policy for what it is
 * allowed to remember, and that policy is a project of its own.
 *
 * The one piece of carried state is `lastFeatureId`, which exists so that
 * *"Why can't I see it?"* after a question about creating a client can mean the
 * thing just discussed. It is passed to the query contract as an ordinary
 * context field and is never treated as evidence — a follow-up that resolves on
 * its own ignores it entirely.
 *
 * @packageDocumentation
 */

import type { GuideQueryResponse } from '@statewavedev/guide-core';

/** One exchange. */
export type GuideTurn =
  | { role: 'user'; id: string; text: string }
  | { role: 'guide'; id: string; response: GuideQueryResponse };

/** The whole conversation, plus what it remembers. */
export interface GuideSession {
  turns: readonly GuideTurn[];
  /** The feature the last answered turn was about, for bounded follow-ups. */
  lastFeatureId?: string;
}

export const emptySession: GuideSession = { turns: [] };

/** Adds a question. */
export function withQuestion(session: GuideSession, text: string, id: string): GuideSession {
  return { ...session, turns: [...session.turns, { role: 'user', id, text }] };
}

/** Adds an answer, and remembers what it was about. */
export function withAnswer(
  session: GuideSession,
  response: GuideQueryResponse,
  id: string,
): GuideSession {
  return {
    turns: [...session.turns, { role: 'guide', id, response }],
    ...(response.featureId === undefined
      ? session.lastFeatureId === undefined
        ? {}
        : { lastFeatureId: session.lastFeatureId }
      : { lastFeatureId: response.featureId }),
  };
}
