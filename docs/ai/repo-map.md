# Repo Map — ableset-lyrics-sync

## Top-level structure
```
ableset-lyrics-sync/
├── client/               # Vite + React frontend
│   ├── src/              # React components, hooks, styles
│   ├── public/           # Static assets (pdf.worker.min.js)
│   └── vite.config.ts    # Vite config (port 3000, proxies /api + /live)
├── server/
│   └── src/
│       ├── index.ts      # Entry point — starts HTTP + OSC
│       ├── routes.ts     # HTTP API handlers
│       ├── ws-server.ts  # WebSocket broadcast server (/live)
│       ├── osc-client.ts # AbletonOSC bridge (port 11000/11001)
│       ├── als-writer.ts # Exports .als project files
│       ├── chordpro.ts   # ChordPro parser
│       └── zip-packer.ts # Leadsheet .zip export
├── shared/               # Shared TypeScript types (client + server)
├── scripts/
│   └── generate-template.ts  # One-time: builds templates/blank-stamp-track.als
├── templates/
│   └── blank-stamp-track.als # Committed Ableton template binary
├── docs/
│   └── ai/               # AI workflow context files
├── package.json          # Root — "type": "module", concurrently dev setup
├── tsconfig.base.json    # Shared TS config
└── vitest.config.ts      # Test runner config
```

## Important files for Electron work
- `server/src/index.ts` — needs `start()` export refactor
- `client/vite.config.ts` — will be superseded by `electron.vite.config.ts`
- `package.json` — needs `"main"` field + electron scripts + build config

## Generated / ignored areas
- `node_modules/`
- `dist/` — electron-builder output (`.app`, `.dmg`)
- `out/` — electron-vite build output
- `client/dist/` — Vite client build output
- `server/dist/` — tsc server build output
