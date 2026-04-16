// tests/tsup-config.test.mjs
// Structural assertions on tsup.config.ts — content-level without executing tsup.
// Source: Phase 39 VALIDATION §Task 39-01-01
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '..', 'tsup.config.ts');
const configText = readFileSync(configPath, 'utf8');

describe('tsup.config.ts structure', () => {
  it('declares all three externals', () => {
    expect(configText).toContain("'better-sqlite3'");
    expect(configText).toContain("'@anthropic-ai/claude-agent-sdk'");
    expect(configText).toContain("'@modelcontextprotocol/sdk'");
  });

  it('declares 6 entries (core, cli, cli/quick, cli/mcp-server, migrate, migrate/cli)', () => {
    expect(configText).toContain("'core/index'");
    expect(configText).toContain("'cli/index'");
    expect(configText).toContain("'cli/quick'");
    expect(configText).toContain("'cli/mcp-server'");
    expect(configText).toContain("'migrate/index'");
    expect(configText).toContain("'migrate/cli'");
  });

  it('targets node20 + ESM format', () => {
    expect(configText).toContain("target: 'node20'");
    expect(configText).toContain("format: ['esm']");
  });

  it('emits dts + sourcemap, no minify, no splitting', () => {
    expect(configText).toContain('dts: true');
    expect(configText).toContain('sourcemap: true');
    expect(configText).toContain('minify: false');
    expect(configText).toContain('splitting: false');
  });

  it('outputs to dist/', () => {
    expect(configText).toContain("outDir: 'dist'");
  });
});
