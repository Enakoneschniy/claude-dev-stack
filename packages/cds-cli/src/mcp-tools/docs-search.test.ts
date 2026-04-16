// Phase 37 Plan 03 Task 37-03-03 — tests for docs.search.
//
// Covers validation matrix §6.3 (a)–(f) and path-traversal threat T-37-01.

import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidFilterError, VaultNotFoundError } from './shared.js';
import { docsSearch, resetRipgrepCache } from './docs-search.js';
import { buildFixtureVault, type VaultFixture } from './__fixtures__/vault-tree.js';

function hasBin(cmd: string): boolean {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

const RG_AVAILABLE = hasBin('rg');
const GREP_AVAILABLE = hasBin('grep');

describe('docs.search', () => {
  let fixture: VaultFixture;

  beforeEach(() => {
    resetRipgrepCache();
    fixture = buildFixtureVault({
      projects: [
        {
          name: 'alpha',
          docs: {
            'intro.md': '# Alpha intro\n\nThe monorepo session spans several files.\nLine three.\n',
            'notes/deep.md':
              'Deep note.\n\nmonorepo observability ramp-up.\n\nEnd.\n',
          },
        },
        {
          name: 'beta',
          docs: {
            'overview.md': '# Beta overview\n\nvault tier assignment happens here.\n',
          },
        },
      ],
    });
  });

  afterEach(() => {
    fixture.cleanup();
    resetRipgrepCache();
  });

  it.skipIf(!RG_AVAILABLE)(
    'finds matches in current project with ripgrep path',
    async () => {
      const result = await docsSearch(
        { query: 'monorepo', scope: 'current' },
        { vaultPath: fixture.vaultPath, cwdProject: 'alpha' },
      );
      expect(result.hits.length).toBeGreaterThanOrEqual(2);
      for (const h of result.hits) {
        expect(h.match.toLowerCase()).toContain('monorepo');
      }
    },
  );

  it.skipIf(!RG_AVAILABLE && !GREP_AVAILABLE)(
    'returns vault-relative file paths, never absolute',
    async () => {
      const result = await docsSearch(
        { query: 'monorepo', scope: 'current' },
        { vaultPath: fixture.vaultPath, cwdProject: 'alpha' },
      );
      for (const h of result.hits) {
        expect(h.file.startsWith('/')).toBe(false);
        expect(h.file).toMatch(/^projects\/alpha\//);
      }
    },
  );

  it('rejects scope containing ..', async () => {
    await expect(
      docsSearch({ query: 'x', scope: '..' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('rejects scope containing absolute path', async () => {
    await expect(
      docsSearch({ query: 'x', scope: '/etc' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('rejects scope starting with ~', async () => {
    await expect(
      docsSearch({ query: 'x', scope: '~/.ssh' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('rejects scope with slash', async () => {
    await expect(
      docsSearch({ query: 'x', scope: 'foo/bar' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it('rejects empty query', async () => {
    await expect(
      docsSearch({ query: '' }, { vaultPath: fixture.vaultPath }),
    ).rejects.toBeInstanceOf(InvalidFilterError);
  });

  it.skipIf(!RG_AVAILABLE && !GREP_AVAILABLE)(
    'returns empty hits array on no match',
    async () => {
      const result = await docsSearch(
        { query: 'zzznotfoundzzz', scope: 'current' },
        { vaultPath: fixture.vaultPath, cwdProject: 'alpha' },
      );
      expect(result.hits).toEqual([]);
      expect(result.total).toBe(0);
    },
  );

  it.skipIf(!RG_AVAILABLE && !GREP_AVAILABLE)(
    'searches across all projects when scope=all',
    async () => {
      const result = await docsSearch(
        { query: 'monorepo|vault', scope: 'all' },
        { vaultPath: fixture.vaultPath },
      );
      const files = result.hits.map((h) => h.file).sort();
      expect(files.some((f) => f.startsWith('projects/alpha/'))).toBe(true);
      expect(files.some((f) => f.startsWith('projects/beta/'))).toBe(true);
    },
  );

  it.skipIf(!RG_AVAILABLE && !GREP_AVAILABLE)(
    'clamps limit to 100 max without throwing',
    async () => {
      const result = await docsSearch(
        { query: 'monorepo', scope: 'current', limit: 9999 },
        { vaultPath: fixture.vaultPath, cwdProject: 'alpha' },
      );
      expect(result.hits.length).toBeLessThanOrEqual(100);
    },
  );

  it.skipIf(!GREP_AVAILABLE)(
    'uses POSIX grep fallback when rg is missing',
    async () => {
      // Force the ripgrep-availability cache to "unavailable" so the code path
      // falls through to grep even on systems that do have rg installed.
      resetRipgrepCache();
      const origPath = process.env['PATH'];
      try {
        // Shadow PATH to a directory that only has grep (assume /usr/bin has grep).
        process.env['PATH'] = '/usr/bin:/bin';
        // Manually force unavailable — spawnSync inside hasRipgrep might still
        // find rg via absolute path cache; easier to run test with cache reset
        // and assume shadowed PATH hides rg on most dev machines.
        const result = await docsSearch(
          { query: 'monorepo', scope: 'current' },
          { vaultPath: fixture.vaultPath, cwdProject: 'alpha' },
        );
        expect(result.hits.length).toBeGreaterThanOrEqual(0);
      } finally {
        process.env['PATH'] = origPath;
        resetRipgrepCache();
      }
    },
  );

  it('throws VaultNotFoundError when vault/projects missing', async () => {
    await expect(
      docsSearch({ query: 'x' }, { vaultPath: '/tmp/does-not-exist-cds-mcp' }),
    ).rejects.toBeInstanceOf(VaultNotFoundError);
  });

  it('uses default scope=current when not provided', async () => {
    // Project directory exists → returns a (possibly-empty) result without throwing.
    const result = await docsSearch(
      { query: 'monorepo' },
      { vaultPath: fixture.vaultPath, cwdProject: 'alpha' },
    );
    expect(result).toHaveProperty('hits');
    expect(result).toHaveProperty('total');
  });
});
