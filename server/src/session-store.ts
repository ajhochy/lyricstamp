// session-store.ts — filesystem-backed, origin-independent session store.
//
// Data dir is resolved AT CALL TIME (never at module init) so tests can set
// ABLESET_DATA_DIR before each call without reloading the module.
//
// Priority: ABLESET_DATA_DIR → ELECTRON_USER_DATA → derived Electron userData

import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

export type SessionMeta = {
  id: string;
  name: string;
  savedAt: number;
  hasPdf: boolean;
};

// What we store in <id>.json on disk.
type SessionRecord = SessionMeta & {
  state: Record<string, unknown>;
  // Optional sidecar fields for the PDF (avoids a second file for metadata).
  pdfName?: string;
  pdfType?: string;
};

/** Resolve the root data directory for the current process environment. */
function getDataDir(): string {
  if (process.env.ABLESET_DATA_DIR) return process.env.ABLESET_DATA_DIR;
  if (process.env.ELECTRON_USER_DATA) return process.env.ELECTRON_USER_DATA;
  const appName = 'ableset-lyrics-sync';
  const platform = process.platform;
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', appName);
  }
  if (platform === 'win32') {
    return join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      appName,
    );
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    appName,
  );
}

/** Returns the sessions-data directory, creating it if needed. */
async function sessionsDir(): Promise<string> {
  const dir = join(getDataDir(), 'sessions-data');
  await mkdir(dir, { recursive: true });
  return dir;
}

/** List saved sessions, newest-first by savedAt. */
export async function listSessions(): Promise<SessionMeta[]> {
  let dir: string;
  try {
    dir = await sessionsDir();
  } catch {
    return [];
  }

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const metas: SessionMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(dir, entry), 'utf8');
      const rec = JSON.parse(raw) as SessionRecord;
      metas.push({ id: rec.id, name: rec.name, savedAt: rec.savedAt, hasPdf: rec.hasPdf });
    } catch {
      // Corrupt file — skip silently.
    }
  }

  return metas.sort((a, b) => b.savedAt - a.savedAt);
}

/** Save (create or overwrite) a session. Returns the session meta. */
export async function saveSession(input: {
  id: string;
  name: string;
  savedAt: number;
  state: Record<string, unknown>;
  pdf: { bytes: Buffer; name: string; type: string } | null;
}): Promise<SessionMeta> {
  const dir = await sessionsDir();
  const { id, name, savedAt, state, pdf } = input;

  const record: SessionRecord = {
    id,
    name: name.trim() || 'Untitled session',
    savedAt,
    hasPdf: pdf !== null,
    state,
    ...(pdf ? { pdfName: pdf.name, pdfType: pdf.type || 'application/pdf' } : {}),
  };

  await writeFile(join(dir, `${id}.json`), JSON.stringify(record), 'utf8');

  const pdfPath = join(dir, `${id}.pdf`);
  if (pdf) {
    await writeFile(pdfPath, pdf.bytes);
  } else {
    // Delete any stale pdf file from a previous save that had a pdf.
    try {
      await unlink(pdfPath);
    } catch {
      // Ignore ENOENT.
    }
  }

  return { id: record.id, name: record.name, savedAt: record.savedAt, hasPdf: record.hasPdf };
}

/** Retrieve the full session record (meta + state), or null if not found. */
export async function getSession(
  id: string,
): Promise<{ meta: SessionMeta; state: Record<string, unknown> } | null> {
  let dir: string;
  try {
    dir = await sessionsDir();
  } catch {
    return null;
  }

  const jsonPath = join(dir, `${id}.json`);
  if (!existsSync(jsonPath)) return null;

  try {
    const raw = await readFile(jsonPath, 'utf8');
    const rec = JSON.parse(raw) as SessionRecord;
    const meta: SessionMeta = { id: rec.id, name: rec.name, savedAt: rec.savedAt, hasPdf: rec.hasPdf };
    return { meta, state: rec.state };
  } catch {
    return null;
  }
}

/** Retrieve the raw PDF bytes plus stored name/type, or null if none. */
export async function getSessionPdf(
  id: string,
): Promise<{ bytes: Buffer; name: string; type: string } | null> {
  let dir: string;
  try {
    dir = await sessionsDir();
  } catch {
    return null;
  }

  const jsonPath = join(dir, `${id}.json`);
  const pdfPath = join(dir, `${id}.pdf`);

  if (!existsSync(jsonPath) || !existsSync(pdfPath)) return null;

  try {
    const raw = await readFile(jsonPath, 'utf8');
    const rec = JSON.parse(raw) as SessionRecord;
    if (!rec.hasPdf) return null;
    const bytes = await readFile(pdfPath);
    return {
      bytes,
      name: rec.pdfName ?? `${id}.pdf`,
      type: rec.pdfType ?? 'application/pdf',
    };
  } catch {
    return null;
  }
}

/** Delete a session's json and pdf files (ignores missing files). */
export async function deleteSession(id: string): Promise<void> {
  let dir: string;
  try {
    dir = await sessionsDir();
  } catch {
    return;
  }

  for (const ext of ['.json', '.pdf']) {
    try {
      await unlink(join(dir, `${id}${ext}`));
    } catch {
      // ENOENT — already gone, that's fine.
    }
  }
}
