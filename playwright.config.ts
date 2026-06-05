import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Use a fresh temp dir for each test run so tests never touch the user's real
// session data at ~/Library/Application Support/ableset-lyrics-sync/.
const e2eDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablesync-e2e-build-'));

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:7878',
  },
  webServer: {
    command: 'node server/dist/server/src/index.js',
    url: 'http://127.0.0.1:7878/api/health',
    reuseExistingServer: false,
    timeout: 15000,
    cwd: '.',
    env: {
      ABLESET_DATA_DIR: e2eDataDir,
    },
  },
});