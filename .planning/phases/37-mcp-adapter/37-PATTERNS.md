# Phase 37: MCP Adapter — Pattern Map

**Mapped:** 2026-04-16
**Source:** 37-CONTEXT.md (§Existing Code Insights) + 37-RESEARCH.md (§8 Canonical Code References)

> For each file created or modified in Phase 37, identifies the closest existing analog in the codebase and the concrete pattern to replicate.

---

## New Files

### `packages/cds-cli/src/mcp-server.ts`
- **Role:** Entry point — SDK setup, `setRequestHandler` registration, stdio transport.
- **Analog:** No prior MCP server in repo. Closest Node.js entrypoint pattern: `bin/cli.mjs` (async dispatcher using dynamic imports).
- **Pattern to replicate:**
  - Module-level imports (top of file, ESM), async `main(args)` export, single `await server.connect(transport)` suspends for lifetime.
  - Error handling: try/catch wrapping the whole `main()` body, log to stderr, `process.exit(1)` on failure — mirrors `run().catch((err) => …)` at `bin/cli.mjs:290`.
- **Concrete reference:** see `37-RESEARCH.md` §1.2 canonical pattern; `bin/cli.mjs:108-288` for structure.

### `packages/cds-cli/src/mcp-tools/sessions-search.ts`
- **Role:** FTS5 MATCH query over `observations_fts` with filter push-down.
- **Analog:** `lib/analytics.mjs` (existing observation-shaped reads) + Phase 35 `vault/sessions.ts` API (forthcoming; referenced by CONTEXT.md D-48).
- **Pattern to replicate:**
  - Accept `db: Database` handle via argument injection, NOT module-level singleton (test-friendliness).
  - Prepare statements lazily with module-level `let stmtCache = new WeakMap<Database, Statement>()` keyed on DB.
  - Use `json_each(?)` for array filter push-down (SQLite FTS5 / JSON1 combo).
- **Concrete reference:** `37-RESEARCH.md` §2.2 — canonical SQL; better-sqlite3 `db.prepare(sql).all(bindings)` shape.

### `packages/cds-cli/src/mcp-tools/sessions-timeline.ts`
- **Role:** Chronological window around an anchor observation.
- **Analog:** No perfect analog. Closest: `lib/analytics.mjs`'s session-log parsing but DB-backed here.
- **Pattern to replicate:**
  - Two-query approach: (1) fetch anchor observation, (2) fetch N before + N after by `created_at` boundary.
  - Tie-break rule: `ORDER BY created_at ASC, id ASC` (per RESEARCH §7 resolution).
  - Throws `SessionNotFoundError` if anchor_id not found (per D-82).

### `packages/cds-cli/src/mcp-tools/sessions-get-observations.ts`
- **Role:** Bulk-fetch observations by ID list.
- **Analog:** None — simple SELECT WHERE id IN (...).
- **Pattern to replicate:**
  - Use `IN (SELECT value FROM json_each(?))` binding pattern for variable-length ID lists (safer than dynamic SQL).
  - Format branching: `format: 'summary'` truncates `content` to 140 chars server-side.

### `packages/cds-cli/src/mcp-tools/docs-search.ts`
- **Role:** Ripgrep wrapper with POSIX grep fallback.
- **Analog:** `lib/shared.mjs` `spawnSync` + `hasCommand` helpers.
- **Pattern to replicate:**
  - Use `spawn` (NOT `spawnSync`) because we stream stdout line-by-line and parse ND-JSON.
  - Use `readline.createInterface({ input: child.stdout })` for line-delimited parsing.
  - Detect ripgrep availability lazily (first call) via `spawnSync('rg', ['--version'])` — cache result on module-local boolean.
- **Concrete reference:** `37-RESEARCH.md` §3.1–§3.4.

### `packages/cds-cli/src/mcp-tools/planning-status.ts`
- **Role:** Wraps the parser module and returns structured JSON.
- **Analog:** `lib/decisions-cli.mjs` (markdown-consuming read command).
- **Pattern to replicate:**
  - Pure function of project path → parsed object. No I/O beyond file reads. Testable by passing fixture paths.

### `packages/cds-cli/src/mcp-tools/planning-parsers.ts`
- **Role:** ROADMAP.md + STATE.md parser functions, lenient mode per D-85.
- **Analog:** `lib/decisions-cli.mjs` frontmatter + regex parsing of ADR markdown.
- **Pattern to replicate:**
  - Pure string functions with explicit regex patterns exported for test visibility.
  - Frontmatter parsing: hand-rolled YAML-like scanner (matches existing pattern — don't add a yaml dep).
  - Lenient: wrap every extraction step in try/catch that returns `undefined` on failure; caller (`planning-status.ts`) omits the key.

### `packages/cds-cli/src/mcp-tools/shared.ts`
- **Role:** `McpError` hierarchy + shared input-validation helpers.
- **Analog:** `lib/shared.mjs` (color constants, common helpers exported from a central module).
- **Pattern to replicate:**
  - Named exports only (no default exports, consistent with repo convention).
  - Error classes: `class CdsMcpError extends McpError { constructor(code, kind, message) { super(code, message); this.data = { kind }; }}` followed by one-liner subclasses.

### `packages/cds-cli/src/install-mcp.ts`
- **Role:** Wizard function: register CDS server in each project's `.claude/settings.json`.
- **Analog:** `lib/install/hooks.mjs` — single file, exported function, reads/merges/writes settings.json idempotently.
- **Pattern to replicate:**
  - Exported function signature similar to `installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath, projectsData)`.
  - Internal `_writeSettingsFile(settingsPath, ...)` helper for atomic settings mutation.
  - Write only if `changed === true` (preserves mtime — matches existing pattern).
  - Corrupt JSON → warn + skip (line 112–114 of hooks.mjs).
- **Location note:** CONTEXT.md D-90 says `lib/install/mcp.mjs` but D-89 has the wizard call go through `packages/cds-cli/*`. Plan must choose: source-of-truth in `packages/cds-cli/src/install-mcp.ts` (TS, compiled), re-exported via `lib/install/mcp.mjs` thin shim OR placed entirely under `lib/install/mcp.mjs` matching `hooks.mjs` location. **Decision:** place in `lib/install/mcp.mjs` (matches hooks.mjs sibling; kept .mjs for consistency with existing wizard step loader; stays plain JS — no need to compile on wizard path since the wizard runs pre-build). `packages/cds-cli/src/install-mcp.test.ts` still owns the test (unit tests in monorepo per MONO-03 baseline).

### `packages/cds-cli/src/mcp-tools/*.test.ts` + `packages/cds-cli/src/mcp-server.test.ts` + `packages/cds-cli/src/mcp-server.integration.test.ts` + `packages/cds-cli/src/cli-dispatch.test.ts` + `packages/cds-cli/src/install-mcp.test.ts`
- **Analog:** No prior `.test.ts` files in packages/ (first packaged tests in monorepo). Closest: root `tests/*.test.mjs` style (node:test). Per MONO-03 (Phase 33), monorepo uses vitest.
- **Pattern to replicate:**
  - Each test file uses `describe`/`it` from `vitest`.
  - `beforeEach`/`afterEach` for tmpdir isolation (per RESEARCH §6.1).
  - Use fixture builders (`__fixtures__/*.ts`).
- **Concrete reference:** Any small open-source vitest project layout; no internal analog.

### `packages/cds-cli/src/mcp-tools/__fixtures__/build-sessions-db.ts`
- **Role:** Test helper to construct a seeded SQLite DB in tmpdir.
- **Analog:** `tests/add-project.test.mjs` uses tmpdir but doesn't build DB. No close analog — new utility.
- **Pattern to replicate:** Phase 35's migration runner exported for test reuse (will be consumed here after Phase 35 ships).

---

## Modified Files

### `packages/cds-cli/package.json`
- **Change:** Add `dependencies: { "@modelcontextprotocol/sdk": "^1.29.0" }`.
- **Analog:** `packages/cds-cli/package.json` already exists (Phase 33 MONO-01). Matches the `dependencies` block shape used in `package.json` at repo root.
- **Pattern to replicate:** `pnpm --filter @cds/cli add @modelcontextprotocol/sdk` produces the canonical entry.
- **DO NOT touch:** root `package.json`'s `dependencies` (Phase 33 D-03: only `prompts` lives there; SDK is packages/-local).

### `packages/cds-cli/src/index.ts`
- **Change:** Add `export { main as mcpServerMain } from './mcp-server.js';`
- **Analog:** Root `lib/export.mjs` re-exports pattern; also `bin/install.mjs` line 325 re-exports installNotebookLM.
- **Pattern to replicate:** named re-export only — do not add side-effect imports.

### `bin/cli.mjs`
- **Change:** Modify `case 'mcp':` (line 154) to inspect `args[1]`. If `args[1] === 'serve'`: dynamic-import `packages/cds-cli/dist/mcp-server.js` and call `main(args.slice(1))`. Else: fall through to existing `lib/mcp.mjs` catalog.
- **Analog:** Same file, `case 'sync':` (lines 212–216) — subcommand dispatch by passing `args.slice(1)`.
- **Pattern to replicate:**
  ```js
  case 'mcp': {
    if (args[1] === 'serve') {
      const { main } = await import('../packages/cds-cli/dist/mcp-server.js');
      await main(args.slice(2));  // drop 'mcp' and 'serve'
    } else {
      const { main } = await import('../lib/mcp.mjs');
      await main(args.slice(1));
    }
    break;
  }
  ```
- **Regression guard:** `mcp`, `mcp install`, `mcp remove`, `mcp list` all route to catalog — test covered in 37-04-01.

### `lib/install/mcp.mjs` (NEW)
- See §New Files — `packages/cds-cli/src/install-mcp.ts` discussion. Lives alongside `lib/install/hooks.mjs`.

### `bin/install.mjs`
- **Change:** Add import `installCdsMcpServer` and a wizard step entry in the `steps` array (alongside the existing `installSessionHook` step at line 196–200).
- **Analog:** Exact copy of the "Session hooks" step pattern (line 195–200).
- **Pattern to replicate:**
  ```js
  import { installCdsMcpServer } from '../lib/install/mcp.mjs';
  // ... later in steps array:
  steps.push({ label: 'CDS MCP server', run: async (n, t) => {
    installCdsMcpServer(n, t, projectsData);
  }});
  ```

### `NOTICES.md` (existing from Phase 34 SDK-01)
- **Change:** Append `@modelcontextprotocol/sdk` MIT entry.
- **Analog:** The NOTICES.md is created in Phase 34. Pattern is license table entries. Append one row: `| @modelcontextprotocol/sdk | 1.29.x | MIT | https://github.com/modelcontextprotocol/typescript-sdk |`
- **If Phase 34 has not committed NOTICES.md yet (execution-time check):** Phase 37 creates the file with existing entries + this new one. Planner must NOT stomp an existing file.

---

## Integration Points (Referenced, Not Modified)

- `@cds/core/src/vault/sessions.ts` (Phase 35) — `openSessionsDB(projectPath)` factory. MCP tools import this, never open DB directly. Phase 37 code pinned to `@cds/core` workspace dep.
- `@cds/core/src/vault/schema-types.ts` (Phase 35) — re-exports `Session`, `Observation`, `Entity`, `Relation` types for tool return signatures.

**Workspace dep shape** (in `packages/cds-cli/package.json` dependencies):
```json
"@cds/core": "workspace:*"
```
Matches Phase 33 MONO-01 monorepo conventions.

---

## Anti-Patterns to Avoid

1. **Do NOT edit `lib/mcp.mjs`** — it's the third-party catalog; unrelated to our server. Phase 37 adds a SIBLING file under `lib/install/mcp.mjs` for the install-side logic and a DOWNSTREAM entry in `bin/cli.mjs` for dispatch.
2. **Do NOT add entries to root `package.json` `bin` field.** D-03 from Phase 33 locks that surface. The `claude-dev-stack mcp serve` subcommand reuses the single existing bin.
3. **Do NOT open `~/vault/.../sessions.db` in tests.** Always use fixture builders + tmpdir. CI must not depend on developer machine state.
4. **Do NOT use `claude mcp add` CLI during wizard.** Direct JSON write is atomic and controllable (RESEARCH §4.2).
5. **Do NOT pass raw strings into SQL.** Always parameterized statements via better-sqlite3 bindings.

---

## PATTERN MAPPING COMPLETE
