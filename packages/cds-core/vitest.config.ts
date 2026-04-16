import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cds-core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
