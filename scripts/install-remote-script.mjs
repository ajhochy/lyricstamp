/**
 * install-remote-script.mjs
 *
 * Copies the vendored AbletonOSC fork into the user's Ableton remote scripts
 * directory so Live can load the ableset-lyrics-sync arrangement-write handlers.
 *
 * Usage: node scripts/install-remote-script.mjs
 *        npm run install:remote-script
 *
 * The copy logic lives in the exported `copyTree()` helper so it can be
 * unit-tested against a temp filesystem without touching ~/Music.
 */

// NOTE: The canonical install logic also lives in server/src/remote-script.ts
// (used by the in-app installer). This CLI keeps its own copyTree/shouldSkip
// because it runs via `node` and can't import the TS module. Keep the copy
// rules (shouldSkip, backup-then-copy) in sync across the two files.

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Exported helper — unit-testable copy primitive
// ---------------------------------------------------------------------------

/**
 * Recursively copy a directory tree from `src` to `dest`.
 *
 * Rules:
 *  - Creates `dest` if it does not exist.
 *  - Skips any entry whose basename matches `*.bak-*` or is `__pycache__`.
 *  - Overwrites existing files (idempotent).
 *  - Does NOT copy hidden directories other than the source root.
 *
 * @param {string} src  Absolute source path.
 * @param {string} dest Absolute destination path.
 */
export function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyTree(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Returns true for entries that should be excluded from the copy.
 * @param {string} name  Basename of the filesystem entry.
 */
export function shouldSkip(name) {
  if (name === '__pycache__') return true;
  if (/\.bak-/.test(name)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main install logic (only runs when invoked directly, not when imported)
// ---------------------------------------------------------------------------

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}

function main() {
  const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
  const vendorSrc = path.join(repoRoot, 'vendor', 'AbletonOSC');
  const home = process.env.HOME;

  if (!home) {
    console.error('ERROR: $HOME is not set. Cannot determine Ableton scripts path.');
    process.exit(1);
  }

  if (!fs.existsSync(vendorSrc)) {
    console.error(
      `ERROR: Vendor source directory not found:\n  ${vendorSrc}\n` +
      'Run "git pull" or check the repository to ensure vendor/AbletonOSC/ exists.',
    );
    process.exit(1);
  }

  const destRoot = path.join(
    home,
    'Music',
    'Ableton',
    'User Library',
    'Remote Scripts',
    'AbletonOSC',
  );

  // Backup any existing installation (timestamped, so the user can restore)
  if (fs.existsSync(destRoot)) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const backupPath = `${destRoot}.bak-${timestamp}`;
    console.log(`Backing up existing installation:\n  ${destRoot}\n  → ${backupPath}`);
    fs.renameSync(destRoot, backupPath);
  }

  console.log(`Installing AbletonOSC fork:\n  ${vendorSrc}\n  → ${destRoot}`);
  copyTree(vendorSrc, destRoot);
  console.log('Done.\n');

  printPostInstallInstructions();
}

function printPostInstallInstructions() {
  console.log(
    '=== Post-install: enable AbletonOSC in Ableton Live ===\n' +
    '\n' +
    '1. Open Ableton Live.\n' +
    '2. Go to Live → Settings (⌘,) → Link / Tempo / MIDI.\n' +
    '3. Under "Control Surface", choose "AbletonOSC" in any empty slot.\n' +
    '4. If AbletonOSC was already loaded, toggle it off then on again\n' +
    '   (or use Cmd+Shift+. to reload remote scripts) to pick up the update.\n' +
    '5. Confirm in the Ableton log (Help → Show Live Log) that\n' +
    '   "AbletonOSC: Starting OSC server" appears without errors.\n',
  );
}
