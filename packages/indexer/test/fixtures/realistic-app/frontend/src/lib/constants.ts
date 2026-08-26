/**
 * Shared literals.
 *
 * Paths live here so that a rename is one edit. They are plain module-scope
 * string constants, which is the shape the `module-constant-string` rule can
 * follow — but note that reaching them from a service costs an import hop
 * first.
 */

/** Collection path for invoices, relative to the API base URL. */
export const INVOICES_PATH = '/invoices';

/** Singleton settings resource, relative to the API base URL. */
export const SETTINGS_PATH = '/settings';

/** How many rows a table asks for by default. */
export const DEFAULT_PAGE_SIZE = 25;

/** How long the search box waits before re-querying, in milliseconds. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Prose shown in the developer console when `?debug` is set.
 *
 * A trap: it names two real endpoints, but it is documentation, not a call.
 * Nothing here should reach the graph as an `api:` node.
 */
export const API_DOCS_HINT = 'POST /clients creates one; GET /clients lists them';

/**
 * Key an unsaved client draft is parked under in session storage.
 *
 * A trap: it looks like `/clients` with a prefix, and it is not a URL at all.
 */
export const DRAFT_STORAGE_KEY = 'draft:/clients';

/** Marketing site, not a route in this application. */
export const HELP_URL = 'https://docs.example.com/clients';

/**
 * The product tour, in order.
 *
 * A trap, and the sharpest one in the fixture: every entry is a string that
 * exactly equals a real `data-guide` value, in a module the indexer definitely
 * reads. `data-guide` is the product's join key, so an extractor that scans for
 * id-shaped strings rather than for guide *attributes* invents elements here
 * and attributes them to `lib/constants.ts`.
 */
export const TOUR_STEPS = ['clients.create', 'clients.table.row', 'settings.save'];
