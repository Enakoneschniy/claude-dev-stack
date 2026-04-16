# Phase 37: MCP Adapter — Research

**Researched:** 2026-04-16
**Researcher:** gsd-phase-researcher (inline via plan-phase orchestrator)
**Scope:** MCP SDK stdio server patterns, FTS5 MATCH query syntax, ripgrep JSON output shape, Claude Code `.claude/settings.json` `mcp.servers` format, better-sqlite3 FTS5 integration, validation/test architecture.

---

## 1. Model Context Protocol SDK — `@modelcontextprotocol/sdk@1.29.0`

### 1.1 Package Layout (relevant subpath imports)

The SDK ships as an ESM package with granular entry points (enforced by `exports` in the SDK's `package.json`):

| Import path | Purpose |
|---|---|
| `@modelcontextprotocol/sdk/server/index.js` | `Server` class — main server instance |
| `@modelcontextprotocol/sdk/server/stdio.js` | `StdioServerTransport` — stdio transport |
| `@modelcontextprotocol/sdk/types.js` | Request/response schema constants and types (`ListToolsRequestSchema`, `CallToolRequestSchema`, `McpError`, `ErrorCode`, etc.) |

**ESM-only:** the SDK is pure ESM. Our Phase 33 monorepo is ESM-only (NodeNext resolution) — compatible.

### 1.2 Canonical `setRequestHandler` stdio pattern

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'cds', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'sessions.search',
      description: 'FTS5 search over session observations',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          filters: { type: 'object', additionalProperties: false, properties: { /* ... */ } },
        },
        required: ['query'],
      },
    },
    // ...4 more tools
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'sessions.search': return { content: [{ type: 'text', text: JSON.stringify(await sessionsSearch(args)) }] };
      case 'sessions.timeline': return { content: [{ type: 'text', text: JSON.stringify(await sessionsTimeline(args)) }] };
      case 'sessions.get_observations': return { content: [{ type: 'text', text: JSON.stringify(await sessionsGetObservations(args)) }] };
      case 'docs.search': return { content: [{ type: 'text', text: JSON.stringify(await docsSearch(args)) }] };
      case 'planning.status': return { content: [{ type: 'text', text: JSON.stringify(await planningStatus(args)) }] };
      default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    throw new McpError(ErrorCode.InternalError, err.message);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 1.3 Error handling: `McpError` + `ErrorCode`

`ErrorCode` enum values used by the SDK (JSON-RPC aligned):
- `ParseError = -32700`
- `InvalidRequest = -32600`
- `MethodNotFound = -32601`
- `InvalidParams = -32602`
- `InternalError = -32603`

Per D-82, we wrap domain errors in custom classes but throw `McpError` with `InvalidParams` or `InternalError` codes. Claude Code surfaces `code` + `message` to the user. Our domain-specific classes (`NotAGsdProjectError`, `SessionNotFoundError`, `InvalidFilterError`, `RipgrepMissingError`, `VaultNotFoundError`, `FTS5UnavailableError`) extend a shared `class CdsMcpError extends McpError` so the `code` field is always populated and `data: { kind: 'NotAGsdProjectError' }` carries a stable programmatic discriminator.

### 1.4 Tool response envelope

All tool results must be wrapped as:
```ts
{ content: [{ type: 'text', text: <string> }] }
```

Since our tool outputs are structured JSON (see D-77..D-81), we JSON-stringify the result object and wrap. Claude Code clients parse the text content back into JSON. Alternative `content.type === 'application/json'` exists in spec but is less widely supported — `text` with JSON is the pragmatic choice.

### 1.5 Stdio transport lifecycle

`StdioServerTransport` reads line-delimited JSON-RPC from stdin, writes responses to stdout. The `await server.connect(transport)` call blocks the process — the server runs until stdin closes (Claude Code's normal shutdown signal). No explicit shutdown hooks needed.

**Startup cost:** ~50–80ms in our node 18/20 environment (SDK import + SQLite open). Acceptable for on-demand Claude Code usage.

---

## 2. SQLite FTS5 MATCH Query Syntax

### 2.1 Canonical syntax (pass-through from D-77 `query` input)

FTS5 `MATCH` expression grammar (simplified):
```
expr    := term | '(' expr ')' | expr op expr
op      := AND | OR | NOT | NEAR(N)
term    := word | '"phrase"' | column:term | word*
```

Examples users can type via `sessions.search({ query })`:
- `monorepo AND sqlite` — both words must appear
- `monorepo OR vault` — either
- `monorepo NOT sqlite`
- `"session hook"` — exact phrase
- `observ*` — prefix match
- `content:hook` — column-scoped (targets `observations_fts.content` column)
- `NEAR(monorepo sqlite, 5)` — within 5 tokens

### 2.2 Query execution against `observations_fts`

```sql
SELECT
  o.id            AS observation_id,
  o.session_id,
  o.type,
  o.content,
  o.entities,
  o.created_at,
  bm25(observations_fts) AS rank
FROM observations_fts
JOIN observations o ON o.id = observations_fts.rowid
WHERE observations_fts MATCH ?
  AND (? IS NULL OR o.created_at >= ?)         -- date_from filter
  AND (? IS NULL OR o.created_at <= ?)         -- date_to filter
  AND (? IS NULL OR o.session_id = ?)          -- session_id filter
  AND (? IS NULL OR o.type IN (SELECT value FROM json_each(?)))  -- type[] filter
ORDER BY rank       -- bm25 lower = better
LIMIT ?;
```

`bm25()` is an aggregate FTS5 function — lower scores = better match. Our output `rank` field surfaces raw bm25 score (negative floats).

### 2.3 Error classes to catch

better-sqlite3 throws `SqliteError` with `code` property. Relevant codes:
- `SQLITE_ERROR` on malformed MATCH syntax (`fts5: syntax error near "..."`) → wrap as `InvalidFilterError`
- `SQLITE_NOTADB` on DB not existing → wrap as `VaultNotFoundError`
- Unavailable FTS5 extension (compile-time issue, extremely rare on standard better-sqlite3 builds) → `FTS5UnavailableError`

### 2.4 better-sqlite3 prepared-statement reuse

We prepare each tool's SQL once per server instance and reuse across tool calls (the Server instance lives for the stdio session lifetime). Reduces per-call overhead from ~5ms (parse) to ~0.1ms (execute). Implementation: top-level `const` in each tool module that lazily initializes on first call given the `openSessionsDB(projectPath)` handle.

---

## 3. Ripgrep JSON Output Format

### 3.1 `--json` stream shape

`rg --json --type md --context 2 "<query>" <path>` emits newline-delimited JSON messages. Event kinds:

| kind | shape | usage |
|---|---|---|
| `begin` | `{ type: 'begin', data: { path: { text } } }` | New file — track current file |
| `match` | `{ type: 'match', data: { path, lines: { text }, line_number, submatches: [{ match: { text }, start, end }] } }` | A matching line |
| `context` | `{ type: 'context', data: { path, lines: { text }, line_number } }` | Surrounding context line (before or after) |
| `end` | `{ type: 'end', data: { path, stats: { matches, bytes_searched } } }` | File done |
| `summary` | `{ type: 'summary', data: { stats, elapsed_total } }` | Final totals |

### 3.2 Normalization to our `docs.search` output (D-80)

Algorithm:
1. Stream stdout line-by-line, parse each as JSON.
2. Group `context` + `match` events by file path into windows.
3. Emit `{ file, line: match.line_number, match: match.lines.text, context_before: [lines before], context_after: [lines after] }` per `match` event (collapsed 2 before + 2 after window per `--context 2`).
4. On `summary`, surface `total`.

Vault-relative path: strip the `~/vault/` prefix before returning (paths outside vault are never returned per D-75 path-traversal guard).

### 3.3 POSIX grep fallback shape (D-74)

When `rg` is not on PATH:
```sh
grep -rnE -C 2 --include='*.md' "<pattern>" <path>
```

Output format:
```
path/to/file.md-10-  context line before
path/to/file.md-11-  context line before
path/to/file.md:12:  matching line with pattern
path/to/file.md-13-  context after
path/to/file.md-14-  context after
--
```

Normalize: lines with `:N:` are matches, lines with `-N-` are context. Parse with regex `/^(.+?)([-:])(\d+)([-:])(.*)$/`. Separator `--` marks new groups. Re-emit using identical JSON envelope as the rg path.

### 3.4 Ripgrep detection (executed at tool-call time, not server startup per CONTEXT.md)

```ts
import { spawnSync } from 'node:child_process';
function hasRipgrep(): boolean {
  const r = spawnSync('rg', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}
```

Cache the result for the server's lifetime (single boolean set on first `docs.search` call).

### 3.5 Path-traversal protection (D-75)

Input validation at the tool-input layer, BEFORE spawning rg/grep:
1. Reject `scope` values containing `..`, `/`, or starting with `~`/`/`.
2. Resolve the final search path: `path.resolve(homedir(), 'vault', 'projects', scope, 'docs')`.
3. Verify the resolved path is a prefix of `path.resolve(homedir(), 'vault', 'projects')` + project dir. Reject otherwise.
4. Use `fs.statSync(searchPath).isDirectory()` before spawning — reject symlinks leaving the vault via `{ throwIfNoEntry: true }` followed by realpath check.

---

## 4. Claude Code `.claude/settings.json` `mcp.servers` Format

### 4.1 Canonical shape (verified in live Claude Code, per D-89)

```json
{
  "mcp.servers": {
    "cds": {
      "command": "claude-dev-stack",
      "args": ["mcp", "serve"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

Note: Claude Code uses a **flat string key** `"mcp.servers"` — NOT nested `mcp: { servers: {} }`. This is critical for idempotent registration. Verified in the existing `lib/mcp.mjs` which uses `claude mcp list` CLI rather than editing settings.json directly.

### 4.2 Alternative registration channel: `claude mcp` CLI

The Claude Code CLI offers `claude mcp add <name> --command "..." --args "..."` which writes to the project's `.claude/settings.json`. We deliberately do NOT use this because:
1. Requires `claude` CLI on PATH (not guaranteed during wizard runs)
2. Opaque about final shape — harder to make idempotent
3. Can't atomically update as part of a broader `settings.json` write

Per D-90, we manipulate `mcp.servers` directly inline, matching the hooks.mjs pattern.

### 4.3 Idempotency strategy (D-90)

1. Read settings.json. If corrupt JSON: warn + skip.
2. Ensure `settings['mcp.servers']` exists (create `{}` if missing).
3. Lookup `settings['mcp.servers'].cds`:
   - Missing → add.
   - Exists with matching `{ command, args }` → no-op (logged).
   - Exists with different `command` or `args` → overwrite + warn log (this is the "user customized" branch).
4. NEVER touch any other key in `mcp.servers` (preserves user-added entries).
5. Write only if changed (avoid touching mtime).

### 4.4 Command selection: direct vs npx (D-89 open question)

**Discretion ruling (per CONTEXT.md):** Use `claude-dev-stack` directly as `command`. Rationale:
- The wizard only runs after user has installed `claude-dev-stack` (either globally via `npm i -g` or via `npx claude-dev-stack`). Either way, the wizard itself was launched through one of these paths.
- If user used `npx` during wizard run but did not install globally, the `claude-dev-stack` binary may not be on PATH. In that case the registered entry fails to start. Acceptable tradeoff — recovery is clear: `npm i -g claude-dev-stack`.
- `npx -y claude-dev-stack mcp serve` adds 2–5s startup overhead per MCP tool call due to npx resolution. Unacceptable for interactive workflow.

Final plan commits to direct `command: "claude-dev-stack"`. Document the PATH requirement in NOTICES.md / migration guide.

---

## 5. `planning.status` Parser (D-84..D-86)

### 5.1 Project resolution

Input: optional `project` basename arg (defaults to cwd's basename).

Resolution order:
1. If `project` provided and not falsy: exact match against `~/vault/project-map.json` entries (read once, cached). Returns `{ path, slug }` on hit.
2. If no registry match: check `~/vault/projects/{project}/.planning/ROADMAP.md` — if exists use that path.
3. If `project` absent: use `process.cwd()` basename, then retry steps 1–2.
4. If all fail: throw `NotAGsdProjectError`.

### 5.2 ROADMAP.md parser (lenient, D-85)

**Milestones extraction:**
```ts
// Regex: /^##\s+Milestones?\s*$/m boundary marker
// Inside: /^-\s*(✅|🚧|\[\s\])\s*(.+)$/ per bullet
// ✅ → complete, 🚧 → in-progress, [ ] → pending
```

**Phases extraction:**
```ts
// Regex: /^##+\s+Phases?\s*$/m boundary
// Inside: /^[-*]\s*(\[[\sx]\]|◆)?\s*(?:Phase\s+)?(\d+(?:\.\d+)?):?\s*(.+?)$/
// Status: [x]=complete, [ ]=pending, ◆=active
```

Counter returns `{ total, completed, in_progress, pending }`.

**current_phase derivation (D-86):**
```ts
// Read STATE.md. Regex: /^Phase:\s*\*?\*?(\d+(?:\.\d+)?)[ -—]+(.+?)\*?\*?\s*(?:\((.+?)\))?$/m
// Pulls Phase N, name, disk_status from STATE.md "Current Position" section.
```

**Milestone info:** Parse STATE.md YAML frontmatter (`milestone:`, `milestone_name:`, `status:`).

**Plan count:** `glob(.planning/phases/{padded_phase}-*/[0-9]*-PLAN.md)` synchronously, count matches.

### 5.3 Parser output shape (D-81)

```ts
{
  project: 'claude-dev-stack',
  milestone: { version: 'v1.0', name: 'CDS-Core Independence (Phase A)', status: 'in-progress' },
  phases: { total: 7, completed: 1, in_progress: 0, pending: 6 },
  current_phase: { number: '33', name: 'Monorepo Foundation', disk_status: 'Not started', plan_count: 0 },
  progress_percent: 14,  // completed / total * 100, rounded
  last_activity: '2026-04-16',  // from STATE.md frontmatter
  critical_risks: ['...'],  // optional, from STATE.md "Critical Risks" section bullets
}
```

Fields missing from the project's markdown degrade to omitted keys (never undefined). Tests drive this lenient behavior with intentionally-minimal fixtures.

---

## 6. Validation Architecture

This section satisfies the Nyquist Dimension 8 validation contract for Phase 37.

### 6.1 Test fixtures & isolation

**Strict isolation requirement:** Tests MUST NOT touch `~/vault`. Every test suite uses per-test `tmpdir()` with fixture DBs and markdown trees. Pattern:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpVault: string;
beforeEach(() => { tmpVault = mkdtempSync(join(tmpdir(), 'cds-mcp-test-')); });
afterEach(() => { rmSync(tmpVault, { recursive: true, force: true }); });
```

Environment override: `CDS_TEST_VAULT=/tmp/...` env var takes precedence over `~/vault` for all file-path resolution inside MCP tools. Default-off in production, always-set in tests.

### 6.2 Fixture DB builder helper

`packages/cds-cli/src/mcp-tools/__fixtures__/build-sessions-db.ts`:
```ts
export function buildFixtureSessionsDB(dbPath: string, seed: {
  sessions: Array<{ id, start_time, end_time, project, summary }>,
  observations: Array<{ id, session_id, type, content, entities, created_at }>,
}) {
  // Open DB, run migrations, bulk insert seed rows, return.
  // Re-uses the same openSessionsDB + migrations as production.
}
```

### 6.3 Per-tool validation matrix

| Tool | Validation Surfaces |
|---|---|
| `sessions.search` | (a) FTS5 syntax pass-through (valid + invalid queries), (b) all filter combinations (date range, project, type[], session_id), (c) limit clamping (20 default, 100 max), (d) bm25 ranking ordering, (e) empty result set, (f) error codes: `InvalidFilterError` on bad MATCH |
| `sessions.timeline` | (a) window clamping (default 5, max 20 both directions), (b) boundary: anchor near start/end of session, (c) tie-break ordering (same timestamp → ascending ID), (d) `SessionNotFoundError` on unknown anchor_id |
| `sessions.get_observations` | (a) format: 'raw' returns full row, 'summary' returns truncated content, (b) ids clamped to 50, (c) missing IDs silently dropped (partial result), (d) empty `ids` throws `InvalidFilterError` |
| `docs.search` | (a) rg path normal operation, (b) grep fallback path (forced via `PATH=''`), (c) path traversal: `scope: '../etc'`, `scope: '/etc'`, `scope: '~/.ssh'` all rejected with `InvalidFilterError`, (d) no results → empty array, (e) cross-project with `scope: 'all'`, (f) limit clamping |
| `planning.status` | (a) valid project → full shape, (b) unknown project → `NotAGsdProjectError`, (c) lenient parser: malformed ROADMAP section returns partial (no throw), (d) STATE.md frontmatter missing → milestone omitted, (e) cwd default when no arg |

### 6.4 Wizard idempotency validation

`packages/cds-cli/src/install-mcp.test.ts`:
- (a) Fresh settings.json → entry added.
- (b) Settings with matching entry → no-op (content unchanged — compare by deep-equal).
- (c) Settings with mismatched entry → overwritten + warn logged.
- (d) Settings without `mcp.servers` key → key created.
- (e) Settings with other `mcp.servers.*` entries → untouched.
- (f) Second wizard run (idempotent): (a) → (b) verifies no duplicate.
- (g) Corrupt JSON → skipped with warning, original file byte-preserved.

### 6.5 CLI dispatch validation

`packages/cds-cli/src/cli-dispatch.test.ts` (or integration test in bin/):
- (a) `claude-dev-stack mcp serve` dynamic-imports `packages/cds-cli/dist/mcp-server.js` and calls `main(args)`.
- (b) `claude-dev-stack mcp` (no `serve` subcommand) falls through to existing `lib/mcp.mjs` catalog — regression test.
- (c) `claude-dev-stack mcp install` continues to work via existing catalog.

### 6.6 MCP spec conformance validation

**Lightweight path (Phase 37):** TypeScript compiles against `@modelcontextprotocol/sdk` types → spec-conformant schemas by construction. No runtime validator needed.

**Integration smoke test (optional):** `packages/cds-cli/src/mcp-server.integration.test.ts` spawns the server via stdio, sends `ListTools` request, asserts 5 tools with valid schemas are returned. Uses SDK's `Client` class for the test-harness side.

### 6.7 Coverage exit criteria

- Unit tests pass: each tool's validation matrix (6.3) green.
- Integration smoke: `ListTools` returns 5 tools, each with `name` + `description` + `inputSchema` (6.6).
- Wizard tests: (a)–(g) (6.4) green.
- CLI dispatch tests: (a)–(c) (6.5) green.
- `cds mcp serve` launches on real project without throwing before `await server.connect()`.

---

## 7. Open Questions Resolved (from CONTEXT.md "Claude's Discretion")

| Question | Resolution |
|---|---|
| Exact JSON schema shape per SDK | Per §1.2 — use SDK's request schema constants, raw JSON Schema draft-7 under `inputSchema` |
| OR-union filters in sessions.search | AND semantics only. OR across filter fields would require SQL restructuring; defer to v1.1 if requested. |
| FTS5 tokenizer | `unicode61` (default) — supports our CJK-friendly + English workloads. Set explicitly in schema migration for future-proofing. |
| sessions.timeline tie-break | Secondary ORDER BY `id ASC` after `created_at ASC` |
| npx vs direct command | Direct `claude-dev-stack` (§4.4). Document PATH requirement in migration guide. |
| ANSI color codes from rg | `rg --color never --no-heading` — strips at source. No post-processing needed. |
| Error class hierarchy | `class CdsMcpError extends McpError` (concrete subclasses: NotAGsdProjectError, SessionNotFoundError, InvalidFilterError, RipgrepMissingError, VaultNotFoundError, FTS5UnavailableError) |

---

## 8. Canonical Code References to Consult During Planning

- `bin/cli.mjs` line 154 — existing `case 'mcp':` dispatch to `lib/mcp.mjs` (must delegate to new server only on `mcp serve` subcommand; everything else routes to existing catalog — critical to avoid regression)
- `lib/install/hooks.mjs` lines 103–306 — idempotent settings.json write pattern (read → modify → write-if-changed)
- `lib/mcp.mjs` — untouched; catalog for third-party servers remains
- `bin/install.mjs` line 198 — pattern for wizard step registration
- Phase 35 CONTEXT (forthcoming) D-43..D-48 — openSessionsDB API shape and observations_fts schema (reference through vault/sessions.ts import path)
- Phase 33 CONTEXT D-03 — root package.json `bin` field frozen (only `claude-dev-stack` binary)

---

## RESEARCH COMPLETE
