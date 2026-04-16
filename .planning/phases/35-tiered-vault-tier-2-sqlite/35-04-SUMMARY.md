---
phase: 35-tiered-vault-tier-2-sqlite
plan: 04
subsystem: vault
tags: [vitest, integration-tests, boundary-regression, fts5]
requires:
  - 35-02 (migration runner + 001-initial.sql)
  - 35-03 (sessions API + boundary facade)
provides:
  - 20 new passing tests gating Phase 35 (10 sessions + 5 migration + 5 boundary)
  - 1 test.todo placeholder (rollback-on-bad-SQL — Phase 35.x)
affects:
  - packages/cds-core/src/vault/ (3 new *.test.ts files)
tech-stack:
  added: []
  patterns:
    - Per-test HOME redirection to tmpdir for POSIX homedir() isolation
    - Column-scoped FTS5 MATCH to verify trigger-driven column sync
    - Filesystem walk scanner for cross-package import hygiene
key-files:
  created:
    - packages/cds-core/src/vault/sessions.test.ts
    - packages/cds-core/src/vault/migration.test.ts
    - packages/cds-core/src/vault/vault.boundary.test.ts
    - .planning/phases/35-tiered-vault-tier-2-sqlite/35-04-SUMMARY.md
  modified: []
key-decisions:
  - Integration tests redirect `process.env.HOME` to a per-test tmpdir rather
    than mocking `os.homedir()`. Rationale: homedir() is a runtime Node call
    that reads env; vitest module mocks are brittle against ESM. A flag in
    the file-top comment documents that a Windows CI run must additionally
    set `USERPROFILE` (the test does this defensively).
  - FTS5 denormalized-column verification uses column-scoped MATCH queries
    rather than SELECT of the column, because external-content FTS5 forbids
    direct reads of `content` / `session_summary`. The test in the migration
    runner confirms the trigger flips match results from "matches old" to
    "matches new" after the UPDATE.
  - Rollback-on-bad-SQL test is captured as `test.todo(...)` with a clear
    label pointing to Phase 35.x. The runner reads SQL files from a
    hard-coded directory and does not expose an injectable helper, so a
    robust negative test would require amending the runner. Autonomous
    decision policy defers that amendment to avoid scope creep.
requirements-completed:
  - VAULT-01 (integration tests cover public API end-to-end)
  - VAULT-02 (migration runner semantics locked by test coverage)
  - VAULT-03 (boundary enforced by runtime + filesystem regression test)
duration: "~15 min"
completed: 2026-04-16
---

# Phase 35 Plan 04: Integration Tests + Boundary Regression — Summary

Landed the executable contract for Phase 35: 20 new tests across 3 files that gate VAULT-01/02/03 regressions. A green `pnpm --filter @cds/core test` is now the precondition for `/gsd-verify-work`.

## What Was Built

### 1. `sessions.test.ts` — 208 lines — 10 passing tests

1. opens new DB at `~/vault/projects/{basename}/sessions.db` with WAL + SHM side-cars
2. schema contains sessions, observations, entities, relations, observations_fts, schema_version
3. createSession + appendObservation + searchObservations FTS5 round-trip
4. upsertEntity is idempotent on name conflict
5. appendObservation rejects non-integer entities (throws VaultError)
6. module cache returns same handle for same projectPath
7. closeSessionsDB clears cache; subsequent open returns a new handle
8. session summary update re-denormalizes FTS5 rows (search hits flip from 'initial' to 'revised')
9. timeline returns anchor plus adjacent observations in same session
10. CANONICAL_ENTITY_TYPES exposes expected strings

Per-test `beforeEach` creates two tmpdirs (fake HOME + fake projectPath) and redirects `process.env.HOME` / `USERPROFILE`. `afterEach` closes any cached handle, restores env, removes both tmpdirs with `rmSync({ recursive: true, force: true })`. No orphaned WAL / SHM side-car files after the suite completes.

### 2. `migration.test.ts` — 168 lines — 5 passing + 1 `test.todo`

1. fresh DB: runPendingMigrations creates schema_version + all tables + FTS5
2. second call is idempotent — no new schema_version rows
3. triggers: INSERT into observations populates observations_fts (JOIN-based assertion)
4. FTS5 session_summary trigger re-denormalizes after UPDATE of sessions.summary (column-scoped MATCH)
5. MigrationError is exported as a real Error subclass

`test.todo('rollback on bad migration — deferred until runner exposes an injectable helper (Phase 35.x)')` — captures the intent without blocking Plan 04 on a fragile test. Documented deferral.

### 3. `vault.boundary.test.ts` — 123 lines — 5 passing tests

1. cds-core public surface does NOT expose openRawDb (runtime + Object.keys)
2. cds-core public surface does NOT expose RawDatabase runtime binding
3. cds-core public surface DOES expose the 8 documented sessions API symbols
4. no consumer file imports from `@cds/core/vault/internal/*`
5. no consumer file imports from relative internal paths (`vault/internal/db`, `vault/internal/migrations/runner`)

Filesystem walk covers `packages/cds-cli/src`, `packages/cds-migrate/src`, `packages/cds-s3-backend/src`, `lib`, `bin`, `hooks`. Skips `node_modules` and `dist`. File regex matches `.ts|tsx|mts|cts|mjs|cjs|js`. Test 5 filters out hits inside the `cds-core/src/vault/` directory (where internal imports are expected).

## Verification

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | Exit 0 |
| `pnpm -r run build` | Exit 0 — 4 packages built |
| `pnpm --filter @cds/core test` | 4 test files, 21 passed + 1 todo (22) |
| `pnpm -r run test` | All 4 workspace packages green |
| Root `pnpm test` | 965 passed + 3 pre-existing fails + 1 skipped + 1 todo (970) |

The 3 pre-existing root failures are unchanged from Plan 01 baseline (`tests/detect.test.mjs` — detectInstallState() vault-probing). Plan 04 adds exactly +20 passing tests (10 + 5 + 5) + 1 todo relative to the Phase 34 baseline.

## Commits

| Hash | Message |
|------|---------|
| `f512901` | test(35-04): add integration tests for sessions API (VAULT-01, VAULT-02) |
| `d736fce` | test(35-04): add migration runner semantics tests (VAULT-02) |
| `5177285` | test(35-04): add VAULT-03 boundary regression tests |

## Deviations from Plan

**[Rule 2 — Missing Critical] External-content FTS5 forbids direct SELECT of content / session_summary columns** — Found during: first run of `migration.test.ts` test 3. Issue: the plan's canonical query `SELECT rowid, content, session_summary FROM observations_fts WHERE observations_fts MATCH 'hello'` failed with `SqliteError: no such column: T.session_summary`. Cause: external-content FTS5 tables don't store the text columns — they reference the source table. Fix for test 3: rewrite as JOIN against `observations` + `sessions`, matching the production pattern in `sessions.ts searchStmt`. Fix for test 4: use column-scoped MATCH (`WHERE session_summary MATCH 'old'` vs `MATCH 'new'`) to assert trigger-driven synchronization without reading the column directly. Files modified: `migration.test.ts`. Verification: both tests pass after the rewrite; the plan's acceptance criteria (insert trigger populates FTS, summary update re-denormalizes) are preserved — only the query mechanics changed.

**[Rule 2 — Missing Critical] `test.todo` for rollback-on-bad-SQL** — Plan explicitly allowed this as an autonomous decision ("keep the test present as `test.todo(...)` so its intent is captured"). Adopted; no deviation beyond the plan's own guidance. Logged here for visibility so downstream phases know the coverage gap exists.

**Total deviations:** 1 material (FTS5 external-content query mechanics), 1 pre-sanctioned (todo). **Impact:** none on phase goals; tests preserve assertion intent. FTS5 mechanics documented for future test authors.

## Runtime Profile

- `pnpm --filter @cds/core test`: ~800ms (4 test files, 21 passing tests + 1 todo)
- Full `pnpm -r run test`: ~3s aggregate
- Root `pnpm test`: ~75s (heaviest suite — root spawn-heavy tests + doctor checks)

No flaky tests observed across 3 consecutive local runs of the @cds/core suite.

## Coverage Summary

| Requirement | Artifact | Covered By |
|-------------|----------|------------|
| VAULT-01 (public writer) | `sessions.test.ts` | Tests 1–7 + 9–10 (factory, cache, close, all CRUD methods, entity validation) |
| VAULT-02 (schema + runner) | `migration.test.ts` + `sessions.test.ts` test 2 | Fresh-DB schema, idempotency, INSERT/UPDATE triggers, FTS5 re-sync |
| VAULT-03 (boundary) | `vault.boundary.test.ts` + `src/index.ts` re-export | Runtime surface check + filesystem scan for offending imports |

## Next

Phase 35 is green. Plan 04 completes the phase's executable contract. Ready for phase-level verification (gsd-verifier) + PR preparation.

## Self-Check: PASSED

- [x] All 4 tasks executed.
- [x] 3 atomic commits (sessions/migration/boundary tests).
- [x] 20 new passing tests across 3 files (+1 todo).
- [x] `pnpm --filter @cds/core test` exits 0.
- [x] `pnpm -r run test` exits 0 for all 4 workspace packages.
- [x] Root test suite baseline preserved (pre-existing 3 failures unchanged).
- [x] Every test cleans up its tmpdir (no orphaned SHM/WAL files).
- [x] VAULT-03 boundary locked by runtime + filesystem scan.
