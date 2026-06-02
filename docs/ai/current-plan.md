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
