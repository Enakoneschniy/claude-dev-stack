---
phase: 35-tiered-vault-tier-2-sqlite
plan: 04
type: execute
wave: 4
depends_on: ["02", "03"]
files_modified:
  - packages/cds-core/src/vault/sessions.test.ts
  - packages/cds-core/src/vault/migration.test.ts
  - packages/cds-core/src/vault/vault.boundary.test.ts
autonomous: true
requirements:
  - VAULT-01
  - VAULT-02
  - VAULT-03
user_setup: []

must_haves:
  truths:
    - "`pnpm --filter @cds/core test` exits 0 with all new tests passing"
    - "sessions.test.ts covers: open creates DB with WAL + FTS5, schema has all 4 tables + FTS5 vtab, createSession/appendObservation/search/timeline round-trip, module cache returns same handle, closeSessionsDB clears cache"
    - "migration.test.ts covers: runner applies 001-initial on fresh DB, runner is idempotent on already-migrated DB, MigrationError is thrown on invalid SQL and rolls back the transaction"
    - "vault.boundary.test.ts covers: @cds/core import does NOT expose openRawDb or RawDatabase, no consumer package imports from @cds/core/vault/internal/*"
    - "Every test cleans up its tmpdir (no orphaned WAL side-car files)"
  artifacts:
    - path: "packages/cds-core/src/vault/sessions.test.ts"
      provides: "Integration tests for public sessions API"
      contains: "openSessionsDB"
      min_lines: 120
    - path: "packages/cds-core/src/vault/migration.test.ts"
      provides: "Migration runner tests (idempotency + rollback)"
      contains: "runPendingMigrations"
      min_lines: 60
    - path: "packages/cds-core/src/vault/vault.boundary.test.ts"
      provides: "VAULT-03 regression test"
      contains: "openRawDb"
      min_lines: 40
  key_links:
    - from: "packages/cds-core/src/vault/sessions.test.ts"
      to: "packages/cds-core/src/vault/sessions.ts"
      via: "Imports openSessionsDB + closeSessionsDB + types"
      pattern: "from './sessions"
    - from: "packages/cds-core/src/vault/vault.boundary.test.ts"
      to: "packages/cds-core/src/index.ts"
      via: "Imports the barrel to enumerate public surface"
      pattern: "from '../index"
---

<objective>
Add the three test files that establish Phase 35's behavioral contract: integration tests for the public sessions API, migration runner semantics tests, and the VAULT-03 boundary regression test that demonstrates the raw DB handle is unreachable from consumers.

Purpose: Per Phase Success Criteria 1-4 + VALIDATION.md Wave 0 gaps. These tests gate the phase — a green `pnpm --filter @cds/core test` run is the prerequisite for `/gsd-verify-work`.
Output: Three test files, all passing on Node 20+ with vitest@^3.2.4.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-VALIDATION.md

@.planning/phases/35-tiered-vault-tier-2-sqlite/35-02-schema-and-migration-runner-PLAN.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-03-sessions-api-and-boundary-PLAN.md
@packages/cds-core/vitest.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create `sessions.test.ts` (VAULT-01 + VAULT-02 integration)</name>
  <files>packages/cds-core/src/vault/sessions.test.ts</files>
  <read_first>packages/cds-core/src/vault/sessions.ts, packages/cds-core/src/vault/internal/db.ts, .planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md</read_first>
  <action>Create `packages/cds-core/src/vault/sessions.test.ts` with per-test tmpdir isolation. The file MUST cover:

**Imports:**
```typescript
import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  openSessionsDB,
  closeSessionsDB,
  CANONICAL_ENTITY_TYPES,
  VaultError,
  type SessionsDB,
} from './sessions.js';
```

**Test harness:** Each test creates its own isolated `projectPath` via `mkdtempSync(join(tmpdir(), 'cds-vault-test-'))`. BUT — `openSessionsDB` ALWAYS resolves under `homedir() + /vault/projects/{basename}`, which would pollute the real vault. Per CONTEXT.md "Tests must NOT hit a real `~/vault/`", the test suite redirects `HOME` env var for the duration of each test:

```typescript
let originalHome: string | undefined;
let tempHome: string;
let projectPath: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  tempHome = mkdtempSync(join(tmpdir(), 'cds-vault-test-home-'));
  process.env.HOME = tempHome;
  projectPath = mkdtempSync(join(tmpdir(), 'cds-vault-test-proj-'));
});

afterEach(() => {
  // Close any cached handles BEFORE removing the dir so Windows filesystems don't complain
  try { closeSessionsDB(projectPath); } catch { /* ignore */ }
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(projectPath, { recursive: true, force: true });
});
```

Note: Node's `os.homedir()` reads `process.env.HOME` on POSIX (and falls back to `/etc/passwd`). Per RESEARCH.md A6, this is the cleanest isolation mechanism for vitest — the alternative (mocking `os.homedir`) is brittle. The test suite documents in a file-top comment that HOME redirection is used and is POSIX-specific. On Windows, CI may fall back to `USERPROFILE`; if the suite is ever run on Windows CI, add a second line `process.env.USERPROFILE = tempHome;`.

**Tests (each as a separate `test(name, fn)` block):**

1. `test('opens new DB at ~/vault/projects/{basename}/sessions.db with WAL mode')`:
   - Call `const db = openSessionsDB(projectPath);`
   - Expect `existsSync(join(tempHome, 'vault', 'projects', <basename>, 'sessions.db'))` to be true.
   - Call `db.createSession({ project: 'test' });` once to force a write (WAL files are created on first write, not first open).
   - Expect `existsSync(<path>/sessions.db-wal)` to be true (WAL side-car).
   - Expect `existsSync(<path>/sessions.db-shm)` to be true (SHM side-car).

2. `test('schema contains sessions, observations, entities, relations, observations_fts, schema_version')`:
   - Open DB; call createSession once (forces schema to be flushed).
   - Import `Database` directly from `better-sqlite3` via a RELATIVE test-only import: since the test lives in the `@cds/core` package, it can reach its own devDependency. The test opens a SECOND read-only handle to the same file and queries `sqlite_master`:
     ```typescript
     import Database from 'better-sqlite3';
     const raw = new Database(<dbPath>, { readonly: true });
     const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name").all() as Array<{name:string}>;
     const names = tables.map(t => t.name);
     expect(names).toEqual(expect.arrayContaining(['sessions','observations','entities','relations','observations_fts','schema_version']));
     raw.close();
     ```

3. `test('createSession + appendObservation + searchObservations round-trip')`:
   - Open DB.
   - `const s = db.createSession({ project: 'proj', summary: 'init summary about foo bar baz' });`
   - `const obs = db.appendObservation({ sessionId: s.id, type: 'note', content: 'quick brown fox jumped over the lazy dog', entities: [] });`
   - `const hits = db.searchObservations('fox');`
   - `expect(hits.length).toBeGreaterThanOrEqual(1);`
   - `expect(hits[0].observation.id).toBe(obs.id);`
   - `expect(hits[0].sessionSummary).toContain('init summary');`

4. `test('upsertEntity is idempotent on name conflict')`:
   - Open DB.
   - `const e1 = db.upsertEntity({ name: 'alice', type: 'person' });`
   - `const e2 = db.upsertEntity({ name: 'alice', type: 'person' });`
   - `expect(e1.id).toBe(e2.id);`

5. `test('appendObservation rejects non-integer entities')`:
   - Open DB.
   - Create a session.
   - `expect(() => db.appendObservation({ sessionId: s.id, type: 'x', content: 'y', entities: [1, 'oops' as any] })).toThrow(VaultError);`

6. `test('module cache returns same handle for same projectPath')`:
   - `const a = openSessionsDB(projectPath);`
   - `const b = openSessionsDB(projectPath);`
   - `expect(a).toBe(b);` (reference equality)

7. `test('closeSessionsDB clears cache and subsequent open returns new handle')`:
   - `const a = openSessionsDB(projectPath);`
   - `closeSessionsDB(projectPath);`
   - `const b = openSessionsDB(projectPath);`
   - `expect(a).not.toBe(b);`

8. `test('session summary update re-denormalizes FTS5 rows')`:
   - Open DB.
   - Create session with summary `'initial topic'`.
   - Append observation with content `'detail about xyzzy'`.
   - Search for `'initial'` — expect at least 1 hit referencing `'initial topic'` in sessionSummary.
   - UPDATE the summary to `'revised topic'` via a direct `raw.prepare("UPDATE sessions SET summary = ? WHERE id = ?").run('revised topic', s.id);` using a SECOND write handle (or expose a helper on SessionsDB in Plan 03 if the planner chose to; otherwise use a raw Database handle in the test).
   - Search for `'revised'` — expect hits with `sessionSummary` containing `'revised topic'`.
   - Search for `'initial'` — expect 0 hits (denormalized column rewritten).

9. `test('timeline returns anchor plus adjacent observations')`:
   - Open DB.
   - Create session. Append 7 observations in sequence.
   - Call `db.timeline(observations[3].id, 2)` — expect at least 5 rows (indices 1..5).
   - Confirm all rows share the same `session_id`.

10. `test('CANONICAL_ENTITY_TYPES is a readonly array of known strings')`:
    - `expect(CANONICAL_ENTITY_TYPES).toContain('person');`
    - `expect(CANONICAL_ENTITY_TYPES).toContain('project');`
    - `expect(Array.isArray(CANONICAL_ENTITY_TYPES)).toBe(true);`

Each test MUST finish within 1 second on a dev machine. Total file length target: >= 120 lines.</action>
  <verify>Run: `pnpm --filter @cds/core test src/vault/sessions.test.ts` — expect 10+ passing tests, 0 failures. Run: `grep -c "^test(" packages/cds-core/src/vault/sessions.test.ts` or `grep -c "test(" packages/cds-core/src/vault/sessions.test.ts` — expect >= 10. Run: `wc -l packages/cds-core/src/vault/sessions.test.ts` — expect >= 120. Run: `grep -c "HOME" packages/cds-core/src/vault/sessions.test.ts` — expect >= 2 (restore + override).</verify>
  <acceptance_criteria>
    - sessions.test.ts exists with at least 10 `test(...)` blocks
    - sessions.test.ts uses `mkdtempSync` + `rmSync({recursive:true})` for isolation
    - sessions.test.ts redirects `process.env.HOME` in `beforeEach` and restores in `afterEach`
    - sessions.test.ts covers: DB creation, schema completeness, round-trip, entity upsert, validation throw, cache identity, cache reset, summary re-denorm, timeline, CANONICAL_ENTITY_TYPES
    - All tests pass — `pnpm --filter @cds/core test src/vault/sessions.test.ts` exits 0
  </acceptance_criteria>
  <done>sessions.test.ts passes; covers VAULT-01 + VAULT-02 integration end-to-end.</done>
</task>

<task type="auto">
  <name>Task 2: Create `migration.test.ts` (runner semantics)</name>
  <files>packages/cds-core/src/vault/migration.test.ts</files>
  <read_first>packages/cds-core/src/vault/internal/migrations/runner.ts, packages/cds-core/src/vault/internal/migrations/001-initial.sql</read_first>
  <action>Create `packages/cds-core/src/vault/migration.test.ts`. This file tests the runner in isolation (without going through `openSessionsDB`) using a fresh `better-sqlite3` handle on a tmpdir path.

**Imports:**
```typescript
import { test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPendingMigrations, MigrationError } from './internal/migrations/runner.js';
```

**Harness:**
```typescript
let tempDir: string;
let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'cds-migration-test-'));
  dbPath = join(tempDir, 'test.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  try { db.close(); } catch { /* ignore */ }
  rmSync(tempDir, { recursive: true, force: true });
});
```

**Tests:**

1. `test('fresh DB: runPendingMigrations creates schema_version + all tables + FTS5 + triggers')`:
   - Call `runPendingMigrations(db)`.
   - Query `sqlite_master` — expect `sessions`, `observations`, `entities`, `relations`, `observations_fts`, `schema_version` all present.
   - Query `SELECT COUNT(*) AS c FROM schema_version` — expect `c = 1`.
   - Query `SELECT version FROM schema_version ORDER BY version` — expect `[1]`.

2. `test('second call is idempotent — no new schema_version rows, no errors')`:
   - Call `runPendingMigrations(db)` twice.
   - Query `SELECT COUNT(*) AS c FROM schema_version` — expect `c = 1`.

3. `test('triggers: inserting into observations populates observations_fts')`:
   - Call `runPendingMigrations(db)`.
   - Insert a session row manually: `db.prepare('INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)').run('s1', new Date().toISOString(), 'p', 'test summary');`
   - Insert an observation: `db.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run('s1','note','hello world', '[]', new Date().toISOString());`
   - Query: `const row = db.prepare("SELECT rowid, content, session_summary FROM observations_fts WHERE observations_fts MATCH 'hello'").get() as any;`
   - `expect(row).toBeTruthy();`
   - `expect(row.content).toContain('hello');`
   - `expect(row.session_summary).toBe('test summary');`

4. `test('FTS5 session_summary trigger re-denormalizes after UPDATE of sessions.summary')`:
   - Same setup as #3 but with summary `'old topic'`.
   - Verify FTS5 row has `session_summary = 'old topic'`.
   - Update: `db.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run('new topic', 's1');`
   - Query FTS5 row again — expect `session_summary = 'new topic'`.

5. `test('MigrationError is thrown on corrupt migration; transaction rolls back')`:
   - This test requires a doctored migrations directory. Strategy: since `runner.ts` hard-codes its directory resolution, we can't easily inject a fake migrations dir without copying files. Acceptable alternative: call the runner against a DB where `schema_version` is manually populated with `{version: 0}` AND manually corrupt the DB state so that the next migration's SQL fails. Simpler strategy:
     - Call `runPendingMigrations(db)` to land the schema.
     - Manually drop `schema_version` and re-insert version 0 only.
     - Corrupt one of the schema tables: `db.prepare('DROP TABLE sessions').run();` — now the re-run of `001-initial.sql` will fail at the trigger creation (or at `CREATE TABLE sessions` if triggers see sessions first... actually, `CREATE TABLE sessions` will succeed on a dropped table).
     - This corruption strategy is fragile. ALTERNATIVE: Skip this test and mark it `test.skip('...')` with a SUMMARY note. Preferred: verify rollback via a UNIT test on a helper that takes an injectable migrations array:
       - Refactor runner.ts to export a helper `runMigrations(db, migrations)` that takes the array directly (Plan 02 amend). OR
       - Accept that the Plan 02 runner is file-backed and that rollback is verified through a simpler assertion: DELETE the first 3 tables AFTER a successful first migration, manually insert a `(version=2, sql='NOT VALID SQL;')` scenario — impossible without amending runner.
     - Pragmatic choice for Plan 04: write this test as `test.todo('rollback on bad migration verified by Plan 35.x once runner exposes injectable helper')`. Keep the test present but marked todo. Document in SUMMARY that this is deferred to a future minor revision (NOT to Phase 36+).
   - Per autonomous decision policy: keep the test present as `test.todo(...)` so its intent is captured in code; don't block Plan 04 on a fragile test.

Total file length target: >= 60 lines.</action>
  <verify>Run: `pnpm --filter @cds/core test src/vault/migration.test.ts` — expect all non-todo tests to pass, 0 failures. Run: `grep -c "^test(" packages/cds-core/src/vault/migration.test.ts` — expect >= 4 (tests 1-4 fully implemented; test 5 as `test.todo`). Run: `grep -c "test.todo" packages/cds-core/src/vault/migration.test.ts` — expect 1. Run: `wc -l packages/cds-core/src/vault/migration.test.ts` — expect >= 60.</verify>
  <acceptance_criteria>
    - migration.test.ts imports `runPendingMigrations` and `MigrationError` from the runner path
    - migration.test.ts has >= 4 passing `test(...)` blocks covering: fresh-DB migration, idempotency, FTS5 insert trigger, FTS5 summary update trigger
    - migration.test.ts has 1 `test.todo(...)` placeholder for rollback-on-bad-SQL with a SUMMARY note
    - `pnpm --filter @cds/core test src/vault/migration.test.ts` exits 0
  </acceptance_criteria>
  <done>migration.test.ts passes; runner semantics locked by tests.</done>
</task>

<task type="auto">
  <name>Task 3: Create `vault.boundary.test.ts` (VAULT-03 regression)</name>
  <files>packages/cds-core/src/vault/vault.boundary.test.ts</files>
  <read_first>packages/cds-core/src/index.ts, packages/cds-core/src/vault/index.ts, .planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md</read_first>
  <action>Create `packages/cds-core/src/vault/vault.boundary.test.ts`. This test locks the VAULT-03 boundary.

**Imports:**
```typescript
import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cdsCore from '../index.js';
```

**Tests:**

1. `test('cds-core public surface does NOT expose openRawDb')`:
   - `expect((cdsCore as any).openRawDb).toBeUndefined();`
   - `expect(Object.keys(cdsCore)).not.toContain('openRawDb');`

2. `test('cds-core public surface does NOT expose RawDatabase type (runtime shape)')`:
   - `expect(Object.keys(cdsCore)).not.toContain('RawDatabase');`
   - (type-only symbols already don't appear at runtime; this assertion guards against accidental `export const RawDatabase = ...`.)

3. `test('cds-core public surface DOES expose the documented sessions API')`:
   - For each expected name: `'openSessionsDB', 'closeSessionsDB', 'CANONICAL_ENTITY_TYPES', 'VaultError', 'SchemaVersionError', 'MigrationError', 'FtsUnavailableError', 'DbOpenError'`
   - `expect(typeof (cdsCore as any)[name]).toMatch(/function|object/);` (classes are functions; constants are objects)
   - Explicitly: `expect(typeof cdsCore.openSessionsDB).toBe('function');`

4. `test('no consumer file imports from @cds/core/vault/internal/*')`:
   - Walk these roots (skip any that don't exist):
     - `packages/cds-cli/src`
     - `packages/cds-migrate/src`
     - `packages/cds-s3-backend/src`
     - `lib`
     - `bin`
     - `hooks`
   - For each `.ts`, `.mts`, `.mjs`, `.js` file, read content and search for the pattern `@cds/core/vault/internal`.
   - `expect(offenders).toEqual([]);` — if ANY file imports from the internal path, the test fails with the offender list.

5. `test('no consumer file imports directly from relative internal paths within @cds/core')`:
   - Same walk as #4.
   - Search for pattern `vault/internal/db` OR `vault/internal/migrations/runner`.
   - Skip hits inside `packages/cds-core/src/vault/` itself (those are expected).
   - `expect(offenders).toEqual([]);`

Helper:
```typescript
function walkAllFiles(dir: string, callback: (file: string) => void): void {
  if (!existsSync(dir)) return;
  try {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walkAllFiles(p, callback);
      else callback(p);
    }
  } catch { /* root access error - treat as no violations */ }
}
```

Total file length target: >= 40 lines.</action>
  <verify>Run: `pnpm --filter @cds/core test src/vault/vault.boundary.test.ts` — expect all tests passing, 0 failures. Run: `grep -c "^test(" packages/cds-core/src/vault/vault.boundary.test.ts` — expect 5. Run: `wc -l packages/cds-core/src/vault/vault.boundary.test.ts` — expect >= 40. Final: `pnpm --filter @cds/core test` — expect ALL tests green (combines Plan 04's three new files + any Phase 33 sanity test).</verify>
  <acceptance_criteria>
    - vault.boundary.test.ts imports from `'../index.js'` (the package barrel)
    - vault.boundary.test.ts has 5 `test(...)` blocks covering boundary assertions
    - vault.boundary.test.ts contains a filesystem walk that scans consumer packages for internal imports
    - All tests pass — `pnpm --filter @cds/core test src/vault/vault.boundary.test.ts` exits 0
    - Cumulative: `pnpm --filter @cds/core test` exits 0 across ALL test files
  </acceptance_criteria>
  <done>vault.boundary.test.ts passes; VAULT-03 boundary locked by runtime + filesystem scan.</done>
</task>

<task type="auto">
  <name>Task 4: Full monorepo test run — gate the phase</name>
  <files></files>
  <read_first>.planning/phases/35-tiered-vault-tier-2-sqlite/35-VALIDATION.md</read_first>
  <action>Run the full monorepo test suite across all packages + the root test tree:
  1. `pnpm install --frozen-lockfile` — must exit 0
  2. `pnpm -r run build` — must exit 0 (all packages build cleanly, including Plan 02's `.sql` copy step)
  3. `pnpm -r run test` — must exit 0 (root tests + @cds/core tests)
  If any step fails, STOP and log the failing command + output to the eventual SUMMARY.md. Do NOT silently skip tests; do NOT downgrade dependencies; do NOT delete tests to pass. Escalate.

  Expected post-condition: all existing Phase 33/34 tests continue to pass AND the 3 new test files added by Plan 04 all pass (~15-20 additional test cases).</action>
  <verify>All three commands above exit 0. `pnpm -r run test` summary output shows the cumulative test count (Phase 33/34 baseline + ~15-20 new from Plan 04).</verify>
  <acceptance_criteria>
    - `pnpm install --frozen-lockfile` exits with status 0
    - `pnpm -r run build` exits with status 0
    - `pnpm -r run test` exits with status 0
    - No pre-existing tests regress
    - Three new test files contribute at least 15 passing test cases combined (10 from sessions.test.ts + 4 from migration.test.ts + 5 from vault.boundary.test.ts)
  </acceptance_criteria>
  <done>Full monorepo green on Node 20+.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `pnpm --filter @cds/core test` exits 0 and reports all tests passing
- [ ] `pnpm -r run test` exits 0 (root + per-package)
- [ ] `pnpm -r run build` exits 0
- [ ] Three new test files exist with >= 120 / 60 / 40 lines respectively
- [ ] `pnpm --filter @cds/core test -- --run --reporter=verbose` emits the expected test names
</verification>

<success_criteria>
- All 4 tasks completed
- 15+ new test cases across 3 files, all passing
- VAULT-01, VAULT-02, VAULT-03 each have executable regression tests
- Cumulative monorepo suite green on Node 20+
</success_criteria>

<output>
After completion, create `.planning/phases/35-tiered-vault-tier-2-sqlite/35-04-SUMMARY.md` documenting: new test count, per-file line counts, any flaky tests observed, runtime profile (total seconds for `pnpm --filter @cds/core test`), and the status of the `test.todo` rollback case (deferred to a future minor phase).
</output>
