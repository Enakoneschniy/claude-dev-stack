---
phase: 09-notion-auto-import-via-mcp-skill-first
plan: "01"
subsystem: notion-import
tags: [notion, import, frontmatter, overwrite-protection, config]
dependency_graph:
  requires: [lib/shared.mjs, lib/docs.mjs, lib/git-scopes.mjs]
  provides: [lib/notion-config.mjs, lib/notion-import.mjs, cleanNotionFilename export]
  affects: [lib/docs.mjs]
tech_stack:
  added: [node:crypto (createHash)]
  patterns: [atomicWriteJson round-trip, 3-way hash overwrite protection, YAML frontmatter stamps]
key_files:
  created:
    - lib/notion-config.mjs
    - lib/notion-import.mjs
    - tests/notion-config.test.mjs
    - tests/notion-import.test.mjs
  modified:
    - lib/docs.mjs
decisions:
  - "validateNotionConfig rejects non-32-hex page_id values as T-09-01 mitigation"
  - "parseFrontmatter only extracts known keys (notion_page_id, notion_last_synced, notion_content_hash) per T-09-06 mitigation"
  - "importPage uses async function to allow future async fetchFn without API break"
  - "importAllPages returns null (not empty counts) when config is missing — caller can distinguish no-config from zero-pages"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 5
  tests_added: 39
---

# Phase 9 Plan 01: Notion Import Core — Summary

**One-liner:** Notion config schema + URL parser + 3-way hash import engine with frontmatter provenance stamps, all shipped in first version per D-05/D-06.

## What Was Built

### lib/notion-config.mjs (new)

Config read/write/validate module following the `lib/git-scopes.mjs` pattern:

- `validateNotionConfig(obj)` — validates v1 schema; rejects missing/wrong version, non-array pages, missing/non-hex page_id. Mitigates T-09-01.
- `parseNotionUrl(url)` — extracts 32-char hex page_id from Notion URLs in both undashed (32 hex) and dashed UUID (8-4-4-4-12) formats; strips query params; returns null for invalid input.
- `readNotionConfig(projectDir)` — reads `.claude/notion_pages.json`, validates, returns config or null.
- `writeNotionConfig(projectDir, config)` — writes atomically via `atomicWriteJson`.

### lib/notion-import.mjs (new)

Import engine with frontmatter provenance and overwrite protection:

- `contentHash(text)` — SHA-256 hex digest via `node:crypto`.
- `stampFrontmatter(body, opts)` — prepends `---\nnotion_page_id / notion_last_synced / notion_content_hash\n---` block. Ships from day one (D-05).
- `parseFrontmatter(content)` — extracts known frontmatter keys + body; unknown keys ignored (T-09-06).
- `importPage(vaultDocsDir, pageConfig, fetchedMarkdown)` — 3-way hash logic (D-06):
  1. File missing → create with stamp (`status: 'created'`)
  2. Notion hash matches stored → no-op (`status: 'unchanged'`)
  3. Local body hash matches stored hash → overwrite in place (`status: 'updated'`)
  4. Local body hash differs → write `.notion-update.md` sibling (`status: 'conflict'`)
- `importAllPages(projectDir, vaultPath, fetchFn)` — orchestrates all pages from config, returns `{ created, updated, unchanged, conflict }` counts.

### lib/docs.mjs (modified)

`cleanNotionFilename` changed from private `function` to `export function`. Zero behavior change to existing code; internal call at line 186 continues to work.

## Tests

| File | Tests | Pass |
|------|-------|------|
| tests/notion-config.test.mjs | 20 | 20 |
| tests/notion-import.test.mjs | 19 | 19 |
| Full suite (npm test) | 393 | 393 |

## Deviations from Plan

None — plan executed exactly as written.

- Task 1: `validateNotionConfig` uses `obj.version !== 1` (logically equivalent to checking `=== 1`). All behavior tests confirm correctness.
- Task 2 test: `importAllPages` test used distinct heading titles (`Alpha Doc` / `Beta Doc`) instead of `# Page {pageId}` to prevent `cleanNotionFilename` from collapsing two page UUIDs into the same filename. This is a test correctness fix, not a behavior deviation.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `ac575a8` | feat(09-01): notion-config module + cleanNotionFilename export |
| Task 2 | `cd6170f` | feat(09-01): notion-import module with frontmatter stamps and 3-way hash protection |

## Known Stubs

None — all exported functions are fully implemented with real logic.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary surface introduced. All parsing is local (no network calls). Threat register items T-09-01 and T-09-06 mitigated as planned.

## Self-Check: PASSED

- lib/notion-config.mjs exists: FOUND
- lib/notion-import.mjs exists: FOUND
- lib/docs.mjs has export function cleanNotionFilename: FOUND
- tests/notion-config.test.mjs exists: FOUND
- tests/notion-import.test.mjs exists: FOUND
- commit ac575a8 exists: FOUND
- commit cd6170f exists: FOUND
- git diff lib/notebooklm.mjs is empty: CONFIRMED
- npm test 393/393 pass: CONFIRMED
