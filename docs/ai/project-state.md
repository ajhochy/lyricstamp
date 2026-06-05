# Project State — ableset-lyrics-sync

_Last updated: 2026-06-05_

## Current focus
Server-side session storage implemented, verified (verification-gate PASS 2026-06-05), and the user's real sessions migrated. All working-tree changes uncommitted — ready to commit and open draft PR.

## Active branch / PR
- Branch: `issue-1-electron-wrapper`
- PR: not yet opened (manual merge required)

## Recently completed
- Initial app built: client (Vite/React) + server (Node.js HTTP/WS/OSC) fully functional in dev mode
- Brainstorming + design approved for Electron wrapper using electron-vite (Option A)
- **Issue 1**: Electron wrapper (electron-vite + electron-builder) implemented
- **Static serving fix**: `server/src/routes.ts` + `server/src/index.ts` + `electron/main.ts` — production Electron window now loads React UI correctly from `http://127.0.0.1:7878` by serving `out/renderer/` as static files
- **Issue #26**: .als export compatible with Live 12 — MinorVersion/Creator patched in `als-writer.ts`
- **Issue #27**: ChordPro chords preserved inline (`[G]Amazing grace`) — `chordpro.ts` keeps `item.chords` + `item.lyrics` concatenated
- **Issue #28**: Stamp preview UX relabelled — "NEXT TO STAMP →" label with `next-up` CSS class
- **Playwright E2E suite**: tests in `e2e/tests/verification.spec.ts`, `e2e/tests/stamp-workflow.spec.ts`, `e2e/tests/session-persistence.spec.ts`
- **.gitignore**: Ableton project folders, `test-results/`, `playwright-report/`, template backups excluded
- **Server-side session storage** (2026-06-05): Named sessions moved from origin-partitioned IndexedDB to server filesystem store; one-time migration preserves legacy data; all E2E tests pass — see `docs/ai/decisions.md` (2026-06-05 entry)
- **Real-data migration run** (2026-06-05): launched `electron:dev` once (origin `localhost:3000`) → `runSessionMigration()` imported **5 legacy sessions** (Great Things, Holy Spirit Living Breath of God - Leadsheet, 3× Christ Be Magnified - E), all with PDFs, into `~/Library/Application Support/ableset-lyrics-sync/sessions-data/`. Verified the **packaged `.app`** lists all 5 via `GET /api/sessions` and a PDF round-trips (317 KB, 3-page PDF). IndexedDB backed up to `~/Desktop/ableset-sessions-backup-*` (non-destructive).

## In progress
- Nothing — verification-gate PASS recorded 2026-06-05; awaiting commit + PR open

## Risks
- Live 12 `.als` patch may break Live 11 compatibility — needs cross-version manual smoke before shipping to Live 11 users
- `process.cwd()` used for template/static paths — requires running from repo root in standalone server mode
- CI: `.github/workflows/ci.yml` + `release-electron.yml` exist; push to the branch triggers CI (watch with `gh run watch`). The `release-electron` signing/notarization pipeline is separate and untouched by this change.
- Migration runs origin-side on app mount, guarded by `localStorage['ableset-sync.migrated-v1']` per origin. The user's `localhost:3000` data is now migrated; a packaged-origin (`127.0.0.1:7878`) launch has no legacy IndexedDB so it no-ops correctly. The working-session auto-restore PDF (`pdf-store.ts`, IndexedDB `kv`) is still origin-bound — tracked as a follow-up, out of scope here.

## Test status (verified 2026-06-05)
- Unit tests: **63 passing** (`npm test` — 4 files: als-writer, chordpro, zip-packer, session-store)
- Playwright E2E (build target): **17 passing** (`npm run test:e2e`)
- Playwright E2E (packaged `.app`, isolated data dir): **17 passing** (`npm run test:e2e:build`)
- TypeScript: passing (`npm run typecheck`)
- Lint: passing (`npm run lint`)
- Web + server build: passing (`npm run build`)
- Electron build: passing (`npm run electron:build`)
- Health probe: `GET /api/health` → `{"ok":true}`
- Sessions API smoke: `GET /api/sessions` → `[]`; `PUT` → meta; `DELETE` → `{"ok":true}`

## Next step
1. Commit all working-tree changes (see git status for file list)
2. Open/update draft PR `issue-1-electron-wrapper` → `main`
3. Manual smoke of packaged `.app` / DMG with Live 12 to confirm #26 fix end-to-end (and eyeball the 5 migrated sessions in the Sessions menu)

---

## Recent coding-agent runs

### 2026-06-05 — server-side session storage (PR #25 follow-on)
- Files modified:
  - `server/src/session-store.ts` (NEW) — filesystem-backed origin-independent session store
  - `server/src/routes.ts` (EDIT) — added GET/PUT/DELETE /api/sessions routes
  - `electron/main.ts` (EDIT) — set ELECTRON_USER_DATA unconditionally before start()
  - `client/src/session-store.ts` (REWRITE) — same exports, API-backed via fetch()
  - `client/src/legacy-idb-sessions.ts` (NEW) — read-only legacy IndexedDB reader for migration
  - `client/src/migrate-sessions.ts` (NEW) — one-time migration guard with localStorage flag
  - `client/src/app.tsx` (EDIT) — import runSessionMigration, call on mount with finally(refreshSessions)
  - `playwright.config.ts` (EDIT) — add ABLESET_DATA_DIR temp dir to webServer.env
  - `playwright.dev.config.ts` (EDIT) — add ABLESET_DATA_DIR temp dir to dev:server webServer.env
  - `scripts/e2e-app.mjs` (EDIT) — create temp data dir, pass as ABLESET_DATA_DIR env to spawned app
- Checks run: all PASS (typecheck, lint, 63 unit tests, build, electron:build, 17 E2E tests)
- Deviations from spec: none
- Concerns: `electron:build` must be run (not just `npm run build`) before `test:e2e` since the build target reads `out/renderer/` not `dist/`
