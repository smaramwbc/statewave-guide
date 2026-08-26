/**
 * Source-file discovery.
 *
 * The file set is the one input that decides everything else, so it is computed
 * here rather than delegated. ts-morph resolves its globs against
 * `process.cwd()` and offers no way to say otherwise, which made the analysed
 * file set a property of the shell rather than of the project: running the same
 * command from a subdirectory silently dropped files, re-admitted excluded ones,
 * and produced a different `application.json` from an unchanged tree. A prefix
 * spliced onto the pattern cannot fix that — the matcher underneath rewrites the
 * pattern against its own copy of the working directory — and a project path
 * beginning with `!` turned the include pattern into a negation, reporting an
 * empty graph as a healthy one.
 *
 * So the tree is walked directly from the project root and every pattern is
 * matched against a project-relative POSIX path. The working directory is never
 * read, no character of the root's spelling can reach a pattern, and the file set
 * is a function of the project alone.
 *
 * The glob dialect is the familiar one and is matched segment by segment:
 *
 * - `**` — zero or more whole path segments
 * - `*` — any run of characters inside one segment
 * - `?` — exactly one character inside one segment
 * - `{a,b}` — alternation, expanded before matching, nesting included
 * - `[abc]`, `[a-z]`, `[!abc]` — a character class
 *
 * A wildcard does not match a leading `.`, which is what keeps `src/**\/*.ts`
 * out of `.git` and `.statewave-guide` without a hard-coded list of directories
 * to avoid.
 *
 * @packageDocumentation
 */

import { readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { toPosixPath } from './paths.js';

/**
 * Most patterns one brace expression may expand to.
 *
 * `{a,b}{c,d}{e,f}…` multiplies, so an unbounded expansion is a pattern a user
 * can write by accident and wait on for ever. The cap truncates rather than
 * throws: a pattern this large is describing far more than a source tree.
 */
export const MAX_BRACE_EXPANSION = 1024;

/** One file the walk found. */
export interface DiscoveredFile {
  /** Path as the filesystem spells it, for opening the file. */
  absolutePath: string;
  /** Project-relative POSIX path, as every id in the graph is measured from. */
  relativePath: string;
}

/** A compiled pattern: one matcher per segment, `**` kept as a marker. */
interface CompiledPattern {
  /** `null` marks a `**` segment. */
  segments: (RegExp | null)[];
  /** True when the last segment is `**`, so the pattern covers a whole subtree. */
  coversSubtree: boolean;
}

/** Splits a brace body on the commas that are not inside a nested brace. */
function splitAlternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of body) {
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

/**
 * Rewrites `a/{b,c}/d` as `['a/b/d', 'a/c/d']`.
 *
 * Expanding rather than compiling an alternation into the regular expression
 * keeps the "a wildcard does not match a leading dot" rule a property of a whole
 * segment, which is where it is decidable — `{.,x}*` would otherwise need the
 * rule applied to half a segment.
 *
 * An unbalanced brace is left exactly as written: it is far more likely to be a
 * character in a directory name than a pattern someone meant to close.
 */
export function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf('{');
  if (open === -1) return [pattern];

  let depth = 0;
  let close = -1;
  for (let index = open; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (close === -1) return [pattern];

  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const expanded: string[] = [];
  for (const alternative of splitAlternatives(pattern.slice(open + 1, close))) {
    for (const rest of expandBraces(`${head}${alternative}${tail}`)) {
      if (expanded.length >= MAX_BRACE_EXPANSION) return expanded;
      expanded.push(rest);
    }
  }
  return expanded;
}

/** Quotes one character so a regular expression matches it literally. */
function quote(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles one path segment of a pattern to a regular expression.
 *
 * `leadingDot` is decided by the pattern rather than by the name being matched:
 * a segment that opens with a wildcard refuses a name starting with `.`, and a
 * segment that opens with a literal dot accepts one. That is the rule every
 * glob implementation uses, and it is what stops `**` walking into `.git`.
 */
function compileSegment(segment: string): RegExp {
  let source = segment.startsWith('.') ? '' : '(?!\\.)';
  let index = 0;

  while (index < segment.length) {
    const character = segment[index];

    if (character === '*') {
      while (segment[index] === '*') index += 1;
      source += '[^/]*';
      continue;
    }

    if (character === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }

    if (character === '[') {
      const end = segment.indexOf(']', index + 2);
      if (end !== -1) {
        const body = segment.slice(index + 1, end);
        const negated = body.startsWith('!') || body.startsWith('^');
        const members = negated ? body.slice(1) : body;
        source += `[${negated ? '^' : ''}${members.replace(/\\/g, '\\\\')}]`;
        index = end + 1;
        continue;
      }
    }

    source += quote(character ?? '');
    index += 1;
  }

  return new RegExp(`^${source}$`);
}

/** Compiles a brace-free pattern into one matcher per segment. */
function compilePattern(pattern: string): CompiledPattern {
  const segments = pattern
    .replace(/^\.\//, '')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');
  return {
    segments: segments.map((segment) => (segment === '**' ? null : compileSegment(segment))),
    coversSubtree: segments[segments.length - 1] === '**',
  };
}

/**
 * Matches a path's segments against a pattern's.
 *
 * A `**` segment is the only one that can consume more or less than one path
 * segment, so the walk carries a *set* of positions rather than a single one —
 * the standard way to match a pattern with a wildcard that spans separators
 * without backtracking.
 *
 * `partial` answers a different question with the same machinery: not "does this
 * path match?" but "could anything beneath this directory match?". That is what
 * lets the walk skip a subtree no include pattern can reach, which is how
 * `node_modules` stays unread without being named anywhere.
 */
function matchSegments(
  compiled: CompiledPattern,
  segments: readonly string[],
  partial: boolean,
): boolean {
  const { segments: pattern } = compiled;

  /** Every position reachable without consuming a path segment. */
  const close = (positions: Set<number>): Set<number> => {
    const closed = new Set(positions);
    let changed = true;
    while (changed) {
      changed = false;
      for (const position of [...closed]) {
        if (pattern[position] === null && !closed.has(position + 1)) {
          closed.add(position + 1);
          changed = true;
        }
      }
    }
    return closed;
  };

  let positions = close(new Set([0]));
  for (const segment of segments) {
    const next = new Set<number>();
    for (const position of positions) {
      const matcher = pattern[position];
      if (matcher === undefined) continue;
      // `**` consumes this segment and stays where it is, but only over names a
      // wildcard is allowed to see: `**` must not descend into `.git` either.
      if (matcher === null) {
        if (!segment.startsWith('.')) next.add(position);
        continue;
      }
      if (matcher.test(segment)) next.add(position + 1);
    }
    positions = close(next);
    if (positions.size === 0) return false;
  }

  if (!partial) return positions.has(pattern.length);
  for (const position of positions) {
    if (position < pattern.length) return true;
  }
  return false;
}

/** A set of patterns, compiled once and asked many times. */
export interface PatternSet {
  /** True when `relativePath` matches any pattern. */
  matches(relativePath: string): boolean;
  /** True when some pattern could still match something below `directory`. */
  reaches(directory: string): boolean;
  /** True when some pattern excludes everything below `directory`. */
  covers(directory: string): boolean;
}

function toSegments(relativePath: string): string[] {
  return relativePath.split('/').filter((segment) => segment.length > 0);
}

/** Compiles patterns into a reusable matcher. */
export function createPatternSet(patterns: readonly string[]): PatternSet {
  const compiled = patterns.flatMap(expandBraces).map(compilePattern);
  return {
    matches(relativePath) {
      const segments = toSegments(relativePath);
      return compiled.some((pattern) => matchSegments(pattern, segments, false));
    },
    reaches(directory) {
      const segments = toSegments(directory);
      return compiled.some((pattern) => matchSegments(pattern, segments, true));
    },
    covers(directory) {
      const segments = toSegments(directory);
      return compiled.some(
        (pattern) => pattern.coversSubtree && matchSegments(pattern, segments, false),
      );
    },
  };
}

/**
 * Rewrites a pattern so it is measured from the project root.
 *
 * An absolute pattern is accepted when it points inside the project, because a
 * user who wrote one meant the files it names — and reading it as project-
 * relative is the only way it can ever match, now that matching happens against
 * project-relative paths. One that points outside the project matches nothing,
 * and is reported as `outside` so the caller can say so without echoing an
 * absolute path into the graph.
 */
export function toProjectPattern(
  root: string,
  pattern: string,
): { pattern: string; outside: boolean } {
  if (!path.isAbsolute(pattern)) return { pattern, outside: false };
  const relative = toPosixPath(path.relative(root, pattern));
  if (relative === '' || relative.startsWith('..')) return { pattern, outside: true };
  return { pattern: relative, outside: false };
}

/** Directory entries in a fixed order, so the walk cannot depend on the filesystem. */
function sortedEntries(directory: string): { name: string; isDirectory: boolean }[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    // An unreadable directory costs us its contents and nothing else.
    return [];
  }

  const read = entries.map((entry) => {
    if (entry.isSymbolicLink()) {
      // `followSymbolicLinks` is what the previous matcher did, so a project
      // that symlinks a source directory keeps working.
      try {
        return {
          name: entry.name,
          isDirectory: statSync(path.join(directory, entry.name)).isDirectory(),
        };
      } catch {
        return { name: entry.name, isDirectory: false };
      }
    }
    return { name: entry.name, isDirectory: entry.isDirectory() };
  });

  return read.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Options {@link discoverSourceFiles} reads. */
export interface DiscoveryOptions {
  /** Absolute path of the project root. */
  root: string;
  include: readonly string[];
  exclude: readonly string[];
}

/** What one discovery run found, and which patterns could never have matched. */
export interface Discovery {
  files: DiscoveredFile[];
  /** Positions in `include` that name a location outside the project. */
  outsideIncludes: number[];
}

/**
 * Every file in the project that the include patterns name and the exclude
 * patterns do not.
 *
 * The result is sorted by project-relative path, so the graph's order is a
 * property of the names rather than of the order the filesystem happened to
 * hand entries back in.
 */
export function discoverSourceFiles(options: DiscoveryOptions): Discovery {
  const { root } = options;
  const outsideIncludes: number[] = [];

  const project = (patterns: readonly string[], report: boolean): string[] => {
    const kept: string[] = [];
    for (const [index, pattern] of patterns.entries()) {
      const { pattern: rewritten, outside } = toProjectPattern(root, pattern);
      if (outside) {
        if (report) outsideIncludes.push(index);
        continue;
      }
      kept.push(rewritten);
    }
    return kept;
  };

  const include = createPatternSet(project(options.include, true));
  const exclude = createPatternSet(project(options.exclude, false));

  const files: DiscoveredFile[] = [];
  // Only symlinked directories can close a loop, so only they are recorded.
  const visited = new Set<string>();

  const walk = (absolute: string, relative: string): void => {
    for (const entry of sortedEntries(absolute)) {
      const childAbsolute = path.join(absolute, entry.name);
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;

      if (entry.isDirectory) {
        if (exclude.covers(childRelative)) continue;
        if (!include.reaches(childRelative)) continue;
        let real: string;
        try {
          real = realpathSync(childAbsolute);
        } catch {
          continue;
        }
        if (visited.has(real)) continue;
        visited.add(real);
        walk(childAbsolute, childRelative);
        continue;
      }

      if (!include.matches(childRelative)) continue;
      if (exclude.matches(childRelative)) continue;
      files.push({ absolutePath: childAbsolute, relativePath: toPosixPath(childRelative) });
    }
  };

  walk(root, '');
  files.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return { files, outsideIncludes };
}
