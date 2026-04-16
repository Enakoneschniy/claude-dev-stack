# Phase 38 Plan 02 — SUMMARY

**Status:** executed
**Date:** 2026-04-16
**Branch:** `gsd/phase-38-backfill-migration`

## Scope

Ships the core `@cds/migrate` library: `migrateMarkdownSessions` walks
`{vaultPath}/projects/{projectName}/sessions/*.md`, dispatches each file to
Haiku via Phase 34's `dispatchAgent` with Phase 38's backfill-mode prompt
(Plan 01's `buildExtractionPrompt({mode:'backfill',input})`), and writes
observations into SQLite with a per-file transaction + sha256 idempotency
(D-94..D-97).

## Files

### Added

- `packages/cds-migrate/src/sessions-md-to-sqlite.ts` (383 lines) — library
  entry `migrateMarkdownSessions(opts): Promise<MigrationReport>` with
  dry-run + apply + force-refresh + failure-rollback paths.
- `packages/cds-migrate/src/sessions-md-to-sqlite.test.ts` (13 cases across
  4 describe groups — dry-run, apply, idempotency, failure handling).
- `packages/cds-migrate/src/sessions-md-to-sqlite.integration.test.ts`
  (1 INTEGRATION=1 gated smoke test against live Haiku).
- `packages/cds-migrate/src/types.ts` — `MigrateOptions`,
  `MigrationFileStatus`, `MigrationFileResult`, `MigrationReport`, `FileInput`,
  `DispatchAgentFn`, `DispatchResultLike`.
- `packages/cds-migrate/src/file-hash.ts` + `.test.ts` — `hashFile`,
  `hashString` (6 cases).
- `packages/cds-migrate/src/token-estimate.ts` + `.test.ts` —
  `estimateTokens`, `estimateCost`, `formatCost`, `formatSize` (9 cases).
- `packages/cds-migrate/src/markdown-parser.ts` — `extractSessionId`,
  `extractStartTime`, `extractSummary` (exercised via the migrator tests).
- `packages/cds-migrate/tests/fixtures/backfill/{empty-sections,russian-only,mixed-lang,bare-list,large}.md`
  — 5 fixtures, `large.md` ≥ 5777 bytes with 1009 Cyrillic + 2643 Latin chars.
- `packages/cds-migrate/tests/helpers/mock-dispatch-agent.ts` —
  `createMockDispatchAgent`, `createThrowingMockDispatchAgent`,
  `createCountingMockDispatchAgent`. Returns `toolUses[{name:'emit_observations',
  input:{session_summary, observations, entities, relations}}]` keyed by
  sha256(prompt) with synthetic fallback.
- `packages/cds-migrate/tests/helpers/temp-vault.ts` — `createTempVault`,
  `mutateFixture`. Copies fixtures into a tmpdir vault layout.
- `packages/cds-migrate/tests/helpers/temp-db.ts` — `createTestDB` redirects
  HOME to a tmp dir, runs Phase 35 `openSessionsDB` (applies migrations 001
  + 002 via Phase 35 runner), then opens a second raw better-sqlite3 handle
  on the same file for direct introspection in tests.

### Modified

- `packages/cds-migrate/package.json` — added deps: `prompts@^2.4.2`,
  `better-sqlite3@^12.9.0`; devDeps: `@types/better-sqlite3`,
  `@types/prompts`, `@types/node`.
- `packages/cds-migrate/vitest.config.ts` — `include` now covers both
  `src/**/*.test.ts` and `tests/**/*.test.ts`; `testTimeout: 10_000`.
- `packages/cds-migrate/src/index.ts` — replaced Phase 33 stub
  `CDS_MIGRATE_VERSION` with real re-exports of `migrateMarkdownSessions`,
  `hashFile`/`hashString`, `estimateTokens`/`estimateCost`/`formatCost`/
  `formatSize`, and the type surface.
- `packages/cds-migrate/src/index.test.ts` — 3 cases: async function shape,
  hash utilities, token utilities.

## Deviations from plan

1. **`@cds/core` subpath imports.** Plan 02 references
   `@cds/core/capture/prompts`, `@cds/core/agent-dispatcher`,
   `@cds/core/vault/sqlite`, `@cds/core/vault/sessions` — only `.` and
   `./capture` exist in Phase 33's `package.json#exports`. Switched to:
   ```ts
   import { dispatchAgent as productionDispatchAgent } from '@cds/core';
   import { buildExtractionPrompt } from '@cds/core/capture';
   ```
   and opened the raw DB via better-sqlite3 directly (the injected `db`
   option is the primary path; the default-open fallback is a thin
   better-sqlite3 open on the file path — callers that need schema
   bootstrap call `openSessionsDB` first, which Plan 03's CLI does).

2. **Raw DB access model.** Phase 35's `SessionsDB` handle is frozen and
   does not expose `.prepare()` / `.transaction()`. The migrator needs
   low-level SQL for source_hash lookup, per-file transactions, and
   DELETE + re-INSERT on force-refresh. Resolution: `MigrateOptions.db`
   is typed as `Database.Database` (raw better-sqlite3 handle) and the
   default-open helper opens the sessions.db file directly. For the
   entity upsert, the migrator uses a local prepared statement that
   mirrors the Phase 38 D-105 contract bit-for-bit (normalize name,
   preserve trimmed display_name, COALESCE type on conflict) rather
   than routing through the public handle. The SessionsDB wrapper is
   still exercised by the test helper (via Phase 35 `openSessionsDB` to
   apply migrations before the raw handle opens on the same file).

3. **Dispatcher result shape.** Phase 34's real `dispatchAgent` returns
   `{output, tokens, cost_usd, toolUses}` where the structured payload
   lives in `toolUses[0].input`. The plan assumed `JSON.parse(output)`.
   The migrator now reads `toolUses.find(t => t.name === 'emit_observations').input`
   first, falling back to JSON-parsing `output` for legacy mocks. This
   matches the real Haiku wiring and keeps the unit-test mocks
   representative.

4. **Model alias.** Plan says `'claude-haiku-4-5'`; Phase 34's
   `resolveModel` accepts the 'haiku' alias directly. Used `'haiku'` to
   keep consistent with how the Stop hook invokes dispatchAgent.

## Test counts

- `file-hash.test.ts`: **6 cases** — all green.
- `token-estimate.test.ts`: **9 cases** — all green.
- `sessions-md-to-sqlite.test.ts`: **13 cases** across 4 describe groups
  (dry-run, apply, idempotency, failure handling) — all green.
- `sessions-md-to-sqlite.integration.test.ts`: **1 case, skipped by
  default** (requires `INTEGRATION=1` + `ANTHROPIC_API_KEY`).
- `index.test.ts`: **3 cases** — all green.
- **Package total: 31 passed / 1 skipped** (`pnpm --filter @cds/migrate test`).

Workspace-wide `pnpm test`: **1136 passed / 4 skipped / 1 todo / 3
pre-existing detect.test.mjs failures** (per task brief). Baseline was
~1088 before Phase 38; this plan adds 48 new tests (17 in cds-core via
Plan 01, 31 in cds-migrate via Plan 02) matching that delta.

## Integration smoke (manual)

Not executed in this pass (no `INTEGRATION=1` run). Gating logic is test-
locked (test is skipped cleanly when env missing). Manual instructions:
```
INTEGRATION=1 ANTHROPIC_API_KEY=... pnpm --filter @cds/migrate test \
  src/sessions-md-to-sqlite.integration.test.ts
```

## Handoff to Plan 03

Plan 03's CLI consumes:

```ts
import {
  migrateMarkdownSessions,
  formatCost,
  formatSize,
  type MigrationReport,
  type MigrationFileResult,
} from './sessions-md-to-sqlite.js'; // or from the package root
```

For default-path DB open the CLI should invoke Phase 35's `openSessionsDB`
(to ensure migrations apply) and then pass `db` through as an override, or
let the library's default-open path run — either works after `openSessionsDB`
has been called once per project path.
