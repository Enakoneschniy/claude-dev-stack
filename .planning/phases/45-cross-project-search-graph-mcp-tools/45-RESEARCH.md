# Phase 45: Cross-Project Search + Graph + MCP Tools — Research

**Researched:** 2026-04-17
**Phase Goal:** Users can search memory across all projects and visualize entity relationships — both via CLI and MCP tools consumed by Claude Code.
**Depends on:** Phase 43 (searchAllProjects + getEntityGraph primitives — COMPLETE)

---

## 1. Existing Primitives from Phase 43

Phase 43 delivered the core data layer that Phase 45 consumes:

### 1.1 searchAllProjects() — `packages/cds-core/src/vault/multi-search.ts`
- **Signature:** `searchAllProjects(query: string, options?: { vaultPath?: string; limit?: number }): CrossSearchHit[]`
- **Mechanism:** Discovers `~/vault/projects/*/sessions.db`, batches DB connections in groups of 9, queries FTS5 per DB (MATCH does not support schema-qualified tables with ATTACH), merges results by BM25 rank.
- **Return type:** `CrossSearchHit { project, observationId, sessionId, type, content, entities, createdAt, sessionSummary, rank }`
- **Exported from:** `@cds/core` via `vault/index.ts` barrel.

### 1.2 getEntityGraph() — `packages/cds-core/src/vault/graph.ts`
- **Signature:** `getEntityGraph(projectPath: string): EntityGraph`
- **Mechanism:** Opens project's `sessions.db` read-only, queries `entities` and `relations` tables, computes frequency-based edge weights via SQL GROUP BY.
- **Return type:** `EntityGraph { nodes: GraphNode[], edges: GraphEdge[] }` — framework-agnostic (NOT cytoscape-native).
- **Exported from:** `@cds/core` via `vault/index.ts` barrel.

### 1.3 Existing MCP Server — `packages/cds-cli/src/mcp-server.ts`
- 5 existing tools: `sessions.search`, `sessions.timeline`, `sessions.get_observations`, `docs.search`, `planning.status`
- Pattern: tool definitions as const array (`TOOL_DEFINITIONS`), switch-case dispatch in `CallToolRequestSchema` handler.
- Each tool module exports an async function + Args type + Deps type. Server resolves `sessions.db` path via `resolveSessionsDBPath()`.
- Tool modules live in `packages/cds-cli/src/mcp-tools/`.
- Error hierarchy in `shared.ts`: `CdsMcpError` extends `McpError`, specialized errors for each domain.

### 1.4 Existing CLI Search — `packages/cds-cli/src/search.ts`
- Single-project search only: wraps `sessionsSearch` from MCP tools module.
- No `--global` flag. Resolves DB from `process.cwd()`.
- Output format: `[type] snippet\n  session: id | date`

---

## 2. New Deliverables Analysis

### 2.1 CLI: `cds search --global "query"` (MEM-01)

**What's needed:** Add `--global` flag to existing `search.ts` CLI command.

**Implementation approach:**
- Parse `--global` from args (position-independent flag extraction).
- When `--global`: call `searchAllProjects()` from `@cds/core` instead of `sessionsSearch()`.
- Format output to include project name: `[project] [type] snippet\n  session: id | date`.
- When NOT `--global`: preserve existing single-project behavior.

**Key consideration:** `searchAllProjects()` is synchronous (better-sqlite3), so no async changes needed at the data layer. The CLI main() is already async for consistency.

### 2.2 MCP Tool: `sessions.searchAll` (MEM-03)

**What's needed:** New MCP tool that wraps `searchAllProjects()` from `@cds/core`.

**Implementation approach:**
- New file: `packages/cds-cli/src/mcp-tools/sessions-search-all.ts`
- Follow existing pattern from `sessions-search.ts`: export async function + Args type.
- Input schema: `{ query: string, limit?: number, vaultPath?: string }`
- Output: same as CLI — `CrossSearchHit[]` with project attribution.
- Register in `mcp-server.ts`: add to `TOOL_DEFINITIONS` array, add case to switch.

**Key consideration:** `vaultPath` param allows override for testing (mirrors `CDS_TEST_VAULT` env pattern). Default discovery uses `VAULT_PATH` env or `~/vault`.

### 2.3 MCP Tool: `memory.graph` (MEM-05)

**What's needed:** New MCP tool that wraps `getEntityGraph()` from `@cds/core`.

**Implementation approach:**
- New file: `packages/cds-cli/src/mcp-tools/memory-graph.ts`
- Input schema: `{ project?: string }` — defaults to cwd project basename.
- Output: `EntityGraph` (nodes + edges arrays).
- Register in `mcp-server.ts`: add to `TOOL_DEFINITIONS` array, add case to switch.

**Key consideration:** `getEntityGraph()` takes a `projectPath` string (used as `basename()` internally to resolve vault path). The MCP tool should accept an optional `project` basename and default to `process.cwd()`. Use `assertValidScopeBasename()` from `shared.ts` for path-traversal protection.

### 2.4 SessionStart Hook Auto-Surface (MEM-06)

**What's needed:** Enhance existing `memory.ts` SessionStart hook to auto-surface relevant past observations using combined fuzzy + FTS5 search.

**Current state:** `memory.ts` simply lists the 3 most recent sessions with observation counts and topic snippets. No search/relevance involved.

**Implementation approach:**
- Add MiniSearch fuzzy matching on top of existing FTS5 search.
- Build a MiniSearch index from recent observations (last N sessions).
- Use project context (cwd basename, recent files, git branch) as implicit query.
- Combine MiniSearch fuzzy results with FTS5 exact results, deduplicate by observation ID, rank by combined score.
- Append "Relevant past observations:" section to the memory output.

**Key consideration:** MiniSearch must be added as a dependency to `@cds/cli` (NOT `@cds/core` — core stays dependency-light). The index is built in-memory per invocation (no persistence needed — hook runs once per session start).

### 2.5 Auto-Suggestion: Fuzzy + FTS5 Combined (MEM-07)

**What's needed:** Ensure search (both CLI and MCP) correctly handles misspelled/partial queries via MiniSearch fuzzy and exact-phrase queries via FTS5.

**Implementation approach:**
- Create a shared utility function: `combinedSearch(query, dbPath, options)` that:
  1. Runs FTS5 MATCH for exact/phrase results (existing `sessionsSearch`).
  2. Builds MiniSearch index from recent observations (configurable window).
  3. Runs MiniSearch `search()` with `{ fuzzy: 0.2, prefix: true }` for fuzzy/partial matches.
  4. Merges results, deduplicates by observation ID, re-ranks by combined score.
- This utility is used by both the SessionStart hook and potentially by a future auto-suggest endpoint.

**Key consideration:** MiniSearch index building has a cost. For SessionStart hook, limit to last 100-200 observations. For search commands, the FTS5 path handles most queries well — MiniSearch is the fallback for typos/partial matches.

---

## 3. MiniSearch Integration

### 3.1 Library: minisearch ^7.2.0
- Zero dependencies, ~8KB gzipped.
- Supports: full-text indexing, fuzzy matching (Levenshtein-based), prefix search, field boosting, auto-suggest.
- API: `new MiniSearch({ fields, storeFields })` → `.addAll(docs)` → `.search(query, { fuzzy, prefix })`.
- Already recommended by `.planning/research/STACK.md` from Phase 43.

### 3.2 Integration Pattern
```typescript
import MiniSearch from 'minisearch';

const miniSearch = new MiniSearch({
  fields: ['content', 'type'],
  storeFields: ['content', 'type', 'sessionId', 'createdAt'],
  searchOptions: { fuzzy: 0.2, prefix: true },
});

// Add observations from DB
miniSearch.addAll(observations.map(o => ({ id: o.id, ...o })));

// Search returns scored results
const fuzzyHits = miniSearch.search(query);
```

### 3.3 Dependency Placement
- Install in `packages/cds-cli/package.json` (not cds-core).
- The combined search utility lives in `packages/cds-cli/src/` since it bridges core primitives with MiniSearch.

---

## 4. Architecture: File Layout

```
packages/cds-cli/src/
  mcp-tools/
    sessions-search-all.ts      # NEW — sessions.searchAll MCP tool
    sessions-search-all.test.ts  # NEW — tests
    memory-graph.ts              # NEW — memory.graph MCP tool
    memory-graph.test.ts         # NEW — tests
  search.ts                      # MODIFY — add --global flag
  search.test.ts                 # MODIFY — add --global tests
  memory.ts                      # MODIFY — add fuzzy auto-surface
  memory.test.ts                 # MODIFY — add auto-surface tests
  mcp-server.ts                  # MODIFY — register 2 new tools
  mcp-server.test.ts             # MODIFY — add new tool tests
```

---

## 5. Validation Architecture

### Dimension 1: Functional Correctness
- `cds search --global "query"` returns results with project attribution
- `sessions.searchAll` MCP tool returns CrossSearchHit[] via stdio
- `memory.graph` MCP tool returns EntityGraph via stdio
- SessionStart hook output includes "Relevant past observations:" section

### Dimension 2: Edge Cases
- `--global` with no project vaults → empty results, no crash
- `memory.graph` with empty entities/relations → `{ nodes: [], edges: [] }`
- FTS5 unavailable in a project DB → that project skipped, others still searched
- MiniSearch with empty index → graceful fallback to FTS5-only results

### Dimension 3: Performance
- MiniSearch index build for 200 observations < 50ms
- Cross-project search with 10+ projects completes < 2s
- SessionStart hook total time < 500ms (including fuzzy matching)

### Dimension 4: Integration
- New MCP tools listed by `ListToolsRequest`
- Existing 5 tools unchanged (no regression)
- `@cds/core` exports unchanged (Phase 43 primitives consumed as-is)

### Dimension 5: Security
- `assertValidScopeBasename()` applied to project param in `memory.graph`
- No path traversal via `vaultPath` override (restricted to vault directory)

---

## 6. Assumptions

- **A1:** MiniSearch 7.x is stable and its API is unchanged. Confirmed via npm (7.2.0 published, 355 dependents).
- **A2:** Phase 43 primitives (`searchAllProjects`, `getEntityGraph`) are complete and tested. Confirmed from 43-01-SUMMARY.md and 43-02-SUMMARY.md.
- **A3:** `@modelcontextprotocol/sdk` is already a dependency of `cds-cli`. Confirmed from existing `mcp-server.ts` imports.
- **A4:** The SessionStart hook is invoked via `cds memory` CLI command (see `memory.ts:main()`). The hook script calls this binary.
- **A5:** MiniSearch should be a runtime dependency of `cds-cli`, not a dev dependency. It's used at runtime in the SessionStart hook.

---

## 7. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| MiniSearch index build too slow for large vaults | Medium | Cap at 200 most recent observations; lazy-build only when fuzzy needed |
| FTS5 syntax errors from user queries passed to MiniSearch | Low | MiniSearch has its own query parser — FTS5 syntax is not passed through |
| MCP server tool count growing (5→7) affecting startup | Low | Tools are just metadata objects; no perf impact until called |
| SessionStart hook timeout with many projects | Medium | Auto-surface uses single-project DB only (not cross-project) |

---

## RESEARCH COMPLETE
