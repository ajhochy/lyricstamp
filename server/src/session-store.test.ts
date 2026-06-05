// Contract for the server-side session store (filesystem-backed, origin-independent).
// Written BEFORE implementation — fails on the unmodified tree (module missing).
//
// The store resolves its data directory from ABLESET_DATA_DIR at call time, so
// each test points it at a fresh temp dir. Implementation lives in ./session-store.ts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  listSessions,
  saveSession,
  getSession,
  getSessionPdf,
  deleteSession,
  type SessionMeta,
} from './session-store.js';

const STATE = {
  song: { name: 'Great Things', bpm: 68, key: 'E', lines: [{ text: 'Hello' }] },
  songName: 'Great Things',
  pasteText: '{title: Great Things}',
  stamps: [],
  cursor: 0,
  tab: 'lyrics' as const,
  pdfPage: 1,
  leadsheetStamps: [],
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ablesync-sess-'));
  process.env.ABLESET_DATA_DIR = dir;
});

afterEach(() => {
  delete process.env.ABLESET_DATA_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('server session-store', () => {
  it('lists empty on a fresh data dir', async () => {
    expect(await listSessions()).toEqual([]);
  });

  it('saves then lists a matching meta', async () => {
    const meta = await saveSession({ id: 'abc', name: 'Great Things', savedAt: 1000, state: STATE, pdf: null });
    expect(meta.id).toBe('abc');
    expect(meta.hasPdf).toBe(false);

    const list = await listSessions();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'abc', name: 'Great Things', savedAt: 1000, hasPdf: false });
  });

  it('returns full state on get', async () => {
    await saveSession({ id: 'abc', name: 'Great Things', savedAt: 1000, state: STATE, pdf: null });
    const full = await getSession('abc');
    expect(full).not.toBeNull();
    expect(full!.state.songName).toBe('Great Things');
    expect(full!.meta.hasPdf).toBe(false);
  });

  it('round-trips a PDF (bytes, name, type preserved)', async () => {
    const bytes = Buffer.from('%PDF-1.4 fake pdf bytes', 'utf8');
    const meta = await saveSession({
      id: 'pdf1',
      name: 'Holy Spirit',
      savedAt: 2000,
      state: STATE,
      pdf: { bytes, name: 'leadsheet.pdf', type: 'application/pdf' },
    });
    expect(meta.hasPdf).toBe(true);

    const got = await getSessionPdf('pdf1');
    expect(got).not.toBeNull();
    expect(got!.name).toBe('leadsheet.pdf');
    expect(got!.type).toBe('application/pdf');
    expect(Buffer.compare(got!.bytes, bytes)).toBe(0);
  });

  it('sorts newest-first by savedAt', async () => {
    await saveSession({ id: 'old', name: 'Old', savedAt: 100, state: STATE, pdf: null });
    await saveSession({ id: 'new', name: 'New', savedAt: 999, state: STATE, pdf: null });
    const list = await listSessions();
    expect(list.map((s: SessionMeta) => s.id)).toEqual(['new', 'old']);
  });

  it('overwrites by id without duplicating (idempotent migration)', async () => {
    await saveSession({ id: 'dup', name: 'First', savedAt: 1, state: STATE, pdf: null });
    await saveSession({ id: 'dup', name: 'First', savedAt: 1, state: STATE, pdf: null });
    expect(await listSessions()).toHaveLength(1);
  });

  it('deletes json and pdf', async () => {
    await saveSession({
      id: 'del',
      name: 'Del',
      savedAt: 1,
      state: STATE,
      pdf: { bytes: Buffer.from('x'), name: 'a.pdf', type: 'application/pdf' },
    });
    await deleteSession('del');
    expect(await listSessions()).toEqual([]);
    expect(await getSession('del')).toBeNull();
    expect(await getSessionPdf('del')).toBeNull();
  });

  it('persists to disk so another reader at the same dir sees it (origin-independence)', async () => {
    await saveSession({ id: 'shared', name: 'Shared', savedAt: 5, state: STATE, pdf: null });
    // A second consumer pointed at the same dir (e.g. the packaged server vs the
    // dev server) must see the same data — proven by the on-disk file existing
    // under the configured data dir and a fresh list() call reading it.
    expect(existsSync(join(dir, 'sessions-data', 'shared.json'))).toBe(true);
    const raw = JSON.parse(readFileSync(join(dir, 'sessions-data', 'shared.json'), 'utf8'));
    expect(raw).toMatchObject({ id: 'shared', name: 'Shared', savedAt: 5 });
  });
});
