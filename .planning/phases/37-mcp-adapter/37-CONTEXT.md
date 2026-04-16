# Phase 37: MCP Adapter - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a Model Context Protocol (MCP) server inside `packages/cds-cli/` that exposes 5 query tools over SQLite Tier 2 sessions (Phase 35) + markdown docs (Tier 1) + GSD planning state. Wizard registers the server in each configured project's `.claude/settings.json` under `mcp.servers`. The server runs on-demand via `claude-dev-stack mcp serve` stdio transport.

**Deliverables:**
1. **`packages/cds-cli/src/mcp-server.ts`** — MCP server using `@modelcontextprotocol/sdk@1.29.0` (MIT). Registers 5 tools, handles stdio transport.
2. **`packages/cds-cli/src/mcp-tools/`** directory with 5 tool implementations:
   - `sessions-search.ts` — FTS5 query over `observations_fts` with structured filters
   - `sessions-timeline.ts` — chronological context around anchor observation
   - `sessions-get-observations.ts` — fetch full rows by IDs
   - `docs-search.ts` — on-demand ripgrep (with POSIX grep fallback) over `vault/projects/**/docs/`
   - `planning-status.ts` — parse `.planning/ROADMAP.md` + `.planning/STATE.md` into structured JSON
3. **`bin/cli.mjs` surgical update** — add `case 'mcp':` routing to dynamic-import `packages/cds-cli/dist/mcp-server.js` `main(args)`. Does NOT change `package.json` `"bin"` field (preserves Phase 33 D-03).
4. **`lib/install/mcp.mjs` wizard update** — register the CDS MCP server in each configured project's `.claude/settings.json` `mcp.servers` map with key `"cds"`. Idempotent. Handles users with custom MCP entries without stomping them.
5. **NOTICES.md append** — add `@modelcontextprotocol/sdk` (MIT) entry.

**Explicitly NOT in scope for Phase 37:**
- Creating a second SQLite DB for docs (indexing is on-demand via ripgrep per D-76)
- HTTP/SSE transport (stdio only, which is what Claude Code uses)
- Authentication / authorization (stdio local → inherits OS process permissions)
- Managing third-party MCP servers (`lib/mcp.mjs` catalog is UNTOUCHED — different concern)
- Multi-project session aggregation in sessions.search (single project = single DB, per Phase 35 D-48)
- Streaming/pagination for large result sets (paginate in v1.1+ if needed)

</domain>

<decisions>
## Implementation Decisions

### docs.search Implementation (D-73 … D-76)
- **D-73:** **On-demand ripgrep wrapper** — `docs.search(query, scope?)` spawns `rg --json --type md --context 2` against `vault/projects/{project}/docs/` (default scope) or `vault/projects/*/docs/` (cross-project if `scope: 'all'`). Results streamed back as structured JSON (file, line, match, context). No persistent index maintained. Matches are fresh because they're grepped live each call.
- **D-74:** **POSIX grep fallback** — if `rg` is not on `PATH`, fall back to `grep -rnE -C 2 --include='*.md'`. Result shape normalized to the same JSON structure as ripgrep output. Single-line summary logged: `ripgrep not found, using POSIX grep (slower on large vaults)`.
- **D-75:** **Scope / security:** queries are restricted to paths INSIDE `~/vault/projects/*/docs/`. Path traversal outside vault is refused at the tool-input layer (input_schema rejects `scope` values containing `..` or absolute paths). The MCP tool never returns files outside the docs directory.
- **D-76:** No index maintenance. No file-watcher. No invalidation logic. `docs.search` is stateless per call. Tradeoff documented: on a 1000-file vault, regex-grep takes ~100–500ms depending on query complexity — acceptable for an interactive MCP tool.

### MCP Tool Schemas (D-77 … D-81)
- **D-77:** **sessions.search** input_schema:
  ```ts
  {
    query: string,                          // FTS5 query syntax pass-through ("monorepo AND (sqlite OR vault)")
    filters?: {
      date_from?: string,                   // ISO 8601 date
      date_to?: string,                     // ISO 8601 date
      project?: string,                     // project basename (default: cwd project)
      type?: string[],                      // observation types, OR semantics
      session_id?: string,                  // scope to single session
      limit?: number                        // default: 20, max: 100
    }
  }
  ```
  Output: `{ hits: Array<{ observation_id, session_id, type, content, entities: string[], created_at, rank: number }>, total_matched: number, query_time_ms: number }`. FTS5 BM25 ranking applied; `rank` is the BM25 score (lower = better).
- **D-78:** **sessions.timeline** input_schema:
  ```ts
  {
    anchor_observation_id: number,
    window_before?: number,                 // default: 5, max: 20
    window_after?: number                   // default: 5, max: 20
  }
  ```
  Output: `{ observations: Array<{ id, session_id, type, content, entities, created_at, offset: number }>, anchor_id: number }`. `offset` is the position relative to the anchor (0 = anchor, -1 = immediately before, etc.). Ordered chronologically.
- **D-79:** **sessions.get_observations** input_schema:
  ```ts
  {
    ids: number[],                          // max: 50 per call
    format?: 'raw' | 'summary'              // default: 'raw'
  }
  ```
  Output (raw): full `Observation` rows. Output (summary): `{ id, type, content: <first 140 chars>, entities: string[] }[]` for cheap bulk fetch.
- **D-80:** **docs.search** input_schema:
  ```ts
  {
    query: string,                          // regex (ripgrep-compatible, PCRE subset)
    scope?: 'current' | 'all' | string,     // default: 'current' (cwd project); 'all' = all projects; string = specific project basename
    limit?: number                          // default: 20, max: 100
  }
  ```
  Output: `{ hits: Array<{ file: string (vault-relative), line: number, match: string, context_before: string[], context_after: string[] }>, total: number }`.
- **D-81:** **planning.status** input_schema:
  ```ts
  { project?: string }                      // basename, default: cwd project
  ```
  Output: `{ project: string, milestone: { version: string, name: string, status: 'planning' | 'in-progress' | 'complete' }, phases: { total: number, completed: number, in_progress: number, pending: number }, current_phase?: { number: string, name: string, disk_status: string, plan_count: number }, progress_percent: number, last_activity?: string (ISO date), critical_risks?: string[] }`. If no `.planning/` in project root, throws `NotAGsdProjectError`.

### Common MCP Envelope (D-82 … D-83)
- **D-82:** All tool errors are thrown as `McpError` with typed codes: `NotAGsdProjectError`, `SessionNotFoundError`, `InvalidFilterError`, `RipgrepMissingError` (informational, not blocking — falls back to grep), `VaultNotFoundError`, `FTS5UnavailableError`. MCP SDK translates these into MCP error responses with `code` + `message` fields. No silent failures.
- **D-83:** No pagination tokens in Phase 37. `limit` clamps result size; callers needing more results re-query with stricter filters or explicit ID lists. Cursor-based pagination deferred to v1.1+ if real usage hits limits.

### planning.status Parser Scope (D-84 … D-86)
- **D-84:** Parser ONLY processes projects that have `.planning/ROADMAP.md` + `.planning/STATE.md` in the project root. No scanning parent dirs, no vault-path probing. If `project` arg is provided, resolution order: (1) exact match against a known project registered in `~/vault/project-map.json`, (2) if not found, try `~/vault/projects/{project}` base directory for the `.planning/` pair, (3) if still not found, throw `NotAGsdProjectError`.
- **D-85:** Parser is **lenient on ROADMAP.md format drift** — uses a best-effort extraction pattern:
  - Finds `## Milestones` section; scans bullets for `✅` (complete) / `🚧` (in-progress) markers.
  - Finds `### Phases` or `## Phases` section; counts `- [ ]` (pending), `- [x]` (complete), `◆` (active) markers.
  - Reads STATE.md frontmatter YAML `status:`, `milestone:`, `progress:` fields.
  - Missing fields degrade gracefully: output omits the key rather than throwing.
- **D-86:** `current_phase` is derived from `STATE.md` "Current Position" section text. Parser extracts `Phase: X - Name` via regex. If ambiguous (multiple phases active), returns the first one. Known to be lossy for parallel-execution scenarios — acceptable for v1.0.

### CLI Wiring & Wizard Registration (D-87 … D-90)
- **D-87:** **`bin/cli.mjs` stays `.mjs` router.** Phase 37 adds a new case:
  ```js
  case 'mcp': {
    const mcp = await import(path.join(__dirname, '..', 'packages', 'cds-cli', 'dist', 'mcp-server.js'));
    await mcp.main(args);
    break;
  }
  ```
  This preserves Phase 33 D-03 (root `"bin"` field unchanged — only `claude-dev-stack` binary, no new entry).
- **D-88:** **Wizard key: `"cds"`** in `mcp.servers` map. Short, branded, matches existing CDS CLI alias conventions.
- **D-89:** **Registration entry shape** in project's `.claude/settings.json`:
  ```json
  {
    "mcp.servers": {
      "cds": {
        "command": "claude-dev-stack",
        "args": ["mcp", "serve"]
      }
    }
  }
  ```
  Uses the `claude-dev-stack` command directly (assumes user has it on PATH — installed globally via `npm install -g` or accessible via `npx`). Fallback if executable resolution is flaky: `{ command: "npx", args: ["-y", "claude-dev-stack", "mcp", "serve"] }` — planner decides whether to default to direct or npx based on install pattern.
- **D-90:** **Idempotent wizard logic** in `lib/install/mcp.mjs`:
  - Read `.claude/settings.json`. Find `mcp.servers.cds` key.
  - If exists with matching `command`/`args`: no-op (log `MCP server already registered`).
  - If exists with DIFFERENT command (user customized): update to current recommended shape + log warning `⚠ Updated MCP server 'cds' to current recommended configuration. Previous: {before}`.
  - If absent: add entry.
  - Other `mcp.servers.*` entries (custom, third-party) are NEVER touched.
  - If `mcp.servers` doesn't exist at all: create the map.

### Claude's Discretion
- Exact JSON schema shape per MCP SDK `Server.setRequestHandler` registration (planner implements per SDK docs)
- Whether `sessions.search` supports OR-union filters between `project` and `session_id` (planner decides based on simplicity — default: AND semantics)
- FTS5 tokenizer choice for observations_fts (default `unicode61` probably sufficient, planner confirms)
- `sessions.timeline` ordering for same-timestamp observations (tie-break by ID ascending)
- Whether `npx`-style registration or direct-command is default in D-89 (planner picks based on Phase 33/39 install pattern evidence)
- Whether `docs.search` preserves ANSI color codes from ripgrep stdout (strip them, default)
- Error class hierarchy details

### Folded Todos
- None — Phase 37 introduces the consumption layer for Phase 35 data (first real consumer besides Phase 36 hook).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §MCP-01, MCP-02 — 5-tool catalog, wizard idempotency, MCP spec conformance
- `.planning/ROADMAP.md` §"Phase 37: MCP Adapter" — Success Criteria 1-4
- `.planning/PROJECT.md` §Constraints — single-dep on CLI surface (but @modelcontextprotocol/sdk is @cds/cli internal infra, not on root package `prompts` surface)

### Prior Phase Contexts (carry-forward) — MANDATORY reads
- `.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md` — `openSessionsDB` API (D-48), schema shape (D-43..D-47), FTS5 observations_fts (D-46), open-string entity types (D-45)
- `.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md` — (referenced only; Phase 37 does NOT call dispatchAgent directly — MCP tools are pure DB/fs queries)
- `.planning/phases/33-monorepo-foundation/33-CONTEXT.md` — @cds/cli scaffold layout, private scope, TS NodeNext, root package.json `bin` unchanged (D-03)
- `.planning/phases/36-auto-session-capture/36-CONTEXT.md` — (informational; MCP server queries data captured by Phase 36 hook but doesn't depend on it at code level)

### External / Live Docs (for research phase)
- https://modelcontextprotocol.io/docs — MCP spec
- https://github.com/modelcontextprotocol/typescript-sdk — SDK docs, v1.29.0 stable
- Claude Code `.claude/settings.json` `mcp.servers` map format (verified in existing CDS `lib/mcp.mjs`)
- SQLite FTS5 query syntax — https://sqlite.org/fts5.html#full_text_query_syntax
- Ripgrep JSON output format — `rg --help | grep json`

### Existing Code (Phase 37 does NOT modify)
- `lib/mcp.mjs` — third-party MCP server catalog. Untouched in Phase 37.
- `lib/install/hooks.mjs` — Phase 36's hook registration. Unrelated (different settings.json key).

### Existing Code (Phase 37 modifies)
- `bin/cli.mjs` — add `case 'mcp':` route
- `lib/install/mcp.mjs` — NEW CDS server registration logic (existing module is catalog-focused; extension needed OR new function)
- `NOTICES.md` — append `@modelcontextprotocol/sdk` entry

</canonical_refs>

<code_context>
## Existing Code Insights

### Primitives consumed
- `@cds/core/src/vault/sessions.ts` (Phase 35) — `openSessionsDB(projectPath)`, search/timeline/get APIs exposed through this module. MCP server wraps but does not bypass.
- `@cds/core/src/vault/*` — schema types (Session, Observation, Entity, Relation) re-exported for MCP tool return types.

### New files (Phase 37)
- `packages/cds-cli/src/mcp-server.ts` — entry point, SDK setup, tool registration, stdio transport
- `packages/cds-cli/src/mcp-tools/sessions-search.ts`
- `packages/cds-cli/src/mcp-tools/sessions-timeline.ts`
- `packages/cds-cli/src/mcp-tools/sessions-get-observations.ts`
- `packages/cds-cli/src/mcp-tools/docs-search.ts`
- `packages/cds-cli/src/mcp-tools/planning-status.ts`
- `packages/cds-cli/src/mcp-tools/shared.ts` — McpError hierarchy, shared types, input validation helpers
- `packages/cds-cli/src/mcp-tools/planning-parsers.ts` — ROADMAP.md + STATE.md parsers
- `packages/cds-cli/src/*.test.ts` — per-tool unit tests with fixture DBs + fixture markdown

### Modified files
- `packages/cds-cli/package.json` — add `dependencies: { "@modelcontextprotocol/sdk": "^1.29.0" }`
- `packages/cds-cli/src/index.ts` — add `export { main as mcpServerMain } from './mcp-server.js'` (or similar re-export)
- `bin/cli.mjs` — surgical case addition (D-87)
- `lib/install/mcp.mjs` — add/update CDS server registration logic (D-90)
- `NOTICES.md` — append SDK license entry

### Integration Points
- `bin/cli.mjs` → `packages/cds-cli/dist/mcp-server.js` (dynamic import at subcommand dispatch time)
- `mcp-server.ts` → `@cds/core/vault/sessions.ts` (internal workspace dep)
- Wizard → user project `.claude/settings.json` (existing file, surgical update)

### Constraints to Factor Into Planning
- MCP spec compliance validated via `@modelcontextprotocol/sdk` types — if it type-checks, schemas are conformant
- `ripgrep` on PATH check: detect at tool-call time, not at server startup — server should start successfully even without rg installed
- Path traversal protection for docs.search (D-75) must NOT allow escaping `~/vault/projects/*/docs/`
- FTS5 MATCH query syntax passed through raw — if user sends invalid FTS5 syntax, catch the SQLITE_ERROR and return `InvalidFilterError` with SQLite's error message
- MCP server subprocess runs on-demand per Claude Code session; no daemon state persists between calls within a single invocation (stateless design)
- Tests MUST NOT hit `~/vault` — use `tmpdir()` with fixture DBs and markdown for all test runs
- `NODE_ENV=test` or `CDS_TEST_VAULT=/tmp/...` env var override for test determinism — planner decides pattern

</code_context>

<specifics>
## Specific Ideas

- `docs.search` via ripgrep is the pragmatic choice — indexing docs in a separate SQLite table would tie Phase 37 to Phase 35's DB lifecycle, and docs can change outside CDS control (Notion import, user edits). Live grep is source-of-truth.
- Path traversal protection (D-75) is the ONLY security-hardening concern in Phase 37. MCP is a local protocol over stdio — no network surface, no auth needed. But tool inputs ARE attacker-controlled (Claude itself could misinterpret user request and inject `../`), so validate at the tool-input boundary.
- `planning.status` parser is deliberately lenient (D-85) because ROADMAP.md format is evolving (v0.12 vs v1.0 reorganization). Strict parsing would break on format drift.
- MCP error `McpError` hierarchy is JSON-serializable — Claude consumers can pattern-match on `code` field for programmatic handling.
- Lightweight package consumption: @modelcontextprotocol/sdk is a small dep (~100KB gzipped). Adding it to `@cds/cli` does not compromise the "bundled tarball stays lean" promise for Phase 39.

</specifics>

<deferred>
## Deferred Ideas

### For Phase 38 (Backfill — consumes sessions.db populated by Phase 36 + 38)
- sessions.search results improve post-backfill when historical markdown sessions are in the DB.
- planning.status can query historical phase data once backfill completes.

### For Phase 39 (Alpha Release)
- Migration guide entry: "v1.0 exposes MCP tools — configure via wizard or manually register in .claude/settings.json."
- `/cds-quick` uses `sessions.search` or `planning.status` as part of its demo flow (showcases MCP integration).

### For v1.1+
- HTTP/SSE transport (non-stdio) for remote MCP clients
- Cursor-based pagination
- Subscription tools (watch for new observations)
- Separate docs.db FTS5 index (if ripgrep latency becomes a bottleneck)
- Cross-project sessions.search federation
- Schema introspection tool `sessions.schema` returning the observations_fts structure

### Reviewed Todos (not folded)
- None — `todo match-phase 37` returned zero matches.

</deferred>

---

*Phase: 37-mcp-adapter*
*Context gathered: 2026-04-16*
