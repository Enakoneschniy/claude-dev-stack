// tests/pack-size.test.mjs
// Asserts `pnpm pack --json` tarball size < 5 MB (D-119).
// Requires tsup build to have run first. Uses execFileSync (no shell).
// Source: Phase 39 VALIDATION §Task 39-01-05, RESEARCH §Pattern 6
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

describe('tarball size budget', () => {
  let packInfo;

  beforeAll(() => {
    // Ensure dist/ exists before packing
    execFileSync('pnpm', ['tsup'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
    const output = execFileSync('pnpm', ['pack', '--json'], { cwd: root, encoding: 'utf8' });
    // pnpm emits progress + JSON on stdout. Find the JSON array.
    const match = output.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (!match) throw new Error('pnpm pack --json did not emit JSON array:\n' + output);
    packInfo = JSON.parse(match[0])[0];
  }, 90_000);

  it('tarball size is under 5 MB', () => {
    expect(packInfo.size).toBeLessThan(5_242_880);
  });

  it('unpacked size is under 20 MB (sanity)', () => {
    expect(packInfo.unpackedSize).toBeLessThan(20_971_520);
  });

  it('tarball includes dist/core/index.js + dist/cli/quick.js + dist/cli/mcp-server.js + dist/migrate/cli.js', () => {
    const files = packInfo.files.map((f) => f.path);
    expect(files).toContain('dist/core/index.js');
    expect(files).toContain('dist/cli/quick.js');
    expect(files).toContain('dist/cli/mcp-server.js');
    expect(files).toContain('dist/migrate/cli.js');
  });

  it('tarball does NOT include packages/ or tests/ or .planning/', () => {
    const files = packInfo.files.map((f) => f.path);
    for (const f of files) {
      expect(f.startsWith('packages/'), `forbidden path in tarball: ${f}`).toBe(false);
      expect(f.startsWith('tests/'), `forbidden path in tarball: ${f}`).toBe(false);
      expect(f.startsWith('.planning/'), `forbidden path in tarball: ${f}`).toBe(false);
    }
  });

  it('tarball includes hooks/session-end-capture.sh + .mjs (Phase 36 artifacts)', () => {
    const files = packInfo.files.map((f) => f.path);
    expect(files).toContain('hooks/session-end-capture.sh');
    expect(files).toContain('hooks/session-end-capture.mjs');
  });

  it('tarball includes skills/cds-quick/SKILL.md (Plan 03 artifact)', () => {
    const files = packInfo.files.map((f) => f.path);
    expect(files).toContain('skills/cds-quick/SKILL.md');
  });
});
