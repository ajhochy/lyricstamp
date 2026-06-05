# Current Plan — ableset-lyrics-sync

_Updated: 2026-06-02_

## Goal
Wrap the existing Vite/React + Node.js app in Electron (using electron-vite) so it ships as a standalone macOS `.app` that can be code-signed and shared with a small team, with no requirement to run `npm run dev` manually.

## Non-goals
- Auto-updater (out of scope for now)
- Windows / Linux support (app is macOS-only)
- Notarization for public App Store distribution (team distribution only)

## Constraints
- Must preserve the existing dev workflow (`npm run dev` still works)
- `"type": "module"` in package.json — electron-vite will output `.cjs` for main process
- Distribution target: Apple Developer ID Application certificate (code signing)

## Approach chosen
**Option A: electron-vite**
- Bundles main process + renderer with Vite
- Main process imports and calls `start()` from the server
- In production: server also serves built client as static files; BrowserWindow loads `http://127.0.0.1:7878`
- In dev: BrowserWindow loads `http://localhost:3000` (existing Vite dev server)
- `electron-builder` handles packaging + code signing

## Phases / issues

### Issue 1: Electron wrapper
- Refactor `server/src/index.ts` to export `start()`; add static file serving in production
- Add `electron/main.ts` (main process)
- Add `electron.vite.config.ts` (replaces client Vite config for builds)
- Update `package.json`: `main` field, new scripts, `build` config for electron-builder
- Add `electron`, `electron-vite`, `electron-builder` as devDependencies

## Validation plan
1. `npm run typecheck` — no TS errors
2. `npm test` — existing unit tests pass
3. `npm run electron:dev` — app opens as Electron window
4. `npm run electron:dist` — `.app` builds without error
5. Manual smoke: app launches, connects to Ableton, stamps work, export works

---

# Follow-on (stacked on PR #25) — Server-side session storage

_Added: 2026-06-05_

## Problem
Named sessions are stored in browser **IndexedDB**, partitioned **per renderer origin**. Dev renders
from `http://localhost:3000`, the packaged app from `http://127.0.0.1:7878` ([electron/main.ts:61](../../electron/main.ts)),
so sessions saved in dev are invisible in the packaged app. A user has two real sessions
("Great Things", "Holy Spirit Living Breath of God - Leadsheet" + a 1.7 MB PDF) stranded under
`localhost:3000`.

## Goal
Make named sessions **origin-independent** (identical in dev & packaged) and **migrate** the user's
existing `localhost:3000` IndexedDB sessions into the new store, non-destructively.

## Non-goals
- Working-session auto-restore PDF (`pdf-store.ts`, IndexedDB `kv`) stays as-is — transient state, follow-up.
- No cloud/remote storage. Local filesystem only.

## Approach — server-side filesystem store
Both servers (dev `tsx` process; packaged in-Electron process) resolve to **one shared on-disk dir**,
so origin no longer matters.

### Data dir resolution (server)
`ABLESET_DATA_DIR` (tests) → `ELECTRON_USER_DATA` (set by Electron main) → derived Electron
`userData` by app name `ableset-lyrics-sync` (macOS `~/Library/Application Support/ableset-lyrics-sync`).
Sessions in `<dataDir>/sessions-data/` (distinct from the `IndexedDB/` folders):
- `<id>.json` → `{ id, name, savedAt, hasPdf, state }`
- `<id>.pdf`  → raw bytes (only when hasPdf)

### Server API (routes.ts; add path-param dispatch)
- `GET /api/sessions` → `SessionMeta[]` (newest first)
- `GET /api/sessions/:id` → `{ meta, state, hasPdf }`
- `GET /api/sessions/:id/pdf` → raw `application/pdf` (404 if none)
- `PUT /api/sessions/:id` → save; body `{ name, savedAt, state, pdf?: base64, pdfName?, pdfType? }`
- `DELETE /api/sessions/:id` → delete json + pdf

### Client refactor (`client/src/session-store.ts`)
Keep the **exact same exports** so `app.tsx` is unchanged; reimplement bodies with `fetch()`. PDF
round-trips via the `/pdf` endpoint.

### Migration (one-time, origin-side)
- `client/src/legacy-idb-sessions.ts` — preserve current IndexedDB readers.
- `client/src/migrate-sessions.ts` — `runSessionMigration()`: guarded by `localStorage['ableset-sync.migrated-v1']`;
  reads legacy IDB sessions, `saveSession()` each to server (preserve id/name/savedAt/pdf), set flag.
  Idempotent (server overwrite by id).
- `app.tsx` calls it once on mount.
- **Migrate real data:** launch dev mode once (origin `localhost:3000`) so it reads that IDB and pushes to the shared store.

### Test isolation
Playwright configs set `ABLESET_DATA_DIR` to a temp dir in `webServer.env`.

## Acceptance criteria (contract)
1. `GET /api/sessions` → `[]` on empty data dir.
2. `PUT /api/sessions/:id` then `GET /api/sessions` → one matching meta.
3. PDF round-trips: `GET /api/sessions/:id/pdf` returns identical bytes; name/type preserved.
4. `DELETE` removes json + pdf; list omits it.
5. A second server pointed at the same `ABLESET_DATA_DIR` reads the first's sessions.
6. E2E: save a named session in the UI, reload, it appears in the Sessions list.
7. Migration idempotent: twice → each legacy session imported once.

## Files
- NEW `server/src/session-store.ts`, `server/src/session-store.test.ts`
- EDIT `server/src/routes.ts`
- EDIT `electron/main.ts` (`ELECTRON_USER_DATA`)
- REWRITE `client/src/session-store.ts` (same exports, API-backed)
- NEW `client/src/legacy-idb-sessions.ts`, `client/src/migrate-sessions.ts`
- EDIT `client/src/app.tsx`
- NEW `e2e/tests/session-persistence.spec.ts`
- EDIT `playwright.config.ts`, `playwright.dev.config.ts`

## Validation
`npm run typecheck && npm run lint && npm test` (incl. new `session-store.test.ts`); `npm run test:e2e`
and `npm run test:e2e:build`; manual migration via one dev-mode launch.

## Checklist (host has no TodoWrite — tracked here)
- [x] Plan + acceptance criteria
- [x] Contract tests authored (failing on unmodified code)
- [x] Implementation (coding-agent)
- [x] verification-gate PASS (typecheck, lint, 63 unit, build, 17 e2e build target, 17 e2e packaged)
- [x] Migrate user's real sessions (dev-mode launch) — 5 sessions + PDFs; packaged app confirmed
- [x] project-state-updater + decisions.md
- [ ] Commit → push → CI watch → PR #25 handoff (manual merge)
