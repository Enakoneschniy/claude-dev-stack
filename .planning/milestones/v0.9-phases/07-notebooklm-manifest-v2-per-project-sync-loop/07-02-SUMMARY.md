---
phase: 07-notebooklm-manifest-v2-per-project-sync-loop
plan: "02"
subsystem: notebooklm-sync
tags: [notebooklm, manifest-v2, per-project, sync, tdd]
dependency_graph:
  requires: ["07-01"]
  provides: ["07-03"]
  affects: [lib/notebooklm-sync.mjs, lib/notebooklm-manifest.mjs, lib/notebooklm-cli.mjs, lib/doctor.mjs]
tech_stack:
  added: []
  patterns:
    - per-project notebook loop with cds__{slug} naming convention
    - pre-flight conflict scan before any API mutations (T-07-05)
    - scoped manifest sub-object passed to syncOneFile (C-3 pitfall prevention)
    - aggregateStats helper for perProject → total rollup
key_files:
  created:
    - tests/notebooklm-sync-per-project.test.mjs
  modified:
    - lib/notebooklm-manifest.mjs
    - lib/notebooklm-sync.mjs
    - lib/notebooklm-cli.mjs
    - lib/doctor.mjs
    - tests/notebooklm-manifest.test.mjs
    - tests/notebooklm-manifest-migration.test.mjs
    - tests/notebooklm-sync.test.mjs
    - tests/notebooklm-cli.test.mjs
decisions:
  - MANIFEST_VERSION bumped to 2 safely — migration guard from Plan 01 was active (D-04 gate honored)
  - emptyManifest returns v2 shape {version:2, projects:{}} — no more files field at top level
  - syncOneFile writeManifest calls removed — writes moved to per-project loop in syncVault
  - migrateV1ToV2 preserves original generated_at from v1 (avoids resetting stale-sync detection)
  - doctor.mjs and notebooklm-cli.mjs fileCount computation updated to sum across manifest.projects
  - syncVault returns {perProject, total, durationMs, rateLimited, notebookId:null} in per-project mode
  - integration tests updated from flat stats shape to total.uploaded/total.skipped pattern
metrics:
  duration: ~45 minutes
  completed: "2026-04-12"
  tasks: 2
  files_modified: 8
  files_created: 1
  tests_before: 327
  tests_after: 339
---

# Phase 07 Plan 02: Per-Project Sync Loop Summary

**One-liner:** MANIFEST_VERSION bumped to 2, syncVault refactored to per-project cds__{slug} notebooks with pre-flight conflict scan, projectScoped buildTitle, and per-project continue strategy.

## What Was Built

### Task 1: MANIFEST_VERSION bump to 2 + v2-native emptyManifest

Safe bump of `MANIFEST_VERSION` from 1 to 2, enabled by Plan 01's migration guard. Key changes:

- `MANIFEST_VERSION = 2` — fresh manifests are now v2-native
- `emptyManifest()` returns `{version:2, generated_at, projects:{}}` instead of `{files:{}}`
- `isValidManifestShape()` now requires `projects` field (not `files`) for a valid v2 manifest
- `writeManifest()` validation updated to require `manifest.projects` plain object
- `migrateV1ToV2()` preserves original `generated_at` from v1 (avoids resetting stale-sync doctor warnings)
- `syncOneFile` `writeManifest` calls removed — moved to per-project loop (Task 2 prep)
- `lib/doctor.mjs` and `lib/notebooklm-cli.mjs` file count computation updated to sum across `manifest.projects`
- All 8 test files updated to v2 manifest shape

### Task 2: Per-project syncVault loop + buildTitle projectScoped + conflict scan (TDD)

Full refactor of `syncVault` from single-notebook to per-project mode:

**buildTitle (D-07):** Added optional 4th parameter `opts = {}`. When `opts.projectScoped === true`, the `{slug}__` prefix is dropped — titles are notebook-scoped (the notebook name already identifies the project). Backward compatible — no opts = existing behavior.

**walkProjectFiles:** All callers in `collectCategoryFiles` and direct `makeEntry` calls now pass `titleOpts: { projectScoped: true }`, so all titles emitted by the walker are in projectScoped mode.

**ensureNotebook:** Accepts optional pre-fetched `existingNotebooks` list — enables T-07-07 caching (single `listNotebooks()` call per sync run, memoized for all per-project `ensureNotebook` lookups).

**preflightConflictScan (T-07-05):** Detects `cds__{slug}` notebooks that exist in NotebookLM but are not tracked in `manifest.projects[slug].notebook_id`. Throws with an actionable message: `"Notebook cds__X already exists. Use --force-adopt to claim it."` The `forceAdopt` option records the foreign notebook_id in the manifest without aborting.

**syncVault per-project loop (D-05):**
1. Walk all files → group by `projectSlug`
2. `listNotebooks()` once → cache as `cachedNotebooks`
3. `preflightConflictScan()` → throw on conflicts (unless `forceAdopt`)
4. For each project slug (sorted alphabetically):
   - `ensureNotebook('cds__' + slug, cachedNotebooks)` → get/create notebook
   - Record `manifest.projects[slug].notebook_id`
   - Create `scopedManifest = { files: manifest.projects[slug].files }` (T-07-06)
   - Loop files, call `syncOneFile({ manifest: scopedManifest, ... })`
   - Copy mutations back via reference
   - Write manifest atomically after project completes
   - Catch project-level errors → log + continue (D-05)
5. Aggregate `perProject` stats into `total`
6. Return `{ perProject, total, durationMs, rateLimited, notebookId: null }`

**dryRun mode:** Bypasses all API calls, returns flat `planned` array from all projects.

**aggregateStats:** Helper function that sums uploaded/skipped/failed/errors across all per-project entries.

## Commits

| Hash | Message |
|------|---------|
| `ce9ed5f` | feat(07-02): bump MANIFEST_VERSION to 2 + v2-native emptyManifest + test updates |
| `dc979c1` | test(07-02): add failing per-project sync tests (RED phase) |
| `c78f505` | feat(07-02): per-project syncVault loop + buildTitle projectScoped + conflict scan (GREEN) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] migrateV1ToV2 was resetting generated_at to current time**
- **Found during:** Task 1 — doctor.mjs test `manifest with generated_at = 5 days ago` failed because migration reset the timestamp to now
- **Issue:** `migrateV1ToV2` built v2 with `generated_at: new Date().toISOString()` instead of preserving the original v1 `generated_at`
- **Fix:** Changed to `generated_at: v1manifest.generated_at ?? new Date().toISOString()`
- **Files modified:** lib/notebooklm-manifest.mjs
- **Commit:** ce9ed5f

**2. [Rule 2 - Missing critical functionality] doctor.mjs and notebooklm-cli.mjs read manifest.files**
- **Found during:** Task 1 — both modules used `Object.keys(manifest.files ?? {}).length` which returns 0 for v2 manifests
- **Fix:** Updated both to `Object.values(manifest.projects ?? {}).reduce((sum, p) => sum + Object.keys(p.files ?? {}).length, 0)`
- **Files modified:** lib/doctor.mjs, lib/notebooklm-cli.mjs
- **Commit:** ce9ed5f

**3. [Rule 1 - Bug] syncOneFile wrote manifest directly to disk with scoped {files:{}} object**
- **Found during:** Task 1 — `syncOneFile` called `writeManifest(vaultRoot, manifest)` but `manifest` was the scoped `{ files: {} }` object, not the full v2 manifest. After v2 bump, `writeManifest` requires a `projects` field.
- **Fix:** Removed `writeManifest` calls from `syncOneFile` — writes moved to per-project loop in `syncVault` (this was also required by Task 2 plan, so this is an early implementation of that requirement)
- **Files modified:** lib/notebooklm-sync.mjs
- **Commit:** ce9ed5f

**4. [Rule 1 - Bug] Integration tests used manifest.files (v1 shape) and stats.uploaded (flat shape)**
- **Found during:** Task 2 GREEN phase — old integration tests checked `stats.uploaded`, `stats.notebookId`, `manifest.files[...]` which are incompatible with per-project stats shape and v2 manifest
- **Fix:** Updated all integration test assertions to use `stats.total.uploaded`, `manifest.projects[slug].files[...]`, and seeded appropriate `cds__` notebook stubs
- **Files modified:** tests/notebooklm-sync.test.mjs
- **Commit:** c78f505

**5. [Rule 1 - Bug] walkProjectFiles ADR title assertion used legacy format**
- **Found during:** Task 2 GREEN — `walkProjectFiles` test checked `adrEntries[0].title === 'p1__ADR-0001-valid.md'` but now walkProjectFiles emits projectScoped titles (no slug prefix)
- **Fix:** Updated assertion to `'ADR-0001-valid.md'`
- **Files modified:** tests/notebooklm-sync.test.mjs
- **Commit:** c78f505

## Known Stubs

None — all functionality is fully wired.

## Threat Flags

None — all new surface areas were planned in the threat model:
- T-07-05 (pre-flight conflict scan) — implemented via `preflightConflictScan()`
- T-07-06 (scoped manifest to syncOneFile) — implemented via `scopedManifest = { files: manifest.projects[slug].files }`
- T-07-07 (listNotebooks caching) — implemented via `cachedNotebooks` parameter to `ensureNotebook`
- T-07-08 (forceAdopt) — implemented as explicit `opts.forceAdopt` flag

## Self-Check: PASSED

All files verified present:
- FOUND: lib/notebooklm-manifest.mjs
- FOUND: lib/notebooklm-sync.mjs
- FOUND: lib/notebooklm-cli.mjs
- FOUND: lib/doctor.mjs
- FOUND: tests/notebooklm-sync-per-project.test.mjs
- FOUND: .planning/phases/07-notebooklm-manifest-v2-per-project-sync-loop/07-02-SUMMARY.md

All commits verified present:
- FOUND: ce9ed5f (feat(07-02): bump MANIFEST_VERSION to 2 + v2-native emptyManifest + test updates)
- FOUND: dc979c1 (test(07-02): add failing per-project sync tests (RED phase))
- FOUND: c78f505 (feat(07-02): per-project syncVault loop + buildTitle projectScoped + conflict scan (GREEN))
