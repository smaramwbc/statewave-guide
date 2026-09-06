/**
 * Checks do not write. Captures do.
 *
 * The rule exists because breaking it is invisible until it has already done
 * damage. Running the full gate sweep during Closed Loop #17 rewrote the frozen
 * Interactive Review V2 record, invalidated the visual review package by
 * re-capturing the very evidence it cites, and left the tree dirty — all from
 * three commands that were registered as `test:` and were actually captures.
 * That is Closed Loop #15's failure (a package citing a record that no longer
 * exists) arriving by a different route, and a naming convention alone will not
 * stop it happening again.
 *
 * So the convention is enforced structurally:
 *
 *   1. No `test:` script may invoke a `capture:` script.
 *   2. No `test:` script may reach code that writes into a frozen location,
 *      unless that write is guarded — by `--check`, or by an output redirection
 *      the command sets.
 *   3. Frozen locations are written only by `capture:` commands and by builders
 *      run without `--check`.
 *
 * Rules 1 and 2 are checked by reading the scripts rather than by running them,
 * which is the point: a gate that only notices mutation after it happens is a
 * post-mortem. Rule 3 is then confirmed empirically over the fast visual gates,
 * because a structural argument that has never been tested against reality is
 * an argument.
 *
 * ## What this does not claim
 *
 * Static analysis of shell strings and JavaScript is not a proof, and this is
 * not a sandbox. It follows script aliases, one import hop, `./` prefixes,
 * per-segment guards in a chain, and the test directory behind a vitest filter —
 * every one of those was a hole first, found by trying to defeat the gate rather
 * than by reasoning about it. Somebody determined to write from a check can
 * still do it: through a deeper import chain, a dynamic path, or a tool this
 * file has never heard of.
 *
 * The backstop for that is `test:tree-clean`, which runs at the end of every
 * sweep and notices any mutation whatsoever. This gate exists to catch the
 * *shape* of the mistake early, with a message naming the script, rather than as
 * a dirty tree at the end of a five-minute run with nothing to point at.
 *
 * Usage:
 *   pnpm test:capture-immutability
 *
 * @packageDocumentation
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = packageJson.scripts;

const failures = [];
const notes = [];

/**
 * Everything a frozen review depends on.
 *
 * Directories rather than files, because a review artifact that gains a file is
 * as changed as one that loses a byte.
 */
const FROZEN_LOCATIONS = [
  // Closed Loop #19's capture, frozen by #19.1. It was the only review directory
  // with nothing protecting it — an audit pointed that out, and the loop that
  // followed had every reason to overwrite it while rebuilding what it measured.
  'benchmarks/memory-adaptation-review-v1',
  'benchmarks/runtime-visible-language-review-v1',
  'benchmarks/visual-context-review-v1',
  'benchmarks/interactive-review-v1',
  'benchmarks/interactive-review-v1-r1',
  'benchmarks/interactive-review-v1-r2',
  'benchmarks/interactive-review-v2',
  'benchmarks/runtime-instance-experiment',
  'benchmarks/provider-reality-check',
  // The #19.1 and #20.x evidence. Found missing by the Day 10 docs fact-check:
  // the newest four review directories were the unprotected ones, which is the
  // same defect the first entry in this list was added to close — the freshest
  // evidence is always what the next loop has a motive to overwrite.
  'benchmarks/memory-ux-resolution-review-v1',
  'benchmarks/statewave-persistence-review-v1',
  'benchmarks/remote-memory-retention-review-v1',
  'benchmarks/bounded-statewave-memory-review-v1',
  'docs/product',
];

/** Calls that put bytes on disk. Deliberately broad. */
const WRITE_CALLS =
  /\b(writeFileSync|writeFile|appendFileSync|appendFile|mkdirSync|rmSync|rmdirSync|unlinkSync|cpSync|copyFileSync|renameSync|truncateSync|ftruncateSync|openSync|writeSync|createWriteStream)\b|\.screenshot\(/;

/** This analyser, which names every write call and every frozen location. */
const SELF = 'scripts/capture-immutability.mjs';

/**
 * Source with comments removed.
 *
 * Every structural question here is about what a file *does*, and a doc comment
 * saying "a second line of defence behind `test:artifact-integrity`" is not a
 * call to it. Scanning raw text made `tree-clean.mjs` appear to run five
 * builders it has never heard of — the same mistake the d.ts guard, the selector
 * guard and this loop's own redaction scan each made once.
 */
function codeOf(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Ways a command can send a script's output somewhere disposable. */
const REDIRECTIONS = /GUIDE_E2E_OUT=|--out-dir\s|mktemp/;

/**
 * Whether a command can actually reach a script's write path.
 *
 * Three shapes are in use here and all three are correct, so all three are
 * understood. `--check` turns writing *off* in a builder that writes by default.
 * `--write` turns it *on* in a script that otherwise emits to a temporary
 * directory — the shape introduced when `test:no-factual-expansion` was caught
 * regenerating a historical benchmark as a side effect of checking it. And an
 * environment variable turns it on inside a vitest test, because vitest workers
 * never receive the runner's argv and a flag there would look like it worked
 * while silently never writing.
 *
 * A gate that failed any of those would be punishing the fix.
 */
function writePathIsReachable(command, source, file) {
  // Per segment, not per command. A guard belongs to the step that carries it,
  // and testing the whole string lets one legitimately guarded step launder an
  // unguarded capture standing next to it in the same chain.
  const segments = command
    .split(/&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const owning = segments.filter((segment) => {
    const base = path.basename(file);
    return segment.includes(base) || /(?:pnpm|npm|yarn)\s/.test(segment);
  });
  const relevant = owning.length > 0 ? owning : segments;

  return relevant.some((segment) => {
    if (REDIRECTIONS.test(segment)) return false;
    if (segment.includes('--check') && source.includes('--check')) return false;

    // An environment variable the source requires before writing. Unset in the
    // command means the write path is not reachable by it.
    const envGates = [...source.matchAll(/process\.env\['([A-Z0-9_]+)'\]\s*===/g)].map(
      (match) => match[1],
    );
    if (envGates.length > 0 && !envGates.some((name) => segment.includes(`${name}=`))) {
      return false;
    }

    const flags = [...source.matchAll(/process\.argv\.includes\('(--[\w-]+)'\)/g)].map(
      (match) => match[1],
    );
    const enabling = flags.filter((flag) => flag !== '--check');
    const hasDisposableFallback = /mkdtempSync|tmpdir\(\)|GUIDE_E2E_OUT/.test(source);
    if (hasDisposableFallback && enabling.length > 0) {
      return enabling.some((flag) => segment.includes(flag));
    }
    return true;
  });
}

/**
 * Every local file a command reaches, following script aliases and imports.
 *
 * Three hops matter and each was a hole first:
 *
 *   - a `./` prefix, or a path anywhere in a shell chain, is still a path;
 *   - `pnpm run other-script` reaches whatever *that* script reaches;
 *   - a thin entry point that imports the writer is the writer.
 *
 * Vitest gates name no file at all, so their test directories are pulled in by
 * the package the command filters on.
 */
/**
 * Arguments a spawn supplies to a file it runs, keyed by that file.
 *
 * `historical-artifact-integrity.mjs` spawns thirty-nine builders and passes
 * `--check` to the ones that would otherwise write. That guard is real, and it
 * lives in the spawn table rather than in the package.json command — so without
 * carrying it forward the gate would report every one of those builders as
 * unguarded and be wrong about all of them.
 */
const spawnArgs = new Map();

function referencedFiles(command, seen = new Set(), depth = 0) {
  if (depth > 4) return [];
  const found = new Set();
  const fromCommand = new Set();

  for (const match of command.matchAll(/(?:^|[\s'"=(])\.?\/?((?:scripts|e2e)\/[\w./-]+\.mjs)/g)) {
    found.add(match[1]);
    fromCommand.add(match[1]);
  }

  // A vitest gate runs whatever its filter matches. Take the package's whole
  // test directory rather than trying to resolve the pattern.
  const vitest = /--filter\s+(\S+)\s+exec\s+vitest/.exec(command);
  if (vitest !== null) {
    const workspace = vitest[1].replace('@statewavedev/guide-', '');
    for (const candidate of [`packages/${workspace}/test`, `packages/${workspace}/src`]) {
      for (const file of filesUnder(candidate)) found.add(file);
    }
  }

  // `pnpm run x` / `pnpm x` reaches everything x reaches.
  for (const match of command.matchAll(/(?:pnpm|npm|yarn)\s+(?:run\s+)?([\w:.-]+)/g)) {
    const referenced = scripts[match[1]];
    if (referenced === undefined || seen.has(match[1])) continue;
    seen.add(match[1]);
    for (const file of referencedFiles(referenced, seen, depth + 1)) found.add(file);
  }

  // One module hop, and one process hop. A file that imports a writer is the
  // writer; a file that spawns one is too, and spawning was the last evasion
  // left standing after the import hop was closed.
  for (const file of [...found]) {
    let source;
    try {
      source = codeOf(readFileSync(path.join(ROOT, file), 'utf8'));
    } catch {
      continue;
    }
    for (const match of source.matchAll(/from\s+'(\.[\w./-]+\.mjs)'/g)) {
      const resolved = path.normalize(path.join(path.dirname(file), match[1]));
      if (!found.has(resolved)) found.add(resolved);
    }
    if (file === SELF) continue;
    // Only files that actually spawn. An earlier attempt collected script paths
    // from every file, which made anything that merely *mentions* another script
    // reach it and accused a dozen gates at once; a window around the call site
    // then missed `historical-artifact-integrity.mjs`, which spawns from a table
    // of thirty-nine paths declared well away from the call. Requiring a spawn
    // somewhere in the file, and then taking its paths, gets both.
    if (!/\b(?:execFileSync|execSync|spawnSync|spawn|fork)\s*\(/.test(source)) continue;
    for (const match of source.matchAll(
      /\[([^\][]*['"`]\.?\/?((?:scripts|e2e)\/[\w./-]+\.mjs)['"`][^\][]*)\]/g,
    )) {
      found.add(match[2]);
      // Whatever else that array carries is an argument to it.
      const args = [...match[1].matchAll(/'(--[\w-]+)'/g)].map((flag) => flag[1]).join(' ');
      if (args.length > 0) spawnArgs.set(match[2], `${spawnArgs.get(match[2]) ?? ''} ${args}`);
    }
    for (const match of source.matchAll(/['"`]\.?\/?((?:scripts|e2e)\/[\w./-]+\.mjs)['"`]/g)) {
      found.add(match[1]);
    }
    for (const match of source.matchAll(/['"`]((?:test|capture):[\w:.-]+)['"`]/g)) {
      const referenced = scripts[match[1]];
      if (referenced === undefined || seen.has(match[1])) continue;
      seen.add(match[1]);
      for (const nested of referencedFiles(referenced, seen, depth + 1)) found.add(nested);
    }
  }

  // `run-guide-e2e.mjs` is parameterised: it falls back to `e2e/guide.spec.mjs`
  // when `--spec` is absent, and every registered command supplies one. A
  // default that the argument overrides is not a file this command reaches — but
  // a command that supplies no spec still reaches it, which is why this drops
  // source-derived specs only when the command named one itself.
  const commandNamesSpec = [...fromCommand].some((file) => /\.spec\.mjs$/.test(file));
  if (commandNamesSpec) {
    for (const file of [...found]) {
      if (/\.spec\.mjs$/.test(file) && !fromCommand.has(file)) found.delete(file);
    }
  }

  return [...found];
}

/** Every source file under a directory, relative to the repository root. */
function filesUnder(relative) {
  const out = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(path.join(ROOT, current), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (/\.(mjs|js|ts|tsx)$/.test(entry.name)) out.push(next);
    }
  };
  walk(relative);
  return out;
}

/**
 * Which frozen locations a file's own source mentions.
 *
 * A path built by joining segments still contains the distinctive segment, so
 * matching on the location string finds `path.join(ROOT, 'benchmarks',
 * 'visual-context-review-v1')` as well as a literal path.
 */
function frozenLocationsMentioned(source) {
  // Quotes and concatenation are removed first, so `'benchmarks' + '/visual-' +
  // 'context-review-v1'` and `"benchmarks/visual-context-review-v1"` both reduce
  // to the literal path. An earlier version matched only single-quoted whole
  // segments and claimed in its own comment to do more than it did.
  const flattened = source.replace(/['"`]\s*\+?\s*['"`]?/g, '').replace(/,\s*/g, '/');
  return FROZEN_LOCATIONS.filter((location) => {
    if (source.includes(location) || flattened.includes(location)) return true;
    // A bare last segment only counts when it could not be an ordinary word.
    // `docs/product` ends in "product", which appears in every file that
    // mentions the ProductModel, and matching on it accused eight innocent
    // gates at once.
    const last = location.split('/').at(-1);
    const distinctive = last.includes('-') && last.length >= 12;
    return distinctive && (flattened.includes(last) || source.includes(last));
  });
}

// ---------------------------------------------------------------------------
// 1 · a check may not call a capture
// ---------------------------------------------------------------------------

const captureNames = Object.keys(scripts).filter((name) => name.startsWith('capture:'));
const testNames = Object.keys(scripts).filter((name) => name.startsWith('test:'));

for (const name of testNames) {
  const command = scripts[name];
  for (const capture of captureNames) {
    if (command.includes(capture)) {
      failures.push(`${name} invokes ${capture}; a check may not run a capture`);
    }
  }
  if (/\b(pnpm|npm|yarn)\s+(run\s+)?capture:/.test(command)) {
    failures.push(`${name} invokes a capture command`);
  }
}

// ---------------------------------------------------------------------------
// 2 · a check may not reach an unguarded write into a frozen location
// ---------------------------------------------------------------------------

for (const name of testNames) {
  const command = scripts[name];
  for (const file of referencedFiles(command)) {
    // The analyser names every write call and every frozen location, so it
    // matches its own detectors. Excluding it is not an exemption: it is the
    // only file here whose *subject matter* is the thing being detected.
    if (file === SELF) continue;
    let source;
    try {
      source = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      failures.push(`${name} runs ${file}, which does not exist`);
      continue;
    }
    const code = codeOf(source);
    if (!WRITE_CALLS.test(code)) continue;
    const touched = frozenLocationsMentioned(code);
    if (touched.length === 0) continue;
    // The command as it actually reaches this file, including anything a spawn
    // table passes it.
    const effective = `${command} ${spawnArgs.get(file) ?? ''}`.trim();
    if (!writePathIsReachable(effective, code, file)) {
      notes.push(`${name} → ${file} cannot reach its write path (${touched.join(', ')})`);
      continue;
    }
    failures.push(
      `${name} runs ${file}, which writes into ${touched.join(', ')} with nothing guarding it`,
    );
  }
}

// ---------------------------------------------------------------------------
// 3 · and in fact nothing moves when the checks run
// ---------------------------------------------------------------------------

/** Every file under the frozen locations, hashed. */
function fingerprint() {
  const entries = new Map();
  const walk = (relative) => {
    const absolute = path.join(ROOT, relative);
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) walk(path.join(relative, child));
      return;
    }
    entries.set(relative, createHash('sha256').update(readFileSync(absolute)).digest('hex'));
  };
  for (const location of FROZEN_LOCATIONS) walk(location);
  return entries;
}

// The visual gates, because they are fast and because they are the ones that
// read the artifacts this loop froze. Running all eighty would take minutes and
// prove the same thing about the same three suspects.
const EMPIRICAL = testNames.filter(
  (name) => name.startsWith('test:visual-') || name === 'test:interactive-review-v2-integrity',
);

const before = fingerprint();
for (const name of EMPIRICAL) {
  try {
    execFileSync('pnpm', ['run', name], { cwd: ROOT, stdio: 'pipe' });
  } catch (error) {
    failures.push(`${name} failed while being checked for writes: ${String(error).slice(0, 120)}`);
  }
}
const after = fingerprint();

for (const [file, digest] of after) {
  const was = before.get(file);
  if (was === undefined) failures.push(`${file} appeared while checks were running`);
  else if (was !== digest) failures.push(`${file} changed while checks were running`);
}
for (const file of before.keys()) {
  if (!after.has(file)) failures.push(`${file} was deleted while checks were running`);
}

notes.push(`${EMPIRICAL.length} checks run; ${before.size} frozen files unchanged`);
notes.push(`${captureNames.length} capture commands, which are the only things allowed to write`);

const say = (line = '') => console.log(line);
say('\nCapture immutability\n');
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — a check can write, or did.\n');
  process.exit(1);
}
say('\nPASS — checks read, captures write.\n');
