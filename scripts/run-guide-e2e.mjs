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
import net from 'node:net';
import { clearTimeout, setTimeout } from 'node:timers';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const HOST = path.join(ROOT, 'examples', 'guide-e2e');
const PORT = 4319;

/**
 * Is anything already listening on our port?
 *
 * This is not paranoia. A run killed with SIGKILL never reaches the `finally`
 * below, and its `vite preview` survives with PPID 1 — still answering. The
 * next run then spawns a server that cannot bind, and `ready()` gets its 200
 * from *yesterday's build*. That happened here: an orphan from the previous
 * afternoon served every browser gate for a day, and one gate failed against a
 * stale bundle in a way that looked like a product regression.
 *
 * So: bind the port ourselves before spawning anything. If we cannot, say so
 * and stop. Nothing is killed — a process this script did not start is not
 * this script's to end, and a genuine port conflict is worth seeing rather
 * than stepping around.
 */
async function portIsFree() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(PORT, '127.0.0.1');
  });
}

if (!(await portIsFree())) {
  console.log(`\nFAIL — something is already listening on 127.0.0.1:${PORT}.`);
  console.log('  This run would have tested that server instead of the one it builds.');
  console.log(`  Find it with:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN`);
  console.log('  A leftover from a killed run has PPID 1; end that one and try again.\n');
  process.exit(1);
}

/** Whether this run has a Statewave to talk to at all. */
const wantsStatewave = (process.env['STATEWAVE_GUIDE_URL'] ?? '').length > 0;

console.log('\nBuilding the interactive host…');
const built = spawnSync('npx', ['vite', 'build'], {
  cwd: HOST,
  stdio: 'ignore',
  // The demo's backend runs on its own port, so the page needs its absolute
  // URL. Baked in at build time and only when this run has a Statewave to talk
  // to; an ordinary build leaves the default relative path in place.
  env: wantsStatewave
    ? {
        ...process.env,
        VITE_GUIDE_MEMORY_ENDPOINT: `http://127.0.0.1:${process.env['GUIDE_MEMORY_PORT'] ?? 4320}/guide-memory`,
      }
    : process.env,
});
if (built.status !== 0) {
  console.log('FAIL — the interactive host did not build.\n');
  process.exit(1);
}

// Vite's own binary rather than `npx`, so `server.kill()` reaches the process
// that holds the port instead of a wrapper that may have already exited.
const VITE = path.join(HOST, 'node_modules', 'vite', 'bin', 'vite.js');
// `--host 127.0.0.1`, explicitly.
//
// Vite's default host is `localhost`, which Node resolves to `::1` first, so the
// preview server binds IPv6 only — and every probe and every spec in this
// repository addresses `127.0.0.1`. That mismatch is invisible until it is
// total: the server starts, prints a URL, and the readiness probe can never
// reach it. Binding the stack we address is the whole fix.
const server = spawn(
  process.execPath,
  [VITE, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  {
    cwd: HOST,
    stdio: process.env['GUIDE_E2E_SERVER_LOG'] === '1' ? 'inherit' : 'ignore',
  },
);

// If the server dies — a failed bind, a crash — that outranks any probe. Without
// this the script waits for a `ready()` that only a stranger could satisfy.
let serverExited = false;
server.on('exit', () => {
  serverExited = true;
});
server.on('error', () => {
  serverExited = true;
});

// A killed parent must not leave the child holding the port for the next run.
// `finally` does not run for SIGKILL, and nothing can help there; these two are
// the signals a person or a CI runner actually sends.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    backend?.kill();
    server.kill();
    process.exit(1);
  });
}

/**
 * The host's trusted backend, when this run is pointed at a Statewave.
 *
 * Started here rather than assumed, for the same reason the preview server is:
 * a result that depends on somebody having remembered to start a process is a
 * result nobody can reproduce. Without `STATEWAVE_GUIDE_URL` it is not started
 * at all, the proxy has nothing to reach, and the guide runs exactly as it does
 * with no memory — which is what every gate does.
 */
const MEMORY_BACKEND = path.join(HOST, 'memory-backend.mjs');
const backend = wantsStatewave
  ? spawn(process.execPath, [MEMORY_BACKEND], {
      cwd: HOST,
      stdio: process.env['GUIDE_E2E_SERVER_LOG'] === '1' ? 'inherit' : 'ignore',
    })
  : undefined;

/** Waits for the server rather than sleeping a guessed amount. */
async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (serverExited) return false;
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
    console.log(
      serverExited
        ? '\nFAIL — the preview server exited before it could serve anything.\n'
        : '\nFAIL — the preview server never became ready.\n',
    );
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
  // Wait for it to actually go. `kill()` only sends the signal, and returning
  // while the child still holds the port makes the *next* run fail its
  // pre-flight — which looks like a squatter and is really this run leaving.
  backend?.kill();
  if (!serverExited) {
    server.kill();
    await new Promise((resolve) => {
      const done = setTimeout(resolve, 5000);
      server.once('exit', () => {
        clearTimeout(done);
        resolve();
      });
    });
  }
}
process.exit(code);
