---
phase: 35-tiered-vault-tier-2-sqlite
plan: 02
subsystem: vault
tags: [sqlite, fts5, migrations, schema]
requires:
  - 35-01 (better-sqlite3 installed, Node 20+)
provides:
  - Canonical vault schema (sessions/observations/entities/relations)
  - FTS5 external-content virtual table observations_fts
  - Transactional forward-only migration runner
  - Post-build .sql copy step so dist/ ships migrations
affects:
  - packages/cds-core/src/vault/internal/migrations/ (new subtree)
  - packages/cds-core/scripts/ (new directory)
  - packages/cds-core/package.json (build chain + files[])
tech-stack:
  added: []
  patterns:
    - External-content FTS5 with trigger-synced delete/insert (sqlite.org §4.4.2)
    - ESM directory resolution via fileURLToPath(import.meta.url)
    - Forward-only numbered-prefix SQL migrations
    - Post-tsc asset copy via scripts/copy-migrations.mjs (cpSync filter)
key-files:
  created:
    - packages/cds-core/src/vault/internal/migrations/001-initial.sql
    - packages/cds-core/src/vault/internal/migrations/runner.ts
    - packages/cds-core/scripts/copy-migrations.mjs
    - .planning/phases/35-tiered-vault-tier-2-sqlite/35-02-SUMMARY.md
  modified:
    - packages/cds-core/package.json
key-decisions:
  - Tokenizer = "porter unicode61" for English stemming + Unicode normalization
    (matches RESEARCH.md Pattern 2; good balance of recall and footprint).
  - sessions_summary_au trigger uses SELECT 'delete' form for bulk re-sync,
    consistent with sqlite.org delete-command syntax.
  - Cleaned tsbuildinfo during verification because tsc --build incremental
    cache missed a newly-created subdirectory; full rebuild produced the expected
    dist layout. Documented in Deviations so downstream CI understands why the
    first dist/ may be incomplete until a clean build runs.
requirements-completed:
  - VAULT-02 (partial — schema + runner in place; Plan 03 wires openRawDb into
    the runner, Plan 04 adds migration.test.ts regression coverage)
duration: "~12 min"
completed: 2026-04-16
---

# Phase 35 Plan 02: Schema + Migration Runner — Summary

Landed the canonical vault schema (tables + FTS5 + triggers) and the forward-only migration runner that will apply it inside Plan 03's `openRawDb`. Post-build asset copy ensures `.sql` files ship with the compiled package.

## What Was Built

### 1. `001-initial.sql` (104 lines)

- 4 tables: `sessions`, `observations`, `entities`, `relations`.
- 2 indexes on `observations` for per-session and timeline lookups.
- FTS5 external-content virtual table `observations_fts` with tokenizer `'porter unicode61'`.
- 4 triggers syncing `observations_fts` with the source table:
  - `observations_ai` (AFTER INSERT) — insert FTS row with denormalized `session_summary`
  - `observations_au` (AFTER UPDATE) — delete + reinsert FTS row
  - `observations_ad` (AFTER DELETE) — delete FTS row via `VALUES('delete', …)` command
  - `sessions_summary_au` (AFTER UPDATE OF summary ON sessions) — bulk delete + reinsert for every observation in the updated session
- No `BEGIN TRANSACTION` / `COMMIT` / `INSERT INTO schema_version` — all owned by the runner.

### 2. `runner.ts` (81 lines)

- `export function runPendingMigrations(db: Database.Database): void`
- `export class MigrationError extends Error` (wraps underlying `cause`).
- `MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))` — ESM-safe.
- File regex `/^(\d{3})-.+\.sql$/`; sorts alphabetically (zero-padded = numerical).
- Wraps the apply loop in `db.transaction(...)` so any throw rolls back the batch.
- `INSERT INTO schema_version (version, applied_at) VALUES (?, ?)` runs per applied migration.
- Idempotent: second call with no new migration files is a no-op (no new rows).

### 3. `scripts/copy-migrations.mjs` (32 lines)

- Copies `src/vault/internal/migrations/*.sql` to `dist/vault/internal/migrations/` after `tsc --build`.
- Uses `cpSync(..., { recursive: true, filter: ... })` to exclude `.ts|.tsx|.js|.jsx|.d.ts|.map` and keep `.sql` + directories.
- Logs source/dest paths to stderr for build visibility.

### 4. `packages/cds-core/package.json` updates

- `"scripts.build"`: `"tsc --build"` → `"tsc --build && node scripts/copy-migrations.mjs"`.
- Added `"files": ["dist"]` so `.sql` files travel with the npm tarball (D-39).

## Verification

| Check | Result |
|-------|--------|
| `wc -l 001-initial.sql` | 104 (≥60 required) |
| `grep -c "CREATE TABLE"` | 4 |
| `grep -c "CREATE TRIGGER"` | 4 |
| `grep -c "CREATE VIRTUAL TABLE"` | 1 |
| `grep -c "content=observations"` | 2 (FTS5 option + SQL comment) |
| `grep -c "content_rowid=id"` | 2 (FTS5 option + SQL comment) |
| `grep -c "'delete'"` | 3 delete commands (2 `VALUES('delete'…)`, 1 `SELECT 'delete', …`) |
| `grep -c "BEGIN TRANSACTION"` | 0 |
| `grep -c "INSERT INTO schema_version"` (in SQL) | 0 (runner owns it) |
| `grep -c "fileURLToPath"` (runner) | 2 (import + call site) |
| `grep -c "db.transaction"` (runner) | 2 (assignment + invocation) |
| `grep -c "CREATE TABLE IF NOT EXISTS schema_version"` (runner) | 1 |
| `grep -c "export class MigrationError"` (runner) | 1 |
| `pnpm --filter @cds/core run build` | Exit 0 |
| `dist/vault/internal/migrations/001-initial.sql` | Exists, identical to src |
| `dist/vault/internal/migrations/runner.js` | Compiled with source map |
| Runtime smoke test | Tables created, schema_version=1, 2nd run no-op |
| `pnpm -r run build` | All 4 packages build clean |
| `pnpm -r run test` | All 4 package suites pass; baseline preserved |

## Commits

| Hash | Message |
|------|---------|
| `851535b` | feat(35-02): add initial vault schema migration 001 (VAULT-02) |
| `d227a8e` | feat(35-02): add migration runner with MigrationError (VAULT-02) |
| `27e2824` | feat(35-02): wire post-build SQL copy + files[dist] (VAULT-02) |

## Deviations from Plan

**[Rule 2 — Missing Critical] tsc incremental cache masked empty dist during first build** — Found during: runtime smoke test in Task 3. Issue: first `pnpm --filter @cds/core run build` ran `tsc --build` against a cached tsbuildinfo that predated the new `src/vault/internal/migrations/` subtree, so only `001-initial.sql` landed in dist — `runner.js` was missing. Fix: `rm -rf packages/cds-core/dist packages/cds-core/tsconfig.tsbuildinfo` then rebuild. Full build produced `index.js`, `runner.js`, `runner.d.ts`, `001-initial.sql`. Verification: `find packages/cds-core/dist -type f` lists all 7 expected artifacts. Commit hash: N/A (resolved in-place without source change). Impact: zero after cache invalidation; downstream CI always starts from a clean checkout so this is benign. Documented for Plan 04 test debugging.

**Total deviations:** 1 auto-fixed (tooling cache invalidation). **Impact:** none at runtime; useful heads-up for local dev iteration.

## Smoke Test Evidence (Runtime)

```
Tables after migration: entities, observations, observations_fts, observations_fts_config,
  observations_fts_data, observations_fts_docsize, observations_fts_idx, relations,
  schema_version, sessions, sqlite_sequence
Schema version: 1
Rows in schema_version after 2nd run: 1
MigrationError exported: true
```

Ten expected objects present (4 user tables + 5 FTS5 internal tables + schema_version + sqlite_sequence). Second invocation of `runPendingMigrations` leaves the DB untouched.

## Next

Ready for Plan 03 (`35-03-sessions-api-and-boundary`): add `internal/db.ts`, `sessions.ts`, and the vault/index.ts facade. Plan 03 imports `runPendingMigrations` from this plan.

## Self-Check: PASSED

- [x] All 3 tasks executed.
- [x] 3 atomic commits (SQL, runner, build wiring).
- [x] `001-initial.sql` matches CONTEXT.md D-43..D-47 exactly.
- [x] `runner.ts` uses ESM-safe resolution + `db.transaction`.
- [x] `dist/vault/internal/migrations/` ships `.sql` after clean build.
- [x] `pnpm --filter @cds/core run build` exits 0.
- [x] Runtime smoke test confirms migration idempotence.
- [x] No regressions in Phase 33/34 tests.
