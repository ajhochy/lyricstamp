// migrate-sessions.ts — one-time migration of IndexedDB sessions → server API.
//
// Reads legacy sessions (stored at the browser's original origin) and pushes
// each one to the server-backed store. Idempotent: the flag
// 'ableset-sync.migrated-v1' in localStorage prevents re-running.
// Uses the id/name/savedAt from the legacy record so the server can
// overwrite by id safely.

import { listLegacySessions, getLegacySession } from './legacy-idb-sessions';
import { saveSession } from './session-store';

const MIGRATED_FLAG = 'ableset-sync.migrated-v1';

/** Run the one-time session migration. Best-effort — never throws. */
export async function runSessionMigration(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return;

    const legacySessions = await listLegacySessions();
    if (legacySessions.length === 0) {
      // Nothing to migrate — mark as done so we don't check every load.
      localStorage.setItem(MIGRATED_FLAG, '1');
      return;
    }

    let migrated = 0;
    let failed = 0;

    for (const meta of legacySessions) {
      try {
        const full = await getLegacySession(meta.id);
        if (!full) continue;
        await saveSession(full.meta.name, full.state, full.pdf, full.meta.id, full.meta.savedAt);
        migrated++;
      } catch {
        failed++;
      }
    }

    console.log(
      `[ableset] Session migration complete: ${migrated} migrated, ${failed} failed (of ${legacySessions.length} legacy sessions)`,
    );
    localStorage.setItem(MIGRATED_FLAG, '1');
  } catch {
    // Never propagate — migration is best-effort.
  }
}
