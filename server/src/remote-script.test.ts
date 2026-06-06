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
    installRemoteScript({ sourceDir, userLibDir });
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
