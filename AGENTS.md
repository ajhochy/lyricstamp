# AGENTS.md — ableset-lyrics-sync

## First files to read (in order)
1. `AGENTS.md` (this file)
2. `docs/ai/project-state.md`
3. `docs/ai/architecture.md`
4. `docs/ai/current-plan.md`

## Project overview
Local macOS-only desktop tool for worship music directors. Stamps lyric lines or leadsheet pages to Ableton Live playback positions, then exports an `.als` project with MIDI clips pre-positioned at those timestamps. Designed to feed into the AbleSet iPad app.

## Stack
- **Client**: Vite + React (TypeScript), port 3000 in dev
- **Server**: Node.js HTTP + WebSocket (TypeScript), port 7878
- **OSC**: AbletonOSC remote script bridges the app ↔ Ableton Live on port 11000/11001
- **Electron** (in progress): electron-vite wrapper for standalone `.app` distribution

## Data safety rules
- Do NOT commit `.env` files, secrets, or Ableton Live session data.
- Do NOT commit user-generated `.als` exports or PDF leadsheets.
- `templates/blank-stamp-track.als` is a committed binary template — do not regenerate unless explicitly needed.

## Testing rules
- Run `npm test` for unit tests (vitest).
- Run `npm run typecheck` for TypeScript checks.
- Run `npm run lint` for ESLint.
- No Playwright or E2E tests exist yet.
- Manual smoke requires Ableton Live + AbletonOSC installed — CI cannot run the full integration.

## Git / merge rules
- Never push directly to `main`.
- All work happens on feature branches.
- PR merge is always manual — do not auto-merge.
- Commit the built Electron artifacts (`.app`, `.dmg`) only if explicitly asked.

## Memory update rules
- After each completed issue, update `docs/ai/project-state.md`.
- Add dated entries to `docs/ai/decisions.md` for non-obvious architecture choices.
