# Phase 37 Plan 01 — Summary

**Commit:** 4c76925
**Tasks completed:** 6 of 6

## Dependencies

- Added `@modelcontextprotocol/sdk@^1.29.0` to `packages/cds-cli` dependencies.
- Added `better-sqlite3@^12.9.0` (dependency) and `@types/better-sqlite3@^7.6.13`
  (devDependency) to `packages/cds-cli` — used by Plan 02 fixture DB builder
  and subsequent session tools.
- Root `package.json` `dependencies` and `bin` unchanged (Phase 33 D-03
  preserved). Only `@cds/cli` package.json grew.
- `pnpm-lock.yaml` regenerated; no other workspace package affected.

## NOTICES.md

- Promoted `@modelcontextprotocol/sdk@1.29.0` from a transitive-only entry (it
  was already present via `@anthropic-ai/claude-agent-sdk`) to a direct
  dependency with full attribution paragraph.
- Extended `better-sqlite3` "Used by" line to include `@cds/cli` alongside
  `@cds/core`.
- Preferred the existing file's list-style attribution layout (Phase 34
  convention) over the table format mentioned in 37-01-PLAN.md — planner
  alignment chosen to preserve NOTICES.md internal consistency.

## Error hierarchy (`packages/cds-cli/src/mcp-tools/shared.ts`)

- `class CdsMcpError extends McpError` — constructor `(code, kind, message)`,
  passes `{ kind }` as the SDK's third-arg `data` payload so clients can
  discriminate via `err.data.kind`. `name` field set to the kind string so
  stack traces print the domain name.
- Six concrete subclasses, all extending `CdsMcpError`:
  - `NotAGsdProjectError` → `InvalidParams`
  - `SessionNotFoundError` → `InvalidParams`
  - `InvalidFilterError` → `InvalidParams`
  - `RipgrepMissingError` → `InternalError` (informational only — tools
    should catch + fall back to grep)
  - `VaultNotFoundError` → `InvalidParams`
  - `FTS5UnavailableError` → `InternalError`
- `assertValidScopeBasename(name)` — rejects empty/whitespace, leading/trailing
  whitespace, `..`, path separators (`/`, `\\`), leading `~`, leading `.`.
  Throws `InvalidFilterError` on any failure.

## ListTools catalog (5 tools)

All tool definitions live as a module-level `TOOL_DEFINITIONS` constant
(`as const`) so tests can assert the shape without re-creating a server:

| Name                         | Required args                   | Optional args                                                                                |
|------------------------------|----------------------------------|----------------------------------------------------------------------------------------------|
| `sessions.search`            | `query: string`                 | `filters: { date_from, date_to, project, type[], session_id, limit (1..100) }`               |
| `sessions.timeline`          | `anchor_observation_id: number` | `window_before (0..20)`, `window_after (0..20)`                                               |
| `sessions.get_observations`  | `ids: number[] (1..50)`         | `format: 'raw' \| 'summary'`                                                                  |
| `docs.search`                | `query: string`                 | `scope: string`, `limit (1..100)`                                                             |
| `planning.status`            | —                               | `project: string`                                                                             |

Each `inputSchema` is a JSON Schema draft-7 object with
`additionalProperties: false`.

## CallTool dispatch

- `switch` on `request.params.name` routes each known tool to a
  `notImplementedStub(toolName)` that throws
  `McpError(InternalError, "Tool '<name>' not yet implemented (Plan 04 wires handlers).")`.
- Default branch throws `McpError(MethodNotFound, "Unknown tool: <name>")`.
- Outer try/catch re-throws `McpError` unchanged; wraps any other error in
  `McpError(InternalError, err.message)`.

Plan 04 Task 37-04-06 replaces these stubs with real imports; the catalog
and handler wiring above stay unchanged.

## Tests

| File                                                | Type        | Cases | Status  |
|-----------------------------------------------------|-------------|-------|---------|
| `src/mcp-server.test.ts`                            | unit        | 6     | passing |
| `src/mcp-server.integration.test.ts`                | integration | 1     | passing |
| `src/index.test.ts`                                 | unit (pre)  | 1     | passing |

Total: **8 tests passing** in `pnpm --filter @cds/cli test`.

The unit tests use `InMemoryTransport.createLinkedPair()` (SDK-native) so
ListTools/CallTool round-trip the same way Claude Code does — no private-field
introspection needed. Integration test spawns the server via `tsx` (or `npx
tsx` fallback, or pre-built dist) and verifies a real stdio round-trip
returns the 5 tools.

## Deviations from plan

- **Unit tests pivot from reaching into `Server._requestHandlers`** (as the
  plan casually suggested) to the clean `InMemoryTransport` approach. SDK
  exposes `InMemoryTransport.createLinkedPair()` publicly, so tests exercise
  the same JSON-RPC round-trip Claude Code uses. No private-field access.
- **`packages/cds-cli/tsconfig.json` added `types: ["node"]`** — required
  because the cds-cli tsconfig previously had no Node types (cds-core didn't
  need them, different code shape). Without this, `process`/`console`/
  `import.meta.url` fail to compile. Minimal, surgical change.
- **Added a 7th "exposes TOOL_DEFINITIONS + TOOL_NAMES" unit test** beyond
  the 5 specified in Task 37-01-05 — confirms the module exports exist and
  stay in sync with the registered catalog. Cheap extra coverage for Plan 04
  to rely on when removing the stub-phase test.
- **NOTICES.md format** — kept the existing list-style entries rather than
  introducing the pipe-delimited table the plan mentioned. The file has no
  prior table; adding one just for this dep would break consistency.
- Stub-phase CallTool test (`'CallTool with known name throws InternalError
  (stub phase)'`) is explicitly annotated for removal in Plan 04
  Task 37-04-06.
