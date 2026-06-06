import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lyricstamp', {
  /** Open a native directory picker; resolves to the chosen absolute path or null. */
  chooseAbletonFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:chooseAbletonFolder'),
});
