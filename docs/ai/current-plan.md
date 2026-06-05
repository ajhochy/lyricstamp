# Current Plan — ableset-lyrics-sync

_Updated: 2026-06-05_

---

## Feature: live-stamp-write

### Problem

Stamping lyric lines today only accumulates timestamps for an offline `.als` / `.zip`
export.  The user must finish the song, export, then manually import the project into
Ableton.  This breaks the live-performance workflow: the director can't see named clips
appear on the Arrangement timeline in real time as they stamp.

### Goal

When the user stamps a lyric line during live playback, write a named MIDI clip directly
into the Ableton Arrangement at the current playhead beat — so the clip appears
immediately, with no export/import step.

The existing `.als` / `.zip` offline export path is kept intact as the
offline/portable route (e.g. for set prep before a performance).

### Clarification interview

Auto Mode is active and the product decisions are fully specified in the task prompt
("THREE locked product decisions").  The spike is proven.  No ambiguity requires a
pause for questions — specific, concrete design answers are given.  This rationale is
recorded here per the planning-agent discipline instead of running an unnecessary
interview round.

### Intent + Constraints Pass

1. **What is the user actually trying to accomplish?**  
   Press ArrowRight → lyric clip appears in the live Ableton Arrangement at the current
   beat, named with the lyric text, with no export or import step.

2. **Scope and non-goals**  
   _In scope:_  
   - OSC layer: new `OscClient` methods (`listTracks`, `writeStampClip`) using the
     patched AbletonOSC handler  
   - Server layer: new HTTP endpoints (`GET /api/live/tracks`,
     `POST /api/live/stamp`)  
   - Client UI: mode toggle (Live Stamp / Export), track-picker dropdown, stub
     feedback toasts  
   - Bundling: vendor the patched AbletonOSC into `vendor/AbletonOSC/`, install
     script (copies to `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/`),
     handler-presence probe  

   _Not in scope (explicit non-goals):_  
   - Live undo (removing an arrangement clip from inside the app)  
   - Leadsheet-tab live-stamp (initial scope is lyrics tab only)  
   - Auto-restart Ableton (the user reloads the remote script themselves)  
   - Windows / Linux (macOS-only app throughout)  
   - AbleSet round-trip verification (manual check, out of CI)

3. **Hard constraints**  
   - Do NOT commit `.env`, Live session data, or user-generated exports (AGENTS.md)  
   - All work on feature branches; no direct push to `main` (AGENTS.md)  
   - CI cannot run the Ableton-dependent path; live-write is manual-smoke-only  
   - Keep existing export + its 63 unit tests and 17 E2E tests intact  
   - The temp session clip must not clobber user's session clips  

4. **Design tensions**  
   - **Fast stamps vs. safe scratch slot lifecycle**: using slot 0 is simple but
     could collide with a user-placed session clip; an "always-empty" high-numbered
     slot avoids this but requires a probe  
   - **Bundling a fork vs. upstream drift**: vendoring gives control but requires
     periodic manual rebasing against upstream AbletonOSC  
   - **Handler-presence probe**: a reliable in-band probe avoids confusing errors
     but adds one round-trip per connection

5. **Cheapest path that proves the idea**  
   The spike already proves the OSC layer.  The minimal slice is:
   (a) OSC client methods, (b) one server endpoint, (c) mode toggle +
   `POST /api/live/stamp` from the `stamp()` callback in `app.tsx`.
   Track-picker and bundled remote-script install are layered on after.

---

## Prior Art

The spike (`spike/arrangement-live-write`) produced the key prior-art insight:
AbletonOSC's `Track.duplicate_clip_to_arrangement(clip, beat)` Python binding is the
only standard LOM path to place a clip in the Arrangement without an `.als`
import.  Stock AbletonOSC does not surface it; the spike adds ~6 lines to
`track.py`.

Key design references:
- **AbletonOSC upstream** (`github.com/ideoforms/AbletonOSC`) — well-maintained,
  MIT-licensed; the patch is an additive `add_handler` call that does not touch
  existing handlers.  Low upstream-drift risk.
- **Spike test harness** (`spike/arrangement-osc-test.mjs`) — demonstrated the full
  OSC round-trip: `create_clip` → `set/name` → `duplicate_clip_to_arrangement` →
  read-back.  Beat 8 confirmed.
- **OSC read-reply pattern** — `osc-client.ts` already uses a fire-and-forget send
  + `_handleMessage` reply handler pattern.  The new methods will follow the same
  pattern with a Promise-wrapped reply waiter (matching the spike's `request()`
  helper).

---

## Design

### 1. Vendor and bundle the patched AbletonOSC

**Repository layout:**
```
vendor/
  AbletonOSC/            ← full fork of ideoforms/AbletonOSC at a pinned commit
    abletonosc/
      track.py           ← +6 lines: the duplicate_clip_to_arrangement handler
    README.md            ← note: "forked from upstream; see docs/ai/decisions.md"
  .upstream-sha          ← one-line file recording the upstream commit that was forked
```

**Install script** (`scripts/install-remote-script.mjs`):
- Source: `vendor/AbletonOSC/`
- Destination: `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/`
  (resolved from `$HOME`; macOS-only)
- Prompts if the destination already exists (offers overwrite or skip)
- Exits 0 on success; prints the "Restart Ableton → re-enable AbletonOSC" reminder

**`package.json` script:** `"install:remote-script": "node scripts/install-remote-script.mjs"`

**electron-builder `extraResources`** config: include `vendor/AbletonOSC/` so the
install script can reference it from the packaged `.app` via `process.resourcesPath`.

**Handler-presence probe** (`OscClient.probeHandler()`):
- Sends `/live/track/duplicate_clip_to_arrangement` with an intentionally invalid
  track index (e.g. `9999`) and listens for either an error reply or a timeout.
- If AbletonOSC replies with an error (any reply), the handler is present.
- If no reply arrives within 1 s, treat as "handler not loaded".
- Exposed on `OscClient` as `async probeHandler(): Promise<'present' | 'absent' | 'disconnected'>`.
- Called once on first connection (`connection` event with `connected: true`);
  result cached.  Resets on reconnect.

**Version-drift strategy:**
- `vendor/.upstream-sha` records the upstream commit pinned at vendor time.
- `docs/ai/decisions.md` records the fork context.
- A `scripts/check-upstream.mjs` script (optional, not in CI) can compare the
  vendored SHA against upstream's `main` HEAD to surface new releases.

### 2. Mode toggle: Live Stamp vs. Export

`app.tsx` adds a `liveStampMode` boolean (persisted in `localStorage`).

**Behaviour when `liveStampMode === true`:**
- `stamp()` calls `POST /api/live/stamp` (new endpoint) in addition to appending
  to the local `stamps` array.
- If the selected track index is `null` (no track picked), show a toast "Select a
  +LYRICS track first" and skip the OSC call.
- If Ableton is disconnected, show a toast "Ableton not connected" and skip.
- Export `.als` / `.zip` buttons remain enabled; the mode toggle does not hide them.

**Behaviour when `liveStampMode === false` (default):**
- `stamp()` behaves exactly as today — append to `stamps`, cursor advance, no OSC.

**Toggle UI:** a small pill toggle in the header (near the export button), label:
"Live Stamp" / "Export only".  CSS class `live-mode-active` on the app root when
live stamp mode is on, for styling the stamp preview differently.

### 3. Track-picker UI

**Data flow:**
- On Ableton connect (`connection` event → WS broadcast → `useLive` in client),
  `GET /api/live/tracks` is called.
- Server calls `OscClient.listTracks()` → returns `Array<{ index: number; name: string }>`.
- Client filters the list to those whose `name` includes `+LYRICS`, presents them
  in a `<select>` dropdown.  Non-`+LYRICS` tracks are shown (grayed out) so the
  user can still pick them if needed.
- The selected track index is stored in React state (`selectedTrackIndex: number | null`).
- Persisted to `localStorage` as `liveStampTrackIndex` (number or null).

**`GET /api/live/tracks` endpoint** (new in `routes.ts`):
```
GET /api/live/tracks
→ 200: { tracks: Array<{ index: number; name: string }> }
    or { tracks: [] }  when disconnected
→ 503: { error: "Ableton not connected" }  (optional; prefer empty array)
```

**`POST /api/live/stamp` endpoint** (new in `routes.ts`):
```
POST /api/live/stamp
Body: { trackIndex: number; beat: number; clipName: string }
→ 200: { ok: true; beat: number }   on success
→ 400: { error: "..." }             on validation failure
→ 503: { error: "Ableton not connected" }
→ 500: { error: "..." }             on OSC or internal error
```

### 4. Server / OSC layer

**`OscClient` additions** (all in `osc-client.ts`):

```typescript
// Fire and forget — no reply expected.
createClip(trackIndex: number, slotIndex: number, length: number): void

// Fire and forget — no reply.
setClipName(trackIndex: number, slotIndex: number, name: string): void

// Promise-resolved on reply or rejects on timeout (2 s default).
duplicateClipToArrangement(trackIndex: number, slotIndex: number, destBeat: number): Promise<void>

// Returns array of { index, name }.  Resolves on reply (2 s timeout).
listTracks(): Promise<Array<{ index: number; name: string }>>

// Deletes the session clip in slot slotIndex (fire-and-forget).
deleteClip(trackIndex: number, slotIndex: number): void

// Probe for handler presence (see §1 above).
probeHandler(): Promise<'present' | 'absent' | 'disconnected'>
```

**OSC addresses used:**

| Address | Direction | Purpose |
|---|---|---|
| `/live/clip_slot/create_clip` | send | Create temp session clip |
| `/live/clip/set/name` | send | Name the temp clip |
| `/live/track/duplicate_clip_to_arrangement` | send+recv | Place named clip in Arrangement |
| `/live/song/get/num_tracks` | send+recv | Get track count for `listTracks` |
| `/live/track/get/name` | send+recv | Get name of a specific track |
| `/live/clip_slot/delete_clip` | send | Clean up temp session clip |

**Scratch slot lifecycle:**

Use **slot index 0** on the selected `+LYRICS` track.  Sequence per stamp:
1. `create_clip(trackIndex, 0, 1.0)` — 1-beat clip (length doesn't matter; arrangement clip length comes from subsequent stamps or default)
2. `set/name(trackIndex, 0, clipName)`
3. `duplicateClipToArrangement(trackIndex, 0, beat)` — wait for reply
4. `deleteClip(trackIndex, 0)` — fire and forget

**Why slot 0 is acceptable:** the `+LYRICS` track is a dedicated marker track, not
a performance track.  Slot 0 is immediately cleaned up after duplication.  A
collision (user has a session clip in slot 0) is surfaced as a "stamp failed" toast
rather than silently overwriting, because `create_clip` will error if the slot
already contains a clip.  Handling: catch the error, toast "Stamp failed: slot 0
busy on selected track", skip the duplication.

**`listTracks()` implementation:**
The approach from the spike uses `num_tracks` (single int reply) followed by N
parallel `get/name` requests.  The new implementation uses a single loop:
`/live/song/get/num_tracks` → N × `/live/track/get/name` in parallel (Promise.all
with per-request timeout), then assembles the result array.

### 5. Failure modes and UI feedback

| Situation | Behaviour |
|---|---|
| Ableton disconnected when Live Stamp mode active | Toast "Ableton not connected — clip not written"; stamp still appended locally |
| Handler not loaded (probe returns 'absent') | Yellow status banner "Install remote script and restart Ableton"; mode toggle disabled |
| Slot 0 busy on selected track | Toast "Stamp failed: session slot 0 busy — move or clear the clip in slot 0 of the selected track" |
| OSC timeout (duplicateClipToArrangement) | Toast "Stamp failed: Ableton timeout" |
| No track selected | Toast "Select a +LYRICS track first"; stamp appended locally |
| listTracks times out / returns empty | Track picker shows "(Ableton tracks unavailable)" placeholder |

**Re-stamping the same line:** allowed — each stamp call places a new clip; no
deduplication.  Two identical clips at the same beat position will coexist in the
Arrangement (Ableton handles this fine).

**Undo:** `undoStamp(i)` removes the local stamp entry (as today).  It does NOT
remove the arrangement clip.  The user can undo in Ableton directly (Cmd+Z).

### 6. Handler-presence status in the WS tick message

The `OscClient` already emits `connection` events on the WebSocket.  Extend
`ws-server.ts` to broadcast a `handlerStatus` field in the tick message so the
client can show the banner without polling:

```typescript
// ws broadcast payload (addition only — backward-compatible)
{
  ts: number; bpm: number; playing: boolean; /* … existing fields … */
  handlerStatus?: 'present' | 'absent' | 'unknown';
}
```

---

## Atomic Issue Breakdown

| # | Title | Scope | Likely files | Acceptance criteria | CI-testable? | Depends on |
|---|---|---|---|---|---|---|
| **A** | Vendor AbletonOSC fork + install script | Server / infra | `vendor/AbletonOSC/` (copy from spike), `scripts/install-remote-script.mjs`, `package.json` (`install:remote-script` script, `extraResources` in builder config) | 1. `npm run install:remote-script` copies `vendor/AbletonOSC/` to `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/` successfully (or prints "exists, skipping" if already present). 2. `electron:dist` build includes `vendor/AbletonOSC/` in the app bundle. | Partial: unit-test the path-construction and copy logic (mock `fs.cpSync`); install to a temp dir in CI. Actual Live load = manual smoke. | none |
| **B** | OSC client: listTracks, writeStampClip, probeHandler | Server | `server/src/osc-client.ts` | 1. `listTracks()` calls `num_tracks` then N×`get/name`, returns `{index,name}[]`; unit-testable with mock OSC server. 2. `writeStampClip({trackIndex, slotIndex, beat, clipName})` sends `create_clip → set/name → duplicateClipToArrangement → deleteClip` in order; each OSC message contains the correct address and arguments; unit-testable via spy. 3. `probeHandler()` returns `'present'` when any reply arrives within 1 s, `'absent'` on timeout, `'disconnected'` when `connected === false`. | Partial: OSC message construction, argument values, and promise resolution/rejection are unit-testable. Actual Ableton I/O = manual smoke only. | none |
| **C** | Server API: GET /api/live/tracks + POST /api/live/stamp | Server | `server/src/routes.ts`, `server/src/index.ts` (wire OscClient into handleRequest), `shared/types.ts` (new type exports) | 1. `GET /api/live/tracks` returns `{tracks: [{index,name}]}` or `{tracks:[]}` when disconnected; 400 if body present (GET should have no body); 200 always (never 503 — prefer empty array). 2. `POST /api/live/stamp` with `{trackIndex:0, beat:8, clipName:"Amazing grace"}` returns `{ok:true, beat:8}`. 3. `POST /api/live/stamp` with missing `trackIndex` → 400 with `error` field. 4. `POST /api/live/stamp` when connected===false → 503. | Unit/integration: mock OscClient in route tests. Live OSC = manual smoke. | B |
| **D** | WS: broadcast handlerStatus in tick | Server | `server/src/ws-server.ts`, `server/src/osc-client.ts` | 1. When `OscClient` emits `connection({connected:true})`, `probeHandler()` is called; result is broadcast in the next tick payload as `handlerStatus`. 2. On reconnect, `handlerStatus` resets to `'unknown'` until probe completes. 3. Tick payload is backward-compatible (existing fields unchanged). | Unit-testable (mock probe result, inspect broadcast payload). | B |
| **E** | Client: mode toggle + track-picker state | Client | `client/src/app.tsx` | 1. Toggle button in header: label "Live Stamp" when active, "Export only" when inactive; persisted to `localStorage` as `liveStampMode`. 2. Track-picker `<select>` populated by `GET /api/live/tracks` on Ableton connect (or on toggle enable); `+LYRICS` entries highlighted; non-`+LYRICS` entries shown but grayed. 3. Selected track index persisted as `liveStampTrackIndex`. 4. When Live Stamp active + no track selected: toast "Select a +LYRICS track first". 5. Export buttons remain visible and functional regardless of mode. | CI: E2E test (Playwright) checks toggle render, localStorage persistence, and track picker rendering with mock API response. No Ableton needed for UI tests. | C, D |
| **F** | Client: stamp() calls live-stamp path | Client | `client/src/app.tsx` | 1. When `liveStampMode===true` + track selected + Ableton connected: `stamp()` fires `POST /api/live/stamp` in addition to appending the local stamp. 2. On success: toast "Clip written at Bar.Beat". 3. On 503 (disconnected): toast "Ableton not connected — clip not written"; local stamp still appended. 4. On 500 / timeout: toast "Stamp failed: <error>"; local stamp still appended. 5. When `liveStampMode===false`: `stamp()` is unchanged from today. | CI: unit test for the `stamp()` branching logic via mock fetch. Manual smoke: Ableton required for live-write confirmation. | E |
| **G** | Client: handler-not-loaded warning banner | Client | `client/src/app.tsx`, `client/src/views.tsx` | 1. When `handlerStatus === 'absent'` and Live Stamp mode is on: a non-blocking banner appears above the lyric view reading "Remote script not loaded — run `npm run install:remote-script` and restart Ableton". 2. Banner disappears when `handlerStatus === 'present'`. 3. Live Stamp toggle is disabled (grayed) while `handlerStatus === 'absent'`. 4. Export path is unaffected. | CI: Playwright test verifies banner renders when `handlerStatus:'absent'` is in the WS tick fixture. | D, E |
| **H** | Update testing-guide.md + manual smoke checklist | Docs | `docs/ai/testing-guide.md` | 1. Manual smoke checklist includes: install remote script, enable in Ableton, stamp a lyric, verify clip appears in Arrangement with correct name and beat position, verify AbleSet reads the clip. | N/A — doc-only issue | A–G |

### Dependency order

```
A (vendor) ──────────────────────────────────────────────────────────────┐
B (OSC methods) ───────────────────────────────────────────────────────┐ │
                                                                         ↓ ↓
C (server API)  ←── B                                                    H (docs)
D (WS status)   ←── B
E (client UI)   ←── C, D
F (stamp path)  ←── E
G (banner)      ←── D, E
```

A and B can be implemented in parallel. C and D can run in parallel after B.
E–G are sequential.

---

## Validation Plan

### CI-deterministic (all of these must pass on every PR):

1. `npm run typecheck` — no TypeScript errors
2. `npm run lint` — no ESLint errors
3. `npm test` — 63+ unit tests; new tests for:
   - Issue B: OSC message construction for `listTracks`, `writeStampClip`, `probeHandler`
   - Issue C: route-level validation (mock OscClient)
   - Issue F: `stamp()` branching logic (mock fetch)
4. `npm run build` and `npm run electron:build` — build succeeds
5. `npm run test:e2e` — 17+ Playwright tests; new tests for:
   - Issue E: toggle render, track-picker populated by mock endpoint
   - Issue G: banner render when `handlerStatus:'absent'` in WS fixture

### Manual smoke only (requires patched Ableton):

These cannot run in CI. Mark with `[MANUAL]` in the PR checklist.

- `[MANUAL]` Run `npm run install:remote-script` → confirm `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/abletonosc/track.py` is updated
- `[MANUAL]` Restart Ableton → re-enable AbletonOSC → confirm handler is loaded (no errors in Ableton log)
- `[MANUAL]` App connects to Ableton; track picker shows the `+LYRICS` track
- `[MANUAL]` Enable Live Stamp mode → select track → stamp a lyric line → clip appears in Arrangement at the correct beat with correct name
- `[MANUAL]` AbleSet iPad app reads the live-placed clip identically to `.als`-generated clips
- `[MANUAL]` Undo stamp locally → arrangement clip remains in Ableton (expected; Cmd+Z in Ableton removes it)
- `[MANUAL]` With Live Stamp OFF: arrow-key stamp → no OSC call, existing behaviour unchanged
- `[MANUAL]` With Ableton disconnected in Live Stamp mode → toast fires, local stamp appended, no crash

---

## Known Ambiguities

None that block implementation.  The following are documented for awareness:

- **AbleSet reads live-placed clips:** The spike did not confirm whether AbleSet's
  iOS app ingests clips placed live by `duplicate_clip_to_arrangement` identically
  to clips from an `.als` import.  This is a manual smoke item (issue H); if it
  fails, a follow-up spike is needed to understand AbleSet's clip-discovery timing.
- **Arrangement clip length:** `duplicate_clip_to_arrangement` copies the session
  clip's length into the arrangement.  The temp session clip is always 1 beat.
  The resulting arrangement clip is therefore 1 beat regardless of the distance
  to the next stamp.  This is the simplest approach; a follow-up can retroactively
  stretch the previous clip when the next stamp arrives.
- **Slot 0 collision:** The plan uses slot 0 on the selected track and cleans it up
  immediately.  If the user has a clip in slot 0, the stamp will fail with a toast.
  A follow-up can scan for an empty slot.

---

## Data Safety

- `vendor/AbletonOSC/` is committed source code, not a user artifact.  Safe to commit.
- The install script writes to `~/Music/Ableton/…`; it does NOT modify the user's
  current Ableton set or any `.als` file.
- `localStorage` keys added: `liveStampMode` (boolean), `liveStampTrackIndex` (number|null).
  These are app-internal flags, not user data.
- No new files are committed to `.gitignore`-excluded areas.

---

# Archive — previous plans

## Issue 1: Electron wrapper (completed 2026-06-02)

Goal: wrap in electron-vite for standalone `.app` distribution.  Completed; PR open on `issue-1-electron-wrapper`.

## Server-side session storage (completed 2026-06-05)

Goal: origin-independent named sessions via server filesystem.  
verification-gate PASS 2026-06-05; awaiting commit + PR.
