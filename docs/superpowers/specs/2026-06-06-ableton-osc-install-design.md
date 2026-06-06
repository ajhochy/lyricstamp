# In-app AbletonOSC install — design

_Date: 2026-06-06 · Status: approved (brainstorming) · Branch: `workflow/ableton-osc-install`_

## Problem

AbletonOSC (LyricStamp's patched remote-script fork) is a hard dependency, but the only way to
install it today is `npm run install:remote-script` in a Terminal — or a manual file copy. The
target user is a **non-technical worship director** who has the packaged `.app`, no repo, and no
comfort with a terminal. They have no obvious path to satisfy the dependency, so the app silently
fails to connect and they don't know why.

## Goal

Make installing/updating the remote script a **one-click, in-app** action with clear,
filesystem-aware detection and live "it worked" feedback — without requiring a terminal, the
repo, or technical knowledge. The app copies the bundled fork into Live's User Library and then
guides the user through the one step it cannot automate (selecting AbletonOSC as a Control Surface
and restarting Live).

## Non-goals

- Automating the Live Control-Surface selection or restarting Live — **Live exposes no API for
  either.** The app guides; the user clicks in Live.
- Windows/Linux (macOS-only throughout, per AGENTS.md).
- Bundling/altering Ableton Live itself.
- A general settings/preferences screen. The checklist is the only new surface.
- A "create +LYRICS track" nudge (the checklist is a natural future home, but out of scope here).
- Auto-updating the remote script silently/in the background — install/update is always an
  explicit user action.

## Constraints

- Data-safety + naming KEEPS apply: do **not** rename internal `ableset-*` identifiers; the
  installed folder stays `AbletonOSC` and the fork version marker stays `ableset-2`
  (see `docs/ai/decisions.md`).
- The existing CLI `npm run install:remote-script` must keep working (devs / scripted installs).
- Must work in **both** dev (Vite browser on :3000) and packaged Electron, preserving the app's
  client→server-over-HTTP architecture.
- No secrets, no network calls — the bundled fork is copied from local disk.

---

## Chosen approach (A): server-owned install + status, with one Electron folder-picker sliver

The install + detection logic lives in the **Node server** (full filesystem access, already
unit-tested, identical in dev and packaged). The renderer drives it over HTTP, exactly like every
other feature. The *only* new Electron code is a single folder-picker function for the
User-Library fallback.

### Components and responsibilities

1. **Install core** (`server/src/remote-script.ts`, new) — the single source of truth for
   detection + copy. Reuses/absorbs the existing `copyTree()` / `shouldSkip()` primitives.
   - `getRemoteScriptStatus(opts)` → status object (below). Pure filesystem read.
   - `installRemoteScript(opts)` → performs the timestamped-backup + copy, returns the installed
     version. Throws typed errors with a `code`.
   - `opts` carries resolved `sourceDir` and `userLibDir` so the function is environment-agnostic
     and testable against a temp filesystem.
   - **Path resolution** helper reads env (set by Electron main) with dev fallbacks:
     - `sourceDir` ← `LYRICSTAMP_REMOTE_SCRIPT_SRC` || repo `vendor/AbletonOSC`.
     - `userLibDir` ← request body `userLibPath` || `LYRICSTAMP_ABLETON_USERLIB` ||
       `~/Music/Ableton/User Library`.
   - Final install destination: `<userLibDir>/Remote Scripts/AbletonOSC`.

2. **CLI refactor** (`scripts/install-remote-script.mjs`) — `main()` calls into the same install
   core so there is no duplicated copy/backup logic. The exported `copyTree`/`shouldSkip` stay
   exported (existing unit tests keep passing); the core imports them.
   - Note: the CLI is `.mjs` and the server is TypeScript. To share one implementation without a
     cross-language import headache, the canonical copy/version logic lives in
     `server/src/remote-script.ts`; the CLI keeps its thin `copyTree`/`shouldSkip` (already
     tested) and gains a comment pointing at the server module as the canonical core. If a clean
     shared import proves trivial during implementation, prefer it; otherwise the duplication is
     limited to the ~15-line `copyTree` primitive that already has its own tests. **Decided at
     plan time; not a blocker.**

3. **Server routes** (`server/src/routes.ts`) — two new endpoints wired into the existing
   dispatcher:
   - `GET /api/remote-script/status` → `200` status object.
   - `POST /api/remote-script/install` (optional `{ userLibPath }`) → `200 { installed:true,
     installedVersion }` or a typed error response.

4. **Version marker** (`vendor/AbletonOSC/ABLESET_FORK_VERSION`, new) — a one-line file containing
   `ableset-2`. Copied by `copyTree` along with the rest of the tree. `status` reads it from both
   the bundled source and the installed destination to compute `upToDate` **on disk** (no OSC
   needed). The existing OSC `arrangement_writer_version` handler stays as the separate *live*
   presence probe. Both carry the same string and must be bumped together — documented in
   `vendor/AbletonOSC/.provenance`.

5. **Electron path wiring** (`electron/main.ts`) — set two env vars before `start()` (next to the
   existing `ELECTRON_USER_DATA`):
   - `LYRICSTAMP_REMOTE_SCRIPT_SRC = path.join(process.resourcesPath, 'AbletonOSC')` when packaged.
   - `LYRICSTAMP_ABLETON_USERLIB = path.join(os.homedir(), 'Music', 'Ableton', 'User Library')`.

6. **Folder-picker bridge** (`electron/preload.ts` + one `ipcMain.handle` in `electron/main.ts`,
   new) — the single Electron sliver. Exposes `window.lyricstamp.chooseAbletonFolder()` →
   `ipcRenderer.invoke('dialog:chooseAbletonFolder')` → `dialog.showOpenDialog({ properties:
   ['openDirectory'] })`, returning the chosen absolute path or `null`. `dialog` is already
   imported in `main.ts`. The preload is registered via `webPreferences.preload` on the
   `BrowserWindow` and `contextBridge.exposeInMainWorld`.

7. **Checklist UI** (`client/src/RemoteScriptSetup.tsx`, new; styles in `styles.css`) — combines
   the `status` endpoint (fetched on mount, after install, and on reconnect) with the `connected`
   + `handlerStatus` signals already on every WS tick. Replaces today's static "Remote script not
   loaded" banner. Collapses to nothing when all three steps are green.

### Status object

```ts
interface RemoteScriptStatus {
  installed: boolean;          // dest AbletonOSC folder exists
  installedVersion: string | null;  // ABLESET_FORK_VERSION read from dest, or null
  bundledVersion: string | null;    // ABLESET_FORK_VERSION read from source
  upToDate: boolean;           // installed && installedVersion === bundledVersion
  userLibFound: boolean;       // resolved userLibDir exists on disk
  sourceFound: boolean;        // bundled source exists (false ⇒ corrupt install)
  destPath: string;            // absolute <userLibDir>/Remote Scripts/AbletonOSC
}
```

### Install error codes

| `code` | HTTP | Meaning | UI message |
|---|---|---|---|
| `source-missing` | 409 | Bundled fork not found (corrupt app) | "Reinstall LyricStamp — its bundled files are missing." |
| `userlib-missing` | 409 | Resolved User Library dir doesn't exist (and none chosen) | Triggers the folder-picker affordance. |
| `write-failed` | 500 | Copy/backup failed (permissions, disk) | Surfaces the OS error text + a retry. |

### Detection → live checklist

| Step | ✓ when | If not ✓ |
|---|---|---|
| ① Remote script installed | `status.upToDate` | **Install** button, or **Update** when `installed && !upToDate`. When `!userLibFound`, show **Locate your Ableton folder…** first (folder picker). |
| ② AbletonOSC enabled in Live | `connected === true` | Inline steps: *Live → Settings → Link/Tempo/MIDI → Control Surface → AbletonOSC*, then restart Live. |
| ③ Patched handler detected | `handlerStatus === 'present'` | "Restart Live to load the updated script." |

The component re-fetches `status` after a successful install and whenever `connected` flips true.
When all three are ✓ it renders nothing (a healthy machine sees no banner). Steps ②/③ self-check
live as the app observes the connection + handler probe — this is the core "it worked" feedback.

### Data flow

```
RemoteScriptSetup (client)
  ├─ GET /api/remote-script/status ─────────────► server install core ─► fs read (source + dest marker)
  ├─ POST /api/remote-script/install ───────────► server install core ─► backup + copyTree to dest
  │     └─ (userLibPath from) window.lyricstamp.chooseAbletonFolder()  [Electron preload → dialog]
  └─ connected + handlerStatus  ◄─ WS /live tick (already present)
```

### Failure modes & edge cases

- **Source missing / corrupt bundle** → `409 source-missing`; checklist shows reinstall guidance.
- **User Library not found** → status `userLibFound:false`; checklist shows **Locate your Ableton
  folder…**; the picker's chosen path is POSTed as `userLibPath`. In dev browser mode (no
  `window.lyricstamp` bridge) this degrades to "Open Ableton Live once, then retry" text.
- **Chosen folder isn't a User Library** (no `Remote Scripts`) → the core creates
  `Remote Scripts/AbletonOSC` under the chosen dir and the response includes a soft warning so the
  UI can say "Installed under <path> — make sure that's your Ableton User Library."
- **Write permission denied** → `500 write-failed` with the OS error surfaced + retry.
- **Re-install / update** → existing `AbletonOSC` folder is renamed to `AbletonOSC.bak-<ts>` then
  copied fresh (current CLI behavior, unchanged).
- **Old version installed** → `upToDate:false` → step ① shows **Update**.

---

## Testing

### CI-deterministic

- **Server unit tests** (`server/src/remote-script.test.ts`, new — vitest against a real tmpdir,
  mirroring `scripts/install-remote-script.test.mjs`):
  - status: not-installed; installed-up-to-date; installed-old-version; userlib-missing;
    source-missing.
  - install: copies tree + writes marker; backs up an existing install to `.bak-<ts>`;
    idempotent re-install; `write-failed` on an unwritable dest; `source-missing` when source
    absent; honors an explicit `userLibPath`.
- **Route tests** (`server/src/routes.test.ts`): GET status shape; POST install success
  `{installed, installedVersion}`; 409 `source-missing`; 409 `userlib-missing`; 500 `write-failed`
  (mock the core to throw); body validation for a bad `userLibPath`.
- **Playwright** (`e2e/tests/remote-script-setup.spec.ts`, build target — mock `status` via
  `page.route`): checklist renders correct step states; **Install** posts and the step advances on
  a refreshed status; component collapses when all green; **Locate folder** affordance appears
  only when `userLibFound:false`; the existing "Remote script not loaded" behavior is replaced
  (no regression in `live-apply.spec.ts`).

### Manual smoke (`docs/testing/manual-smoke.md`, new section)

- Fresh machine (no script): open LyricStamp → checklist step ① shows **Install** → click →
  files land in `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC` → enable AbletonOSC in
  Live + restart → watch steps ② then ③ self-check → checklist collapses.
- Relocated/missing User Library → **Locate your Ableton folder…** → pick it → install succeeds.
- Update path: install an older marker, relaunch → step ① shows **Update**.

---

## Files touched (anticipated)

| File | Change |
|---|---|
| `server/src/remote-script.ts` | **new** — install core: status + install + path resolution |
| `server/src/remote-script.test.ts` | **new** — unit tests |
| `server/src/routes.ts` | GET/POST `/api/remote-script/*` wired into dispatcher |
| `server/src/routes.test.ts` | route tests for the two endpoints |
| `scripts/install-remote-script.mjs` | refactor `main()` to defer to the canonical core; keep exports |
| `vendor/AbletonOSC/ABLESET_FORK_VERSION` | **new** — `ableset-2` marker |
| `vendor/AbletonOSC/.provenance` | note: bump marker + OSC handler together |
| `electron/main.ts` | set `LYRICSTAMP_REMOTE_SCRIPT_SRC` + `LYRICSTAMP_ABLETON_USERLIB`; register preload; add `dialog:chooseAbletonFolder` handler |
| `electron/preload.ts` | **new** — `contextBridge` exposing `chooseAbletonFolder()` |
| `client/src/RemoteScriptSetup.tsx` | **new** — live checklist component |
| `client/src/app.tsx` | mount `RemoteScriptSetup`; remove the old static banner |
| `client/src/styles.css` | checklist styles |
| `e2e/tests/remote-script-setup.spec.ts` | **new** — Playwright coverage |
| `docs/testing/manual-smoke.md` | new manual smoke section |

## Open implementation decisions (resolved at plan time, not blockers)

1. Whether the `.mjs` CLI imports the TS core directly or keeps its tested `copyTree` primitive
   with a pointer comment (prefer a clean shared import if trivial).
2. Exact placement of the checklist in the layout (header banner slot vs. above `main`) — a visual
   detail for implementation; the existing banner location is the default.
