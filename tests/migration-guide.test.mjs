// tests/migration-guide.test.mjs
// Structural assertions on docs/migration-v0-to-v1-alpha.md.
// Source: Phase 39 VALIDATION §Task 39-04-01, 39-04-02
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guidePath = path.join(__dirname, '..', 'docs', 'migration-v0-to-v1-alpha.md');

describe('docs/migration-v0-to-v1-alpha.md', () => {
  it('file exists', () => {
    expect(existsSync(guidePath)).toBe(true);
  });

  const content = existsSync(guidePath) ? readFileSync(guidePath, 'utf8') : '';

  describe('required sections', () => {
    it('has "## Quick checklist" top-level section', () => {
      expect(content).toMatch(/^## Quick checklist$/m);
    });

    it('has "## Breaking Changes" top-level section', () => {
      expect(content).toMatch(/^## Breaking Changes$/m);
    });

    it('has "## Rollback" top-level section', () => {
      expect(content).toMatch(/^## Rollback$/m);
    });

    it('sections appear in the correct order', () => {
      const quickIdx = content.indexOf('## Quick checklist');
      const breakingIdx = content.indexOf('## Breaking Changes');
      const rollbackIdx = content.indexOf('## Rollback');
      expect(quickIdx).toBeGreaterThan(0);
      expect(breakingIdx).toBeGreaterThan(quickIdx);
      expect(rollbackIdx).toBeGreaterThan(breakingIdx);
    });
  });

  describe('breaking changes content', () => {
    it('mentions Node 18 -> Node 20 upgrade', () => {
      expect(content).toMatch(/Node 18/);
      expect(content).toMatch(/Node 20/);
    });

    it('mentions session-end-capture hook rename', () => {
      expect(content).toMatch(/session-end-check/);
      expect(content).toMatch(/session-end-capture/);
    });

    it('mentions the new SQLite dependency (better-sqlite3)', () => {
      expect(content).toMatch(/better-sqlite3/);
    });

    it('mentions the new MCP server entry mcp.servers.cds', () => {
      expect(content).toMatch(/mcp\.servers\.cds/);
    });

    it('mentions /end skill is fallback-only now', () => {
      expect(content).toMatch(/\/end/);
      expect(content.toLowerCase()).toMatch(/fallback/);
    });
  });

  describe('rollback content', () => {
    it('references npm install claude-dev-stack@latest for rollback', () => {
      expect(content).toMatch(/npm install\s+-g\s+claude-dev-stack@latest/);
    });

    it('preserves markdown sessions as source of truth', () => {
      expect(content.toLowerCase()).toMatch(/markdown/);
      expect(content.toLowerCase()).toMatch(/source of truth/);
    });
  });

  describe('quick checklist content', () => {
    it('contains at least 5 checkbox items', () => {
      const checkboxCount = (content.match(/^- \[ \]/gm) ?? []).length;
      expect(checkboxCount).toBeGreaterThanOrEqual(5);
    });
  });

  it('is substantial (>= 80 lines)', () => {
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(80);
  });
});
