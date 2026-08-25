import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { StatewaveGuideProvider } from '../src/provider.js';
import { useGuideElement } from '../src/use-guide-element.js';
import { useGuide } from '../src/use-guide.js';

/** Renders the registry as text, so a test can assert on it without mocks. */
function RegisteredIds(): ReactNode {
  const { elements } = useGuide();
  const text = elements.map((element) => `${element.id}:${element.description ?? '-'}`).join('|');
  return <div data-testid="ids">{text}</div>;
}

function ids(): string {
  return screen.getByTestId('ids').textContent ?? '';
}

function CreateButton({ description }: { description?: string }): ReactNode {
  const ref = useGuideElement<HTMLButtonElement>({
    id: 'clients.create',
    type: 'button',
    label: 'New Client',
    description,
  });
  return (
    <button ref={ref} type="button">
      New Client
    </button>
  );
}

function Harness({ show, description }: { show: boolean; description?: string }): ReactNode {
  return (
    <StatewaveGuideProvider>
      {show ? <CreateButton description={description} /> : null}
      <RegisteredIds />
    </StatewaveGuideProvider>
  );
}

describe('useGuideElement', () => {
  it('registers on mount and shows up in useGuide().elements', async () => {
    render(<Harness show />);
    await waitFor(() => {
      expect(ids()).toBe('clients.create:-');
    });
  });

  it('stamps data-guide onto the real node', () => {
    render(<Harness show />);
    expect(screen.getByRole('button').getAttribute('data-guide')).toBe('clients.create');
  });

  it('unmounting removes the registration', async () => {
    const { rerender } = render(<Harness show />);
    await waitFor(() => {
      expect(ids()).toBe('clients.create:-');
    });

    rerender(<Harness show={false} />);
    await waitFor(() => {
      expect(ids()).toBe('');
    });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('updates rather than duplicates when metadata changes', async () => {
    const { rerender } = render(<Harness show description="Creates a client" />);
    await waitFor(() => {
      expect(ids()).toBe('clients.create:Creates a client');
    });

    rerender(<Harness show description="Starts the new-client form" />);
    await waitFor(() => {
      expect(ids()).toBe('clients.create:Starts the new-client form');
    });
    // One registration, not two: `update()` rather than a re-register.
    expect(ids().split('|')).toHaveLength(1);
  });

  it('leaves an existing, different data-guide attribute alone and warns', async () => {
    const onWarning = vi.fn();

    function Conflicting(): ReactNode {
      const ref = useGuideElement<HTMLButtonElement>({ id: 'clients.create' });
      return <button ref={ref} type="button" data-guide="clients.other" />;
    }

    render(
      <StatewaveGuideProvider onWarning={onWarning}>
        <Conflicting />
      </StatewaveGuideProvider>,
    );

    expect(screen.getByRole('button').getAttribute('data-guide')).toBe('clients.other');
    await waitFor(() => {
      expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('clients.other'));
    });
  });

  it('survives a React StrictMode double-mount', async () => {
    render(
      <StrictMode>
        <Harness show />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(ids()).toBe('clients.create:-');
    });
  });
  it('clears metadata that the component no longer supplies', async () => {
    const { rerender } = render(<Harness show description="Creates a client" />);
    await waitFor(() => {
      expect(ids()).toBe('clients.create:Creates a client');
    });

    rerender(<Harness show />);

    // `update()` ignores undefined fields by contract, so a description that
    // went away has to be cleared some other way — or the model keeps being
    // told about a description the component does not have any more.
    await waitFor(() => {
      expect(ids()).toBe('clients.create:-');
    });
    expect(ids().split('|')).toHaveLength(1);
  });

  it('moves data-guide with the id, and does not blame the developer for it', async () => {
    const onWarning = vi.fn();

    function Item({ id }: { id: string }): ReactNode {
      const ref = useGuideElement<HTMLButtonElement>({ id });
      return <button ref={ref} type="button" data-testid="item" />;
    }

    function App({ id }: { id: string }): ReactNode {
      return (
        <StatewaveGuideProvider onWarning={onWarning}>
          <Item id={id} />
          <RegisteredIds />
        </StatewaveGuideProvider>
      );
    }

    const { rerender } = render(<App id="clients.create" />);
    expect(screen.getByTestId('item').getAttribute('data-guide')).toBe('clients.create');

    rerender(<App id="clients.export" />);

    // The old id must not stay addressable through the registry's DOM fallback:
    // it is registered to nothing, and would highlight the wrong element.
    await waitFor(() => {
      expect(screen.getByTestId('item').getAttribute('data-guide')).toBe('clients.export');
    });
    await waitFor(() => {
      expect(ids()).toBe('clients.export:-');
    });
    expect(onWarning).not.toHaveBeenCalled();
  });

  it('keeps the live registration when an overlapping mount of the same id goes away', async () => {
    function Item({ label }: { label: string }): ReactNode {
      const ref = useGuideElement<HTMLButtonElement>({ id: 'clients.create', label });
      return (
        <button ref={ref} type="button">
          {label}
        </button>
      );
    }

    function Mounted(): ReactNode {
      const { elements } = useGuide();
      return (
        <div data-testid="mounted">
          {elements.map((element) => `${element.id}:${element.label}:${element.mounted}`).join('|')}
        </div>
      );
    }

    function App({ show }: { show: 'first' | 'both' | 'second' }): ReactNode {
      return (
        <StatewaveGuideProvider>
          {show !== 'second' ? <Item key="first" label="first" /> : null}
          {show !== 'first' ? <Item key="second" label="second" /> : null}
          <Mounted />
        </StatewaveGuideProvider>
      );
    }

    const { rerender } = render(<App show="first" />);
    rerender(<App show="both" />);
    // The first one now unmounts. Its ref detaches *after* the second one
    // registered, and must not take the second one's node with it.
    rerender(<App show="second" />);

    await waitFor(() => {
      expect(screen.getByTestId('mounted').textContent).toBe('clients.create:second:true');
    });
    expect(screen.getByRole('button').getAttribute('data-guide')).toBe('clients.create');
  });
});
