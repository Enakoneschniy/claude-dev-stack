import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cds-migrate',
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
