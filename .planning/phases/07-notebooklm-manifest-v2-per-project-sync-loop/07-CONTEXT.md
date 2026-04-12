# Phase 7: NotebookLM Manifest v2 + Per-Project Sync Loop - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Safely migrate the sync manifest from v1 (flat `{version: 1, files: {...}}`) to v2 (per-project `{version: 2, projects: {[slug]: {notebook_id, files: {...}}}}`), then refactor `syncVault()` to create/use one `cds__{slug}` notebook per project instead of a single shared notebook. `lib/notebooklm.mjs` remains untouched (D-03 boundary).

</domain>

<decisions>
## Implementation Decisions

### Manifest v1→v2 Migration
- **D-01:** Unmappable v1 entries (files outside `projects/*/`) go into a `projects._shared` bucket — no data loss. Phase 8 migration can handle `_shared` entries separately.
- **D-02:** `readManifest()` detects v1, writes `.v1.backup.json` + v2 manifest to disk immediately (in-place at read time). No lazy/deferred write — if sync crashes after read, manifest is already v2.
- **D-03:** `isValidManifestShape()` is split into `{valid: bool, reason: 'ok' | 'unknown-version' | 'malformed'}`. `readManifest()` calls `migrateV1ToV2()` on `unknown-version` when version === 1 specifically. Version > 2 still triggers corrupt recovery (future-proofing).
- **D-04:** CRITICAL FIRST-COMMIT GATE: `isValidManifestShape()` split + `migrateV1ToV2()` + `tests/notebooklm-manifest-migration.test.mjs` (v1 with 3 entries → v2 reads as 3 migrated) must land in a single atomic commit BEFORE any `MANIFEST_VERSION` bump.

### Per-Project Sync Atomicity
- **D-05:** `syncVault()` uses **per-project continue** strategy: error in project B is logged, sync continues with C, D, E. End summary reports `4/5 ok, 1 failed`. Re-run sync idempotently catches up project B.
- **D-06:** Pre-flight conflict: if `cds__{slug}` notebook already exists and wasn't created by CDS, **abort with actionable message**: `"Notebook cds__X already exists. Use --force-adopt to claim it."` The `--force-adopt` flag is a sync-level option.

### buildTitle projectScoped Branch
- **D-07:** `buildTitle(category, projectSlug, basename, opts)` — add optional 4th parameter `{projectScoped: true}`. When `projectScoped === true`, return `basename` without `{project}__` prefix. Without opts or `projectScoped: false` — existing behavior preserved. Backward compatible, zero breaking changes.

### Doctor Stats + Deprecation UX
- **D-08:** Doctor NotebookLM section shows summary line (`3 notebooks, 27 sources total`) plus per-project breakdown (`claude-dev-stack: 21 sources, nmp: 3 sources, ...`). Compact, inline with existing doctor style.
- **D-09:** `NOTEBOOKLM_NOTEBOOK_NAME` deprecation warning appears **only in doctor**, not during sync. Message: `"NOTEBOOKLM_NOTEBOOK_NAME is deprecated. Per-project notebooks (cds__{slug}) are now used. Will be removed in v1.0."`

### Claude's Discretion
- v2 manifest schema exact field names and nesting
- `ensureNotebook()` caching strategy (memoize per sync run vs re-check each time)
- Per-project stats aggregation shape (`{perProject: {[slug]: {...}}, total: {...}}`)
- Error message wording for partial sync failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Manifest Module (primary target)
- `lib/notebooklm-manifest.mjs` — Current v1 implementation: `isValidManifestShape()` at line 136, `recoverCorruptManifest()` at line 156, `readManifest()`, `writeManifest()`, `MANIFEST_VERSION`
- `lib/notebooklm-manifest.mjs:136-141` — The exact code that kills entries on version mismatch (C-2 pitfall)

### Sync Module (refactor target)
- `lib/notebooklm-sync.mjs` — `syncVault()` at line 381, `buildTitle()` at line 59, `_ensureNotebook()` at line 219, `_walkProjectFiles()` at line 176, `_syncOneFile()` at line 353

### NotebookLM Wrapper (DO NOT MODIFY)
- `lib/notebooklm.mjs` — D-03 boundary, 577 LOC. Phase 7 must not diff this file.

### Doctor
- `lib/doctor.mjs` — Existing NotebookLM section starts at line 74

### Research & Pitfalls
- `.planning/research/PITFALLS.md` — C-2 (manifest v1→v2 unsafe bump) is the critical pitfall
- `.planning/research/ARCHITECTURE.md` — Per-project diff analysis, migration design
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — ADR-0001: notebooklm-py wrapper rationale

### Test Infrastructure (from Phase 6)
- `tests/helpers/fixtures.mjs` — `withStubBinary` for notebooklm stub, `makeTempVault` for vault fixtures
- `tests/notebooklm.test.mjs` — Existing v0.8 notebooklm tests (patterns to follow)
- `tests/notebooklm-manifest.test.mjs` — Existing v0.8 manifest tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `atomicWriteJson()` from `lib/shared.mjs` — use for migration log writes and backup writes
- `withStubBinary()` from `tests/helpers/fixtures.mjs` — stub the `notebooklm` CLI for all sync tests
- `makeTempVault()` from `tests/helpers/fixtures.mjs` — create test vault structures
- Existing `hashFile()` from `lib/notebooklm-manifest.mjs` — SHA-256 hashing, no changes needed

### Established Patterns
- `_syncOneFile()` already accepts manifest as parameter — can pass `manifest.projects[slug]` scoped sub-object
- `_walkProjectFiles()` already iterates per-project — natural boundary for per-project notebook loop
- Atomic write pattern (temp + rename) already in `writeManifest()` — extend to backup writes

### Integration Points
- `syncVault()` is the main entry point — needs refactoring to per-project loop
- `readManifest()` is the migration trigger point — needs v1 detection + migration call
- `lib/doctor.mjs` NotebookLM section (line 74) — needs per-project stats + deprecation check
- `bin/cli.mjs` — no changes needed (sync command already dispatches to syncVault)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — locked decisions from ROADMAP and discussion cover the implementation surface.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-notebooklm-manifest-v2-per-project-sync-loop*
*Context gathered: 2026-04-12*
