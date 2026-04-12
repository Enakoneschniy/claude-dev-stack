# Phase 8: NotebookLM Migration Script (`notebooklm migrate`) - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

One-shot migration command (`claude-dev-stack notebooklm migrate`) that relocates all existing sources from the shared `claude-dev-stack-vault` notebook into per-project `cds__{slug}` notebooks using a two-phase-commit protocol. Dry-run by default, `--execute` for mutations. `lib/notebooklm.mjs` remains untouched (D-03 boundary). The migration script lives in `lib/notebooklm-migrate.mjs` and only orchestrates existing primitives.

</domain>

<decisions>
## Implementation Decisions

### Two-Phase-Commit Protocol
- **D-01:** Per-source granularity: upload source → verify title match via `listSources()` → mark 'verified' in migration log → next source. NOT per-project batch.
- **D-02:** Verification = title match only. `listSources()` in target notebook, find source with expected title. NotebookLM API doesn't expose content hash — title match is sufficient.
- **D-03:** Phase B (delete from shared) starts ONLY after Phase A reports zero failures across ALL sources. Any single failure → Phase B skipped entirely, shared notebook untouched.

### Resume/Idempotency
- **D-04:** Orphan sources (title without recognizable `{project}__` prefix) → skip + `warn()`, status `skipped_orphan` in migration.json. Stay in shared notebook for manual resolution.
- **D-05:** Duplicate detection: if source title already exists in target notebook → skip upload, mark `verified` immediately. Idempotent — re-run never creates duplicates.
- **D-06:** Migration log at `~/vault/.notebooklm-migration.json` written via `atomicWriteJson()` after every state transition. Per-source entries: `{source_id, title, old_notebook_id, new_notebook_id, target_project, status: pending|uploaded|verified|deleted|skipped_orphan}`.

### Dry-Run Output
- **D-07:** Grouped by target project: `cds__alpha (3 sources): file1.md, file2.md, file3.md`. Summary at end: total sources, per-project counts, orphan count. No JSON, no flat table.

### Rate-Limit + Error Handling
- **D-08:** Fixed 1-2s delay between each upload and delete operation. Predictable timing: 27 sources × 2s ≈ 1 minute for Phase A.
- **D-09:** Smoke test = manual pre-merge on burner notebook with 2-3 sources. NOT automated in CI. Round-trip verification (upload → listSources → title match) is the gate.

### Claude's Discretion
- Exact delay value (1s vs 2s) — tune based on smoke test results
- Migration log pretty-print formatting
- Progress indicator during execute mode (spinner vs percentage vs source count)
- Error message wording for partial failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Migration Target Module
- `lib/notebooklm-sync.mjs` — `syncVault()`, `buildTitle()`, `_ensureNotebook()`, `_syncOneFile()` — Phase 7 per-project loop is the pattern to follow
- `lib/notebooklm-sync.mjs:59` — `buildTitle()` with `{projectScoped: true}` — titles in per-project notebooks drop the prefix

### NotebookLM Primitives (DO NOT MODIFY)
- `lib/notebooklm.mjs` — `listNotebooks()`, `listSources()`, `createNotebook()`, `addSource()`, `deleteSourceByTitle()` — all available primitives. D-03 boundary: zero diff.

### Manifest
- `lib/notebooklm-manifest.mjs` — v2 manifest with `projects[slug].files`, `readManifest()`, `writeManifest()`, `atomicWriteJson` from `lib/shared.mjs`

### Test Infrastructure
- `tests/helpers/fixtures.mjs` — `withStubBinary()` for notebooklm stub, `makeTempVault()` for vault structures
- `tests/notebooklm-sync-per-project.test.mjs` — Phase 7 per-project sync tests (pattern for stubbing)

### Research & Pitfalls
- `.planning/research/PITFALLS.md` — C-1 (migration partial-run data loss), C-3 (notebook name collision)
- `.planning/research/ARCHITECTURE.md` — Two-phase-commit design, migration log format
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — ADR-0001

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `listSources(notebookId)` from `lib/notebooklm.mjs` — returns `[{index, id, title, type, url, status}]`
- `listNotebooks()` from `lib/notebooklm.mjs` — returns notebook list with IDs
- `addSource(notebookId, filePath)` from `lib/notebooklm.mjs` — uploads file
- `deleteSourceByTitle(notebookId, title)` from `lib/notebooklm.mjs` — deletes by title match
- `_ensureNotebook(name)` from `lib/notebooklm-sync.mjs` — creates if missing, returns ID
- `atomicWriteJson(path, obj)` from `lib/shared.mjs` — atomic JSON writes

### Established Patterns
- Per-project loop in `syncVault()` — iterate `walkProjectFiles()`, process per-slug
- Title parsing: `{project}__{filename}` → extract project slug via split on `__`
- `withStubBinary('notebooklm', script, fn)` for test stubs — avoid real API calls

### Integration Points
- `bin/cli.mjs` — needs new `migrate` subcommand under `notebooklm` namespace
- Migration log at `~/vault/.notebooklm-migration.json` — new file, gitignored

</code_context>

<specifics>
## Specific Ideas

- Real test matrix from research: 27 sources in shared notebook, 7 projects (claude-dev-stack: 21, 6 others: 1 each). Use this as the fixture shape.
- Shared notebook ID: `5d848dd8-4871-49a2-9ad4-f4b1c2c2a48a` — verified in research session

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-notebooklm-migration-script-notebooklm-migrate*
*Context gathered: 2026-04-12*
