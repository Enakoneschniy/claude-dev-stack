// tests/pack-files-array.test.mjs
// Asserts package.json "files" shape per D-117.
// Source: Phase 39 VALIDATION §Task 39-01-04
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('package.json "files" array', () => {
  it('includes dist/ (bundler output)', () => {
    expect(pkg.files).toContain('dist/');
  });

  it('keeps bin/, lib/, hooks/, skills/, templates/, patches/', () => {
    for (const f of ['bin/', 'lib/', 'hooks/', 'skills/', 'templates/', 'patches/']) {
      expect(pkg.files).toContain(f);
    }
  });

  it('keeps README.md, LICENSE, NOTICES.md', () => {
    for (const f of ['README.md', 'LICENSE', 'NOTICES.md']) {
      expect(pkg.files).toContain(f);
    }
  });

  it('does NOT include packages/ (source, not distributed)', () => {
    expect(pkg.files).not.toContain('packages/');
    expect(pkg.files.some((f) => f.startsWith('packages'))).toBe(false);
  });

  it('does NOT include .planning/ (internal dev artifact)', () => {
    expect(pkg.files).not.toContain('.planning/');
    expect(pkg.files.some((f) => f.includes('.planning'))).toBe(false);
  });

  it('does NOT include tests/ or tsup.config.ts', () => {
    expect(pkg.files).not.toContain('tests/');
    expect(pkg.files).not.toContain('tsup.config.ts');
  });
});
