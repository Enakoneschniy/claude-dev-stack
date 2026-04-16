// Phase 38 Plan 02 Task 38-02-06 — unit tests for migrateMarkdownSessions.
//
// Covers dry-run, apply, idempotency, force-refresh, and failure-rollback
// paths. All dispatch is mocked — no network, no real Haiku.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

import { migrateMarkdownSessions } from './sessions-md-to-sqlite.js';
import { hashFile } from './file-hash.js';

import {
  createMockDispatchAgent,
  type DispatchFn,
} from '../tests/helpers/mock-dispatch-agent.js';
import {
  createTempVault,
  mutateFixture,
  type TempVault,
} from '../tests/helpers/temp-vault.js';
import { createTestDB, type TestDB } from '../tests/helpers/temp-db.js';

const ALL_FIXTURES = [
  'empty-sections.md',
  'russian-only.md',
  'mixed-lang.md',
  'bare-list.md',
  'large.md',
];

describe('migrateMarkdownSessions', () => {
  let vault: TempVault;
  let testDb: TestDB;

  beforeEach(() => {
    vault = createTempVault({ fixtures: ALL_FIXTURES });
    testDb = createTestDB();
  });

  afterEach(() => {
    testDb.cleanup();
    vault.cleanup();
  });

  // -------------------------------------------------------------------------
  // Dry-run mode
  // -------------------------------------------------------------------------

  describe('dry-run mode', () => {
    it('returns a report with 5 will-migrate entries when DB is empty', async () => {
      const report = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: true,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      expect(report.files).toHaveLength(5);
      expect(report.files.every((f) => f.status === 'will-migrate')).toBe(true);
      expect(report.total.fileCount).toBe(5);
      expect(report.total.estimatedCost).toBeGreaterThan(0);
    });

    it('does NOT write any rows in dry-run', async () => {
      await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: true,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const sessionCount = (
        testDb.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as {
          n: number;
        }
      ).n;
      expect(sessionCount).toBe(0);
    });

    it('returns an empty report when the sessions directory is missing', async () => {
      const emptyVault = createTempVault({ projectName: 'no-sessions' });
      try {
        const report = await migrateMarkdownSessions({
          vaultPath: emptyVault.vaultPath,
          projectName: 'does-not-exist',
          dryRun: true,
          db: testDb.db,
          dispatchAgent: createMockDispatchAgent(),
        });
        expect(report.files).toHaveLength(0);
        expect(report.total.fileCount).toBe(0);
      } finally {
        emptyVault.cleanup();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Apply mode
  // -------------------------------------------------------------------------

  describe('apply mode', () => {
    it('writes one sessions row per file and at least one observations row per file', async () => {
      const report = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      expect(report.files.every((f) => f.status === 'migrated')).toBe(true);
      const sessionCount = (
        testDb.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as {
          n: number;
        }
      ).n;
      expect(sessionCount).toBe(5);
      const obsCount = (
        testDb.db.prepare('SELECT COUNT(*) AS n FROM observations').get() as {
          n: number;
        }
      ).n;
      expect(obsCount).toBeGreaterThanOrEqual(5);
    });

    it('sessions.id uses the backfill- prefix (D-94)', async () => {
      await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const ids = testDb.db.prepare('SELECT id FROM sessions').all() as Array<{
        id: string;
      }>;
      expect(ids).toHaveLength(5);
      expect(ids.every((r) => r.id.startsWith('backfill-'))).toBe(true);
    });

    it('sessions.source_hash matches sha256 of the source file', async () => {
      await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const filePath = join(vault.sessionsDir, 'empty-sections.md');
      const expected = hashFile(filePath);
      const row = testDb.db
        .prepare('SELECT source_hash FROM sessions WHERE id = ?')
        .get('backfill-empty-sections') as { source_hash: string };
      expect(row.source_hash).toBe(expected);
    });

    it('total.actualCost equals the sum of per-file actualCost', async () => {
      const report = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const sum = report.files.reduce((s, f) => s + (f.actualCost ?? 0), 0);
      expect(report.total.actualCost).toBeCloseTo(sum, 10);
    });

    it('entities table is populated from the emit_observations payload', async () => {
      await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const entityCount = (
        testDb.db.prepare('SELECT COUNT(*) AS n FROM entities').get() as {
          n: number;
        }
      ).n;
      expect(entityCount).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  describe('idempotency', () => {
    it('re-run on unchanged hashes returns all unchanged and writes zero new rows', async () => {
      await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const before = (
        testDb.db.prepare('SELECT COUNT(*) AS n FROM observations').get() as {
          n: number;
        }
      ).n;

      const second = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      expect(second.files.every((f) => f.status === 'unchanged')).toBe(true);
      const after = (
        testDb.db.prepare('SELECT COUNT(*) AS n FROM observations').get() as {
          n: number;
        }
      ).n;
      expect(after).toBe(before);
    });

    it('hash-changed file without forceRefresh is skipped with a warning reason', async () => {
      await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      mutateFixture(
        vault,
        'bare-list.md',
        '# Session: 2026-04-12 edited\n\nnew content',
      );

      const report = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const bare = report.files.find((f) => f.filename === 'bare-list.md')!;
      expect(bare.status).toBe('hash-changed');
      expect(bare.reason).toContain('force-refresh');
      const others = report.files.filter((f) => f.filename !== 'bare-list.md');
      expect(others.every((f) => f.status === 'unchanged')).toBe(true);
    });

    it('forceRefresh on a hash-changed file deletes + re-inserts without duplicate rows', async () => {
      await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      mutateFixture(
        vault,
        'bare-list.md',
        '# Session: 2026-04-12 edited\n\nnew content',
      );

      const report = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        forceRefresh: true,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
      });
      const bare = report.files.find((f) => f.filename === 'bare-list.md')!;
      expect(bare.status).toBe('refreshed');

      const sessionCount = (
        testDb.db
          .prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?')
          .get('backfill-bare-list') as { n: number }
      ).n;
      expect(sessionCount).toBe(1);

      const obsCountAfter = (
        testDb.db
          .prepare('SELECT COUNT(*) AS n FROM observations WHERE session_id = ?')
          .get('backfill-bare-list') as { n: number }
      ).n;
      expect(obsCountAfter).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Failure handling
  // -------------------------------------------------------------------------

  describe('failure handling', () => {
    it('dispatch failure on one file does not contaminate other files', async () => {
      // Fail ONLY when the prompt corresponds to large.md (largest fixture).
      const baseMock = createMockDispatchAgent();
      const failingDispatch: DispatchFn = async (opts) => {
        if (opts.prompt.length > 2000) {
          throw new Error('simulated dispatch failure');
        }
        return baseMock(opts);
      };

      const report = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: false,
        db: testDb.db,
        dispatchAgent: failingDispatch,
      });

      const largeResult = report.files.find(
        (f) => f.filename === 'large.md',
      )!;
      expect(largeResult.status).toBe('failed');
      expect(largeResult.reason).toContain('simulated dispatch failure');

      const others = report.files.filter((f) => f.filename !== 'large.md');
      expect(others.every((f) => f.status === 'migrated')).toBe(true);

      const failedCount = (
        testDb.db
          .prepare('SELECT COUNT(*) AS n FROM sessions WHERE id = ?')
          .get('backfill-large') as { n: number }
      ).n;
      expect(failedCount).toBe(0);
    });

    it('onFileResult callback fires once per file', async () => {
      const calls: string[] = [];
      const report = await migrateMarkdownSessions({
        vaultPath: vault.vaultPath,
        projectName: vault.projectName,
        dryRun: true,
        db: testDb.db,
        dispatchAgent: createMockDispatchAgent(),
        onFileResult: (r) => calls.push(r.filename),
      });
      expect(calls).toHaveLength(5);
      expect(new Set(calls)).toEqual(
        new Set(report.files.map((f) => f.filename)),
      );
    });
  });
});
