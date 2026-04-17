# Phase 45: Cross-Project Search + Graph + MCP Tools - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add CLI commands (`cds search --global`, `cds graph`) and MCP tools (`sessions.searchAll`, `memory.graph`) for cross-project search and entity graph visualization. Implement SessionStart auto-suggestion hook that surfaces relevant past observations. Integrate MiniSearch for fuzzy search alongside existing FTS5. All primitives from Phase 43 (searchAllProjects, getEntityGraph) are consumed here.

</domain>

<decisions>
## Implementation Decisions

### MCP Tool: sessions.searchAll
- **D-01:** Tool params include filters: `{ query: string, limit?: number, project?: string, type?: string, dateRange?: { from?: string, to?: string } }`. All filters are optional except `query`.
- **D-02:** Response returns ranked results with: `projectName`, `sessionDate`, `contentSnippet`, `observationType`, `rank`. No pagination for v1.1 — limit defaults to 20.
- **D-03:** Implemented in `@cds/mcp-adapter` package, calling `searchAllProjects()` from `@cds/core` (Phase 43).

### MCP Tool: memory.graph
- **D-04:** Current project only. Params: `{ minWeight?: number }`. Returns `EntityGraph` (from Phase 43's `getEntityGraph()`).
- **D-05:** No multi-project graph merging in v1.1 — too noisy. Single project scope keeps results meaningful.

### Auto-Suggestion (SessionStart Hook)
- **D-06:** Smart context window approach: analyze current project directory, recent git changes, and open branch to determine search terms. Use these to query FTS5 for relevant past observations.
- **D-07:** Surface up to 5 relevant observations as brief one-liners in the session preamble. Each shows: observation type, date, and content snippet (max 100 chars).
- **D-08:** Auto-suggestion is part of the existing SessionStart hook chain. It runs AFTER session context loading (existing behavior) and BEFORE the session prompt.
- **D-09:** If no relevant observations found or vault has <3 sessions, skip silently (no "nothing to suggest" message).

### MiniSearch Integration
- **D-10:** Build MiniSearch index on-demand at query time from SQLite data. No persistence — fresh index each query. Avoids stale index problems.
- **D-11:** Search flow: FTS5 runs first for exact matches → MiniSearch runs on remaining unmatched observations for fuzzy/partial matches → results merged and de-duplicated by observation ID → sorted by combined rank.
- **D-12:** MiniSearch configured for: fuzzy matching (distance=2), prefix search, boost on entity names.

### CLI Output
- **D-13:** `cds search --global <query>` displays ANSI-colored table: project | date | snippet. Uses existing `c.X` color constants from `shared.mjs`.
- **D-14:** `--json` flag outputs machine-readable JSON array. `--limit N` controls result count (default 20).
- **D-15:** `cds graph` displays entity list with relation counts. `--json` for machine-readable.

### Claude's Discretion
- Exact MiniSearch field weights and boost values
- How git branch/recent files feed into auto-suggestion search terms
- Whether `cds graph` shows a text-based tree or just a flat list
- Error handling when vault path is not configured
- Test strategy for MCP tools (mock MCP server or integration test)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 43 Primitives (consumed by this phase)
- `packages/cds-core/src/vault/graph.ts` — getEntityGraph() implementation
- `packages/cds-core/src/vault/multi-search.ts` — searchAllProjects() implementation
- `packages/cds-core/src/vault/backend.ts` — VaultBackend, GraphNode, GraphEdge types
- `packages/cds-core/src/vault/sessions.ts` — SessionsDB, SearchHit, Entity, Relation types

### MCP Adapter
- `packages/cds-mcp-adapter/` — Existing MCP server to extend with new tools (currently has no src/ — check actual structure)

### CLI
- `bin/cli.mjs` — CLI router where new `search` and `graph` commands are added
- `lib/shared.mjs` — Color constants (c.X), output helpers (ok/fail/warn/info)

### Research
- `.planning/research/STACK.md` — minisearch ^7.2.0 recommended
- `.planning/research/FEATURES.md` — cross-project search as P1, auto-suggestion details
- `.planning/research/PITFALLS.md` — FTS5 ATTACH limitations

### Hooks
- `hooks/session-start-context.sh` — Existing SessionStart hook to extend with auto-suggestion

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `searchAllProjects()` from Phase 43 — the core search primitive. MCP tool wraps it.
- `getEntityGraph()` from Phase 43 — the core graph primitive. MCP tool wraps it.
- `searchObservations()` in sessions.ts — single-project FTS5 search (existing pattern).
- `c.X` color constants in shared.mjs — for colored CLI output.
- `session-start-context.sh` — existing hook that loads context.md into session preamble.

### Established Patterns
- MCP tools in `@cds/mcp-adapter` follow the MCP SDK `server.tool()` pattern.
- CLI commands in `lib/` export `main(args)` function, called from `bin/cli.mjs` switch.
- SessionStart hooks chain: shell script calls node process if needed.

### Integration Points
- `@cds/mcp-adapter` — add `sessions.searchAll` and `memory.graph` tools
- `bin/cli.mjs` — add `search` and `graph` subcommands
- `hooks/session-start-context.sh` — extend with auto-suggestion output

</code_context>

<specifics>
## Specific Ideas

- Auto-suggestion should feel like GitHub Copilot's "You might also need..." — brief, non-intrusive, and skippable.
- MiniSearch fuzzy distance=2 handles typos like "sesion" → "session" without returning garbage.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-project graph merging** — too noisy for v1.1, deferred
- **Pagination for searchAll** — limit=20 is sufficient for v1.1
- **Persistent MiniSearch index** — stale risk not worth the perf gain at current scale

</deferred>

---

*Phase: 45-cross-project-search-graph-mcp-tools*
*Context gathered: 2026-04-17*
