# Decisions — ableset-lyrics-sync

## 2026-06-05 — afterSign notarization hook (scripts/notarize.cjs)

**Decision**: Add an explicit `afterSign` hook in `scripts/notarize.cjs` for notarization, and set `"mac": { "notarize": false }` to disable electron-builder 26's built-in `notarizeIfProvided()` path.

**Context**: electron-builder 26 already reads `APPLE_API_KEY*` / `APPLE_ID*` env vars and calls `@electron/notarize` internally (in `macPackager.notarizeIfProvided`). However, with a custom `mac.sign` hook the sequencing is harder to reason about and CI failures are hard to diagnose. An explicit `afterSign` hook makes the notarization step visible, guarded, and testable.

**Why disable `mac.notarize`**: Without `"notarize": false`, both the `afterSign` hook AND the built-in `notarizeIfProvided` would run in CI (both detect the same `APPLE_API_KEY*` env vars), causing a double submission to Apple's notary service. Setting `"notarize": false` disables the built-in path — confirmed by reading `node_modules/app-builder-lib/out/macPackager.js:503` (`if (notarizeOptions === false) { ... return; }`).

**Credential strategy**: API key (`APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`) is the preferred path — CI exports these from the `.p8` key content secret. Apple-ID + app-specific password is the fallback. When neither is present the hook logs and returns (no-op), so local `electron:dist` never fails.

**Stapling**: After `notarize()` resolves, the hook calls `xcrun stapler staple <appPath>` so the ticket is embedded and the DMG is mountable offline.

**Consequences**:
- `scripts/notarize.cjs` — new afterSign hook
- `package.json` — `"afterSign": "scripts/notarize.cjs"` + `"mac": { "notarize": false }`
- `docs/release-notarization.md` — new doc: 5 GitHub secrets, how to obtain them, how to trigger a release
- The old `docs/ai/decisions.md` entry "2026-06-02 — Distribution target: small team" is superseded; notarization now ships.

---

## 2026-06-05 — POST /api/live/apply accepts song+stamps (not pre-formatted clips)

**Decision**: Changed `POST /api/live/apply` to accept `{ trackIndex, song, stamps }` (the same shape as the `.als` export endpoint) rather than `{ trackIndex, clips: [{name, beat}] }`. A new exported `stampsToClips(song, stamps)` helper converts stamps to `{name, beat}` pairs server-side using the same logic as the `.als` export route.

**Why**: If the client had to pre-format clip names, it would duplicate the clip-name logic that already exists in the export route (`stamp.text ?? song.lines[stamp.idx]?.text`). A shared server-side formatter guarantees live-applied clips and `.als` export clips carry identical names — important for AbleSet to treat them consistently. The `stampsToClips` function is exported and directly tested against the expected formatter output.

**Consequences**:
- `routes.ts`: `handlePostLiveApply` validates `song.lines` + `stamps[*].{idx, ts}` instead of `clips[*].{name, beat}`
- `routes.test.ts`: all apply tests now send `{ trackIndex, song, stamps }` and assert clip names come from song lines
- Client `app.tsx`: `applyToAbleton()` sends `{ trackIndex: liveTrackIndex, song, stamps }` — no client-side name formatting needed

---

## 2026-06-05 — Bundle patched AbletonOSC as a vendor fork (live-stamp-write)

**Decision**: Vendor a forked copy of AbletonOSC (MIT) into `vendor/AbletonOSC/`
with a single additive handler added to `abletonosc/track.py`, and ship an
`npm run install:remote-script` script that copies it to
`~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/`.

**Context**: The live-stamp-write feature requires one AbletonOSC OSC handler
(`/live/track/duplicate_clip_to_arrangement`) that does not exist in the upstream
project.  Three delivery options were considered:

1. **Vendor a fork** (chosen): copy the full AbletonOSC source tree into
   `vendor/AbletonOSC/`, apply the patch, commit it.  A `scripts/install-remote-script.mjs`
   script copies it to the user's Remote Scripts folder.  `electron-builder`
   includes it in `extraResources` so the packaged `.app` can install it without
   the user downloading anything separately.
2. **Patch docs + manual user instruction**: ship no code, just document the
   6-line patch and ask users to apply it themselves.  Rejected: fragile
   (users can't apply diffs reliably), friction for new team members, breaks
   "install and use" promise of the Electron app.
3. **Submit upstream PR to AbletonOSC**: correct long-term but not actionable on
   our timeline.  AbletonOSC is a community project; PR acceptance is uncertain
   and could take months.

**Upstream drift**: `vendor/.upstream-sha` records the upstream commit the fork
was cut from.  When upstream releases a new version, a manual rebase of the
single patch file (`abletonosc/track.py`) onto the new release is straightforward
because the patch is additive (one `add_handler` block; does not touch any
existing handler).  An optional `scripts/check-upstream.mjs` can surface new
releases.

**Consequences**:
- `vendor/AbletonOSC/` is a committed source tree (~50 files, <200 KB), not a binary.
- Users who already have AbletonOSC installed will have it replaced (or must
  manually merge) — documented clearly in the install script's output.
- If the user's existing AbletonOSC is a custom fork, the install script offers
  a skip option.
- The app works without running `install:remote-script` as long as the user has
  previously installed the patched script; the handler-presence probe detects this.

---

## 2026-06-05 — Server-side session storage (origin-independent)

**Decision**: Store named sessions on the server filesystem under `<dataDir>/sessions-data/` (`<id>.json` + `<id>.pdf`) rather than browser IndexedDB.

**Context**: IndexedDB is origin-partitioned — sessions saved at `localhost:3000` (dev) are invisible to the packaged Electron app at `127.0.0.1:7878`. The user had two real sessions stranded in the dev-origin store.

**Data dir resolution** (priority): `ABLESET_DATA_DIR` (tests/CI) → `ELECTRON_USER_DATA` (set by `electron/main.ts` before `start()`) → derived `~/Library/Application Support/ableset-lyrics-sync` (macOS). All three processes (dev tsx server, packaged Electron in-process server, and E2E test server) resolve to the same location.

**Alternatives considered**:
- Keep IndexedDB + duplicate data across origins — fragile and user-hostile
- Electron `contextBridge` + IPC for storage — requires preload script, breaks non-Electron dev mode

**Consequences**:
- `client/src/session-store.ts` fully rewrites with `fetch()` — same exports so `app.tsx` is unchanged
- One-time migration: `client/src/migrate-sessions.ts` reads legacy IDB sessions and POSTs them to the server API; guarded by `localStorage['ableset-sync.migrated-v1']`; called on `App` mount
- PDF bytes round-trip via `GET /api/sessions/:id/pdf`; metadata (name, type) stored in the `.json` sidecar
- E2E tests always use a throwaway `ABLESET_DATA_DIR` temp dir — user's real sessions are never touched by tests
- `getSession` returns `state: Record<string, unknown>` (not `unknown`) to satisfy the contract test's `full!.state.songName` access without a cast

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
