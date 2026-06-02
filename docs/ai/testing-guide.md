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
Tests live in `server/src/*.test.ts`. Currently covers: `als-writer`, `chordpro`, `zip-packer`.

### Build (web)
```bash
npm run build
```

### Build (Electron — after Electron wrapper is added)
```bash
npm run electron:build   # bundle only
npm run electron:dist    # package .app / .dmg
```

## Manual-only checks
- Ableton Live connection (requires Ableton + AbletonOSC installed)
- Space/arrow key stamping (requires live Ableton session)
- `.als` export opens correctly in Ableton Live
- Leadsheet `.zip` export opens correctly in Live

## CI status
No GitHub Actions configured. All checks run locally.
