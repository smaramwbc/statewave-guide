/**
 * Writing the graph to disk.
 *
 * @packageDocumentation
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_OUT_DIR } from './config.js';
import type { ApplicationGraph } from './graph.js';
import { toRelativePosix } from './paths.js';
import { serializeApplicationGraph } from './serialize.js';

/** File name the graph is always written under. */
export const GRAPH_FILE_NAME = 'application.json';

/** Where to write a graph. */
export interface WriteGraphOptions {
  root: string;
  outDir?: string;
}

/** What was written. */
export interface WriteGraphResult {
  path: string;
  /** project-relative */
  relativePath: string;
  bytes: number;
}

/**
 * Writes `graph` to `<root>/<outDir>/application.json`, creating the directory
 * if needed.
 *
 * The absolute path is returned for callers that need to open the file, and the
 * project-relative one for anything a human reads — an absolute path in a log
 * is noise, and in a committed artefact it is a leak.
 */
export async function writeApplicationGraph(
  graph: ApplicationGraph,
  options: WriteGraphOptions,
): Promise<WriteGraphResult> {
  const root = path.resolve(options.root);
  const directory = path.resolve(root, options.outDir ?? DEFAULT_OUT_DIR);
  const filePath = path.join(directory, GRAPH_FILE_NAME);
  const contents = serializeApplicationGraph(graph);

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, contents, 'utf8');

  return {
    path: filePath,
    relativePath: toRelativePosix(root, filePath),
    bytes: Buffer.byteLength(contents, 'utf8'),
  };
}
