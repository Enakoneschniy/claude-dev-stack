---
phase: 42-living-memory
plan: "03"
subsystem: skills
tags: [skills, slash-commands, mcp, session-memory, search]
dependency_graph:
  requires: ["42-02"]
  provides: ["/cds-search skill", "/cds-stats skill"]
  affects: ["skills/", "MCP tool integration"]
tech_stack:
  added: []
  patterns: ["MCP tool call pattern (mcp__cds__*)", "CLI fallback pattern", "cds-quick SKILL.md structure"]
key_files:
  created:
    - skills/cds-search/SKILL.md
    - skills/cds-stats/SKILL.md
  modified: []
decisions:
  - "cds-stats uses CLI (npx claude-dev-stack mem-stats) for session stats because mem-stats data is not exposed via MCP tool"
  - "Both skills follow cds-quick SKILL.md structure: YAML frontmatter + prose instructions"
  - "MCP tool names use double-underscore format as required by Claude Code (mcp__cds__*)"
metrics:
  duration: "5m"
  completed: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 42 Plan 03: /cds-search and /cds-stats Skills Summary

Two Claude Code slash command skills that bridge MCP session-memory tools into the user-facing interface for querying past observations and viewing project health dashboards.

## What Was Built

**`/cds-search`** (`skills/cds-search/SKILL.md`)
- Primary path: calls `mcp__cds__sessions.search({ query: "$ARGUMENTS" })` via MCP tool
- Fallback path: `npx claude-dev-stack search "$ARGUMENTS"` via Bash when MCP server is not registered
- Returns ranked results showing observation type, content snippet, session date, and session ID
- Trigger phrases: `/cds-search`, `cds-search`

**`/cds-stats`** (`skills/cds-stats/SKILL.md`)
- Calls `mcp__cds__planning.status()` for planning data (phase progress, current position)
- Calls `npx claude-dev-stack mem-stats` via Bash for session statistics (session count, observations by type, entity count, top entities, last activity)
- Combines both into a "Project Memory Dashboard" output
- Graceful fallback: if MCP unavailable, shows only mem-stats CLI output
- Trigger phrases: `/cds-stats`, `cds-stats`

## Decisions Made

1. `cds-stats` uses the CLI `mem-stats` command (not an MCP tool) for session stats because mem-stats data is not exposed through any MCP tool — it's CLI-only.
2. Both skills follow the `cds-quick` SKILL.md structure: YAML frontmatter + prose instructions with code blocks showing exact invocation syntax.
3. MCP tool names use the double-underscore format (`mcp__cds__*`) as required by Claude Code's tool naming convention.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: /cds-search skill | ff58b6f | feat(42-03): add /cds-search skill with MCP primary path and CLI fallback |
| Task 2: /cds-stats skill | ae866c6 | feat(42-03): add /cds-stats skill with MCP planning status + CLI mem-stats |

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. Skills are documentation files only — they describe tool calls the Claude Code agent will make during user sessions. The underlying security boundary (FTS5 input validation) is handled by `sessionsSearch` in Phase 37 as documented in T-42-07.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| skills/cds-search/SKILL.md exists | FOUND |
| skills/cds-stats/SKILL.md exists | FOUND |
| 42-03-SUMMARY.md exists | FOUND |
| Commit ff58b6f exists | FOUND |
| Commit ae866c6 exists | FOUND |
