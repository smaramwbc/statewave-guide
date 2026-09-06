/**
 * Counting what happened, and stopping there.
 *
 * A profile is arithmetic over events: how many times guidance for a feature was
 * viewed, how many times somebody asked to be shown where something is, whether
 * they ever reached the end of the steps. No prose is generated, nothing is
 * summarised, nothing is embedded, and no inference is drawn about why a person
 * did any of it.
 *
 * The version rule is the one with teeth. Feature history is scoped to the
 * application version it happened against, because a guide completed against a
 * build the application has moved past is history rather than a reason to
 * collapse today's instructions. Explicit preferences are not scoped that way —
 * somebody who asked for concise answers in March did not withdraw the request
 * by the product shipping in April.
 *
 * @packageDocumentation
 */

import type {
  AssistanceModePreference,
  GuidanceDetailPreference,
  GuideMemoryEvent,
} from './events.js';

/** Bounded counters for one feature, within one application version. */
export interface GuideFeatureHistory {
  featureId: string;
  views: number;
  showMeUses: number;
  stepThroughStarts: number;
  stepThroughCompletions: number;
  fullStepsExpansions: number;
  /**
   * The version these counters belong to.
   *
   * Counters from other versions are not merged in. They are not wrong, they
   * are about a different application.
   */
  applicationVersion?: string;
}

/** What the user asked for, in their own words, by choosing it. */
export interface GuideExplicitPreferences {
  guidanceDetail?: GuidanceDetailPreference;
  assistanceMode?: AssistanceModePreference;
}

/**
 * Patterns, labelled as patterns.
 *
 * Every field here is a *hint* and is named one, because the difference between
 * "three Show me presses were observed" and "you prefer Show me" is the
 * difference between a count and a claim about somebody's mind.
 *
 * **These counters are deliberately not version-scoped, and feature history is.**
 * An audit read the difference as an oversight, which is fair — it was not
 * written down. The rule is that version scoping applies to claims about *this
 * build*: "you have already worked through these steps" is one, and it stops
 * being true when the steps change. "You have reached for Show me rather than
 * Step through" is a claim about the person, and a release does not change how
 * somebody likes to be helped. Same reason explicit preferences survive a
 * version. The consequence is bounded: the hint may only emphasise an action the
 * guide was already offering.
 */
export interface GuideInteractionPatterns {
  totalEvents: number;
  /** Suggested by repeated use, never by a single press, and never a preference. */
  preferredAssistanceModeHint?: 'SHOW_ME' | 'STEP_THROUGH';
  showMeUses: number;
  stepThroughStarts: number;
}

export interface GuideMemoryProfile {
  subjectId: string;
  workspaceId?: string;
  appId: string;
  applicationVersion?: string;
  explicitPreferences: GuideExplicitPreferences;
  featureHistory: readonly GuideFeatureHistory[];
  interactionPatterns: GuideInteractionPatterns;
}

/** How many times a thing must happen before it counts as a pattern. */
const PATTERN_THRESHOLD = 3;

const emptyHistory = (featureId: string, applicationVersion?: string): GuideFeatureHistory => ({
  featureId,
  views: 0,
  showMeUses: 0,
  stepThroughStarts: 0,
  stepThroughCompletions: 0,
  fullStepsExpansions: 0,
  ...(applicationVersion === undefined ? {} : { applicationVersion }),
});

/**
 * A profile for one subject, from events that already survived validation.
 *
 * Deterministic and clock-free: the same events in the same order produce the
 * same profile, and nothing here asks what time it is.
 */
export function projectMemoryProfile(input: {
  events: readonly GuideMemoryEvent[];
  subjectId: string;
  workspaceId?: string;
  appId: string;
  /** The version the *current* session is running. */
  applicationVersion?: string;
}): GuideMemoryProfile {
  const { subjectId, workspaceId, appId, applicationVersion } = input;

  // One delivery of an event is one thing that happened.
  //
  // Statewave deduplicates writes by idempotency key, so a retry does not create
  // a second episode — that is proved against a real server. This is the other
  // half, and it is the half that does not depend on which store is underneath: a
  // replica that answered a retry, a store that is not Statewave, or a caller
  // that read twice and concatenated could each deliver the same event twice, and
  // a profile that counted it twice would report somebody pressing Show me four
  // times because the network hiccuped.
  //
  // Event ids are unique per event by construction, which is what makes this
  // safe: it collapses repeats and never distinct events.
  const seen = new Set<string>();
  const delivered = input.events.filter((event) => {
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });

  // Scope first, count second. An event belonging to another subject, another
  // workspace or another application is not this person's history, and a filter
  // applied after counting is a filter that has already leaked.
  const mine = delivered.filter((event) => {
    if (event.subjectId !== subjectId) return false;
    if (event.appId !== appId) return false;
    if (workspaceId !== undefined && event.workspaceId !== workspaceId) return false;
    if (workspaceId === undefined && event.workspaceId !== undefined) return false;
    return true;
  });

  const explicitPreferences: GuideExplicitPreferences = {};
  const histories = new Map<string, GuideFeatureHistory>();
  let showMeUses = 0;
  let stepThroughStarts = 0;

  // Which record currently owns each preference, so a later one can be compared
  // against it rather than simply overwriting it.
  //
  // This used to be a plain assignment, which made the winner whichever record
  // came last *in the array*. That is fine for a local store, which returns what
  // it was given in the order it was given. It is not fine for a remote one:
  // `GET /v1/timeline` returns whatever order the database felt like, so the
  // same two records could resolve to CONCISE on one read and FULL on the next.
  // The store was deciding the preference instead of the person.
  //
  // Counters do not need this — addition commutes — which is why the ordering
  // tests passed while this branch was wrong.
  const preferenceWinner = new Map<string, { occurredAt: string; eventId: string }>();

  /** Later wins; a tie is broken by event id so the answer is never a coin toss. */
  const winsPreference = (key: string, event: GuideMemoryEvent): boolean => {
    const held = preferenceWinner.get(key);
    if (held === undefined) return true;
    if (event.occurredAt !== held.occurredAt) return event.occurredAt > held.occurredAt;
    return event.eventId > held.eventId;
  };

  for (const event of mine) {
    if (event.kind === 'EXPLICIT_PREFERENCE_SET') {
      // Preferences outlive versions. A request for concise answers is about how
      // somebody wants to be spoken to, not about a build.
      const preference = event.metadata?.preference;
      const value = event.metadata?.value;
      if (
        (preference === 'guidanceDetail' || preference === 'assistanceMode') &&
        value !== undefined &&
        winsPreference(preference, event)
      ) {
        preferenceWinner.set(preference, {
          occurredAt: event.occurredAt,
          eventId: event.eventId,
        });
        if (preference === 'guidanceDetail') {
          explicitPreferences.guidanceDetail = value as GuidanceDetailPreference;
        } else {
          explicitPreferences.assistanceMode = value as AssistanceModePreference;
        }
      }
      continue;
    }

    if (event.kind === 'SHOW_ME_USED') showMeUses += 1;
    if (event.kind === 'STEP_THROUGH_STARTED') stepThroughStarts += 1;

    if (event.featureId === undefined) continue;

    // Feature history is version-scoped. An event from another build is real
    // and is not counted here, because what it would be used for — collapsing
    // steps somebody has already worked through — is a claim about *these*
    // steps.
    //
    // Fails closed. The first version skipped this check entirely when the
    // session had no version, which meant a host that forgot to supply one got
    // completions from every build it had ever shipped. An unknown version is
    // not a matching version.
    if (event.applicationVersion !== applicationVersion) continue;

    const history =
      histories.get(event.featureId) ?? emptyHistory(event.featureId, applicationVersion);
    if (event.kind === 'GUIDANCE_VIEWED') history.views += 1;
    if (event.kind === 'SHOW_ME_USED') history.showMeUses += 1;
    if (event.kind === 'STEP_THROUGH_STARTED') history.stepThroughStarts += 1;
    if (event.kind === 'STEP_THROUGH_COMPLETED') history.stepThroughCompletions += 1;
    if (event.kind === 'FULL_STEPS_EXPANDED') history.fullStepsExpansions += 1;
    histories.set(event.featureId, history);
  }

  const patterns: GuideInteractionPatterns = {
    totalEvents: mine.length,
    showMeUses,
    stepThroughStarts,
  };
  // A hint, and only when one mode is genuinely ahead. Naming it `Hint` in the
  // field itself is deliberate: nothing downstream can read this and honestly
  // call it a preference.
  if (showMeUses >= PATTERN_THRESHOLD && showMeUses > stepThroughStarts) {
    patterns.preferredAssistanceModeHint = 'SHOW_ME';
  } else if (stepThroughStarts >= PATTERN_THRESHOLD && stepThroughStarts > showMeUses) {
    patterns.preferredAssistanceModeHint = 'STEP_THROUGH';
  }

  return {
    subjectId,
    ...(workspaceId === undefined ? {} : { workspaceId }),
    appId,
    ...(applicationVersion === undefined ? {} : { applicationVersion }),
    explicitPreferences,
    featureHistory: [...histories.values()].sort((left, right) =>
      left.featureId.localeCompare(right.featureId),
    ),
    interactionPatterns: patterns,
  };
}

/**
 * Whether this person has finished this guide, on this build.
 *
 * The only evidence that counts is a recorded `STEP_THROUGH_COMPLETED`. Viewing
 * guidance is not completing it, pressing Show me is not completing it, and
 * starting the steps is emphatically not completing them — the sentence the
 * guide is allowed to say depends on this being exact.
 */
export function hasCompletedGuide(profile: GuideMemoryProfile, featureId: string): boolean {
  const history = profile.featureHistory.find((entry) => entry.featureId === featureId);
  return history !== undefined && history.stepThroughCompletions > 0;
}
