# Decisions — ableset-lyrics-sync

## 2026-06-02 — Electron wrapper approach: electron-vite

**Decision**: Use electron-vite (Option A) over electron-forge or manual Electron + child process fork.

**Context**: App has an existing Vite/React client and a plain Node.js server. Team distribution requires code signing but not notarization.

**Alternatives considered**:
- B: Electron + child process fork — more server isolation but more boilerplate, no hot reload
- C: electron-forge — more future-proof for auto-updates but heavy config overhead

**Consequences**:
- `"type": "module"` requires electron-vite to output `.cjs` for main process — handled automatically
- In production the server serves static client files at `:7878`, so the BrowserWindow points to `http://127.0.0.1:7878` (no file:// relative URL issues)
- Dev workflow unchanged: `npm run dev` still runs client + server via concurrently

## 2026-06-04 — Ableton Live version compatibility for .als template (#26)

**Decision**: Patch `MinorVersion` / `Creator` attributes in the gzipped template XML at export time (or use a native Live 12 template binary) rather than shipping multiple version-specific templates.

**Context**: `templates/blank-stamp-track.als` was authored in Live 11.3. Live 12 rejects files with a Live 11 MinorVersion string. Patching the XML attribute after gunzip avoids requiring the user to maintain multiple template files.

**Alternatives considered**:
- Ship separate `blank-stamp-track-live11.als` and `blank-stamp-track-live12.als` — adds file management complexity and user configuration
- Let users regenerate the template from their Live version — requires documented tooling and a `generate-template` step

**Consequences**:
- Live 11 compatibility is unverified after the patch; cross-version manual smoke needed before shipping to Live 11 users
- The backup of the original Live 11 template is at `templates/blank-stamp-track.als.live11.bak`

## 2026-06-04 — ChordPro chord display: inline concatenation (#27)

**Decision**: Concatenate chord + lyric text inline (`[G]Amazing grace`) in `chordpro.ts` rather than rendering a chord-above-lyric grid via `HtmlTableFormatter`.

**Context**: The original design stripped chords entirely; the smoke test revealed users need to see chord notation in the stamp preview to navigate the song. Full chord-grid rendering (HtmlTableFormatter) would require adding a separate preview component and CSS.

**Alternatives considered**:
- Client-side `HtmlTableFormatter` rendering — richer visual but requires importing chordsheetjs in the client bundle and adding CSS
- Server-side HTML rendering — couples presentation to the API layer

**Consequences**:
- Chord names appear inline before the lyric word: `[G]Amazing grace [D]how sweet the [Em]sound`
- Stamp clip names in the exported `.als` now include chord annotations — may look noisy in Ableton's clip view
- A follow-up issue should add proper chord-grid rendering in the client if users find inline chords hard to read

## 2026-06-02 — Distribution target: small team (code signing, no notarization)

**Decision**: Target Apple Developer ID Application certificate signing for Gatekeeper bypass on team machines. Skip full notarization for now.

**Context**: App is macOS-only, AbletonOSC integration requires localhost OSC — not suitable for public App Store.

**Consequences**: Team members may need to right-click → Open on first launch if Gatekeeper still prompts despite signing.
