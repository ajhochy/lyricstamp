# Project State — ableset-lyrics-sync

_Last updated: 2026-06-02_

## Current focus
Electron wrapper implemented. Ready for code signing setup and PR review.

## Active branch / PR
- Branch: `issue-1-electron-wrapper`
- PR: not yet opened (manual merge required)

## Recently completed
- Initial app built: client (Vite/React) + server (Node.js HTTP/WS/OSC) fully functional in dev mode
- Brainstorming + design approved for Electron wrapper using electron-vite (Option A)
- **Issue 1 complete**: Electron wrapper (electron-vite + electron-builder) implemented
  - `server/src/index.ts` refactored to export `start()` function
  - `electron/main.ts` created
  - `electron.vite.config.ts` created at repo root
  - `package.json` updated with `"main"`, new scripts, and electron-builder build config
  - `npm run electron:build` produces `out/main/main.js` + `out/renderer/`

## In progress
- Nothing; awaiting PR review and manual merge

## Risks
- `"type": "module"` in package.json handled correctly — electron-vite outputs `.cjs`-compatible bundles for main
- Code signing requires an Apple Developer ID Application certificate
- `(!) preload config is missing` is a non-fatal electron-vite warning; no preload needed
- `electron:dist` (DMG packaging) not validated in CI — requires Xcode CLI tools

## Test status
- Unit tests: 56 passing (`npm test`)
- TypeScript: passing (`npm run typecheck`)
- `electron:build`: passing
- No CI configured

## Next step
Open PR from `issue-1-electron-wrapper` → `main` for manual review
