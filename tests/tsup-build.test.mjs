// tests/tsup-build.test.mjs
// Integration test: runs `pnpm tsup` via execFileSync (no shell) and asserts bundle outputs.
// Source: Phase 39 VALIDATION §Task 39-01-02
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

beforeAll(() => {
  // Run tsup via pnpm using execFileSync with argv (no shell).
  execFileSync('pnpm', ['tsup'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
}, 60_000);

describe('tsup build output', () => {
  const entries = [
    'dist/core/index.js',
    'dist/core/index.d.ts',
    'dist/cli/index.js',
    'dist/cli/index.d.ts',
    'dist/cli/quick.js',
    'dist/cli/quick.d.ts',
    'dist/cli/mcp-server.js',
    'dist/cli/mcp-server.d.ts',
    'dist/migrate/index.js',
    'dist/migrate/index.d.ts',
    'dist/migrate/cli.js',
    'dist/migrate/cli.d.ts',
  ];

  for (const e of entries) {
    it(`produces ${e}`, () => {
      expect(existsSync(path.join(root, e))).toBe(true);
    });
  }

  it('externals are NOT inlined (better-sqlite3 internals, SDK internals)', () => {
    const quick = readFileSync(path.join(root, 'dist/cli/quick.js'), 'utf8');
    // Inlined externals would show large class bodies. Imports from external names are OK.
    expect(quick).not.toMatch(/class DatabaseNapi\s*\{/);
  });

  it('mcp-server.js exports main (via named export block or export function)', () => {
    const mcp = readFileSync(path.join(root, 'dist/cli/mcp-server.js'), 'utf8');
    // tsup bundles to named export block: export { ..., main };
    // or inline: export async function main / export function main
    expect(mcp).toMatch(/\bmain\b/);
    expect(mcp).toMatch(/export\s*\{[^}]*\bmain\b[^}]*\}|export\s+(?:async\s+)?function\s+main/);
  });

  it('each bundled js has a sourcemap sidecar', () => {
    const jsFiles = entries.filter((e) => e.endsWith('.js'));
    for (const f of jsFiles) {
      expect(existsSync(path.join(root, f + '.map'))).toBe(true);
    }
  });
});
