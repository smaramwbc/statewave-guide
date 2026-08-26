/**
 * The guidance engine, expressed in the action vocabulary.
 *
 * `highlight` and `scroll` are the two capabilities this package can implement
 * on its own — they need nothing but a DOM and the element registry.
 * `navigate`, `open` and `startGuide` are *not* implemented here: routing and
 * modal state belong to the host application, so those actions only exist when
 * the host supplies a handler for them. A React binding that owned routing
 * would be a React binding you could not use with your own router.
 *
 * Every schema comes from `builtinActionSchemas`. The shapes are declared once,
 * in `@statewavedev/guide-shared`, so the indexer, the runtime and a future
 * agent all describe `highlight` identically.
 *
 * @packageDocumentation
 */

import {
  builtinActionSchemas,
  guideError,
  type GuideActionDefinition,
  type GuideActionSchema,
  type NavigateInput,
  type OpenInput,
  type StartGuideInput,
} from '@statewavedev/guide-shared';
import { ActionFailure } from '@statewavedev/guide-actions';
import type { HighlightController } from './highlight/controller.js';

/** Host implementations for the actions this package cannot implement itself. */
export interface GuidanceActionHandlers {
  /** Navigates to a route. Registering `navigate` requires this. */
  navigate?: (input: NavigateInput) => void | Promise<void>;
  /**
   * Opens a menu, dialog or section. Registering `open` requires this.
   *
   * Only called once the guide has confirmed the target is on screen, so a
   * handler never has to defend against an id nothing is registered under.
   */
  open?: (input: OpenInput) => void | Promise<void>;
  /** Starts a multi-step guide known to the host. Registering `startGuide` requires this. */
  startGuide?: (input: StartGuideInput) => void | Promise<void>;
}

/** What {@link createGuidanceActions} needs. */
export interface GuidanceActionDeps {
  /** The controller that actually moves the spotlight. */
  highlight: HighlightController;
  /** Host handlers. Each one present adds its action to the returned list. */
  handlers?: GuidanceActionHandlers;
}

/**
 * Widens a precisely-typed definition to the registry's storage type.
 *
 * Safe by construction: the registry validates input against `schema` before it
 * calls `execute`, so a handler never sees a value its parameter type excludes.
 * This mirrors what `createActionRegistry` does internally when it stores
 * heterogeneous definitions in one map.
 */
function widen<TSchema extends GuideActionSchema, TOutput>(
  definition: GuideActionDefinition<TSchema, TOutput>,
): GuideActionDefinition {
  return definition as unknown as GuideActionDefinition;
}

/**
 * Builds the built-in guidance actions.
 *
 * Each handler that takes an `elementId` rethrows the engine's
 * `GuideError` as an {@link ActionFailure}, which the registry unwraps
 * into `{ success: false, error }` with the code intact. That is what makes
 * `highlight` against a ghost id come back as `target_not_found` rather than a
 * generic `execution_failed` with the reason buried in a string — the whole
 * point of having codes at all.
 *
 * Every handler takes the execution context as well as the input, and passes
 * its `signal` down to the engine. The registry refuses a request whose signal
 * was already aborted, but only these handlers can hear an abort that arrives
 * *while* a scroll is in flight.
 */
export function createGuidanceActions(deps: GuidanceActionDeps): GuideActionDefinition[] {
  const controller = deps.highlight;
  const handlers = deps.handlers ?? {};

  const definitions: GuideActionDefinition[] = [
    widen({
      name: 'highlight',
      title: 'Highlight element',
      description:
        "Draw the user's attention to a UI element, identified by its semantic id such as " +
        '"clients.create". Optionally shows a short title and message beside it. Purely visual: ' +
        'it never clicks, submits or changes anything.',
      risk: 'safe',
      schema: builtinActionSchemas.highlight,
      // `context` is not decoration: it carries the caller's `AbortSignal`, and
      // a highlight spends most of its time awaiting a scroll. Dropping the
      // second parameter meant an abort mid-flight was never seen, the call ran
      // to completion, and the caller was told its cancelled request succeeded
      // while the spotlight it thought it had cancelled stayed on screen.
      execute: async (input, context) => {
        const result = await controller.highlight(input.elementId, {
          title: input.title,
          message: input.message,
          placement: input.placement,
          padding: input.padding,
          durationMs: input.durationMs,
          scrollIntoView: input.scrollIntoView,
          signal: context.signal,
        });
        if (!result.success) throw ActionFailure.from(result.error);
        return result;
      },
    }),

    widen({
      name: 'scroll',
      title: 'Scroll to element',
      description:
        'Scroll a UI element into view, identified by its semantic id such as "clients.create". ' +
        'Moves the viewport only; it never interacts with the element.',
      risk: 'safe',
      schema: builtinActionSchemas.scroll,
      execute: async (input, context) => {
        const result = await controller.scrollTo(input.elementId, {
          block: input.block,
          behavior: input.behavior,
          signal: context.signal,
        });
        if (!result.success) throw ActionFailure.from(result.error);
        return result;
      },
    }),
  ];

  const navigate = handlers.navigate;
  if (navigate) {
    definitions.push(
      widen({
        name: 'navigate',
        title: 'Navigate',
        description:
          'Navigate the application to a route such as "/clients". Changes what is on screen but ' +
          'never changes application data.',
        risk: 'safe',
        schema: builtinActionSchemas.navigate,
        execute: async (input) => {
          await navigate(input);
        },
      }),
    );
  }

  const open = handlers.open;
  if (open) {
    definitions.push(
      widen({
        name: 'open',
        title: 'Open element',
        description:
          'Open a menu, dialog, panel or collapsed section, identified by its semantic id. The ' +
          'host application decides what "open" means for that element.',
        risk: 'safe',
        schema: builtinActionSchemas.open,
        execute: async (input, context) => {
          // The host decides what "open" means, but it should never be asked
          // to open something that is not there. Classifying the target here is
          // what keeps a ghost id reported as `target_not_found` instead of
          // whatever the host's handler happens to throw.
          //
          // A registered-but-unmounted target is refused too, as
          // `target_not_mounted`: `open` moves the user to something that
          // exists, it does not conjure one. A host whose dialog registers only
          // once it is open should register the *trigger* and let the guide
          // point at that.
          const target = controller.checkTarget(input.elementId);
          if (!target.success) throw ActionFailure.from(target.error);
          // The registry checked the signal before calling us; classifying the
          // target is the only thing that has happened since, but a host
          // handler is the one step here that cannot be taken back, so it is
          // worth not starting one the caller has already cancelled.
          if (context.signal?.aborted === true) {
            throw ActionFailure.from(
              guideError('cancelled', `Opening "${input.elementId}" was cancelled.`, {
                details: { elementId: input.elementId },
              }),
            );
          }
          await open(input);
          return target;
        },
      }),
    );
  }

  const startGuide = handlers.startGuide;
  if (startGuide) {
    definitions.push(
      widen({
        name: 'startGuide',
        title: 'Start guided walkthrough',
        description:
          'Start a multi-step guided walkthrough that the host application has defined, ' +
          'optionally at a given step.',
        risk: 'safe',
        schema: builtinActionSchemas.startGuide,
        execute: async (input) => {
          await startGuide(input);
        },
      }),
    );
  }

  return definitions;
}
