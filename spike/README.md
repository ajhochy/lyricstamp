# Spike: write lyric clips into the live Ableton Arrangement (avoid the `.als` import)

**Question:** can we skip the export-zip / import step by placing named `+LYRICS`
clips directly into the running Ableton **Arrangement** at beat positions, live?

**Finding so far (static):**
- ableton-mcp and stock AbletonOSC can only create **session-view** clips — neither
  exposes arrangement placement.
- The Live Object Model **does** have `Track.duplicate_clip_to_arrangement(clip, beat)`
  (Live 11+), confirmed in the LOM reference. AbletonOSC just doesn't surface it.

So the spike = add **one handler** to AbletonOSC that calls that LOM method, then drive it.

## The AbletonOSC patch (out-of-repo)

Applied to `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/abletonosc/track.py`,
just after the `track_delete_clip` handler registration. A timestamped `.bak` was made
next to it before editing.

```python
#--------------------------------------------------------------------------------
# SPIKE (ableset-lyrics-sync): place a named session clip into the Arrangement
# at a beat position, live — the capability stock AbletonOSC does not expose.
#   /live/track/duplicate_clip_to_arrangement track_index clip_index dest_beat
#--------------------------------------------------------------------------------
def track_duplicate_clip_to_arrangement(track, params):
    clip_index, destination_time = params
    clip = track.clip_slots[int(clip_index)].clip
    track.duplicate_clip_to_arrangement(clip, float(destination_time))
    return (int(clip_index), float(destination_time))

self.osc_server.add_handler("/live/track/duplicate_clip_to_arrangement",
                            create_track_callback(track_duplicate_clip_to_arrangement))
```

**Reload after patching:** Ableton → Settings → Link/Tempo/MIDI → Control Surface →
set AbletonOSC slot to None, then back to AbletonOSC (or restart Live). Remote scripts
only load at startup / surface (re)selection.

**Revert:** restore the `track.py.bak-*` file and reload.

## Running the test

```bash
# Ableton open with the PATCHED + reloaded AbletonOSC; OSC reply port 11001 free
# (quit the AbleSet Sync app first — it binds 11001).
node spike/arrangement-osc-test.mjs
```

The harness creates a `SPIKE +LYRICS` track, makes a clip named "SPIKE — Amazing grace",
calls `/live/track/duplicate_clip_to_arrangement <track> 0 8`, then reads back
`/live/track/get/arrangement_clips/{name,start_time}` to confirm the named clip landed
in the arrangement near beat 8. Eyeball it in AbleSet afterward.

## Status

- [x] LOM method confirmed to exist
- [x] AbletonOSC handler patched + harness written
- [ ] Live test run (named clip lands in arrangement at beat)
- [ ] AbleSet reads the live-placed clip identically to `.als` output

If both unchecked boxes pass, the real implementation (a shipped/forked AbletonOSC
command + app OSC integration to replace the `.als` export) routes through the normal
workflow as its own PR.
