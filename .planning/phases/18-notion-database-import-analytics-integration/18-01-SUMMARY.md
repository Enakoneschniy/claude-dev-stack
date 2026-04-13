---
phase: 18-notion-database-import-analytics-integration
plan: "01"
subsystem: notion-import
tags: [notion, database-import, pagination, tdd]
dependency_graph:
  requires: [lib/notion-import.mjs, lib/notion-cli.mjs, lib/notion-config.mjs, lib/project-naming.mjs]
  provides: [importDatabase export, --database CLI flag routing]
  affects: [notion import UX]
tech_stack:
  added: []
  patterns: [cursor-based pagination loop, 3-way hash via importPage delegation, toSlug file naming]
key_files:
  created: [tests/notion-import-database.test.mjs]
  modified: [lib/notion-import.mjs, lib/notion-cli.mjs]
decisions:
  - importDatabase delegates per-page write to existing importPage() rather than reimplementing 3-way hash
  - Title injected as heading when missing so importPage derives correct filename via cleanNotionFilename
  - --database routing placed before per-page config path inside importPages(); returns early after summary
metrics:
  duration: ~15min
  completed: 2026-04-13
  tasks_completed: 2
  files_changed: 3
---

# Phase 18 Plan 01: Notion Database Import Summary

Cursor-based pagination database import via `notion import --database <id>` using existing 3-way hash protection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add importDatabase() to lib/notion-import.mjs | e482710 | lib/notion-import.mjs, tests/notion-import-database.test.mjs |
| 2 | Add --database flag routing to lib/notion-cli.mjs | ac8fd56 | lib/notion-cli.mjs |

## What Was Built

**`importDatabase(databaseId, vaultDocsDir, fetchFn)`** in `lib/notion-import.mjs`:
- Cursor-based pagination loop (`has_more` + `next_cursor`) until all pages fetched
- Delegates per-page write to existing `importPage()` for 3-way hash overwrite protection
- Title injected as markdown heading (`# Title\n\n`) when markdown lacks one, enabling `importPage`'s filename derivation
- Falls back to `page_id + '.md'` when title is empty
- Returns `{ created, updated, unchanged, conflict, total }` summary

**`--database` routing in `lib/notion-cli.mjs` `importPages()`**:
- Detects `--database <id>` flag, runs value through `parseNotionUrl()` for validation
- Prints `fail()` with guidance on invalid ID — no crash, no FS write (T-18-01-01 mitigated)
- Prints summary table after successful import
- Help text updated with `--database` flag documentation

## Test Results

- 4 TDD tests in `tests/notion-import-database.test.mjs` — all pass
- 13 existing `tests/notion-cli.test.mjs` tests — all pass
- Full suite: 558 tests, 0 failures

## Deviations from Plan

None — plan executed exactly as written. importDatabase implementation uses the heading-injection approach (described as the "correct approach" in Task 1 action notes) rather than the `_filename` override approach.

## Self-Check: PASSED

- `lib/notion-import.mjs` exports `importDatabase` — verified via grep
- `lib/notion-cli.mjs` contains `--database` routing — verified via grep
- `toSlug` imported from `lib/project-naming.mjs` in `notion-import.mjs` — verified
- Commits e482710 and ac8fd56 exist in git log
