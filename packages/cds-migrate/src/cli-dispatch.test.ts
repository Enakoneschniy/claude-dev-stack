// Phase 38 Plan 03 Task 38-03-04 — structural regression test for the
// bin/cli.mjs dispatch wiring. Asserts the migrate route exists and the
// MCP/sync routes (Phase 37 / Phase 0 pre-existing) were not perturbed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve the repo root from this file's location:
// packages/cds-migrate/src/ → ../../.. → repo root.
const REPO_ROOT = join(__dirname, '..', '..', '..');
const CLI_PATH = join(REPO_ROOT, 'bin', 'cli.mjs');
const PKG_PATH = join(REPO_ROOT, 'package.json');

describe('bin/cli.mjs — migrate dispatch', () => {
  const source = readFileSync(CLI_PATH, 'utf8');

  it('contains a migrate case dispatching to @cds/migrate dist', () => {
    expect(source).toMatch(/case\s+['"]migrate['"]\s*:/);
    expect(source).toMatch(/packages\/cds-migrate\/dist\/cli\.js/);
  });

  it('slices args before passing to migrate main()', () => {
    const migrateBlock = source.match(
      /case\s+['"]migrate['"]\s*:[\s\S]*?break;/,
    );
    expect(migrateBlock).not.toBeNull();
    expect(migrateBlock![0]).toContain('args.slice(1)');
  });

  it('propagates non-zero exit codes from migrate main()', () => {
    const migrateBlock = source.match(
      /case\s+['"]migrate['"]\s*:[\s\S]*?break;/,
    );
    expect(migrateBlock).not.toBeNull();
    const block = migrateBlock![0];
    const ok =
      block.includes('process.exit(exitCode)') ||
      block.includes('process.exit(code)') ||
      block.includes('process.exitCode');
    expect(ok).toBe(true);
  });

  it('mcp case still routes to lib/mcp.mjs (regression)', () => {
    const mcpBlock = source.match(/case\s+['"]mcp['"]\s*:[\s\S]*?break;/);
    expect(mcpBlock).not.toBeNull();
    expect(mcpBlock![0]).toContain('lib/mcp.mjs');
    expect(mcpBlock![0]).not.toContain('packages/cds-migrate');
  });

  it('sync case still routes to lib/export.mjs (regression)', () => {
    const syncBlock = source.match(/case\s+['"]sync['"]\s*:[\s\S]*?break;/);
    expect(syncBlock).not.toBeNull();
    expect(syncBlock![0]).toContain('lib/export.mjs');
  });

  it('help text lists the migrate section', () => {
    expect(source).toMatch(/Migrate/);
    expect(source).toMatch(/migrate sessions/);
  });

  it('root package.json bin field is unchanged (Phase 33 D-03)', () => {
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as {
      bin: Record<string, string>;
    };
    expect(pkg.bin).toEqual({ 'claude-dev-stack': './bin/cli.mjs' });
  });
});
