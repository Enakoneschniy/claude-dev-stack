---
phase: 45-cross-project-search-graph-mcp-tools
plan: 01
title: "MCP Tools: sessions.searchAll + memory.graph"
status: complete
started: 2026-04-17T23:06:00Z
completed: 2026-04-17T23:12:00Z
---

# Summary: Plan 45-01 — MCP Tools: sessions.searchAll + memory.graph

## What Was Built

Two new MCP tools added to the CDS MCP server, expanding the tool catalog from 5 to 7:

1. **sessions.searchAll** — Cross-project full-text search over all project vaults. Wraps `searchAllProjects()` from `@cds/core`. Returns BM25-ranked `CrossSearchHit[]` with project attribution. Limit clamped to 100 max.

2. **memory.graph** — Entity relationship graph for a project. Wraps `getEntityGraph()` from `@cds/core`. Returns nodes with type labels and directional edges with frequency-based weight. Path traversal protection via `assertValidScopeBasename()`.

Both tools registered in `TOOL_DEFINITIONS` array and `CallToolRequestSchema` switch-case dispatch in `mcp-server.ts`.

## Key Files

### Created
- `packages/cds-cli/src/mcp-tools/sessions-search-all.ts`
- `packages/cds-cli/src/mcp-tools/sessions-search-all.test.ts`
- `packages/cds-cli/src/mcp-tools/memory-graph.ts`
- `packages/cds-cli/src/mcp-tools/memory-graph.test.ts`

### Modified
- `packages/cds-cli/src/mcp-server.ts` — imports + tool definitions + switch cases
- `packages/cds-cli/src/mcp-server.test.ts` — tool count 5→7, new integration tests
- `packages/cds-cli/src/mcp-server.integration.test.ts` — tool count assertion updated

## Deviations

None.

## Test Results

- 6 new tests for sessions-search-all (empty query, empty vault, cross-project, limit, clamp, timing)
- 5 new tests for memory-graph (empty graph, seeded data, path traversal x2, counts)
- 2 new integration tests in mcp-server.test.ts
- All 127 tests passing

## Self-Check: PASSED
