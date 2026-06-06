# Manual Smoke Checklist — ableset-lyrics-sync

These checks require Ableton Live to be installed and running locally.
They cannot be automated in CI. Run them before merging any PR that touches
the OSC layer, the install script, or `vendor/AbletonOSC/`.

---

## Smoke 1 — Install remote script and load in Live

**Goal:** Confirm `npm run install:remote-script` delivers the patched AbletonOSC
fork to Ableton and that both custom handlers load without errors.

1. In the repo, run:
   ```
   npm run install:remote-script
   ```
   Expected output: backup notice (if a prior install exists), install path echo,
   and the post-install instructions ending with "Done."

2. Open **Ableton Live** (12+ recommended).

3. Go to **Live → Settings (⌘,) → Link / Tempo / MIDI**.

4. Under "Control Surface", set any empty slot to **AbletonOSC**. If AbletonOSC is
   already in a slot, toggle it off then on again (or use **Cmd+Shift+.** to reload
   remote scripts).

5. Open **Help → Show Live Log File** and confirm:
   - `AbletonOSC: Starting OSC server` appears without `ERROR` lines.
   - No Python tracebacks related to `track.py`.

**Pass:** No errors in the log; AbletonOSC slot shows green in the MIDI settings.

---

## Smoke 2 — Handler-presence probe (version check)

**Goal:** Confirm the app detects the patched fork via `probeHandler()` and completes
the setup checklist.

1. Start the app (`npm run dev` or launch the `.app`).
2. Open a set in Ableton Live (any set with at least one track).
3. Observe the connection status in the app header — it should show "Connected".
4. The setup checklist's **step ③ "Patched script detected"** should flip to ✓
   once the probe resolves (within ~600 ms of connect). Once all three steps are
   green the checklist collapses and is no longer visible.

**Pass:** Checklist is gone (all steps ✓); browser DevTools shows no
`/live/track/arrangement_writer_version` timeout errors in the server log.

---

## Smoke 3 — Apply lyrics to Ableton (core live-apply path)

**Goal:** Confirm the full stamp→apply round-trip places correct clips in the Arrangement.

Pre-conditions:
- AbletonOSC is loaded (Smoke 1 passed).
- A track named `+LYRICS` (or similar) exists in the open Ableton set.
- Ableton is playing (or at a known beat position) — note the current beat.

Steps:
1. In the app, select the **Lyrics** tab and load or enter a song with at least
   3 lyric lines.
2. In the app header, open the **track picker** and select the `+LYRICS` track.
3. Press **ArrowRight** (or Space) several times to stamp 3–5 lyric lines at
   different beat positions.
4. Confirm stamps appear in the stamp log with beat positions.
5. Click **"Apply to Ableton"**.
6. Expected: a success toast showing "Wrote N clips" (N = number of stamps).
7. Switch to the **Arrangement view** in Ableton Live.

Verify:
- [ ] N clips appear on the `+LYRICS` track at approximately the stamped beat positions.
- [ ] Each clip is named with the lyric text (e.g. "Amazing grace, how sweet the sound").
- [ ] Clip positions match the beat values shown in the app stamp log (within ±1 beat
  for live latency).
- [ ] The session slot 0 on the `+LYRICS` track is empty after apply (scratch clip cleaned up).

**Pass:** All clips present with correct names and positions; no error toasts; slot 0 empty.

---

## Smoke 4 — AbleSet reads live-placed clips

**Goal:** Confirm clips placed via `duplicate_clip_to_arrangement` are visible in the
AbleSet iPad app identically to `.als`-imported clips.

1. With the clips from Smoke 3 in the Arrangement, save the Ableton set.
2. Open the **AbleSet iPad app** and load the saved set.
3. Navigate to the section / song corresponding to the `+LYRICS` track.

Verify:
- [ ] Each live-placed clip appears in AbleSet's song list / marker list.
- [ ] Clip names match what was stamped in the app.

**Pass:** AbleSet shows the clips identically to an `.als`-export workflow.

---

## Smoke 5 — Setup checklist step ③ (negative path)

**Goal:** Confirm the checklist stays visible and step ③ stays unchecked when stock
(unpatched) AbletonOSC is loaded.

1. Temporarily swap out the remote script with the upstream ideoforms/AbletonOSC
   (or simply rename `abletonosc/track.py` to remove the custom handlers), reload
   remote scripts in Live (Cmd+Shift+.), and ensure the app is connected.
2. Observe the setup checklist.

Verify:
- [ ] The setup checklist remains visible (not all three steps are ✓).
- [ ] Step ② (connected) shows ✓ because the OSC connection is up.
- [ ] Step ③ **"Patched script detected"** stays unchecked — the probe does not
  detect the custom handler in the stock fork.
- [ ] The "Apply to Ableton" button is disabled while the checklist is visible.

**Pass:** Checklist visible with step ③ unchecked; Apply button disabled.

Restore the patched `track.py` when done.

---

## Smoke 6 — Existing export path unaffected

**Goal:** Confirm the `.als` / `.zip` export still works after live-apply changes.

1. With stamps from Smoke 3 still in the app, click **"Export .zip"**.
2. Open the `.zip` and verify the `.als` file loads in Ableton without errors.
3. Verify clip names and beat positions match the stamp log.

**Pass:** Export unchanged from pre-live-stamp behavior.

## Leadsheet "Apply to Ableton" (LS-A..LS-D) — manual, Ableton required

Prereqs: the updated fork must be installed (it adds `/live/song/get/project_path`).
1. `npm run install:remote-script` → **restart Ableton** (or toggle AbletonOSC off/on).
2. Open a **saved** Live set (must have a project folder on disk).
3. In the app, go to the **Leadsheet** tab → load a PDF → stamp a few pages at beats.
4. Pick a `+LYRICS` track in the picker → click **Apply to Ableton**.
5. Verify:
   - Toast `Wrote N clips · M images`.
   - On disk: `<ProjectFolder>/Lyrics/<slug>/page-N.png` exist (slug = PDF name minus `.pdf`).
   - Ableton Arrangement: clips on the track named `[img:<slug>/page-N.png] [full]` at the stamp beats, spanning to the next stamp.
   - **AbleSet** shows the right page image at the right time.
6. **Unsaved-set check:** with a brand-new unsaved set, Apply should toast **"Save your Ableton set first"** (409) and write nothing.

## In-app remote-script install (AbletonOSC setup checklist)

Requires a Mac where the patched script is not already current.

1. Quit Ableton Live. Launch LyricStamp → the **"Finish connecting…"** checklist
   appears with step ① showing **Install remote script**.
2. Click it → confirm files land in
   `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/` (including
   `ABLESET_FORK_VERSION`). Step ① flips to ✓.
3. In Live: Settings → Link/Tempo/MIDI → set a Control Surface to **AbletonOSC**,
   then quit and reopen Live. Watch step ② (connected) then step ③ (handler
   detected) self-check. The checklist disappears once all three are ✓.
4. **Update path:** edit the installed `ABLESET_FORK_VERSION` to an older value,
   relaunch LyricStamp → step ① shows **Update remote script**.
5. **Missing User Library:** temporarily rename `~/Music/Ableton/User Library`,
   relaunch → step ① shows **Locate your Ableton folder…**; pick a folder → install
   succeeds under it. Restore the folder name afterward.

### Packaged-app preload gate (verify on the .dmg build, not dev)

The folder picker relies on the Electron preload (`window.lyricstamp`). To guarantee
it loads in the packaged app, the preload is **unpacked from the asar** via
`"asarUnpack": ["out/preload/**"]` in `package.json` `build` (electron-builder places
it under `app.asar.unpacked/out/preload/`; Electron resolves the `app.asar/...` path to
it transparently). This is a confirmation step, not an expected failure:

6. In the packaged `.dmg` build, with `~/Music/Ableton/User Library` renamed so the
   default path is missing, the step-① button MUST read **"Locate your Ableton
   folder…"** (proving `window.lyricstamp` is defined). If it instead reads **"Open
   Ableton Live once, then retry."** the preload still isn't loading — first confirm
   `app.asar.unpacked/out/preload/preload.mjs` exists in the build, then check the
   `BrowserWindow` `preload:` path resolution in `electron/main.ts`. (In dev-browser
   mode "Open Ableton Live once" is expected and correct — this gate is packaged-app
   only.)
