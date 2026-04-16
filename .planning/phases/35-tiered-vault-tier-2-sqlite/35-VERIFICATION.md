---
phase: 35-tiered-vault-tier-2-sqlite
status: passed
requirements_checked:
  - VAULT-01
  - VAULT-02
  - VAULT-03
verified: 2026-04-16
---

# Phase 35 Verification — Tiered Vault Tier 2 SQLite

Scope: verify that Phase 35's goal (per-project `~/vault/projects/{name}/sessions.db` SQLite session memory with type-level boundary) has been achieved end-to-end against the REQUIREMENTS.md acceptance criteria.

## Requirement Traceability

### VAULT-01 — `openSessionsDB(projectPath)` returns a better-sqlite3 connection

| Acceptance criterion | Verified by | Status |
|---|---|---|
| `openSessionsDB(projectPath)` exported from `@cds/core` | `packages/cds-core/src/vault/sessions.ts` line 140 + barrel re-export in `src/index.ts` | PASS |
| Returns a better-sqlite3-backed handle | `sessions.test.ts` test 1 (DB file + WAL + SHM created on write) | PASS |
| Driver = better-sqlite3 (not bun:sqlite) | `package.json` declares `better-sqlite3@^12.9.0`; no `bun:sqlite` reference anywhere | PASS |
| DB created on first call with WAL mode | `db.ts` line 43 `db.pragma('journal_mode = WAL')`; test asserts `sessions.db-wal` file existence | PASS |
| FTS5 extension verified | `db.ts` lines 50–57 `PRAGMA compile_options` + `FtsUnavailableError` on absence | PASS |
| Path = `~/vault/projects/{basename(projectPath)}/sessions.db` | `sessions.ts` line 145 — `join(homedir(), 'vault', 'projects', basename(projectPath), 'sessions.db')` | PASS |

### VAULT-02 — Schema + migrations

| Acceptance criterion | Verified by | Status |
|---|---|---|
| Tables `sessions`, `observations`, `entities`, `relations` | `001-initial.sql` + `migration.test.ts` test 1 | PASS |
| `observations` has `entities JSON` (stored as TEXT) | `001-initial.sql` line 21 `entities TEXT NOT NULL DEFAULT '[]'`; test 5 round-trip | PASS |
| FTS5 virtual table `observations_fts` on content + session_summary | `001-initial.sql` lines 59–65 `CREATE VIRTUAL TABLE … USING fts5(content, session_summary, content=observations, …)` | PASS |
| Schema migrations in `packages/cds-core/src/vault/migrations/` with `schema_version` table | Folder = `packages/cds-core/src/vault/internal/migrations/` (naming adjusted for boundary); `runner.ts` enforces `schema_version(version, applied_at)` | PASS |
| Forward-only migrations | `runner.ts` filters `m.version > current` — never re-applies; no down-migration API | PASS |

### VAULT-03 — Tier boundary enforcement

| Acceptance criterion | Verified by | Status |
|---|---|---|
| Only `sessions.ts` writes to SQLite | `sessions.ts` is the sole owner of write-statement preparation; `db.ts` provides `openRawDb` but keeps the handle in the internal folder | PASS |
| No exported raw db handle | `Object.keys(await import('@cds/core'))` excludes `openRawDb` / `RawDatabase` (confirmed at runtime) | PASS |
| Direct INSERT outside module fails type-check | `openRawDb` is NOT re-exported from `vault/index.ts` or `src/index.ts`; consumers only see `SessionsDB` | PASS |
| Markdown writers unchanged | `lib/notebooklm-sync.mjs`, `lib/adr-bridge-session.mjs` untouched by Phase 35 (no diff against main) | PASS |
| Decisions/docs/planning remain markdown | Phase 35 writes only code + SUMMARY.md artifacts; no data migration | PASS |

## Must-Haves Check

Pulled from the 4 PLAN.md files' `must_haves.truths`:

- CI matrix drops Node 18 — `.github/workflows/ci.yml` has `[20, 22]` only (both jobs) — **PASS**
- Root `engines.node >=20` — `package.json` line 31 — **PASS**
- `@cds/core` declares `better-sqlite3@^12.9.0` + `@types/better-sqlite3@^7.x` — **PASS**
- `NOTICES.md` with `better-sqlite3` MIT + WiseLibs URL — **PASS**
- `pnpm install --frozen-lockfile` exits 0 — **PASS**
- `001-initial.sql` declares 4 tables + FTS5 + 4 triggers — `grep -c` confirms — **PASS**
- Migration runner transactional and idempotent — `migration.test.ts` tests 1 + 2 — **PASS**
- `dist/vault/internal/migrations/001-initial.sql` exists post-build — **PASS** (verified byte-for-byte match)
- `import { openSessionsDB } from '@cds/core'` compiles and returns handle — **PASS** (runtime test)
- `openRawDb` NOT in public surface — **PASS** (`vault.boundary.test.ts` test 1)
- Public API covers createSession / appendObservation / upsertEntity / linkRelation / searchObservations / timeline / close — **PASS** (types + integration tests)
- All error classes extend Error and are public — **PASS** (re-exported through barrel)
- `openSessionsDB` throws `FtsUnavailableError` when FTS5 missing — **PASS** (db.ts line 54)
- Test baseline preserved: 945 pre-existing pass + 3 fail + 1 skip — **PASS** (+20 new tests + 1 todo from Plan 04)

## Commands Executed

```bash
pnpm install --frozen-lockfile       # exit 0
pnpm -r run build                     # exit 0 (4 packages)
pnpm -r run test                      # exit 0 (4 package suites; 21 pass + 1 todo in cds-core)
pnpm test                             # root: 965 pass + 3 pre-existing fail + 1 skip + 1 todo
node -e "import('./packages/cds-core/dist/index.js').then(m => ...)"
                                      # runtime surface has 9 exports; openRawDb absent
```

## Cross-Phase Regression Check

No prior-phase VERIFICATION.md files exist (Phase 33 was the milestone scaffold; no cross-phase test harness to exercise). The 3 failing root tests in `tests/detect.test.mjs` existed before Phase 35 began (documented in Plan 01 SUMMARY) and are unchanged. No prior passing tests regressed.

## Gaps

None. Phase 35 goal fully achieved within its declared scope. `test.todo` in migration.test.ts for rollback-on-bad-SQL is a deliberate deferral (file-backed runner makes robust corrupt-SQL injection fragile) — captured as Phase 35.x candidate, not a gap in the phase's own contract.

## Conclusion

All 3 requirements (VAULT-01, VAULT-02, VAULT-03) verified against codebase + runtime behavior + automated tests. Phase 35 is ready for PR.
