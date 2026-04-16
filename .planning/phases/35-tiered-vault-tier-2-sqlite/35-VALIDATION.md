---
phase: 35
slug: tiered-vault-tier-2-sqlite
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest@^3.2.4 (existing from Phase 33) |
| **Config file** | `packages/cds-core/vitest.config.ts` (already covers `src/**/*.test.ts`); root `vitest.config.ts` aggregates via `projects: ['packages/*']` |
| **Quick run command** | `pnpm --filter @cds/core test` |
| **Full suite command** | `pnpm -r run test` |
| **Estimated runtime** | ~3-8s `@cds/core` alone; ~15-25s full monorepo |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cds/core test`
- **After every plan wave:** Run `pnpm -r run test`
- **Before `/gsd-verify-work`:** Full suite must be green on Node 20 + 22 (CI matrix)
- **Max feedback latency:** 10 seconds per-package, 30 seconds full

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | MONO-03 (carry-forward, CI matrix) | — | N/A | existing | `pnpm -r run test` | yes (from Phase 33) | pending |
| 35-01-02 | 01 | 1 | VAULT-01 (dependency install) | — | N/A | existing | `pnpm --filter @cds/core run build` | yes | pending |
| 35-01-03 | 01 | 1 | — (NOTICES update) | — | N/A | existing | manual grep check | yes | pending |
| 35-01-04 | 01 | 1 | — (root engines bump) | — | N/A | existing | `node -e "console.log(require('./package.json').engines.node)"` | yes | pending |
| 35-02-01 | 02 | 2 | VAULT-02 (schema creation) | — | Parameterized SQL only | integration | `pnpm --filter @cds/core test src/vault/migration.test.ts` | NO — Plan 04 Wave 0 | pending |
| 35-02-02 | 02 | 2 | VAULT-02 (FTS5 + triggers) | — | — | integration | same | NO — Plan 04 Wave 0 | pending |
| 35-02-03 | 02 | 2 | VAULT-02 (migration runner) | — | transaction rollback on throw | integration | same | NO — Plan 04 Wave 0 | pending |
| 35-02-04 | 02 | 2 | VAULT-02 (sql -> dist copy step) | — | — | unit | `pnpm --filter @cds/core run build && ls packages/cds-core/dist/vault/internal/migrations/001-initial.sql` | existing | pending |
| 35-03-01 | 03 | 2 | VAULT-01 (openSessionsDB + PRAGMAs) | T-35-V5 | Parameterized SQL | integration | `pnpm --filter @cds/core test src/vault/sessions.test.ts` | NO — Plan 04 Wave 0 | pending |
| 35-03-02 | 03 | 2 | VAULT-01 (FTS5 verification + error hierarchy) | T-35-V7 | Sanitized error messages | integration | same | NO — Plan 04 Wave 0 | pending |
| 35-03-03 | 03 | 2 | VAULT-01 (module-level cache) | — | — | integration | same | NO — Plan 04 Wave 0 | pending |
| 35-03-04 | 03 | 2 | VAULT-02 (CRUD API: createSession, appendObservation, upsertEntity, linkRelation, search, timeline) | T-35-V5 | Integer-only entity IDs validated | integration | same | NO — Plan 04 Wave 0 | pending |
| 35-03-05 | 03 | 2 | VAULT-03 (folder convention + public facade + cds-core re-export) | T-35-V4 | Internal path not re-exported | integration | `pnpm --filter @cds/core run build` + Plan 04 boundary test | yes | pending |
| 35-04-01 | 04 | 3 | VAULT-01 (Wave 0 for sessions.test.ts) | — | — | integration | `pnpm --filter @cds/core test src/vault/sessions.test.ts` | new file | pending |
| 35-04-02 | 04 | 3 | VAULT-02 (Wave 0 for migration.test.ts) | — | — | integration | `pnpm --filter @cds/core test src/vault/migration.test.ts` | new file | pending |
| 35-04-03 | 04 | 3 | VAULT-03 (Wave 0 for vault.boundary.test.ts) | T-35-V4 | Raw handle not reachable | integration | `pnpm --filter @cds/core test src/vault/vault.boundary.test.ts` | new file | pending |

*Status: pending . green . red . flaky*

---

## Wave 0 Requirements

- Plan 04 Task 1 creates `packages/cds-core/src/vault/sessions.test.ts` — covers VAULT-01 + VAULT-02 integration behavior (open, schema, FTS5 triggers, search, timeline, close/cache)
- Plan 04 Task 2 creates `packages/cds-core/src/vault/migration.test.ts` — covers migration runner transaction semantics (rollback on invalid SQL, idempotent re-run, forward-only order)
- Plan 04 Task 3 creates `packages/cds-core/src/vault/vault.boundary.test.ts` — covers VAULT-03 (no `openRawDb` on `@cds/core`; no consumer imports internal path)
- No framework install needed — vitest present from Phase 33

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `better-sqlite3` prebuild install on fresh CI runner (no cache) | VAULT-01 | First-time install behavior requires fresh environment; not reproducible in unit test | Observe green `packages-job` on Plan 01 PR CI run across Node 20, 22 matrix |
| Node 18 CI run fails with clear error (carry-forward verification) | D-33 | Can't run Node 18 in the matrix after dropping it | After Plan 01 merges, manually trigger CI on Node 18 in local act/docker — expect engines error from `pnpm install`. Non-blocking; recorded in SUMMARY. |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies (satisfied — Plan 04 is Wave 0 for Plans 02/03's test-mapped requirements)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (longest dry run: Plan 02 tasks 02-01..02-03 use Plan 04 W0 tests — satisfied because each task still has a local `pnpm --filter @cds/core run build` acceptance criterion)
- [ ] Wave 0 covers all MISSING references — Plan 04 creates all three test files
- [ ] No watch-mode flags — all commands use one-shot `vitest run` (pnpm script `test` resolves to `vitest run` per Phase 33 scaffold)
- [ ] Feedback latency < 10s per-package — verified ~3-8s locally
- [ ] `nyquist_compliant: true` set in frontmatter (flip after Plan 04 lands)

**Approval:** pending
