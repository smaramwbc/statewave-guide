/**
 * Sensitive source exclusion and secret redaction.
 *
 * Everything an evidence pack carries is on its way to a third-party model, so
 * this module is the last gate before repository text leaves the machine. It is
 * a **default-deny policy that does not consult `.gitignore`**: an ignore file
 * describes what a developer did not want to commit, which is a different
 * question from what is safe to send to a vendor, and a project that has never
 * needed a `.gitignore` entry for `secrets/` would otherwise get no protection
 * at all.
 *
 * Two independent defences, because either one alone fails open:
 *
 * 1. {@link isSensitivePath} drops whole nodes whose provenance points at a file
 *    that should never be read. Nothing from that file reaches a prompt — not an
 *    excerpt, not a symbol name, not a line number.
 * 2. {@link redactSecrets} scrubs the excerpts that survive, because a
 *    credential pasted into an ordinary source file is the common case and no
 *    path rule can catch it.
 *
 * Both prefer false positives to leaks, and that trade-off is deliberate: a
 * redacted excerpt costs the model a little context and produces a slightly
 * worse sentence, while a leaked key costs a customer their production
 * database. When the two are in tension this module always chooses the worse
 * sentence.
 *
 * @packageDocumentation
 */

/** The token every redaction leaves behind. */
export const REDACTION_PLACEHOLDER = '[redacted]';

/**
 * Paths that never reach a model, by default.
 *
 * Glob syntax is a small, deliberate subset: `*` matches within one path
 * segment, `?` matches one character, `**` matches across segments. Patterns
 * are matched case-insensitively against the whole project-relative path *and
 * against every suffix of it that starts at a segment boundary*, so
 * `secrets/**` catches `packages/api/secrets/keys.ts` and `*.pem` catches a
 * `.pem` anywhere in the tree.
 *
 * The list mixes two concerns on purpose. Most entries are credential-bearing.
 * A few — `node_modules/**`, `dist/**`, `coverage/**` — are derived output: not
 * secret, but not *product truth* either, and a feature explained from a
 * bundled vendor file would be explained from code the team never wrote.
 */
export const DEFAULT_SENSITIVE_PATTERNS: readonly string[] = [
  // --- Environment and configuration secrets -------------------------------
  '.env',
  '.env.*',
  '*.env',
  '.npmrc',
  '.yarnrc',
  '.netrc',
  '_netrc',
  '.pgpass',
  '.htpasswd',
  '.dockercfg',
  '.docker/config.json',
  // --- Keys, certificates and key stores -----------------------------------
  '*.pem',
  '*.key',
  '*.p8',
  '*.p12',
  '*.pfx',
  '*.pkcs12',
  '*.jks',
  '*.keystore',
  '*.asc',
  '*.gpg',
  '*.ppk',
  'id_rsa',
  'id_rsa*',
  'id_dsa*',
  'id_ecdsa*',
  'id_ed25519*',
  // --- Credential directories and files ------------------------------------
  'credentials*',
  'secrets/**',
  'secret/**',
  '.ssh/**',
  '.aws/**',
  '.gnupg/**',
  '.config/gcloud/**',
  '*service-account*.json',
  '*serviceaccount*.json',
  // --- Infrastructure state, which routinely embeds plaintext secrets ------
  '*.tfstate',
  '*.tfstate.*',
  'terraform.tfvars',
  'terraform.tfvars.*',
  '*.kubeconfig',
  'kubeconfig',
  // --- Logs and dumps, which routinely embed tokens ------------------------
  '*.log',
  '*.sql',
  '*.dump',
  // --- Derived output, which is not the team's own source ------------------
  'node_modules/**',
  'dist/**',
  'build/**',
  'out/**',
  'coverage/**',
  '.next/**',
  '.turbo/**',
  '.git/**',
];

/** Escapes a literal character for inclusion in a regular expression. */
function escapeRegExpChar(char: string): string {
  return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/** Compiles one glob pattern into an anchored, case-insensitive expression. */
function compileGlob(pattern: string): RegExp {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern.charAt(index);
    if (char === '*') {
      if (pattern.charAt(index + 1) === '*') {
        index += 2;
        if (pattern.charAt(index) === '/') {
          // `**/` also matches zero directories, so `**/x.pem` matches `x.pem`.
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
        index += 1;
      }
    } else if (char === '?') {
      source += '[^/]';
      index += 1;
    } else {
      source += escapeRegExpChar(char);
      index += 1;
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

/** Compiled patterns, cached so repeated pack builds do not recompile. */
const globCache = new Map<string, RegExp>();

function globFor(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  const compiled = compileGlob(pattern);
  globCache.set(pattern, compiled);
  return compiled;
}

/** Project-relative POSIX form: no drive separators, no `./`, no leading slash. */
function normalisePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '');
}

/** The whole path, then every suffix that begins at a segment boundary. */
function pathSuffixes(path: string): string[] {
  const segments = path.split('/');
  const suffixes: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    suffixes.push(segments.slice(index).join('/'));
  }
  return suffixes;
}

/**
 * Returns `true` when a file must never contribute to an evidence pack.
 *
 * @param path Project-relative path. Windows separators are normalised.
 * @param extra Additional glob patterns, added to — never replacing — the
 * defaults. There is deliberately no way to switch the defaults off: a
 * configuration mistake should cost precision, not a credential.
 */
export function isSensitivePath(path: string, extra?: readonly string[]): boolean {
  const normalised = normalisePath(path);
  if (normalised === '') return false;
  const candidates = pathSuffixes(normalised);
  for (const pattern of extra === undefined
    ? DEFAULT_SENSITIVE_PATTERNS
    : [...DEFAULT_SENSITIVE_PATTERNS, ...extra]) {
    const expression = globFor(pattern);
    for (const candidate of candidates) {
      if (expression.test(candidate)) return true;
    }
  }
  return false;
}

/**
 * High-signal secret shapes.
 *
 * Ordered from most specific to most general so a token that matches two rules
 * is replaced by the narrower one first. Every expression is global and
 * stateless at call time — {@link redactSecrets} resets `lastIndex` by using
 * `String.replace`, which does not carry state between calls.
 *
 * The last two rules — long hex and long base64 runs — are the blunt ones, and
 * they will occasionally redact a hash, a minified string or a very long
 * identifier. That is the intended trade. A false positive produces a slightly
 * poorer sentence; a false negative produces a leaked credential in a vendor's
 * request log.
 *
 * The two rules that need a *judgement* rather than a shape — an auth scheme
 * followed by a word, and a secret-shaped name followed by a value — decide per
 * match instead of firing on every match. Both of them used to fire on ordinary
 * code and ordinary English, and because this same function runs over generated
 * prose in `verifier.ts`, a false positive there did not cost a sentence: it
 * published a feature called "Basic" and rewrote `===` as `=[redacted]`. The
 * blunt trade above is worth making for a random-looking string; it is not worth
 * making for the word "authentication".
 */
/**
 * Whether the thing after an auth scheme is plausibly a credential.
 *
 * `Bearer`, `Basic`, `Token` and `ApiKey` are all ordinary English words, and
 * "Basic authentication is required", "Token expiration is handled by the
 * refresh hook" and `aria-label="Basic information"` are all sentences a
 * repository contains. Matching "scheme followed by eight word characters"
 * redacts every one of them, and because the same function runs over generated
 * prose it also publishes a feature titled "Basic" — a corruption, not a
 * precaution.
 *
 * A credential is not an English word: it carries a digit, a base64 or URL
 * character, or enough length that no word explains it. A purely alphabetic
 * secret shorter than twenty characters gets through, and that is the residual
 * cost, stated rather than hidden.
 */
function credentialShaped(token: string): boolean {
  return /\d/.test(token) || /[._~+/=]/.test(token) || token.length >= 20;
}

/**
 * Whether an unquoted right-hand side is a value rather than a type or a call.
 *
 * `token: string`, `type Credentials = { … }`, `const apiKeyRef = useRef(…)` and
 * `export const secretSauce = computeLayout(rows)` are all matches for a
 * "secret-shaped name, then a separator" pattern, and none of them contains a
 * secret. A real unquoted credential is a random string or an environment
 * reference, so it carries a digit, a path or base64 character, or length.
 *
 * A quoted right-hand side is not put through this at all: `password = "…"` is
 * the shape this rule exists for, whatever is inside the quotes.
 */
function valueShaped(value: string): boolean {
  return /\d/.test(value) || /[./+=\\]/.test(value) || value.length >= 16;
}

/** One rule. A function replacement decides per match; a string always fires. */
interface RedactionRule {
  readonly pattern: RegExp;
  readonly replacement: string | ((...groups: string[]) => string);
}

const REDACTIONS: readonly RedactionRule[] = [
  // A whole private-key block, header to footer.
  {
    pattern: /-----BEGIN[A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: REDACTION_PLACEHOLDER,
  },
  // A truncated block: an excerpt is one line, so the footer is usually absent.
  { pattern: /-----BEGIN[A-Z0-9 ]*PRIVATE KEY-----/g, replacement: REDACTION_PLACEHOLDER },
  // A JSON web token: three base64url segments.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/g,
    replacement: REDACTION_PLACEHOLDER,
  },
  // Authorization headers of every common scheme, when what follows one could
  // not be a word. See {@link credentialShaped}.
  {
    pattern: /\b(Bearer|Basic|Token|ApiKey)\s+([A-Za-z0-9._~+/=-]{8,})/gi,
    replacement: (match: string, scheme: string, token: string): string =>
      credentialShaped(token) ? `${scheme} ${REDACTION_PLACEHOLDER}` : match,
  },
  // Vendor-neutral key prefixes that are unambiguous by construction.
  { pattern: /\bsk-[A-Za-z0-9_-]{10,}/gi, replacement: REDACTION_PLACEHOLDER },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}/g, replacement: REDACTION_PLACEHOLDER },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, replacement: REDACTION_PLACEHOLDER },
  { pattern: /\bglpat-[A-Za-z0-9_-]{16,}/g, replacement: REDACTION_PLACEHOLDER },
  { pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/gi, replacement: REDACTION_PLACEHOLDER },
  { pattern: /\bnpm_[A-Za-z0-9]{30,}/g, replacement: REDACTION_PLACEHOLDER },
  {
    pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{12,}/g,
    replacement: REDACTION_PLACEHOLDER,
  },
  { pattern: /\bAIza[0-9A-Za-z_-]{20,}/g, replacement: REDACTION_PLACEHOLDER },
  // `password = "…"`, `apiKey: '…'`, `AWS_SECRET_ACCESS_KEY=…`, and relatives.
  //
  // The separator is a colon or a *single* `=`: `user.password === input.password`
  // is a comparison, and matching its first `=` used to leave `password =[redacted]`
  // behind — a redaction that changed what the code does when a reader copied it.
  // An unquoted right-hand side then has to look like a value; see
  // {@link valueShaped}.
  {
    pattern:
      /((?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|credential)[a-z0-9_-]*)(\s*(?::|=(?![=>]))\s*)(\[redacted\]|"[^"\n]*"|'[^'\n]*'|`[^`\n]*`|[^\s,;:)\]}{[(<>'"`]+)/gi,
    replacement: (match: string, name: string, separator: string, value: string): string => {
      const quoted = /^["'`]/.test(value) || value === REDACTION_PLACEHOLDER;
      if (!quoted && !valueShaped(value)) return match;
      return `${name}${separator}${REDACTION_PLACEHOLDER}`;
    },
  },
  // A long hexadecimal run: a raw key, a signature, or something like one.
  { pattern: /\b[0-9a-f]{32,}\b/gi, replacement: REDACTION_PLACEHOLDER },
  // A long base64 run.
  { pattern: /\b[A-Za-z0-9+/]{40,}={0,2}/g, replacement: REDACTION_PLACEHOLDER },
];

/**
 * Replaces anything that looks like a credential with
 * {@link REDACTION_PLACEHOLDER}.
 *
 * Idempotent: the placeholder matches none of the rules, so redacting twice
 * produces the same string as redacting once. That matters because the pack
 * redacts on the way in and the prompt renderer redacts again on the way out,
 * and a non-idempotent scrubber would make the two disagree.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACTIONS) {
    result =
      typeof replacement === 'string'
        ? result.replace(pattern, replacement)
        : result.replace(pattern, replacement);
  }
  return result;
}
