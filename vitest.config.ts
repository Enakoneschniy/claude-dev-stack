import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        test: {
          name: 'root',
          environment: 'node',
          include: ['tests/**/*.test.mjs'],
          pool: 'forks',
          retry: 2,
        },
      },
      // Glob discovers each packages/*/vitest.config.ts
      'packages/*',
    ],
  },
});
