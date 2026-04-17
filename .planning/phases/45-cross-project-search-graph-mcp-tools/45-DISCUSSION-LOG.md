# Phase 45: Cross-Project Search + Graph + MCP Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-17
**Phase:** 45-cross-project-search-graph-mcp-tools
**Areas discussed:** MCP tool design, Auto-suggestion, MiniSearch integration, CLI output format

---

## MCP Tool: sessions.searchAll

| Option | Description | Selected |
|--------|-------------|----------|
| Simple query + limit (Recommended) | params: { query, limit? }. No filters. | |
| Query + filters | params: { query, limit, project?, type?, dateRange? }. More powerful. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Query + filters

---

## MCP Tool: memory.graph

| Option | Description | Selected |
|--------|-------------|----------|
| Current project only (Recommended) | params: { minWeight? }. Single project. | ✓ |
| Multi-project graph | Merge across projects. Complex, noisy. | |
| You decide | Claude picks. | |

**User's choice:** Current project only (Recommended)

---

## Auto-Suggestion

| Option | Description | Selected |
|--------|-------------|----------|
| Top-3 recent + related (Recommended) | 3 relevant observations based on project name + recent topics. | |
| Smart context window | Analyze current files/branch for relevant observations. | ✓ |
| You decide | Claude picks. | |

**User's choice:** Smart context window

---

## MiniSearch Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Build on-demand (Recommended) | Fresh index from SQLite at query time. FTS5 first, MiniSearch fallback. | ✓ |
| Persist JSON index | Store in SQLite as JSON blob. Faster but stale risk. | |
| You decide | Claude picks. | |

**User's choice:** Build on-demand (Recommended)

---

## CLI Output Format

| Option | Description | Selected |
|--------|-------------|----------|
| Colored table (Recommended) | ANSI table with c.X colors. --json flag for machine-readable. | ✓ |
| Plain text lines | One per line, pipe-friendly. | |
| You decide | Claude picks. | |

**User's choice:** Colored table (Recommended)

---

## Deferred Ideas

- Multi-project graph merging
- searchAll pagination
- Persistent MiniSearch index
