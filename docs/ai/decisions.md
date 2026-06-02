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

## 2026-06-02 — Distribution target: small team (code signing, no notarization)

**Decision**: Target Apple Developer ID Application certificate signing for Gatekeeper bypass on team machines. Skip full notarization for now.

**Context**: App is macOS-only, AbletonOSC integration requires localhost OSC — not suitable for public App Store.

**Consequences**: Team members may need to right-click → Open on first launch if Gatekeeper still prompts despite signing.
