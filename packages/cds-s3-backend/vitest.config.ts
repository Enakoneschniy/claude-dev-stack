import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cds-s3-backend',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
