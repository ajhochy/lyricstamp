import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { start } from '../server/src/index.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_URL = 'http://127.0.0.1:7878';

app.whenReady().then(async () => {
  // Tell the server where the built renderer lives.
  // In the packaged app, app.getAppPath() returns the .asar path — Electron's
  // patched fs can read inside it, so this resolves correctly at request time.
  // In dev mode the Vite dev server handles the renderer; no static dir needed.
  if (!isDev) {
    process.env.ELECTRON_STATIC_DIR = path.join(app.getAppPath(), 'out', 'renderer');
  }

  try {
    await start();
  } catch (err: unknown) {
    const isAddrInUse =
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'EADDRINUSE';

    if (isAddrInUse) {
      // Another instance or a stale dev server is already running — check
      // whether it is healthy enough to reuse before giving up.
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`);
        const body = await res.json() as { ok?: boolean };
        if (body.ok === true) {
          console.log('[electron] Reusing existing AbleSet Sync backend on :7878');
          // fall through and open the window
        } else {
          throw new Error('Existing backend on :7878 is unhealthy');
        }
      } catch {
        dialog.showErrorBox(
          'Unable to start AbleSet Sync',
          'Port 7878 is already in use and the existing backend is not healthy.\n\nQuit any other AbleSet Sync instance, then relaunch.',
        );
        app.quit();
        return;
      }
    } else {
      const message = err instanceof Error ? err.message : String(err);
      dialog.showErrorBox('Unable to start AbleSet Sync', message);
      app.quit();
      return;
    }
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: { contextIsolation: true },
  });

  const url = isDev ? 'http://localhost:3000' : BACKEND_URL;
  win.loadURL(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
