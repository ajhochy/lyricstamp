import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Dev-mode target: runs the app exactly as `npm run dev` does — the live
// client source served by Vite on :3000, proxying /api and /live to the
// tsx-run server on :7878. Use this to confirm a spec reflects dev behaviour:
//   npx playwright test --config=playwright.dev.config.ts
// The default playwright.config.ts runs the same specs against the production
// build (compiled server serving out/renderer).

// Isolated temp dir so tests never touch the user's real session data.
const e2eDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ablesync-e2e-dev-'));

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://127.0.0.1:7878/api/health',
      reuseExistingServer: false,
      timeout: 20000,
      cwd: '.',
      env: {
        ABLESET_DATA_DIR: e2eDataDir,
      },
    },
    {
      // Pin Vite to 127.0.0.1 so the health-check URL below matches its bind
      // address (Vite defaults to `localhost`, which resolves to ::1 on macOS).
      command: 'npx vite --config client/vite.config.ts --host 127.0.0.1 --port 3000',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      timeout: 30000,
      cwd: '.',
    },
  ],
});
