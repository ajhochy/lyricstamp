// legacy-idb-sessions.ts — read-only access to the OLD IndexedDB session data.
//
// The original session-store.ts kept sessions and their PDFs in IndexedDB
// (origin-partitioned). This module preserves that read logic so the
// migration code can copy data out of the old store into the new server API.
//
// These functions are intentionally READ-ONLY and import from './idb' only —
// they do not use the new fetch-backed session-store.

import { openDb, SESSIONS_STORE, SESSION_PDFS_STORE } from './idb';
import type { SessionMeta } from './session-store';
import type { SessionState } from './session-store';

type LegacySessionRecord = {
  id: string;
  name: string;
  savedAt: number;
  hasPdf: boolean;
  state: SessionState;
};

type LegacyStoredPdf = { name: string; type: string; bytes: ArrayBuffer };

/** List all sessions in the legacy IndexedDB store. Newest-first by savedAt. */
export async function listLegacySessions(): Promise<SessionMeta[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDb();
    try {
      const records = await new Promise<LegacySessionRecord[]>((resolve, reject) => {
        const t = db.transaction(SESSIONS_STORE, 'readonly');
        const req = t.objectStore(SESSIONS_STORE).getAll();
        req.onsuccess = () => resolve((req.result as LegacySessionRecord[]) ?? []);
        req.onerror = () => reject(req.error);
      });
      return records
        .map((r) => ({ id: r.id, name: r.name, savedAt: r.savedAt, hasPdf: r.hasPdf }))
        .sort((a, b) => b.savedAt - a.savedAt);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

/** Load a full legacy session (state + reconstructed PDF File), or null if not found. */
export async function getLegacySession(
  id: string,
): Promise<{ meta: SessionMeta; state: SessionState; pdf: File | null } | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    try {
      const record = await new Promise<LegacySessionRecord | undefined>((resolve, reject) => {
        const t = db.transaction(SESSIONS_STORE, 'readonly');
        const req = t.objectStore(SESSIONS_STORE).get(id);
        req.onsuccess = () => resolve(req.result as LegacySessionRecord | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!record) return null;

      let pdf: File | null = null;
      if (record.hasPdf) {
        const stored = await new Promise<LegacyStoredPdf | undefined>((resolve, reject) => {
          const t = db.transaction(SESSION_PDFS_STORE, 'readonly');
          const req = t.objectStore(SESSION_PDFS_STORE).get(id);
          req.onsuccess = () => resolve(req.result as LegacyStoredPdf | undefined);
          req.onerror = () => reject(req.error);
        });
        if (stored) {
          pdf = new File([stored.bytes], stored.name, { type: stored.type });
        }
      }

      return {
        meta: { id: record.id, name: record.name, savedAt: record.savedAt, hasPdf: record.hasPdf },
        state: record.state,
        pdf,
      };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
