/**
 * Path helpers that keep the graph machine-independent.
 *
 * Every path that reaches the graph goes through here first. Absolute paths and
 * Windows separators are the two easiest ways to break byte-for-byte
 * reproducibility, so neither is allowed past this module.
 *
 * @packageDocumentation
 */

import path from 'node:path';

/** Converts any platform's separators to POSIX `/`. */
export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/').split('\\').join('/');
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
 * Characters that a glob matcher reads as syntax rather than as a file name.
 *
 * `!`, `+` and `@` are absent on purpose: they only mean anything immediately
 * before a `(`, and quoting the `(` already defuses them. Quoting a lone `!`
 * would turn it into the negated bracket expression `[!]`, which matches
 * nothing at all.
 */
const GLOB_METACHARACTERS = /[()[\]{}*?|]/g;

/**
 * Quotes every glob metacharacter in a literal path so that it matches itself.
 *
 * One-character bracket expressions are used rather than backslashes because
 * ts-morph rewrites every backslash in a pattern to a forward slash before
 * matching, on the assumption that a backslash is a Windows separator — so a
 * backslash-escaped pattern would reach the matcher as a corrupted path. `[(]`
 * survives that rewrite and means exactly "a literal `(`".
 */
export function escapeGlobLiteral(value: string): string {
  return value.replace(GLOB_METACHARACTERS, (character) => `[${character}]`);
}

/**
 * The prefix that anchors the config's patterns to the project being analysed.
 *
 * ts-morph resolves globs against `process.cwd()` and offers no way to say
 * otherwise, so the pattern itself has to carry the journey from there to the
 * project. Two things make that journey easy to get wrong, and both of them
 * silently produce an empty graph rather than an error:
 *
 * 1. A directory is a path, not a pattern. `~/Dropbox (Work)/app` is an
 *    ordinary directory name, but spliced in raw its `(Work)` becomes a match
 *    group, and the pattern then describes a directory nobody has. So the
 *    prefix is quoted, while the pattern the user wrote is left alone.
 * 2. The prefix is expressed relative to the current directory rather than as
 *    an absolute path, because the matcher underneath rewrites an absolute
 *    pattern against a differently-escaped copy of `process.cwd()` — a rewrite
 *    that loses every file whenever the directory the command was run from
 *    contains a glob character of its own.
 *
 * The result still denotes exactly `root`, so which directory the command was
 * run from changes the pattern but never the file set.
 */
export function globPrefix(root: string, fromDirectory: string): string {
  const relative = toPosixPath(path.relative(fromDirectory, root));
  return relative === '' ? '' : `${escapeGlobLiteral(relative)}/`;
}

/** Joins a config pattern onto a prefix from {@link globPrefix}. */
export function joinGlob(prefix: string, pattern: string): string {
  return `${prefix}${pattern.replace(/^\.\//, '')}`;
}
