---
phase: "08-notebooklm-migration-script-notebooklm-migrate"
plan: "01"
subsystem: "notebooklm"
tags: ["migration", "two-phase-commit", "cli", "notebooklm"]
dependency_graph:
  requires:
    - "lib/notebooklm.mjs (listNotebooks, listSources, uploadSource, deleteSourceByTitle)"
    - "lib/notebooklm-sync.mjs (_ensureNotebook, _walkProjectFiles)"
    - "lib/shared.mjs (atomicWriteJson, c, ok, fail, warn, info)"
    - "lib/projects.mjs (findVault)"
  provides:
    - "lib/notebooklm-migrate.mjs (migrateVault)"
    - "claude-dev-stack notebooklm migrate subcommand"
  affects:
    - "lib/notebooklm-cli.mjs (migrate case + help text)"
tech_stack:
  added: []
  patterns:
    - "Two-phase-commit: upload+verify per source before any deletes"
    - "Atomic migration log via atomicWriteJson after every state transition"
    - "Resume on re-run via per-source status map (pending/verified/deleted/skipped_orphan)"
    - "Dynamic import of migrate module in CLI to avoid loading when not needed"
key_files:
  created:
    - "lib/notebooklm-migrate.mjs"
  modified:
    - "lib/notebooklm-cli.mjs"
decisions:
  - "D-01: Per-source granularity — upload then verify before moving to next source"
  - "D-03: Phase B gate — zero Phase A failures required before any shared-notebook deletes"
  - "D-05: Duplicate detection — title already in target marks verified immediately"
  - "D-06: Migration log at ~/vault/.notebooklm-migration.json written atomically after every state transition"
  - "D-07: Dry-run default — --execute required for mutations"
  - "D-08: Fixed 1500ms delay between operations"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 8 Plan 01: NotebookLM Migration Script — SUMMARY

**One-liner:** Two-phase-commit migration orchestrator (`migrateVault`) relocating shared-notebook sources to per-project `cds__{slug}` notebooks with dry-run default, atomic log, and resume on re-run.

## What Was Built

### lib/notebooklm-migrate.mjs (NEW, 420 lines)

Exports `migrateVault(opts)` implementing a safe, resumable, auditable v0.8 → v0.9 migration path:

- **Phase A** — Per-source loop: resolve disk path via `_walkProjectFiles` map, ensure target notebook via `_ensureNotebook`, duplicate-check via `listSources`, upload via `uploadSource`, verify by title match via second `listSources`.
- **Phase B gate** — If any Phase A failures exist, Phase B is entirely skipped; shared notebook remains untouched (D-03).
- **Phase B** — Delete verified sources from shared notebook via `deleteSourceByTitle`; swallows `NotebooklmCliError` for already-gone sources; re-throws `NotebooklmRateLimitError`.
- **Dry-run** — Prints grouped output by target project with source counts, zero mutations.
- **Resume** — Migration log at `~/vault/.notebooklm-migration.json` written atomically after every state transition; re-run skips `verified`/`deleted` entries.
- **Orphans** — Sources without `__` separator get `skipped_orphan` status; do not count as Phase A failures.

Internal helpers: `parseSourceTitle`, `buildFilePathMap`, `readMigrationLog`, `writeMigrationLog`, `migrationLogPath`, `sleep`, `truncateTitle`.

### lib/notebooklm-cli.mjs (MODIFIED)

- Added `case 'migrate'` to switch in `main()` dispatching to `runMigrate(args.slice(1))`
- Added `runMigrate(subArgs)`: vault check, `--execute` flag parse, dynamic import of `notebooklm-migrate.mjs`, error handling for `NotebooklmNotInstalledError` / `NotebooklmRateLimitError`
- Updated `printNotebooklmHelp()` with migrate entry line

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | c405e33 | feat(08-01): add notebooklm-migrate.mjs — two-phase-commit migration orchestrator |
| 2 | 32566f0 | feat(08-01): wire migrate subcommand into notebooklm-cli.mjs |

## Deviations from Plan

None — plan executed exactly as written.

`lib/notebooklm.mjs` has zero diff (D-03 boundary verified: `git diff HEAD -- lib/notebooklm.mjs | wc -l` = 0).

## Verification Results

- `node --check lib/notebooklm-migrate.mjs` — PASS
- `node --check lib/notebooklm-cli.mjs` — PASS
- All acceptance criteria grep patterns — PASS (8/8)
- `npm test` — 345 tests, 0 failures, 0 regressions
- `git diff HEAD -- lib/notebooklm.mjs | wc -l` — 0 (D-03 boundary)

## Known Stubs

None. The implementation wires all data paths to real primitives from `lib/notebooklm.mjs` and `lib/notebooklm-sync.mjs`. No placeholder returns or mock data.

## Threat Flags

None. All threat mitigations from the plan's threat model are implemented:
- T-08-01: `atomicWriteJson` used for all migration log writes
- T-08-02: `truncateTitle()` caps display output at 200 chars
- T-08-03: `NotebooklmRateLimitError` re-thrown to abort gracefully; fixed 1500ms delay
- T-08-04: `subArgs.includes('--execute')` explicit opt-in; default is dry-run
- T-08-05: Phase B gate enforces zero Phase A failures before any shared-notebook deletes

## Self-Check: PASSED

- lib/notebooklm-migrate.mjs — FOUND
- lib/notebooklm-cli.mjs — FOUND (modified)
- Commit c405e33 — FOUND
- Commit 32566f0 — FOUND
- lib/notebooklm.mjs diff — 0 lines (D-03 boundary intact)
