// AbletonOSC remote-script install core. Canonical implementation used by the
// HTTP routes. NOTE: scripts/install-remote-script.mjs keeps its own copyTree/
// shouldSkip (it runs via `node` and can't import this TS module) — keep the
// two in sync if the copy rules ever change.
import {
  existsSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  renameSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import type { RemoteScriptStatus } from '../../shared/types.js';

const FORK_DIR_NAME = 'AbletonOSC';
const VERSION_FILE = 'ABLESET_FORK_VERSION';

export interface RemoteScriptPaths {
  sourceDir: string; // bundled AbletonOSC fork
  userLibDir: string; // Ableton User Library
}

/** Resolve source + User Library paths from env (set by Electron main) with dev fallbacks. */
export function resolveRemoteScriptPaths(userLibOverride?: string): RemoteScriptPaths {
  const sourceDir =
    process.env.LYRICSTAMP_REMOTE_SCRIPT_SRC ?? resolve(process.cwd(), 'vendor', FORK_DIR_NAME);
  const userLibDir =
    userLibOverride ??
    process.env.LYRICSTAMP_ABLETON_USERLIB ??
    join(os.homedir(), 'Music', 'Ableton', 'User Library');
  return { sourceDir, userLibDir };
}

export function shouldSkip(name: string): boolean {
  if (name === '__pycache__') return true;
  if (/\.bak-/.test(name)) return true;
  return false;
}

export function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

function readVersion(dir: string): string | null {
  const f = join(dir, VERSION_FILE);
  if (!existsSync(f)) return null;
  return readFileSync(f, 'utf8').trim() || null;
}

function destDir(userLibDir: string): string {
  return join(userLibDir, 'Remote Scripts', FORK_DIR_NAME);
}

export function getRemoteScriptStatus(paths: RemoteScriptPaths): RemoteScriptStatus {
  const dest = destDir(paths.userLibDir);
  const sourceFound = existsSync(paths.sourceDir);
  const installed = existsSync(dest);
  const installedVersion = installed ? readVersion(dest) : null;
  const bundledVersion = sourceFound ? readVersion(paths.sourceDir) : null;
  const upToDate = installed && installedVersion !== null && installedVersion === bundledVersion;
  return {
    installed,
    installedVersion,
    bundledVersion,
    upToDate,
    userLibFound: existsSync(paths.userLibDir),
    sourceFound,
    destPath: dest,
  };
}

export type RemoteScriptErrorCode = 'source-missing' | 'userlib-missing' | 'write-failed';

export class RemoteScriptError extends Error {
  code: RemoteScriptErrorCode;
  constructor(code: RemoteScriptErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'RemoteScriptError';
  }
}

export interface InstallResult {
  installed: true;
  installedVersion: string | null;
  createdRemoteScriptsDir: boolean; // true when <userLib>/Remote Scripts had to be created
}

export function installRemoteScript(paths: RemoteScriptPaths): InstallResult {
  if (!existsSync(paths.sourceDir)) {
    throw new RemoteScriptError('source-missing', `Bundled remote script not found at ${paths.sourceDir}`);
  }
  if (!existsSync(paths.userLibDir)) {
    throw new RemoteScriptError('userlib-missing', `Ableton User Library not found at ${paths.userLibDir}`);
  }
  const remoteScriptsDir = join(paths.userLibDir, 'Remote Scripts');
  const createdRemoteScriptsDir = !existsSync(remoteScriptsDir);
  const dest = destDir(paths.userLibDir);
  try {
    if (existsSync(dest)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      renameSync(dest, `${dest}.bak-${ts}`);
    }
    copyTree(paths.sourceDir, dest);
  } catch (err) {
    throw new RemoteScriptError('write-failed', err instanceof Error ? err.message : String(err));
  }
  return { installed: true, installedVersion: readVersion(dest), createdRemoteScriptsDir };
}
