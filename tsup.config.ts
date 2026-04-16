// tsup.config.ts
// Phase 39 bundler — produces dist/ from packages/cds-*/src sources.
// Three externals: better-sqlite3 (native addon), @anthropic-ai/claude-agent-sdk
// (dynamic streaming helpers), @modelcontextprotocol/sdk (transport adapter dynamic imports).
// Source: .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 1.
import { defineConfig } from 'tsup';

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
  dts: true,
  clean: true,
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  minify: false,
});
