import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useRef, type ReactElement, type ReactNode } from 'react';
import { useGuideContext } from '../src/use-guide-context.js';
import { GuideElement } from '../src/guide-element.js';
import { StatewaveGuideProvider } from '../src/provider.js';
import { useGuide } from '../src/use-guide.js';

function RegisteredIds(): ReactNode {
  const { elements } = useGuide();
  return (
    <div data-testid="ids">
      {elements.map((element) => `${element.id}/${element.type}/${element.label ?? '-'}`).join('|')}
    </div>
  );
}

describe('<GuideElement>', () => {
  it('registers its child and marks it with data-guide', async () => {
    render(
      <StatewaveGuideProvider>
        <GuideElement id="clients.create" type="button" label="New Client">
          <button type="button">New Client</button>
        </GuideElement>
        <RegisteredIds />
      </StatewaveGuideProvider>,
    );

    const button = screen.getByRole('button', { name: 'New Client' });
    expect(button.getAttribute('data-guide')).toBe('clients.create');

    await waitFor(() => {
      expect(screen.getByTestId('ids').textContent).toBe('clients.create/button/New Client');
    });
  });

  it('still calls a ref the child already had', async () => {
    const seen = vi.fn();

    function Host(): ReactNode {
      const ref = useRef<HTMLButtonElement | null>(null);
      return (
        <StatewaveGuideProvider>
          <GuideElement id="clients.create" type="button">
            <button
              type="button"
              ref={(node) => {
                ref.current = node;
                seen(node?.tagName ?? null);
              }}
            >
              New Client
            </button>
          </GuideElement>
        </StatewaveGuideProvider>
      );
    }

    render(<Host />);

    await waitFor(() => {
      expect(seen).toHaveBeenCalledWith('BUTTON');
    });
    expect(screen.getByRole('button').getAttribute('data-guide')).toBe('clients.create');
  });

  it('populates an object ref the child already had', () => {
    let captured: HTMLButtonElement | null = null;

    function Host(): ReactNode {
      const ref = useRef<HTMLButtonElement | null>(null);
      captured = ref.current;
      return (
        <StatewaveGuideProvider>
          <GuideElement id="clients.create" type="button">
            <button type="button" ref={ref}>
              New Client
            </button>
          </GuideElement>
        </StatewaveGuideProvider>
      );
    }

    const { rerender } = render(<Host />);
    rerender(<Host />);
    expect(captured).toBe(screen.getByRole('button'));
  });

  it('refuses more than one child', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Deliberately violating the prop type: this is the runtime guard a
    // JavaScript host would hit.
    const twoChildren = [
      <button key="a" type="button">
        One
      </button>,
      <button key="b" type="button">
        Two
      </button>,
    ] as unknown as ReactElement;

    expect(() =>
      render(
        <StatewaveGuideProvider>
          <GuideElement id="clients.create">{twoChildren}</GuideElement>
        </StatewaveGuideProvider>,
      ),
    ).toThrow(/exactly one child/);
    error.mockRestore();
  });

  it('refuses a Fragment, which can never receive a ref', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <StatewaveGuideProvider>
          <GuideElement id="clients.create">
            <>
              <button type="button">One</button>
            </>
          </GuideElement>
        </StatewaveGuideProvider>,
      ),
    ).toThrow(/Fragment/);
    error.mockRestore();
  });
  it("runs a React 19 child ref's cleanup instead of calling it with null", () => {
    const calls: string[] = [];

    const { unmount } = render(
      <StatewaveGuideProvider>
        <GuideElement id="clients.create" type="button">
          <button
            type="button"
            ref={(node) => {
              calls.push(node === null ? 'null' : 'node');
              return () => {
                calls.push('cleanup');
              };
            }}
          >
            New Client
          </button>
        </GuideElement>
      </StatewaveGuideProvider>,
    );

    unmount();

    // React 19 guarantees a cleanup-returning ref is never called with `null`.
    // `cloneElement` replaces the child's ref with ours, so React cannot keep
    // that promise on the child's behalf — <GuideElement> has to.
    expect(calls).toEqual(['node', 'cleanup']);
  });

  it('does not loop when the child has an inline ref and something reads the context', () => {
    // An IntersectionObserver that reports "visible" the moment it observes,
    // which is what a real browser does and what jsdom never does. Without it
    // the registry never reports a visible element and the provider never
    // writes the context, so the loop this guards against cannot appear.
    const original = globalThis.IntersectionObserver;
    class EagerObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element): void {
        this.callback(
          [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    globalThis.IntersectionObserver = EagerObserver as unknown as typeof IntersectionObserver;

    let renders = 0;
    function Item(): ReactNode {
      // Reading the context is what closes the circuit: unregister ->
      // visibleIds() shrinks -> patchContext -> this component re-renders ->
      // a brand-new inline child ref -> re-register -> ...
      useGuideContext();
      renders += 1;
      return (
        <GuideElement id="clients.create" type="button">
          <button type="button" ref={() => undefined}>
            New Client
          </button>
        </GuideElement>
      );
    }

    try {
      render(
        <StatewaveGuideProvider>
          <Item />
        </StatewaveGuideProvider>,
      );
    } finally {
      globalThis.IntersectionObserver = original;
    }

    expect(renders).toBeLessThan(10);
    expect(screen.getByRole('button').getAttribute('data-guide')).toBe('clients.create');
  });
});
