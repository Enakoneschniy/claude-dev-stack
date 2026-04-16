# Phase 38: Backfill Migration — Research

**Researched:** 2026-04-16
**Researcher:** gsd-phase-researcher (inline via plan-phase orchestrator)
**Scope:** Haiku extraction patterns for mixed-language prose, SQLite ON CONFLICT/UPSERT idempotency, SHA-256 hashing + content-hash idempotency, Phase 35/36 API integration, forward-only migration runner extension, CLI UX (dry-run tables, confirmation, streaming), per-session transactional apply, token estimation for cost budget, validation architecture.

---

## 1. Haiku Entity-Extraction Patterns (mixed-language prose)

### 1.1 Source-data characteristics (scout findings)

37 markdown files under `/Users/eugenenakoneschniy/vault/projects/claude-dev-stack/sessions/*.md`:
- Total bytes: ~277 KB (mean ~7.5 KB; min ~2.7 KB; max ~20 KB).
- Structure pattern: `# Session: YYYY-MM-DD — <title>` header, then sections `## Что сделано`, `## Решения`, `## TODO на следующую сессию`, `## Проблемы`, `## Изменённые файлы` (Russian).
- Content mix: Russian prose + English code, commands, PR numbers, package names, file paths, proper nouns. UTF-8 throughout.
- No strict schema — sections may be missing, reordered, or renamed (e.g., `## Что сделано`, `## What was done`, `## Done`). Variance confirmed across the 37-file sample.

### 1.2 Reuse Phase 36 `buildExtractionPrompt` — do NOT duplicate (D-91..D-93)

Phase 36 ships `@cds/core/src/capture/prompts.ts` that exports `buildExtractionPrompt({ mode, input })` where:
- Core tool schema (`emit_observations`): an MCP-style tool definition that forces Haiku to emit structured observations. Signature: `{ observations: [{ type, content, entities: [{name, type}] }] }`. Shape is IDENTICAL for `mode: 'transcript'` and `mode: 'backfill'` so `observations` rows in the DB are polymorphic across capture sources.
- Mode preamble: a short instruction text prepended to the user prompt. Switches tone/expectations per mode.

Phase 38 extends Phase 36's module at minimum in 2 places:
1. Widens the `mode` type: `mode: 'transcript'` → `mode: 'transcript' | 'backfill'`.
2. Adds a `backfill` preamble branch returning the D-92 text verbatim (prepended to the user prompt, NOT the system prompt, so it reads as "ADDITIONAL INSTRUCTIONS" layered on the existing extraction guidance).

Phase 36 does NOT ship at Phase 38 planning time (per STATE.md — all phases 34-37 are planned but unexecuted). This creates a **cross-phase integration coupling**: Phase 38 executor MUST verify that Phase 36's executed prompts.ts matches the planned D-55..D-59 shape, and if not, must first extend Phase 36 — NOT fork its own module.

### 1.3 Backfill preamble (D-92 verbatim)

```
You are processing a human-written session summary, not a live transcript.
The author has already distilled the session into prose. Extract ONLY decisions,
blockers, todos, and entities that are EXPLICITLY stated. Do not infer file touches
from casual prose mentions. Do not fabricate observations. If the summary is thin,
return few observations — low recall is acceptable; low precision is not.
```

This text is locked in CONTEXT.md. Planner MUST include it as a string constant (not paraphrased).

### 1.4 Observation types (inherited from Phase 36)

Per Phase 36 D-55..D-59, the canonical observation types are:
- `decision` — locked choice or rejected alternative
- `blocker` — issue that halts progress
- `todo` — deferred work item
- `file_touch` — file created or modified
- `insight` — non-trivial learning or pattern discovered

Phase 38's backfill preamble explicitly tells Haiku NOT to infer `file_touch` from prose mentions — that's a low-precision failure mode. Only `## Изменённые файлы` sections produce `file_touch` observations reliably.

### 1.5 Whole-file-vs-preprocessed tradeoff (Claude's Discretion)

Two paths:
- **(A) Whole-file input:** pass the entire markdown to Haiku as the user prompt. Simpler; Haiku handles structure internally. ~800-2000 input tokens per file depending on size.
- **(B) Pre-parsed sections:** split on `##` headers, pass each section tagged (e.g., `<section name="decisions">...</section>`). Lower tokens (~500-1500) but brittle against off-spec headers.

**Resolution:** start with (A) in Plan 2. If quality regression evidence emerges (≥3 files with zero observations yet non-trivial content), add (B) preprocessor in a follow-up iteration. The markdown is small enough that Haiku's context is never at risk.

### 1.6 Claude Agent SDK dispatch call shape (Phase 34 contract)

Phase 34 D-17 defines `dispatchAgent({ model, prompt, system?, tools? })` returning `{ output: string, tokens: { input, output }, cost_usd }`. Phase 38 call pattern:

```ts
const { systemPrompt, userPrompt, tools } = buildExtractionPrompt({ mode: 'backfill', input: markdown });
const result = await dispatchAgent({
  model: 'claude-haiku-4-5',  // per Phase 34 D-28 pinned model
  system: systemPrompt,
  prompt: userPrompt,
  tools,  // emit_observations tool schema from Phase 36
});
// result.output is the JSON payload from the emit_observations tool call
const parsed = JSON.parse(result.output) as EmitObservationsInput;
const cost = result.cost_usd;  // for progress output
```

`tokens` and `cost_usd` are threaded into the per-session transaction for progress/report output (D-101).

### 1.7 Haiku error classes to handle

Phase 34's `dispatchAgent` surfaces the SDK's error types. Relevant failure modes:
- **API rate limit** (HTTP 429): transient — 1 retry with 2s delay (D-99 "Claude's Discretion" default).
- **API 5xx**: transient — 1 retry with 2s delay.
- **Validation error** (invalid tool call): non-transient — log + skip file.
- **Timeout** (AbortSignal expires): transient — 1 retry.
- **Non-retryable (400, 401, 403)**: escalate — print message, continue to next file (do NOT retry).

Maximum 1 retry per file — simple and predictable at v1.0. Parallel-N + exponential backoff deferred to v1.1+.

---

## 2. SQLite ON CONFLICT / UPSERT — entities + sessions idempotency

### 2.1 `entities` UPSERT semantics (D-104..D-105)

After migration `002-entity-display-name.sql` lands, the `entities` table has columns:
- `id INTEGER PRIMARY KEY`
- `name TEXT UNIQUE NOT NULL` — normalized (`trim().toLowerCase()`), the UNIQUE key
- `display_name TEXT` — original casing, set on INSERT only, never on UPDATE
- `type TEXT`
- `first_seen DATETIME`
- `last_updated DATETIME`

Canonical UPSERT SQL:

```sql
INSERT INTO entities (name, display_name, type, first_seen, last_updated)
VALUES (?, ?, ?, datetime('now'), datetime('now'))
ON CONFLICT(name) DO UPDATE SET
  last_updated = datetime('now'),
  type = COALESCE(type, excluded.type)  -- fill type if previously NULL
RETURNING id;
```

Key semantics:
- `display_name` is NOT in the DO UPDATE set → first-seen casing wins (D-104).
- `type` is filled in via COALESCE only if it was NULL previously → prevents entity-type drift from later observations.
- `RETURNING id` lets the caller avoid a follow-up SELECT.

### 2.2 `upsertEntity(rawName, type)` TypeScript signature (D-105)

```ts
// Phase 35 shipped:
upsertEntity(name: string, type: string): number;

// Phase 38 changes to:
upsertEntity(rawName: string, type: string): number {
  const normalized = rawName.trim().toLowerCase();
  const display = rawName.trim();
  // ... prepare + .get() the statement with (normalized, display, type)
  return row.id;
}
```

Signature is **backward-compatible at the call site** — every existing caller passes a string into the first param. Internally, the function now normalizes before the UNIQUE key lookup. Callers who pre-normalized (none in current codebase per Phase 35 D-45) continue to work (second trim+lowercase is a no-op).

### 2.3 `sessions.id` idempotency + `source_hash` (D-94..D-97)

Sessions table (Phase 35 schema + migration 002):
- `id TEXT PRIMARY KEY` — UUID-shaped for live captures OR `backfill-<filename-no-ext>` for backfill
- `start_time DATETIME`
- `end_time DATETIME`
- `project TEXT`
- `summary TEXT`
- `source_hash TEXT NULL` (added by migration 002) — sha256 of source markdown for backfill; NULL for live

Idempotency algorithm per file (D-96):
```
id = 'backfill-' + basename(file, '.md')
hash = sha256(file_contents)
existing = SELECT source_hash FROM sessions WHERE id = ?
if (existing is null) → INSERT (migrate)
else if (existing.source_hash === hash) → SKIP silent (already migrated, content unchanged)
else if (existing.source_hash !== hash):
  if (--force-refresh) → DELETE cascade + re-migrate
  else → SKIP with warning
```

### 2.4 Per-session transaction (D-100)

better-sqlite3 transaction pattern (from Phase 35 established practice):

```ts
const migrateOne = db.transaction((file: FileInput) => {
  // 1. Delete prior rows if --force-refresh and they exist
  if (forceRefresh) {
    db.prepare('DELETE FROM observations WHERE session_id = ?').run(file.sessionId);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(file.sessionId);
  }
  // 2. Insert sessions row
  db.prepare('INSERT INTO sessions (id, start_time, end_time, project, summary, source_hash) VALUES (?,?,?,?,?,?)').run(...);
  // 3. Insert N observation rows (loop)
  // 4. Upsert M entities
  // 5. Insert K relations
});
try {
  migrateOne(parsedFile);
  return { status: 'success', observations: N, cost: $X };
} catch (err) {
  // Transaction auto-rolled back by better-sqlite3
  return { status: 'failed', reason: err.message };
}
```

This gives the ALL-OR-NOTHING-PER-FILE semantic without contaminating successful sessions. Critical for MIGRATE-01 "idempotent re-run is a no-op".

### 2.5 Cascade semantics

`observations` has FK on `sessions.id`. No ON DELETE CASCADE declared (Phase 35 baseline). Phase 38 MUST explicit-DELETE child rows before deleting sessions rows in `--force-refresh` path. Alternative: migration 002 COULD add `ON DELETE CASCADE` — but that's outside Phase 38 scope and a Phase 35 refactor. Explicit DELETE is simpler and safer.

The `entities` table is **not** deleted on `--force-refresh` — entities are shared across sessions. Re-migration recomputes upsertEntity calls for each observation; the UPSERT's `last_updated` field gets bumped. Zero data loss.

### 2.6 `observations.entities` JSON (D-106)

Phase 35 D-44 defines `observations.entities` as a JSON column containing integer entity IDs:
```json
[1, 7, 23]
```
Phase 38 resolves entities before inserting observations: each observation's entity name list → upsertEntity loop → array of IDs → JSON.stringify → bound param. Order within the JSON array is insertion order (preserved by better-sqlite3 JSON handling).

---

## 3. SHA-256 content hashing (Node built-in crypto)

### 3.1 Canonical API

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function hashFile(path: string): string {
  const buf = readFileSync(path);                         // Buffer (raw bytes)
  return createHash('sha256').update(buf).digest('hex');  // 64-char lowercase hex
}
```

Streaming vs one-shot: files are ≤20 KB each so one-shot readFileSync is fine. Streaming would add complexity for no measurable perf gain.

### 3.2 Deterministic vs normalized hashing

Option A: hash raw bytes including trailing newlines and Windows CRLF/LF differences.
Option B: normalize (strip trailing whitespace, normalize line endings) before hashing.

**Resolution:** Option A (raw bytes). Rationale:
- Markdown is hand-edited; any edit should trigger re-migration detection.
- Normalization adds surface area for false negatives (user edits content but hash matches → skipped).
- Raw-byte hash is transparent; a manual `shasum -a 256 file.md` produces the same value users can inspect in the CLI progress output.

Document in the summary block: "source_hash is a SHA-256 hex of the raw file bytes as returned by readFileSync."

---

## 4. Forward-only migration runner (Phase 35 integration)

### 4.1 Migration file naming + ordering

Phase 35 D-36..D-39 defines a runner that:
- Reads all `*.sql` files in `packages/cds-core/src/vault/migrations/`.
- Sorts alphabetically (lexicographic) by filename.
- Records applied filenames in a `schema_version` table with `(filename TEXT PRIMARY KEY, applied_at DATETIME)`.
- Runs only files NOT in `schema_version`.

Phase 38's file `002-entity-display-name.sql` sorts AFTER `001-initial-schema.sql` (the Phase 35 baseline). When Phase 35 runs on a fresh DB: executes 001 then 002. When Phase 35 runs on a Phase-36-live DB (where 001 already applied): executes only 002. Fully forward-only semantics.

### 4.2 SQL content (verbatim, per D-104 + D-95)

```sql
-- 002-entity-display-name.sql
-- Adds display_name to entities (first-seen original casing preserved).
-- Adds source_hash to sessions (sha256 for backfill idempotency).
--
-- Phase 35 "entities.name" becomes the normalized UNIQUE key (trim().toLowerCase()).
-- First-seen display_name backfilled with name itself for pre-existing entities.

ALTER TABLE entities ADD COLUMN display_name TEXT;
ALTER TABLE sessions ADD COLUMN source_hash TEXT;

-- Backfill display_name for entities created before Phase 38
-- (Phase 36 auto-capture may have seeded entities pre-migration).
UPDATE entities SET display_name = name WHERE display_name IS NULL;
```

No index needed on `sessions.source_hash` — only compared against a supplied string per session via `WHERE id = ?` path. Hash column is informational per row.

### 4.3 Idempotency of the migration itself

SQLite `ALTER TABLE ADD COLUMN` is idempotent per-run (the migration runner prevents re-execution via `schema_version`), but if the table were to be inspected manually, a second apply would throw `duplicate column name`. Phase 35's runner handles this via the `schema_version` sentinel check — Phase 38 does not introduce any new edge cases.

### 4.4 Downgrade story

Phase 35 is explicitly forward-only (no down migrations). Phase 38 respects this. If a future version needs to undo the column additions, a new forward migration (e.g., `003-drop-display-name.sql`) would drop and re-add without display_name. Acceptable for alpha.

---

## 5. CLI UX — dry-run table, confirmation, streaming progress

### 5.1 Dry-run table (D-98)

Fixed-width columns using `String.prototype.padEnd`. Column layout locked per CONTEXT.md:

```
#  Filename                                    Size    Tokens(est)  Cost(est)   Status
─  ──────────────────────────────────────────  ──────  ───────────  ──────────  ────────────
1  2026-04-09-sync-and-publish.md              2.9 KB      820        $0.014    will-migrate
```

Column widths (planner-locked):
- `#` — 3 chars (right-aligned)
- `Filename` — 44 chars (left-aligned, truncated with `...` suffix if longer than 44)
- `Size` — 6 chars (right-aligned, `X.X KB` format via `bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KB'`)
- `Tokens(est)` — 11 chars (right-aligned, no comma)
- `Cost(est)` — 10 chars (right-aligned, `$X.XXX` format)
- `Status` — 12 chars (left-aligned): `will-migrate` | `unchanged` | `hash-changed` | `error`

Header separator uses Unicode `─` (U+2500). Implementation: `'─'.repeat(width)` per column + 2-space gaps.

### 5.2 Token estimation formula (Claude's Discretion)

Per CONTEXT.md "Claude's Discretion": token estimation is planner-tunable. Starting formula:

```ts
function estimateTokens(markdown: string): number {
  // Cyrillic chars + English chars weighted separately.
  // Haiku tokenizer: ~1 token per 4 Latin chars, ~1 per 2.5 Cyrillic chars (empirical).
  const cyrillic = (markdown.match(/[\u0400-\u04FF]/g) ?? []).length;
  const latinAndOther = markdown.length - cyrillic;
  return Math.ceil(cyrillic / 2.5 + latinAndOther / 4);
}
```

### 5.3 Cost estimation

Haiku 4.5 pricing (per Phase 34 D-28, pinned model):
- Input: $1.00 per million tokens → $0.000001 per token
- Output: $5.00 per million tokens → $0.000005 per token

Output token estimate: fixed 100 tokens per file (typical `emit_observations` JSON payload size for these session logs — cross-checked against Phase 36 expected behavior). Upper bound: 200 tokens per file.

```ts
function estimateCost(inputTokens: number): number {
  const outputTokens = 200;  // upper bound (err on the HIGH side per CONTEXT.md constraint)
  return (inputTokens * 0.000001) + (outputTokens * 0.000005);
}
```

**Round up** to the nearest cent in the dry-run total display so users never see a lower estimate than actual cost.

### 5.4 Apply confirmation threshold (D-99)

```ts
const DEFAULT_MAX_COST = 0.30;
if (totalCost > maxCost) {
  // Use 'prompts' lib (single-dep CLI surface, Phase 33 D-03 preserved)
  const { proceed } = await prompts({ type: 'confirm', name: 'proceed', message: `Estimated cost: $${totalCost.toFixed(2)} — proceed?`, initial: false });
  if (!proceed) { console.log('Aborted.'); process.exit(0); }
}
```

`--max-cost N` flag overrides the default (float parsing via parseFloat).

### 5.5 Streaming per-file progress (D-101)

```
[1/37] 2026-04-09-sync-and-publish.md ... ✓ (5 observations, $0.015)
[2/37] 2026-04-10-parallel-discuss.md ... ✗ Haiku timeout (retry 1/1)
[2/37] 2026-04-10-parallel-discuss.md ... ✓ (4 observations, $0.014)
```

Output strategy:
- Write `[N/total] filename ... ` to stdout WITHOUT trailing newline.
- On success: append `✓ (N observations, $X.XXX)\n`.
- On retry: clear the line (ANSI `\r\x1b[2K`), re-print with `(retry 1/1)` suffix.
- On terminal failure: append `✗ <reason> — skipping\n`.

Non-TTY fallback: if `process.stdout.isTTY === false`, do NOT use `\r\x1b[2K`. Instead print each update on its own line. Avoids broken log files in CI.

### 5.6 Final summary block (D-101)

```
Migration complete:
  Succeeded: 35/37
  Failed:    2/37
  Total cost: $0.48 (estimated $0.52)

Failed files:
  - 2026-04-10-ship-nblm.md — Haiku API 500 (rate limit)
  - 2026-04-12-unrelated.md — sha256 mismatch, use --force-refresh

Re-run `claude-dev-stack migrate sessions --apply` to retry failed files.
```

Computed from an in-memory `results: Array<{ filename, status, reason?, cost? }>` accumulator.

### 5.7 Exit code (Claude's Discretion)

**Resolution:** exit 0 on any completion (success or partial failure). Rationale:
- `claude-dev-stack migrate sessions` is a user-facing iterative command; non-zero exit would break `prompts`/script pipelines that assume success-on-completion.
- Failed files are preserved in the results summary; user retries manually via re-run (D-102).
- Exit 1 reserved for hard errors (SQLite open failure, vault not found, invalid flags) — "migration never ran".
- Exit 2 reserved for user abort (Ctrl-C or `prompts` decline).

Documented in the CLI help text + SUMMARY.md.

---

## 6. `bin/cli.mjs` route (D-108)

### 6.1 Existing pattern (line 154)

```js
case 'mcp': {
  const { main } = await import('../lib/mcp.mjs');
  await main(args.slice(1));
  break;
}
```

### 6.2 Phase 38 addition

Insert a new case BEFORE `case 'sync'` (line 212) — alphabetical ordering convention is loose in this file, but "migrate" near "mcp" keeps related data-layer commands together:

```js
case 'migrate': {
  const { main } = await import('../packages/cds-migrate/dist/cli.js');
  await main(args.slice(1));
  break;
}
```

`args.slice(1)` drops the `migrate` token; subsequent args (e.g., `sessions --dry-run`) pass through. The `cds-migrate` package's CLI entrypoint is responsible for parsing `sessions` subcommand + flags (per Plan 3).

### 6.3 Phase 33 D-03 constraint

Root `package.json` `bin` field stays `{ "claude-dev-stack": "./bin/cli.mjs" }` — no new bin entries. The `migrate` subcommand is a dynamic import dispatched through the existing single binary.

---

## 7. Validation Architecture (Nyquist Dimension 8)

This section satisfies the Nyquist Dimension 8 validation contract for Phase 38.

### 7.1 Test isolation strategy

**Strict:** tests MUST NOT touch `~/vault` or `/Users/eugenenakoneschniy/vault`. Each test suite uses `mkdtempSync(join(tmpdir(), 'cds-migrate-test-'))` for fixture vaults + `:memory:` SQLite for DB.

**Fixture markdown:** hand-authored minimal session logs at `packages/cds-migrate/tests/fixtures/backfill/*.md`. At least 5 fixtures covering:
- `empty-sections.md` — header only, no body
- `russian-only.md` — Russian prose with `## Что сделано`
- `mixed-lang.md` — English + Russian + code snippets
- `bare-list.md` — no headers, just a bulleted list
- `large.md` — ≥5 KB for token estimation coverage

**dispatchAgent mock:** a shared `__fixtures__/mock-dispatch-agent.ts` that returns pre-canned `emit_observations` payloads keyed by input sha256. Forces deterministic test output.

### 7.2 Per-task validation matrix

| Subject | Validation Surfaces |
|---|---|
| `migrate-sessions` library entry (`migrateMarkdownSessions`) | (a) dry-run returns per-file size/tokens/cost without writing DB, (b) apply writes 1 session row per file + N observations + M entities + K relations, (c) re-apply on unchanged hash is a no-op (no new rows), (d) re-apply on changed hash with `forceRefresh: false` returns status `hash-changed` + skip, (e) with `forceRefresh: true` deletes + re-inserts, (f) per-file transaction rolls back on dispatch error (no orphan rows), (g) total cost accumulates correctly |
| `buildExtractionPrompt({ mode: 'backfill', input })` | (a) returns backfill preamble verbatim (D-92), (b) core tool schema unchanged from `mode: 'transcript'`, (c) non-backfill modes reject unknown mode string |
| `upsertEntity` (Phase 35 amend) | (a) `upsertEntity('Claude Code', 'agent')` → new row, display_name='Claude Code', name='claude code', (b) second call with 'CLAUDE CODE' → same id returned (same normalized), display_name unchanged, (c) raw name with whitespace `  Foo  ` → display='Foo', name='foo', (d) empty string after trim → throws InvalidArgumentError (preserving Phase 35 contract) |
| Migration `002-entity-display-name.sql` | (a) applies on fresh DB (fresh baseline, Phase 35 `001-initial-schema.sql` ran first), (b) applies on mid-Phase-36 DB with pre-existing entities (display_name backfilled to name value), (c) idempotent (second attempt silently skipped by schema_version sentinel) |
| SHA-256 hashing | (a) stable across runs (same file → same hex), (b) differs on 1-byte change, (c) file not found → throws ENOENT, (d) empty file → hex of sha256 of empty buffer |
| Token estimation | (a) English-only input → 1 token / 4 chars ±10%, (b) Russian-only input → 1 token / 2.5 chars ±10%, (c) empty input → 0 tokens, (d) mixed content weighted correctly |
| CLI flag parsing (`migrate sessions [--dry-run] [--apply] [--force-refresh] [--max-cost N]`) | (a) `--dry-run` and `--apply` mutually exclusive (error if both), (b) no flag → default to `--dry-run`, (c) `--force-refresh` without `--apply` → error, (d) `--max-cost 0.50` parses, (e) `--max-cost invalid` rejected with clear error |
| Dry-run output rendering | (a) table columns aligned to widths per §5.1, (b) total row shows sum of sizes + tokens + cost, (c) zero files → "No sessions found in vault/projects/{name}/sessions/" + exit 0 |
| Apply confirmation (`prompts` lib) | (a) below maxCost → no prompt, proceed directly, (b) above maxCost → prompt shown, reject → exit 2, accept → proceed, (c) non-TTY environment (CI) → fails loudly rather than hanging (prompts lib default behavior) |
| Streaming progress output | (a) TTY path uses `\r\x1b[2K` for retry line-clearing, (b) non-TTY path writes one line per update, (c) success markers (`✓`) + failure markers (`✗`) in final summary |
| `bin/cli.mjs` dispatch | (a) `claude-dev-stack migrate sessions --dry-run` routes to packages/cds-migrate/dist/cli.js `main(['sessions', '--dry-run'])`, (b) `claude-dev-stack migrate` (no subcommand) surfaces help + exit 1, (c) Regression: `claude-dev-stack mcp` still routes to `lib/mcp.mjs` (no collision) |
| End-to-end smoke (integration, `INTEGRATION=1` gate) | (a) real dispatchAgent against live Haiku with 1 fixture file; asserts DB has 1 session + ≥1 observation + cost > 0 |

### 7.3 Wave 0 (infrastructure) requirements

- `packages/cds-migrate/tests/fixtures/backfill/` directory with 5 fixture markdown files (§7.1).
- `packages/cds-migrate/tests/fixtures/mock-dispatch-agent.ts` shared mock (§7.1).
- `packages/cds-migrate/tests/helpers/temp-vault.ts` — per-test tmpdir + fixture copy helper.
- `packages/cds-migrate/vitest.config.ts` — extends root shared config (Phase 33 MONO-03).
- `CDS_TEST_VAULT` env override honored by migrator (mirrors Phase 37 pattern).

### 7.4 Coverage exit criteria

- All tasks have automated verify or Wave-0 fixture dep.
- Full suite runtime <30s on developer machine (tolerates real Haiku smoke skipped by default).
- No file-watch-mode defaults (all tests invoked via `vitest run`).
- Feedback latency <10s per targeted file, <25s per package.

---

## 8. Cross-phase coordination — Phase 35 `upsertEntity` amendment

Phase 38 MUST NOT fork or duplicate `upsertEntity`. The amendment in D-105 is a **direct edit to Phase 35's sessions.ts** because the Phase 35 shipped API currently stores whatever raw name it gets into `entities.name`. Without the normalization edit, backfill would insert `'Claude Code'` and `'CC'` (both trim-lowercased to different strings — still duplicates) which is the D-107 accepted residual.

Critical: when executing Phase 38, confirm Phase 35 sessions.ts is already on disk. If Phase 35 has not yet executed, Phase 38 cannot start — the executor MUST surface this as a STATE.md blocker and exit. This dependency is declared in ROADMAP.md "Depends on: Phase 34 + Phase 35" and carried into Plan 01 wave/depends_on gates.

Plan 01 owns the sessions.ts edit (amending Phase 35 in-place is a two-line diff: normalize + persist display_name). Plan 02 consumes the amended signature.

---

## 9. Existing code references consulted

- `bin/cli.mjs` line 154 (`case 'mcp':`) + line 212 (`case 'sync':`) — the canonical dynamic-import dispatch pattern to mirror for `case 'migrate':` (D-108).
- `packages/cds-migrate/package.json` — already declares `@cds/core: workspace:*` (D-109 pre-satisfied at Phase 33 scaffold).
- `packages/cds-migrate/src/index.ts` — Phase 33 stub to be overwritten by Plan 02.
- `packages/cds-migrate/src/index.test.ts` — Phase 33 placeholder; Plan 02 replaces with real unit tests.
- Phase 37's completed plans (`37-01-PLAN.md`..`37-04-PLAN.md`) — structural template for this phase's PLAN.md shapes (frontmatter fields, acceptance criteria style, task numbering).
- Phase 37 `37-VALIDATION.md` — template for this phase's validation strategy format.
- Phase 33 CONTEXT D-03 — locks root `package.json` `bin` field to the single `claude-dev-stack` binary; Phase 38 respects.
- `/Users/eugenenakoneschniy/vault/projects/claude-dev-stack/sessions/*.md` — the 37 real files; read-only in Phase 38.

---

## 10. Open questions resolved (from CONTEXT.md "Claude's Discretion")

| Question | Resolution |
|---|---|
| Pre-parse markdown or feed whole file to Haiku | Whole-file in v1.0 (§1.5). Revisit in v1.1 if quality regresses. |
| Token estimation formula | Weighted Cyrillic vs Latin (§5.2). Starts at 1:2.5 Cyrillic, 1:4 Latin. |
| Max retries on Haiku errors | 1 retry with 2s delay (§1.7). |
| `--max-cost N` format | Float via parseFloat; default $0.30; must be positive (§5.4). |
| Normalize internal whitespace | No — `trim().toLowerCase()` only (per D-103 strict reading). Internal whitespace collapse out of scope for v1.0. |
| Exit code on partial failures | 0 (§5.7). Reserve 1 for hard errors, 2 for user abort. |

---

## RESEARCH COMPLETE
