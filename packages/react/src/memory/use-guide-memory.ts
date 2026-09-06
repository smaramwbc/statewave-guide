/**
 * The hook that remembers, and the one place a failure to remember is absorbed.
 *
 * Everything here is wrapped, because Closed Loop #19's hardest requirement is
 * not what memory does when it works. A store that throws, times out, returns
 * malformed rows or hands back an event kind nobody has heard of must cost
 * personalisation and nothing else — the question still gets its answer, the
 * facts are still the facts, and no provider diagnostic reaches a user.
 *
 * So every call is caught, every failure is counted, and the fallback is the
 * neutral plan, which is byte-identical to what a build with no memory at all
 * produces.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  neutralPresentationPlan,
  planPresentation,
  projectMemoryProfile,
  validateMemoryEvent,
} from '@statewavedev/guide-core';
import type {
  AssistanceModePreference,
  GuidanceDetailPreference,
  GuideMemoryEvent,
  GuideMemoryEventKind,
  GuideMemoryProfile,
  GuideMemoryStore,
  GuidePresentationPlan,
  GuideQueryResponse,
} from '@statewavedev/guide-core';
import { createBrowserGuideMemoryStore } from './browser-store.js';

/**
 * What a host turns on when it wants the guide to remember.
 *
 * Off unless asked. Opaque ids only — a host that has a user id has one; a host
 * that would have to read an email off its own page does not have one, and
 * should leave this disabled.
 */
export interface GuideMemoryOptions {
  enabled: boolean;
  appId: string;
  subjectId: string;
  workspaceId?: string;
  applicationVersion?: string;
  /** Defaults to the browser store. A host with a backend supplies its own. */
  store?: GuideMemoryStore;
}

export interface GuideMemoryController {
  ready: boolean;
  profile: GuideMemoryProfile | undefined;
  /** Record something that happened. Never throws, whatever the store does. */
  record(kind: GuideMemoryEventKind, input?: { featureId?: string; stepCount?: number }): void;
  setPreference(
    preference: 'guidanceDetail' | 'assistanceMode',
    value: GuidanceDetailPreference | AssistanceModePreference,
  ): void;
  /** Forget this subject. The next question behaves like a first question. */
  clear(): void;
  /** How to present a response, given what is remembered. */
  plan(response: GuideQueryResponse): GuidePresentationPlan;
  diagnostics: {
    enabled: boolean;
    scope: string;
    eventsRead: number;
    /**
     * Events this hook validated and handed to the store.
     *
     * Not a count of what was stored, and deliberately not renamed to pretend
     * otherwise: the hook cannot know what its store did. Read it alongside
     * `storeWithheldByPolicy` and `storeWriteErrors`, which are what the store
     * itself reports.
     *
     * The sibling `rejected` counts writes the boundary refused, which is not
     * the same as writes that failed. A rejected event is a shape that may not
     * be persisted, turned away. It was invisible here, and a silently rejected
     * write looks exactly like a write that never happened, which cost most of
     * an afternoon to tell apart in a browser.
     */
    written: number;
    rejected: number;
    /** Present when the store keeps diagnostics of its own. */
    storeWriteErrors?: number;
    storeLastWriteError?: string;
    /**
     * Records the store's retention policy declined to make durable.
     *
     * Without this the inspector was misleading in a specific way: `written`
     * counts what this hook validated and handed over, and once a remote store
     * started withholding non-durable kinds, that number stopped meaning
     * anything had been stored. `written` minus this is what actually left.
     * Absent for a store that keeps everything, which is the right answer for a
     * local one.
     */
    storeWithheldByPolicy?: number;
    failures: number;
    lastFailure?: string;
  };
}

/**
 * A per-session prefix and a counter.
 *
 * The counter alone resets when the page reloads, so a second session wrote
 * `ev1, ev2` on top of a first session's `ev1, ev2` — an audit found the store
 * holding four events with two ids. Event ids are how a record is identified;
 * two records sharing one is a store that cannot be reasoned about.
 */
/**
 * A per-session prefix that cannot be mistaken for a label off a screen.
 *
 * The separators are load-bearing. `ev${SESSION}${n}` produced ids like
 * `evab12341`, which is indistinguishable in shape from a runtime instance
 * label, and the validator refused every one of them — for the whole session,
 * silently, about once in eleven page loads. Punctuation between the parts makes
 * the shapes disjoint, and the validator no longer applies that rule to an id it
 * minted itself. Either fix alone would do; both is cheap.
 */
const SESSION = Math.random().toString(36).slice(2, 8);
let sequence = 0;

export function useGuideMemory(options: GuideMemoryOptions | undefined): GuideMemoryController {
  const [profile, setProfile] = useState<GuideMemoryProfile | undefined>(undefined);
  const [ready, setReady] = useState(false);
  // State rather than refs. A ref updates without re-rendering, so the developer
  // inspector showed "failures: 0" through two failed writes and only caught up
  // when something unrelated re-rendered the host.
  const [failures, setFailures] = useState(0);
  const [lastFailure, setLastFailure] = useState<string | undefined>(undefined);
  const [eventsRead, setEventsRead] = useState(0);
  // Counted here rather than read off the store, because a host may supply any
  // store and the contract does not require one to keep diagnostics.
  const [counts, setCounts] = useState({ written: 0, rejected: 0 });
  const noteFailure = useCallback((error: unknown) => {
    setFailures((count) => count + 1);
    setLastFailure(error instanceof Error ? error.message : 'unknown');
  }, []);

  const enabled = options?.enabled === true;
  const fallbackStore = useMemo(() => createBrowserGuideMemoryStore(), []);
  /**
   * The store, reached through a ref rather than a dependency.
   *
   * The options fix below stopped depending on the options *object*; a host that
   * writes `store: createBrowserGuideMemoryStore()` inline reintroduces exactly
   * the same loop one level down, because that store is a new object on every
   * render. A ref reads the current one without making its identity a reason to
   * re-run anything.
   *
   * The cost is stated rather than hidden: swapping one store implementation for
   * another at runtime does not by itself reload the profile. Change the scope,
   * or remount with a `key`. Nothing in this project swaps stores mid-session,
   * and a silent render loop is the worse failure.
   */
  const storeRef = useRef(options?.store ?? fallbackStore);
  storeRef.current = options?.store ?? fallbackStore;

  /**
   * Primitives, not the options object.
   *
   * A host writes `memory={{ ... }}` inline, so the object is new on every
   * render. Depending on it made the load effect refire every render, which
   * re-rendered, which refired it — a loop that looked like a hung click in a
   * browser and would have looked like a mysteriously hot tab in production.
   */
  const appId = options?.appId;
  const subjectId = options?.subjectId;
  const workspaceId = options?.workspaceId;
  const applicationVersion = options?.applicationVersion;

  const scope = useMemo(
    () =>
      appId === undefined || subjectId === undefined
        ? undefined
        : {
            appId,
            subjectId,
            ...(workspaceId === undefined ? {} : { workspaceId }),
          },
    [appId, subjectId, workspaceId],
  );

  /**
   * Load, or decide that not loading is fine.
   *
   * The catch is the point. A store that throws leaves `profile` undefined,
   * which is exactly the state a memory-less build is in.
   */
  const refresh = useCallback(async () => {
    if (!enabled || scope === undefined || appId === undefined || subjectId === undefined) {
      setProfile(undefined);
      setReady(true);
      return;
    }
    try {
      const events = await storeRef.current.read(scope);
      setEventsRead(events.length);
      setProfile(
        projectMemoryProfile({
          events,
          subjectId,
          ...(workspaceId === undefined ? {} : { workspaceId }),
          appId,
          ...(applicationVersion === undefined ? {} : { applicationVersion }),
        }),
      );
    } catch (error) {
      // Kept for the developer inspector and shown to nobody else.
      noteFailure(error);
      setProfile(undefined);
    }
    setReady(true);
  }, [appId, applicationVersion, enabled, noteFailure, scope, subjectId, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const append = useCallback(
    (event: GuideMemoryEvent) => {
      if (!enabled) return;
      void (async () => {
        try {
          // Validated here as well as in the store, so the inspector can tell a
          // refused write from one that never happened. The store validates
          // again on its own account — it is untrusted and so is this caller.
          const accepted = validateMemoryEvent(event).ok;
          setCounts((current) =>
            accepted
              ? { ...current, written: current.written + 1 }
              : { ...current, rejected: current.rejected + 1 },
          );
          await storeRef.current.append(event);
          await refresh();
        } catch (error) {
          noteFailure(error);
        }
      })();
    },
    [enabled, noteFailure, refresh],
  );

  const record = useCallback<GuideMemoryController['record']>(
    (kind, input = {}) => {
      if (appId === undefined || subjectId === undefined) return;
      sequence += 1;
      append({
        eventId: `ev-${SESSION}-${sequence}`,
        appId,
        subjectId,
        ...(workspaceId === undefined ? {} : { workspaceId }),
        ...(input.featureId === undefined ? {} : { featureId: input.featureId }),
        kind,
        // Supplied as data rather than read inside adaptation, so planning stays
        // clock-free and therefore reproducible.
        occurredAt: new Date().toISOString(),
        ...(applicationVersion === undefined ? {} : { applicationVersion }),
        authority: 'OBSERVED_INTERACTION',
        ...(input.stepCount === undefined ? {} : { metadata: { stepCount: input.stepCount } }),
      });
    },
    [append, appId, applicationVersion, subjectId, workspaceId],
  );

  const setPreference = useCallback<GuideMemoryController['setPreference']>(
    (preference, value) => {
      if (appId === undefined || subjectId === undefined) return;
      sequence += 1;
      append({
        eventId: `pf-${SESSION}-${sequence}`,
        appId,
        subjectId,
        ...(workspaceId === undefined ? {} : { workspaceId }),
        kind: 'EXPLICIT_PREFERENCE_SET',
        occurredAt: new Date().toISOString(),
        ...(applicationVersion === undefined ? {} : { applicationVersion }),
        // The one place this authority is used, and only because the user
        // actually chose the value being stored.
        authority: 'EXPLICIT_USER_PREFERENCE',
        metadata: { preference, value },
      });
    },
    [append, appId, applicationVersion, subjectId, workspaceId],
  );

  const clear = useCallback(() => {
    // Honours `enabled` like every other path. An audit found this one guarding
    // only on scope, so a host with memory switched off could still reach into
    // a store and erase a bucket it had never been allowed to write.
    if (!enabled || scope === undefined) return;
    void (async () => {
      try {
        await storeRef.current.clear(scope);
      } catch (error) {
        noteFailure(error);
      }
      await refresh();
    })();
  }, [enabled, noteFailure, refresh, scope]);

  const plan = useCallback<GuideMemoryController['plan']>(
    (response) => {
      if (!enabled) return neutralPresentationPlan(response);
      try {
        return planPresentation({ response, profile, enabled });
      } catch {
        // A planner that throws is a planner that does not adapt. It is never a
        // planner that stops the answer.
        return neutralPresentationPlan(response);
      }
    },
    [enabled, profile],
  );

  return {
    ready,
    profile,
    record,
    setPreference,
    clear,
    plan,
    diagnostics: {
      enabled,
      scope:
        scope === undefined
          ? 'none'
          : `${scope.appId}:${scope.subjectId}${scope.workspaceId === undefined ? '' : `:${scope.workspaceId}`}`,
      eventsRead,
      written: counts.written,
      rejected: counts.rejected,
      // A store is not required to keep diagnostics, so this is asked for and
      // not demanded. When it is there, a write that threw stops being invisible.
      ...(() => {
        const store: unknown = storeRef.current;
        const read =
          typeof (store as { diagnostics?: unknown }).diagnostics === 'function'
            ? (
                store as {
                  diagnostics: () => {
                    writeErrors?: number;
                    lastWriteError?: string;
                    withheldByPolicy?: number;
                  };
                }
              ).diagnostics()
            : undefined;
        if (read === undefined) return {};
        return {
          storeWriteErrors: read.writeErrors ?? 0,
          // Only when the store actually keeps one. A local store persists every
          // kind, and reporting a withheld count of zero there would imply a
          // policy it does not have.
          ...(read.withheldByPolicy === undefined
            ? {}
            : { storeWithheldByPolicy: read.withheldByPolicy }),
          ...(read.lastWriteError === undefined
            ? {}
            : { storeLastWriteError: read.lastWriteError }),
        };
      })(),
      failures,
      ...(lastFailure === undefined ? {} : { lastFailure }),
    },
  };
}
