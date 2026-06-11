import { defineConfig } from 'vitest/config';

// Contract tests (acceptance-contract skill) live under tests/contract/ and are
// run explicitly via `npx vitest run --config vitest.contract.config.ts`. They
// are kept out of the default `npm test` glob so the unit-test surface stays
// stable; the orchestrator/verification-gate runs them by this config.
export default defineConfig({
  test: {
    include: ['tests/contract/**/*.spec.ts'],
    environment: 'node',
  },
});
