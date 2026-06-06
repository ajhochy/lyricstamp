#!/usr/bin/env node
/**
 * capture-manual-screenshots.mjs
 *
 * Drives the LyricStamp dev app with Playwright's bundled Chromium and captures
 * the screenshots used by the public manual (docs/manual/screenshots/).
 *
 * It spawns the same two processes `npm run dev` does — the tsx server on :7878
 * and Vite on 127.0.0.1:3000 — against an isolated temp data dir so it never
 * touches real session data. No Ableton connection is required: every captured
 * view (lyrics, ChordPro setup, stamp log, leadsheet, sessions, track picker)
 * renders without OSC. The "Apply to Ableton" button is captured in its
 * disconnected/disabled state, which is exactly what a new user sees first.
 *
 * Usage:  node scripts/capture-manual-screenshots.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(repoRoot, 'docs', 'manual', 'screenshots');
const dataDir = mkdtempSync(join(tmpdir(), 'lyricstamp-shots-'));

const CHORD_PRO = `{title: Great Things}
{key: G}
{tempo: 140}

{start_of_verse}
[G]Come let us wor[D]ship our King
[Em]Come let us bow [C]at His feet
{end_of_verse}

{start_of_chorus}
[G]Oh hero of [D]Heaven You con[Em]quered the [C]grave
[G]You free every [D]captive and [Em]break every [C]chain
Oh God You have [D]done great [G]things
{end_of_chorus}`;

const procs = [];
function spawnProc(cmd, args, env) {
  const p = spawn(cmd, args, { cwd: repoRoot, env: { ...process.env, ...env }, stdio: 'inherit' });
  procs.push(p);
  return p;
}
function cleanup() {
  for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* ignore */ } }
}
async function waitFor(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  console.log(`[shots] temp data dir: ${dataDir}`);
  spawnProc('npm', ['run', 'dev:server'], { ABLESET_DATA_DIR: dataDir });
  spawnProc('npx', ['vite', '--config', 'client/vite.config.ts', '--host', '127.0.0.1', '--port', '3000'], {});

  await waitFor('http://127.0.0.1:7878/api/health', 30000);
  await waitFor('http://127.0.0.1:3000', 30000);
  console.log('[shots] dev servers up');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const shot = async (name) => {
    await page.screenshot({ path: join(outDir, name) });
    console.log(`[shots] wrote ${name}`);
  };

  await page.goto('http://127.0.0.1:3000/');
  await page.waitForSelector('.workspace', { timeout: 15000 });

  // 1. ChordPro setup expanded (before a song is loaded).
  await page.locator('.setup-header').click();
  await page.locator('.textarea').fill(CHORD_PRO);
  await shot('chordpro-setup.png');

  // Load the song, then collapse the setup panel for the clean working view.
  await page.getByRole('button', { name: /Reload song/i }).click();
  await page.waitForSelector('.lyric-current');
  await page.locator('.setup-header').click();

  // 2. Stamp a few lines so the log + preview have real content.
  await page.locator('.lyric-current').click();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); }
  await page.waitForTimeout(300);
  await shot('lyrics-view.png');

  // 3. Stamp log close-up.
  const log = page.locator('.log-panel, .stamp-log, aside').first();
  try { await log.screenshot({ path: join(outDir, 'stamp-log.png') }); console.log('[shots] wrote stamp-log.png'); }
  catch { await shot('stamp-log.png'); }

  // 4. Sessions menu open.
  const sessionsBtn = page.getByRole('button', { name: /^Sessions/ });
  await sessionsBtn.click();
  await page.waitForSelector('.sessions-menu');
  await shot('sessions-menu.png');
  // Toggle the menu closed again (it's a button toggle) so it doesn't overlap
  // the next shots.
  await sessionsBtn.click();
  await page.waitForSelector('.sessions-menu', { state: 'detached' });

  // 5. Track picker + Apply to Ableton (disconnected state — what a new user sees).
  try {
    await page.locator('.live-track-picker, .apply-btn').first().waitFor({ timeout: 2000 });
    await shot('track-picker.png');
  } catch { console.log('[shots] track picker not visible (skipped track-picker.png)'); }

  // 6. Leadsheet tab (empty PDF drop state).
  await page.getByRole('button', { name: /^Leadsheet$/ }).click();
  await page.waitForTimeout(400);
  await shot('leadsheet.png');

  await browser.close();
  console.log('[shots] done');
}

main()
  .then(() => { cleanup(); process.exit(0); })
  .catch((err) => { console.error('[shots] FAILED:', err); cleanup(); process.exit(1); });
