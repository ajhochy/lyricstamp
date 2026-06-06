# Testing Guide — ableset-lyrics-sync

## Setup assumptions
- Node.js 18+ installed
- `npm install` run at repo root
- `npm run generate-template` run once (builds `templates/blank-stamp-track.als`)

## Commands

### Typecheck
```bash
npm run typecheck
```

### Lint
```bash
npm run lint
```

### Unit tests
```bash
npm test
# or
npx vitest run --passWithNoTests
```
Tests live in `server/src/*.test.ts` and `scripts/*.test.mjs`. Currently covers: `als-writer`, `chordpro`, `zip-packer`, `session-store`, `osc-client`, `routes`, `install-remote-script`.

### E2E / integration tests (Playwright)
```bash
npm run test:e2e
```
Tests live in `e2e/tests/`. Config: `playwright.config.ts` at repo root.
- `verification.spec.ts`: #26 .als Live 12 compatibility, #27 ChordPro chord preservation, #28 stamp UX labels, app health + static serving
- `stamp-workflow.spec.ts`: end-to-end lyric stamp workflow
- `session-persistence.spec.ts`: server-backed sessions (save, reload, GET /api/sessions)

**Important**: The build-target E2E runner reads `out/renderer/` (not `dist/`). Run `npm run electron:build` before `npm run test:e2e` when client source has changed; `npm run build` alone does NOT update `out/renderer/`.

Each E2E run gets a throwaway `ABLESET_DATA_DIR` temp dir — user's real sessions are never touched.

Requires no browser install — runs against the live Node server on `:7878` (auto-started by Playwright).

### Build (web)
```bash
npm run build
```

### Build (Electron)
```bash
npm run electron:build   # bundle only (out/main + out/renderer)
npm run electron:dist    # package .app / .dmg (runs electron:build first)
```

## Manual-only checks

Full manual smoke checklist: **`docs/testing/manual-smoke.md`**

High-level summary:
- `npm run install:remote-script` — installs `vendor/AbletonOSC/` to Ableton's remote scripts directory; requires Ableton Live on macOS
- Ableton Live connection (requires Ableton + AbletonOSC installed and loaded)
- Handler-presence probe: app must show no "Remote script not loaded" banner after connecting
- Space/arrow key stamping + "Apply to Ableton" button: verify clips appear in Arrangement with correct names and beat positions
- AbleSet iPad app reads live-placed clips identically to `.als`-generated clips
- Handler-absent banner appears when unpatched (stock) AbletonOSC is loaded
- `.als` export opens correctly in Ableton Live 12 (cross-version: Live 11 compat unverified)
- Leadsheet `.zip` export opens correctly in AbleSet iPad app
- Packaged `.app` / DMG: Electron window loads UI without "Not found" error (production static-serving path)

## Notarization

Local `electron:dist` skips notarization (no Apple credentials) — the `afterSign` hook logs
`[notarize] no credentials in env — skipping notarization (local build)` and exits cleanly.

Notarization runs in CI on version-tag pushes (`release-electron.yml`). See
**`docs/release-notarization.md`** for the 5 required GitHub secrets and how to trigger a release.

## CI status
No GitHub Actions configured. All checks run locally.

## Public user guide + download Worker (`docs/manual/`, `worker/`, `wrangler.jsonc`)

The static LyricStamp user guide lives in `docs/manual/index.html` (self-contained HTML/CSS/JS,
mirrors the Rhythm / Statement Automator guide pattern) with `app-icon.png` and real app
screenshots under `docs/manual/screenshots/`. A Cloudflare Worker (`worker/staff-guide.js`,
deployed via `wrangler.jsonc` as `lyricstamp-guide`) serves the static assets and a
`/download/mac` route that resolves the latest GitHub release `.dmg`. **This site is PUBLIC —
no Cloudflare Access** (LyricStamp is local-only with no cloud data).

### Regenerate screenshots
```bash
node scripts/capture-manual-screenshots.mjs
```
Spawns the dev server (`dev:server` + Vite on 127.0.0.1:3000) against an isolated temp data
dir, drives the app with Playwright's bundled Chromium, and writes the six manual screenshots
(lyrics view, ChordPro setup, stamp log, sessions menu, track picker, leadsheet). No Ableton
required — every captured view renders without an OSC connection.

### Preview / verify the manual locally
```bash
# Static render (no Worker): any static server pointed at docs/manual
npx serve docs/manual    # then open the printed URL

# Full Worker (download route) — needs Cloudflare wrangler + auth:
npx wrangler dev         # serves the guide + /download/mac locally
curl -i http://localhost:8787/             # 200, HTML guide
curl -i http://localhost:8787/download/mac # 302 to a GitHub release asset (or text error)
```
Manual render checklist (what a render check should confirm): page loads with no console
errors; every `<img>` has `naturalWidth > 0`; exactly one link with `href="/download/mac"`;
layout holds at mobile (~390px) and desktop (~1280px) widths.

### Download token (`GITHUB_WORKER_TOKEN`)
The Worker uses the **same** read-only, Contents-scoped fine-grained GitHub token the Rhythm and
Statement Automator guides use. It is **optional** here: if unset, the Worker falls back to the
public GitHub Releases API. Cloudflare does not expose secret *values* for copying, so to reuse
the existing token value on this Worker, set it explicitly (never commit it):
```bash
printf '%s' "$GITHUB_WORKER_TOKEN" | npx wrangler secret put GITHUB_WORKER_TOKEN --name lyricstamp-guide
```
The Worker tolerates both the legacy `AbleSet.Sync-<ver>-arm64.dmg` asset name and future
`LyricStamp-*.dmg` names, preferring universal > arm64 > any `.dmg`.
