---
phase: 09-notion-auto-import-via-mcp-skill-first
plan: "02"
subsystem: notion-cli
tags: [notion, cli, skill, doctor, mcp-detection]
dependency_graph:
  requires: [lib/notion-config.mjs, lib/notion-import.mjs, lib/shared.mjs, lib/docs.mjs]
  provides: [lib/notion-cli.mjs, skills/notion-importer/SKILL.md, notion case in bin/cli.mjs, checkNotionMcp in lib/doctor.mjs]
  affects: [bin/cli.mjs, lib/project-setup.mjs, lib/doctor.mjs]
tech_stack:
  added: []
  patterns: [CLI subcommand dispatch, skill-first MCP invocation, exportable helper for testability]
key_files:
  created:
    - lib/notion-cli.mjs
    - skills/notion-importer/SKILL.md
    - tests/notion-cli.test.mjs
  modified:
    - bin/cli.mjs
    - lib/project-setup.mjs
    - lib/doctor.mjs
decisions:
  - "importPages() in CLI context prints skill-first guidance (D-03); actual fetch happens in live Claude session via notion-importer skill"
  - "checkNotionMcp() exported separately from main() for testability — doctor tests use withStubClaudeMcp PATH injection pattern"
  - "checkNotionMcp accepts both array and object-of-servers JSON formats from claude mcp list --json"
metrics:
  duration: "~30 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 6
  tests_added: 13
---

# Phase 9 Plan 02: Notion CLI + Skill + Doctor — Summary

**One-liner:** Notion `list/add/import` CLI subcommands, notion-importer MCP skill, and hard ERROR doctor check for missing Notion MCP server wired in.

## What Was Built

### lib/notion-cli.mjs (new)

CLI dispatch module for `claude-dev-stack notion {list|add|import|help}`:

- `listPages()` — reads `.claude/notion_pages.json` via `readNotionConfig`, prints page_id + page_url per entry, or prints info message when no config exists.
- `addPage(args)` — parses Notion URL via `parseNotionUrl`, checks for duplicates, pushes `{page_id, page_url, vault_path, refresh_strategy}` entry, writes via `writeNotionConfig`. Mitigates T-09-07 (URL validation).
- `importPages(args, fetchFn?)` — in CLI context (no fetchFn): prints skill-first guidance per D-03. When fetchFn provided (tests/live session): calls `importAllPages` and prints summary. Accepts optional `--page <id>` flag.
- `showHelp()` — prints usage with all subcommands using `c.bold`/`c.dim` styling.
- `main(args)` — dispatch switch: list | add | import | help | default→help.

### bin/cli.mjs (modified)

- Added `case 'notion':` routing block after the scopes case.
- Added "Notion Import" section in `printHelp()` with subcommand description.

### skills/notion-importer/SKILL.md (new)

Skill template per D-03 skill-first approach:

- Frontmatter triggers (EN + RU): "import notion", "notion docs", "sync notion", "импортируй notion", "обнови notion".
- Instructions: read `.claude/notion_pages.json`, call `notion-fetch` MCP tool with `page_id` directly from live Claude session (NOT via subprocess).
- Documents 3-way hash check logic, filename convention, frontmatter stamp format.
- Documents that `notebooklm sync` picks up imported files automatically.

### lib/project-setup.mjs (modified)

Added `notion-importer` entry to `PROJECT_SKILLS` array so the skill is automatically copied to `{project}/.claude/skills/` on `claude-dev-stack` setup or `projects add`.

### lib/doctor.mjs (modified)

- Added exported `checkNotionMcp()` helper (lines 34–66):
  - Calls `execFileSync('claude', ['mcp', 'list', '--json'], { timeout: 10000 })`.
  - JSON.parse in inner try/catch — malformed output returns `{ found: false, error: 'exec_failed' }` per T-09-08 mitigation.
  - Accepts both array and object-of-servers JSON formats.
  - Returns `{ found: boolean, error?: 'exec_failed' }`.
- Added section 7 "Notion Import" in `main()`:
  - Skips with `info` when `claude` CLI not found (no counter increment — matches NotebookLM optional-feature pattern).
  - `ok` when Notion MCP server found.
  - `fail` + `info('Install via: claude mcp add notion')` + `issues++` when MCP missing (hard ERROR per D-10).
  - `warn` + `warnings++` when `claude mcp list` command itself fails.

### tests/notion-cli.test.mjs (new)

13 tests total:

| Group | Tests |
|-------|-------|
| notion-cli | listPages no-config info message |
| notion-cli | listPages with config shows page_id |
| notion-cli | addPage valid URL creates config entry |
| notion-cli | addPage invalid URL prints fail message |
| notion-cli | addPage duplicate page_id prints warn |
| notion-cli | showHelp no throw |
| notion-cli | importPages prints skill-first guidance |
| notion-cli | main no-args shows help |
| notion-cli | main dispatches list |
| checkNotionMcp | found=true with notion in mcp list |
| checkNotionMcp | found=false with no notion entry |
| checkNotionMcp | error=exec_failed on command failure |
| checkNotionMcp | error=exec_failed on invalid JSON output |

## Deviations from Plan

None — plan executed exactly as written.

- TDD executed as specified: RED commit (`19ea5ba`) → GREEN commit (`bc0f9ca`) → Task 2 commit (`ca58422`).
- `checkNotionMcp()` exported as a standalone helper as the plan's NOTE suggested, enabling clean PATH-injection tests via `withStubClaudeMcp`.
- The `importPages()` function accepts an optional `fetchFn` parameter for testability as specified.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 RED | `19ea5ba` | test(09-02): add failing tests for notion-cli subcommand dispatch |
| Task 1 GREEN | `bc0f9ca` | feat(09-02): notion CLI subcommands + skill + PROJECT_SKILLS entry |
| Task 2 | `ca58422` | feat(09-02): Notion MCP detection in doctor + checkNotionMcp helper + tests |

## Known Stubs

None — all functions are fully implemented with real logic. `importPages()` prints guidance in CLI context by design (D-03 skill-first), not a stub.

## Threat Surface Scan

No new network endpoints or auth paths introduced.

- T-09-07 mitigated: `parseNotionUrl` validates URL structure before any write.
- T-09-08 mitigated: `checkNotionMcp` wraps `JSON.parse` in inner try/catch; malformed output is non-fatal.
- T-09-10 mitigated: `execFileSync` timeout set to 10000ms; failure is non-fatal warning.
- No new surface outside the threat register.

## Self-Check: PASSED

- lib/notion-cli.mjs exists: FOUND
- skills/notion-importer/SKILL.md exists: FOUND
- tests/notion-cli.test.mjs exists: FOUND
- case 'notion': in bin/cli.mjs: FOUND
- notion-importer in lib/project-setup.mjs: FOUND
- checkNotionMcp in lib/doctor.mjs: FOUND
- commit 19ea5ba exists: FOUND
- commit bc0f9ca exists: FOUND
- commit ca58422 exists: FOUND
- git diff lib/notebooklm.mjs is empty: CONFIRMED
- npm test 406/406 pass: CONFIRMED
