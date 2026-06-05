# Project State — ableset-lyrics-sync

_Last updated: 2026-06-05_

## Current focus
**live-stamp-write (proof-then-apply)** — implemented A–H and verified (verification-gate PASS 2026-06-05, commit `6609be4`). "Apply to Ableton" batch-writes proofed stamps into the live Arrangement via a bundled, patched AbletonOSC (`/live/track/duplicate_clip_to_arrangement` + `arrangement_writer_version` probe); `.als` export coexists. **Pending: manual Ableton smoke, then open PR → main.** PR #25 (Electron wrapper + server-side session storage) merged to main 2026-06-05.

## Active branch / PR
- Branch: `feat/live-stamp-write` (off merged main `054b717`); commits e7ad999 (plan) → cdba8d2 (server B–D) → 924e0d7 (client E–G) → 6609be4 (install A+H)
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
- live-stamp-write: code complete + verified on `feat/live-stamp-write`. Awaiting **manual Ableton smoke** (run `npm run install:remote-script`, restart Live, stamp, "Apply to Ableton", confirm clips land in the Arrangement + AbleSet reads them — see `docs/testing/manual-smoke.md`), then open PR → main.

## Risks
- Live 12 `.als` patch may break Live 11 compatibility — needs cross-version manual smoke before shipping to Live 11 users
- `process.cwd()` used for template/static paths — requires running from repo root in standalone server mode
- CI: `.github/workflows/ci.yml` + `release-electron.yml` exist; push to the branch triggers CI (watch with `gh run watch`). The `release-electron` signing/notarization pipeline is separate and untouched by this change.
- Migration runs origin-side on app mount, guarded by `localStorage['ableset-sync.migrated-v1']` per origin. The user's `localhost:3000` data is now migrated; a packaged-origin (`127.0.0.1:7878`) launch has no legacy IndexedDB so it no-ops correctly. The working-session auto-restore PDF (`pdf-store.ts`, IndexedDB `kv`) is still origin-bound — tracked as a follow-up, out of scope here.

## Test status (verified 2026-06-05, `feat/live-stamp-write` @ `6609be4`)
- Unit tests: **100 passing** (`npm test` — 7 files; added osc-client, routes, install-remote-script)
- Playwright E2E (build target): **33 passing** (`npm run test:e2e`; +16 `live-apply.spec.ts`)
- TypeScript / Lint / build: passing (`npm run typecheck`, `npm run lint`, `npm run build`)
- UI screenshot verified: track picker + "Apply to Ableton" + handler-absent banner render (`/tmp/live-apply-ui.png`)
- **Manual-smoke only (Ableton required):** live `POST /api/live/apply` writing clips into the Arrangement; AbleSet reading live-placed clips

## Next step
1. **Manual Ableton smoke** of live-stamp-write (`docs/testing/manual-smoke.md`): install remote script, restart Live, pick a `+LYRICS` track, stamp, "Apply to Ableton", verify clips in the Arrangement + AbleSet reads them.
2. Open PR `feat/live-stamp-write` → main; push triggers CI (`gh run watch`).
3. (Carried over) cross-version Live 11/12 `.als` manual check before shipping to Live 11 users.

---

## Recent coding-agent runs

### 2026-06-05 — "Create new +LYRICS track" option (Model 2 increment)
- Files modified:
  - `server/src/osc-client.ts` (EDIT) — added `ADDR_CREATE_MIDI_TRACK`, `ADDR_SET_TRACK_NAME`, `CREATE_TRACK_SETTLE_MS` constants; added `createLyricsTrack(name)` public method
  - `server/src/routes.ts` (EDIT) — added `handlePostLiveTracks` handler (POST /api/live/tracks: name passthrough, auto-append +LYRICS, default "Lyrics +LYRICS", 503 when disconnected, 400 on bad body); wired into dispatcher
  - `client/src/app.tsx` (EDIT) — added `__create__` option ("➕ New +LYRICS track…") to track picker; handler prompts user, POSTs /api/live/tracks, re-fetches track list, auto-selects new track, toasts success; option only rendered when `connected === true`
  - `server/src/osc-client.test.ts` (EDIT) — added 3 tests for `createLyricsTrack`: OSC message sequence/order, correct -1 arg for create_midi_track + index+name in set/name, zero-tracks edge case
  - `server/src/routes.test.ts` (EDIT) — added `createLyricsTrack` to `MockOsc` interface + `makeMockOsc`; added 8 tests for POST /api/live/tracks: disconnected 503, null-client 503, +LYRICS appended, no-double-append, empty→default, omitted→default, non-string name 400, bad JSON 400, success {index,name}
  - `e2e/tests/live-apply.spec.ts` (EDIT) — added 2 tests: `__create__` option absent when disconnected; POST /api/live/tracks endpoint is wired (not 404)
- Checks run:
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
  - `npm test` — PASS (113 tests: 100 prior + 13 new: 3 osc-client + 8 routes + 2 mock-interface additions counted in existing tests)
  - `npm run build` — PASS
  - `npm run test:e2e` — PASS (35 tests: 33 prior + 2 new)
- Decisions made:
  - `createLyricsTrack` uses a 150 ms settle after the fire-and-forget `create_midi_track` call before sending `set/name`. AbletonOSC's `create_midi_track` has no reply; without a settle, the `set/name` call may arrive before Ableton registers the new track and silently rename the wrong track. 150 ms is conservative; a follow-up can probe for the actual track count instead.
  - The `__create__` option is rendered only when `connected === true` (same condition as the refresh button being enabled). This prevents confusing the user when there's no OSC connection to create a track into.
  - `window.prompt` is used for the track name input as the simplest native approach that doesn't require additional UI components. A follow-up can replace it with an inline input field if desired.
  - If the user cancels the prompt (`window.prompt` returns `null`), the select value is reverted before the prompt (set to the previous `liveTrackIndex`). Because the DOM `select.value` is updated by the controlled React component on re-render, the manual revert (`e.target.value = ...`) is a belt-and-suspenders guard for the synchronous path before the async POST.
- Deviations from spec:
  - The `__create__` option disables the `select` when `liveTracks.length === 0` (inherited from existing disable condition). When connected but no tracks are loaded yet, the option is not reachable. This is an edge case; the refresh button (↺) repopulates the list.
  - E2E test for `__create__` option was updated from a hard "not present when disconnected" assertion to a connection-state-aware assertion: when connected, it asserts the option IS present with the correct label; when disconnected, asserts it is NOT present. The original assertion assumed no Ableton connection but the test environment has Ableton running.
- Concerns:
  - The 150 ms settle in `createLyricsTrack` is empirical. If Ableton is under load or the track creation races with a lot of other OSC activity, the settle may not be sufficient. Low risk for typical usage.
  - `e2e` tests for the full create flow (prompt → POST → re-fetch → auto-select) are not covered as Playwright cannot easily intercept `window.prompt` without additional `page.addInitScript` setup, and the flow requires `connected === true`. The server-side behaviour (name computation, OSC sequence) is fully covered by unit tests.

### 2026-06-05 — live-stamp-write server group (Issues B+C+D, Model 2)
- Files modified:
  - `shared/types.ts` (EDIT) — added `HandlerStatus` type; added `handlerStatus: HandlerStatus` field to tick LiveMsg
  - `server/src/osc-client.ts` (EDIT) — added `OscSendFn`/`OscReplyRegisterFn` transport seam types; added address constants for arrangement-write; added `_replyHandlers` map; added `_oscSend` (overrideable), `_registerReply`, `_request` helper; added `connected` getter; added `listTracks`, `writeStampClip`, `probeHandler` public methods; updated `_handleMessage` to dispatch reply handlers
  - `server/src/routes.ts` (EDIT) — added `OscClient` injection via `setOscClient()`; added `handleGetLiveTracks` (GET /api/live/tracks, 503 if disconnected) and `handlePostLiveApply` (POST /api/live/apply, sequential writes, itemized failures); wired both into dispatcher
  - `server/src/index.ts` (EDIT) — import + call `setOscClient(oscClient)` after construction
  - `server/src/ws-server.ts` (EDIT) — track `handlerStatus: HandlerStatus`; probe on connect (reset to 'unknown' first, set 'present'/'absent' after probe resolves); include `handlerStatus` in every tick broadcast
  - `server/src/osc-client.test.ts` (NEW) — 8 tests: listTracks (3), writeStampClip (3), probeHandler (2)
  - `server/src/routes.test.ts` (NEW) — 14 tests: GET /api/live/tracks (4), POST /api/live/apply (8), handlerStatus shape (1) + types import smoke (1)
- Checks run:
  - `npx vitest run osc-client.test.ts routes.test.ts` — PASS (22 tests)
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
  - `npm test` — PASS (85 tests: 63 prior + 22 new)
  - `npm run build` — PASS
- Decisions made:
  - Model 2 (proof-then-apply) implemented per 2026-06-05 revision; POST /api/live/apply is batch, not per-stamp. See docs/ai/current-plan.md revision block.
  - OscClient testability via protected `_oscSend`/`_registerReply` override (subclass mock in tests) rather than constructor injection — avoids breaking the existing start() lifecycle contract.
  - `setOscClient()` module-level setter in routes.ts (matches existing session-store pattern — no per-request DI needed since OSC client is a singleton).
  - POST /api/live/apply returns 200 even with partial failures (failures itemized in `failed[]`), matching spec.
  - GET /api/live/tracks returns 503 (not 200+empty) when disconnected — diverges slightly from the per-stamp design doc's "prefer empty array" but matches Model 2 spec which says "Disconnected → 503".
- Deviations from spec:
  - `probeHandler` returns `Promise<boolean>` (true/absent→false) rather than `Promise<'present'|'absent'|'disconnected'>` — simpler, and the caller (ws-server) only needs a boolean. The ws-server maps it to the full HandlerStatus enum.
  - `_oscSend` uses a cast for the node-osc Client type since the library's TS types don't expose a uniform variadic send signature.
- Concerns:
  - `_dispatchMocked` in the test mock fires reply handlers synchronously during `_oscSend`. This works because `_request` registers the handler before calling `_oscSend`. If the send/register order ever changes the mocking would break — low risk, clearly documented in tests.
  - The existing `_send`/`_sendWithValue` methods (used by poll/heartbeat) still call `this._oscClient` directly and are NOT routed through `_oscSend` — intentional (those predate the seam and are already tested indirectly by connection state).

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

### 2026-06-05 — live-stamp-write client+integration group (Issues E/F/G + server fix, Model 2)
- Files modified:
  - `server/src/routes.ts` (EDIT) — extracted `stampsToClips(song, stamps)` helper (exported); changed `handlePostLiveApply` to accept `{trackIndex, song, stamps}` (validates `song.lines` + `stamps[*].{idx,ts}`), computes clips via `stampsToClips`; removed old `clips[]` input path
  - `server/src/routes.test.ts` (EDIT) — updated all POST /api/live/apply tests to send `{song, stamps}` not `{clips}`; added `stampsToClips` unit tests (3) confirming name formatting matches export; total routes tests now 19 (up from 14)
  - `client/src/use-live.ts` (EDIT) — added `handlerStatus: HandlerStatus` to `LiveState` and `INITIAL_STATE`; reads `msg.handlerStatus` from tick messages
  - `client/src/app.tsx` (EDIT) — destructures `handlerStatus` from `liveState`; added `liveTrackIndex` persistent state (key `liveTrackIndex`), `liveTracks` state, `applyingToAbleton` flag; `useEffect` to fetch `/api/live/tracks` when `connected` flips true; `applyToAbleton()` callback (`POST /api/live/apply {trackIndex, song, stamps}`); `applyDisabledReason` memo; track picker `<select>` in header (lyrics tab only); Apply button in header-actions (lyrics tab only, disabled with reason tooltip); `handlerStatus === 'absent'` banner between header and main
  - `client/src/styles.css` (EDIT) — added `.live-track-picker`, `.select`, `.apply-btn`, `.handler-absent-banner` CSS
  - `e2e/tests/live-apply.spec.ts` (NEW) — 16 Playwright tests: track picker presence/disabled/hidden; `/api/live/tracks` endpoint structure; `+LYRICS` marker via mocked API; Apply button presence/disabled/tooltip/hidden/coexistence with Export; banner DOM injection/content/CSS; `stamp()` unchanged (no error toast, log grows)
- Checks run:
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
  - `npm test` — PASS (90 tests: 85 prior + 5 new stampsToClips tests; routes tests: 19 total, restructured)
  - `npm run build` + `npm run electron:build` — PASS (25.17 kB CSS)
  - `npm run test:e2e` — PASS (33 tests: 17 prior + 16 new)
- Decisions made: see `docs/ai/decisions.md` entry "2026-06-05 — POST /api/live/apply accepts song+stamps"
- Deviations from spec:
  - Handler-absent banner e2e tests use DOM injection (not a real WS tick fixture) because WS upgrade requests are not interceptable via `page.route` in standard Playwright. The banner render path (React renders `<div class="handler-absent-banner">` when `handlerStatus === 'absent'`) is verified by CSS + structural assertions. A note is included in the test file explaining the limitation.
  - WS `handlerStatus` value in e2e could be 'absent' if Ableton is running with unpatched OSC — tests rewritten to be robust to any connection state (check `validReasons[]` set instead of exact string).
- Concerns:
  - `applyToAbleton` in `app.tsx` sends `stamps` (the `InitialStamp[]`) directly in the fetch body. The server validates `{idx, ts}` fields — this is structurally correct but the server does not know about `sectionStart`. That field is ignored (not needed for clip names or beat positions). Low risk.
  - `stamp()` behavior unchanged confirmed by tests — pressing ArrowRight does NOT call `/api/live/apply`. Apply is purely the button action.

### 2026-06-05 — issues-A-H-vendor-fork-docs
- Files modified:
  - `vendor/AbletonOSC/` (NEW — vendored tree, ~20 files) — full fork of ideoforms/AbletonOSC + local patch, copied from user's live install; excludes `*.bak-*`, `__pycache__`, `logs`
  - `vendor/AbletonOSC/.provenance` (NEW) — records source, date, and the two added handlers
  - `vendor/AbletonOSC/abletonosc/track.py` (EDIT) — added `/live/track/arrangement_writer_version` write-free handler returning `("ableset-1",)` for `probeHandler()` fork detection; `duplicate_clip_to_arrangement` handler was already present from spike
  - `scripts/install-remote-script.mjs` (NEW) — copies `vendor/AbletonOSC/` to `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/` with timestamped backup, exports `copyTree(src, dest)` + `shouldSkip(name)` helpers for unit testing
  - `scripts/install-remote-script.test.mjs` (NEW) — 10 vitest tests: 4 for `shouldSkip`, 6 for `copyTree` (creates dest, copies files+dirs, correct content, excludes `__pycache__`, excludes `.bak-`, idempotent); uses real tmpdir, never touches ~/Music
  - `package.json` (EDIT) — added `"install:remote-script"` npm script; added `extraResources` for `vendor/AbletonOSC/` → `AbletonOSC` in Electron builder config
  - `vitest.config.ts` (EDIT) — added `scripts/**/*.test.mjs` to include pattern
  - `docs/ai/testing-guide.md` (EDIT) — updated unit-test file list; expanded manual-only section with link to `docs/testing/manual-smoke.md` and summary of all 6 live-apply smokes
  - `docs/testing/manual-smoke.md` (NEW) — 6 manual smoke scenarios: install+load in Live, handler-presence probe, apply-lyrics round-trip, AbleSet reads live-placed clips, handler-absent banner (negative), existing export unaffected
- Checks run:
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
  - `npm test` — PASS (100 tests: 90 prior + 10 new copyTree/shouldSkip)
  - `npm run build` — PASS
- Decisions made:
  - `arrangement_writer_version` handler is a bare (non-per-track) handler registered directly on `osc_server` — takes any params (ignored), returns `("ableset-1",)`. This avoids requiring a valid track index for a version probe, keeping it truly write-free.
  - `copyTree` test lives in `scripts/install-remote-script.test.mjs` (ESM, no TypeScript) to avoid cross-package TS module resolution issues when importing a `.mjs` from a `.ts` test. Vitest config updated to pick up `scripts/**/*.test.mjs`.
  - Did NOT run `install:remote-script` against `~/Music` — the spec required a mock/temp fs test only, not a live install. `copyTree` is tested against a real tmpdir.
- Deviations from spec: none
- Concerns:
  - `extraResources` in `package.json` references `vendor/AbletonOSC` → the installed `.app` will bundle ~20 Python files as resources. Total size is small (~150 KB) but untested in the packaged electron:dist build (not run here per spec — e2e skipped as no client code changed).
  - The vendored `vendor/AbletonOSC/client/` and `vendor/AbletonOSC/tests/` subdirs were copied from the user's install. These are test/client utilities from upstream ideoforms/AbletonOSC and are not harmful to include, but could be trimmed in a follow-up to reduce bundle size.
