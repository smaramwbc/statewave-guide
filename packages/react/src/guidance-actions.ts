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
  type GuideActionDefinition,
  type GuideActionSchema,
  type NavigateInput,
  type OpenInput,
  type StartGuideInput,
} from '@statewavedev/guide-shared';
import type { HighlightController } from './highlight/controller.js';

/** Host implementations for the actions this package cannot implement itself. */
export interface GuidanceActionHandlers {
  /** Navigates to a route. Registering `navigate` requires this. */
  navigate?: (input: NavigateInput) => void | Promise<void>;
  /** Opens a menu, dialog or section. Registering `open` requires this. */
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
 * Known Day-0 rough edge: a {@link GuideActionDefinition} handler can only
 * signal failure by throwing, and the registry turns anything thrown into
 * `execution_failed`. A highlight against an unmounted element is really
 * `target_not_found`, and the message below says so, but the code the caller
 * reads is still `execution_failed`. Mapping handler failures onto specific
 * `GuideActionErrorCode`s needs a richer handler contract than Day 0 has, and
 * is deliberately left until the action layer grows one.
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
      execute: async (input) => {
        const result = await controller.highlight(input.elementId, {
          title: input.title,
          message: input.message,
          placement: input.placement,
          padding: input.padding,
          durationMs: input.durationMs,
          scrollIntoView: input.scrollIntoView,
        });
        if (!result.ok) throw new Error(result.message);
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
      execute: async (input) => {
        const result = await controller.scrollTo(input.elementId, {
          block: input.block,
          behavior: input.behavior,
        });
        if (!result.ok) throw new Error(result.message);
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
        execute: async (input) => {
          await open(input);
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
