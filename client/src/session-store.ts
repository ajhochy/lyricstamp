// session-store.ts — named, switchable work sessions (one per song/leadsheet).
//
// Each session captures the full working state plus its own PDF. Listing is
// cheap because PDF bytes live in a separate store, read only when loading.

import { openDb, SESSIONS_STORE, SESSION_PDFS_STORE } from './idb';
import type { Song } from '../../shared/types';
import type { InitialStamp } from './data';
import type { LeadsheetStamp } from './views';

export type SessionState = {
  song: Song;
  songName: string;
  pasteText: string;
  stamps: InitialStamp[];
  cursor: number;
  tab: 'lyrics' | 'leadsheet';
  pdfPage: number;
  leadsheetStamps: LeadsheetStamp[];
};

/** Light record stored in `sessions` (no PDF bytes). */
type SessionRecord = {
  id: string;
  name: string;
  savedAt: number;
  hasPdf: boolean;
  state: SessionState;
};

type StoredPdf = { name: string; type: string; bytes: ArrayBuffer };

export type SessionMeta = { id: string; name: string; savedAt: number; hasPdf: boolean };
export type FullSession = { meta: SessionMeta; state: SessionState; pdf: File | null };

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** List saved sessions (newest first). Reads only the light records. */
export async function listSessions(): Promise<SessionMeta[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDb();
  try {
    const records = await new Promise<SessionRecord[]>((resolve, reject) => {
      const t = db.transaction(SESSIONS_STORE, 'readonly');
      const req = t.objectStore(SESSIONS_STORE).getAll();
      req.onsuccess = () => resolve((req.result as SessionRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    return records
      .map((r) => ({ id: r.id, name: r.name, savedAt: r.savedAt, hasPdf: r.hasPdf }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

/**
 * Save (create or overwrite) a session. Pass an existing id to overwrite it,
 * otherwise a new id is generated. Returns the saved session's id.
 */
export async function saveSession(
  name: string,
  state: SessionState,
  pdf: File | null,
  id?: string,
  savedAt: number = 0,
): Promise<string> {
  const sessionId = id ?? newId();
  const pdfBytes = pdf ? await pdf.arrayBuffer() : null;
  const record: SessionRecord = {
    id: sessionId,
    name: name.trim() || 'Untitled session',
    savedAt: savedAt || 0,
    hasPdf: pdf !== null,
    state,
  };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([SESSIONS_STORE, SESSION_PDFS_STORE], 'readwrite');
      t.objectStore(SESSIONS_STORE).put(record, sessionId);
      const pdfStore = t.objectStore(SESSION_PDFS_STORE);
      if (pdf && pdfBytes) {
        const stored: StoredPdf = { name: pdf.name, type: pdf.type || 'application/pdf', bytes: pdfBytes };
        pdfStore.put(stored, sessionId);
      } else {
        pdfStore.delete(sessionId);
      }
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
  return sessionId;
}

/** Load a full session (state + reconstructed PDF File). */
export async function getSession(id: string): Promise<FullSession | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  try {
    const record = await new Promise<SessionRecord | undefined>((resolve, reject) => {
      const t = db.transaction(SESSIONS_STORE, 'readonly');
      const req = t.objectStore(SESSIONS_STORE).get(id);
      req.onsuccess = () => resolve(req.result as SessionRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!record) return null;

    let pdf: File | null = null;
    if (record.hasPdf) {
      const stored = await new Promise<StoredPdf | undefined>((resolve, reject) => {
        const t = db.transaction(SESSION_PDFS_STORE, 'readonly');
        const req = t.objectStore(SESSION_PDFS_STORE).get(id);
        req.onsuccess = () => resolve(req.result as StoredPdf | undefined);
        req.onerror = () => reject(req.error);
      });
      if (stored) pdf = new File([stored.bytes], stored.name, { type: stored.type });
    }

    return {
      meta: { id: record.id, name: record.name, savedAt: record.savedAt, hasPdf: record.hasPdf },
      state: record.state,
      pdf,
    };
  } finally {
    db.close();
  }
}

/** Delete a session and its PDF. */
export async function deleteSession(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction([SESSIONS_STORE, SESSION_PDFS_STORE], 'readwrite');
      t.objectStore(SESSIONS_STORE).delete(id);
      t.objectStore(SESSION_PDFS_STORE).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
