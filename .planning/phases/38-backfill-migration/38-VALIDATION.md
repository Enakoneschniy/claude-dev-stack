---
phase: 38
slug: backfill-migration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-16
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6+ (matches Phase 33 MONO-03 baseline) |
| **Config file** | `packages/cds-migrate/vitest.config.ts` (extends root shared config from Phase 33) |
| **Quick run command** | `pnpm --filter @cds/migrate vitest run --reporter=default` |
| **Full suite command** | `pnpm test` (runs all packages) |
| **Estimated runtime** | ~6 seconds for cds-migrate only, ~30s full monorepo |
| **Real-SDK gate** | `INTEGRATION=1` env var enables the single live-Haiku smoke test in `sessions-md-to-sqlite.integration.test.ts` |
| **Vault isolation** | `CDS_TEST_VAULT` env var set by every test `beforeEach` to a `mkdtempSync`'d path; production code path-resolves vault root from `process.env.CDS_TEST_VAULT ?? homedir() + '/vault'` |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cds/migrate vitest run src/<file>.test.ts --reporter=default`
- **After every plan wave:** Run `pnpm --filter @cds/migrate vitest run`
- **Before `/gsd-verify-work`:** `pnpm test` full suite must be green
- **Max feedback latency:** 10 seconds for targeted file, 25s full package

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | MIGRATE-01 | — | Migration 002 SQL syntactically valid; `ALTER TABLE ADD COLUMN` is idempotent at runner level | unit | `pnpm --filter @cds/core test src/vault/migrations-002.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | MIGRATE-01 | — | `upsertEntity` normalizes + preserves first-seen display_name | unit | `pnpm --filter @cds/core test src/vault/sessions.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-03 | 01 | 1 | MIGRATE-01 | — | `buildExtractionPrompt({ mode: 'backfill' })` returns D-92 preamble verbatim; transcript mode unchanged | unit | `pnpm --filter @cds/core test src/capture/prompts.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-01 | 02 | 2 | MIGRATE-01 | — | Wave 0 fixtures + mock dispatchAgent compile and import | unit | `pnpm --filter @cds/migrate test tests/fixtures/__fixtures__.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-02 | 02 | 2 | MIGRATE-01 | T-38-01 | File hashing is deterministic + byte-exact | unit | `pnpm --filter @cds/migrate test src/file-hash.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-03 | 02 | 2 | MIGRATE-01 | — | Token estimation is within ±10% of known-size fixtures | unit | `pnpm --filter @cds/migrate test src/token-estimate.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-04 | 02 | 2 | MIGRATE-01 | — | `migrateMarkdownSessions({ dryRun: true })` returns MigrationReport without DB writes | unit | `pnpm --filter @cds/migrate test src/sessions-md-to-sqlite.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-05 | 02 | 2 | MIGRATE-01 | T-38-02 | `migrateMarkdownSessions({ dryRun: false })` writes 1 session + N observations + M entities + K relations per file, per-file transaction atomic | unit | `pnpm --filter @cds/migrate test src/sessions-md-to-sqlite.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-06 | 02 | 2 | MIGRATE-01 | — | Re-run on unchanged hashes is a no-op (zero new rows, status 'unchanged') | unit | `pnpm --filter @cds/migrate test src/sessions-md-to-sqlite.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-07 | 02 | 2 | MIGRATE-01 | — | Hash mismatch with `forceRefresh: false` → skip warning; `forceRefresh: true` → delete + re-insert | unit | `pnpm --filter @cds/migrate test src/sessions-md-to-sqlite.test.ts` | ❌ W0 | ⬜ pending |
| 38-02-08 | 02 | 2 | MIGRATE-01 | — | dispatchAgent failure in transaction rolls back (no orphan rows) | unit | `pnpm --filter @cds/migrate test src/sessions-md-to-sqlite.test.ts` | ❌ W0 | ⬜ pending |
| 38-03-01 | 03 | 3 | MIGRATE-02 | — | CLI flag parsing: `--dry-run`, `--apply`, `--force-refresh`, `--max-cost N` — valid + invalid inputs | unit | `pnpm --filter @cds/migrate test src/cli.test.ts` | ❌ W0 | ⬜ pending |
| 38-03-02 | 03 | 3 | MIGRATE-02 | — | Dry-run table output format matches fixed-width spec (§5.1) | unit | `pnpm --filter @cds/migrate test src/cli.test.ts` | ❌ W0 | ⬜ pending |
| 38-03-03 | 03 | 3 | MIGRATE-02 | — | Confirmation prompt triggers above `--max-cost`; reject → exit 2 | unit | `pnpm --filter @cds/migrate test src/cli.test.ts` | ❌ W0 | ⬜ pending |
| 38-03-04 | 03 | 3 | MIGRATE-02 | — | Streaming progress: TTY uses `\r\x1b[2K`; non-TTY prints per-line | unit | `pnpm --filter @cds/migrate test src/cli.test.ts` | ❌ W0 | ⬜ pending |
| 38-03-05 | 03 | 3 | MIGRATE-02 | — | `bin/cli.mjs case 'migrate'` dynamic-imports + dispatches; `mcp` regression untouched | unit | `pnpm --filter @cds/migrate test src/cli-dispatch.test.ts` (plus integration via bin/cli.mjs) | ❌ W0 | ⬜ pending |
| 38-03-06 | 03 | 3 | MIGRATE-01 + 02 | — | End-to-end smoke against real Haiku (`INTEGRATION=1` gated) writes DB with ≥1 observation | integration | `INTEGRATION=1 pnpm --filter @cds/migrate test src/sessions-md-to-sqlite.integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cds-migrate/vitest.config.ts` — extends root shared vitest config (created in Phase 33 MONO-03). If already present from Phase 33, re-use as-is.
- [ ] `packages/cds-migrate/tests/fixtures/backfill/` directory with 5 fixture markdown files:
  - `empty-sections.md` — header only, no body
  - `russian-only.md` — Russian prose with `## Что сделано`
  - `mixed-lang.md` — English + Russian + code + file paths
  - `bare-list.md` — bulleted list without headers
  - `large.md` — ≥5 KB multi-section markdown (tests token estimation)
- [ ] `packages/cds-migrate/tests/helpers/mock-dispatch-agent.ts` — shared mock of `@cds/core/dispatchAgent` returning pre-canned `emit_observations` payloads keyed by input sha256
- [ ] `packages/cds-migrate/tests/helpers/temp-vault.ts` — per-test `mkdtempSync` setup + fixture copy into `projects/{name}/sessions/` tree + teardown
- [ ] `packages/cds-migrate/tests/helpers/temp-db.ts` — `:memory:` SQLite factory + schema migration runner bootstrap
- [ ] `CDS_TEST_VAULT` env var honored by migrator entrypoint (migrator path-resolves vault root from `process.env.CDS_TEST_VAULT ?? homedir() + '/vault'`)
- [ ] Phase 35 `upsertEntity` and migration runner are live on disk (Plan 01 verifies; fails loud with STATE.md blocker if not)
- [ ] Phase 36 `buildExtractionPrompt` is live on disk (Plan 01 verifies; fails loud with STATE.md blocker if not)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real vault migration of all 37 sessions | MIGRATE-01 + MIGRATE-02 | Requires live Haiku API + real `~/vault/projects/claude-dev-stack/sessions/*.md` + real sessions.db file. Too expensive + non-deterministic for automated CI. | 1. `claude-dev-stack migrate sessions --dry-run` — verify 37 files listed with cost <$0.50. 2. `claude-dev-stack migrate sessions --apply` — confirm prompt, approve. 3. Spot-check output: 35+/37 succeed, total cost within estimate ±15%. 4. `claude-dev-stack migrate sessions --apply` second run → all 37 skip as 'unchanged'. 5. Edit one .md file, re-run → that one file shows `hash-changed` warning. 6. `claude-dev-stack migrate sessions --apply --force-refresh` on that file → re-extracts successfully. Document in `38-VERIFICATION.md`. |
| `sessions.search("SEED-001")` returns backfilled observations alongside auto-captured ones | MIGRATE-01 (ROADMAP success criterion 4) | Depends on Phase 37 MCP server being live; Phase 38 only provides backfill data. | 1. Run migrate. 2. Open Claude Code in claude-dev-stack project. 3. Ask Claude to use `sessions.search('seed')` via MCP. 4. Verify results include entries with `session_id LIKE 'backfill-%'`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixture markdown + mock dispatchAgent + temp vault + temp DB)
- [ ] No watch-mode flags (all tests use `vitest run`, not `vitest`)
- [ ] Feedback latency < 10s per file, 25s full suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (auto-approved on plan-checker PASS)
