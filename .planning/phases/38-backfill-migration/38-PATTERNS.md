# Phase 38: Backfill Migration — Pattern Map

**Mapped:** 2026-04-16
**Source:** 38-CONTEXT.md (§Existing Code Insights, §Integration Points) + 38-RESEARCH.md (§9 Existing code references)

> For each file created or modified in Phase 38, identifies the closest existing analog in the codebase and the concrete pattern to replicate.

---

## New Files

### `packages/cds-migrate/src/sessions-md-to-sqlite.ts`
- **Role:** Core library — `migrateMarkdownSessions({ vaultPath, projectName, dryRun?, forceRefresh?, maxCost? }): Promise<MigrationReport>`.
- **Analog:** No direct analog. Closest: Phase 37's `sessions-search.ts` (per plan `37-02-PLAN.md`) — a domain function that takes a DB handle + structured input and returns structured output. Also echoes `lib/notebooklm-sync.mjs` (bulk markdown processor with per-file outcomes).
- **Pattern to replicate:**
  - Pure function signature: vault path + project name in, MigrationReport out. No globals.
  - Accept `db: Database` via dependency injection (NOT module-level singleton) for test-friendliness.
  - Per-file loop: build prompt → dispatch → parse → transact → accumulate result.
  - Each file's processing is wrapped in `db.transaction(() => { ... })` (better-sqlite3 idiom). Docs: [better-sqlite3 transaction API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function).
  - Use `@cds/core`'s re-exports exclusively — never `import 'better-sqlite3'` directly from this package (Phase 35 VAULT-03 tier boundary).

### `packages/cds-migrate/src/cli.ts`
- **Role:** CLI runner. Parses flags, calls `migrateMarkdownSessions`, renders table + progress output.
- **Analog:** `lib/mcp.mjs` + `lib/export.mjs` — existing `.mjs` CLI dispatch modules. Phase 37's Plan 04 (`37-04-PLAN.md` adds a `case 'mcp serve'` dispatch) demonstrates the TypeScript-compiled CLI companion pattern.
- **Pattern to replicate:**
  - Export `async function main(args: string[]): Promise<void>` — matches Phase 37 `mcp-server.ts` entry shape.
  - Use `prompts@^2.4.2` for confirmation dialog (Phase 33 D-03 single-dep constraint — already in root `package.json`).
  - NEVER use `yargs` or `commander` — hand-roll flag parsing with a small helper (consistent with existing `lib/*.mjs` files which also hand-roll).
  - Output formatting uses ANSI color codes matching `bin/cli.mjs` convention (copy the `c` object: `{ reset, bold, dim, cyan, white, magenta, green }`).
- **Concrete reference:** `bin/cli.mjs` lines 10–18 for the color object pattern; `37-RESEARCH.md` §1.1 + Phase 37 Plan 04 for the CLI-companion pattern.

### `packages/cds-migrate/src/file-hash.ts`
- **Role:** `hashFile(path: string): string` — SHA-256 hex of raw file bytes.
- **Analog:** None — new utility. The Node built-in `crypto.createHash` is the canonical API.
- **Pattern to replicate:**
  - `import { createHash } from 'node:crypto'; import { readFileSync } from 'node:fs';`
  - Single-line synchronous implementation (files are small, ≤20 KB).
  - Named export; no default export.

### `packages/cds-migrate/src/token-estimate.ts`
- **Role:** `estimateTokens(markdown: string): number`, `estimateCost(inputTokens: number): number`.
- **Analog:** None — new utility.
- **Pattern to replicate:**
  - Pure function, no I/O.
  - Cyrillic detection via `/[\u0400-\u04FF]/g.length` (per 38-RESEARCH §5.2).
  - Upper-bound the cost (round up, err high) — documented in file comment.

### `packages/cds-migrate/src/markdown-parser.ts`
- **Role:** Lightweight structural helper — extracts file metadata (title, date-in-filename) + returns the raw markdown body for Haiku. Does NOT pre-parse sections (D-92 — let Haiku see the whole file at v1.0).
- **Analog:** Minimal parsing; echoes the frontmatter-skip pattern in `lib/decisions-cli.mjs`. Also influenced by `lib/export.mjs` (which reads markdown but does not mutate).
- **Pattern to replicate:**
  - Pure functions: `extractSessionId(filename: string): string` (returns `'backfill-' + basename without .md`), `extractStartTime(filename, content): string` (prefers YYYY-MM-DD from filename, falls back to mtime).
  - No mutation. Read-only transforms.

### `packages/cds-migrate/src/types.ts`
- **Role:** Exported TypeScript types for the library surface.
- **Analog:** Phase 37 Plan 01 `mcp-tools/shared.ts` (error hierarchy + helpers in a single types/shared module).
- **Pattern to replicate:**
  - Named exports. Interfaces + type aliases only — no runtime code.
  - Interfaces: `MigrationReport`, `MigrationFileResult`, `MigrateOptions`, `FileInput`.

### `packages/cds-migrate/src/sessions-md-to-sqlite.test.ts`
- **Role:** Unit tests for the core migrator.
- **Analog:** Phase 37's `src/mcp-tools/sessions-search.test.ts` planned structure (per `37-02-PLAN.md`). Also Phase 33's `src/index.test.ts` (already at `packages/cds-migrate/src/index.test.ts`).
- **Pattern to replicate:**
  - `describe`/`it` from `vitest`.
  - `beforeEach`/`afterEach` for tmpdir isolation.
  - Inject mock `dispatchAgent` from `tests/helpers/mock-dispatch-agent.ts`.
  - Test-side uses `:memory:` DB via `tests/helpers/temp-db.ts`.

### `packages/cds-migrate/src/cli.test.ts`
- **Role:** Unit tests for CLI entrypoint — flag parsing, output rendering, confirmation flow.
- **Analog:** Phase 37 `src/cli-dispatch.test.ts` (plans in Plan 04).
- **Pattern to replicate:**
  - Capture stdout via spy on `process.stdout.write`.
  - Mock `prompts` by passing an override factory (dependency injection at the CLI entry).
  - Test non-TTY path via `Object.defineProperty(process.stdout, 'isTTY', { value: false })`.

### `packages/cds-migrate/src/file-hash.test.ts`
- **Role:** Unit tests for SHA-256 file hashing.
- **Analog:** No analog — trivial unit tests.

### `packages/cds-migrate/src/token-estimate.test.ts`
- **Role:** Unit tests for token + cost estimation.
- **Analog:** None — trivial unit tests.

### `packages/cds-migrate/src/sessions-md-to-sqlite.integration.test.ts`
- **Role:** Real-Haiku integration test gated on `INTEGRATION=1`.
- **Analog:** Phase 37 Plan 01 `src/mcp-server.integration.test.ts` — `describe.skipIf(!process.env.INTEGRATION)` pattern.
- **Pattern to replicate:**
  - Skip block when env gate is absent (`it.skipIf(!process.env.INTEGRATION)`).
  - Use 1 real fixture markdown + real `@cds/core` + real Anthropic API.
  - Assert: 1 session row written, cost > $0, at least 1 observation.

### `packages/cds-migrate/tests/fixtures/backfill/empty-sections.md` ... `large.md`
- **Role:** Hand-authored test fixtures (5 total) representing the real session-log variance observed in the scout (§7.1 of RESEARCH).
- **Analog:** `tests/fixtures/` pattern in root `tests/` — small hand-authored markdown files.
- **Pattern to replicate:** minimal, diff-friendly content. No binary data.

### `packages/cds-migrate/tests/helpers/mock-dispatch-agent.ts`
- **Role:** Mock of `@cds/core/dispatchAgent`. Returns deterministic `emit_observations` payloads keyed by input sha256.
- **Analog:** No direct analog. Closest: any test that stubs a dependency via module-level override. Phase 37's `37-02-PLAN.md` mocks `openSessionsDB` in a similar shape.
- **Pattern to replicate:**
  - Export `createMockDispatchAgent(fixtures: Record<string, EmitObservationsInput>)` factory.
  - Factory returns a function matching the real `dispatchAgent` signature; input hash → lookup → return prebuilt payload + token counts.
  - Missing fixture → throw with clear "unknown input" error.

### `packages/cds-migrate/tests/helpers/temp-vault.ts`
- **Role:** `mkdtempSync` factory + fixture copy + teardown helper.
- **Analog:** Phase 37 Plan 01 planned `__fixtures__/vault-tree.ts`.
- **Pattern to replicate:**
  - `beforeEach` hook returns `{ vaultPath, projectName }`.
  - `afterEach` cleans up via `rmSync(vaultPath, { recursive: true, force: true })`.
  - Copies selected fixture files from `tests/fixtures/backfill/` into `{vaultPath}/projects/{projectName}/sessions/`.

### `packages/cds-migrate/tests/helpers/temp-db.ts`
- **Role:** `:memory:` SQLite factory with Phase 35 migrations auto-applied.
- **Analog:** `37-VALIDATION.md` mentions an analogous helper (`build-sessions-db.ts`). Phase 35 ships the primary migration runner.
- **Pattern to replicate:**
  - Thin wrapper: `createTestDB(): Database` — opens `:memory:`, imports `@cds/core/vault/migrations/run`, runs through `002-entity-display-name.sql`.
  - Returns the handle for direct assertion use in tests.

### `@cds/core/src/vault/migrations/002-entity-display-name.sql`
- **Role:** Schema migration — adds `entities.display_name` + `sessions.source_hash` + backfills `display_name`.
- **Analog:** Phase 35's own `001-initial-schema.sql` (the baseline Phase 35 migration file).
- **Pattern to replicate:**
  - SQL comments at top documenting phase + decision refs (D-95, D-104).
  - `ALTER TABLE … ADD COLUMN` statements — safe-by-default in SQLite.
  - No data migration SQL beyond the `UPDATE entities SET display_name = name WHERE display_name IS NULL` backfill.
  - Filename sorts AFTER `001-initial-schema.sql` → executes second per forward-only runner semantics.

---

## Modified Files

### `packages/cds-migrate/src/index.ts`
- **Change:** Replace Phase 33 stub (`export const CDS_MIGRATE_VERSION = '0.0.0-stub'`) with real re-exports:
  ```ts
  export { migrateMarkdownSessions } from './sessions-md-to-sqlite.js';
  export type { MigrationReport, MigrationFileResult, MigrateOptions } from './types.js';
  export { main as cliMain } from './cli.js';
  ```
- **Analog:** Existing stub shape. The re-export pattern mirrors `packages/cds-core/src/index.ts` (which is also a stub awaiting phases 34/35 fill-in).
- **Pattern to replicate:** named re-exports only, no side-effect imports.

### `packages/cds-migrate/src/index.test.ts`
- **Change:** Remove Phase 33 placeholder test, keep the file and import surface-level verification:
  ```ts
  import { describe, it, expect } from 'vitest';
  import { migrateMarkdownSessions, cliMain } from './index.js';
  describe('@cds/migrate index', () => {
    it('exposes the public API', () => {
      expect(typeof migrateMarkdownSessions).toBe('function');
      expect(typeof cliMain).toBe('function');
    });
  });
  ```
- **Analog:** Phase 33 existing `packages/cds-migrate/src/index.test.ts` (placeholder).
- **Pattern to replicate:** minimal surface test — catches accidental export breakage without duplicating unit-test coverage.

### `packages/cds-migrate/package.json`
- **Change:** Add `"bin"` entry is NOT permitted (Phase 33 D-03). Add `"dependencies"` for `prompts`:
  ```json
  "dependencies": {
    "@cds/core": "workspace:*",
    "prompts": "^2.4.2"
  }
  ```
  NB: `prompts@^2.4.2` already in root `package.json` per the single-dep constraint. This entry makes `prompts` a first-class dep of the `@cds/migrate` package so the hoisted installation resolves it unambiguously.
- **Analog:** Phase 37 Plan 01 adds `@modelcontextprotocol/sdk` to `packages/cds-cli/package.json`.
- **Pattern to replicate:** `pnpm --filter @cds/migrate add prompts@^2.4.2` produces the canonical entry. The root `package.json` remains single-dep-on-`prompts`; this adds the per-workspace declaration for monorepo hoisting clarity.

### `@cds/core/src/capture/prompts.ts` (Phase 36 module — extended in place, NOT forked)
- **Change:** Widen `mode` type from `'transcript'` to `'transcript' | 'backfill'`. Add backfill preamble branch in `buildExtractionPrompt`.
  ```ts
  // Before (Phase 36 planned):
  export function buildExtractionPrompt({ mode, input }: { mode: 'transcript'; input: string }): BuiltPrompt;
  // After (Phase 38):
  export function buildExtractionPrompt({ mode, input }: { mode: 'transcript' | 'backfill'; input: string }): BuiltPrompt;
  // Implementation delta:
  //   if (mode === 'backfill') { userPrompt = BACKFILL_PREAMBLE + '\n\n' + input; } else { /* existing transcript path */ }
  ```
- **Analog:** This IS Phase 36's module. Phase 38 extends, never duplicates (D-91..D-93).
- **Pattern to replicate:**
  - BACKFILL_PREAMBLE is a module-level `const` with the D-92 text verbatim.
  - No change to `systemPrompt` — only user prompt gains the preamble.
  - No change to `tools` — `emit_observations` stays bit-exact.
  - Compatibility: all existing `mode: 'transcript'` call sites keep behavior 1:1.

### `@cds/core/src/vault/sessions.ts` (Phase 35 module — amended in place per D-105, NOT forked)
- **Change:** `upsertEntity(rawName, type)` normalizes input + preserves first-seen `display_name`.
  ```ts
  // Before (Phase 35 planned):
  upsertEntity(name: string, type: string): number {
    // INSERT ... ON CONFLICT(name) DO UPDATE SET last_updated = now
  }
  // After (Phase 38):
  upsertEntity(rawName: string, type: string): number {
    const trimmed = rawName.trim();
    if (trimmed === '') throw new Error('upsertEntity: rawName cannot be empty after trim');
    const normalized = trimmed.toLowerCase();
    // INSERT (normalized, trimmed, type, now, now) ON CONFLICT(name) DO UPDATE SET last_updated = now, type = COALESCE(type, excluded.type) RETURNING id
  }
  ```
- **Analog:** This IS Phase 35's module. Phase 38 amends per cross-phase coordination (§8 RESEARCH).
- **Pattern to replicate:**
  - Signature is source-compatible. `upsertEntity('Claude Code', 'agent')` still works; what changes is the stored `name` becomes `'claude code'` (normalized), `display_name` becomes `'Claude Code'` (trimmed original).
  - Use `RETURNING id` (SQLite 3.35+) to avoid a follow-up SELECT. better-sqlite3 prepared statement `.get()` returns the row; extract `.id`.
  - Empty-after-trim guard — the Phase 35 contract never allowed empty names; preserving that invariant.

### `@cds/core/src/capture/prompts.test.ts` (Phase 36 test file — extended)
- **Change:** Add test cases for `mode: 'backfill'` branch. Existing `mode: 'transcript'` tests untouched.
- **Analog:** This IS Phase 36's test file.
- **Pattern to replicate:** add `describe('mode: backfill', ...)` block at the end. Keep transcript tests at top.

### `@cds/core/src/vault/sessions.test.ts` (Phase 35 test file — extended)
- **Change:** Add test cases for normalization + display_name preservation. Existing Phase 35 upsertEntity tests updated to match the new canonical behavior (insertion case → display_name preserved; second call with differently-cased name → same id, display_name unchanged).
- **Analog:** This IS Phase 35's test file.
- **Pattern to replicate:** adjust existing Phase 35 cases to the new contract (not duplicate them) + add 4 new cases (empty-after-trim throws, mixed-case preserves, second upsert preserves display, Cyrillic input normalizes).

### `bin/cli.mjs`
- **Change:** Insert a `case 'migrate':` block between the `case 'mcp':` block (line 154) and the `case 'sync':` block (line 212). Mirrors the exact dispatch shape:
  ```js
  case 'migrate': {
    const { main } = await import('../packages/cds-migrate/dist/cli.js');
    await main(args.slice(1));
    break;
  }
  ```
- **Analog:** Same file, `case 'mcp':` (line 154). Same file after Phase 37 Plan 04 will also have a similar dispatcher shape.
- **Pattern to replicate:** single dynamic import + `args.slice(1)` pass-through. No breakage guard needed because `migrate` is a new top-level subcommand not used before.

### `packages/cds-migrate/vitest.config.ts` (may exist from Phase 33)
- **Change:** Create if missing; respect if already set by Phase 33 MONO-03.
- **Analog:** Phase 37 Plan 01 Task 4 pattern (same conditional creation logic).
- **Pattern to replicate:**
  ```ts
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: {
      globals: false,
      environment: 'node',
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
      testTimeout: 10000,
    },
  });
  ```
  Do NOT add watch-mode defaults.

---

## Integration Points (Referenced, Not Modified)

- `@cds/core/src/agent-dispatcher.ts` (Phase 34) — `dispatchAgent({ model, system, prompt, tools })`. Phase 38 imports + calls, never patches.
- `@cds/core/src/cost-tracker.ts` (Phase 34) — `CostTracker`. Phase 38 optionally uses for aggregated reporting; the per-call `cost_usd` from dispatchAgent result is the primary signal (simpler).
- `@cds/core/src/vault/sqlite.ts` (Phase 35) — `openSessionsDB(projectPath)` factory. Phase 38 imports via the re-export.
- `@cds/core/src/vault/migrations/run.ts` (Phase 35) — migration runner. Phase 38 adds `002-…sql` to the migrations dir; runner handles execution.
- `@cds/core/src/capture/types.ts` (Phase 36) — `EmitObservationsInput` type. Phase 38 imports for typing the dispatch return.

**Workspace dep shape (in `packages/cds-migrate/package.json` dependencies, pre-satisfied at Phase 33 scaffold):**
```json
"@cds/core": "workspace:*"
```

---

## Anti-Patterns to Avoid

1. **Do NOT fork `buildExtractionPrompt` or add a sibling `buildBackfillPrompt`.** Per D-91/D-93, extend Phase 36's module in place. A fork duplicates the `emit_observations` tool schema + tone guidance, creating drift surface.
2. **Do NOT fork `upsertEntity` or add a sibling `upsertNormalizedEntity`.** Per D-105, amend Phase 35's `sessions.ts`. A fork leaves the un-amended function exported (live captures hit it, backfill hits the new one) → duplicates in `entities.name`.
3. **Do NOT write to `~/vault/.../sessions.db` in tests.** Always `mkdtempSync` + `:memory:` DB + `CDS_TEST_VAULT` env gate (mirrors Phase 37 pattern).
4. **Do NOT add `migrate` to root `package.json` `bin` field.** Phase 33 D-03 locks the surface. The subcommand is dispatched through the existing single binary.
5. **Do NOT use `yargs`/`commander`.** Single-dep CLI constraint — hand-roll flag parsing.
6. **Do NOT introduce a parallel-N queue.** Phase 38 ships sequential Haiku calls per D-100 scope (parallel deferred to v1.1+).
7. **Do NOT bypass per-session transactions.** Writing `sessions` + `observations` in separate non-transactional calls risks orphan rows on mid-file error.
8. **Do NOT re-implement hashing with a library (e.g., `xxhash`).** `node:crypto` sha256 is sufficient + dependency-free.
9. **Do NOT pre-parse markdown sections in v1.0.** The whole file goes to Haiku; pre-parse is a v1.1 optimization if quality regresses (§1.5 RESEARCH).
10. **Do NOT skip the empty-after-trim guard in `upsertEntity`.** Preserves Phase 35's invariant that entity names are non-empty.

---

## Phase-boundary integration summary

| Phase 38 Module | Phase 34 Dep | Phase 35 Dep | Phase 36 Dep | Phase 33 Dep |
|---|---|---|---|---|
| `sessions-md-to-sqlite.ts` | `dispatchAgent`, `CostTracker` | `openSessionsDB`, `upsertEntity` (amended) | `buildExtractionPrompt({ mode: 'backfill' })` | Monorepo structure + tsconfig refs |
| `cli.ts` | — | — | — | `prompts` single-dep |
| `file-hash.ts` | — | — | — | — (node:crypto only) |
| `token-estimate.ts` | — | — | — | — |
| `002-entity-display-name.sql` | — | Migration runner (schema_version) | — | — |
| `prompts.ts` amend | — | — | Phase 36 owns the file; Phase 38 extends | — |
| `sessions.ts` amend | — | Phase 35 owns the file; Phase 38 amends per D-105 | — | — |
| `bin/cli.mjs` route | — | — | — | — |

Cross-phase ordering: Phase 35 MUST execute before Phase 38 (sessions.ts exists). Phase 36 MUST execute before Phase 38 (prompts.ts exists). Phase 34 MUST execute before Phase 38 (dispatchAgent exists). Enforced by ROADMAP.md "Depends on" + guarded in Plan 01 Task "Preflight dependency check".

---

## PATTERN MAPPING COMPLETE
