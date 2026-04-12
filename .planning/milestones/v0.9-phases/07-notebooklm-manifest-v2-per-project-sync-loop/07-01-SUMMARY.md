---
phase: 07-notebooklm-manifest-v2-per-project-sync-loop
plan: "01"
subsystem: notebooklm-manifest
tags: [manifest-migration, v1-to-v2, tdd, atomic-commit, d04-gate]
dependency_graph:
  requires: []
  provides:
    - migrateV1ToV2
    - isValidManifestShape-structured-result
    - _migrateV1ToV2-test-export
    - _isValidManifestShape-test-export
  affects:
    - lib/notebooklm-manifest.mjs
    - tests/notebooklm-manifest-migration.test.mjs
tech_stack:
  added: []
  patterns:
    - structured-shape-result ({valid, reason} instead of boolean)
    - test-only export (_prefix convention, matches _walkProjectFiles)
    - atomic-backup-write (atomicWriteJson for .v1.backup.json)
    - per-project-slug-bucketing (projects/<slug>/... detection)
key_files:
  modified:
    - path: lib/notebooklm-manifest.mjs
      change: isValidManifestShape split + migrateV1ToV2 + writeManifest v2 support + test-only exports
  created:
    - path: tests/notebooklm-manifest-migration.test.mjs
      change: 12 test cases covering _isValidManifestShape, _migrateV1ToV2, readManifest corrupt recovery, writeManifest v2
decisions:
  - "Tested migrateV1ToV2 directly via _migrateV1ToV2 export instead of through readManifest — readManifest migration path activates only when MANIFEST_VERSION > 1 (Plan 02), so Plan 01 tests the machinery directly"
  - "isValidManifestShape accepts both files (v1) and projects (v2) as valid shapes — readManifest migration triggers on unknown-version+version===1 path, not shape detection"
  - "MANIFEST_VERSION stays at 1 — D-04 gate satisfied: machinery + tests land before any version bump"
metrics:
  duration_minutes: 30
  completed_date: "2026-04-12"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 1
  tests_added: 12
  tests_total: 325
  commit: b943c50
requirements_satisfied:
  - NBLM-V2-01
  - TEST-04
---

# Phase 07 Plan 01: Manifest v2 Foundation Summary

**One-liner:** isValidManifestShape refactored to `{valid, reason}` + migrateV1ToV2 with `_shared` bucket + backup write + 12 migration tests, all in one atomic commit (D-04 gate).

## What Was Built

The D-04 first-commit gate: migration machinery for the v1→v2 manifest format upgrade, fully tested before any `MANIFEST_VERSION` bump occurs.

### lib/notebooklm-manifest.mjs changes

1. **`isValidManifestShape` split** — replaced boolean return with `{valid: bool, reason: 'ok'|'unknown-version'|'malformed'}`. Enables `readManifest` to distinguish "unknown version that could be v1 needing migration" from "structurally corrupt".

2. **`migrateV1ToV2(vaultRoot, v1manifest, mPath)`** — converts flat v1 `files` dict to per-project v2 structure:
   - Entries matching `projects/<slug>/...` → `projects[slug].files`
   - Entries outside that pattern → `projects._shared.files` (D-01 no-data-loss rule)
   - Writes `.v1.backup.json` atomically via `atomicWriteJson` before mutation (D-02)
   - Backup write is idempotent: skips if backup already exists
   - Writes v2 manifest atomically via temp+rename pattern

3. **`readManifest` updated** — uses structured `shapeResult.reason` to call `migrateV1ToV2` when `unknown-version && parsed.version === 1` (activates after Plan 02 bumps MANIFEST_VERSION to 2).

4. **`writeManifest` updated** — accepts both v1 shape (`files` field) and v2 shape (`projects` field); throws only when neither is present.

5. **Test-only exports** — `_isValidManifestShape` and `_migrateV1ToV2` exported with `_` prefix (matches `_walkProjectFiles` convention from sync module).

### tests/notebooklm-manifest-migration.test.mjs (new, 12 tests)

- Tests 1-5: `_isValidManifestShape` returns correct `{valid, reason}` for all cases
- Tests 5-9: `_migrateV1ToV2` correctly converts 3-entry v1 manifest to v2, creates backup, routes `_shared` entries, is idempotent on backup, writes atomically
- Test 8: `readManifest` on version:99 triggers corrupt recovery (not migration)
- Test 10: `writeManifest` accepts v2 shape without throwing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Design Clarification] Migration tested via _migrateV1ToV2 directly, not through readManifest**

- **Found during:** GREEN phase — migration tests 5-9 expected readManifest to return v2, but with MANIFEST_VERSION=1 a v1 manifest passes shape validation and is returned as-is (migration only fires when MANIFEST_VERSION > 1)
- **Issue:** Plan's test descriptions implied readManifest returns v2 during Plan 01, but that path only activates in Plan 02 when MANIFEST_VERSION bumps to 2. Testing through readManifest would either require bumping MANIFEST_VERSION early (violating D-04) or auto-migrating every v1 manifest (causes regressions in 10 existing tests)
- **Fix:** Exported `migrateV1ToV2` as `_migrateV1ToV2` (test-only export) and rewrote migration tests 5-9 to call it directly. This correctly validates the migration machinery in Plan 01 while preserving the readManifest activation path for Plan 02.
- **Files modified:** tests/notebooklm-manifest-migration.test.mjs, lib/notebooklm-manifest.mjs (added `_migrateV1ToV2` export)
- **Commit:** b943c50

## Known Stubs

None — no placeholder values or TODO stubs in the implementation.

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes introduced. Threat model from plan (T-07-01 through T-07-04) fully addressed:
- T-07-01 (slug extraction path traversal): mitigated — entries outside `projects/*/` go to `_shared`, no path join used on untrusted keys
- T-07-04 (malformed JSON): mitigated — existing `recoverCorruptManifest` + new `malformed` reason in shape check

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/notebooklm-manifest.mjs exists | FOUND |
| tests/notebooklm-manifest-migration.test.mjs exists | FOUND |
| 07-01-SUMMARY.md exists | FOUND |
| commit b943c50 exists | FOUND |
| MANIFEST_VERSION = 1 (not bumped) | CONFIRMED (count: 1) |
| npm test passes (325/325) | CONFIRMED |
