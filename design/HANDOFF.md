# AbleSet Sync — Backend Wiring Handoff

Hand the contents of this file, plus the design files (`AbleSet Sync.html`, `app.jsx`, `views.jsx`, `data.jsx`, `icons.jsx`, `styles.css`, `tweaks-panel.jsx`), to Claude Code.

---

## Context

**AbleSet Sync** is a local-only macOS web tool for worship music directors. It runs on the same machine as Ableton Live during song preparation. The director listens through a song, watches the lyric/leadsheet line currently expected, and uses the keyboard to stamp the song's playback time onto each line. The output is an Ableton `.als` project file (or a `.zip` of page images for leadsheets) with MIDI clips pre-positioned at those stamped times.

The UI is **already built and final** — see the attached HTML/JSX. Your job is to make it real: replace the mocked playback clock, mocked Ableton connection, and mocked export action with working backend calls. Do not redesign the UI.

---

## Tech stack expected

- **Frontend:** React + Vite + TypeScript. Port the existing JSX to TS, wired through Vite. Use Tailwind CSS + shadcn/ui (`Tabs`, `Badge`, `Button`, `ScrollArea`, `Separator`, `Card`, `Input`, `Textarea`, `Tooltip`, `Sonner`) where the design uses an equivalent primitive — but keep the existing visual styling (colors, spacing, typography, accent, dark theme). Treat the prototype's CSS as the spec; shadcn primitives are scaffolding.
- **Backend:** local Node (or Bun) HTTP + WebSocket service started by the same dev command. The browser app talks to it on `ws://localhost:PORT`.
- **Ableton bridge:** Ableton Live Suite/Standard with the **Ableton OSC** Max for Live device (`AbletonOSC`) installed. Backend speaks OSC to Live on `udp://127.0.0.1:11000` (send) and listens on `127.0.0.1:11001` (receive).
- **`.als` writer:** Ableton project files are gzipped XML. Use a small library (e.g. `pyflp`-style approach in JS, or hand-rolled — `zlib.gunzip` → DOM-parse → mutate → serialize → `gzip`). Ship a known-good template `.als` in `templates/blank-stamp-track.als` containing one MIDI track named "Stamps" with no clips; clone it on export and inject one short MIDI clip per stamp at the stamped beat position.

---

## Data contracts

### Stamp (lyrics)
```ts
type LyricStamp = {
  id: string;            // uuid
  lineIdx: number;       // index into the loaded song's `lines[]`
  lineText: string;      // resolved text at stamp time (denormalized for log)
  section: string | null;
  ts: number;            // seconds since song start (one decimal precision)
  beats: number;         // ts * (bpm / 60), computed at export time
};
```

### Stamp (leadsheet)
```ts
type SheetStamp = {
  id: string;
  page: number;          // 1-based
  region: string;        // freeform label (e.g. "Chorus L1") — optional
  imageRef: string;      // e.g. "page2.jpg" — produced when PDF is rasterized
  ts: number;
};
```

### Song
```ts
type Song = {
  name: string;
  bpm: number;
  key: string;
  lines: Array<{ section?: string; text?: string }>; // exactly the shape used in data.jsx
};
```

---

## Keyboard contract (already wired in UI — preserve exactly)

| Key       | Action |
|-----------|--------|
| `Space`   | Toggle Ableton play/pause via OSC (`/live/song/start_playing`, `/live/song/stop_playing`). Optimistically flip the play-state pill. |
| `→`       | Lyrics tab: append a stamp at current `ts`, advance cursor to next text line. Leadsheet tab: next page. |
| `←`       | Lyrics tab: append a stamp at current `ts`, move cursor to previous text line. Leadsheet tab: prev page. |
| `E`       | Export. Lyrics → `.als`. Leadsheet → `.zip` of page PNGs + a `stamps.json` manifest. |
| `T`       | Switch tab. |

`<input>`/`<textarea>` focus must suppress all of these — the existing handler does this; keep it.

---

## Backend endpoints

### WebSocket: `ws://localhost:7878/live`
Push channel from backend to UI. Single message shape:
```ts
type LiveMsg =
  | { type: "tick"; ts: number; bpm: number; playing: boolean }   // ~10 Hz
  | { type: "connection"; connected: boolean }                     // on Ableton handshake change
  | { type: "song"; bpm: number; tempo: number; signature: string };
```
The header's live time, BPM, play-state pill, and Connected/Disconnected badge are all driven by this stream. When the websocket itself drops, immediately render `Disconnected` regardless of last-known Ableton state.

### HTTP

- `POST /api/song` — body `{ name: string; chordpro: string }`. Parse ChordPro into the `Song` shape; return parsed `Song`. The Lyrics tab's "Reload song" button calls this.
- `POST /api/leadsheet` — multipart upload of a PDF. Backend rasterizes each page to PNG at 150 dpi, returns `{ pages: number; thumbnails: string[] }` (data URLs or short-lived URLs).
- `POST /api/export/als` — body `{ song: Song; stamps: LyricStamp[] }`. Returns a binary `.als` (gzipped XML) as `application/octet-stream` with `Content-Disposition: attachment; filename="<song.name>.als"`.
- `POST /api/export/zip` — body `{ song: Song; stamps: SheetStamp[]; pdfId: string }`. Returns a binary `.zip` containing one PNG per stamped page plus `stamps.json`.

---

## OSC mapping (backend ↔ Ableton)

Use AbletonOSC (`https://github.com/ideoforms/AbletonOSC`) — install as a Remote Script in Live's MIDI Remote Scripts folder.

| UI need              | OSC out                                | OSC in                                   |
|----------------------|----------------------------------------|------------------------------------------|
| Live song time       | `/live/song/get/current_song_time`     | `/live/song/get/current_song_time` reply (poll @ 10 Hz) |
| BPM                  | `/live/song/get/tempo`                 | `/live/song/get/tempo` reply             |
| Play state           | `/live/song/get/is_playing`            | `/live/song/get/is_playing` reply        |
| Play/pause           | `/live/song/start_playing` / `/live/song/stop_playing` | — |
| Connection heartbeat | `/live/test`                            | `/live/test` reply within 500 ms          |

The "Connected" badge logic: backend pings `/live/test` every 1 s; if no reply for 2 s, push `{type: "connection", connected: false}`.

---

## `.als` export — algorithm

1. Load `templates/blank-stamp-track.als`. Gunzip → parse XML.
2. For each `LyricStamp`, compute `beats = ts * (song.bpm / 60)`.
3. Inside the "Stamps" track, append one MIDI clip per stamp:
   - Start time (beats) = computed beats.
   - Length = 0.25 beats (a sixteenth — short enough to feel like a marker).
   - One MIDI note at pitch C3 (60), velocity 100, duration = clip length.
   - Clip name = `<lineIdx+1>: <lineText truncated to 24 chars>` so the user can see them in Session/Arrangement view.
4. Re-serialize XML, gzip, return.

For leadsheet `.zip`: same idea but write a `stamps.json` array — Ableton wiring for image-based stamps is a future enhancement; the zip is the deliverable for now.

---

## Tweaks → real persistence

The prototype stores tweaks via `__edit_mode_set_keys` (a design-tool affordance). In production, persist to `localStorage` under key `ableset-sync.tweaks`. Hydrate on mount; write on every change. Same default values as in `app.jsx`'s `TWEAK_DEFAULTS`.

---

## Things to NOT change

- The visual hierarchy: header → setup strip → 2-column workspace → hint bar.
- The accent system (`oklch`-based, swappable via `data-accent` on `<html>`).
- Monospace for everything timestamp-y (`JetBrains Mono`, `tnum` features).
- The hint bar is a hint bar — not a button row. Don't make the kbds clickable.
- The current-lyric line uses `text-wrap: balance` and a 220 ms entry transition keyed on the line text. Keep both.

---

## Acceptance test

1. Start Ableton with the `AbletonOSC` script enabled, load any `.als` with a song-length tempo track.
2. Run `npm run dev`. Open the app — badge flips to **Connected** within 2 s, header time mirrors Live's transport.
3. Press `Space` — Live transport toggles; pill animates.
4. Paste lyrics in setup, hit Reload. Press `→` repeatedly through a song — stamps land in the log with timestamps matching Live's playhead within ±100 ms.
5. Press `E` — `.als` downloads. Open in Live: the "Stamps" track contains one short MIDI clip per stamp at the correct beat positions, named after the lyric.
6. Tweaks panel persists across reload.

If all six pass, ship it.
