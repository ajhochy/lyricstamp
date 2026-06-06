import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { start } from '../server/src/index.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const BACKEND_URL = 'http://127.0.0.1:7878';

// Pin userData to the original 'ableset-lyrics-sync' directory. userData
// otherwise derives from the app name, so the LyricStamp rebrand (package
// name / productName / appId) would move it and orphan existing sessions
// under ~/Library/Application Support/<old name>/sessions-data. This keeps
// the store stable across the rename. appData is the OS-level parent
// (~/Library/Application Support) and does not depend on the app name.
app.setPath('userData', path.join(app.getPath('appData'), 'ableset-lyrics-sync'));

app.whenReady().then(async () => {
  // Share the (pinned) Electron userData path with the server so sessions
  // resolve to ~/Library/Application Support/ableset-lyrics-sync regardless
  // of origin. Set unconditionally (dev and packaged) so dev-mode sessions
  // land in the same store as the packaged app.
  process.env.ELECTRON_USER_DATA = app.getPath('userData');

  // Where the bundled AbletonOSC fork lives, and the default Ableton User Library.
  // The server's remote-script install core reads these (with dev fallbacks).
  process.env.LYRICSTAMP_ABLETON_USERLIB = path.join(
    os.homedir(), 'Music', 'Ableton', 'User Library',
  );
  if (!isDev) {
    process.env.LYRICSTAMP_REMOTE_SCRIPT_SRC = path.join(process.resourcesPath, 'AbletonOSC');
  }

  // Native folder picker for the "Locate your Ableton folder" fallback.
  ipcMain.handle('dialog:chooseAbletonFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose your Ableton User Library folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Tell the server where the built renderer lives.
  // In the packaged app, app.getAppPath() returns the .asar path — Electron's
  // patched fs can read inside it, so this resolves correctly at request time.
  // In dev mode the Vite dev server handles the renderer; no static dir needed.
  if (!isDev) {
    process.env.ELECTRON_STATIC_DIR = path.join(app.getAppPath(), 'out', 'renderer');
    // app.getAppPath() is the .asar root; server code reads templates from here.
    process.env.ELECTRON_APP_ROOT = app.getAppPath();
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
          console.log('[electron] Reusing existing LyricStamp backend on :7878');
          // fall through and open the window
        } else {
          throw new Error('Existing backend on :7878 is unhealthy');
        }
      } catch {
        dialog.showErrorBox(
          'Unable to start LyricStamp',
          'Port 7878 is already in use and the existing backend is not healthy.\n\nQuit any other LyricStamp instance, then relaunch.',
        );
        app.quit();
        return;
      }
    } else {
      const message = err instanceof Error ? err.message : String(err);
      dialog.showErrorBox('Unable to start LyricStamp', message);
      app.quit();
      return;
    }
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      preload: fileURLToPath(new URL('../preload/preload.mjs', import.meta.url)),
    },
  });

  const url = isDev ? 'http://localhost:3000' : BACKEND_URL;
  win.loadURL(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
