// pdf-store.ts — persist the currently-loaded leadsheet PDF across app restarts.
//
// The PDF is binary, too large for localStorage, so it lives in IndexedDB (the
// shared `kv` store). We store raw bytes plus name/type and reconstruct a File
// on load, so the leadsheet session (PDF + page + stamps) fully restores.

import { openDb, KV_STORE } from './idb';

const PDF_KEY = 'leadsheet-pdf';

type StoredPdf = { name: string; type: string; bytes: ArrayBuffer };

/** Persist the loaded PDF (overwrites any previous one). Best-effort. */
export async function savePdf(file: File): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const bytes = await file.arrayBuffer();
  const record: StoredPdf = { name: file.name, type: file.type || 'application/pdf', bytes };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(KV_STORE, 'readwrite');
      t.objectStore(KV_STORE).put(record, PDF_KEY);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Remove the persisted working PDF (e.g. when starting a blank session). */
export async function clearPdf(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction(KV_STORE, 'readwrite');
        t.objectStore(KV_STORE).delete(PDF_KEY);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

/** Load the persisted PDF as a File, or null if none / unavailable. */
export async function loadPdf(): Promise<File | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    try {
      const record = await new Promise<StoredPdf | undefined>((resolve, reject) => {
        const t = db.transaction(KV_STORE, 'readonly');
        const req = t.objectStore(KV_STORE).get(PDF_KEY);
        req.onsuccess = () => resolve(req.result as StoredPdf | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!record) return null;
      return new File([record.bytes], record.name, { type: record.type });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
