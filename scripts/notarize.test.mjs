// Unit tests for scripts/notarize.cjs
// Validates the no-op paths without touching Apple credentials or live APIs.
//
// vitest picks this up via vitest.config.ts → include: ['scripts/**/*.test.mjs']

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

// We use createRequire so we can import the CommonJS hook from ESM.
const require = createRequire(import.meta.url);

// ---- helpers ---------------------------------------------------------------

function makeFakeContext(appOutDir, productFilename = 'AbleSet Sync') {
  return {
    electronPlatformName: 'darwin',
    appOutDir,
    packager: {
      appInfo: { productFilename },
    },
  };
}

// --------------------------------------------------------------------------

describe('notarize hook — no-op paths (no credentials)', () => {
  let tmpDir;
  let appDir;

  beforeEach(() => {
    // Create a real tmpdir and a fake .app inside it so the fs.existsSync check passes.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notarize-test-'));
    appDir = path.join(tmpDir, 'AbleSet Sync.app');
    fs.mkdirSync(appDir);

    // Ensure no Apple credential env vars are present.
    delete process.env.APPLE_API_KEY;
    delete process.env.APPLE_API_KEY_ID;
    delete process.env.APPLE_API_ISSUER;
    delete process.env.APPLE_ID;
    delete process.env.APPLE_APP_SPECIFIC_PASSWORD;
    delete process.env.APPLE_TEAM_ID;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clear module cache so env changes are picked up cleanly in each test.
    delete require.cache[require.resolve('./notarize.cjs')];
  });

  it('resolves without throwing when no creds are set (darwin platform)', async () => {
    const { default: notarizeHook } = require('./notarize.cjs');
    const ctx = makeFakeContext(tmpDir);

    await expect(notarizeHook(ctx)).resolves.toBeUndefined();
  });

  it('returns immediately (no-op) on non-darwin platforms', async () => {
    const { default: notarizeHook } = require('./notarize.cjs');
    const ctx = { ...makeFakeContext(tmpDir), electronPlatformName: 'win32' };

    await expect(notarizeHook(ctx)).resolves.toBeUndefined();
  });

  it('throws when .app does not exist but credentials are present', async () => {
    // Provide fake creds so the "skip" branch is bypassed.
    process.env.APPLE_API_KEY = '/tmp/fake.p8';
    process.env.APPLE_API_KEY_ID = 'FAKEKEYID';
    process.env.APPLE_API_ISSUER = 'fake-issuer-uuid';

    // Remove the fake .app so the existence check fails.
    fs.rmdirSync(appDir);

    const { default: notarizeHook } = require('./notarize.cjs');
    const ctx = makeFakeContext(tmpDir);

    await expect(notarizeHook(ctx)).rejects.toThrow(/expected .app not found/);
  });
});
