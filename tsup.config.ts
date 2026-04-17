// tsup.config.ts
// Phase 39 bundler — produces dist/ from packages/cds-*/src sources.
// Three externals: better-sqlite3 (native addon), @anthropic-ai/claude-agent-sdk
// (dynamic streaming helpers), @modelcontextprotocol/sdk (transport adapter dynamic imports).
// @cds/core is mapped to its TypeScript source so tsup bundles cross-package imports inline
// without requiring a pre-build step.
// Source: .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 1.
import { defineConfig } from 'tsup';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: {
    'core/index': 'packages/cds-core/src/index.ts',
    'cli/index': 'packages/cds-cli/src/index.ts',
    'cli/quick': 'packages/cds-cli/src/quick.ts',
    'cli/mcp-server': 'packages/cds-cli/src/mcp-server.ts',
    'migrate/index': 'packages/cds-migrate/src/index.ts',
    'migrate/cli': 'packages/cds-migrate/src/cli.ts',
  },
  format: ['esm'],
  target: 'node20',
  external: [
    'better-sqlite3',
    '@anthropic-ai/claude-agent-sdk',
    '@modelcontextprotocol/sdk',
  ],
  dts: {
    // tsup@8.5.1 + TypeScript 6 workaround: tsup's DTS plugin internally sets
    // baseUrl:"." which triggers TS6 deprecation. Passing ignoreDeprecations silences it.
    compilerOptions: {
      // @ts-expect-error TypeScript 6 compilerOptions type doesn't expose ignoreDeprecations yet
      ignoreDeprecations: '6.0',
    },
  },
  clean: true,
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: false,
  esbuildOptions(options) {
    // Map workspace package aliases to their TypeScript source so esbuild
    // can inline cross-package imports without a pre-build step.
    options.alias = {
      '@cds/core': path.join(__dirname, 'packages/cds-core/src/index.ts'),
      '@cds/core/capture': path.join(__dirname, 'packages/cds-core/src/capture/index.ts'),
    };
  },
});
