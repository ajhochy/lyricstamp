# Fix: .als export incompatible with Ableton Live 12 (MinorVersion mismatch)

## Problem

Ableton Live 12 rejects `.als` files exported by this app with:

```
The document is corrupt and cannot be loaded.
(Unsupported MinorVersion (11.0.11202) (at line 3, column 10))
```

## Root cause

`templates/blank-stamp-track.als` was generated with **Ableton Live 11.3**. Its XML header:

```xml
<Ableton MajorVersion="5" MinorVersion="11.0.11202" Creator="Ableton Live 11.3" ...>
```

Live 12 expects `MinorVersion` in the format `12.0.NNNNN` (e.g. `12.0.12049`). Live is strict — it refuses to open files from a different major release.

## Research findings

- Community-reported Live 12 MinorVersion values: `12.0.12049`, `12.0.12203`, `12.0.12300`
- Format changed from `11.0.NNNNN` (dots only) to `12.0.NNNNN` between Live 11 and 12
- The XML lives inside a gzip archive; `als-writer.ts` decompresses → injects clips → recompresses
- MajorVersion `"5"` appears constant across both versions (schema version, not app version)

## Acceptance criteria

- [ ] Exported `.als` opens in Ableton Live 12 without error
- [ ] `.als` still opens in Live 11 OR we document the Live 12 minimum requirement

## Likely files

- `templates/blank-stamp-track.als` — regenerate with Live 12
- `server/src/als-writer.ts` — optionally patch MinorVersion/Creator strings after decompressing

## Suggested approach

**Option A (zero-code, preferred):** Open a blank Live 12 project with one MIDI track, File → Save a Copy → commit as `templates/blank-stamp-track.als`. Update the comment in `als-writer.ts` to say "Live 12".

**Option B (code fix, no template change):** In `als-writer.ts`, after decompressing the template XML, `replace(/MinorVersion="[^"]*"/, 'MinorVersion="12.0.12049"')` and `replace(/Creator="[^"]*"/, 'Creator="Ableton Live 12"')` before re-gzipping. Brittle but unblocks users without needing a new template binary.

**Option C (best long-term):** Accept a `liveVersion` param from the UI (user selects Live 11 or 12) and patch accordingly.

Postmortem: `.agent-stack/postmortems/2026-06-02-issue-1.json` criterion issue-1-c2
