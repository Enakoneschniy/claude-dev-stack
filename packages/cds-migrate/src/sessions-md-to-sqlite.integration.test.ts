// Phase 38 Plan 02 Task 38-02-07 — live Haiku smoke test.
//
// Gated by `INTEGRATION=1` env var + `ANTHROPIC_API_KEY`. Skipped by default
// so CI + routine `pnpm test` runs stay offline. When enabled, makes exactly
// one real Haiku call against the smallest fixture (bare-list.md, ~$0.001
// per call) to prove end-to-end wiring matches the public dispatchAgent
// contract from @cds/core.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { migrateMarkdownSessions } from './sessions-md-to-sqlite.js';
import {
  createTempVault,
  type TempVault,
} from '../tests/helpers/temp-vault.js';
import { createTestDB, type TestDB } from '../tests/helpers/temp-db.js';

const SHOULD_RUN =
  process.env['INTEGRATION'] === '1' && Boolean(process.env['ANTHROPIC_API_KEY']);

describe.skipIf(!SHOULD_RUN)(
  'migrateMarkdownSessions — real Haiku (INTEGRATION=1 gated)',
  () => {
    let vault: TempVault;
    let testDb: TestDB;

    beforeEach(() => {
      vault = createTempVault({ fixtures: ['bare-list.md'] });
      testDb = createTestDB();
    });

    afterEach(() => {
      testDb.cleanup();
      vault.cleanup();
    });

    it(
      'writes 1 session row with at least 1 observation using the production dispatchAgent',
      { timeout: 60_000 },
      async () => {
        const report = await migrateMarkdownSessions({
          vaultPath: vault.vaultPath,
          projectName: vault.projectName,
          dryRun: false,
          db: testDb.db,
          // No dispatchAgent override — uses production @cds/core/dispatchAgent.
        });

        expect(report.total.succeeded).toBeGreaterThan(0);
        expect(report.total.actualCost).toBeGreaterThan(0);

        const sessionCount = (
          testDb.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as {
            n: number;
          }
        ).n;
        expect(sessionCount).toBe(1);

        const obsCount = (
          testDb.db
            .prepare('SELECT COUNT(*) AS n FROM observations')
            .get() as { n: number }
        ).n;
        expect(obsCount).toBeGreaterThanOrEqual(1);
      },
    );
  },
);
