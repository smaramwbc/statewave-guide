/**
 * Builds the interactive host, serves it, and drives it in a real browser.
 *
 * One command, because an end-to-end result that depends on somebody having
 * remembered to start a server is a result nobody can reproduce.
 *
 * Usage:
 *   pnpm test:guide-ui-e2e
 *
 * @packageDocumentation
 */

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOST = path.join(ROOT, 'examples', 'guide-e2e');
const PORT = 4319;

console.log('\nBuilding the interactive host…');
const built = spawnSync('npx', ['vite', 'build'], { cwd: HOST, stdio: 'ignore' });
if (built.status !== 0) {
  console.log('FAIL — the interactive host did not build.\n');
  process.exit(1);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: HOST,
  stdio: 'ignore',
});

/** Waits for the server rather than sleeping a guessed amount. */
async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/clients`);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

let code = 1;
try {
  if (!(await ready())) {
    console.log('FAIL — the preview server never became ready.\n');
  } else {
    const specIndex = process.argv.indexOf('--spec');
    const spec =
      specIndex === -1
        ? 'e2e/guide.spec.mjs'
        : (process.argv[specIndex + 1] ?? 'e2e/guide.spec.mjs');
    const run = spawnSync('node', [path.join(ROOT, spec)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, GUIDE_E2E_BASE: `http://127.0.0.1:${PORT}` },
    });
    code = run.status ?? 1;
  }
} finally {
  server.kill();
}
process.exit(code);
