#!/usr/bin/env node
/**
 * Indexing performance harness.
 *
 * The goal is not to optimise. It is to know whether anything here is
 * accidentally quadratic — symbol resolution, endpoint joining and the
 * relationship passes all walk collections that grow with the project, and any
 * one of them could turn a two-second index into a two-minute one on a codebase
 * four times the size.
 *
 * So this measures at several sizes and reports **time per file**. A roughly
 * flat per-file cost is linear. A per-file cost that climbs with N is the signal
 * worth acting on.
 *
 * Synthetic projects are generated into a temp directory and removed afterwards.
 * Nothing is written into any real repository.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

async function measure(name, root, config) {
  if (globalThis.gc) globalThis.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const started = process.hrtime.bigint();

  const { graph } = await createProjectIndexer({ root, config }).index();

  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const heapMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  const files = graph.nodes.filter((n) => n.kind === 'file').length;

  return {
    name,
    files,
    nodes: graph.stats.nodes,
    relationships: graph.stats.relationships,
    ms: Math.round(ms),
    msPerFile: files === 0 ? 0 : ms / files,
    heapMb: Math.round(heapMb),
  };
}

// ---------------------------------------------------------------------------
// Synthetic project
// ---------------------------------------------------------------------------

/**
 * Generates a project of `count` files with realistic cross-file structure:
 * every page imports two services, every service calls the shared http client,
 * and every fifth file registers a backend route. Deliberately not a flat list
 * of independent files, because independent files would never exercise the
 * resolver — which is the part most likely to scale badly.
 */
function generateProject(dir, count) {
  mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
  mkdirSync(path.join(dir, 'src', 'services'), { recursive: true });
  mkdirSync(path.join(dir, 'src', 'routes'), { recursive: true });

  writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: { target: 'ES2022', module: 'ESNext', jsx: 'react-jsx', strict: true },
        include: ['src'],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(dir, 'src', 'http.ts'),
    `export const API_BASE_URL = '/api';\nexport const api = {\n  get: (p: string) => fetch(\`\${API_BASE_URL}\${p}\`, { method: 'GET' }),\n  post: (p: string, b: unknown) => fetch(\`\${API_BASE_URL}\${p}\`, { method: 'POST', body: JSON.stringify(b) }),\n};\n`,
  );

  const services = Math.max(1, Math.floor(count / 4));
  for (let i = 0; i < services; i += 1) {
    writeFileSync(
      path.join(dir, 'src', 'services', `service${i}.ts`),
      `import { api } from '../http';\n\nexport const service${i} = {\n  async list() {\n    return api.get('/resource${i}');\n  },\n  async create(input: unknown) {\n    return api.post('/resource${i}', input);\n  },\n};\n`,
    );
  }

  const pages = count - services;
  for (let i = 0; i < pages; i += 1) {
    const a = i % services;
    const b = (i + 1) % services;
    writeFileSync(
      path.join(dir, 'src', 'pages', `Page${i}.tsx`),
      `import { service${a} } from '../services/service${a}';\nimport { service${b} } from '../services/service${b}';\n\nexport function Page${i}() {\n  function load${i}() {\n    void service${a}.list();\n  }\n  function save${i}() {\n    void service${b}.create({ id: ${i} });\n  }\n  return (\n    <main data-guide="page${i}" data-guide-type="section">\n      <button data-guide="page${i}.load" onClick={load${i}}>Load</button>\n      <button data-guide="page${i}.save" onClick={save${i}}>Save</button>\n    </main>\n  );\n}\n`,
    );
  }
  return { services, pages };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const results = [];

// Real projects first.
results.push(
  await measure(
    'fixture: realistic-app',
    path.join(ROOT, 'packages/indexer/test/fixtures/realistic-app'),
    {
      include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'],
    },
  ),
);
results.push(
  await measure('example: react-demo', path.join(ROOT, 'examples/react-demo'), {
    include: ['src/**/*.{ts,tsx}', 'backend/src/**/*.ts'],
  }),
);

// Synthetic scaling sweep.
const sweep = [125, 250, 500, 1000, 2000];
const workspace = mkdtempSync(path.join(tmpdir(), 'statewave-guide-perf-'));
try {
  for (const size of sweep) {
    const dir = path.join(workspace, `p${size}`);
    generateProject(dir, size);
    results.push(
      await measure(`synthetic: ${size} files`, dir, { include: ['src/**/*.{ts,tsx}'] }),
    );
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padStart(width);
console.log('\nStatewave Guide Indexer Performance\n');
console.log('  project                       files    nodes    rels      ms   ms/file   heap MB');
console.log('  ' + '-'.repeat(76));
for (const r of results) {
  console.log(
    `  ${r.name.padEnd(28)}${pad(r.files, 5)}${pad(r.nodes, 9)}${pad(r.relationships, 8)}${pad(r.ms, 8)}${pad(r.msPerFile.toFixed(2), 10)}${pad(r.heapMb, 10)}`,
  );
}

const synthetic = results.filter((r) => r.name.startsWith('synthetic'));
if (synthetic.length >= 2) {
  const first = synthetic[0];
  const last = synthetic[synthetic.length - 1];
  const fileRatio = last.files / first.files;
  const timeRatio = last.ms / Math.max(first.ms, 1);
  const perFileGrowth = last.msPerFile / Math.max(first.msPerFile, 0.0001);

  console.log('\n  Scaling');
  console.log('  ' + '-'.repeat(76));
  console.log(`  ${fileRatio.toFixed(0)}x the files took ${timeRatio.toFixed(1)}x the time.`);
  console.log(`  Per-file cost changed by ${perFileGrowth.toFixed(2)}x across the sweep.`);
  console.log(
    perFileGrowth < 2
      ? '  Roughly linear. No quadratic blow-up at this size.'
      : '  ⚠ Per-file cost is climbing with N — investigate before it matters.',
  );
}
console.log('');
