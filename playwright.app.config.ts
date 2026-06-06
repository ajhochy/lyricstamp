import { defineConfig } from '@playwright/test';

// Packaged-app target: assumes the built LyricStamp.app is already running
// and serving on :7878. Launch the .app yourself, then:
//   npx playwright test --config=playwright.app.config.ts
// Used to iterate the actual shipped build to parity with dev mode.

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:7878',
  },
  // No webServer — the packaged Electron app provides the server on :7878.
});
