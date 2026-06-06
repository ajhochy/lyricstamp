#!/usr/bin/env node
// e2e-app.mjs — run the Playwright app-target suite against the REAL packaged
// build in one command. Locates the built .app, frees :7878, launches it,
// waits for the backend to report healthy, runs playwright.app.config.ts, then
// tears the app down no matter how the run ends.
//
//   node scripts/e2e-app.mjs                 # run the whole app-target suite
//   node scripts/e2e-app.mjs stamp-workflow  # extra args pass through to Playwright
//
// Assumes the app is already built (npm run electron:dist). This script does
// NOT build — that stays an explicit step.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const PORT = 7878;
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;
const HEALTH_TIMEOUT_MS = 30_000;

/** Resolve the packaged app binary, preferring the arch-specific output dir. */
function resolveAppBinary() {
  const candidates = [
    'dist/mac-arm64/LyricStamp.app',
    'dist/mac/LyricStamp.app',
    'dist/LyricStamp.app',
  ];
  for (const rel of candidates) {
    const bin = join(rel, 'Contents/MacOS/LyricStamp');
    if (existsSync(bin)) return bin;
  }
  // Fallback: first *.app under dist/. The Mach-O binary inside an Electron
  // .app is named after productName, so derive it from the bundle dir name
  // (keeps this robust across product renames).
  if (existsSync('dist')) {
    for (const entry of readdirSync('dist')) {
      if (entry.endsWith('.app')) {
        const bin = join('dist', entry, 'Contents/MacOS', entry.replace(/\.app$/, ''));
        if (existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

/** Kill anything currently listening on PORT so we test OUR launch, not a
 *  stale instance (the app would otherwise reuse a healthy backend). */
function freePort() {
  const res = spawnSync('lsof', ['-nP', `-tiTCP:${PORT}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  const pids = res.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  for (const pid of pids) {
    try { process.kill(Number(pid), 'SIGTERM'); } catch { /* already gone */ }
  }
  if (pids.length) {
    spawnSync('sleep', ['1']);
    console.log(`[e2e-app] freed :${PORT} (killed ${pids.join(', ')})`);
  }
}

function getHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body).ok === true); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function waitForHealthy() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await getHealth()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const bin = resolveAppBinary();
if (!bin) {
  console.error('[e2e-app] No packaged app found under dist/. Build it first: npm run electron:dist');
  process.exit(1);
}

freePort();

// Use a fresh, throwaway data dir for each app-target run so tests never
// touch the user's real session data at ~/Library/Application Support/ableset-lyrics-sync/.
const e2eDataDir = mkdtempSync(join(tmpdir(), 'ablesync-e2e-app-'));
process.env.ABLESET_DATA_DIR = e2eDataDir;
console.log(`[e2e-app] isolated data dir → ${e2eDataDir}`);

const logDir = mkdtempSync(join(tmpdir(), 'ablesync-e2e-'));
const logPath = join(logDir, 'app.log');
console.log(`[e2e-app] launching ${bin}`);
console.log(`[e2e-app] app log → ${logPath}`);

const app = spawn(bin, [], { env: { ...process.env }, stdio: 'ignore', detached: false });
let appExited = false;
app.on('exit', () => { appExited = true; });

function teardown() {
  if (!appExited && app.pid) {
    try { process.kill(app.pid, 'SIGTERM'); } catch { /* ignore */ }
  }
  // Belt-and-suspenders: kill any straggler launched from this binary.
  spawnSync('pkill', ['-f', bin]);
}
process.on('SIGINT', () => { teardown(); process.exit(130); });
process.on('SIGTERM', () => { teardown(); process.exit(143); });

let code = 1;
try {
  const healthy = await waitForHealthy();
  if (!healthy) {
    console.error(`[e2e-app] backend never became healthy on :${PORT} within ${HEALTH_TIMEOUT_MS}ms`);
    process.exit(1);
  }
  console.log('[e2e-app] backend healthy — running Playwright (app target)');

  const passthrough = process.argv.slice(2);
  const pw = spawnSync(
    'npx',
    ['playwright', 'test', '--config=playwright.app.config.ts', ...passthrough],
    { stdio: 'inherit' },
  );
  code = pw.status ?? 1;
} finally {
  teardown();
}
process.exit(code);
