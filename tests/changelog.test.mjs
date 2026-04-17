// tests/changelog.test.mjs
// Asserts CHANGELOG.md has the 1.0.0-alpha.1 entry per Keep-a-Changelog.
// Source: Phase 39 VALIDATION §Task 39-04-05
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

describe('CHANGELOG.md', () => {
  it('file exists', () => {
    expect(existsSync(changelogPath)).toBe(true);
  });

  const content = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';

  it('declares Keep-a-Changelog format', () => {
    expect(content).toMatch(/Keep a Changelog/);
  });

  it('has 1.0.0-alpha.1 section header', () => {
    expect(content).toMatch(/^## \[1\.0\.0-alpha\.1\]/m);
  });

  it('has all 5 Keep-a-Changelog subsections for 1.0.0-alpha.1', () => {
    expect(content).toMatch(/^### Added$/m);
    expect(content).toMatch(/^### Changed$/m);
    expect(content).toMatch(/^### Deprecated$/m);
    expect(content).toMatch(/^### Removed$/m);
    expect(content).toMatch(/^### Security$/m);
  });

  it('Added section references the major features', () => {
    expect(content).toMatch(/pnpm monorepo/);
    expect(content).toMatch(/Claude Agent SDK/);
    expect(content).toMatch(/SQLite/);
    expect(content).toMatch(/session-end-capture/);
    expect(content).toMatch(/MCP adapter/);
    expect(content).toMatch(/\/cds-quick/);
  });

  it('Changed section documents breaking changes', () => {
    expect(content).toMatch(/BREAKING/);
    expect(content).toMatch(/Node/);
  });

  it('links migration guide', () => {
    expect(content).toMatch(/migration-v0-to-v1-alpha/);
  });

  it('has a footer link for 1.0.0-alpha.1', () => {
    expect(content).toMatch(/\[1\.0\.0-alpha\.1\]:\s+https:\/\/github\.com/);
  });
});
