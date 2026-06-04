# Project State — ableset-lyrics-sync

_Last updated: 2026-06-04_

## Current focus
Issue #30 — spacebar pause in place (pause/resume without resetting playhead).

## Active branch / PR
- Branch: `issue-30-pause-playhead`
- PR: not yet opened

## Recently completed
- Issues #1/#26/#27/#28 + Electron wrapper on branch `issue-1-electron-wrapper` (PR #25, awaiting merge)

## Recent coding-agent runs

### 2026-06-04 — issue-30-pause-playhead
- Files modified:
  - `server/src/osc-client.ts` — added `ADDR_CONTINUE_PLAYING`, `ADDR_SET_SONG_TIME` constants; added `pausePlaying()` (stop + restore position via set/current_song_time), `continuePlaying()` (continue_playing OSC), and `_sendWithValue()` private helper
  - `server/src/ws-server.ts` — wired 'play' → `continuePlaying()`, 'pause' → `pausePlaying()`
- Checks run: typecheck ✓, lint ✓, 56 unit tests ✓
- Decisions made: Use `continue_playing` for resume (not `start_playing`) so timeline is not reset; on pause, immediately resend `set/current_song_time` with last-known position to counteract any reset from `stop_playing`
- Deviations from spec: none
- Concerns: `pausePlaying()` relies on `_lastTs` (last polled position, 10 Hz) — there is up to 100 ms of drift between actual stop position and restored position. Acceptable for stamping use-case.

## In progress
- Awaiting verification-gate and PR open for issue #30

## Test status
- Unit tests: 56 passing
- TypeScript: passing
- Lint: passing
- Manual smoke needed: pause mid-song in Ableton → verify playhead stays put on resume
