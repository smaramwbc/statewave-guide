import { describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createGuideRuntime } from '@statewavedev/guide-core';
import type { GuideActionRequest, GuideActionResult } from '@statewavedev/guide-shared';
import { GuideElement } from '../src/guide-element.js';
import { StatewaveGuideProvider } from '../src/provider.js';
import { useGuide } from '../src/use-guide.js';
import { useGuideActions } from '../src/use-guide-actions.js';
import { useGuideContext } from '../src/use-guide-context.js';
import { intersectionObservers } from './setup.js';

function ActionNames(): ReactNode {
  const { actions } = useGuideActions();
  return <div data-testid="actions">{actions.map((action) => action.name).join(',')}</div>;
}

function names(): string[] {
  const text = screen.getByTestId('actions').textContent ?? '';
  return text.length === 0 ? [] : text.split(',');
}

/**
 * Runs an action on demand.
 *
 * The provider registers the guidance actions from an effect, and React runs a
 * child's effects before its parent's — so a child cannot execute `highlight`
 * during its own mount. Driving it from a click is both deterministic and what
 * a real host does.
 */
function Runner({
  request,
  onResult,
}: {
  request: GuideActionRequest;
  onResult: (result: GuideActionResult) => void;
}): ReactNode {
  const { executeAction } = useGuide();
  return (
    <button
      type="button"
      data-testid="run"
      onClick={() => {
        void executeAction(request).then(onResult);
      }}
    >
      run
    </button>
  );
}

/** Waits until the provider has registered the guidance actions, then runs. */
async function runWhenRegistered(): Promise<void> {
  await waitFor(() => {
    expect(names()).toContain('highlight');
  });
  screen.getByTestId('run').click();
}

describe('<StatewaveGuideProvider>', () => {
  it('registers highlight and scroll, and navigate only when a handler is given', async () => {
    const runtime = createGuideRuntime();

    const { rerender } = render(
      <StatewaveGuideProvider runtime={runtime}>
        <ActionNames />
      </StatewaveGuideProvider>,
    );

    await waitFor(() => {
      expect(names()).toEqual(['highlight', 'scroll']);
    });
    expect(runtime.actions.has('navigate')).toBe(false);

    rerender(
      <StatewaveGuideProvider runtime={runtime} navigate={() => undefined}>
        <ActionNames />
      </StatewaveGuideProvider>,
    );

    await waitFor(() => {
      expect(names()).toEqual(['highlight', 'navigate', 'scroll']);
    });
    // The React package never owns routing: `navigate` exists only because the
    // host supplied an implementation.
    expect(runtime.actions.get('navigate')?.risk).toBe('safe');
  });

  it('can be told not to register the guidance actions', async () => {
    const runtime = createGuideRuntime();
    render(
      <StatewaveGuideProvider runtime={runtime} registerGuidanceActions={false}>
        <ActionNames />
      </StatewaveGuideProvider>,
    );

    await waitFor(() => {
      expect(names()).toEqual([]);
    });
  });

  it('unregisters the guidance actions when it unmounts', async () => {
    const runtime = createGuideRuntime();
    const { unmount } = render(
      <StatewaveGuideProvider runtime={runtime}>
        <ActionNames />
      </StatewaveGuideProvider>,
    );

    await waitFor(() => {
      expect(runtime.actions.has('highlight')).toBe(true);
    });

    unmount();
    expect(runtime.actions.has('highlight')).toBe(false);
    expect(runtime.actions.has('scroll')).toBe(false);
  });

  it('executes highlight end to end, from action request to overlay', async () => {
    let result: GuideActionResult | null = null;

    render(
      <StatewaveGuideProvider>
        <GuideElement id="clients.create" type="button" label="New Client">
          <button type="button">New Client</button>
        </GuideElement>
        <ActionNames />
        <Runner
          request={{
            action: 'highlight',
            input: { elementId: 'clients.create', title: 'Here', scrollIntoView: false },
          }}
          onResult={(value) => {
            result = value;
          }}
        />
      </StatewaveGuideProvider>,
    );

    await runWhenRegistered();

    await waitFor(() => {
      expect(result).not.toBeNull();
    });
    expect((result as GuideActionResult | null)?.ok).toBe(true);
    expect(document.querySelectorAll('.sw-guide-dim')).toHaveLength(4);
    expect(document.querySelector('.sw-guide-popover')?.textContent).toContain('Here');
  });

  it('refuses a selector-shaped elementId before it can reach the DOM', async () => {
    let result: GuideActionResult | null = null;

    render(
      <StatewaveGuideProvider>
        <GuideElement id="clients.create" type="button">
          <button type="button">New Client</button>
        </GuideElement>
        <ActionNames />
        <Runner
          request={{
            action: 'highlight',
            source: 'agent',
            input: { elementId: '#app > div:nth-child(4)' },
          }}
          onResult={(value) => {
            result = value;
          }}
        />
      </StatewaveGuideProvider>,
    );

    await runWhenRegistered();
    await waitFor(() => {
      expect(result).not.toBeNull();
    });

    const failure = result as GuideActionResult | null;
    expect(failure?.ok).toBe(false);
    if (failure && !failure.ok) {
      expect(failure.error.code).toBe('invalid_input');
      expect(failure.error.issues?.[0]?.path).toEqual(['elementId']);
    }
    // The schema refuses it before the handler runs: the selector never reaches
    // a DOM query, and nothing was drawn.
    expect(document.querySelector('[data-statewave-guide-overlay]')).toBeNull();
  });

  it('reports a missing element as a failed action rather than an exception', async () => {
    let result: GuideActionResult | null = null;

    render(
      <StatewaveGuideProvider>
        <ActionNames />
        <Runner
          request={{ action: 'highlight', input: { elementId: 'clients.nowhere' } }}
          onResult={(value) => {
            result = value;
          }}
        />
      </StatewaveGuideProvider>,
    );

    await runWhenRegistered();
    await waitFor(() => {
      expect(result).not.toBeNull();
    });

    const failure = result as GuideActionResult | null;
    expect(failure?.ok).toBe(false);
    if (failure && !failure.ok) {
      expect(failure.error.message).toContain('clients.nowhere');
    }
  });

  it('gives every hook a helpful error outside the provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useGuide())).toThrow(/useGuide\(\).*StatewaveGuideProvider/s);
    expect(() => renderHook(() => useGuideContext())).toThrow(/useGuideContext\(\)/);
    expect(() => renderHook(() => useGuideActions())).toThrow(/useGuideActions\(\)/);

    error.mockRestore();
  });

  it('re-renders consumers when the application context is patched', async () => {
    function Route(): ReactNode {
      const { context, patchContext } = useGuideContext();
      return (
        <div>
          <span data-testid="route">{context.route ?? 'none'}</span>
          <button type="button" onClick={() => patchContext({ route: '/clients' })}>
            go
          </button>
        </div>
      );
    }

    render(
      <StatewaveGuideProvider>
        <Route />
      </StatewaveGuideProvider>,
    );

    expect(screen.getByTestId('route').textContent).toBe('none');
    screen.getByRole('button', { name: 'go' }).click();

    await waitFor(() => {
      expect(screen.getByTestId('route').textContent).toBe('/clients');
    });
  });

  it('keeps visibleElements in sync with the registry', async () => {
    const runtime = createGuideRuntime();
    render(
      <StatewaveGuideProvider runtime={runtime}>
        <GuideElement id="clients.create" type="button">
          <button type="button">New Client</button>
        </GuideElement>
      </StatewaveGuideProvider>,
    );

    // Nothing has reported as intersecting yet.
    await waitFor(() => {
      expect(runtime.actions.has('highlight')).toBe(true);
    });
    expect(runtime.getContext().visibleElements ?? []).toEqual([]);
  });
  it('re-syncs visibleElements after the host replaces the context wholesale', async () => {
    const runtime = createGuideRuntime();
    render(
      <StatewaveGuideProvider runtime={runtime}>
        <GuideElement id="clients.create" type="button">
          <button type="button">New Client</button>
        </GuideElement>
      </StatewaveGuideProvider>,
    );

    await waitFor(() => {
      expect(runtime.actions.has('highlight')).toBe(true);
    });
    intersectionObservers.at(-1)?.trigger(true);
    await waitFor(() => {
      expect(runtime.getContext().visibleElements).toEqual(['clients.create']);
    });

    // `setContext` replaces everything, visibleElements included. The prop
    // promises the two stay in sync, so the provider has to notice.
    runtime.setContext({ route: '/clients' });

    await waitFor(() => {
      expect(runtime.getContext().visibleElements).toEqual(['clients.create']);
    });
    expect(runtime.getContext().route).toBe('/clients');
  });
});
