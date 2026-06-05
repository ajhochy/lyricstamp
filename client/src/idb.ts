// idb.ts — single shared IndexedDB connection for the app.
//
// Stores:
//   kv            – misc key/value (the auto-saved working PDF lives here)
//   sessions      – light named-session records (no PDF bytes)
//   session-pdfs  – per-session PDF blobs, keyed by session id (read only on load)

const DB_NAME = 'ableset-sync';
const DB_VERSION = 2;

export const KV_STORE = 'kv';
export const SESSIONS_STORE = 'sessions';
export const SESSION_PDFS_STORE = 'session-pdfs';

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) db.createObjectStore(SESSIONS_STORE);
      if (!db.objectStoreNames.contains(SESSION_PDFS_STORE)) db.createObjectStore(SESSION_PDFS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
