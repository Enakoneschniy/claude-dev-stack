// tests/version-bump.test.mjs
// Asserts root package.json is bumped to 1.0.0-alpha.1 with correct engines + deps.
// Source: Phase 39 VALIDATION §Task 39-01-03
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('root package.json v1.0.0-alpha.1 bump', () => {
  it('version is exactly 1.0.0-alpha.1', () => {
    expect(pkg.version).toBe('1.0.0-alpha.1');
  });

  it('engines.node is >=20', () => {
    expect(pkg.engines.node).toBe('>=20');
  });

  it('dependencies include the three bundled externals + prompts', () => {
    expect(pkg.dependencies['better-sqlite3']).toMatch(/^\^12\./);
    expect(pkg.dependencies['@anthropic-ai/claude-agent-sdk']).toMatch(/^\^0\./);
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toMatch(/^\^1\./);
    expect(pkg.dependencies.prompts).toMatch(/^\^2\./);
  });

  it('devDependencies include tsup', () => {
    expect(pkg.devDependencies.tsup).toMatch(/^\^8\./);
  });

  it('scripts.build is tsup and scripts.typecheck is tsc --build', () => {
    expect(pkg.scripts.build).toBe('tsup');
    expect(pkg.scripts.typecheck).toBe('tsc --build');
  });

  it('name, bin, type, publishConfig preserved byte-for-byte', () => {
    expect(pkg.name).toBe('claude-dev-stack');
    expect(pkg.bin['claude-dev-stack']).toBe('./bin/cli.mjs');
    expect(pkg.type).toBe('module');
    expect(pkg.publishConfig.provenance).toBe(true);
    expect(pkg.publishConfig.access).toBe('public');
  });

  it('packageManager pinned to pnpm@10.6.3', () => {
    expect(pkg.packageManager).toBe('pnpm@10.6.3');
  });
});
