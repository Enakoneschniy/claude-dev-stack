---
phase: 42-living-memory
plan: 04
subsystem: install
tags: [claude-md, mcp, template, memory, session-search]

# Dependency graph
requires:
  - phase: 42-01
    provides: MCP server registration (mcp__cds__ tools available in .claude/settings.json)
provides:
  - Updated managedBody template with ## Memory section instructing Claude to call mcp__cds__ tools
affects: [all new/re-installed projects that run the wizard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Passive activation: CLAUDE.md instructs Claude to use MCP tools proactively, no explicit user action needed"

key-files:
  created: []
  modified:
    - lib/install/claude-md.mjs

key-decisions:
  - "Memory section placed between Session Protocol and Code Style per D-141 spec"
  - "MCP tool names escaped as backtick-literals inside template literal (backslash-backtick)"
  - "Double-dash -- used per project style (not em-dash)"

patterns-established:
  - "CLAUDE.md template sections: Language > Auto-Routing > Knowledge Base > Session Protocol > Memory > Code Style > Rules > References > Skills"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-04-17
---

# Phase 42 Plan 04: Living Memory — CLAUDE.md Memory Section Summary

**CLAUDE.md template updated with passive MCP activation: Memory section instructs Claude to call mcp__cds__sessions.search, docs.search, and planning.status before saying "I don't have access"**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T15:15:00Z
- **Completed:** 2026-04-17T15:20:59Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `## Memory` section to `managedBody` template in `lib/install/claude-md.mjs`
- Section placed correctly between `## Session Protocol` and `## Code Style`
- Three MCP tool references included: `mcp__cds__sessions.search`, `mcp__cds__docs.search`, `mcp__cds__planning.status`
- "Never say I don't have access" guard instruction added for passive activation
- Syntax verified clean (`node -c` + dynamic import check)

## Task Commits

1. **Task 1: Add Memory section to CLAUDE.md template** - `faf6934` (feat)

## Files Created/Modified
- `lib/install/claude-md.mjs` - Added ## Memory section with three mcp__cds__ tool references between Session Protocol and Code Style

## Decisions Made
- Memory section placed exactly as specified in D-141: after Session Protocol, before Code Style
- Tool names escaped with backslash-backtick inside template literal to render correctly in output CLAUDE.md
- Double-dash `--` used (not em-dash) per project style guide

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CLAUDE.md template now contains Memory section; any project running the wizard will get MCP tool activation instructions
- Plan 42-01 (MCP server registration) + Plan 42-04 (CLAUDE.md template) together complete the "passive activation" path: MCP tools are registered AND Claude is instructed to use them
- Remaining Phase 42 plans can proceed independently

---
*Phase: 42-living-memory*
*Completed: 2026-04-17*
