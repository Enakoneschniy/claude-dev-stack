---
phase: 35-tiered-vault-tier-2-sqlite
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - packages/cds-core/src/vault/internal/migrations/001-initial.sql
  - packages/cds-core/src/vault/internal/migrations/runner.ts
  - packages/cds-core/scripts/copy-migrations.mjs
  - packages/cds-core/package.json
autonomous: true
requirements:
  - VAULT-02
user_setup: []

must_haves:
  truths:
    - "001-initial.sql declares all 4 canonical tables: sessions, observations, entities, relations"
    - "001-initial.sql creates FTS5 virtual table observations_fts with content=observations + content_rowid=id"
    - "001-initial.sql defines triggers: observations_ai, observations_au, observations_ad, sessions_summary_au"
    - "Migration runner reads .sql files from the compiled migrations directory, applies unseen versions in a single transaction, and records them in schema_version"
    - "After `pnpm --filter @cds/core run build`, dist/vault/internal/migrations/001-initial.sql exists with the same content as the source"
    - "Running the migration runner a second time on a fully-migrated DB is a no-op (no new schema_version rows)"
  artifacts:
    - path: "packages/cds-core/src/vault/internal/migrations/001-initial.sql"
      provides: "Initial schema DDL + triggers + FTS5 vtab"
      contains: "CREATE TABLE sessions"
      min_lines: 60
    - path: "packages/cds-core/src/vault/internal/migrations/runner.ts"
      provides: "Transactional migration loop"
      contains: "runPendingMigrations"
      min_lines: 30
    - path: "packages/cds-core/scripts/copy-migrations.mjs"
      provides: "Post-build .sql copy step"
      contains: "cpSync"
    - path: "packages/cds-core/package.json"
      provides: "Build script chains tsc + copy-migrations"
      contains: "copy-migrations.mjs"
  key_links:
    - from: "packages/cds-core/src/vault/internal/migrations/runner.ts"
      to: "packages/cds-core/src/vault/internal/migrations/001-initial.sql"
      via: "readFileSync + scan at runtime"
      pattern: "readdirSync"
    - from: "packages/cds-core/package.json build script"
      to: "packages/cds-core/scripts/copy-migrations.mjs"
      via: "Script chain after tsc --build"
      pattern: "copy-migrations"
---

<objective>
Define the initial schema (tables, FTS5 virtual table, triggers) as an SQL migration file and implement the migration runner that applies pending migrations transactionally on DB open.

Purpose: Per CONTEXT.md D-36..D-39 and D-43..D-47, this plan lands the immutable schema contract + the mechanism that guarantees any fresh or existing DB advances to the latest version. The sessions writer (Plan 03) calls the runner during openRawDb.
Output: `001-initial.sql`, `runner.ts`, a post-build copy script, and a build-chain update.
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
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-PATTERNS.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-VALIDATION.md

@packages/cds-core/package.json
@packages/cds-core/tsconfig.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write `001-initial.sql` with tables, FTS5 virtual table, and sync triggers</name>
  <files>packages/cds-core/src/vault/internal/migrations/001-initial.sql</files>
  <read_first>.planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md, .planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md</read_first>
  <action>Create `packages/cds-core/src/vault/internal/migrations/001-initial.sql` with the exact canonical schema specified in CONTEXT.md D-43..D-47. The file MUST contain these statements in this order:

1. `CREATE TABLE sessions (id TEXT PRIMARY KEY, start_time TEXT NOT NULL, end_time TEXT, project TEXT NOT NULL, summary TEXT);`
2. `CREATE TABLE observations (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, type TEXT NOT NULL, content TEXT NOT NULL, entities TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);`
3. `CREATE TABLE entities (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL, first_seen TEXT NOT NULL, last_updated TEXT NOT NULL);`
4. `CREATE TABLE relations (from_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE, to_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE, relation_type TEXT NOT NULL, observed_in_session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, PRIMARY KEY(from_entity, to_entity, relation_type, observed_in_session));`
5. `CREATE INDEX idx_observations_session ON observations(session_id);` (helps timeline lookup)
6. `CREATE INDEX idx_observations_created_at ON observations(created_at);` (helps timeline ordering)
7. The FTS5 virtual table: `CREATE VIRTUAL TABLE observations_fts USING fts5(content, session_summary, content=observations, content_rowid=id, tokenize='porter unicode61');`
8. Four triggers verbatim from RESEARCH.md Pattern 2: `observations_ai`, `observations_au`, `observations_ad`, `sessions_summary_au`. Each MUST use the `INSERT INTO observations_fts(observations_fts, rowid, content, session_summary) VALUES('delete', ...)` delete-command pattern documented in sqlite.org/fts5.html Section 4.4.2.

Do NOT include an `INSERT INTO schema_version` statement in this file — the runner records that separately (Task 2). Do NOT include `BEGIN TRANSACTION` / `COMMIT` — the runner wraps the statement batch.

Use plain SQL; no `/* ... */` block comments — prefer single-line `-- ...` headers for readability.</action>
  <verify>Run: `wc -l packages/cds-core/src/vault/internal/migrations/001-initial.sql` — expect >= 60 lines. Run: `grep -c "CREATE TABLE" packages/cds-core/src/vault/internal/migrations/001-initial.sql` — expect 4. Run: `grep -c "CREATE TRIGGER" packages/cds-core/src/vault/internal/migrations/001-initial.sql` — expect 4. Run: `grep -c "CREATE VIRTUAL TABLE" packages/cds-core/src/vault/internal/migrations/001-initial.sql` — expect 1. Run: `grep -c "content=observations" packages/cds-core/src/vault/internal/migrations/001-initial.sql` — expect 1. Run: `grep -c "content_rowid=id" packages/cds-core/src/vault/internal/migrations/001-initial.sql` — expect 1.</verify>
  <acceptance_criteria>
    - 001-initial.sql contains `CREATE TABLE sessions` with `id TEXT PRIMARY KEY`
    - 001-initial.sql contains `CREATE TABLE observations` with `id INTEGER PRIMARY KEY AUTOINCREMENT` and `entities TEXT`
    - 001-initial.sql contains `CREATE TABLE entities` with `name TEXT NOT NULL UNIQUE`
    - 001-initial.sql contains `CREATE TABLE relations` with composite PRIMARY KEY across (from_entity, to_entity, relation_type, observed_in_session)
    - 001-initial.sql contains `CREATE VIRTUAL TABLE observations_fts USING fts5` with `content=observations` and `content_rowid=id`
    - 001-initial.sql contains four `CREATE TRIGGER` statements whose names match `observations_ai`, `observations_au`, `observations_ad`, `sessions_summary_au`
    - 001-initial.sql contains the literal string `VALUES('delete'` at least 3 times (one per UPDATE/DELETE trigger)
    - No `BEGIN TRANSACTION`, `COMMIT`, or `INSERT INTO schema_version` in the file
  </acceptance_criteria>
  <done>Initial schema committed; tables, FTS5 vtab, and triggers match CONTEXT.md D-43..D-47.</done>
</task>

<task type="auto">
  <name>Task 2: Implement the migration runner at `internal/migrations/runner.ts`</name>
  <files>packages/cds-core/src/vault/internal/migrations/runner.ts</files>
  <read_first>packages/cds-core/src/vault/internal/migrations/001-initial.sql, .planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md, packages/cds-core/tsconfig.json</read_first>
  <action>Create `packages/cds-core/src/vault/internal/migrations/runner.ts` as a TypeScript ESM module. The module MUST:

1. Import the `Database` type from `better-sqlite3` (type-only): `import type Database from 'better-sqlite3';`.
2. Import `fileURLToPath` from `node:url` and compute `MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))` (Pitfall 3 — no `__dirname` in ESM).
3. Export a custom error class: `export class MigrationError extends Error { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = 'MigrationError'; } }` — owned by runner.ts so Plan 03's sessions.ts can re-export it through the public barrel later.
4. Export `runPendingMigrations(db: Database.Database): void`. Flow, verbatim from RESEARCH.md Pattern 1 + Migration Runner example:

   a. Call `db.exec(...)` with this DDL to ensure schema_version exists:
      `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`
   b. Read current version: `const cur = (db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null }).v ?? 0;`
   c. Call a local `scanMigrations(): Array<{ version: number; sql: string }>` that:
      - `readdirSync(MIGRATIONS_DIR)`
      - filter via regex `/^\\d{3}-.+\\.sql$/`
      - `.sort()` (zero-padded prefix makes alphabetical == numerical)
      - map each file to `{ version: parseInt(f.slice(0,3),10), sql: readFileSync(join(MIGRATIONS_DIR,f),'utf-8') }`
   d. `const pending = scanMigrations().filter(m => m.version > cur);`
   e. Early return if `pending.length === 0`.
   f. Wrap the apply loop in `db.transaction(...)` so a throw rolls back the whole batch. The loop runs each migration via `db.exec(m.sql)` inside a try/catch that rethrows as `MigrationError` with `{ cause: err }`. On success, insert into schema_version: `db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(m.version, new Date().toISOString());`
   g. Invoke the transaction with the pending array.

5. Use NodeNext-safe relative imports throughout (`.js` suffix in any runtime relative imports — though runner.ts imports only type-only + Node built-ins + the same-directory .sql files via fs, so no `.js` suffixes are needed for relative imports in this specific file).

6. Do NOT create `scanMigrations` as an exported symbol — keep it file-private. Export only `runPendingMigrations` and `MigrationError`.

The file MUST compile under existing `packages/cds-core/tsconfig.json` (NodeNext composite, strict). Confirm with `pnpm --filter @cds/core run build`.</action>
  <verify>Run: `pnpm --filter @cds/core run build` — must exit 0. Run: `grep -c "fileURLToPath" packages/cds-core/src/vault/internal/migrations/runner.ts` — expect 1. Run: `grep -c "db.transaction" packages/cds-core/src/vault/internal/migrations/runner.ts` — expect 1. Run: `grep -c "CREATE TABLE IF NOT EXISTS schema_version" packages/cds-core/src/vault/internal/migrations/runner.ts` — expect 1. Run: `grep -c "export class MigrationError" packages/cds-core/src/vault/internal/migrations/runner.ts` — expect 1.</verify>
  <acceptance_criteria>
    - runner.ts exports a function named `runPendingMigrations` taking a `Database.Database`
    - runner.ts exports a class `MigrationError` extending `Error`
    - runner.ts uses `fileURLToPath(import.meta.url)` to resolve its own directory
    - runner.ts wraps the apply loop in `db.transaction(...)` (never manual BEGIN/COMMIT)
    - runner.ts creates `schema_version` with `CREATE TABLE IF NOT EXISTS`
    - runner.ts file-filters migrations via regex `/^\d{3}-.+\.sql$/`
    - `pnpm --filter @cds/core run build` exits 0
    - No runtime relative imports lack `.js` suffix
  </acceptance_criteria>
  <done>Migration runner compiled under @cds/core tsconfig; exports runPendingMigrations + MigrationError.</done>
</task>

<task type="auto">
  <name>Task 3: Add post-build `scripts/copy-migrations.mjs` and update build script chain</name>
  <files>packages/cds-core/scripts/copy-migrations.mjs, packages/cds-core/package.json</files>
  <read_first>packages/cds-core/package.json, .planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md</read_first>
  <action>Create `packages/cds-core/scripts/copy-migrations.mjs` as a standalone Node ESM script that copies all `.sql` files from `src/vault/internal/migrations/` to `dist/vault/internal/migrations/` after the TypeScript build completes.

Content:
```javascript
#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(PKG_ROOT, 'src', 'vault', 'internal', 'migrations');
const DEST = join(PKG_ROOT, 'dist', 'vault', 'internal', 'migrations');

if (!existsSync(SRC)) {
  console.error(`[copy-migrations] source directory missing: ${SRC}`);
  process.exit(1);
}

mkdirSync(DEST, { recursive: true });

cpSync(SRC, DEST, {
  recursive: true,
  filter: (src) => {
    if (src.endsWith('.sql')) return true;
    if (/\.(ts|tsx|js|jsx|d\.ts|map)$/.test(src)) return false;
    return true;
  },
});

console.log(`[copy-migrations] copied SQL files from ${SRC} -> ${DEST}`);
```

Then update `packages/cds-core/package.json` `scripts.build` from `"tsc --build"` to `"tsc --build && node scripts/copy-migrations.mjs"`. Preserve `scripts.test` = `"vitest run"` unchanged. Preserve all other fields.

Also confirm `packages/cds-core/package.json` has a top-level `"files"` entry listing `"dist"` — required so the post-build-copied `.sql` files ship in the npm tarball. If `"files"` is absent, add `"files": ["dist"]`. If it already exists with other entries, ensure `"dist"` is included.</action>
  <verify>Run: `node -e "console.log(require('./packages/cds-core/package.json').scripts.build)"` — expect `tsc --build && node scripts/copy-migrations.mjs`. Run: `pnpm --filter @cds/core run build` — must exit 0. Run: `test -f packages/cds-core/dist/vault/internal/migrations/001-initial.sql && echo OK || echo MISSING` — expect `OK`. Run: `diff packages/cds-core/src/vault/internal/migrations/001-initial.sql packages/cds-core/dist/vault/internal/migrations/001-initial.sql` — must produce no output (files identical).</verify>
  <acceptance_criteria>
    - packages/cds-core/scripts/copy-migrations.mjs exists and is a valid ESM script
    - packages/cds-core/scripts/copy-migrations.mjs uses `cpSync` with recursive + filter options
    - packages/cds-core/package.json `scripts.build` contains both `tsc --build` and `node scripts/copy-migrations.mjs`
    - packages/cds-core/package.json `files` array contains `"dist"`
    - After `pnpm --filter @cds/core run build`, the file `packages/cds-core/dist/vault/internal/migrations/001-initial.sql` exists
    - The content of `dist/.../001-initial.sql` equals the content of `src/.../001-initial.sql` byte-for-byte
  </acceptance_criteria>
  <done>Post-build copy step wired; `dist/` contains .sql files after `pnpm --filter @cds/core run build`.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `pnpm --filter @cds/core run build` exits 0
- [ ] `packages/cds-core/dist/vault/internal/migrations/001-initial.sql` exists and matches source
- [ ] `packages/cds-core/dist/vault/internal/migrations/runner.js` exists with a `runPendingMigrations` export (verified at runtime in Plan 04 tests)
- [ ] No existing Phase 33/34 test failures introduced (root + @cds/core vitest still green — Plan 04 adds new tests later)
</verification>

<success_criteria>
- All 3 tasks completed
- `001-initial.sql` matches CONTEXT.md D-43..D-47 schema exactly
- `runner.ts` uses ESM-safe directory resolution + `db.transaction` pattern
- Post-build step ensures `.sql` files land in `dist/`
- @cds/core build passes
</success_criteria>

<output>
After completion, create `.planning/phases/35-tiered-vault-tier-2-sqlite/35-02-SUMMARY.md` documenting: chosen tokenizer (porter unicode61), trigger count, total line count of 001-initial.sql, any tsc warnings surfaced.
</output>
