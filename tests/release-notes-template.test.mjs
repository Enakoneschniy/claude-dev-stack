// tests/release-notes-template.test.mjs
// Structural assertions on docs/release-notes-template.md.
// Source: Phase 39 VALIDATION §Task 39-05-05
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, '..', 'docs', 'release-notes-template.md');

describe('docs/release-notes-template.md', () => {
  it('file exists', () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  const content = existsSync(templatePath) ? readFileSync(templatePath, 'utf8') : '';

  it('warns about the pre-release checkbox', () => {
    expect(content).toMatch(/Set as a pre-release/);
  });

  it('has 1.0.0-alpha.1 version reference', () => {
    expect(content).toMatch(/1\.0\.0-alpha\.1/);
  });

  it('has @alpha and @latest references explaining the distinction', () => {
    expect(content).toMatch(/@alpha/);
    expect(content).toMatch(/@latest/);
  });

  it('has top-level "Highlights" section', () => {
    expect(content).toMatch(/^## Highlights/m);
  });

  it('has top-level "Breaking Changes" section linking to migration guide', () => {
    expect(content).toMatch(/^## Breaking Changes/m);
    expect(content).toMatch(/migration-v0-to-v1-alpha/);
  });

  it('has top-level "Alpha Caveats" section', () => {
    expect(content).toMatch(/^## Alpha Caveats/m);
  });

  it('has "Full Changelog" section linking CHANGELOG.md', () => {
    expect(content).toMatch(/Full Changelog/);
    expect(content).toMatch(/CHANGELOG\.md/);
  });

  it('mentions feedback channel / GitHub issues', () => {
    expect(content).toMatch(/github\.com\/Enakoneschniy\/claude-dev-stack\/issues/);
  });

  it('explains auto-capture canonical / /end fallback', () => {
    expect(content).toMatch(/auto-capture/i);
    expect(content).toMatch(/\/end/);
    expect(content).toMatch(/fallback/i);
  });
});
