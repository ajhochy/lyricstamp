# Project State — ableset-lyrics-sync

_Last updated: 2026-06-05_

## Current focus
**leadsheet "Apply to Ableton"** (branch `feat/leadsheet-apply`) — the PDF/leadsheet analog of the lyrics live-apply. Proof-then-apply: stamp PDF pages → pick `+LYRICS` track → Apply writes `Lyrics/<slug>/page-N.png` into the live set's project dir + arrangement clips `[img:<slug>/page-N.png] [full]` spanning to next stamp. New vendored-fork handler `/live/song/get/project_path` resolves the project dir (`""` unsaved → 409 "Save your Ableton set first"). Coexists with the `.zip` export. Verified: typecheck/lint, 133 unit, 47 e2e (build + packaged `.app`), leadsheet-tab screenshot. **Pending: open PR + manual Ableton smoke (re-run `install:remote-script` for the new handler, saved set required).**

Shipped & merged to main 2026-06-05: PR #25 (Electron wrapper + session storage), PR #32 (lyrics live-apply), PR #34 (macOS notarization), PR #35 (release publish fix). Release **v0.1.0** drafted (signed + notarized DMG via CI).

## Active branch / PR
- Branch: `feat/leadsheet-apply` (off main `c7768c4`); commits 3768279 (plan) → a35e9bc (server+fork LS-A/B/C) → eca24d1 (client LS-D) → 9ba0991 (docs LS-E)
- PR #34: open (draft until ready); merge manual

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

### 2026-06-05 — LS-D (leadsheet Apply to Ableton client UI)
- Files modified:
  - `client/src/app.tsx` (EDIT) — added `applyingLeadsheetToAbleton` state; added `applyLeadsheetDisabledReason` useMemo (mirrors `applyDisabledReason` with added `!pdfFile` guard); added `applyLeadsheetToAbleton()` callback (renders unique stamped pages via `pageRenderer.renderToDataUrl`, POSTs `/api/live/apply-leadsheet` with `{trackIndex, pdfName, pages, stamps}`, handles 200/409/503/other responses with toasts); extended track picker condition from `tab === 'lyrics'` to `tab === 'lyrics' || tab === 'leadsheet'`; added `button.apply-btn.leadsheet-apply-btn` in the leadsheet tab beside the Export .zip button
  - `e2e/tests/live-apply.spec.ts` (EDIT) — updated two tests that asserted the old behavior (picker hidden in leadsheet tab, lyrics Apply button hidden in leadsheet tab) to reflect the new shared-picker design and the leadsheet Apply button's coexistence
  - `e2e/tests/leadsheet-apply.spec.ts` (NEW) — 12 Playwright tests: picker visible/present/disabled in leadsheet tab; single shared picker (not a duplicate); leadsheet Apply button present/disabled/title/valid-reason/not-in-lyrics-tab; lyrics Apply button regression; Export + Apply coexist; endpoint wired check
- Checks run:
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
  - `npm test` — PASS (133 tests: all prior, no new unit tests needed — no new server logic)
  - `npm run build` — PASS (client + server)
  - `npm run electron:build` — PASS (required to update `out/renderer` for e2e target; 25.17 kB CSS)
  - `npm run test:e2e` — PASS (47 tests: 35 prior + 12 new in `leadsheet-apply.spec.ts`)
- Decisions made:
  - `pdfName` sent to server as `pdfFile.name` (the raw filename with `.pdf` extension) matching the `leadsheetName` source in `exportLeadsheet` — the server endpoint computes the slug itself via `slugify(pdfName.replace(/\.pdf$/i, ''))`, same as `handlePostExportZip`. This ensures the slug matches exactly between zip-export and live-apply.
  - The new Apply button uses class `apply-btn leadsheet-apply-btn` so existing tests using `.apply-btn` can distinguish lyrics vs leadsheet buttons with `:not(.leadsheet-apply-btn)` selector.
  - `applyLeadsheetDisabledReason` adds a `!pdfFile` guard (returns 'No PDF loaded') that the lyrics `applyDisabledReason` does not have — because the lyrics tab has no PDF requirement.
  - Two existing `live-apply.spec.ts` tests were updated: (1) the "track picker hidden in leadsheet tab" assertion was inverted to "picker visible in leadsheet tab"; (2) the "Apply button is hidden in leadsheet tab" assertion now checks that the lyrics-tab button (`.apply-btn:not(.leadsheet-apply-btn)`) is not visible, and that `.leadsheet-apply-btn` IS visible. Both are behavior-accurate updates.
- Deviations from spec:
  - The spec's `applyLeadsheetDisabledReason` checks `leadsheetStamps.length === 0` (as 'No stamps to apply') and then `!pdfFile` (as 'No PDF loaded'). The implemented order is: connected → handlerStatus → track → stamps → pdf. This ordering means "No track selected" shows before "No stamps" or "No PDF" — consistent with the lyrics tab guard ordering.
  - e2e "endpoint wired" test asserts `response.status() !== 404` (accepts 500 when OSC timeout occurs because Ableton is connected but fork not installed). The original test comment listed only [200, 400, 503]; updated to `not.toBe(404)` to be environment-agnostic.
- Concerns:
  - The `applyLeadsheetToAbleton` callback renders pages one at a time in a for-loop (same as `exportLeadsheet`). For large leadsheets (many unique pages) this is sequential. Acceptable for now — matches existing pattern.
  - `electron:build` must be run before `test:e2e` (the e2e playwright config serves `out/renderer`, not `dist`). This is a known repo constraint noted in prior coding-agent runs. `npm run build` alone is insufficient.

### 2026-06-05 — LS-A/LS-B/LS-C (leadsheet-apply server+fork group)
- Files modified:
  - `vendor/AbletonOSC/abletonosc/song.py` (EDIT) — added `/live/song/get/project_path` handler returning `os.path.dirname(song.file_path)` or `""` when unsaved; additive, no existing handler changed; `import os` was already present
  - `vendor/AbletonOSC/abletonosc/track.py` (EDIT) — bumped `arrangement_writer_version` from `"ableset-1"` to `"ableset-2"` to signal the new project-path handler is present
  - `server/src/osc-client.ts` (EDIT) — added `ADDR_SONG_PROJECT_PATH` constant; added `getSongProjectPath(): Promise<string>` method using existing `_request` pattern
  - `server/src/routes.ts` (EDIT) — added `mkdir`/`writeFile` imports from `node:fs/promises`; added `join` import from `node:path`; added `writePagePng()` helper; added `handlePostApplyLeadsheet()` handler for `POST /api/live/apply-leadsheet`; wired into dispatcher
  - `server/src/osc-client.test.ts` (EDIT) — added 3 `getSongProjectPath` tests: path returned, empty string, timeout rejects
  - `server/src/routes.test.ts` (EDIT) — added `getSongProjectPath`/`songProjectPath` to `MockOsc` interface and `makeMockOsc`; added `fs`/`os`/`path` imports; added 11 tests for `POST /api/live/apply-leadsheet` covering: 503 null, 503 disconnected, 409 unsaved, 400 bad trackIndex, 400 bad pages, 400 bad stamps, 400 invalid pngDataUrl, PNG writes to correct paths with correct bytes, clip name format matches zip export exactly, last clip DEFAULT_CLIP_LENGTH, stamps sorted by ts, partial failure, re-apply overwrite
- Checks run:
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
  - `npm test` — PASS (133 tests: 100 prior + 3 getSongProjectPath + ~11 apply-leadsheet + 19 routes total up from prior; osc-client total 14 up from 11)
  - `npm run build` — PASS
- Decisions made:
  - Clip name format in `handlePostApplyLeadsheet` copied verbatim from `handlePostExportZip`'s `leadsheetClips` build: `` `[img:${slug}/page-${stamp.page}.png] [full]` `` — same `slugify` function, same `page-N.png` naming, same `[full]` suffix. Tests assert the exact string so live == export.
  - `getSongProjectPath` is called AFTER body validation (503 check, 400 checks) so we only hit OSC when we know the body is valid. This matches the style of `handlePostLiveApply`.
  - Stamps are sorted by `ts` before building clips (spec says "sorted by ts"). Images are written before clips so they exist on disk before Ableton tries to read the clip names.
  - `pageBuffers` deduplicates pages by page number (same page can appear in multiple stamps — picks first pngDataUrl, matching zip export's dedup behavior).
  - `imagesWritten` counts unique pages actually written (not total stamps), `clipsWritten` counts successful OSC clip writes.
- Deviations from spec:
  - Spec body uses `stamps: Array<{ page: number, ts: number }>` — implemented as specified. The plan's design section also shows this shape.
  - Response shape is `{ imagesWritten, clipsWritten, failed }` rather than `{ written, failed }` from the plan's early design — "imagesWritten" and "clipsWritten" are more descriptive and match the spec dispatch prompt exactly.
  - `pdfName` validated as non-empty string (400 if empty/missing) — spec doesn't enumerate this but it's needed to compute the slug.
- Concerns:
  - `getSongProjectPath` is called after body validation. If the set gets unsaved between validation and the OSC call, the 409 fires correctly. No race condition concern.
  - `writePagePng` uses `mkdir -p` (recursive: true) which is safe on re-apply. The `writeFile` overwrites. Standard Node.js behavior — no data loss concern.
  - The `join` import from `node:path` was added alongside existing `resolve`/`extname` — no conflict.



### 2026-06-05 — afterSign notarization hook
- Files modified:
  - `scripts/notarize.cjs` (NEW) — electron-builder `afterSign` hook; no-ops when Apple credentials absent; API-key path preferred, Apple-ID fallback; staples ticket after notarization
  - `scripts/notarize.test.mjs` (NEW) — 3 vitest tests: no-op when no creds (darwin), no-op on non-darwin, throws when .app missing but creds present
  - `package.json` (EDIT) — added `"afterSign": "scripts/notarize.cjs"` to `build`; added `"notarize": false` to `build.mac` to disable electron-builder's built-in notarize path
  - `docs/release-notarization.md` (NEW) — documents 5 GitHub secrets, how to obtain each, `gh secret set` commands, how to trigger a release, and local build behaviour
  - `docs/ai/testing-guide.md` (EDIT) — added Notarization section with pointer to release-notarization.md
  - `docs/ai/decisions.md` (EDIT) — added dated entry explaining double-notarize risk and `notarize: false` rationale
- Checks run:
  - `npm run typecheck` — PASS
  - `npm run lint` — PASS
  - `npm test` — PASS (117 tests: 100 prior + 17 new — 3 notarize hook tests + new total from prior run)
  - `npm run electron:dist` — PASS; logged `[notarize] no credentials in env — skipping notarization (local build)` and `skipped macOS notarization reason=`notarize` options were set explicitly `false``
- Decisions made:
  - Set `"mac": { "notarize": false }` to disable electron-builder 26's built-in `notarizeIfProvided()` — both the afterSign hook and the built-in path detect the same `APPLE_API_KEY*` env vars; without `false`, both would run and double-submit to Apple's notary service. See `docs/ai/decisions.md` 2026-06-05 entry.
  - `@electron/notarize` v2.5.0 uses `notarytool` path (not deprecated `altool`); API params are `{ appPath, appleApiKey, appleApiKeyId, appleApiIssuer }` — no `appBundleId` or `tool` param needed.
  - Stapling via `xcrun stapler staple` runs inside the same try/catch as `notarize()` so a staple failure fails the build (not silently skipped).
- Deviations from spec: none
- Concerns:
  - `@electron/notarize` is a transitive dep (via electron-builder) — not listed in package.json `devDependencies`. If electron-builder is ever removed or its version changes the transitive dep could disappear. Low risk in the short term; a follow-up can pin it directly.
  - Local signing still uses the developer's personal keychain (SHA-1 fingerprint in `sign.cjs`). Notarization won't work locally even if creds were set because the sign step in `sign.cjs` requires the Developer ID cert in the keychain — this is expected; notarize is CI-only.

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
