# In-app AbletonOSC Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give non-technical worship directors a one-click, in-app way to install/update the AbletonOSC remote script, with filesystem-aware detection and a live 3-step setup checklist.

**Architecture:** A server-owned install core (`server/src/remote-script.ts`) exposes status + install over two HTTP endpoints, reusing a `copyTree` primitive and an on-disk version marker. The React client renders a `RemoteScriptSetup` checklist driven by that status plus the existing `connected`/`handlerStatus` WS signals. One small Electron preload bridge supplies a native folder picker for the User-Library fallback. Works identically in dev (Vite browser) and packaged Electron.

**Tech Stack:** TypeScript, Node `http` server, React, Vitest (unit, real tmpdir), Playwright (e2e, build target), electron-vite.

**Spec:** `docs/superpowers/specs/2026-06-06-ableton-osc-install-design.md`

---

## File structure

| File | Responsibility |
|---|---|
| `vendor/AbletonOSC/ABLESET_FORK_VERSION` | **new** — one line `ableset-2`; on-disk version marker copied with the fork |
| `shared/types.ts` | **modify** — add `RemoteScriptStatus` interface |
| `server/src/remote-script.ts` | **new** — path resolution, `copyTree`, status, install, `RemoteScriptError` |
| `server/src/remote-script.test.ts` | **new** — unit tests (real tmpdir) |
| `server/src/routes.ts` | **modify** — `GET/POST /api/remote-script/*` handlers + dispatch |
| `server/src/routes.test.ts` | **modify** — route tests |
| `electron/main.ts` | **modify** — env paths + `ipcMain` folder-picker + preload wiring |
| `electron/preload.ts` | **new** — `contextBridge` exposing `chooseAbletonFolder()` |
| `electron.vite.config.ts` | **modify** — add `preload` build entry |
| `client/src/lyricstamp-bridge.d.ts` | **new** — `window.lyricstamp` typing |
| `client/src/RemoteScriptSetup.tsx` | **new** — live checklist component |
| `client/src/app.tsx` | **modify** — mount checklist, remove old static banner |
| `client/src/styles.css` | **modify** — checklist styles |
| `e2e/tests/remote-script-setup.spec.ts` | **new** — Playwright coverage |
| `scripts/install-remote-script.mjs` | **modify** — pointer comment to canonical core |
| `docs/testing/manual-smoke.md` | **modify** — new manual smoke section |

**Resolved open decisions (from spec):**
1. The `.mjs` CLI keeps its own tested `copyTree`/`shouldSkip` (it runs via `node` directly and can't import the TS module); `remote-script.ts` re-implements the same ~15-line primitive and is independently tested. Both files get a cross-reference comment. No runtime import coupling.
2. Checklist placement: replaces the existing `handler-absent-banner` slot in `app.tsx`.

---

### Task 1: Fork version marker

**Files:**
- Create: `vendor/AbletonOSC/ABLESET_FORK_VERSION`
- Modify: `vendor/AbletonOSC/.provenance`

- [ ] **Step 1: Create the marker file**

Create `vendor/AbletonOSC/ABLESET_FORK_VERSION` with exactly this content (single line, trailing newline):

```
ableset-2
```

- [ ] **Step 2: Add the bump reminder to provenance**

Append to `vendor/AbletonOSC/.provenance`:

```
Version marker:
- ABLESET_FORK_VERSION (this file's sibling) records the fork version on disk so
  the app can detect up-to-date installs without an OSC connection. It MUST be
  bumped together with the /live/track/arrangement_writer_version handler in
  abletonosc/track.py (currently "ableset-2").
```

- [ ] **Step 3: Verify the marker matches the OSC handler**

Run: `grep -c '"ableset-2"' vendor/AbletonOSC/abletonosc/track.py && cat vendor/AbletonOSC/ABLESET_FORK_VERSION`
Expected: prints `1` then `ableset-2` (both agree on the version string).

- [ ] **Step 4: Commit**

```bash
git add vendor/AbletonOSC/ABLESET_FORK_VERSION vendor/AbletonOSC/.provenance
git commit -m "feat(fork): add ABLESET_FORK_VERSION on-disk marker"
```

---

### Task 2: Server install core

**Files:**
- Modify: `shared/types.ts`
- Create: `server/src/remote-script.ts`
- Test: `server/src/remote-script.test.ts`

- [ ] **Step 1: Add the status type to shared/types.ts**

Append to `shared/types.ts`:

```ts
/** Filesystem-derived status of the AbletonOSC remote-script install. */
export interface RemoteScriptStatus {
  installed: boolean;              // dest AbletonOSC folder exists
  installedVersion: string | null; // ABLESET_FORK_VERSION read from dest
  bundledVersion: string | null;   // ABLESET_FORK_VERSION read from bundled source
  upToDate: boolean;               // installed && installedVersion === bundledVersion
  userLibFound: boolean;           // resolved Ableton User Library dir exists
  sourceFound: boolean;            // bundled fork source exists (false => corrupt install)
  destPath: string;                // absolute <userLib>/Remote Scripts/AbletonOSC
}
```

- [ ] **Step 2: Write the failing test**

Create `server/src/remote-script.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getRemoteScriptStatus,
  installRemoteScript,
  RemoteScriptError,
} from './remote-script.js';

let tmp = '';
let sourceDir = '';
let userLibDir = '';

function writeSource(version: string | null): void {
  fs.mkdirSync(path.join(sourceDir, 'abletonosc'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'abletonosc', 'track.py'), 'def init_api(): pass\n');
  fs.writeFileSync(path.join(sourceDir, 'README.md'), '# fork\n');
  if (version !== null) {
    fs.writeFileSync(path.join(sourceDir, 'ABLESET_FORK_VERSION'), `${version}\n`);
  }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-core-'));
  sourceDir = path.join(tmp, 'src', 'AbletonOSC');
  userLibDir = path.join(tmp, 'User Library');
  fs.mkdirSync(userLibDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('getRemoteScriptStatus', () => {
  it('reports not-installed when dest is absent', () => {
    writeSource('ableset-2');
    const s = getRemoteScriptStatus({ sourceDir, userLibDir });
    expect(s.installed).toBe(false);
    expect(s.upToDate).toBe(false);
    expect(s.bundledVersion).toBe('ableset-2');
    expect(s.userLibFound).toBe(true);
    expect(s.sourceFound).toBe(true);
    expect(s.destPath).toBe(path.join(userLibDir, 'Remote Scripts', 'AbletonOSC'));
  });

  it('reports up-to-date after an install', () => {
    writeSource('ableset-2');
    installRemoteScript({ sourceDir, userLibDir });
    const s = getRemoteScriptStatus({ sourceDir, userLibDir });
    expect(s.installed).toBe(true);
    expect(s.installedVersion).toBe('ableset-2');
    expect(s.upToDate).toBe(true);
  });

  it('reports out-of-date when versions differ', () => {
    writeSource('ableset-2');
    installRemoteScript({ sourceDir, userLibDir });
    // Bump the bundled source to a newer version.
    fs.writeFileSync(path.join(sourceDir, 'ABLESET_FORK_VERSION'), 'ableset-3\n');
    const s = getRemoteScriptStatus({ sourceDir, userLibDir });
    expect(s.installed).toBe(true);
    expect(s.installedVersion).toBe('ableset-2');
    expect(s.bundledVersion).toBe('ableset-3');
    expect(s.upToDate).toBe(false);
  });

  it('reports userLibFound=false and sourceFound=false when missing', () => {
    const s = getRemoteScriptStatus({
      sourceDir: path.join(tmp, 'nope'),
      userLibDir: path.join(tmp, 'gone'),
    });
    expect(s.sourceFound).toBe(false);
    expect(s.userLibFound).toBe(false);
    expect(s.bundledVersion).toBe(null);
  });
});

describe('installRemoteScript', () => {
  it('copies the tree and writes the version marker to dest', () => {
    writeSource('ableset-2');
    const r = installRemoteScript({ sourceDir, userLibDir });
    expect(r.installed).toBe(true);
    expect(r.installedVersion).toBe('ableset-2');
    const dest = path.join(userLibDir, 'Remote Scripts', 'AbletonOSC');
    expect(fs.existsSync(path.join(dest, 'abletonosc', 'track.py'))).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'ABLESET_FORK_VERSION'), 'utf8').trim()).toBe('ableset-2');
  });

  it('backs up an existing install before overwriting', () => {
    writeSource('ableset-2');
    installRemoteScript({ sourceDir, userLibDir });
    installRemoteScript({ sourceDir, userLibDir }); // second run
    const rsDir = path.join(userLibDir, 'Remote Scripts');
    const baks = fs.readdirSync(rsDir).filter((n) => n.startsWith('AbletonOSC.bak-'));
    expect(baks.length).toBeGreaterThanOrEqual(1);
  });

  it('throws source-missing when the bundled fork is absent', () => {
    expect(() => installRemoteScript({ sourceDir: path.join(tmp, 'nope'), userLibDir }))
      .toThrow(RemoteScriptError);
    try {
      installRemoteScript({ sourceDir: path.join(tmp, 'nope'), userLibDir });
    } catch (e) {
      expect((e as RemoteScriptError).code).toBe('source-missing');
    }
  });

  it('throws userlib-missing when the User Library is absent', () => {
    writeSource('ableset-2');
    try {
      installRemoteScript({ sourceDir, userLibDir: path.join(tmp, 'gone') });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as RemoteScriptError).code).toBe('userlib-missing');
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/src/remote-script.test.ts`
Expected: FAIL — `Cannot find module './remote-script.js'`.

- [ ] **Step 4: Write the implementation**

Create `server/src/remote-script.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/src/remote-script.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts server/src/remote-script.ts server/src/remote-script.test.ts
git commit -m "feat(server): AbletonOSC install core (status + install) with version marker"
```

---

### Task 3: Server routes

**Files:**
- Modify: `server/src/routes.ts`
- Test: `server/src/routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Append to `server/src/routes.test.ts` (uses the existing `makeReq`/`makeRes` helpers):

```ts
import { mkdtempSync as _mkdtempSync, mkdirSync as _mkdirSync, writeFileSync as _writeFileSync } from 'node:fs';

describe('GET /api/remote-script/status', () => {
  it('returns a status object', async () => {
    const tmp = _mkdtempSync(join(tmpdir(), 'rs-route-'));
    const src = join(tmp, 'AbletonOSC');
    _mkdirSync(src, { recursive: true });
    _writeFileSync(join(src, 'ABLESET_FORK_VERSION'), 'ableset-2\n');
    process.env.LYRICSTAMP_REMOTE_SCRIPT_SRC = src;
    process.env.LYRICSTAMP_ABLETON_USERLIB = join(tmp, 'User Library');
    _mkdirSync(process.env.LYRICSTAMP_ABLETON_USERLIB, { recursive: true });

    const req = makeReq('GET', '/api/remote-script/status');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(200);
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({ installed: false, bundledVersion: 'ableset-2', sourceFound: true });
  });
});

describe('POST /api/remote-script/install', () => {
  it('installs and returns the version', async () => {
    const tmp = _mkdtempSync(join(tmpdir(), 'rs-route-'));
    const src = join(tmp, 'AbletonOSC');
    _mkdirSync(join(src, 'abletonosc'), { recursive: true });
    _writeFileSync(join(src, 'abletonosc', 'track.py'), 'x\n');
    _writeFileSync(join(src, 'ABLESET_FORK_VERSION'), 'ableset-2\n');
    const userLib = join(tmp, 'User Library');
    _mkdirSync(userLib, { recursive: true });
    process.env.LYRICSTAMP_REMOTE_SCRIPT_SRC = src;
    process.env.LYRICSTAMP_ABLETON_USERLIB = userLib;

    const req = makeReq('POST', '/api/remote-script/install', '{}');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ installed: true, installedVersion: 'ableset-2' });
  });

  it('returns 409 source-missing when the bundled fork is absent', async () => {
    const tmp = _mkdtempSync(join(tmpdir(), 'rs-route-'));
    process.env.LYRICSTAMP_REMOTE_SCRIPT_SRC = join(tmp, 'nope');
    process.env.LYRICSTAMP_ABLETON_USERLIB = join(tmp, 'User Library');
    _mkdirSync(process.env.LYRICSTAMP_ABLETON_USERLIB, { recursive: true });

    const req = makeReq('POST', '/api/remote-script/install', '{}');
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode, body } = await capture();
    expect(statusCode).toBe(409);
    expect(JSON.parse(body)).toMatchObject({ code: 'source-missing' });
  });

  it('returns 400 on a non-string userLibPath', async () => {
    const req = makeReq('POST', '/api/remote-script/install', JSON.stringify({ userLibPath: 123 }));
    const { res, capture } = makeRes();
    await handleRequest(req, res);
    const { statusCode } = await capture();
    expect(statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/routes.test.ts -t "remote-script"`
Expected: FAIL — status endpoint returns 404 / handler not wired.

- [ ] **Step 3: Add the import to routes.ts**

At the top of `server/src/routes.ts`, after the existing `import type { OscClient }` line, add:

```ts
import {
  resolveRemoteScriptPaths,
  getRemoteScriptStatus,
  installRemoteScript,
  RemoteScriptError,
} from './remote-script.js';
```

- [ ] **Step 4: Add the two handlers to routes.ts**

Add near the other handlers (e.g. just before `export async function handleRequest`):

```ts
function handleGetRemoteScriptStatus(_req: http.IncomingMessage, res: http.ServerResponse): void {
  json(res, 200, getRemoteScriptStatus(resolveRemoteScriptPaths()));
}

async function handlePostRemoteScriptInstall(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let userLibPath: string | undefined;
  const raw = (await readBody(req)).trim();
  if (raw) {
    let parsed: { userLibPath?: unknown };
    try {
      parsed = JSON.parse(raw) as { userLibPath?: unknown };
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    if (parsed.userLibPath !== undefined) {
      if (typeof parsed.userLibPath !== 'string' || parsed.userLibPath.trim() === '') {
        json(res, 400, { error: 'userLibPath must be a non-empty string' });
        return;
      }
      userLibPath = parsed.userLibPath;
    }
  }
  try {
    const result = installRemoteScript(resolveRemoteScriptPaths(userLibPath));
    const warning =
      result.createdRemoteScriptsDir && userLibPath
        ? `Installed under ${result.installedVersion ? '' : ''}${userLibPath} — confirm that is your Ableton User Library.`
        : undefined;
    json(res, 200, { installed: result.installed, installedVersion: result.installedVersion, warning });
  } catch (err) {
    if (err instanceof RemoteScriptError) {
      json(res, err.code === 'write-failed' ? 500 : 409, { error: err.message, code: err.code });
      return;
    }
    throw err;
  }
}
```

- [ ] **Step 5: Wire dispatch in handleRequest**

In `handleRequest`, immediately after the `GET /api/health` block, add:

```ts
  if (method === 'GET' && path === '/api/remote-script/status') {
    handleGetRemoteScriptStatus(req, res);
    return;
  }
  if (method === 'POST' && path === '/api/remote-script/install') {
    await handlePostRemoteScriptInstall(req, res);
    return;
  }
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run server/src/routes.test.ts -t "remote-script"`
Expected: PASS.

- [ ] **Step 7: Full unit suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green (existing 133 tests + the new ones).

- [ ] **Step 8: Commit**

```bash
git add server/src/routes.ts server/src/routes.test.ts
git commit -m "feat(server): GET/POST /api/remote-script status + install endpoints"
```

---

### Task 4: Electron path wiring + folder-picker bridge

**Files:**
- Create: `electron/preload.ts`
- Modify: `electron.vite.config.ts`, `electron/main.ts`
- Create: `client/src/lyricstamp-bridge.d.ts`

- [ ] **Step 1: Create the preload script**

Create `electron/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lyricstamp', {
  /** Open a native directory picker; resolves to the chosen absolute path or null. */
  chooseAbletonFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:chooseAbletonFolder'),
});
```

- [ ] **Step 2: Add the preload build entry to electron.vite.config.ts**

Add a `preload` block to the `defineConfig({...})` object, as a sibling of `main` and `renderer`:

```ts
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/preload.ts'),
      },
      outDir: 'out/preload',
    },
  },
```

- [ ] **Step 3: Add the client-side window typing**

Create `client/src/lyricstamp-bridge.d.ts`:

```ts
export {};

declare global {
  interface Window {
    lyricstamp?: {
      chooseAbletonFolder: () => Promise<string | null>;
    };
  }
}
```

- [ ] **Step 4: Wire env paths + IPC + preload into electron/main.ts**

In `electron/main.ts`:

a) Update imports:

```ts
import path from 'node:path';
import os from 'node:os';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { start } from '../server/src/index.js';
```

b) Inside `app.whenReady().then(async () => { ... })`, after the existing `process.env.ELECTRON_USER_DATA = ...` line, add:

```ts
  // Where the bundled AbletonOSC fork lives, and the default Ableton User Library.
  // The server's remote-script install core reads these (with dev fallbacks).
  process.env.LYRICSTAMP_ABLETON_USERLIB = path.join(
    os.homedir(), 'Music', 'Ableton', 'User Library',
  );
  if (!isDev) {
    process.env.LYRICSTAMP_REMOTE_SCRIPT_SRC = path.join(process.resourcesPath, 'AbletonOSC');
  }

  // Native folder picker for the "Locate your Ableton folder" fallback.
  ipcMain.handle('dialog:chooseAbletonFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose your Ableton User Library folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
```

c) Add the preload path to the `BrowserWindow` `webPreferences` (filename verified in Step 6):

```ts
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.mjs'),
    },
  });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. (The `client/tsconfig.json` picks up `lyricstamp-bridge.d.ts`; `window.lyricstamp` is now typed.)

- [ ] **Step 6: Build Electron bundles and verify the preload output filename**

Run: `npm run electron:build && ls out/preload/`
Expected: build succeeds and `out/preload/` contains a `preload.*` file.
**If the file is `preload.js` (not `preload.mjs`)**, update the `preload:` path in Step 4c to match the actual filename, then re-run `npm run electron:build`.

- [ ] **Step 7: Commit**

```bash
git add electron/preload.ts electron/main.ts electron.vite.config.ts client/src/lyricstamp-bridge.d.ts
git commit -m "feat(electron): remote-script env paths + folder-picker preload bridge"
```

---

### Task 5: Live checklist UI

**Files:**
- Create: `client/src/RemoteScriptSetup.tsx`
- Modify: `client/src/app.tsx`, `client/src/styles.css`
- Test: `e2e/tests/remote-script-setup.spec.ts`

- [ ] **Step 1: Create the checklist component**

Create `client/src/RemoteScriptSetup.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { RemoteScriptStatus } from '../../shared/types';
import type { HandlerStatus } from '../../shared/types';

interface Props {
  connected: boolean;
  handlerStatus: HandlerStatus;
}

type Step = { done: boolean };

export function RemoteScriptSetup({ connected, handlerStatus }: Props): JSX.Element | null {
  const [status, setStatus] = useState<RemoteScriptStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/remote-script/status');
      if (res.ok) setStatus((await res.json()) as RemoteScriptStatus);
    } catch {
      /* leave previous status */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-check the filesystem whenever Live (re)connects — the install may have
  // just taken effect.
  useEffect(() => {
    if (connected) void refresh();
  }, [connected, refresh]);

  const install = useCallback(
    async (userLibPath?: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/remote-script/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userLibPath ? { userLibPath } : {}),
        });
        const data = (await res.json()) as { error?: string; code?: string };
        if (!res.ok) {
          setError(data.error ?? 'Install failed');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Install failed');
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  const onInstallClick = useCallback(async () => {
    // If the default User Library wasn't found, ask the user to locate it via the
    // Electron bridge (absent in dev browser mode).
    if (status && !status.userLibFound && window.lyricstamp) {
      const chosen = await window.lyricstamp.chooseAbletonFolder();
      if (!chosen) return;
      await install(chosen);
      return;
    }
    await install();
  }, [status, install]);

  if (!status) return null;

  const step1Done = status.upToDate;
  const step2Done = connected;
  const step3Done = handlerStatus === 'present';

  // Healthy machine — render nothing.
  if (step1Done && step2Done && step3Done) return null;

  const installLabel = status.installed && !status.upToDate ? 'Update remote script' : 'Install remote script';

  return (
    <div className="remote-script-setup" role="region" aria-label="Ableton setup">
      <div className="rss-title">Finish connecting LyricStamp to Ableton Live</div>
      <ol className="rss-steps">
        <li className={step1Done ? 'done' : ''} data-step="install">
          <span className="rss-mark">{step1Done ? '✓' : '1'}</span>
          <div className="rss-body">
            <b>Install the remote script</b>
            {!step1Done && (
              <div className="rss-actions">
                {!status.userLibFound && !window.lyricstamp && (
                  <span className="rss-hint">Open Ableton Live once, then retry.</span>
                )}
                <button className="btn primary" disabled={busy} onClick={() => void onInstallClick()}>
                  {busy ? 'Installing…' : !status.userLibFound && window.lyricstamp ? 'Locate your Ableton folder…' : installLabel}
                </button>
              </div>
            )}
            {error && <div className="rss-error">{error}</div>}
          </div>
        </li>
        <li className={step2Done ? 'done' : ''} data-step="enable">
          <span className="rss-mark">{step2Done ? '✓' : '2'}</span>
          <div className="rss-body">
            <b>Enable AbletonOSC in Live, then restart it</b>
            {!step2Done && (
              <div className="rss-hint">
                Live → Settings → Link/Tempo/MIDI → set a <b>Control Surface</b> to{' '}
                <b>AbletonOSC</b>, then quit and reopen Live.
              </div>
            )}
          </div>
        </li>
        <li className={step3Done ? 'done' : ''} data-step="handler">
          <span className="rss-mark">{step3Done ? '✓' : '3'}</span>
          <div className="rss-body">
            <b>Patched script detected</b>
            {step2Done && !step3Done && (
              <div className="rss-hint">Restart Live to load the updated script.</div>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Mount the component and remove the old banner in app.tsx**

In `client/src/app.tsx`:

a) Add the import near the other component imports:

```ts
import { RemoteScriptSetup } from './RemoteScriptSetup';
```

b) Replace the existing handler-absent banner block (around line 1108):

```tsx
      {handlerStatus === 'absent' && (
        <div className="handler-absent-banner" role="alert">
          ...existing banner contents...
        </div>
      )}
```

with:

```tsx
      <RemoteScriptSetup connected={connected} handlerStatus={handlerStatus} />
```

(Delete the entire old `{handlerStatus === 'absent' && (...)}` JSX expression.)

- [ ] **Step 3: Add styles**

Append to `client/src/styles.css` (you may delete the now-unused `.handler-absent-banner` rules):

```css
.remote-script-setup {
  border: 1px solid var(--accent-border, rgba(52,194,206,.38));
  background: color-mix(in oklch, var(--accent, #34c2ce) 8%, transparent);
  border-radius: 10px;
  padding: 14px 16px;
  margin: 10px 16px;
}
.remote-script-setup .rss-title { font-weight: 600; margin-bottom: 10px; }
.rss-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.rss-steps li { display: flex; gap: 10px; align-items: flex-start; }
.rss-mark {
  flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center; font-size: 12px; font-weight: 700;
  border: 1px solid var(--accent-border, rgba(52,194,206,.38));
}
.rss-steps li.done .rss-mark { background: var(--accent, #34c2ce); color: #06222633; color: #062226; }
.rss-body { min-width: 0; }
.rss-hint { font-size: 13px; opacity: .8; margin-top: 3px; }
.rss-actions { margin-top: 6px; display: flex; gap: 10px; align-items: center; }
.rss-error { color: #e06c6c; font-size: 13px; margin-top: 5px; }
```

- [ ] **Step 4: Write the Playwright spec**

Create `e2e/tests/remote-script-setup.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Mock the status endpoint so we can drive each checklist state without a real
// Ableton install. The component fetches /api/remote-script/status on mount.
async function mockStatus(page: import('@playwright/test').Page, status: Record<string, unknown>) {
  await page.route('**/api/remote-script/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }),
  );
}

const BASE = {
  installed: false,
  installedVersion: null,
  bundledVersion: 'ableset-2',
  upToDate: false,
  userLibFound: true,
  sourceFound: true,
  destPath: '/x/Remote Scripts/AbletonOSC',
};

test.describe('remote-script setup checklist', () => {
  test('shows Install when not up to date', async ({ page }) => {
    await mockStatus(page, { ...BASE });
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    await expect(page.locator('.remote-script-setup')).toBeVisible();
    await expect(page.locator('[data-step="install"] button')).toHaveText(/Install remote script/i);
  });

  test('shows Update when installed but stale', async ({ page }) => {
    await mockStatus(page, { ...BASE, installed: true, installedVersion: 'ableset-1' });
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    await expect(page.locator('[data-step="install"] button')).toHaveText(/Update remote script/i);
  });

  test('shows Locate-folder affordance text when userLib missing', async ({ page }) => {
    await mockStatus(page, { ...BASE, userLibFound: false });
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    // In the browser (no window.lyricstamp bridge) the hint to open Live is shown.
    await expect(page.locator('[data-step="install"] .rss-hint')).toContainText(/Open Ableton Live once/i);
  });

  test('collapses entirely when fully set up', async ({ page }) => {
    await mockStatus(page, { ...BASE, installed: true, installedVersion: 'ableset-2', upToDate: true });
    // connected + handlerStatus come from the live WS; in the test env Ableton may
    // or may not be connected. Assert the component is absent only when all green:
    // this test asserts step 1 is satisfied; full collapse also needs a live tick.
    await page.goto('/');
    await page.waitForSelector('.workspace', { timeout: 15000 });
    // Step 1 should be marked done even if steps 2/3 keep the panel visible.
    const installStep = page.locator('[data-step="install"]');
    if (await page.locator('.remote-script-setup').count()) {
      await expect(installStep).toHaveClass(/done/);
    }
  });
});
```

- [ ] **Step 5: Build renderer for the e2e target, then run typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: exit 0.

- [ ] **Step 6: Run the e2e spec (build target)**

Run: `npm run electron:build && npx playwright test e2e/tests/remote-script-setup.spec.ts --config=playwright.config.ts`
Expected: PASS (the `electron:build` step refreshes `out/renderer` which the build-target config serves).

- [ ] **Step 7: Commit**

```bash
git add client/src/RemoteScriptSetup.tsx client/src/app.tsx client/src/styles.css e2e/tests/remote-script-setup.spec.ts
git commit -m "feat(client): live AbletonOSC setup checklist (replaces static banner)"
```

---

### Task 6: CLI pointer + manual smoke docs + full verification

**Files:**
- Modify: `scripts/install-remote-script.mjs`, `docs/testing/manual-smoke.md`

- [ ] **Step 1: Add the cross-reference comment to the CLI**

At the top of `scripts/install-remote-script.mjs`, under the existing file header comment, add:

```js
// NOTE: The canonical install logic also lives in server/src/remote-script.ts
// (used by the in-app installer). This CLI keeps its own copyTree/shouldSkip
// because it runs via `node` and can't import the TS module. Keep the copy
// rules (shouldSkip, backup-then-copy) in sync across the two files.
```

- [ ] **Step 2: Add the manual smoke section**

Append to `docs/testing/manual-smoke.md`:

```markdown
## In-app remote-script install (AbletonOSC setup checklist)

Requires a Mac without the patched script already current.

1. Quit Ableton Live. Launch LyricStamp → the **"Finish connecting…"** checklist
   appears with step ① showing **Install remote script**.
2. Click it → confirm files land in
   `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/` (including
   `ABLESET_FORK_VERSION`). Step ① flips to ✓.
3. In Live: Settings → Link/Tempo/MIDI → set a Control Surface to **AbletonOSC**,
   then quit and reopen Live. Watch step ② (connected) then step ③ (handler
   detected) self-check. The checklist disappears once all three are ✓.
4. **Update path:** edit the installed `ABLESET_FORK_VERSION` to an older value,
   relaunch LyricStamp → step ① shows **Update remote script**.
5. **Missing User Library:** temporarily rename `~/Music/Ableton/User Library`,
   relaunch → step ① shows **Locate your Ableton folder…**; pick a folder → install
   succeeds under it. Restore the folder name afterward.
```

- [ ] **Step 3: Full verification suite**

Run: `npm run typecheck && npm run lint && npm test && npm run electron:build && npm run test:e2e`
Expected: typecheck/lint exit 0; unit tests all pass (133 + new); electron build succeeds; e2e suite passes (existing + `remote-script-setup.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add scripts/install-remote-script.mjs docs/testing/manual-smoke.md
git commit -m "docs: CLI cross-ref + manual smoke for in-app remote-script install"
```

---

## Self-review notes

- **Spec coverage:** status endpoint (T3) · install endpoint + error codes (T2/T3) · version marker (T1) · env path wiring (T4) · folder-picker sliver (T4) · live 3-step checklist replacing the banner (T5) · CLI shares/cross-refs core (T2 note + T6) · server unit + route + Playwright tests (T2/T3/T5) · manual smoke (T6). All spec sections map to a task.
- **Type consistency:** `RemoteScriptStatus` defined once in `shared/types.ts` (T2) and consumed identically in `remote-script.ts`, routes, and the component. `RemoteScriptError.code` values (`source-missing`/`userlib-missing`/`write-failed`) match the HTTP mapping in the route handler and the route test assertions.
- **Edge cases:** soft warning surfaced via `createdRemoteScriptsDir` (T2 `InstallResult` → T3 route `warning`); dev-browser fallback handled by the `window.lyricstamp` feature-detect in the component (T5).
- **Known non-determinism flagged:** the "collapses when fully set up" e2e depends on a live WS connection state, so the spec asserts step-① completion rather than full collapse — noted inline in the test.
