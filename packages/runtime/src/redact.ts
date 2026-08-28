/**
 * What a runtime observer is allowed to remember.
 *
 * The static half of this system reads source, and source is already in the
 * repository. Runtime observation is different in kind: it watches a real
 * interface with real values in it, and the value a user types into a field is
 * theirs rather than the application's. An evidence record that quietly
 * accumulated passwords would be a liability no amount of downstream care
 * repairs.
 *
 * So values are recorded as **shape, never content**. `<redacted:string:12>`
 * says a twelve-character string was present, which is everything a capability
 * rule ever needs — a filter is proved by the collection changing, not by what
 * was typed — and nothing a leak could use.
 *
 * The name list below is a floor, not a ceiling. Anything matching it is
 * redacted regardless of context, and everything else is redacted anyway; the
 * list exists so a *known* secret is never recorded even as a shape, because a
 * length is a fact about a password too.
 *
 * @packageDocumentation
 */

/** Field names whose very shape is worth withholding. */
const SENSITIVE = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api-key',
  'api_key',
  'authorization',
  'auth',
  'cookie',
  'session',
  'sessionid',
  'credential',
  'private',
  'ssn',
  'card',
  'cvv',
  'pin',
];

/** True when a name is one this module refuses to characterise at all. */
export function isSensitiveName(name: string): boolean {
  const normalised = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE.some((entry) => normalised.includes(entry.replace(/[^a-z0-9]/g, '')));
}

/** What a value was, without being what it was. */
export type RedactedValue =
  | { kind: 'empty' }
  | { kind: 'redacted'; type: 'string' | 'number' | 'boolean'; length?: number }
  | { kind: 'withheld'; reason: 'sensitive-name' };

/**
 * A value, reduced to the least that could still be evidence.
 *
 * A checkbox's boolean is kept as a boolean because "checked" and "unchecked"
 * are the whole of what it can be and neither is private. Everything else keeps
 * its type and its length and loses its content.
 */
export function redactValue(name: string, value: unknown): RedactedValue {
  if (isSensitiveName(name)) return { kind: 'withheld', reason: 'sensitive-name' };
  if (value === null || value === undefined || value === '') return { kind: 'empty' };
  if (typeof value === 'boolean') return { kind: 'redacted', type: 'boolean' };
  if (typeof value === 'number') return { kind: 'redacted', type: 'number' };
  const text = String(value);
  return { kind: 'redacted', type: 'string', length: text.length };
}

/** How a redacted value prints in a snapshot. */
export function describeRedacted(value: RedactedValue): string {
  if (value.kind === 'empty') return '<empty>';
  if (value.kind === 'withheld') return '<withheld:sensitive-name>';
  return value.length === undefined
    ? `<redacted:${value.type}>`
    : `<redacted:${value.type}:${value.length}>`;
}

/** Header names never recorded, in any form. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

/**
 * Request headers, with the ones that carry identity removed entirely.
 *
 * Not redacted — removed. A recorded `authorization: <redacted:string:186>` is
 * a standing invitation to widen the rule later, and the header's presence is
 * not evidence of anything a capability rule asks about.
 */
export function redactHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(name.toLowerCase())) continue;
    if (isSensitiveName(name)) continue;
    out[name.toLowerCase()] = typeof value === 'string' ? value : String(value);
  }
  return out;
}

/**
 * A request body, as a shape.
 *
 * Keys are kept because "the request carried a `plan` field" is a fact about the
 * application; values are not, because "the plan was enterprise" is a fact about
 * a customer.
 */
export function redactBody(body: unknown): Record<string, string> | undefined {
  if (body === null || body === undefined) return undefined;
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return { '<body>': describeRedacted(redactValue('body', body)) };
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { '<body>': describeRedacted(redactValue('body', parsed)) };
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    out[key] = describeRedacted(redactValue(key, value));
  }
  return out;
}
