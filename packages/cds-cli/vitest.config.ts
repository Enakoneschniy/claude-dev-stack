import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cds-cli',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
