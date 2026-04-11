---
phase: 04-vault-notebooklm-sync-pipeline
plan: 01
subsystem: notebooklm-sync
tags:
  - notebooklm
  - vault-sync
  - cli-wrapper
  - tdd

dependency_graph:
  requires:
    - lib/notebooklm.mjs (Phase 2 — extended with listNotebooks)
    - lib/notebooklm-manifest.mjs (Phase 3 — imported in scaffold)
    - lib/projects.mjs (findVault — imported in scaffold)
    - lib/shared.mjs (warn — imported in scaffold)
  provides:
    - lib/notebooklm.mjs#listNotebooks (7th public function, NBLM-12 enabler)
    - lib/notebooklm-sync.mjs (scaffold with buildTitle + syncVault signature)
    - tests/fixtures/notebooklm-sync-stub.sh (argv-aware fake binary for Phase 4 tests)
  affects:
    - tests/notebooklm.test.mjs (extended with 6 listNotebooks cases)
    - tests/notebooklm-sync.test.mjs (new file, 17 tests)

tech_stack:
  added: []
  patterns:
    - TDD red/green per task (test commit then implementation commit)
    - argv-aware bash stub with explicit if-unset checks (avoids JSON } quoting ambiguity)
    - module scaffold pattern: throw 'not yet implemented — Plan 04-02' in private helpers

key_files:
  created:
    - lib/notebooklm-sync.mjs
    - tests/notebooklm-sync.test.mjs
    - tests/fixtures/notebooklm-sync-stub.sh
  modified:
    - lib/notebooklm.mjs (appended listNotebooks function)
    - tests/notebooklm.test.mjs (appended 6 listNotebooks test cases)

decisions:
  - "buildTitle is exported (not private) to enable direct unit testing while remaining the single source of truth for D-06 round-trip invariant"
  - "argv-aware stub uses explicit if-unset shell checks (not ${VAR:-default}) to avoid bash brace quoting ambiguity where JSON values ending in } cause trailing } in output"
  - "notebooklm-sync.mjs scaffold imports ALL symbols used by Plan 04-02 so Wave 2 only adds function bodies — no import churn"

metrics:
  duration_minutes: 35
  completed_date: "2026-04-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 2
  tests_added: 23
  tests_baseline: 128
  tests_final: 151
---

# Phase 04 Plan 01: NotebookLM Sync Foundation Summary

**One-liner:** listNotebooks() 7th function + notebooklm-sync.mjs scaffold with fully-implemented buildTitle() and argv-aware test fixture using explicit bash if-unset pattern.

## What Was Built

### Task 1: listNotebooks() — 7th public function in lib/notebooklm.mjs

Added `listNotebooks()` following the exact `listSources` pattern (D-10). The function wraps `notebooklm list --json`, normalizes the response shape from live CLI v0.3.4 output (which adds undocumented `index`, `is_owner`, `count` fields), and returns `Array<{id, title, createdAt}>`.

Key implementation detail: `created_at ?? null` handles the research finding that `created_at` is a timestamp string in list output but `null` in create output.

6 new tests in `tests/notebooklm.test.mjs` cover: happy path (strips index/is_owner), empty array, null-createdAt tolerance, missing `notebooks` key throws NotebooklmCliError, missing entry id/title throws NotebooklmCliError, binary-absent throws NotebooklmNotInstalledError.

### Task 2: Argv-aware stub + lib/notebooklm-sync.mjs scaffold + tests/notebooklm-sync.test.mjs

**tests/fixtures/notebooklm-sync-stub.sh** — branches on `$1` subcommand (list, create, source add, source delete-by-title) with per-mode env var overrides. Uses explicit `if [ -z "${VAR+x}" ]` checks instead of `${VAR:-default}` to avoid a bash quoting issue where JSON values ending in `}` cause a trailing `}` to be appended (the shell interprets it as the close of the parameter expansion).

**lib/notebooklm-sync.mjs** — scaffold with:
- `buildTitle(category, projectSlug, basename)` fully implemented per D-01..D-06: session pass-through, ADR regex `^(\d{4})-(.+)\.md$` returning null on mismatch, doc always-prefix, context fixed title
- `syncVault(opts)` signature with D-15 option resolution (vaultRoot defaulting to findVault(), notebookName from env or constant, dryRun flag)
- Private stubs `walkProjectFiles`, `ensureNotebook`, `syncOneFile` each throwing `'not yet implemented — Plan 04-02'`
- All imports Plan 04-02 will need (createNotebook, uploadSource, deleteSourceByTitle, listNotebooks, readManifest, writeManifest, hashFile, findVault, warn, readdirSync, statSync, join, relative, sep)

**tests/notebooklm-sync.test.mjs** — 17 tests: 8 for buildTitle (all 4 categories, ADR null mismatch, double-prefix doc, verbatim slug, TypeError, unknown category), 3 for syncVault scaffold (typeof, vault-not-found, orchestration-not-implemented), 6 for stub argv modes.

### Task 3: Full suite gate

`npm test` passes with 151 tests (128 baseline + 6 listNotebooks + 17 sync), zero failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bash brace quoting ambiguity in argv-aware stub**
- **Found during:** Task 2 GREEN phase (stub test "list mode respects NOTEBOOKLM_SYNC_STUB_LIST_STDOUT override" failed with JSON parse error)
- **Issue:** Original stub used `${NOTEBOOKLM_SYNC_STUB_LIST_STDOUT:-{"notebooks":[],"count":0}}` — when the override value ends in `}`, bash appends a trailing `}` (the shell sees the `}` as closing the `${...}` expansion AND emits the literal `}` from the pattern)
- **Fix:** Replaced `${VAR:-default}` with explicit `if [ -z "${VAR+x}" ]; then STDOUT='default'; else STDOUT="$VAR"; fi` for all JSON default values
- **Files modified:** tests/fixtures/notebooklm-sync-stub.sh
- **Commit:** 409c997 (included in Task 2 commit)

**2. [Rule 1 - Bug] Fixed JSDoc comment termination in lib/notebooklm-sync.mjs**
- **Found during:** Task 2 GREEN phase (SyntaxError: Unexpected token '*' on line 5)
- **Issue:** JSDoc comment body contained `projects/*/` — the `*/` sequence terminated the `/** ... */` block comment, leaving remaining lines as invalid syntax
- **Fix:** Changed `projects/*/` to `projects/{project}/` in the module-level JSDoc
- **Files modified:** lib/notebooklm-sync.mjs
- **Commit:** 409c997 (included in Task 2 commit)

## Known Stubs

The following stubs are intentional scaffolds for Plan 04-02:

| Stub | File | Line | Reason |
|------|------|------|--------|
| `walkProjectFiles` | lib/notebooklm-sync.mjs | ~98 | Plan 04-02 Task 1 implements vault walking |
| `ensureNotebook` | lib/notebooklm-sync.mjs | ~112 | Plan 04-02 Task 2 implements notebook existence check |
| `syncOneFile` | lib/notebooklm-sync.mjs | ~123 | Plan 04-02 Task 2 implements per-file sync logic |
| `syncVault` body | lib/notebooklm-sync.mjs | ~151 | Plan 04-02 Task 3 implements orchestration loop |

These stubs throw `'not yet implemented — Plan 04-02'` loudly so any accidental consumer fails immediately. The plan's goal (foundations for Plan 04-02) is fully achieved — stubs are the intended output.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. lib/notebooklm-sync.mjs scaffold only throws; no actual I/O occurs.

## Self-Check: PASSED

| Item | Result |
|------|--------|
| lib/notebooklm.mjs exists | FOUND |
| lib/notebooklm-sync.mjs exists | FOUND |
| tests/notebooklm.test.mjs exists | FOUND |
| tests/notebooklm-sync.test.mjs exists | FOUND |
| tests/fixtures/notebooklm-sync-stub.sh exists | FOUND |
| Commit 6c605b0 (listNotebooks) | FOUND |
| Commit 409c997 (scaffold + stub + sync tests) | FOUND |
| npm test: 151 pass, 0 fail | PASSED |
