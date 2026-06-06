# Current Plan — ableset-lyrics-sync

_Updated: 2026-06-05_

---

## Feature: leadsheet-apply (Apply to Ableton for the PDF/leadsheet tab)

### Problem

The lyrics tab already has "Apply to Ableton" (proof-then-apply, PR #32, merged). The
leadsheet tab has an Export .zip button but no live-apply path. A music director who
has stamped pages of a PDF leadsheet to beat positions must export a zip, extract it,
and manually drop it into the Ableton project folder. This breaks the live-performance
workflow.

### Goal

Add **Apply to Ableton** to the leadsheet tab: user stamps PDF pages to beats (existing),
picks a `+LYRICS` track, clicks "Apply to Ableton" → the app (1) writes each stamped
page's PNG into the live Ableton project directory under `Lyrics/<slug>/page-N.png`, and
(2) writes arrangement clips on the chosen track at the stamp beats named
`[img:<slug>/page-N.png] [full]`, each spanning to the next stamp. No zip export/import
required. The existing Export .zip button remains intact.

---

## Clarification interview

Auto Mode is active. The feature spec is fully locked: three product decisions, exact
clip-name format, exact file layout, validation strategy, and investigation questions all
specified in the task prompt. No observable-outcome ambiguities exist beyond what the
spec explicitly leaves open. Skip rationale: the spec provides the observable outcome
(clips in Arrangement + PNGs in project dir), the trigger (button click), boundary
conditions (unsaved set, disconnected, re-apply), and done-definition for every
acceptance criterion. Recorded here per planning-agent discipline.

---

## Intent + Constraints Pass

1. **What is the user actually trying to accomplish?**
   After proofing stamped PDF pages in the leadsheet tab, press "Apply to Ableton" → page
   PNGs land in the live Ableton project folder AND named clips appear in the Arrangement
   at the correct beats, so AbleSet immediately reads them — no export/import step.

2. **Scope and non-goals**
   _In scope:_
   - New `/api/live/apply-leadsheet` server endpoint
   - New Python OSC handler in the vendored fork for getting the Live set's project path
   - Track-picker + Apply button in the leadsheet tab header (mirror the lyrics tab)
   - PNG write to the Ableton project directory server-side
   - Clip writes via the existing `writeStampClip` OSC path
   - Re-apply semantics: overwrite images, add fresh clips
   - `handlerStatus` probe already shipped — reused, not re-implemented

   _Not in scope (explicit non-goals):_
   - Removing/undoing arrangement clips from inside the app
   - Modifying the lyrics tab's Apply path
   - Windows/Linux (macOS-only throughout)
   - AbleSet round-trip verification in CI (manual smoke only)
   - Changing the existing Export .zip button

3. **Hard constraints**
   - Do NOT commit `.env`, Live session data, or user-generated exports (AGENTS.md)
   - All work on feature branches; no direct push to `main`
   - CI cannot run the Ableton-dependent path; live file-write + clip placement = manual smoke
   - Keep existing 100+ unit tests and 35 E2E tests intact
   - Clip name format must be `[img:<slug>/page-N.png] [full]` — identical to zip export so
     AbleSet reads live-applied clips the same way (AbleSet reads the clip name, not the file
     directly)
   - Unsaved set (no project directory) must block Apply with a clear user-facing message

4. **Design tensions**
   - **Getting the project path via OSC vs. in-band workaround**: Live's Python LOM does not
     expose `Song.project_path` directly. The chosen approach (new fork handler, see below)
     adds one more vendored OSC handler — which is reliable but means `install:remote-script`
     must be re-run by existing users.
   - **Re-apply = overwrite images + add clips**: idempotent image writes are safe; adding
     fresh clips (not replacing) means re-applying creates duplicate arrangement clips. This
     is the explicit product decision — simpler than a "find and replace" approach.
   - **PNG rendering is client-side only**: `pageRenderer.renderToDataUrl` is a browser API
     (canvas). The server cannot render PDF pages. Therefore the client must render PNGs and
     send them in the request body — same pattern as the zip export.

5. **Cheapest path that proves the idea**
   Minimal slice: (a) new fork handler returning the set file path, (b) server endpoint that
   decodes PNGs and writes them to disk + writes clips via the existing `writeStampClip`, (c)
   client Apply button in the leadsheet tab. Everything else reuses shipped code.

---

## Prior Art

The lyrics tab's proof-then-apply (PR #32) is the direct prior art and the design mirror.
Key references:
- `server/src/osc-client.ts`: `writeStampClip`, `probeHandler`, transport seam — reused unchanged
- `server/src/routes.ts`: `handlePostLiveApply`, `stampsToClips`, `decodePngDataUrl` — the
  PNG decoder helper is already present (used by zip export); reused for disk write
- `server/src/routes.ts` `handlePostExportZip`: source of truth for slug, `page-N.png` naming,
  `[img:<slug>/page-N.png] [full]` clip name, `DEFAULT_CLIP_LENGTH` fallback — replicated exactly
- `vendor/AbletonOSC/abletonosc/track.py`: model for adding new handlers to the fork
- The `arrangement_writer_version` handler (already in the fork): exact pattern to follow for
  the new `song/get/project_path` handler

---

## Project-Path Resolution — Investigation Findings and Decision

### Investigation

**Option (a): Does upstream AbletonOSC already expose a song/project path?**

Confirmed: `vendor/AbletonOSC/abletonosc/song.py` has no `file_path`, `get_data`, or
`project_path` handler. The `properties_r` list (`can_redo`, `can_undo`, `is_playing`,
`song_length`, `session_record_status`) and `properties_rw` list are both enumerated
explicitly — no path property is present. The `application.py` handler only exposes
`get/version` and `get/average_process_usage`. Neither file exposes any path.

**What does Ableton's Live Object Model expose?**

Ableton's Python `Live.Song.Song` class does NOT have a documented `project_path`
property. However, it does have `file_path` (string) which returns the absolute path of
the `.als` file on disk when the set has been saved — e.g.
`/Users/ajhochy/Music/Ableton/Great Things Project/Great Things.als`. If the set has
never been saved, `file_path` is an empty string `""`. The project directory is therefore
`os.path.dirname(song.file_path)` when `file_path != ""`.

**Option (b): ableton-mcp `get_session_path`?**

`ableton-mcp` is a different remote script entirely (not the same OSC process). It is not
installed in this project and may not be running. Not a viable option.

**Option (c): New write-free handler in the vendored fork.**

The reliable path: add a `/live/song/get/project_path` handler to `song.py` in the vendored
fork that returns `os.path.dirname(song.file_path)` when `file_path != ""` and returns
`""` when unsaved. Pattern mirrors the `arrangement_writer_version` handler in `track.py`.
This requires re-running `install:remote-script` + restarting Ableton, identical to the
existing requirement for the fork.

### Decision

**Chosen: Option (c) — new `/live/song/get/project_path` handler in the vendored fork.**

Rationale:
- Options (a) and (b) are definitively not available (confirmed by code inspection).
- Option (c) is one short additive Python function in the same file pattern already
  established in this project (`arrangement_writer_version`).
- It is write-free (read-only), so it cannot corrupt the set.
- When `file_path == ""` (unsaved set), it returns `""` — the server checks for this and
  returns a 409 with "Save your Ableton set first" which is shown to the user.
- Users already need `install:remote-script` to use Apply features. The requirement is
  unchanged in kind, only in version (the fork's handler version stays `"ableset-1"` since
  we can bump to `"ableset-2"` in this PR for detection — see Issue 1 below).

See `docs/ai/decisions.md` for the dated decision entry.

---

## Design

### Server endpoint: POST /api/live/apply-leadsheet

```
POST /api/live/apply-leadsheet
Body: {
  trackIndex: number,
  pdfName: string,           // raw PDF filename (e.g. "Great Things F Lead Sheet.pdf")
  pages: Array<{
    page: number,            // 1-based
    pngDataUrl: string       // data:image/png;base64,... (client-rendered)
  }>,
  stamps: Array<{
    page: number,
    beat: number
  }>
}
→ 200: { written: number, failed: Array<{page: number, beat: number, error: string}> }
→ 400: bad body / missing fields
→ 409: { error: "Save your Ableton set first — no project directory found" }
→ 503: Ableton not connected
```

**Server logic (sequential)**:
1. Guard: disconnected → 503
2. Fetch project path via `oscClient.getSongProjectPath()` (new `OscClient` method, see
   below) — if `""` → 409
3. Compute `slug = slugify(pdfName.replace(/\.pdf$/i, ''))` — reuse the existing
   `slugify()` function already in `routes.ts`
4. Write PNGs: for each `pages[i]`, decode `pngDataUrl` via existing `decodePngDataUrl()`
   helper, write to `<projectPath>/Lyrics/<slug>/page-<N>.png` (create dirs as needed)
5. Build leadsheet clips: for each stamp, compute clip name
   `[img:${slug}/page-${stamp.page}.png] [full]` and length (next beat - this beat, or
   `DEFAULT_CLIP_LENGTH` for the last), matching `handlePostExportZip` exactly
6. Write clips sequentially via existing `_oscClient.writeStampClip(trackIndex, name,
   beat, length)` — same method already used by the lyrics apply path
7. Return `{ written, failed[] }`

**Key reuses** (no new logic needed):
- `decodePngDataUrl(dataUrl)` — already in `routes.ts`
- `slugify(name)` — already in `routes.ts`
- `DEFAULT_CLIP_LENGTH` — already exported from `als-writer.ts`
- `_oscClient.writeStampClip(...)` — already in `osc-client.ts`
- `decodePngDataUrl` decoding pattern — identical to what the zip export does

**File-write helper** (new, thin): `async function writePagePng(projectPath, slug, page, pngBuf)` —
`mkdir -p <projectPath>/Lyrics/<slug>`, then `fs.writeFile(...)`. This is the only new
server-side code beyond the endpoint glue.

### OscClient: new getSongProjectPath() method

```typescript
async getSongProjectPath(): Promise<string>
```
Sends `/live/song/get/project_path` (new fork handler), waits for reply
`[address, projectPath]`, returns the string. Returns `""` if `file_path` was empty in
Live (set not saved). Uses existing `_request()` / `_registerReply` pattern.

### Vendored fork: new handler in song.py

```python
# ABLESET-LYRICS-SYNC: return the project directory (dirname of set file_path).
# Returns empty string when the set has not been saved yet.
def song_get_project_path(params):
    fp = self.song.file_path
    return (os.path.dirname(fp) if fp else "",)

self.osc_server.add_handler("/live/song/get/project_path", song_get_project_path)
```

Also bump `arrangement_writer_version` return value from `"ableset-1"` to `"ableset-2"` so
the server can detect that the new handler is present (the probe already checks for any
reply — the version string is informational only, but bumping makes debugging easier).

### Client: leadsheet Apply button

The leadsheet tab gets the same UI pattern as the lyrics tab:

1. **Track picker** `<select>` in the header — reuse the same track-picker block from the
   lyrics tab. Currently the track picker is rendered only when `tab === 'lyrics'` (in
   `app.tsx`). Extend the condition to `tab === 'lyrics' || tab === 'leadsheet'`. Share the
   same `liveTrackIndex` + `liveTracks` state (one track picker, two tabs).

2. **Apply to Ableton button** — rendered in the header-actions block when
   `tab === 'leadsheet'`, alongside the existing Export .zip button (coexist, not replace).

3. **applyLeadsheetToAbleton() callback** in `app.tsx`:
   - Guard checks: connected, `handlerStatus !== 'absent'`, `liveTrackIndex !== null`,
     `leadsheetStamps.length > 0`, `pdfFile !== null`
   - Render each unique stamped page to a data URL via `pageRenderer.renderToDataUrl(page)`
     (same as `exportLeadsheet`)
   - POST `{ trackIndex: liveTrackIndex, pdfName: pdfFile.name, pages: [...], stamps: [...] }`
     to `/api/live/apply-leadsheet`
   - Toast result: `"Wrote N clips"` on full success, `"Wrote N, failed M"` on partial

4. **applyLeadsheetDisabledReason** useMemo — same structure as `applyDisabledReason`:
   - `!connected` → `'Ableton not connected'`
   - `handlerStatus === 'absent'` → `'Remote script not loaded'`
   - `handlerStatus === 'unknown'` → `'Checking remote script…'`
   - `liveTrackIndex === null` → `'No track selected'`
   - `leadsheetStamps.length === 0` → `'No stamps to apply'`
   - `!pdfFile` → `'No PDF loaded'`
   - `null` (enabled)

5. **Stamp log image-ref display** in `LeadsheetView` (views.tsx): the stamp log currently
   shows `[img:page{s.page}.png]` but the actual clip name uses the slug-based path
   `[img:<slug>/page-N.png]`. This is a cosmetic inconsistency that is not a blocker —
   leave the stamp log display as-is for now and note it as a follow-up.

### Failure modes

| Situation | Behaviour |
|---|---|
| Set not saved (empty `file_path`) | 409 → toast "Save your Ableton set first" |
| Ableton disconnected | 503 → button disabled + reason tooltip |
| Handler absent (old fork) | Button disabled, banner shown (same as lyrics tab) |
| Project dir not writable | File-write error → partial failure in `failed[]`, toast |
| PNG decode fails (invalid dataUrl) | Endpoint → 400 |
| No stamps | Button disabled |
| No PDF | Button disabled |
| OSC timeout writing a clip | Clip added to `failed[]`, others continue |
| Re-apply | PNG overwritten (idempotent), fresh clips added to Arrangement |

---

## Atomic Issue Breakdown

| Order | # | Title | Scope | Likely files | Acceptance criteria | CI-testable | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | **LS-A** | Fork: add `/live/song/get/project_path` handler + bump version | Vendored Python fork | `vendor/AbletonOSC/abletonosc/song.py`, `vendor/AbletonOSC/abletonosc/track.py` | (1) `song.py` has `add_handler("/live/song/get/project_path", ...)` that returns `os.path.dirname(song.file_path)` or `""` when unsaved. (2) `arrangement_writer_version` in `track.py` returns `"ableset-2"`. (3) Handler is additive — no existing handler modified. | Read-only Python check; no Ableton needed for code review. Manual smoke: install + verify OSC reply. | none |
| 2 | **LS-B** | OscClient: add `getSongProjectPath()` | Server | `server/src/osc-client.ts`, `server/src/osc-client.test.ts` | (1) `getSongProjectPath()` sends `/live/song/get/project_path`, awaits reply `[address, path]`, returns `path as string`. (2) Returns `""` when reply contains an empty string. (3) Rejects after `REPLY_TIMEOUT_MS` with an `Error`. (4) 3 new unit tests (saved set returns path, unsaved returns empty, timeout rejects). | Full CI — unit tests with mock OSC transport (existing subclass-mock pattern). | LS-A |
| 3 | **LS-C** | Server: `POST /api/live/apply-leadsheet` endpoint | Server | `server/src/routes.ts` | (1) Returns 503 when Ableton disconnected. (2) Returns 409 when `getSongProjectPath()` returns `""`. (3) Returns 400 on missing/invalid body fields. (4) With valid body + stubbed `getSongProjectPath()` returning a temp dir: writes `page-N.png` files to `<tempDir>/Lyrics/<slug>/` and returns `{written: N, failed: []}`. (5) Slug computed by `slugify(pdfName.replace(/\.pdf$/i,''))` matching existing `slugify()`. (6) Clip name is `[img:${slug}/page-${page}.png] [full]` — identical format to zip export. (7) Clip length spans to next stamp; last clip uses `DEFAULT_CLIP_LENGTH`. (8) Partial failure: if one clip write fails OSC, the others continue; endpoint returns 200 with `failed[]`. (9) Re-apply: PNG file is overwritten (no duplicate); clips are added fresh (no de-dup). | Full CI — unit tests: slug/clip-name logic, PNG decode + write to real tmpdir, validation guards (mock OscClient). OSC + AbleSet round-trip = manual smoke only. | LS-B |
| 4 | **LS-D** | Client: leadsheet Apply button + callback | Client | `client/src/app.tsx`, `client/src/styles.css` | (1) "Apply to Ableton" button renders in header-actions when `tab === 'leadsheet'`, alongside the Export .zip button (both visible simultaneously). (2) Button disabled with tooltip matching `applyLeadsheetDisabledReason` when: not connected / handler absent / no track / no stamps / no PDF. (3) Clicking while enabled: renders each unique stamped page to a data URL (same as export), POSTs to `/api/live/apply-leadsheet`, shows `"Wrote N clips"` toast on full success or `"Wrote N, failed M"` on partial. (4) Track picker visible when `tab === 'leadsheet'` (same picker as lyrics tab, same state). (5) `applyingLeadsheetToAbleton` boolean disables button + shows "Applying…" label during in-flight POST. (6) Existing Export .zip button unaffected. (7) Existing lyrics tab "Apply to Ableton" button unaffected. | CI: Playwright E2E tests — button presence, disabled states, coexistence with Export .zip, track picker visible in leadsheet tab. No Ableton needed for UI tests. Live PNG write + clip placement = manual smoke. | LS-C |
| 5 | **LS-E** | Manual smoke checklist update + install-remote-script re-run note | Docs | `docs/testing/manual-smoke.md`, `docs/ai/testing-guide.md` | (1) `docs/testing/manual-smoke.md` has a new section "Apply leadsheet to Ableton" listing: (a) run `install:remote-script` to get fork v2 (new project-path handler), (b) restart Ableton, (c) load session with PDF + stamps, (d) "Apply to Ableton" in leadsheet tab, (e) verify PNGs written to project dir, (f) verify clips in Arrangement with correct names, (g) verify AbleSet reads the clips. (2) Notes the 409 smoke: unsaved set → "Save your Ableton set first" message. | Doc-only; no CI check needed. | LS-A through LS-D |

### Dependency order

```
LS-A (fork: song.py handler + version bump)
  └── LS-B (OscClient.getSongProjectPath)
        └── LS-C (server endpoint: validate, write PNGs, write clips)
              └── LS-D (client: Apply button + callback)
                    └── LS-E (docs + manual smoke update)
```

All issues are sequential. LS-A and LS-B could theoretically be one commit, but are
separated so the Python fork change is reviewable independently.

---

## Validation Plan

### CI-deterministic (must pass on every PR)

1. `npm run typecheck` — no TypeScript errors
2. `npm run lint` — no ESLint errors
3. `npm test` — 100+ passing; new tests added in LS-B (3 tests) and LS-C (8+ tests):
   - LS-B: `getSongProjectPath` — path returned, empty string, timeout rejection
   - LS-C: slug/clip-name/length logic, PNG decode+write to real tmpdir, 403/409/503 guards,
     partial failure (one clip OSC failure), re-apply idempotency for PNG write
4. `npm run build` + `npm run electron:build` — build succeeds
5. `npm run test:e2e` — 35+ passing; new Playwright tests added in LS-D:
   - Apply button renders in leadsheet tab (not in lyrics tab)
   - Button disabled with correct reason at each guard condition
   - Track picker visible in leadsheet tab
   - Both "Apply to Ableton" and "Export .zip" buttons coexist in leadsheet tab header
   - Apply button POST is wired (not 404) — mock fetch check

### Manual smoke only (requires patched Ableton + saved set)

These cannot run in CI. Mark `[MANUAL]` in the PR checklist.

- `[MANUAL]` Run `npm run install:remote-script` → confirm `arrangement_writer_version` handler
  returns `"ableset-2"` (or any reply) when probed
- `[MANUAL]` Restart Ableton → re-enable AbletonOSC → app shows no "Remote script not loaded" banner
- `[MANUAL]` Open a saved Ableton set (`.als` on disk). Load a PDF + stamp pages in the leadsheet tab.
- `[MANUAL]` Select a `+LYRICS` track. Click "Apply to Ableton". Verify:
  (a) PNG files appear at `<projectDir>/Lyrics/<slug>/page-N.png`
  (b) Clips appear in the Arrangement with names `[img:<slug>/page-N.png] [full]` at the correct beats
  (c) Each clip spans to the next stamp's beat (last clip = DEFAULT_CLIP_LENGTH = 4 beats)
- `[MANUAL]` Open AbleSet on iPad → verify it reads the live-placed image clips identically
  to zip-exported clips
- `[MANUAL]` Re-apply (click "Apply to Ableton" a second time) → PNGs overwritten (no duplicate
  files), fresh clips added to Arrangement
- `[MANUAL]` Unsaved set test: open a new unsaved Ableton set → click "Apply to Ableton" →
  toast reads "Save your Ableton set first"
- `[MANUAL]` Export .zip button still works after an Apply session (no state corruption)
- `[MANUAL]` Lyrics tab "Apply to Ableton" still works (no regression)

---

## Known Ambiguities

1. **`song.file_path` in Live's Python LOM**: confirmed available through Ableton LOM
   documentation and community sources — `Live.Song.Song.file_path` returns an absolute
   path string for a saved set and `""` for an unsaved one. Not directly testable without
   Ableton; manual smoke covers it.

2. **AbleSet iPad app timing**: unclear whether AbleSet rescans `Lyrics/` in real time or
   only on session load. If it only scans on load, the user may need to reload AbleSet
   after applying. This is a manual-smoke question, not a blocker.

3. **Stamp log image-ref display in LeadsheetView (views.tsx)**: currently shows
   `[img:page{s.page}.png]` (without the slug), but actual clip names use the slug.
   This is a cosmetic inconsistency. Not fixed in this feature — tracked as a follow-up.

---

## Data Safety

- PNGs are written to the user's Ableton project directory, which is the intended
  destination. The server guards against empty project path (unsaved set).
- No Ableton `.als` file is modified. PNG writes are additive (create or overwrite).
- `mkdir -p` creates `Lyrics/<slug>/` if absent — standard Ableton project convention.
- No new `localStorage` keys or `IndexedDB` entries.
- `vendor/AbletonOSC/abletonosc/song.py` modification is a committed source-code change,
  not a runtime artifact.

---

# Archive — previous plans

## Feature: live-stamp-write (completed 2026-06-05, PR #32)

_See archived content below._

## ⚠️ REVISION 2026-06-05 — Model 2: proof-then-apply (live-stamp-write)

User decision: the feature is **NOT** real-time per-stamp. It is **proof-then-apply**:
stamp + edit/proof in the app exactly as today (accumulate `stamps[]`, stamp log, inline
edit, undo — all unchanged), then press **"Apply to Ableton"** to batch-write every
proofed clip into the Arrangement at its computed beat in one pass.

_(Full original plan content retained in git history — see commit d6ebc87.)_
