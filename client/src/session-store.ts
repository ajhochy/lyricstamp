// session-store.ts — named, switchable work sessions (server-backed).
//
// All session data is stored on the server (filesystem) so sessions are
// origin-independent: identical in dev (localhost:3000) and in the packaged
// Electron app (127.0.0.1:7878). The server API is at /api/sessions.
//
// Exports are intentionally identical to the old IndexedDB implementation so
// app.tsx is unchanged.

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

export type SessionMeta = { id: string; name: string; savedAt: number; hasPdf: boolean };
export type FullSession = { meta: SessionMeta; state: SessionState; pdf: File | null };

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** List saved sessions (newest first). */
export async function listSessions(): Promise<SessionMeta[]> {
  const res = await fetch('/api/sessions');
  if (!res.ok) return [];
  return (await res.json()) as SessionMeta[];
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

  let pdfBase64: string | undefined;
  let pdfName: string | undefined;
  let pdfType: string | undefined;

  if (pdf) {
    const buf = await pdf.arrayBuffer();
    // Convert ArrayBuffer → base64 without using btoa directly on binary string
    // (btoa can throw on large buffers in some environments).
    pdfBase64 = bufferToBase64(buf);
    pdfName = pdf.name;
    pdfType = pdf.type || 'application/pdf';
  }

  const body = {
    name: name.trim() || 'Untitled session',
    savedAt: savedAt || Date.now(),
    state,
    ...(pdfBase64 !== undefined ? { pdf: pdfBase64, pdfName, pdfType } : {}),
  };

  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`saveSession failed: ${res.status}`);
  }

  return sessionId;
}

/** Load a full session (state + reconstructed PDF File). */
export async function getSession(id: string): Promise<FullSession | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (!res.ok) return null;

  const full = (await res.json()) as { meta: SessionMeta; state: SessionState; hasPdf: boolean };

  let pdf: File | null = null;
  if (full.hasPdf) {
    try {
      const pdfRes = await fetch(`/api/sessions/${encodeURIComponent(id)}/pdf`);
      if (pdfRes.ok) {
        const bytes = await pdfRes.arrayBuffer();
        const contentDisposition = pdfRes.headers.get('Content-Disposition') ?? '';
        const nameMatch = contentDisposition.match(/filename="?([^";]+)"?/);
        const pdfName = nameMatch?.[1] ?? `${id}.pdf`;
        const pdfType = pdfRes.headers.get('Content-Type') ?? 'application/pdf';
        pdf = new File([bytes], pdfName, { type: pdfType });
      }
    } catch {
      // PDF fetch failed — return session without PDF.
    }
  }

  return { meta: full.meta, state: full.state, pdf };
}

/** Delete a session and its PDF. */
export async function deleteSession(id: string): Promise<void> {
  await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert an ArrayBuffer to a base64 string without btoa size limits. */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
