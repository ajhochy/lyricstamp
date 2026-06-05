# Architecture — ableset-lyrics-sync

## App summary
Local macOS tool that bridges Ableton Live (via AbletonOSC) with a browser UI. The director loads a ChordPro song or PDF leadsheet, plays the song in Ableton, and stamps each lyric line/page to the current playback position using arrow keys. The output is an Ableton `.als` project with MIDI clips named and positioned at each stamp.

## Data flow (current, web-only)
```
Ableton Live
    ↕ OSC (port 11000/11001)
server/src/osc-client.ts     ← polls transport state, sends OSC commands
    ↕
server/src/index.ts (HTTP :7878 + WS /live)
    ↕ HTTP /api/*  +  WebSocket /live
client (Vite dev server :3000, proxies to :7878)
    → React UI: lyrics/leadsheet display, stamp log, export button
```

## Data flow (planned, Electron)
```
Ableton Live
    ↕ OSC (port 11000/11001)
server/src/index.ts  ← started via start() from Electron main process
    ↕ HTTP :7878 + WS /live
electron/main.ts     ← BrowserWindow loads http://127.0.0.1:7878 (prod)
                                         or http://localhost:3000 (dev)
    → React UI (served from :7878 static files in prod, Vite in dev)
```

## Major boundaries
- **OSC layer**: AbletonOSC remote script in Ableton Live ↔ `node-osc` in server
- **HTTP/WS layer**: Express-less raw `http.createServer` + `ws` library
- **Client/server split**: Vite proxy in dev; direct `http://127.0.0.1:7878` in Electron prod
- **Export layer**: `als-writer.ts` (binary `.als`), `zip-packer.ts` (leadsheet `.zip`)

## External / local dependencies
- **AbletonOSC**: must be installed as Ableton Remote Script by the user (one-time)
- **Ableton Live 11+**: must be running on the same machine
- **Apple Developer certificate**: required for code-signed `.app` distribution
