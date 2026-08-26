/**
 * A test file, and therefore invisible to the indexer under the default
 * `exclude` globs. It declares a *second* `ClientForm` and reuses the real
 * form's semantic ids — if either reaches the graph, the excludes are not being
 * applied and every element id in the application is now ambiguous.
 */
import { render, screen } from '@testing-library/react';
import { ClientForm as RealClientForm } from '../ClientForm';

/** A stub with the same name as the real component. */
function ClientForm() {
  return (
    <form data-guide="clients.create-dialog.form">
      <input data-guide="clients.create-dialog.name" />
      <button type="submit" data-guide="clients.create-dialog.submit">
        Create client
      </button>
    </form>
  );
}

describe('ClientForm', () => {
  it('renders the stub', () => {
    render(<ClientForm />);
    expect(screen.getByText('Create client')).toBeTruthy();
  });

  it('renders the real component', () => {
    render(<RealClientForm onCreated={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByText('Create client')).toBeTruthy();
  });
});

declare function describe(name: string, body: () => void): void;
declare function it(name: string, body: () => void): void;
declare function expect(value: unknown): { toBeTruthy(): void };
