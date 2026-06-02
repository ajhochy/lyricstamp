import { app, BrowserWindow } from 'electron';
import { start } from '../server/src/index.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

app.whenReady().then(async () => {
  await start(); // start HTTP + WS + OSC server

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: { contextIsolation: true },
  });

  const url = isDev ? 'http://localhost:3000' : 'http://127.0.0.1:7878';
  win.loadURL(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
