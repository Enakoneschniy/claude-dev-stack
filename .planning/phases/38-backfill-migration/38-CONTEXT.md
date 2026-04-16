# Phase 38: Backfill Migration - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Port the 37 existing hand-written markdown session logs in `vault/projects/{name}/sessions/*.md` into SQLite Tier 2 via Haiku-driven entity extraction, so historical context becomes queryable alongside future auto-captured sessions. Ships as a CLI subcommand `claude-dev-stack migrate sessions` with `--dry-run` and `--apply` modes.

**Deliverables:**
1. **`packages/cds-migrate/src/sessions-md-to-sqlite.ts`** — library function `migrateMarkdownSessions({ vaultPath, projectName, dryRun?, forceRefresh? }): Promise<MigrationReport>`
2. **`packages/cds-migrate/src/cli.ts`** — CLI runner that parses flags and dispatches to the migrator
3. **`bin/cli.mjs` surgical update** — add `case 'migrate':` route (dynamic import to `packages/cds-migrate/dist/cli.js`); preserves Phase 33 D-03 (root `"bin"` field unchanged)
4. **Schema migration 002-entity-display-name.sql** (in `@cds/core/src/vault/migrations/`) — adds `entities.display_name TEXT` column, keeps `entities.name` as normalized (lowercase+trimmed) UNIQUE key
5. **Update `@cds/core` sessions.ts API** — `upsertEntity` accepts raw name, normalizes for the UNIQUE key, preserves original casing in `display_name`
6. **Shared prompt module** — extend `@cds/core/src/capture/prompts.ts` `buildExtractionPrompt({ mode, input })` to accept `mode: 'transcript' | 'backfill'` and prepend a backfill preamble when `mode === 'backfill'`

**Explicitly NOT in scope for Phase 38:**
- LLM-based entity merging (deduplication of `'CC'` ↔ `'Claude Code'` is ACCEPTED as duplicates in v1.0; v1.1+ adds a merge tool per D-94)
- Cross-project backfill (Phase 38 runs per-project per invocation)
- Migration of decisions from `vault/projects/{name}/decisions/*.md` (separate doc type, not sessions)
- Two-way sync (SQLite → markdown) — markdown is frozen source of truth, SQLite is derived

</domain>

<decisions>
## Implementation Decisions

### Prompt Strategy (D-91 … D-93)
- **D-91:** **Shared core prompt + mode preamble.** `@cds/core/src/capture/prompts.ts` `buildExtractionPrompt({ mode: 'transcript' | 'backfill', input })` returns `{ systemPrompt, userPrompt }`. Core tool (`emit_observations`) and observation types stay identical across modes — only the preamble differs. Keeps sessions.db schema consistent between live + backfill data.
- **D-92:** Backfill preamble text:
  ```
  You are processing a human-written session summary, not a live transcript.
  The author has already distilled the session into prose. Extract ONLY decisions,
  blockers, todos, and entities that are EXPLICITLY stated. Do not infer file touches
  from casual prose mentions. Do not fabricate observations. If the summary is thin,
  return few observations — low recall is acceptable; low precision is not.
  ```
- **D-93:** Phase 38's planner extends Phase 36's prompts module (doesn't duplicate it). If Phase 36 hasn't shipped yet at Phase 38 planning time, this is a cross-phase integration point — planner should verify `@cds/core/src/capture/prompts.ts` exists via Phase 36 plans and adjust import ordering accordingly.

### Idempotency Model (D-94 … D-97)
- **D-94:** **Session ID derivation:** `sessions.id = 'backfill-' + <filename without .md>`. Example: `2026-04-09-sync-and-publish.md` → `backfill-2026-04-09-sync-and-publish`. Prefix `backfill-` distinguishes historical records from future auto-captured sessions (which use Claude Code's `CLAUDE_SESSION_ID`, UUID-shaped).
- **D-95:** **Content hash column:** migration `002-entity-display-name.sql` ALSO adds `sessions.source_hash TEXT NULL` (nullable for future auto-captured sessions which don't have source markdown). Phase 38 computes `sha256(markdown_file_contents)` per file, stores in `sessions.source_hash`. This hash enables detect-if-edited checks on subsequent `--apply` invocations.
- **D-96:** **Default behavior — skip already-migrated:** `--apply` checks `sessions.id` presence AND hash match. If `sessions.id` exists AND `source_hash` matches → skip silently (log `already migrated`). If `sessions.id` exists AND hash differs → skip with warning `⚠ {filename} content changed since last migration — use --force-refresh to re-extract` (NOT auto-refresh; user must opt in to avoid unexpected costs).
- **D-97:** **`--force-refresh` flag:** when hash mismatch detected, re-extract. Implementation: `DELETE FROM observations WHERE session_id = ?`, `DELETE FROM sessions WHERE id = ?` (cascades to `observations.entities` JSON references), then run the normal migrate flow. Per-session transaction so partial failures don't leave orphans. `--force-refresh` without hash mismatches is also OK (re-migrates everything) but warns `⚠ Re-migrating N sessions with unchanged content will cost ~$X`.

### CLI UX & Failure Handling (D-98 … D-102)
- **D-98:** **Dry-run output:**
  ```
  $ claude-dev-stack migrate sessions --dry-run
  Project: claude-dev-stack
  Vault:   /Users/x/vault/projects/claude-dev-stack
  Sessions found: 37

  #  Filename                                    Size    Tokens(est)  Cost(est)   Status
  ─  ──────────────────────────────────────────  ──────  ───────────  ──────────  ────────────
  1  2026-04-09-sync-and-publish.md              2.9 KB      820        $0.014    will-migrate
  2  2026-04-09-v07-release.md                   2.7 KB      750        $0.013    will-migrate
  ...
  Total:                                         108 KB   ~31,000      $0.52      37 files

  Run with --apply to execute. Adds --force-refresh to re-process already-migrated files.
  ```
- **D-99:** **Apply confirmation:** if estimated total cost > $0.30 (default threshold, user-configurable via `--max-cost`), prompt `Estimated cost: $0.52 — proceed? (y/N)`. If total ≤ $0.30, proceed without prompt. Zero prompts inside the loop (no per-file confirms).
- **D-100:** **Per-session transaction:** each markdown file's migration is an isolated SQLite transaction. Writes: 1 `sessions` row + N `observations` rows + M `entities` upserts + K `relations` rows. COMMIT per file. If Haiku extraction throws, the transaction rolls back cleanly; other files continue. The commit-successful model (not all-or-nothing).
- **D-101:** **Progress output during apply:** stream per-file status:
  ```
  [1/37] 2026-04-09-sync-and-publish.md ... ✓ (5 observations, $0.015)
  [2/37] 2026-04-09-v07-release.md ... ✓ (3 observations, $0.013)
  [3/37] 2026-04-10-nblm-sync.md ... ✗ Haiku timeout (retry 1/1)
  [3/37] 2026-04-10-nblm-sync.md ... ✓ (4 observations, $0.014)
  [4/37] 2026-04-10-ship-nblm.md ... ✗ Haiku API error (no retry) — skipping
  ...

  Migration complete:
    Succeeded: 35/37
    Failed:    2/37
    Total cost: $0.48 (estimated $0.52)

  Failed files:
    - 2026-04-10-ship-nblm.md — Haiku API 500 (rate limit)
    - 2026-04-12-unrelated.md — sha256 mismatch, use --force-refresh

  Re-run `claude-dev-stack migrate sessions --apply` to retry failed files (successful files skip automatically).
  ```
- **D-102:** **Resume via idempotency:** a second `--apply` run is the retry mechanism. No separate `--resume` flag. Idempotency (D-96) ensures already-committed sessions skip; failed sessions retry.

### Entity Normalization (D-103 … D-107)
- **D-103:** **Normalization rule:** `normalize(name) = name.trim().toLowerCase()`. Applied at `upsertEntity` boundary. NFKC Unicode normalization NOT applied in v1.0 (uncommon case, deferred).
- **D-104:** **Schema migration `002-entity-display-name.sql`:**
  ```sql
  -- 002-entity-display-name.sql
  ALTER TABLE entities ADD COLUMN display_name TEXT;
  ALTER TABLE sessions ADD COLUMN source_hash TEXT;

  -- Backfill display_name for any pre-existing entities (Phase 36 auto-capture
  -- may have created entities before Phase 38 lands) with name itself
  UPDATE entities SET display_name = name WHERE display_name IS NULL;
  ```
  `entities.name` semantics become "normalized name (UNIQUE key)". `display_name` is first-seen original casing, never updated on subsequent upserts (stable display string).
- **D-105:** **`upsertEntity` API update** (Phase 35 D-45 refinement):
  ```ts
  upsertEntity(rawName: string, type: string): number {
    const normalized = rawName.trim().toLowerCase();
    const display = rawName.trim();
    // INSERT ... ON CONFLICT(name) DO UPDATE SET last_updated = now
    // Only sets display_name on INSERT, not on UPDATE (first-seen wins)
  }
  ```
- **D-106:** **Observations API unchanged:** `observations.entities` JSON still stores integer entity IDs (Phase 35 D-44). Entity names resolved via JOIN on `entities.id` when needed.
- **D-107:** Acceptance of **residual duplicates:** 'Claude Code' and 'CC' remain 2 separate entities unless normalization happens to make them match (it doesn't — lowercase forms are different). A v1.1+ `merge-entities` tool will handle this. Search queries finding both are expected to be manual.

### Integration Touchpoints (D-108 … D-109)
- **D-108:** **`bin/cli.mjs` route** — same pattern as Phase 37 MCP:
  ```js
  case 'migrate': {
    const migrate = await import(path.join(__dirname, '..', 'packages', 'cds-migrate', 'dist', 'cli.js'));
    await migrate.main(args);
    break;
  }
  ```
- **D-109:** **`packages/cds-migrate/package.json`** adds dependencies on `@cds/core` (`workspace:*`) for `dispatchAgent`, `openSessionsDB`, `buildExtractionPrompt`. No new external deps beyond what cds-core already ships.

### Claude's Discretion
- Exact markdown parser: does Phase 38 pre-parse `## Что сделано` / `## Решения` headers for structure, or feed the whole file to Haiku? Planner decides based on quality testing (start with whole file, add structural hints if Haiku quality is poor).
- Token estimation formula for dry-run (approximate: `bytes / 4` for Latin, `bytes / 2` for Cyrillic/mixed — planner tunes).
- Max retries per file on Haiku API errors (default: 1 retry, then skip).
- `--max-cost N` flag format (default $0.30, float).
- Whether the normalization rule `name.trim().toLowerCase()` also collapses internal whitespace (planner decides — minor).
- Exit code when `--apply` has any failures (planner picks: 0 if ≥80% succeeded, 1 otherwise, OR always 0 for "try again later" semantics).

### Folded Todos
- **"Backfill script for migration existing 30+ markdown sessions via Haiku entity extraction"** (from session TODO 2026-04-16): folded into the Phase 38 scope. This IS that task, formalized as a GSD phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §MIGRATE-01, MIGRATE-02 — acceptance (idempotent, dry-run first, estimated cost shown, <$0.50 for 30 sessions)
- `.planning/ROADMAP.md` §"Phase 38: Backfill Migration" — Success Criteria 1-4

### Prior Phase Contexts (carry-forward) — MANDATORY reads
- `.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md` — dispatchAgent contract (D-17), cost tracking (D-28), session_id threading
- `.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md` — sessions.ts API, schema (D-43..D-47), migration runner (D-36..D-39). Phase 38 adds a migration 002-entity-display-name.sql which MUST fit the forward-only runner semantics.
- `.planning/phases/36-auto-session-capture/36-CONTEXT.md` — `buildExtractionPrompt`, `emit_observations` tool, observation types (D-55..D-59). Phase 38 extends this module, NOT duplicates it.
- `.planning/phases/33-monorepo-foundation/33-CONTEXT.md` — @cds/migrate scaffold, package naming, TS NodeNext, root package.json bin preservation (D-03)

### External Documentation (research phase)
- https://docs.anthropic.com/claude/docs/extracting-structured-data — Haiku extraction patterns
- SQLite ON CONFLICT / UPSERT — https://sqlite.org/lang_upsert.html
- Node.js built-in crypto for sha256 — https://nodejs.org/api/crypto.html
- `prompts` lib for --apply confirmation (existing CDS dep)

### Existing Code (Phase 38 reads only, does not modify)
- `vault/projects/claude-dev-stack/sessions/*.md` — 37 files to be backfilled (read-only, markdown preserved)
- `hooks/session-start-context.sh` — SessionStart hook (untouched by Phase 38)

### Existing Code (Phase 38 modifies)
- `bin/cli.mjs` — surgical case addition
- `@cds/core/src/capture/prompts.ts` — add `mode` parameter + backfill preamble
- `@cds/core/src/vault/migrations/` — add `002-entity-display-name.sql`
- `@cds/core/src/vault/sessions.ts` — `upsertEntity` signature update (see D-105)
- `NOTICES.md` — no new entries (cds-migrate has no new runtime deps)

</canonical_refs>

<code_context>
## Existing Code Insights

### Session log format (scout findings)
- 37 files in `vault/projects/claude-dev-stack/sessions/*.md`
- Average size: ~3 KB per file
- Convention: `# Session: YYYY-MM-DD — Title` header; `## Что сделано` (Russian) section listing actions; `## Решения` (Russian, Decisions) section
- Mixed-language content (Russian user prose + English code/commands/proper nouns)
- No strict structure — Haiku must handle loose format

### Primitives consumed
- `@cds/core/dispatchAgent` (Phase 34) — Haiku model, tool_use, AbortSignal
- `@cds/core/CostTracker` (Phase 34) — per-session cost accumulation
- `@cds/core/openSessionsDB` (Phase 35) — write target
- `@cds/core/capture/prompts.buildExtractionPrompt` (Phase 36) — extended with `mode`
- `@cds/core/capture/types` (Phase 36) — `EmitObservationsInput` type

### New files (Phase 38)
- `packages/cds-migrate/src/sessions-md-to-sqlite.ts` — core migrator
- `packages/cds-migrate/src/cli.ts` — CLI runner (flag parsing, output formatting)
- `packages/cds-migrate/src/token-estimate.ts` — dry-run cost estimator
- `packages/cds-migrate/src/*.test.ts` — unit tests (fixture markdown, mock dispatchAgent)
- `@cds/core/src/vault/migrations/002-entity-display-name.sql` — schema migration

### Modified files
- `bin/cli.mjs` — add `case 'migrate':`
- `@cds/core/src/capture/prompts.ts` — add `mode` param + backfill preamble (D-91/D-92)
- `@cds/core/src/vault/sessions.ts` — `upsertEntity` normalization (D-105)
- `@cds/core/src/vault/index.ts` — no change (upsertEntity signature changes are backward-compatible at the type level)
- `packages/cds-migrate/package.json` — add `"dependencies": { "@cds/core": "workspace:*" }`

### Integration Points
- `bin/cli.mjs` → `packages/cds-migrate/dist/cli.js` (dynamic import)
- cli.ts → sessions-md-to-sqlite.ts (library)
- sessions-md-to-sqlite.ts → `@cds/core/capture` + `@cds/core/vault` (workspace deps)

### Constraints to Factor Into Planning
- Tests MUST NOT hit live API — mock `dispatchAgent` in all unit tests. INTEGRATION=1 gate applies for the one real-SDK test.
- Real vault MUST NOT be touched in tests — fixture markdown in `tests/fixtures/backfill/*.md` + `tmpdir()` for SQLite.
- Cost estimation should err on the HIGH side (users prefer underspending over sticker shock).
- 37 files sequential = ~60 seconds (Haiku ~1.5s per call). No parallel dispatch in v1.0 — simpler, predictable rate limit behavior. Parallel-N deferred to v1.1+.
- Schema migration 002 affects Phase 36 auto-capture already-running (if it captured entities before Phase 38 lands). Migration runner handles this gracefully via `UPDATE entities SET display_name = name WHERE display_name IS NULL` (D-104).

</code_context>

<specifics>
## Specific Ideas

- Session ID prefix `backfill-` (D-94) is a deliberate signal — future queries (`sessions.search`) can filter `WHERE id LIKE 'backfill-%'` to scope to historical data. Live captures use UUIDs, so no collision.
- The hash column addition (D-95) is the reason Phase 38 ships a schema migration despite "just" being a migrator CLI. Adding backfill detection properly requires persistent state.
- Per-session transactions (D-100) are the MIGRATE-01 acceptance "idempotent re-run is a no-op" in practice: a failed file never contaminates a successful one.
- Backfill preamble (D-92) is deliberately terse — heavy prompt engineering can come later; the key signal is "don't fabricate".
- Normalization rule (D-103) is minimal intentionally — full Unicode NFKC + synonym resolution is a rabbit hole. `trim().toLowerCase()` covers 95% of real overlap at ~zero risk.

</specifics>

<deferred>
## Deferred Ideas

### For Phase 39 (Alpha Release)
- `/cds-quick` demo queries backfilled data to showcase MCP integration.
- Migration guide entry: "After upgrading to v1.0 alpha, run `claude-dev-stack migrate sessions` to import your historical sessions."

### For v1.1+
- `claude-dev-stack migrate merge-entities` — LLM-assisted entity deduplication (merges 'Claude Code' ↔ 'CC').
- Parallel-N Haiku dispatch for faster bulk migration (respects API rate limits via concurrency cap).
- Cross-project backfill: `claude-dev-stack migrate sessions --all-projects` iterates over every vault project.
- Incremental mode: watch `vault/projects/*/sessions/` for new markdown files and auto-ingest (bridge for users who don't enable auto-capture).
- Markdown → markdown-with-session-id annotation — write a reference back into the markdown file after successful migration so users can see linkage.
- Decisions migration (`vault/projects/*/decisions/*.md` → SQLite) as separate phase; different content shape than sessions.

### Reviewed Todos (not folded)
- None — `todo match-phase 38` returned zero matches; the session TODO "backfill migration via Haiku" was already folded into the Phase 38 scope at roadmap creation time.

</deferred>

---

*Phase: 38-backfill-migration*
*Context gathered: 2026-04-16*
