/**
 * Indexing never requires AI.
 *
 * This is the promise the whole architecture rests on: the deterministic half of
 * Statewave Guide is the half that matters, and a team with no model budget, no
 * vendor account and no intention of getting either must still be able to run
 * everything below the enrichment line. If `enrich` errored, warned, or half
 * generated when no provider was configured, the optional half would have
 * quietly become mandatory.
 *
 * So the assertions here are deliberately literal. Exit code **0**, the exact
 * six lines, and **no `product.json` on disk** — a run that skipped enrichment
 * and still wrote a model would be claiming to know something it does not.
 *
 * The CLI is exercised through `runCli` with an injected sink rather than by
 * spawning a process, so what is asserted is the real command rather than a
 * re-implementation of it.
 */

import { mkdtemp, mkdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeApplicationGraph } from '@statewavedev/guide-indexer';
import { discoverFeatureCandidates } from '../src/candidates.js';
import { runCli } from '../src/cli.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { dependencyFingerprint, graphHash } from '../src/fingerprint.js';
import { buildFeatureEnrichmentRequest } from '../src/prompt.js';
import type { CliIo } from '../src/reporter.js';
import { PROVIDER_FREE_REPORT } from '../src/reporter.js';
import { clientsGraph } from './helpers.js';

/** A sink that keeps every line, so a test can assert on the whole report. */
function recordingIo(): CliIo & { out: (line: string) => void; lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    out: (line) => lines.push(line),
    err: (line) => errors.push(line),
  };
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'statewave-guide-provider-free-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Writes the fixture graph where the indexer would have put it. */
async function writeGraph(): Promise<void> {
  const directory = path.join(root, '.statewave-guide');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'application.json'),
    serializeApplicationGraph(clientsGraph()),
    'utf8',
  );
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

describe('the CLI with no provider', () => {
  it('loads the graph, says it skipped enrichment, and exits 0', async () => {
    await writeGraph();
    const io = recordingIo();

    const code = await runCli(['enrich', root], io);

    expect(code).toBe(0);
    expect(io.lines).toEqual([...PROVIDER_FREE_REPORT]);
    expect(io.errors).toEqual([]);
  });

  it('prints exactly the six lines the contract specifies', async () => {
    await writeGraph();
    const io = recordingIo();

    await runCli(['enrich', root], io);

    expect(io.lines.join('\n')).toBe(
      [
        'Statewave Guide',
        '',
        'Application graph loaded.',
        '',
        'Semantic enrichment skipped:',
        'No model provider configured.',
      ].join('\n'),
    );
  });

  it('writes no Product Model, because it learned nothing to write', async () => {
    await writeGraph();

    await runCli(['enrich', root], recordingIo());

    expect(await exists(path.join(root, '.statewave-guide', 'product.json'))).toBe(false);
  });

  it('defaults to enrich when no subcommand is given', async () => {
    await writeGraph();
    const io = recordingIo();

    const code = await runCli([root], io);

    expect(code).toBe(0);
    expect(io.lines).toEqual([...PROVIDER_FREE_REPORT]);
  });

  it('still refuses to guess when the graph is missing', async () => {
    const io = recordingIo();

    const code = await runCli(['enrich', root], io);

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain('No application graph at');
    expect(io.errors.join('\n')).toContain('guide-indexer');
  });

  it('names a directory that is not there rather than creating one', async () => {
    const io = recordingIo();

    const code = await runCli(['enrich', path.join(root, 'nope')], io);

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain('No such directory');
    expect(await exists(path.join(root, 'nope'))).toBe(false);
  });

  it('refuses a provider it cannot construct instead of falling back to one', async () => {
    await writeGraph();
    const io = recordingIo();

    const code = await runCli(['enrich', root, '--provider', 'something-else'], io);

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain('Unknown provider');
    expect(io.lines).toEqual([]);
  });

  it('keeps failures visible under --silent', async () => {
    const io = recordingIo();

    const code = await runCli(['enrich', path.join(root, 'nope'), '--silent'], io);

    expect(code).toBe(1);
    expect(io.lines).toEqual([]);
    expect(io.errors.length).toBeGreaterThan(0);
  });
});

describe('everything below the enrichment line runs without a provider', () => {
  it('discovers candidates, packs evidence and fingerprints them', () => {
    const graph = clientsGraph();

    const candidates = discoverFeatureCandidates(graph);
    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      const pack = buildEvidencePack(graph, candidate);
      expect(pack.featureId).toBe(candidate.id);
      expect(pack.nodes.length).toBeGreaterThan(0);
      expect(dependencyFingerprint(pack).hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(graphHash(graph)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds a prompt without needing anything to send it to', () => {
    const graph = clientsGraph();
    const candidate = discoverFeatureCandidates(graph, { limit: 1 })[0];
    expect(candidate).toBeDefined();

    const request = buildFeatureEnrichmentRequest(buildEvidencePack(graph, candidate!));

    expect(request.system.length).toBeGreaterThan(0);
    expect(request.evidence).toContain(candidate!.id);
  });
});

describe('the full command surface', () => {
  it('prints help and exits 0', async () => {
    const io = recordingIo();
    const code = await runCli(['--help'], io);

    expect(code).toBe(0);
    expect(io.lines[0]).toContain('statewave-guide-semantic');
    expect(io.lines.join('\n')).toContain('Omit it to run provider-free');
  });

  it('prints a version and exits 0', async () => {
    const io = recordingIo();
    const code = await runCli(['--version'], io);

    expect(code).toBe(0);
    expect(io.lines).toHaveLength(1);
    expect(io.lines[0]).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects an unknown option rather than ignoring it', async () => {
    const io = recordingIo();
    const code = await runCli(['enrich', root, '--turbo'], io);

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain('Unknown option "--turbo"');
  });

  it('rejects a second directory rather than silently picking one', async () => {
    const io = recordingIo();
    const code = await runCli(['enrich', root, root], io);

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain('Only one directory');
  });

  it('rejects a flag with no value', async () => {
    for (const argv of [
      ['enrich', '--out'],
      ['enrich', '--limit'],
      ['enrich', '--provider'],
    ]) {
      const io = recordingIo();
      expect(await runCli(argv, io)).toBe(1);
      expect(io.errors.join('\n')).toContain('requires a value');
    }
  });

  it('rejects a limit that is not a whole number', async () => {
    const io = recordingIo();
    const code = await runCli(['enrich', root, '--limit=two'], io);

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain('non-negative whole number');
  });
});

describe('the CLI with the built-in provider', () => {
  it('writes a Product Model and reports what it verified', async () => {
    await writeGraph();
    const io = recordingIo();

    const code = await runCli(['enrich', root, '--provider', 'mock'], io);

    expect(code).toBe(0);
    const written = path.join(root, '.statewave-guide', 'product.json');
    expect(await exists(written)).toBe(true);
    expect(JSON.parse(await readFile(written, 'utf8'))).toMatchObject({ version: 2 });
    expect(io.lines.join('\n')).toContain('structurally verified');
    expect(io.lines.at(-1)).toBe('.statewave-guide/product.json');
  });

  it('reuses the model it wrote last time, without calling the provider', async () => {
    await writeGraph();
    await runCli(['enrich', root, '--provider', 'mock'], recordingIo());
    const io = recordingIo();

    const code = await runCli(['enrich', root, '--provider', 'mock'], io);

    expect(code).toBe(0);
    expect(io.lines.join('\n')).toContain('reused unchanged (no model call)');
  });

  it('prints the model instead of writing it under --json', async () => {
    await writeGraph();
    const io = recordingIo();

    const code = await runCli(['enrich', root, '--provider', 'mock', '--json'], io);

    expect(code).toBe(0);
    expect(await exists(path.join(root, '.statewave-guide', 'product.json'))).toBe(false);
    expect(JSON.parse(io.lines.join('\n'))).toMatchObject({ version: 2 });
  });

  it('warns about an unreadable previous model rather than failing on it', async () => {
    await writeGraph();
    await writeFile(
      path.join(root, '.statewave-guide', 'product.json'),
      '{ not json at all',
      'utf8',
    );
    const io = recordingIo();

    const code = await runCli(['enrich', root, '--provider', 'mock'], io);

    expect(code).toBe(0);
    expect(io.errors.join('\n')).toContain('Ignoring the previous Product Model');
  });
});

describe('the docs command never needs a provider', () => {
  it('refuses helpfully when there is no model to project', async () => {
    const io = recordingIo();

    const code = await runCli(['docs', root], io);

    expect(code).toBe(1);
    expect(io.errors.join('\n')).toContain('No Product Model at');
    expect(io.errors.join('\n')).toContain('enrich');
  });

  it('projects Markdown from a model that already exists', async () => {
    await writeGraph();
    await runCli(['enrich', root, '--provider', 'mock'], recordingIo());
    const io = recordingIo();

    const code = await runCli(['docs', root], io);

    expect(code).toBe(0);
    expect(await exists(path.join(root, 'docs', 'index.md'))).toBe(true);
    expect(io.lines.join('\n')).toContain('feature page');
  });

  it('can be asked for during enrichment', async () => {
    await writeGraph();
    const io = recordingIo();

    const code = await runCli(
      ['enrich', root, '--provider', 'mock', '--docs', '--docs-dir', 'guide'],
      io,
    );

    expect(code).toBe(0);
    expect(await exists(path.join(root, 'guide', 'index.md'))).toBe(true);
    expect(await exists(path.join(root, 'docs'))).toBe(false);
  });
});
