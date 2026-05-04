# AbleSet Sync — Backend Wiring Handoff (v2)

Hand the contents of this file, plus the design files (`AbleSet Sync.html`, `app.jsx`, `views.jsx`, `data.jsx`, `icons.jsx`, `styles.css`, `tweaks-panel.jsx`), to Claude Code.

---

## Context

**AbleSet Sync** is a local-only macOS web tool for worship music directors. It runs on the same machine as Ableton Live during song preparation. The director listens through a song, watches the lyric/leadsheet line currently expected, and uses the keyboard to stamp the song's playback time onto each line. The output is an Ableton `.als` project file with MIDI clips pre-positioned at those stamped times.

The UI is **already built and final** — see the attached HTML/JSX. Your job is to make it real: replace the mocked playback clock, mocked Ableton connection, mocked PDF rendering, and mocked export actions with working backend calls. Do not redesign the UI.

---

## Tech stack expected

- **Frontend:** React + Vite + TypeScript. Port the existing JSX to TS, wired through Vite. Use Tailwind CSS + shadcn/ui (`Tabs`, `Badge`, `Button`, `ScrollArea`, `Separator`, `Card`, `Input`, `Textarea`, `Tooltip`, `Sonner`) where the design uses an equivalent primitive — but keep the existing visual styling (colors, spacing, typography, accent, dark theme). Treat the prototype's CSS as the spec; shadcn primitives are scaffolding.
- **Backend:** local Node + TypeScript HTTP + WebSocket service started by the same dev command (`npm run dev`). The browser app talks to it on `ws://localhost:7878`. Use `concurrently` to run Vite and the Node server together.
- **Ableton bridge:** AbletonOSC — a free, open-source Remote Script for Ableton Live. **Not** `ableton-js`, **not** the AbletonJS MIDI script. See setup instructions below. Backend speaks OSC to Live on `udp://127.0.0.1:11000` (send) and listens on `127.0.0.1:11001` (receive). Use the `node-osc` npm package.
- **PDF rasterization:** Use `pdfjs-dist` in the browser (not the server) to render each PDF page to a canvas, then export as a PNG data URL. The backend never sees the raw PDF bytes for rendering — the frontend handles page display and ships PNG data URLs to the server only at export time.
- **`.als` writer:** Ableton project files are gzipped XML. Hand-rolled: `zlib.gunzip` → XML parse → mutate → serialize → `zlib.gzip`. Ship a known-good template `.als` in `templates/blank-stamp-track.als` containing one MIDI track named `Vocals +LYRICS` with no clips; clone it on export and inject one short MIDI clip per stamp at the stamped beat position.

---

## One-time setup — AbletonOSC (document in README.md)

AbletonOSC is the bridge between this app and Ableton Live. It must be installed once per machine:

1. Download AbletonOSC from `https://github.com/ideoforms/AbletonOSC` (clone or download ZIP).
2. Copy the `AbletonOSC` folder into Ableton's Remote Scripts directory:
   - macOS: `~/Music/Ableton/User Library/Remote Scripts/`
3. In Ableton Live → Preferences → Link / Tempo / MIDI → Control Surfaces:
   - Set one Control Surface slot to `AbletonOSC`.
4. Ableton's status bar should show: `AbletonOSC: Listening for OSC on port 11000`.

The app will show **Disconnected** until this is done and a Live session is open.

**Generate the blank `.als` template:**
- Run `npm run generate-template` after first install. This script creates `templates/blank-stamp-track.als` — a minimal Ableton 11 project containing one empty MIDI track named `Vocals +LYRICS`. This template is the base for all exports.

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
  imageRef: string;      // e.g. "page2.png" — filename used inside the zip
  pngDataUrl: string;    // base64 PNG of the page — captured by pdfjs in browser, sent at export
  ts: number;            // seconds since song start
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
| `→`       | Lyrics tab: append a stamp at current `ts`, advance cursor to next text line. Leadsheet tab: stamp current page + advance to next page. |
| `←`       | Lyrics tab: append a stamp at current `ts`, move cursor to previous text line. Leadsheet tab: stamp current page + go back to previous page. |
| `E`       | Export. Lyrics → `.als`. Leadsheet → `.zip` (see below). |
| `T`       | Switch tab. |

`<input>`/`<textarea>` focus must suppress all of these — the existing handler does this; keep it.

---

## Leadsheet tab — PDF rendering (frontend, pdfjs-dist)

The design prototype renders fake chord chart data from `data.jsx`. Replace this entirely with real PDF rendering:

1. User drops or selects a PDF file via the "Change PDF" button.
2. Frontend loads it with `pdfjs-dist` (`import * as pdfjsLib from 'pdfjs-dist'`). Set the worker: `pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'` (copy worker from `node_modules/pdfjs-dist/build/` into `public/`).
3. Render the current page to an offscreen `<canvas>` at **1.5x device pixel ratio** for sharpness on Retina displays, then draw it into the visible `<canvas>` in the viewer area.
4. Page count drives the "page X of Y" indicator.
5. Arrow keys navigate pages AND stamp (as per keyboard contract above).
6. At export time, render **all stamped pages** to PNG data URLs (canvas → `toDataURL('image/png')`) and include them in the POST body to `/api/export/zip`.

Do not send the PDF to the server. All rendering is browser-side.

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
The header's live time, BPM, play-state pill, and Connected/Disconnected badge are all driven by this stream. When the WebSocket itself drops, immediately render `Disconnected` regardless of last-known Ableton state.

### HTTP

- `POST /api/song` — body `{ name: string; chordpro: string }`. Parse ChordPro into the `Song` shape; return parsed `Song`. The Lyrics tab's "Reload song" button calls this.
- `POST /api/export/als` — body `{ song: Song; stamps: LyricStamp[] }`. Returns a binary `.als` (gzipped XML) as `application/octet-stream` with `Content-Disposition: attachment; filename="<song.name>.als"`.
- `POST /api/export/zip` — body `{ song: Song; stamps: SheetStamp[] }` where each `SheetStamp` includes a `pngDataUrl`. Returns a `.zip` containing:
  - One PNG file per **unique stamped page** (e.g. `page2.png`, `page5.png`) — decoded from the data URLs in the request body.
  - A `Lyrics/` subfolder containing those PNGs — matching the folder structure AbleSet expects for image references.
  - A `stamps.json` manifest listing each stamp with its `ts`, `page`, `imageRef`, and `region`.
  - A `Stamps.als` — a full Ableton project file with one MIDI clip per stamp, each named `[img:pageN.png]` at the correct beat position. **This makes the leadsheet export drag-into-Ableton ready**, not just a zip of images.

---

## OSC mapping (backend ↔ Ableton)

Use `node-osc` npm package. AbletonOSC must be installed as described above.

| UI need              | OSC out (`→ Ableton`)                  | OSC in (`← Ableton`)                    |
|----------------------|----------------------------------------|------------------------------------------|
| Live song time       | `/live/song/get/current_song_time`     | `/live/song/get/current_song_time` reply |
| BPM                  | `/live/song/get/tempo`                 | `/live/song/get/tempo` reply             |
| Play state           | `/live/song/get/is_playing`            | `/live/song/get/is_playing` reply        |
| Play                 | `/live/song/start_playing`             | —                                        |
| Pause                | `/live/song/stop_playing`              | —                                        |
| Connection heartbeat | `/live/test`                           | `/live/test` reply within 500 ms         |

Poll `current_song_time`, `tempo`, and `is_playing` together at 10 Hz. Bundle into a single `tick` WebSocket message per cycle.

**Connected badge logic:** backend pings `/live/test` every 1 s; if no reply arrives within 2 s, push `{ type: "connection", connected: false }` to all WebSocket clients.

---

## `.als` export — algorithm (both tabs)

1. Load `templates/blank-stamp-track.als`. Gunzip → parse XML with a standard XML parser.
2. Locate the single MIDI track element named `Vocals +LYRICS`.
3. For each stamp, compute `beats = ts * (bpm / 60)`.
4. Append one `<MidiClip>` element per stamp:
   - `Time` attribute = computed beats (Ableton's internal time unit is beats).
   - `Length` = `0.25` (a sixteenth note — a short marker).
   - One MIDI note: pitch `60` (C3), velocity `100`, duration = `0.25`.
   - **Lyrics tab** clip name: `<lineIdx+1>: <lineText truncated to 24 chars>`
   - **Leadsheet tab** clip name: `[img:pageN.png]` — AbleSet reads this to display the image.
5. Re-serialize XML → gzip → return as binary.

This algorithm applies to **both** the lyrics `.als` and the `Stamps.als` inside the leadsheet `.zip`. The only difference is the clip naming.

---

## Tweaks → real persistence

The prototype stores tweaks via `__edit_mode_set_keys` (a design-tool affordance). In production, persist to `localStorage` under key `ableset-sync.tweaks`. Hydrate on mount; write on every change. Same default values as in `app.jsx`'s `TWEAK_DEFAULTS`.

---

## README.md — required deliverable

Generate a `README.md` at project root covering:
- What the tool does (2–3 sentences)
- Prerequisites: Node 18+, Ableton Live 11+
- AbletonOSC install steps (copied from the setup section above)
- `npm install && npm run generate-template && npm run dev`
- Keyboard shortcut reference
- Known limitations (no Windows support, requires Ableton on same machine)

---

## Things to NOT change

- The visual hierarchy: header → setup strip → 2-column workspace → hint bar.
- The accent system (`oklch`-based, swappable via `data-accent` on `<html>`).
- Monospace for everything timestamp-y (`JetBrains Mono`, `tnum` features).
- The hint bar is a hint bar — not a button row. Don't make the kbds clickable.
- The current-lyric line uses `text-wrap: balance` and a 220 ms entry transition keyed on the line text. Keep both.

---

## Acceptance tests

1. **Ableton connection:** Start Ableton with AbletonOSC enabled, load any `.als`. Run `npm run dev`. Open `localhost:3000` — badge flips to **Connected** within 2 s, header time mirrors Live's transport in real time.
2. **Play/pause:** Press `Space` — Live transport toggles; play-state pill animates.
3. **Lyrics stamping:** Paste ChordPro lyrics, hit Reload. Press `→` repeatedly — stamps land in the log with timestamps matching Live's playhead within ±100 ms. Press `←` — cursor steps back and stamps correctly.
4. **Lyrics export:** Press `E` on the Lyrics tab — `.als` downloads. Open in Live: the `Vocals +LYRICS` track contains one short MIDI clip per stamp at the correct beat positions, named after the lyric line.
5. **Leadsheet PDF:** Drop a real PDF into the Leadsheet tab — pages render correctly at full quality. Arrow keys navigate pages freely (including revisiting the same page for repeats). Stamp log reflects each visit.
6. **Leadsheet export:** Press `E` on the Leadsheet tab — `.zip` downloads. Unzip: confirm `Lyrics/` folder contains one PNG per stamped page, `stamps.json` is correct, and `Stamps.als` opens in Ableton with `[img:pageN.png]`-named clips at the right positions.
7. **Tweaks persistence:** Change accent color and log density in the tweaks panel. Reload the page — settings are preserved.

All seven must pass before shipping.
