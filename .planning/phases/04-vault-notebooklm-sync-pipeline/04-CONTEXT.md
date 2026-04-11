# Phase 4: Vault → NotebookLM Sync Pipeline - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build `lib/notebooklm-sync.mjs` — a module with one public function `syncVault(opts)` that walks `~/vault/projects/*/` content (sessions, decisions/ADRs, docs, context.md), compares hashes against the Phase 3 manifest, and uploads changed or new files to a single shared NotebookLM notebook via the Phase 2 CLI wrapper, using the `{project}__` filename convention and replace-by-filename semantics for non-session files. The phase also expands `lib/notebooklm.mjs` with a 7th function `listNotebooks()` required for notebook existence check on first run.

**In scope:**
- `lib/notebooklm-sync.mjs` — new module with single public export `syncVault({ vaultRoot?, notebookName?, dryRun? })` and private helpers (vault walker, filename builder, per-file sync, notebook ensurer)
- `lib/notebooklm.mjs` — add `listNotebooks()` as 7th exported function (minimal Phase 2 module extension)
- `tests/notebooklm-sync.test.mjs` — integration-level coverage using existing `tests/fixtures/notebooklm-stub.sh` fake binary pattern from Phase 2
- `tests/notebooklm.test.mjs` — extend with `listNotebooks` test cases (append to existing Phase 2 suite)
- Existence check, auto-create of target notebook on first run via `listNotebooks` + `createNotebook`
- Filename generation for 4 file categories (sessions, ADRs, docs, context.md) with deterministic titles usable by both upload AND `deleteSourceByTitle`
- Stats object return shape `{ uploaded, skipped, failed, errors[], durationMs, notebookId, rateLimited }`
- Error orchestration: continue-on-per-file-failure, abort-on-rate-limit, collect errors into return value
- Manifest writes after each successful upload (crash-resilient)

**Out of scope (Phase 5 concerns):**
- CLI subcommand routing (`notebooklm sync`, `notebooklm status`) — Phase 5
- Session-end trigger (detached background spawn) — Phase 5
- Install wizard integration (`pipx install notebooklm-py`, `notebooklm login` UX) — Phase 5
- `lib/doctor.mjs` health check — Phase 5
- `~/vault/.notebooklm-sync.log` log file — Phase 5 trigger owns logging; Phase 4 just returns stats
- Auth precondition check (`notebooklm auth check`) — Phase 5 trigger handles this; Phase 4 relies on Phase 2 `NotebooklmNotInstalledError` behavior
- Progress streaming, interactive UI — Phase 5 CLI decides UX

**Non-goals:**
- Content normalization before hashing (Phase 3 D-08 already decided: raw bytes)
- Per-project notebooks (PROJECT.md: deferred to v2)
- Cron/periodic sync (REQUIREMENTS.md: deferred to v2)
- Multi-machine manifest reconciliation (Phase 3 §deferred)
- Parallel file uploads
- Streaming progress events
- Frontmatter parsing (not needed for filename generation — regex on basename is sufficient)
- Notebook cleanup / stale source removal (deferred)

</domain>

<decisions>
## Implementation Decisions

### A. Filename normalization (deterministic, round-trippable for replace-by-filename)

- **D-01:** **Sessions — pass-through prefix.** `title = ${project}__${basename}`. Source files already follow `YYYY-MM-DD-slug.md` convention (enforced by session-manager skill). Zero parsing, zero failure modes. Edge case: a session file without a date prefix is synced as-is — treated as user error, not a wrapper concern.

- **D-02:** **ADRs — regex parse.** Regex `^(\d{4})-(.+)\.md$` captures `NNNN` and `slug`. Output = `${project}__ADR-${NNNN}-${slug}.md`. On regex mismatch (file in `decisions/` without the `NNNN-` prefix, e.g. a README) → emit `warn()` and skip the file. Do NOT abort sync. This strictly matches NBLM-08 literal format.

- **D-03:** **Docs — always prepend `doc-`.** `title = ${project}__doc-${basename}`. If source is `doc-setup.md` the resulting title becomes `${project}__doc-doc-setup.md` — ugly but deterministic. Current `~/vault/projects/*/docs/` directories contain no `doc-` prefixed files, so the double-prefix is theoretical. Zero conditional logic.

- **D-04:** **context.md — fixed path.** `title = ${project}__context.md`. Trivial, no parsing.

- **D-05:** **Project slug — trust directory name.** The `{project}` token comes from `readdirSync(vault/projects)` directory entries directly. No lowercasing, no whitespace stripping, no re-sanitization inside the sync module. `lib/add-project.mjs` already sanitizes project names at creation time (`toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`), and hand-crafted directories are user's responsibility. No duplicated slug-generation path.

- **D-06:** **Filename function is the single source of truth for round-tripping.** The same internal helper (e.g. `buildTitle(vaultRelativePath, projectSlug)`) must be used for both `uploadSource` and `deleteSourceByTitle` invocations. If hashing says a file changed and `deleteSourceByTitle` is called, the title passed in MUST byte-match the title used on the original upload. This is a correctness invariant — if it drifts, replace-by-filename silently creates duplicates.

### B. Error handling and orchestration

- **D-07:** **Per-file failure → continue, collect errors.** A non-rate-limit `NotebooklmCliError` on file #23 of 50 is appended to `stats.errors[] = [{file, reason, error}]`, the manifest entry for that file is NOT written, and sync continues with file #24. Next run retries any file without a manifest entry. Aligns with NBLM-23 "best-effort" philosophy (Phase 5).

- **D-08:** **Rate limit → abort sync, return partial stats.** On `NotebooklmRateLimitError`, stop the walk, finalize stats with `rateLimited: true` and `error: <the caught error>`, and return. Do not retry in-loop — `notebooklm-py` already has `--retry` (Phase 2 D-15 delegates retry to upstream), and Phase 4 must not compound retries. Manifest entries for previously-succeeded files persist (they were written after each successful upload per D-13).

- **D-09:** **Notebook existence check — `listNotebooks` + find-by-title.** Before walking files, call `listNotebooks()`, find the entry where `title === notebookName` (default `claude-dev-stack-vault`, or `NOTEBOOKLM_NOTEBOOK_NAME` env var override per NBLM-13). If found → cache its `id` for the sync run. If not found → `createNotebook(notebookName)` → cache new `id`. One API call on startup either way.

- **D-10:** **Phase 4 expands `lib/notebooklm.mjs` with a 7th public function `listNotebooks()`.** This is the smallest change that enables D-09 correctly. The function wraps `notebooklm list --json`, which emits `{"notebooks": [{"id", "title", "created_at"}, ...]}` per SKILL.md Command Output Formats. Implementation MUST follow Phase 2 conventions (D-08 normalization, D-09 shape docs, D-11 strict JSON parse, runNotebooklm helper reuse). Tests extend `tests/notebooklm.test.mjs` with `listNotebooks` cases. This is the ONLY modification of the Phase 2 module in Phase 4 scope.

- **D-11:** **Walk order — stable alphabetical, categories prioritized by importance.** Per project: `context.md` first (most important single file), then `decisions/*.md` sorted ascending, then `docs/*.md` sorted ascending, then `sessions/*.md` sorted ascending (date-in-filename gives chronological order). Across projects: alphabetical by project slug. Deterministic, trivially testable, and if sync aborts mid-way (rate limit), the most-important content is already synced.

### C. Session append-only semantics (critical ambiguity resolved)

- **D-12:** **Sessions are upload-once, never re-upload.** For files under `vault/projects/*/sessions/*.md`, check manifest presence (not hash). If `manifest.files[<path>]` has any entry → skip (no API call). If absent → upload, record in manifest. This literally enforces the PROJECT.md key decision "sessions are append-only" in code, not just in user expectation.

  **Consequence:** If a user retroactively edits a past session file, the edit will NOT sync to NotebookLM. This is intentional — sessions are historical records, not living documents. If a user wants a session re-synced they must manually remove its manifest entry. This trade-off is documented for Phase 5's `status` command to potentially surface stale sessions, but Phase 4 does not implement any warning UX.

- **D-13:** **Non-sessions — hash-compare + delete-then-upload on change.** For ADRs, docs, and context.md:
  1. Read file bytes, compute SHA-256 via Phase 3 `hashFile(absPath)`
  2. Look up `manifest.files[<vault-relative-path>].hash`
  3. If unchanged → skip (no API call, file counts toward `stats.skipped`)
  4. If different OR missing → `deleteSourceByTitle(notebookId, title)` (if manifest entry exists), then `uploadSource(notebookId, absPath)`
  5. If `deleteSourceByTitle` throws because the title doesn't exist in the notebook (Phase 2 wraps this as `NotebooklmCliError` with a specific stderr pattern — planner's research to verify) → swallow and continue to upload (idempotent on missing source)
  6. Update manifest entry with `{hash, notebook_source_id, uploaded_at}` immediately after successful upload (per D-14)

- **D-14:** **Manifest write timing — after each successful upload.** Call `writeManifest(vaultRoot, manifest)` once per successful file upload. Phase 3's atomic `.tmp + renameSync` makes each write cheap (~50KB JSON, POSIX atomic). Crash-resilient: if process dies between files, next run resumes with `(N-1)` files already recorded. Worst-case I/O for 100 files = 100 writes, each <5ms on SSD — acceptable for a background sync that's not on the hot path.

### D. Module API surface (contract for Phase 5)

- **D-15:** **Single public export `syncVault(opts)`.** Signature:
  ```js
  export async function syncVault({
    vaultRoot,      // optional, defaults to findVault() from lib/projects.mjs
    notebookName,   // optional, defaults to env var NOTEBOOKLM_NOTEBOOK_NAME or 'claude-dev-stack-vault'
    dryRun,         // optional boolean, if true: skip all API calls and manifest writes, return planned stats
  } = {})
  ```
  Private helpers (`walkProjectFiles`, `buildTitle`, `ensureNotebook`, `syncOneFile`) are NOT exported. Tests exercise them through `syncVault` + fake `notebooklm` binary (extending Phase 2's `tests/fixtures/notebooklm-stub.sh` fixture pattern). Smaller public surface means easier Phase 5 consumption and easier future refactoring.

- **D-16:** **Return shape — stats object.** Contract:
  ```js
  {
    uploaded: Number,     // count of files successfully uploaded (new or replaced)
    skipped: Number,      // count of files skipped (unchanged hash or session-already-uploaded)
    failed: Number,       // count of files that threw non-rate-limit errors
    errors: Array<{       // detailed per-file failures for logging
      file: String,       // vault-relative POSIX path
      title: String,      // the NotebookLM title attempted
      reason: String,     // short human-readable cause
      error: Error,       // the original thrown error (for instanceof checks by Phase 5)
    }>,
    durationMs: Number,   // wall-clock duration of the sync run
    notebookId: String,   // the notebook ID used (newly created or existing)
    rateLimited: Boolean, // true if sync aborted due to NotebooklmRateLimitError
  }
  ```
  Phase 5 CLI `notebooklm status` command reads this; session-end trigger logs it to `~/vault/.notebooklm-sync.log` and never surfaces errors in terminal UX (NBLM-23).

### E. Vault walking & skips

- **D-17:** **Project discovery — inline `readdirSync(vault/projects)`.** Private helper `walkProjectFiles(vaultRoot)` calls `readdirSync(join(vaultRoot, 'projects'), { withFileTypes: true })` and filters to directories excluding `_template`. Project slug IS the directory name (no generation). Avoids creating an unnecessary helper in `lib/projects.mjs` that Phase 4 is the sole consumer of. ROADMAP §Phase 4 SC5's mention of "reusing `reverseProjectMap()`" was semantically outdated — `reverseProjectMap` maps source-code paths to vault project names (the opposite direction), and Phase 4 walks the vault directly. Satisfies SC5 in spirit (no duplicated slug generation) rather than literally.

- **D-18:** **Category walk rule.** For each project directory:
  - `context.md` (single file, optional — skip silently if missing)
  - `decisions/*.md` (glob pattern, optional — skip silently if directory missing)
  - `docs/*.md` (glob pattern, optional)
  - `sessions/*.md` (glob pattern, optional)
  - Anything else in the project directory is ignored (future vault sub-directories like `agents/` or `templates/` are NOT auto-discovered — adding a new category is an explicit code change).

- **D-19:** **Hard-skipped paths (NBLM-11 enforcement).** The walker NEVER descends into `~/vault/shared/` or `~/vault/meta/`. These are not per-project and are explicitly out of scope. Also skipped: any file that is not `.md` extension (no `.txt`, no `.pdf`, no `.json`). If Phase 4 encounters a non-`.md` file in a watched directory, it is ignored silently.

- **D-20:** **Dry-run mode (from D-15 `dryRun` option).** When `dryRun: true`, the walker still does full discovery, hash computation, and manifest comparison, but skips all `notebooklm` CLI calls AND all `writeManifest` calls. The return value has `{ uploaded: 0, skipped: <count of unchanged>, failed: 0, errors: [] }` and a new field `planned: Array<{action: 'upload'|'replace'|'skip', file, title}>` reflecting what a real run would do. Used by Phase 5 `notebooklm status` and for testing.

### Claude's Discretion

- **Exact names** of private helpers (`walkProjectFiles`, `buildTitle`, `ensureNotebook`, `syncOneFile`) — proposals, planner picks clearer names if warranted.
- **How `errors[].reason`** is derived from thrown errors (short human string vs `error.message` vs structured code) — pick the format that's easiest to render in Phase 5 `status` output.
- **Whether to memoize `hashFile` results within a single sync run.** If a file is walked and then referenced again (shouldn't happen given the walker structure), avoiding a re-hash is cheap. Planner decides if memoization is worth the complexity.
- **How the `dryRun` option interacts with notebook existence.** Options: (a) `listNotebooks` is still called (cheap, one API hit), (b) `dryRun` fully bypasses ALL API calls including existence check. Pick (a) if the return value should include `notebookId`, (b) if `dryRun` must work offline.
- **Test fixture layout for multi-project vaults.** Extending `tests/fixtures/notebooklm-stub.sh` to simulate `list` and `list-by-title` responses vs creating a new multi-file stub — planner picks based on test readability.
- **Whether `findVault()` null handling in `syncVault` throws or returns a special stats shape.** Currently `findVault()` returns `null` if no vault found. Phase 4 can either throw `Error('Vault not found')` (consistent with Phase 3 D-14 policy) or return `{ uploaded: 0, skipped: 0, failed: 1, errors: [{reason: 'no vault'}], ... }`. Planner decides based on what Phase 5 CLI wants to render.
- **How `listNotebooks` handles >1 notebook with the same title.** SKILL.md doesn't say whether `notebooklm create` dedupes on title. If `listNotebooks` returns multiple matches for `claude-dev-stack-vault`, the policy is TBD — fail with a clear error, use the first, or use the most recent? Planner researches and decides.

### Folded Todos
None — no relevant todos matched Phase 4 during `cross_reference_todos` step (tool returned `todo_count: 0`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone-level architectural decision
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — **ADR-0001**, CLI wrapper approach; Phase 4 inherits the "no credential handling, no HTTP, single-dep preserved" constraints from this ADR.

### Phase scope, requirements, and prior decisions
- `.planning/ROADMAP.md` §Phase 4 (lines 72-83) — goal, dependencies (Phase 2 + Phase 3), 5 success criteria, 7 requirements
- `.planning/REQUIREMENTS.md` §NBLM-07..13 — full text of the 7 requirements this phase closes
- `.planning/PROJECT.md` §Key Decisions table — "Replace-by-filename semantics for all non-session uploads (sessions are append-only)" is the scope anchor for D-12/D-13
- `.planning/PROJECT.md` §Constraints — JavaScript single-dep rule (still binding: no new npm deps allowed in Phase 4)

### Shipped upstream phases (read first, build on top)
- `.planning/phases/02-notebooklm-api-client/02-CONTEXT.md` — Phase 2 locked decisions, especially:
  - D-04/D-05/D-07: lazy binary detection + `_resetBinaryCache` test hook (Phase 4 tests reuse this)
  - D-08/D-09: normalized return shapes for each function (Phase 4 consumes these)
  - D-12/D-13/D-14: rate-limit detection dual-path (Phase 4's D-08 depends on `NotebooklmRateLimitError`)
  - D-15: retry is delegated to upstream `--retry` flag (Phase 4 D-08 must not re-implement retry)
- `.planning/phases/02-notebooklm-api-client/02-01-SUMMARY.md` + `02-02-SUMMARY.md` — what actually shipped (6 functions, 3 error classes, 28 tests, fake binary fixture pattern)
- `.planning/phases/03-sync-manifest-change-detection/03-CONTEXT.md` — Phase 3 manifest decisions, especially:
  - D-01..D-05: manifest JSON shape, vault-relative POSIX paths, version=1 magic
  - D-06..D-09: hex SHA-256, ISO-8601 timestamps, raw-bytes hashing, synchronous read
  - D-14/D-15: corrupt manifest → rename + warn + return empty (Phase 4 treats empty as "re-sync everything")
  - D-16: corrupt sibling files NEVER auto-cleaned
- `.planning/phases/03-sync-manifest-change-detection/03-01-SUMMARY.md` — what shipped (5 exports, 32 tests)

### Shipped module code (canonical implementations Phase 4 consumes)
- `lib/notebooklm.mjs` — Phase 2 shipped. 6 public async functions + 3 typed error classes + private `runNotebooklm` helper. Phase 4 adds `listNotebooks()` as a 7th function following the same patterns.
- `lib/notebooklm-manifest.mjs` — Phase 3 shipped. 5 exports: `MANIFEST_VERSION`, `hashFile`, `readManifest`, `writeManifest`, `ensureManifestGitignored`. Phase 4 uses all of them.
- `lib/projects.mjs` — existing. Phase 4 uses `findVault()` only (exported, line 11). Does NOT reuse `getProjects()` (wrong shape) or `mapProjects()` (opposite direction).
- `lib/shared.mjs` — existing. Phase 4 uses `hasCommand`, `warn`, `info`, color helpers (`c.X`) for any diagnostic output (though sync is mostly silent, returning stats instead of printing).
- `tests/fixtures/notebooklm-stub.sh` — Phase 2 shipped. Parameterized bash stub driven by `NOTEBOOKLM_STUB_STDOUT/STDERR/EXIT` env vars. Phase 4 extends this pattern OR creates scenario-specific stubs — planner's choice.
- `tests/notebooklm.test.mjs` — Phase 2 shipped. Reference for PATH-prepend technique, `_resetBinaryCache()` test hook usage, `describe`/`it` style. Phase 4's integration tests mirror this structure.

### Upstream CLI reference
- `~/.claude/skills/notebooklm/SKILL.md` — `notebooklm-py v0.3.4` full documentation. Sections relevant to Phase 4:
  - **Quick Reference table** — `notebooklm list --json` (for D-10 `listNotebooks`), `notebooklm upload <file> -n <id>` (for `uploadSource`), `notebooklm source delete-by-title "..." -n <id>` (for `deleteSourceByTitle`)
  - **Command Output Formats (lines 182-225)** — specifically `{"notebooks": [{"id", "title", "created_at"}]}` shape for `listNotebooks` return
  - **Error Handling section** — rate-limit stderr patterns (already encoded in Phase 2 `RATE_LIMIT_PATTERNS`)
  - **Parallel safety (lines 57-63, 178)** — why Phase 2 always passes explicit `-n <notebookId>`; Phase 4 inherits this requirement via Phase 2 API

### Runtime verification (single-machine, dev-only smoke path)
- `/opt/anaconda3/bin/notebooklm --version` → `NotebookLM CLI, version 0.3.4` (from Phase 2 discuss session, still valid). Manual smoke test of Phase 4 can run against a real notebook on the dev machine without going through Phase 5 wizard.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`lib/notebooklm.mjs`** (Phase 2, 6 functions) — Phase 4's primary backend dependency. `createNotebook`, `uploadSource`, `deleteSourceByTitle` are called directly. `listSources` is NOT needed by Phase 4 (we track source IDs in the manifest, not by listing remote sources). `updateSource` is NOT used because Phase 4 orchestrates delete-then-upload itself via the manifest hash check (D-13).

- **`lib/notebooklm-manifest.mjs`** (Phase 3, 5 functions) — Phase 4's state layer. `readManifest(vaultRoot)` on sync start to load entries. `hashFile(absPath)` for every non-session file. `writeManifest(vaultRoot, updatedManifest)` after each successful upload. `MANIFEST_VERSION` implicit via `readManifest` (no need to import directly). `ensureManifestGitignored` is NOT called by Phase 4 — Phase 5's install wizard does the one-time migration; Phase 4 assumes it's already done.

- **`lib/projects.mjs::findVault()`** — returns vault root path or null. Phase 4 calls this as the default for `syncVault({ vaultRoot })` when caller omits the arg. This is the same entry point that `lib/docs.mjs`, `lib/export.mjs`, `lib/import.mjs`, `lib/add-project.mjs`, and `lib/analytics.mjs` use — consistent with project-wide convention.

- **`lib/shared.mjs`** — `warn()` for per-file skip notices (e.g., ADR regex mismatch per D-02), `c.X` color strings for any stats formatting. No `ok()`/`fail()` output from inside `syncVault` itself — stats object is the primary output channel, and Phase 5 decides how to render.

- **`tests/fixtures/notebooklm-stub.sh`** (Phase 2) — parameterized fake `notebooklm` binary. Env-var-driven: `NOTEBOOKLM_STUB_STDOUT`, `NOTEBOOKLM_STUB_STDERR`, `NOTEBOOKLM_STUB_EXIT`. Phase 4 either extends this with a mode-aware flag (e.g., `NOTEBOOKLM_STUB_MODE=list`) or adds a second scenario-specific fixture file. This is one of Claude's Discretion areas (D-15).

- **`tests/notebooklm.test.mjs`** — reference implementation for PATH-prepending, `_resetBinaryCache()` usage before each test, and the describe/it structure. Phase 4's `tests/notebooklm-sync.test.mjs` mirrors this closely.

### Established Patterns

- **Functional modules over classes.** `lib/notebooklm-sync.mjs` exports plain async functions, not a `SyncClient` class instance. Matches Phase 2 D-03 and project-wide convention from `.planning/codebase/CONVENTIONS.md`.

- **Private helpers at module scope (not exported).** Like Phase 2 `runNotebooklm` (private to `lib/notebooklm.mjs`), Phase 4's helpers live in `lib/notebooklm-sync.mjs` as non-exported `async function` declarations. Tests exercise them indirectly through `syncVault`.

- **POSIX path separators for vault-relative paths.** Phase 3 D-05 established that manifest keys use `/` even on Windows. Phase 4 MUST use `path.posix.relative(vaultRoot, absolutePath)` (or equivalent manual conversion) when looking up and writing manifest entries — otherwise `manifest.files['projects/foo/sessions/bar.md']` written by one run won't be found by a run from a Windows process that wrote `'projects\\foo\\sessions\\bar.md'`.

- **Fake binary via PATH prepend.** Phase 2 introduced the pattern; Phase 4 reuses. Tests set `process.env.PATH = testFixturesDir + ':' + original` before each test, call `_resetBinaryCache()`, and run the sync against the fake binary. Cleanup in `afterEach`.

- **Stats-as-return-value (no stdout pollution).** Unlike existing `lib/export.mjs` or `lib/doctor.mjs` which print progress to stdout via `ok`/`info`/`warn`, `syncVault` is silent by default and returns a stats object. This makes it safe to call from a detached background process (Phase 5 session-end trigger) without leaking terminal output. Phase 5 CLI `notebooklm sync` command is the one that renders stats to the terminal.

### Integration Points

- **New file:** `lib/notebooklm-sync.mjs` — ~300-400 LoC estimated. Imports from `lib/notebooklm.mjs`, `lib/notebooklm-manifest.mjs`, `lib/projects.mjs`, `lib/shared.mjs`, and node builtins (`node:fs`, `node:path`, `node:os`). Zero npm deps.

- **New file:** `tests/notebooklm-sync.test.mjs` — ~400-600 LoC estimated. Uses `node:test`, `node:assert/strict`, `tests/fixtures/notebooklm-stub.sh`. Sets up a temp-dir vault fixture per test (extending Phase 3's `mkdtempSync + process.pid` pattern). Covers all 5 ROADMAP success criteria.

- **Modification:** `lib/notebooklm.mjs` gets a 7th exported function `listNotebooks()` per D-10. This is additive — no existing function changes. The function follows the `runNotebooklm` dual-mode helper with `jsonMode: true`, returns normalized `Array<{ id, title, createdAt }>` (camelCase per Phase 2 D-09 convention).

- **Modification:** `tests/notebooklm.test.mjs` gets new test cases for `listNotebooks` — happy path, empty array, malformed JSON, binary missing. Appends to existing suite; does not restructure.

- **No modifications** to `bin/cli.mjs` (Phase 5 adds the `notebooklm sync` subcommand), `lib/install.mjs` (Phase 5 wizard), `lib/doctor.mjs` (Phase 5 health check), `package.json` (constraint: single-dep preserved).

### Constraints on Integration

- **`package.json` dependencies** MUST remain exactly `{"prompts": "^2.4.2"}` after this phase ships. Verified by acceptance criteria in the plan (same TEST-04 continuous gate that Phase 2 and Phase 3 already enforced).

- **No new system dependencies.** Phase 4 does not add to PROJECT.md §Constraints §System dependencies. `notebooklm-py >= 0.3.4` is already documented from Phase 2 pivot.

- **Imports restricted to:** `node:crypto` (transitively via Phase 3), `node:fs`, `node:path`, `node:os`, `node:path/posix`, `lib/notebooklm.mjs`, `lib/notebooklm-manifest.mjs`, `lib/projects.mjs`, `lib/shared.mjs`. No other imports allowed in the sync module.

- **Node 18+ compatibility.** No `structuredClone`, no `navigator`, no `fetch()`, no Node 20+ APIs.

- **No `Co-Authored-By`** in phase commit messages (user preference, enforced throughout project).

</code_context>

<specifics>
## Specific Ideas

- **User accepted all 8 recommended defaults in a single session** across 4 gray areas (Filename normalization, Error handling & orchestration, Session append-only semantics, Module API). This mirrors the Phase 1/2/3 pattern — the user is calibrated on the question style and is comfortable accepting Claude's recommendations when they align with prior locked decisions and the PROJECT.md value proposition.

- **The "session append-only" literal interpretation (D-12) is the single most impactful decision in this phase.** It converts user expectation ("sessions are historical records") into enforced code behavior (manifest-presence check, not hash check, for session files). This is intentional and aligns with the PROJECT.md Key Decisions table row literally. A future phase or backlog item may add a "force re-sync" command if it turns out to cause friction — noted in deferred ideas.

- **The ROADMAP SC5 "reuse reverseProjectMap()" discovery.** During discuss, I grep'd `lib/projects.mjs` and found that `reverseProjectMap` is not exported — it's an inline variable inside `mapProjects()` at line 246-249, and it maps source-code paths to vault project names (the OPPOSITE direction from what Phase 4 needs). This means ROADMAP §Phase 4 SC5 was semantically outdated. D-17 resolves this by walking the vault directly with `readdirSync(vault/projects)` and treating the directory name as the project slug (which is literally how the vault is structured). SC5 is satisfied in spirit (no duplicated slug generation) but not literally. The planner should NOT chase the literal SC5 text.

- **Phase 4 expands the Phase 2 module.** D-10 adds `listNotebooks()` to `lib/notebooklm.mjs`. This is a minimal, additive change and does NOT constitute a Phase 2 "re-open". Phase 2's CONTEXT.md notes that the 6 functions form Phase 4's implicit contract — adding a 7th for notebook existence check is a natural extension, not a contract violation. The alternative (duplicating the runNotebooklm pattern inside `notebooklm-sync.mjs`) would have been worse for maintenance.

- **notebooklm-py v0.3.4 is installed and authenticated on dev machine** (`/opt/anaconda3/bin/notebooklm`, verified during Phase 2 discuss). Planner can run a dev-only smoke test of `syncVault` against a real notebook for sanity checking before Phase 5 ships the install wizard. This is NOT part of the automated test suite — it's a manual verification hatch.

- **Fake binary fixture is a reusable pattern, not Phase 2-specific.** Phase 4's tests will be the second consumer of `tests/fixtures/notebooklm-stub.sh`. This validates the "parameterized bash stub" approach from Phase 2. If a third phase needs similar testing, the pattern is established.

- **The atomic manifest-write-per-file policy (D-14)** is cheap because Phase 3's `writeManifest` uses `.tmp + renameSync` — a single POSIX atomic op, not a lock-file dance. For 100 files this is 100 renames, which is <500ms on SSD. The alternative (batch at end) has a strictly worse failure mode (crash loses all manifest progress), and there's no performance benefit worth the risk.

</specifics>

<deferred>
## Deferred Ideas

- **Dry-run mode UX details beyond D-20.** The `dryRun: true` option returns a `planned[]` array but doesn't specify output format. Phase 5's `notebooklm status` command is the consumer; format is decided there. Phase 4 just provides the raw data.

- **0-byte file handling.** An empty `.md` file is technically valid but may be rejected by NotebookLM. Phase 4 currently passes them through to `uploadSource` and relies on Phase 2 error handling. If NBLM rejects 0-byte files with a specific error, Phase 4 can add a pre-filter in a follow-up — but not now.

- **Parallel file uploads.** Current design is strictly sequential. `notebooklm-py` is parallel-unsafe per Phase 2 D-09 notes (shared `~/.notebooklm/context.json`), but Phase 2's explicit `-n <id>` passing mitigates this. Parallel uploads of 2-4 files could roughly halve sync duration for large vaults, but would require careful manifest write ordering. Deferred to v2 if sync duration becomes a user complaint.

- **Cross-project parallelism.** Similar to above but at project granularity. Same reasoning applies.

- **Notebook cleanup / stale source removal.** If a vault file is deleted locally (e.g., old session pruned), the corresponding source stays in NotebookLM indefinitely. Phase 4 does NOT detect or remove these. A `notebooklm prune` command could be added in Phase 5 or later, scanning the manifest for entries without corresponding files and calling `deleteSource`. Deferred — adds complexity and risk of accidental deletion.

- **Session re-sync command.** Given D-12's hard "upload-once" rule for sessions, users cannot trigger a re-sync of an edited session without manually editing the manifest JSON. A `notebooklm resync <file>` command could remove the manifest entry and run a targeted sync. Useful but niche; deferred.

- **Per-project notebooks migration.** PROJECT.md defers this to v2. If/when we add it, Phase 4's sync loop structure is already compatible (the notebook ID lookup in D-09 would switch from single-notebook to per-project, but the walk + hash + upload skeleton remains).

- **Frontmatter-aware title extraction.** D-02 (ADRs) parses the filename regex. A future phase might want to parse YAML frontmatter for richer titles (e.g., using the `title:` field instead of the filename slug). This requires a frontmatter parser (vanilla regex or a dep) — but the existing vault has zero ADRs with frontmatter, so the value is zero today. Deferred.

- **Content transformation before upload.** E.g., stripping internal TODO markers, rewriting internal links to absolute URLs, or pre-processing `@-mentions`. NotebookLM ingests raw markdown; any transformation is a content concern, not a sync concern. Deferred — may belong in vault authoring tools, not sync.

- **Streaming / progress events.** D-16 explicitly picks "stats object, no streaming". If Phase 5 CLI wants a progress bar, it can be added later via logger injection (one of Claude's Discretion). Deferred.

- **Rate-limit retry with backoff.** D-08 explicitly aborts. If Phase 5 trigger wants smarter retry-across-process-restarts, it can re-invoke `syncVault` on a schedule. In-process backoff is deferred.

- **Cross-machine manifest reconciliation** (carried from Phase 3 deferred section). Still deferred.

- **Reviewed Todos (not folded).** None — `cross_reference_todos` returned `todo_count: 0`.

</deferred>

---

*Phase: 04-vault-notebooklm-sync-pipeline*
*Context gathered: 2026-04-11*
