import { defineConfig } from '@playwright/test';

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
  },
});