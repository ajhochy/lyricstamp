import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Discover tests in both server and client
    include: ['server/**/*.test.ts', 'client/**/*.test.ts'],
    // Node environment is correct for all three pure server modules.
    // If client tests with DOM are added later, a separate workspace entry
    // can override the environment for those files.
    environment: 'node',
  },
});
