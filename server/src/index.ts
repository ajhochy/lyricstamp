import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OscClient } from './osc-client.js';
import { attachWebSocketServer } from './ws-server.js';
import { handleRequest, setOscClient } from './routes.js';

const HOST = '127.0.0.1';
const PORT = 7878;

export async function start(): Promise<void> {
  // Instantiate and start the OSC client on server boot.
  const oscClient = new OscClient();

  oscClient.on('connection', ({ connected }) => {
    console.log(`[server] Ableton Live ${connected ? 'connected' : 'disconnected'}`);
  });

  // Wire the OSC client into routes so live-write endpoints can use it.
  setOscClient(oscClient);

  oscClient.start();

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err: unknown) => {
      console.error('[server] Unhandled route error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  // Attach the WebSocket broadcast server on the same HTTP server at path /live.
  attachWebSocketServer(server, oscClient);

  // Wire up the reject handler BEFORE calling listen so that EADDRINUSE and
  // other bind errors are caught by the surrounding try-catch in callers
  // (e.g. electron/main.ts) rather than surfacing as uncaught exceptions.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => {
      server.off('error', reject);
      console.log(`AbleSet Sync server listening on :${PORT}`);
      console.log(`WebSocket endpoint: ws://${HOST}:${PORT}/live`);
      resolve();
    });
  });
}

// Auto-start only when this file is the direct entry point (tsx / node).
// When imported by electron/main.ts the caller manages startup explicitly.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  start().catch((err: unknown) => {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  });
}
