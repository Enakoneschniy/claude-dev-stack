---
plan_id: 40-04-sqlite-busy-timeout-pragma
phase: 40
plan: 04
type: execute
wave: 2
depends_on: []
files_modified:
  - packages/cds-core/src/vault/sessions.busy-timeout.test.ts
autonomous: true
requirements:
  - SQLITE-BUSY-TIMEOUT
user_setup: []
must_haves:
  truths:
    - "`openRawDb` sets `busy_timeout = 5000` (already present at line 46 of `packages/cds-core/src/vault/internal/db.ts` — this plan VERIFIES + adds a regression test, not implements)"
    - "A dedicated regression test asserts the pragma persists: opens a DB, reads `PRAGMA busy_timeout`, asserts value is 5000, closes and reopens, reads again, asserts value still 5000"
    - "`pnpm vitest run packages/cds-core/src/vault/sessions.busy-timeout.test.ts` exits 0"
  artifacts:
    - path: "packages/cds-core/src/vault/sessions.busy-timeout.test.ts"
      provides: "Regression test confirming busy_timeout = 5000 persists across DB reopens"
      contains: "busy_timeout"
  key_links:
    - from: "packages/cds-core/src/vault/sessions.busy-timeout.test.ts"
      to: "packages/cds-core/src/vault/internal/db.ts::openRawDb"
      via: "opens DB + reads PRAGMA busy_timeout"
      pattern: "busy_timeout"
---

<objective>
Verify the `busy_timeout = 5000` pragma is already set in `openRawDb` (shipped in Phase 35 at line 46 of `packages/cds-core/src/vault/internal/db.ts`) and add a regression test asserting it persists across DB reopens. Per D-131, the pragma helps avoid SQLITE_BUSY under concurrent CLAUDE_SESSION_ID writes from hooks.

NOTE: the pragma is ALREADY implemented. Phase 35 set it at `db.pragma('busy_timeout = 5000');`. This plan's task is test-only — no production code change needed. Confirm via inspection first.

Purpose: close the Phase 35 follow-up item with a regression test proving the pragma survives re-open.

Output: 1 new test file.

response_language: ru — все user-facing сообщения от тестов на английском (тесты — код), общение в чате на русском.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md
@./CLAUDE.md
@./packages/cds-core/src/vault/internal/db.ts
@./packages/cds-core/src/vault/sessions.ts

<interfaces>
**packages/cds-core/src/vault/internal/db.ts** (Phase 35):
```ts
export function openRawDb(absoluteDbPath: string): RawDatabase {
  mkdirSync(dirname(absoluteDbPath), { recursive: true });
  let db: RawDatabase;
  try {
    db = new Database(absoluteDbPath);
  } catch (err) {
    throw new DbOpenError(...);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');     // <-- ALREADY HERE (line 46)
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -10000');

  // FTS5 check + migrations ...
  return db;
}
```

The pragma IS already present. Plan 04 verifies this and adds a test that:
1. Opens a DB via `openRawDb(tempPath)`.
2. Reads `PRAGMA busy_timeout` — asserts === 5000.
3. Closes the DB.
4. Reopens via `openRawDb(tempPath)`.
5. Reads again — asserts === 5000 (proves the pragma is re-applied on each open, not a one-time DB property).

**Test location:** `packages/cds-core/src/vault/sessions.busy-timeout.test.ts` (TypeScript, alongside existing `sessions.test.ts` if any, or as the first vault test in the cds-core package).

**Import for testing:** `openRawDb` is an INTERNAL export from `./internal/db.js`. The test can import it directly since tests have access to internal modules. The test does NOT use the public `openSessionsDB()` API because that involves caching and project path resolution which is orthogonal to what we're testing.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Confirm busy_timeout is present in openRawDb (read-only verification)</name>
  <read_first>
    - packages/cds-core/src/vault/internal/db.ts (full file)
  </read_first>
  <files>
    - (no modifications — read-only confirmation)
  </files>
  <action>
  Read `packages/cds-core/src/vault/internal/db.ts` and confirm:

  1. Line 46 (or nearby) contains `db.pragma('busy_timeout = 5000');`
  2. It is AFTER the WAL pragma and BEFORE the FTS5 check.
  3. No conditional logic wraps it (i.e. it always executes).

  If the pragma is present and unconditional, proceed to Task 2.

  If the pragma is MISSING (contradicting our inspection), create it per D-131: add `db.pragma('busy_timeout = 5000');` immediately after the WAL pragma line. This scenario is unlikely given the current codebase state.
  </action>
  <verify>
    <automated>grep -n "busy_timeout" packages/cds-core/src/vault/internal/db.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "busy_timeout = 5000" packages/cds-core/src/vault/internal/db.ts` -> 1
    - No `git diff` needed (code is already correct)
  </acceptance_criteria>
  <done>
  Confirmed: busy_timeout = 5000 is already set unconditionally in openRawDb.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create packages/cds-core/src/vault/sessions.busy-timeout.test.ts</name>
  <read_first>
    - packages/cds-core/src/vault/internal/db.ts (for import path)
    - packages/cds-core/vitest.config.ts or tsconfig.json (test setup reference)
  </read_first>
  <files>
    - packages/cds-core/src/vault/sessions.busy-timeout.test.ts (new)
  </files>
  <action>
  Create the regression test:

  ```ts
  // packages/cds-core/src/vault/sessions.busy-timeout.test.ts
  // Phase 40 D-131: regression test for busy_timeout = 5000 in openRawDb.
  // Confirms the pragma is re-applied on every DB open (it's a connection-level
  // setting in SQLite, not a persistent DB property — each new connection must
  // re-set it).

  import { describe, it, afterAll, expect } from 'vitest';
  import { mkdtempSync, rmSync } from 'node:fs';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';

  import { openRawDb } from './internal/db.js';

  describe('openRawDb — busy_timeout pragma (D-131)', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cds-busy-timeout-'));
    const dbPath = join(tempDir, 'test-busy-timeout.db');

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('sets busy_timeout = 5000 on first open', () => {
      const db = openRawDb(dbPath);
      const row = db.pragma('busy_timeout') as Array<{ busy_timeout: number }>;
      expect(row).toHaveLength(1);
      expect(row[0].busy_timeout).toBe(5000);
      db.close();
    });

    it('re-applies busy_timeout = 5000 on reopen', () => {
      // Re-open the same DB file — confirms the pragma is not a persistent
      // DB property but is re-applied by openRawDb on each connection.
      const db = openRawDb(dbPath);
      const row = db.pragma('busy_timeout') as Array<{ busy_timeout: number }>;
      expect(row).toHaveLength(1);
      expect(row[0].busy_timeout).toBe(5000);
      db.close();
    });

    it('WAL mode is also set (sanity check)', () => {
      const db = openRawDb(dbPath);
      const row = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
      expect(row).toHaveLength(1);
      expect(row[0].journal_mode).toBe('wal');
      db.close();
    });
  });
  ```

  The test imports `openRawDb` directly from the internal module. This is acceptable for tests — only the public API (`sessions.ts`) is restricted for production consumers.
  </action>
  <verify>
    <automated>pnpm --filter @cds/core exec vitest run src/vault/sessions.busy-timeout.test.ts --reporter=basic</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/vault/sessions.busy-timeout.test.ts` -> exits 0
    - `pnpm --filter @cds/core exec vitest run src/vault/sessions.busy-timeout.test.ts` exits 0 with 3 passing tests
    - `grep -c "busy_timeout" packages/cds-core/src/vault/sessions.busy-timeout.test.ts` -> >= 4
    - `grep -c "D-131" packages/cds-core/src/vault/sessions.busy-timeout.test.ts` -> >= 1
    - `grep -c "5000" packages/cds-core/src/vault/sessions.busy-timeout.test.ts` -> >= 2
  </acceptance_criteria>
  <done>
  Regression test confirms busy_timeout = 5000 is set on every openRawDb call and persists across reopen.
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify full test suite remains green</name>
  <files>
    - (no source changes — verification only)
  </files>
  <action>
  Run full test suite to confirm the new test file integrates cleanly:

  ```bash
  pnpm test 2>&1 | tail -20
  ```
  </action>
  <verify>
    <automated>pnpm test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test` exits 0
    - New test file appears in the vitest output and passes
  </acceptance_criteria>
  <done>
  Full test suite green with the new busy-timeout regression test.
  </done>
</task>

</tasks>

<verification>
Final commands to run before marking plan complete:

```sh
# 1. Pragma present in production code
grep "busy_timeout = 5000" packages/cds-core/src/vault/internal/db.ts

# 2. New test green
pnpm --filter @cds/core exec vitest run src/vault/sessions.busy-timeout.test.ts

# 3. Full suite green
pnpm test
```
</verification>
</content>
</invoke>