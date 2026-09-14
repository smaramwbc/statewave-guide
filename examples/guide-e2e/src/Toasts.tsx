/**
 * The notification layer a real application has, added where a host adds one.
 *
 * Every mutating action in the benchmark application used to succeed in
 * silence: a client was created and the list simply changed. Real software says
 * so, and it says so with a transient thing that appears over the top of
 * whatever is on screen — which makes it the most interesting surface in the
 * demo for anything that draws on a page.
 *
 * **It lives here rather than in the fixture, and that is not a detail.** The
 * fixture under `packages/indexer/test/fixtures` is frozen evidence: the
 * ProductModel was compiled from it and the runtime evidence artefact hashes
 * the tree it renders. An earlier attempt put the toasts inside `App` and broke
 * `emit-evidence` on exactly that hash — correctly, because the application had
 * changed. So the notifications are driven from the seam the host already owns:
 * the network adapter every request passes through. A toast on a successful
 * `POST /api/clients` is what a real front end does anyway.
 *
 * Nothing here carries a `data-guide`. A toast is not a control anybody can be
 * guided to, it is gone in four seconds, and an identifier on it would invite
 * pointing at something that will not be there by the time the pointer arrives.
 */
import { useEffect, useState } from 'react';

/** How a toast reads. */
export type ToastTone = 'success' | 'error' | 'info';

/** One message on screen. */
export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/**
 * Raises a toast from anywhere, including outside React.
 *
 * The network seam is a plain function called by an axios adapter, so it has no
 * hook to reach a context with. A module-level emitter is what a host actually
 * writes for this, and the alternative — threading a setter through the
 * adapter — would put React's lifecycle in the middle of a network call.
 */
export function notify(input: Omit<Toast, 'id'>): void {
  const toast: Toast = { ...input, id: nextId };
  nextId += 1;
  for (const listener of [...listeners]) listener(toast);
}

/** JSON, or nothing. A body this cannot read simply has no detail to show. */
function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** How long a toast stays before it takes itself away. */
const TOAST_MS = 4200;

/** Renders the live toasts. Mount once, beside the application. */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (toast) => {
      setToasts((current) => [...current, toast]);
      window.setTimeout(
        () => setToasts((current) => current.filter((entry) => entry.id !== toast.id)),
        TOAST_MS,
      );
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    /*
      Bottom left, and not by accident. The guide docks to the right, and a
      stack of notifications sliding in underneath it would be a demo arranged
      to avoid the interesting case rather than one that renders where a real
      application renders.
    */
    <div className="toasts" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-tone={toast.tone} role="status">
          <span className="toast__mark" aria-hidden="true">
            {toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}
          </span>
          <div className="toast__body">
            <p className="toast__title">{toast.title}</p>
            {toast.detail !== undefined ? <p className="toast__detail">{toast.detail}</p> : null}
          </div>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => setToasts((current) => current.filter((e) => e.id !== toast.id))}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * What a request means, said in the words a user would use.
 *
 * Keyed on method and path because that is what the seam carries. Anything not
 * listed raises nothing: a notification for every GET would be noise, and
 * inventing a sentence for an endpoint this table has never heard of is exactly
 * the habit the rest of this repository exists to break.
 */
export function announceRequest(method: string, path: string, body: unknown, ok: boolean): void {
  // The seam hands the body through as the application sent it, which for an
  // axios POST is a JSON string rather than an object. Reading `.name` off the
  // string produced a toast with no detail and no error — the quiet kind.
  const parsed: unknown = typeof body === 'string' ? safeParse(body) : body;
  const named = (parsed as { name?: string } | undefined)?.name;
  const clientPath = /\/api\/clients\/[^/]+$/.test(path);

  if (method === 'POST' && path.endsWith('/api/clients')) {
    notify(
      ok
        ? {
            tone: 'success',
            title: 'Client created',
            ...(named === undefined ? {} : { detail: named }),
          }
        : { tone: 'error', title: 'Could not create the client' },
    );
    return;
  }
  if (method === 'DELETE' && clientPath) {
    notify(
      ok
        ? { tone: 'success', title: 'Client deleted' }
        : { tone: 'error', title: 'Could not delete the client' },
    );
    return;
  }
  if ((method === 'PATCH' || method === 'PUT') && clientPath) {
    notify(
      ok
        ? {
            tone: 'success',
            title: 'Client updated',
            ...(named === undefined ? {} : { detail: named }),
          }
        : { tone: 'error', title: 'Could not update the client' },
    );
    return;
  }
  if (method === 'PUT' && path.endsWith('/api/settings')) {
    notify(
      ok
        ? { tone: 'success', title: 'Settings saved' }
        : { tone: 'error', title: 'Could not save settings' },
    );
    return;
  }
  if (method === 'POST' && path.includes('/api/settings/')) {
    notify({
      tone: 'info',
      title: 'API key rotated',
      detail: 'The previous key stopped working immediately.',
    });
    return;
  }
  if (method === 'POST' && path.endsWith('/api/invoices')) {
    notify(
      ok
        ? { tone: 'success', title: 'Invoice raised' }
        : { tone: 'error', title: 'Could not raise the invoice' },
    );
  }
}
