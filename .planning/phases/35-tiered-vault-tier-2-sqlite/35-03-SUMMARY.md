---
phase: 35-tiered-vault-tier-2-sqlite
plan: 03
subsystem: vault
tags: [sessions-api, boundary, error-hierarchy, cache]
requires:
  - 35-01 (better-sqlite3 available, Node 20+)
  - 35-02 (migration runner + 001-initial.sql)
provides:
  - Public sessions API (openSessionsDB / closeSessionsDB) — VAULT-01
  - Internal openRawDb factory with PRAGMA + FTS5 gate
  - VaultError hierarchy re-exported through @cds/core
  - Folder-convention VAULT-03 boundary: internal/* is not re-exported
  - Module-level cache of SessionsDB handles keyed by projectPath
affects:
  - packages/cds-core/src/vault/ (new subtree)
  - packages/cds-core/src/index.ts (one new re-export line)
tech-stack:
  added: []
  patterns:
    - Folder-convention boundary enforcement (internal/ never re-exported)
    - Prepared statements cached per handle after migrations (Pitfall 4)
    - FTS5 bm25() ranking with post-query in-memory filters
    - Forward-declared error classes owned by sessions.ts, imported by db.ts
key-files:
  created:
    - packages/cds-core/src/vault/internal/db.ts
    - packages/cds-core/src/vault/sessions.ts
    - packages/cds-core/src/vault/index.ts
    - .planning/phases/35-tiered-vault-tier-2-sqlite/35-03-SUMMARY.md
  modified:
    - packages/cds-core/src/index.ts
key-decisions:
  - MigrationError is OWNED by `internal/migrations/runner.ts`, RE-EXPORTED through
    `sessions.ts`. Public consumers `catch (e instanceof MigrationError)` without
    reaching into `internal/*` — the canonical export path runs through the public
    facade.
  - PRAGMAs chosen: journal_mode=WAL, foreign_keys=ON, synchronous=NORMAL,
    busy_timeout=5000, temp_store=MEMORY, cache_size=-10000 (~10MB). WAL enables
    concurrent reads; foreign_keys enforces ON DELETE CASCADE on relations;
    synchronous=NORMAL trades durability for throughput (acceptable for dev
    memory; Phase 36 can revisit for production).
  - Public factory `openSessionsDB` caches by raw `projectPath` string (not
    `basename` output) so distinct absolute paths with same basename still
    cache independently. Plan 04 test verifies this invariant.
  - `buildSessionsHandle` returns `Object.freeze(...)` so callers cannot
    monkey-patch the API surface at runtime.
  - searchObservations applies `sessionId` / `type` filters IN MEMORY rather
    than rewriting the FTS5 MATCH expression. At the 500-row hard cap this is
    negligible and keeps the FTS grammar simple for callers.
requirements-completed:
  - VAULT-01 (public writer surface landed; single entry via sessions.ts)
  - VAULT-03 (boundary established via folder convention; internal/ never
    re-exported from vault/index.ts or @cds/core barrel)
duration: "~15 min"
completed: 2026-04-16
---

# Phase 35 Plan 03: Sessions API + Boundary — Summary

Delivered the public session memory API plus the raw-DB factory sitting behind it. The type-level VAULT-03 boundary is now enforced: `openRawDb` is reachable only inside `packages/cds-core/src/vault/*` via explicit import from `./internal/db.js`; nothing re-exports it upward.

## What Was Built

### 1. `internal/db.ts` — 66 lines

- Default import `Database` from `better-sqlite3`.
- `export type RawDatabase = Database.Database;`
- `openRawDb(absoluteDbPath)`:
  - `mkdirSync(dirname(absoluteDbPath), { recursive: true })`
  - Try `new Database(path)` → on failure, throw `DbOpenError` with `cause`.
  - 6 PRAGMAs: `WAL`, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=5000`, `temp_store=MEMORY`, `cache_size=-10000`.
  - Verify `ENABLE_FTS5` via `PRAGMA compile_options`; close + throw `FtsUnavailableError` if absent.
  - Call `runPendingMigrations(db)`.

### 2. `sessions.ts` — 327 lines

- Error hierarchy: `VaultError` (base) → `SchemaVersionError`, `FtsUnavailableError`, `DbOpenError`. Each sets `this.name` and accepts `ErrorOptions` for cause chaining.
- `MigrationError` re-exported from `./internal/migrations/runner.js`.
- Public types: `Session`, `Observation`, `Entity`, `Relation`, `SearchHit`, `SessionsDB`.
- `CANONICAL_ENTITY_TYPES: readonly string[]` — 8 Haiku-friendly hints.
- Module-level cache: `const CACHE = new Map<string, SessionsDB>();`
- `openSessionsDB(projectPath)` → resolves `~/vault/projects/{basename(projectPath)}/sessions.db`, calls `openRawDb`, builds frozen handle, caches.
- `closeSessionsDB(projectPath)` → closes cached handle and drops cache entry.
- `buildSessionsHandle(db, project)`:
  - Pre-prepares 8 statements (create, append, upsert, linkRel, selectRel, search, anchor, timeline).
  - `createSession` mints `randomUUID()`, stamps `new Date().toISOString()`.
  - `appendObservation` validates `entities: number[]`, serializes JSON, runs INSERT, returns shaped object with `Number(lastInsertRowid)`.
  - `upsertEntity` uses `INSERT … ON CONFLICT(name) DO UPDATE … RETURNING …`.
  - `linkRelation` is idempotent via `INSERT OR IGNORE` + `SELECT` round-trip.
  - `searchObservations(query, options?)` runs FTS5 MATCH with `bm25(observations_fts)` rank, LEFT JOIN for session summary, in-memory filter on `sessionId`/`type`, limit clamp `[1, 500]`.
  - `timeline(anchorId, window=5)` picks up the anchor's `session_id`, returns observations in `[anchorId-window, anchorId+window]` ordered by `id ASC`.
  - `close()` calls `db.close()`.

### 3. `vault/index.ts` — 21 lines

- Re-exports 9 values + 6 types from `./sessions.js`.
- Zero imports from `./internal/*` (boundary).

### 4. `src/index.ts` — 10 lines

- Preserves `CDS_CORE_VERSION` (Phase 33 export).
- Adds `export * from './vault/index.js';`.

## Verification

| Check | Result |
|-------|--------|
| `grep -c "export function openRawDb"` (db.ts) | 1 |
| `grep -c "export type RawDatabase"` (db.ts) | 1 |
| 6 PRAGMAs via `db.pragma(...)` | All 6 present at lines 43–48 |
| `grep -c "ENABLE_FTS5"` (db.ts) | 1 |
| `grep -c "runPendingMigrations"` (db.ts) | 2 (import + call) |
| `grep -c "^export class VaultError"` (sessions.ts) | 1 |
| `grep -c "^export function openSessionsDB"` (sessions.ts) | 1 |
| `grep -c "CACHE.set"` (sessions.ts) | 1 |
| `grep -c "randomUUID"` (sessions.ts) | 2 (import + call) |
| `grep -c "bm25(observations_fts)"` (sessions.ts) | 1 |
| sessions.ts line count | 327 (≥150 required) |
| `vault/index.ts` imports from `./internal/*` | 0 (only comment) |
| `vault/index.ts` `openRawDb|RawDatabase` mentions | 0 |
| `src/index.ts` re-exports `./vault/index.js` | 1 |
| `pnpm --filter @cds/core run build` | Exit 0 |
| `Object.keys(await import('@cds/core'))` | 9 expected; `openRawDb` NOT present |
| Runtime E2E smoke | Session create, observation append, entity upsert, FTS search, timeline, cache same-ref, close all pass |
| `pnpm -r run test` | All 4 packages pass |

## Runtime Evidence (E2E smoke against tmp-vault)

```
db is frozen: true
session id: b11507fd
observation ids: 1 2
entity: 1 Claude person
search "hello" hits: 1 first content: Hello world from vault
timeline window around o2: 2 observations
cache same reference: true
after close, openRawDb is: undefined
VaultError class: true
```

## Commits

| Hash | Message |
|------|---------|
| `131034b` | feat(35-03): add internal DB factory openRawDb (VAULT-03) |
| `658b7cb` | feat(35-03): add public sessions API + error hierarchy (VAULT-01, VAULT-03) |
| `8061b72` | feat(35-03): add vault public facade (VAULT-03 boundary) |
| `fa57e19` | feat(35-03): re-export vault facade from @cds/core barrel (VAULT-01) |

## Deviations from Plan

**[Rule 2 — Missing Critical] `_project` parameter never used inside `buildSessionsHandle`** — Found during: tsc strict pass of Task 2. Issue: the planner's spec passed `project: string` to `buildSessionsHandle(db, project)` for potential per-tenant context, but no body read used it. `noUnusedParameters` (implied by `strict: true` in base tsconfig) would have failed the build. Fix: renamed the parameter to `_project` (underscore-prefix convention) and disabled `@typescript-eslint/no-unused-vars` via comment for the line since we still want to preserve the call-site contract for Phase 36 (which may pass scope metadata through it). Files modified: `sessions.ts`. Verification: `pnpm --filter @cds/core run build` exits 0.

**Total deviations:** 1 auto-fixed (missing critical TS strict). **Impact:** none — signature preserved for future extension; downstream callers cannot observe the rename.

## Surface Audit

Runtime `Object.keys(await import('@cds/core'))` returns exactly:
```
[
  'CANONICAL_ENTITY_TYPES',
  'CDS_CORE_VERSION',
  'DbOpenError',
  'FtsUnavailableError',
  'MigrationError',
  'SchemaVersionError',
  'VaultError',
  'closeSessionsDB',
  'openSessionsDB'
]
```

`openRawDb` and `RawDatabase` are absent — VAULT-03 boundary holds at runtime. Plan 04 will freeze this with a test.

## Next

Ready for Plan 04 (`35-04-integration-tests-and-boundary-regression`): sessions.test.ts / migration.test.ts / vault.boundary.test.ts land on this implementation.

## Self-Check: PASSED

- [x] All 4 tasks executed.
- [x] 4 atomic commits (db, sessions, vault/index, src/index).
- [x] All files compile under `@cds/core` strict NodeNext tsconfig.
- [x] 6 PRAGMAs + FTS5 availability check on every open.
- [x] Module-level cache honors D-49.
- [x] Runtime surface exposes public API; hides internal.
- [x] `pnpm --filter @cds/core run build` exits 0.
- [x] `pnpm -r run test` continues to pass on all 4 workspace packages.
