# Phase 37: MCP Adapter - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-16
**Phase:** 37-mcp-adapter
**Areas:** docs.search implementation, MCP tool schemas + filters, planning.status scope, cds mcp serve wiring

---

## Pre-Discussion

Verified `@modelcontextprotocol/sdk@1.29.0` is MIT licensed. Existing `lib/mcp.mjs` handles third-party MCP server catalog (Sentry, Linear, Filesystem) — unrelated to Phase 37's OWN MCP server.

---

## Gray Area Selection

All 4 selected.

---

## docs.search Implementation Strategy

| Option | Selected |
|--------|----------|
| On-demand ripgrep wrapper (Recommended) | ✓ |
| Separate docs.db FTS5 index | |
| Defer — return 'not implemented' | |

**User's choice:** On-demand ripgrep wrapper.
**Notes:** `rg --json --type md -C 2`. POSIX grep fallback if no rg. Path traversal protection restricts to `~/vault/projects/*/docs/`. Stateless, no index maintenance.

---

## MCP Tool Schemas + Filters

| Option | Selected |
|--------|----------|
| Rich structured filters (Recommended) | ✓ |
| Minimal (query only) | |
| Dict-style filters (loose) | |

**User's choice:** Rich structured filters.
**Notes:** sessions.search accepts query + typed filters (date_from, date_to, project, type, session_id, limit). sessions.timeline by observation count windows. sessions.get_observations with format toggle. docs.search with scope. planning.status by project basename. Structured JSON outputs with FTS5 BM25 rank.

---

## planning.status Scope & Structure

| Option | Selected |
|--------|----------|
| CDS-managed + structured JSON (Recommended) | ✓ |
| Raw markdown return | |
| Generalized any-.planning/ parser | |

**User's choice:** CDS-managed + structured JSON.
**Notes:** Throws `NotAGsdProjectError` if no `.planning/`. Lenient parser on ROADMAP/STATE format drift. Output includes milestone, phases counts, current_phase, progress_percent, critical_risks.

---

## CLI Wiring + Wizard Registration

| Option | Selected |
|--------|----------|
| bin/cli.mjs routes to cds-cli + key `cds` (Recommended) | ✓ |
| New bin/cds-mcp.mjs entry | |
| Inline in cli.mjs (no routing) | |

**User's choice:** bin/cli.mjs routes to cds-cli + key `cds`.
**Notes:** bin/cli.mjs stays `.mjs` router, adds `case 'mcp':` dynamic import to `packages/cds-cli/dist/mcp-server.js`. Preserves Phase 33 D-03 (root `bin` unchanged). Wizard key `cds`. Registration command `claude-dev-stack mcp serve`. Idempotent — never touches third-party `mcp.servers.*` entries.

---

## Claude's Discretion

- Exact MCP SDK Server.setRequestHandler shape
- sessions.search AND vs OR semantics between project+session_id
- FTS5 tokenizer (likely unicode61)
- Tie-break rule for same-timestamp observations in timeline
- npx vs direct-command default for registration
- ANSI color stripping from ripgrep output
- McpError hierarchy details

## Deferred Ideas

- **Phase 38:** sessions.search quality improves post-backfill
- **Phase 39:** Migration guide MCP section, /cds-quick showcases MCP
- **v1.1+:** HTTP/SSE transport, cursor pagination, subscription tools, docs.db FTS5 index if latency bottleneck

---

*Generated: 2026-04-16*
