/**
 * Which half of the application a file belongs to.
 *
 * Determined structurally rather than by folder name, because a folder name is
 * a convention and a convention is not evidence: `src/api/` holds the client in
 * one codebase and the server in the next. What a file *imports* and whether it
 * renders JSX are facts about the file itself, and they are read first. The
 * configured path hint exists only for the genuinely ambiguous remainder — a
 * module of pure helpers that imports nothing recognisable.
 *
 * @packageDocumentation
 */

/** Which half of the application something belongs to. */
export type ApplicationSide = 'frontend' | 'backend' | 'shared';

/** Why {@link classifySide} answered the way it did. */
export type SideRule =
  /** The file imports a server framework. */
  | 'server-framework-import'
  /** The file renders JSX. */
  | 'jsx'
  /** The file imports a UI framework. */
  | 'ui-framework-import'
  /** The file's path matched a configured backend prefix. */
  | 'configured-path-hint'
  /** Nothing said otherwise. */
  | 'default';

/** Module specifiers that make a file server code. */
const SERVER_SPECIFIERS: readonly string[] = [
  'express',
  'fastify',
  'node:http',
  'node:https',
  'http',
  'https',
  '@nestjs/common',
  'koa',
  'hapi',
];

/** Module specifiers that make a file client code. */
const UI_SPECIFIERS: readonly string[] = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'preact',
  'solid-js',
  'vue',
];

/** Backend path prefixes used when structure says nothing. */
export const DEFAULT_BACKEND_PREFIXES: readonly string[] = ['backend/**', 'server/**', 'api/**'];

/**
 * Reduces a glob to the literal directory prefix it can only ever match under.
 *
 * The hint is a fallback, so a cheap prefix test is enough: `server/**` becomes
 * `server/`, and anything with a wildcard earlier than the first separator
 * matches nothing rather than matching everything.
 */
export function backendPrefix(pattern: string): string | undefined {
  const wildcard = pattern.search(/[*?[{]/);
  const literal = wildcard === -1 ? pattern : pattern.slice(0, wildcard);
  const trimmed = literal.replace(/^\.\//, '').replace(/\/+$/, '');
  return trimmed.length === 0 ? undefined : `${trimmed}/`;
}

/** Inputs {@link classifySide} reads. */
export interface SideInput {
  /** Project-relative POSIX path. */
  file: string;
  hasJsx: boolean;
  /** Every module specifier the file imports from. */
  importedSpecifiers: readonly string[];
  /** Literal directory prefixes that mean "backend". */
  backendPrefixes: readonly string[];
}

/** The side of the application a file belongs to, and the rule that said so. */
export function classifySide(input: SideInput): { side: ApplicationSide; rule: SideRule } {
  const specifiers = new Set(input.importedSpecifiers);

  // A server framework import is checked first: a file that imports `express`
  // is server code even if it also happens to render markup for an email.
  for (const specifier of SERVER_SPECIFIERS) {
    if (specifiers.has(specifier)) return { side: 'backend', rule: 'server-framework-import' };
  }
  if (input.hasJsx) return { side: 'frontend', rule: 'jsx' };
  for (const specifier of UI_SPECIFIERS) {
    if (specifiers.has(specifier)) return { side: 'frontend', rule: 'ui-framework-import' };
  }
  for (const prefix of input.backendPrefixes) {
    if (input.file.startsWith(prefix)) return { side: 'backend', rule: 'configured-path-hint' };
  }
  return { side: 'shared', rule: 'default' };
}
