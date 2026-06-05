// Regression guard: Electron's BrowserWindow does NOT support window.prompt()
// — it silently returns null (no dialog), so renderer code relying on it breaks
// in the packaged app even though it works in a plain browser (and in the
// Playwright build-target e2e). window.alert/confirm ARE supported in Electron
// (native dialogs), so they are not forbidden. Use an inline DOM input for text
// entry. See .agent-stack/postmortems/2026-06-05-create-track-prompt-electron.json.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
// Only window.prompt is unsupported in Electron; alert/confirm work natively.
const FORBIDDEN = [/\bwindow\.prompt\s*\(/];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe('renderer avoids Electron-unsupported dialogs', () => {
  it('no client source uses window.prompt / alert / confirm', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const re of FORBIDDEN) {
        if (re.test(text)) offenders.push(`${file} → ${re.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
