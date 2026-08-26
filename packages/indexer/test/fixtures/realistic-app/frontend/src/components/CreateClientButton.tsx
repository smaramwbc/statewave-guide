/**
 * A trap, and a realistic one: a component named after the `POST /clients`
 * endpoint that neither calls a service nor renders a button. It exists because
 * somebody started a refactor and stopped, which is exactly how dead components
 * end up in real repositories.
 */

/** Props of {@link CreateClientButton}. */
export interface CreateClientButtonProps {
  label?: string;
}

/**
 * Renders a hint.
 *
 * There *is* a call expression here, so "no `calls` edge from this component"
 * is a claim with something to refute: the callee is a local text helper, and
 * an extractor that resolves callees by the component's *name* rather than by
 * the identifier in front of the parentheses reaches `clientService.create`.
 */
export function CreateClientButton({ label = 'Create client' }: CreateClientButtonProps) {
  return <span className="hint hint--muted">{hintFor(label)}</span>;
}

/** The muted hint text. The only callee in this module. */
function hintFor(label: string): string {
  return `${label} — coming back soon`;
}
