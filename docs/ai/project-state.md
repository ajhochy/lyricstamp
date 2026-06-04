# Project State — ableset-lyrics-sync

_Last updated: 2026-06-04_

## Current focus
All smoke-identified issues fixed and verified. Changes uncommitted — ready to commit and open draft PR.

## Active branch / PR
- Branch: `issue-1-electron-wrapper`
- PR: not yet opened (manual merge required)

## Recently completed
- Initial app built: client (Vite/React) + server (Node.js HTTP/WS/OSC) fully functional in dev mode
- Brainstorming + design approved for Electron wrapper using electron-vite (Option A)
- **Issue 1**: Electron wrapper (electron-vite + electron-builder) implemented
- **Static serving fix**: `server/src/routes.ts` + `server/src/index.ts` + `electron/main.ts` — production Electron window now loads React UI correctly from `http://127.0.0.1:7878` by serving `out/renderer/` as static files
- **Issue #26**: .als export compatible with Live 12 — MinorVersion/Creator patched in `als-writer.ts` (or native Live 12 template used — see decisions.md)
- **Issue #27**: ChordPro chords preserved inline (`[G]Amazing grace`) — `chordpro.ts` keeps `item.chords` + `item.lyrics` concatenated instead of stripping chords
- **Issue #28**: Stamp preview UX relabelled — "NEXT TO STAMP →" label with `next-up` CSS class replaces ambiguous `entering` class
- **Playwright E2E suite**: 12 tests in `e2e/tests/verification.spec.ts` covering all three fixes + app health (`npm run test:e2e`)
- **.gitignore**: Ableton project folders (`*Project/`), `test-results/`, `playwright-report/`, template backups excluded

## In progress
- Nothing — verification-gate PASS recorded 2026-06-04; awaiting commit + PR open

## Risks
- Live 12 `.als` patch may break Live 11 compatibility — needs cross-version manual smoke before shipping to Live 11 users
- `process.cwd()` used for template/static paths — requires running from repo root in standalone server mode
- No CI configured — all checks run locally only

## Test status (verified 2026-06-04)
- Unit tests: **56 passing** (`npm test` — 3 files: als-writer, chordpro, zip-packer)
- Playwright E2E: **12 passing** (`npm run test:e2e`)
- TypeScript: passing (`npm run typecheck`)
- Lint: passing (`npm run lint`)
- Web + server build: passing (`npm run build`)
- Electron build: passing (`npm run electron:build`)
- Health probe: `GET /api/health` → `{"ok":true}`

## Next step
1. Commit all working-tree changes (see git status for file list)
2. Open draft PR `issue-1-electron-wrapper` → `main`
3. Manual smoke of packaged `.app` / DMG with Live 12 to confirm #26 fix end-to-end
