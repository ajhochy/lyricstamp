/**
 * Unit tests for copyTree() and shouldSkip() in install-remote-script.mjs.
 *
 * Uses a real temp directory — no mocking needed and ~/Music is never touched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyTree, shouldSkip } from './install-remote-script.mjs';

// ---------------------------------------------------------------------------
// shouldSkip
// ---------------------------------------------------------------------------

describe('shouldSkip', () => {
  it('skips __pycache__', () => {
    expect(shouldSkip('__pycache__')).toBe(true);
  });

  it('skips .bak- entries', () => {
    expect(shouldSkip('track.py.bak-20260605-132524')).toBe(true);
    expect(shouldSkip('AbletonOSC.bak-2026')).toBe(true);
  });

  it('does not skip normal Python files', () => {
    expect(shouldSkip('track.py')).toBe(false);
    expect(shouldSkip('__init__.py')).toBe(false);
    expect(shouldSkip('handler.py')).toBe(false);
  });

  it('does not skip README or LICENSE', () => {
    expect(shouldSkip('README.md')).toBe(false);
    expect(shouldSkip('LICENSE.md')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// copyTree
// ---------------------------------------------------------------------------

describe('copyTree', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ableset-copytree-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildSourceTree(root) {
    // abletonosc/track.py
    const subDir = path.join(root, 'abletonosc');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, 'track.py'), 'def init_api(): pass\n');
    fs.writeFileSync(path.join(subDir, '__init__.py'), '');

    // bak file that must be excluded
    fs.writeFileSync(path.join(subDir, 'track.py.bak-20260605-132524'), 'old content');

    // __pycache__ dir that must be excluded
    const cacheDir = path.join(subDir, '__pycache__');
    fs.mkdirSync(cacheDir);
    fs.writeFileSync(path.join(cacheDir, 'track.cpython-312.pyc'), 'bytecode');

    // top-level files
    fs.writeFileSync(path.join(root, 'README.md'), '# AbletonOSC\n');
    fs.writeFileSync(path.join(root, 'LICENSE.md'), 'MIT\n');
    fs.writeFileSync(path.join(root, '.provenance'), 'source: test\n');
  }

  it('creates the destination directory if it does not exist', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    buildSourceTree(src);

    expect(fs.existsSync(dest)).toBe(false);
    copyTree(src, dest);
    expect(fs.existsSync(dest)).toBe(true);
  });

  it('copies normal files and subdirectories', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    buildSourceTree(src);

    copyTree(src, dest);

    expect(fs.existsSync(path.join(dest, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'LICENSE.md'))).toBe(true);
    expect(fs.existsSync(path.join(dest, '.provenance'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'abletonosc', 'track.py'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'abletonosc', '__init__.py'))).toBe(true);
  });

  it('copies file content faithfully', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    buildSourceTree(src);

    copyTree(src, dest);

    const content = fs.readFileSync(path.join(dest, 'abletonosc', 'track.py'), 'utf8');
    expect(content).toBe('def init_api(): pass\n');
  });

  it('excludes __pycache__ directories', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    buildSourceTree(src);

    copyTree(src, dest);

    expect(fs.existsSync(path.join(dest, 'abletonosc', '__pycache__'))).toBe(false);
  });

  it('excludes .bak- files', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    buildSourceTree(src);

    copyTree(src, dest);

    expect(
      fs.existsSync(path.join(dest, 'abletonosc', 'track.py.bak-20260605-132524')),
    ).toBe(false);
  });

  it('is idempotent — running twice does not throw', () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');
    fs.mkdirSync(src);
    buildSourceTree(src);

    copyTree(src, dest);
    expect(() => copyTree(src, dest)).not.toThrow();

    // Content still correct after second run
    expect(fs.existsSync(path.join(dest, 'abletonosc', 'track.py'))).toBe(true);
  });
});
