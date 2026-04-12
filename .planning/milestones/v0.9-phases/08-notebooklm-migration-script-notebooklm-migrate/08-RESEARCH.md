# Phase 8: NotebookLM Migration Script (`notebooklm migrate`) - Research

**Researched:** 2026-04-12
**Domain:** NotebookLM two-phase migration orchestration (ESM, Node 18+, no new deps)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Per-source granularity: upload source → verify title match via `listSources()` → mark 'verified' → next source. NOT per-project batch.
- **D-02:** Verification = title match only. `listSources()` in target notebook, find source with expected title. Title match is sufficient.
- **D-03:** Phase B (delete from shared) starts ONLY after Phase A reports zero failures across ALL sources. Any single failure → Phase B skipped entirely, shared notebook untouched.
- **D-04:** Orphan sources (title without recognizable `{project}__` prefix) → skip + `warn()`, status `skipped_orphan`. Stay in shared notebook for manual resolution.
- **D-05:** Duplicate detection: if source title already exists in target notebook → skip upload, mark `verified` immediately. Idempotent on re-run.
- **D-06:** Migration log at `~/vault/.notebooklm-migration.json` written via `atomicWriteJson()` after every state transition. Per-source shape: `{source_id, title, old_notebook_id, new_notebook_id, target_project, status: pending|uploaded|verified|deleted|skipped_orphan}`.
- **D-07:** Dry-run grouped by target project: `cds__alpha (3 sources): file1.md, file2.md, file3.md`. Summary at end: total sources, per-project counts, orphan count. No JSON, no flat table.
- **D-08:** Fixed 1-2s delay between each upload and delete operation.
- **D-09:** Smoke test = manual pre-merge on burner notebook with 2-3 sources. NOT automated in CI.

### Claude's Discretion

- Exact delay value (1s vs 2s) — tune based on smoke test results
- Migration log pretty-print formatting
- Progress indicator during execute mode (spinner vs percentage vs source count)
- Error message wording for partial failures

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NBLM-V2-05 | User can run `claude-dev-stack notebooklm migrate` to relocate existing 27 sources from shared `claude-dev-stack-vault` notebook into per-project `cds__{slug}` notebooks. Default `--dry-run`; `--execute` explicit opt-in. `lib/notebooklm-migrate.mjs` only orchestrates existing `lib/notebooklm.mjs` primitives. | CLI dispatch wired via `notebooklm-cli.mjs` `main()` switch case; `migrate` subcommand dispatches to `lib/notebooklm-migrate.mjs::migrateVault()`. Primitives fully cover what's needed — see Standard Stack. |
| NBLM-V2-06 | Two-phase migration: Phase A uploads + verifies round-trip via `listSources()` title match; Phase B deletes shared sources only if Phase A reports zero failures. Shared notebook never auto-deleted. Idempotent resume on re-run. | `listSources()`, `uploadSource()`, `deleteSourceByTitle()` are verified in codebase. Resume via migration log `status` field read before each source. Duplicate skip via D-05. |
| NBLM-V2-07 | User audits via `~/vault/.notebooklm-migration.json` with per-source status entries. | `atomicWriteJson()` from `lib/shared.mjs` is verified present and tested. Migration log path resolves via `findVault()` + fixed filename. |
| TEST-03 | Full fixture matrix: empty notebook, 27-source real-shape fixture, partial-failure mid-project, duplicate target slug, orphan source. Real-notebook smoke test pre-merge. | `withStubBinary()` from `tests/helpers/fixtures.mjs` is the established pattern. `_resetBinaryCache()` is exported from `lib/notebooklm.mjs`. Stubs via `case "$1" in` shell dispatch. |
</phase_requirements>

---

## Summary

Phase 8 delivers `lib/notebooklm-migrate.mjs` — a one-shot orchestrator that reads the shared `claude-dev-stack-vault` notebook via `listSources()`, groups sources by `{project}__` title prefix, uploads each to its target `cds__{slug}` notebook, verifies round-trip, and (only on Phase A zero-failures) deletes from the shared notebook. All mutations are logged atomically to `~/vault/.notebooklm-migration.json` after every state transition.

The module is pure orchestration: it imports the six public functions from `lib/notebooklm.mjs` (already verified in codebase) plus `_ensureNotebook` pattern from `lib/notebooklm-sync.mjs`, `atomicWriteJson` from `lib/shared.mjs`, and `findVault` from `lib/projects.mjs`. No new primitives, no new dependencies, zero diff to `lib/notebooklm.mjs`.

CLI dispatch is a one-line addition to `lib/notebooklm-cli.mjs::main()` — adding `case 'migrate':` to the existing switch and updating `printNotebooklmHelp()`. The test suite follows the `withStubBinary` + `_resetBinaryCache` pattern established in Phase 7 tests, covering 5 fixture scenarios. Test baseline going into Phase 8 is 345 (verified by `npm test` run).

**Primary recommendation:** Two plans: (1) `lib/notebooklm-migrate.mjs` core logic + migration log + CLI dispatch; (2) test fixture matrix + help text + pre-merge smoke test checklist.

---

## Standard Stack

### Core (all verified in codebase)

| Asset | Location | Purpose | Source |
|-------|----------|---------|--------|
| `listNotebooks()` | `lib/notebooklm.mjs:550` | Enumerate all notebooks, find shared source notebook by ID | [VERIFIED: codebase read] |
| `listSources(notebookId)` | `lib/notebooklm.mjs:341` | Returns `[{id, title, status}]` — Phase A scan + Phase A verify + duplicate check | [VERIFIED: codebase read] |
| `uploadSource(notebookId, filepath, {title})` | `lib/notebooklm.mjs:385` | Upload file with explicit title via cp-to-tmp workaround | [VERIFIED: codebase read] |
| `deleteSourceByTitle(notebookId, title)` | `lib/notebooklm.mjs:475` | Phase B delete from shared notebook by title | [VERIFIED: codebase read] |
| `_ensureNotebook` (pattern) | `lib/notebooklm-sync.mjs:196` | Ensure `cds__{slug}` exists, returns ID. Called once per project before upload loop. | [VERIFIED: codebase read] |
| `atomicWriteJson(path, obj)` | `lib/shared.mjs:134` | Atomic migration log writes (temp + rename) | [VERIFIED: codebase read] |
| `findVault()` | `lib/projects.mjs` | Resolve vault root for migration log path | [VERIFIED: codebase read] |
| `NotebooklmCliError`, `NotebooklmRateLimitError`, `NotebooklmNotInstalledError` | `lib/notebooklm.mjs` | Error class hierarchy for per-source failure handling | [VERIFIED: codebase read] |
| `_resetBinaryCache()` | `lib/notebooklm.mjs:147` | Test-only: reset binary detection between stubs | [VERIFIED: codebase read] |
| `withStubBinary(name, script, fn)` | `tests/helpers/fixtures.mjs:100` | Stub `notebooklm` binary on PATH for test isolation | [VERIFIED: codebase read] |
| `makeTempVault()` | `tests/helpers/fixtures.mjs:12` | Create temp vault structure for tests | [VERIFIED: codebase read] |

### No new npm dependencies

Single-dep constraint (`prompts@^2.4.2` only) is a hard project constraint. Phase 8 uses only `node:fs`, `node:path`, `node:os` builtins plus existing project modules. [VERIFIED: CLAUDE.md + REQUIREMENTS.md out-of-scope list]

---

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── notebooklm-migrate.mjs    # NEW — two-phase migration orchestrator
lib/notebooklm-cli.mjs        # MODIFIED — add 'migrate' case to main() switch
tests/
├── notebooklm-migrate.test.mjs  # NEW — full fixture matrix
```

No other files modified. `lib/notebooklm.mjs` diff = ZERO lines (D-03 boundary). [VERIFIED: codebase read]

### Pattern 1: Source Title Prefix Parsing

Sources in the shared notebook carry titles like `{project}__filename.md`. The migration must group by slug, then determine target notebook.

```javascript
// Source: CONTEXT.md §code_context + notebooklm-sync.mjs title conventions
// Splits "alpha__context.md" -> { slug: 'alpha', localTitle: 'context.md' }
function parseSourceTitle(title) {
  const idx = title.indexOf('__');
  if (idx === -1) return null; // orphan — no recognizable prefix
  const slug = title.slice(0, idx);
  const localTitle = title.slice(idx + 2);
  return { slug, localTitle };
}
```

[VERIFIED: codebase read — `buildTitle` in notebooklm-sync.mjs uses `{projectSlug}__${basename}` for non-scoped titles; `{project}__` split is the reverse operation]

### Pattern 2: Migration Log Shape and Write Pattern

```javascript
// Source: D-06 from CONTEXT.md + atomicWriteJson from lib/shared.mjs
// Written after EVERY state transition (pending → uploaded → verified → deleted)
const entry = {
  source_id: 'abc-123',
  title: 'alpha__context.md',
  old_notebook_id: '5d848dd8-4871-49a2-9ad4-f4b1c2c2a48a',
  new_notebook_id: 'nb-cds-alpha',
  target_project: 'alpha',
  status: 'pending' // | 'uploaded' | 'verified' | 'deleted' | 'skipped_orphan'
};
// atomicWriteJson writes the ENTIRE log object atomically, not individual entries
atomicWriteJson(migrationLogPath, { sources: allEntries, migratedAt: new Date().toISOString() });
```

[VERIFIED: atomicWriteJson signature confirmed at lib/shared.mjs:134; D-06 shape from CONTEXT.md]

### Pattern 3: Resume / Idempotency via Migration Log

```javascript
// On re-run: read existing migration log, skip sources already 'verified' or 'deleted'
// Source: D-05 (duplicate skip) + D-06 (log persistence)
const existing = existsSync(logPath) ? JSON.parse(readFileSync(logPath)) : { sources: [] };
const bySourceId = Object.fromEntries(existing.sources.map(e => [e.source_id, e]));
// When iterating shared notebook sources:
if (bySourceId[src.id]?.status === 'verified') continue; // already done
if (bySourceId[src.id]?.status === 'deleted') continue;  // already done
```

[VERIFIED: D-05 + D-06 from CONTEXT.md; existsSync pattern from shared.mjs conventions]

### Pattern 4: Phase B Gate — Zero Failures Required

```javascript
// Source: D-03 from CONTEXT.md
// Phase A: collect all results
const phaseAResults = []; // { source_id, status: 'verified' | 'failed' | 'skipped_orphan' }
// After Phase A loop:
const failures = phaseAResults.filter(r => r.status === 'failed');
if (failures.length > 0) {
  warn(`Phase B skipped — ${failures.length} Phase A failure(s). Shared notebook untouched.`);
  return;
}
// Phase B: delete from shared
for (const entry of logEntries.filter(e => e.status === 'verified')) {
  await deleteSourceByTitle(sharedNotebookId, entry.title);
  // update log entry to 'deleted', atomicWriteJson after each
  await sleep(delayMs); // D-08 fixed delay
}
```

[VERIFIED: D-03 + D-08 from CONTEXT.md]

### Pattern 5: withStubBinary Shell Script for Migration Tests

The established test pattern from Phase 7. The stub must handle all notebooklm commands the migrate module invokes.

```javascript
// Source: tests/notebooklm-sync-per-project.test.mjs (verified pattern)
withStubBinary('notebooklm', `
case "$1" in
  list)   echo '{"notebooks":[{"id":"shared-nb","title":"claude-dev-stack-vault","created_at":null}],"count":1}' ;;
  source)
    case "$2" in
      list)   echo '{"sources":[{"id":"s1","title":"alpha__context.md","status":"ready"},{"id":"s2","title":"orphan.md","status":"ready"}]}' ;;
      add)    echo '{"source":{"id":"new-src","title":"context.md"}}' ;;
      delete-by-title) echo 'Deleted source: s1' ;;
    esac
    ;;
  create) echo "{\\"notebook\\":{\\"id\\":\\"nb-$2\\",\\"title\\":\\"$2\\",\\"created_at\\":null}}" ;;
  *) echo '{}' ;;
esac
`, (stubDir) => {
  // ... test assertions
});
```

[VERIFIED: tests/notebooklm-sync-per-project.test.mjs:66-118 — direct pattern match]

### Pattern 6: CLI Dispatch — Adding `migrate` to notebooklm-cli.mjs

```javascript
// Source: lib/notebooklm-cli.mjs:32-51 — existing switch pattern
export async function main(args = []) {
  const sub = args[0];
  switch (sub) {
    case 'sync':   return runSync(args.slice(1));
    case 'status': return runStatus(args.slice(1));
    case 'migrate': return runMigrate(args.slice(1)); // ADD THIS
    // ...
  }
}
// runMigrate parses --dry-run / --execute flags, calls lib/notebooklm-migrate.mjs::migrateVault()
```

[VERIFIED: lib/notebooklm-cli.mjs:32-51 confirmed pattern]

### Anti-Patterns to Avoid

- **Calling `deleteSource(id)` in Phase B:** The migration log tracks `source_id` from the SHARED notebook, but after Phase 7 the delete function requires both `notebookId` AND `sourceId`. Use `deleteSourceByTitle(sharedNotebookId, entry.title)` instead — consistent with `notebooklm-sync.mjs` strategy and avoids ID staleness issues. [VERIFIED: lib/notebooklm.mjs:443-465]
- **Calling `uploadSource` without `{title}` option:** The cp-to-tmp workaround in `uploadSource` only fires when `options.title` is set. Without it, notebooklm-py uses the temp file basename. ALWAYS pass `{ title: localTitle }` so per-project notebooks get clean titles (without `{slug}__` prefix). [VERIFIED: lib/notebooklm.mjs:405-409]
- **Writing migration log with `writeFileSync` directly:** Must use `atomicWriteJson` — no exceptions. The whole-log rewrite pattern is correct (not append); `atomicWriteJson` handles the temp+rename. [VERIFIED: lib/shared.mjs:134-140]
- **Fetching shared notebook by name every time:** Call `listNotebooks()` once at migration start, find shared notebook by the known ID (`5d848dd8-4871-49a2-9ad4-f4b1c2c2a48a`) or by name `claude-dev-stack-vault`. Cache the result — do not call `listNotebooks()` again during Phase A/B loops. [ASSUMED: consistent with syncVault single-fetch pattern at notebooklm-sync.mjs:479]
- **Grouping then batching sources per project before upload:** D-01 mandates per-source granularity: upload → verify → log → next. Not per-project batch. The log must reflect state after each individual source, not after a whole project. [VERIFIED: D-01 from CONTEXT.md]
- **Auto-deleting the shared notebook:** Explicitly out of scope — user manually deletes after verifying. [VERIFIED: REQUIREMENTS.md out-of-scope list]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic log writes | Custom write + try/catch | `atomicWriteJson` from `lib/shared.mjs` | Already handles temp+rename POSIX atomicity; tested |
| Notebook existence check | Custom list+filter | `ensureNotebook` pattern from `notebooklm-sync.mjs:196` | Already handles 0-match (create), 1-match (reuse), 2+-match (throw) cases |
| Binary detection | Re-implement `which notebooklm` | `_ensureBinary` inside `lib/notebooklm.mjs` via lazy check | Called automatically on first public function invocation |
| Title parsing for prefix grouping | Regex from scratch | `indexOf('__')` + `slice` — simple split, no regex needed | `buildTitle` establishes `{slug}__` as the canonical separator; no escaping needed |
| Test vault setup | Per-test `mkdtemp + mkdir` | `makeTempVault()` from `tests/helpers/fixtures.mjs` | Phase 6 infra; cleanup included |
| Stub binary on PATH | Manual PATH manipulation | `withStubBinary()` from `tests/helpers/fixtures.mjs` | Handles cleanup + PATH restoration in finally block |
| Vault root resolution | Re-implement `findVault` | `findVault()` from `lib/projects.mjs` | Handles all known vault candidate paths |

---

## Common Pitfalls

### Pitfall 1: Verification False Positive on Empty `listSources()` Response

**What goes wrong:** After `uploadSource()` returns success, `listSources()` on the TARGET notebook may return an empty array or not include the newly uploaded source if notebooklm-py has processing lag. Verification would fail for a source that did upload correctly.

**Why it happens:** notebooklm-py `source add` returns before the source is indexed. `listSources()` shows `status: 'processing'` or the source may not appear at all immediately.

**How to avoid:** Check `title` match in the result of `listSources()`, not just `status === 'ready'`. The source WILL appear in the list even during processing — it just has `status: 'processing'`. Verification = title present in list, regardless of status. [VERIFIED: CONTEXT.md D-02 — "title match is sufficient"; lib/notebooklm.mjs:358-367 confirms status is returned but not mandatory]

**Warning signs:** Test stub returning empty `sources: []` for target notebook after add causes false Phase A failure.

### Pitfall 2: Migration Log Written Before listSources() Verification

**What goes wrong:** Writing `status: 'uploaded'` to the log, then calling `listSources()` to verify, then failing to update to `status: 'verified'`. On resume, the source is treated as needing retry (correct) — but if the upload DID land, the re-run creates a duplicate.

**Why it happens:** D-05 (duplicate detection) requires checking target `listSources()` at the START of each source's processing. The correct sequence is: (1) check if title already in target → if yes, mark `verified` immediately (D-05 skip path); (2) upload; (3) verify via listSources; (4) only then mark `verified`.

**How to avoid:** Implement the full per-source state machine strictly: `pending → [check dup] → [if dup: verified] → [upload] → uploaded → [verify] → verified`. Never skip the pre-upload duplicate check. [VERIFIED: D-01 + D-05 from CONTEXT.md]

### Pitfall 3: Phase B Runs on `skipped_orphan` or `skipped_duplicate` Count Mismatch

**What goes wrong:** Phase B gate checks "zero failures" but the implementation counts `skipped_orphan` entries as failures, preventing Phase B even when all real sources migrated successfully.

**Why it happens:** Vague "zero failures" definition. Orphans are intentionally left behind (D-04). Duplicates that were skipped (D-05) are already `verified` — they count as successes.

**How to avoid:** Phase B gate = zero entries with `status === 'failed'`. Entries with `status === 'skipped_orphan'` do NOT count as failures. Entries with `status === 'verified'` (including D-05 skip-marked) ARE eligible for Phase B delete. [VERIFIED: D-03 + D-04 from CONTEXT.md]

### Pitfall 4: `withStubBinary` Sync vs Async — `fn` Must Return Promise

**What goes wrong:** `withStubBinary` calls `result = fn(dir)` synchronously. If `fn` is async (which it must be for `migrateVault()` calls), the PATH is restored before the async work completes.

**Why it happens:** `withStubBinary` in `tests/helpers/fixtures.mjs:100-117` is synchronous — it does not `await` `fn`. Phase 7 tests use it with non-async fixture functions and synchronous `syncVault` stubs.

**How to avoid:** Phase 8 test must NOT use `withStubBinary` directly for async migration tests. Instead replicate the pattern inline (as Phase 7 tests already do at line 66-86): manually manipulate PATH, put `_resetBinaryCache()` in `beforeEach`/`afterEach`, and wrap the stub setup in the test body. [VERIFIED: tests/notebooklm-sync-per-project.test.mjs:62-89 + tests/helpers/fixtures.mjs:100-117]

### Pitfall 5: `deleteSourceByTitle` Stdout Parse Failure on "Not Found"

**What goes wrong:** If a source was already deleted (e.g., by a previous partial run that completed Phase B), calling `deleteSourceByTitle` in Phase B again throws `NotebooklmCliError` with "unexpected output format" rather than a graceful skip.

**Why it happens:** `deleteSourceByTitle` parses stdout for `^Deleted source: (\S+)` (lib/notebooklm.mjs:489). If the source is gone, notebooklm-py may return a different message or non-zero exit.

**How to avoid:** Phase B delete should wrap `deleteSourceByTitle` in a `try/catch` that swallows `NotebooklmCliError` (same pattern as `syncOneFile` for `deleteSourceByTitle` at notebooklm-sync.mjs:344-353), while re-throwing `NotebooklmRateLimitError`. If the delete throws `CliError`, treat the source as already deleted and mark `deleted` anyway — idempotent. [VERIFIED: lib/notebooklm-sync.mjs:344-353 + lib/notebooklm.mjs:489]

### Pitfall 6: Shared Notebook ID Hardcoded vs Resolved Dynamically

**What goes wrong:** The shared notebook ID `5d848dd8-4871-49a2-9ad4-f4b1c2c2a48a` is known from research (CONTEXT.md §specifics), but hardcoding it makes the module fragile for other users who have a differently-named or differently-IDed shared notebook.

**Why it happens:** The temptation to hardcode the known ID for "this user's" migration.

**How to avoid:** Resolve the shared notebook at migration start via `listNotebooks()` + find by title `'claude-dev-stack-vault'` (or allow `--notebook-id` override flag). The hardcoded ID can be the documented default but must not be the only path. This also makes the test stubs easier — the stub returns the name-matched notebook. [ASSUMED: based on single-user context in CONTEXT.md + general good practice]

---

## Code Examples

### `migrateVault()` Function Signature

```javascript
// Source: CONTEXT.md D-06 shape + D-07 dry-run format + D-01 per-source flow
/**
 * @param {object} opts
 * @param {string}  [opts.vaultRoot]       Defaults to findVault()
 * @param {string}  [opts.sharedNotebookId] Defaults to resolved from listNotebooks() by name
 * @param {boolean} [opts.dryRun=true]     Default: dry-run (no mutations)
 * @param {number}  [opts.delayMs=1500]    Delay between operations (1-2s per D-08)
 * @returns {Promise<{
 *   dryRun: boolean,
 *   sources: Array<{source_id, title, target_project, status}>,
 *   phaseAFailures: number,
 *   phaseBSkipped: boolean,
 *   orphans: number
 * }>}
 */
export async function migrateVault(opts = {}) { ... }
```

[ASSUMED: signature design — shape derived from D-01..D-09 requirements]

### Dry-Run Output Format (D-07)

```
    ℹ Dry run — no changes will be made
    ℹ Shared notebook: claude-dev-stack-vault (27 sources)

    cds__claude-dev-stack (21 sources):
      context.md, ADR-0001-use-postgres.md, doc-setup.md ... (21 total)

    cds__other-project (1 source):
      context.md

    ⚠ Orphans (no project prefix, will be skipped): 0

    ℹ Total: 22 sources → 2 projects, 0 orphans
    ℹ Run with --execute to migrate
```

[VERIFIED: D-07 from CONTEXT.md — grouped by project, summary at end]

### Migration Log File Path

```javascript
// Source: D-06 from CONTEXT.md + findVault() pattern from lib/projects.mjs
import { join } from 'node:path';
import { findVault } from './projects.mjs';

function migrationLogPath(vaultRoot) {
  return join(vaultRoot, '.notebooklm-migration.json');
}
// Example: ~/vault/.notebooklm-migration.json
```

[VERIFIED: D-06 path confirmed in CONTEXT.md]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single shared `claude-dev-stack-vault` notebook | Per-project `cds__{slug}` notebooks | Phase 7 (v0.9) | Migration needed for existing 27 sources |
| `buildTitle` always includes `{project}__` prefix | `buildTitle(..., {projectScoped:true})` drops prefix | Phase 7 | Target notebook titles are clean (no slug prefix) |
| No migration log | `~/vault/.notebooklm-migration.json` | Phase 8 (this phase) | Enables resume + audit |
| `atomicWriteJson` in notebooklm-manifest.mjs | Extracted to `lib/shared.mjs` | Phase 6 (cross-cutting infra) | Available for migration log writes |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Shared notebook should be resolved by title `'claude-dev-stack-vault'` at migration start, not hardcoded by ID | Architecture Patterns §Pitfall 6, Code Examples §migrationLogPath | If wrong: hardcoded ID works for one user but breaks for anyone else. Low risk given single-user context; add `--notebook-id` flag as override to mitigate. |
| A2 | `listSources()` on target notebook immediately after `uploadSource()` will show the source (possibly with `status: 'processing'`) | Pitfall 1 | If `listSources()` returns empty immediately after upload, verification will always fail. Mitigation: title-match is sufficient (D-02), not status-match. |
| A3 | `withStubBinary` is synchronous and cannot safely be used directly for async migrate tests | Pitfall 4 | If wrong (i.e. `withStubBinary` does `await fn()`): tests would work but current code at fixtures.mjs:100-117 is synchronous. Risk: tests pass locally but PATH restored before async calls in CI. Always replicate inline pattern. |
| A4 | `migrateVault()` signature with `opts.dryRun = true` default (dry-run by default) | Code Examples | If CLI layer is wrong and passes `dryRun: false` accidentally, mutations happen without `--execute`. Mitigate: CLI parse `args.includes('--execute')` explicitly. |
| A5 | Migration log stores the FULL log array on every write (whole-object rewrite, not append) | Architecture Patterns §Pattern 2 | If append semantics were assumed: would create malformed JSON. `atomicWriteJson` writes the full object each time — this is the correct approach. |

---

## Open Questions

1. **Progress indicator during `--execute` mode**
   - What we know: D-08 fixes 1-2s delay per operation; 27 sources × 2s ≈ 1 min for Phase A
   - What's unclear: Whether a per-source count (`[1/27] uploading alpha__context.md...`) or a spinner is better UX
   - Recommendation: Per-source count is simpler, no external dep, matches the dry-run grouping output style. Claude's Discretion.

2. **`--dry-run` vs `--execute` flag naming in CLI**
   - What we know: D-07 says "dry-run by default, `--execute` for mutations"
   - What's unclear: Whether to also accept `--dry-run` as an explicit flag (redundant but explicit)
   - Recommendation: Accept both `--dry-run` (noop, already default) and `--execute`. Parse via `args.includes('--execute')`.

3. **Migration log `.gitignore` entry**
   - What we know: `~/vault/.notebooklm-migration.json` is a new file in the vault root
   - What's unclear: Whether `ensureManifestGitignored` should be extended, or the migrate module adds its own gitignore entry
   - Recommendation: Add `.notebooklm-migration.json` to the managed block in `ensureManifestGitignored`. Small addition to Phase 7 module, or do it in Phase 8 migrate module inline. The planner should decide which is cleaner.

---

## Environment Availability

Step 2.6: Phase 8 has no new external tool dependencies beyond what Phase 7 already requires. `lib/notebooklm.mjs` wraps `notebooklm-py` binary — same dependency as Phase 7.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `notebooklm` (notebooklm-py) | Real API calls in `--execute` mode | (runtime check via `hasCommand`) | ≥ 0.3.4 | Dry-run mode works without binary |
| `node:fs`, `node:path`, `node:os` | Migration log, vault path | Always available | Node 18+ | — |

Tests use `withStubBinary` pattern — no real notebooklm binary needed for CI. [VERIFIED: tests/notebooklm-sync-per-project.test.mjs pattern]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (native) + `node:assert/strict` |
| Config file | None — `npm test` runs `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/notebooklm-migrate.test.mjs` |
| Full suite command | `npm test` |

**Current test baseline:** 345 (verified by `npm test` run at research time — reflects Phases 6+7 complete)

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NBLM-V2-05 | `migrateVault({ dryRun: true })` groups by project, prints correct format | unit | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| NBLM-V2-05 | `notebooklm-cli.mjs::main(['migrate'])` dispatches to `runMigrate` | unit | `node --test tests/notebooklm-cli.test.mjs` | Yes — extend existing |
| NBLM-V2-06 | Phase A upload+verify, Phase B conditional delete | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| NBLM-V2-06 | Phase B skipped on any Phase A failure | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| NBLM-V2-06 | Resume: sources already `verified` in log are skipped | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| NBLM-V2-07 | Log written after every state transition, correct shape | unit | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| TEST-03 | Empty notebook fixture | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| TEST-03 | 27-source real-shape fixture | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| TEST-03 | Partial-failure mid-project | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| TEST-03 | Duplicate target slug (D-05 skip) | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| TEST-03 | Orphan source (D-04 skip+warn) | unit (stub) | `node --test tests/notebooklm-migrate.test.mjs` | No — Wave 0 |
| TEST-03 | Real-notebook smoke test | manual | (manual — D-09 decision) | Manual checklist only |

### Sampling Rate

- **Per task commit:** `node --test tests/notebooklm-migrate.test.mjs`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + manual smoke test on burner notebook before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/notebooklm-migrate.test.mjs` — covers all 5 TEST-03 fixture scenarios + NBLM-V2-06/07

*(All other test infrastructure is in place from Phases 6+7)*

---

## Security Domain

Security enforcement applies. This phase has a limited threat surface (no auth, no network beyond notebooklm-py, no user input passed to shell).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Delegated to notebooklm-py entirely |
| V3 Session Management | No | Not applicable |
| V4 Access Control | No | Local CLI tool, single-user |
| V5 Input Validation | Yes (low) | `sharedNotebookId` / `--notebook-id` flag — validate as non-empty string before passing to `listSources()` / `deleteSourceByTitle()` |
| V6 Cryptography | No | No new crypto; hash is read-only from manifest |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `--notebook-id` arg | Tampering | Args passed as argv array to spawnSync (never shell string) — already enforced by `runNotebooklm` in lib/notebooklm.mjs; no shell injection possible |
| Vault content in error output | Info Disclosure | Truncate reason strings to ≤200 chars before printing (existing T-05-01 pattern in notebooklm-cli.mjs:220) |
| Migration log world-readable | Info Disclosure | Written to `~/vault/` which is user-local; no additional chmod needed |

---

## Sources

### Primary (HIGH confidence)

- `lib/notebooklm.mjs` (codebase, lines 1-577) — All available primitives, error classes, `_resetBinaryCache`, `uploadSource` signature + cp-to-tmp workaround
- `lib/notebooklm-sync.mjs` (codebase, lines 1-628) — `ensureNotebook`, `buildTitle`, `syncOneFile` error handling patterns, rate-limit propagation
- `lib/notebooklm-manifest.mjs` (codebase, lines 1-403) — `readManifest`, `writeManifest`, `atomicWriteJson` usage pattern
- `lib/shared.mjs` (codebase, lines 133-140) — `atomicWriteJson` exact signature
- `lib/notebooklm-cli.mjs` (codebase, lines 1-225) — `main()` switch dispatch pattern, `runSync` pattern to follow
- `bin/cli.mjs` (codebase, lines 140-145) — notebooklm dispatch `case 'notebooklm':`
- `tests/helpers/fixtures.mjs` (codebase, lines 1-117) — `withStubBinary`, `makeTempVault` signatures
- `tests/notebooklm-sync-per-project.test.mjs` (codebase, lines 1-288) — Full stub pattern for per-project sync tests
- `.planning/phases/08-notebooklm-migration-script-notebooklm-migrate/08-CONTEXT.md` — All locked decisions D-01..D-09
- `.planning/REQUIREMENTS.md` — NBLM-V2-05, NBLM-V2-06, NBLM-V2-07, TEST-03 definitions

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` — Phase 8 success criteria, estimated plans (2), test delta (~20, 329 → 349)
- `npm test` output — confirmed test baseline = 345 at research time

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**

- Standard Stack: HIGH — all primitives read directly from codebase with line numbers
- Architecture: HIGH — patterns derived from existing working code in notebooklm-sync.mjs and notebooklm-cli.mjs
- Pitfalls: HIGH — derived from reading actual implementation details (cp-to-tmp workaround, deleteSourceByTitle stdout parse, withStubBinary sync constraint)
- Test matrix: HIGH — TEST-03 fixture list is explicit in REQUIREMENTS.md and ROADMAP.md success criteria

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable internal codebase; only invalidated if Phase 7 lands changes to notebooklm-sync.mjs or notebooklm-manifest.mjs primitives before Phase 8 starts)
