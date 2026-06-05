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
Tests live in `server/src/*.test.ts`. Currently covers: `als-writer`, `chordpro`, `zip-packer`, `session-store`.

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
- Ableton Live connection (requires Ableton + AbletonOSC installed)
- Space/arrow key stamping (requires live Ableton session)
- `.als` export opens correctly in Ableton Live 12 (cross-version: Live 11 compat unverified)
- Leadsheet `.zip` export opens correctly in AbleSet iPad app
- Packaged `.app` / DMG: Electron window loads UI without "Not found" error (production static-serving path)

## CI status
No GitHub Actions configured. All checks run locally.
