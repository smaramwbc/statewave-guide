/**
 * Path helpers that keep the graph machine-independent.
 *
 * Every path that reaches the graph goes through here first. Three things break
 * byte-for-byte reproducibility and none of them is allowed past this module:
 * absolute paths, Windows separators, and — less obviously — the Unicode
 * normalisation the filesystem chose. macOS hands back `café` decomposed while
 * git stores it composed, so the same checkout on two machines would otherwise
 * produce different `file:` ids, different `component:` ids and a different sort
 * order. Composing here makes the id a property of the name rather than of the
 * filesystem that spelled it.
 *
 * @packageDocumentation
 */

import path from 'node:path';

/**
 * Converts this platform's separators to POSIX `/` and composes the name.
 *
 * Only `path.sep` is rewritten. A backslash is a separator on Windows — where
 * it is `path.sep`, so the split already covers it — and an ordinary, legal
 * character in a POSIX file name, where rewriting it would turn one file into a
 * path that names a directory nobody has.
 *
 * NFC is chosen because it is what git stores and what every other tool in the
 * chain will already be holding.
 */
export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/').normalize('NFC');
}

/**
 * Project-relative POSIX path of `absolute`, e.g. `src/pages/Clients.tsx`.
 *
 * Paths outside `root` keep their `../` prefix rather than being rewritten, so
 * a misconfigured `include` is visible in the output instead of silently
 * producing a plausible-looking but wrong path.
 */
export function toRelativePosix(root: string, absolute: string): string {
  return toPosixPath(path.relative(root, absolute));
}

/**
 * Renders a configured path for a diagnostic without leaking the machine.
 *
 * A config may name a tsconfig or a glob by absolute path. Echoing it back
 * would put `/Users/someone/…` in `application.json`, which is exactly the kind
 * of value that makes one machine's graph differ from another's. Inside the
 * project it becomes a project-relative path; outside it, only the last segment
 * survives, which is enough to recognise what was meant and carries nothing
 * about where the command ran.
 */
export function describeConfiguredPath(root: string, configured: string): string {
  if (!path.isAbsolute(configured)) return toPosixPath(configured);
  const relative = toRelativePosix(root, configured);
  return relative === '' || relative.startsWith('..')
    ? toPosixPath(path.basename(configured))
    : relative;
}

/**
 * Renders a configured glob for a diagnostic without leaking the machine.
 *
 * A pattern is not a path, so the basename of one is usually just `*.ts` — no
 * help to anybody. A pattern that points outside the project is therefore named
 * by its position in the config rather than by its text, which says everything
 * the reader needs in order to find it and nothing about this machine.
 */
export function describeConfiguredPattern(root: string, pattern: string): string {
  if (!path.isAbsolute(pattern)) return toPosixPath(pattern);
  const relative = toRelativePosix(root, pattern);
  return relative === '' || relative.startsWith('..') ? '<outside the project>' : relative;
}
