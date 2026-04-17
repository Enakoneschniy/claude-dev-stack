# Architecture Research — v1.1 Integration

**Domain:** pnpm monorepo CLI / MCP server — feature integration into existing @cds/* packages
**Researched:** 2026-04-17
**Confidence:** HIGH (based on direct codebase analysis + current docs)

## Standard Architecture

### Current System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        USER SURFACES                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  bin/cli.mjs    │  │  Claude Code MCP  │  │  SessionStart hook  │  │
│  │  (legacy ESM)   │  │  (mcp serve)      │  │  (shell to node)    │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘  │
│           │                   │                        │              │
├───────────┴───────────────────┴────────────────────────┴──────────────┤
│                        @cds/cli (TypeScript)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  quick.ts    │  │  mcp-server  │  │  search.ts   │  │ stats.ts │  │
│  │  (dispatch)  │  │  (5 tools)   │  │  (FTS CLI)   │  │(mem-stats│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  │
├─────────┴──────────────────┴─────────────────┴───────────────┴────────┤
│                        @cds/core (TypeScript)                         │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  dispatchAgent   │  │  CostTracker │  │  vault/sessions.ts       │ │
│  │  (SDK wrapper)   │  │  Context     │  │  (SessionsDB interface)  │ │
│  └──────────────────┘  └──────────────┘  └────────────┬─────────────┘ │
│                                                        │              │
│                                          ┌─────────────▼─────────────┐ │
│                                          │  vault/internal/db.ts     │ │
│                                          │  better-sqlite3           │ │
│                                          │  FTS5 + WAL               │ │
│                                          └───────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│                        STORAGE                                        │
│  ~/vault/projects/{name}/sessions.db  (one SQLite per project)        │
└────────────────────────────────────────────────────────────────────────┘
```

### v1.1 Target System — New Packages and Integration Points

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     USER SURFACES (new in v1.1)                         │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │  Web Dashboard  │  │ Plugin entrypoints│  │ Gemini/Copilot/Codex │   │
│  │  @cds/dashboard │  │  @cds/plugin-sdk  │  │ runtimes in @cds/cli │   │
│  └────────┬────────┘  └────────┬──────────┘  └──────────┬───────────┘   │
├───────────┴──────────────────────────────────────────────┴───────────────┤
│                     @cds/cli (EXTENDED)                                  │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐  ┌────────┐  │
│  │  quick.ts      │  │  mcp-server.ts  │  │ cross-search │  │ graph  │  │
│  │  + OAuth/API   │  │  + 3 new tools  │  │ (multi-DB    │  │ export │  │
│  │  key bridge    │  │  graph/cross-   │  │ ATTACH)      │  │ DOT/   │  │
│  │  (DEMO-01 fix) │  │  search/plugin  │  │              │  │ JSON   │  │
│  └────────────────┘  └─────────────────┘  └──────────────┘  └────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│                     @cds/core (EXTENDED)                                 │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │  VaultBackend interface (NEW)                                     │   │
│  │  ┌──────────────────┐  ┌─────────────────────────────────────┐   │   │
│  │  │  FsBackend       │  │  S3Backend lives in @cds/s3-backend  │   │   │
│  │  │  (no-op default) │  │  injected by CLI entry points        │   │   │
│  │  └──────────────────┘  └─────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐   │
│  │  graph.ts (NEW)             │  │  multi-search.ts (NEW)          │   │
│  │  getEntityGraph(path)       │  │  searchAllProjects(query, vault)│   │
│  │  { nodes, edges }           │  │  SQLite ATTACH pattern          │   │
│  └─────────────────────────────┘  └─────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────┤
│                     @cds/s3-backend  (PROMOTED from stub)                │
│  S3Backend: pull/push sessions.db via @aws-sdk/client-s3                 │
│  Activated by CDS_VAULT_BACKEND=s3 + CDS_S3_BUCKET env vars             │
├──────────────────────────────────────────────────────────────────────────┤
│                     STORAGE (extended)                                   │
│  ~/vault/projects/{name}/sessions.db  (FsBackend — local)               │
│  s3://bucket/vault/projects/{name}/sessions.db  (S3Backend — sync)      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Package |
|-----------|----------------|---------|
| `VaultBackend` interface | Abstraction for local vs cloud storage. Two ops: `pull(projectPath)` and `push(projectPath)`. | `@cds/core` |
| `FsBackend` | No-op default backend — current behavior extracted into the interface | `@cds/core` |
| `S3Backend` | Syncs sessions.db to/from S3 via `@aws-sdk/client-s3` `PutObject`/`GetObject`. Activated by env vars. | `@cds/s3-backend` (promoted from stub) |
| `graph.ts` | Reads entities + relations tables, returns typed `{ nodes, edges }`. No rendering logic — pure data. | `@cds/core` |
| `multi-search.ts` | Opens main DB, ATTACHes other project DBs, runs FTS5 UNION query, returns hits annotated with `project` field. | `@cds/core` |
| Web dashboard | Vite + React SPA served by `cds dashboard` subcommand via local `node:http` server on `localhost:3847`. Reads via thin JSON API delegating to `@cds/core`. | `@cds/dashboard` (new package) |
| Plugin SDK | Defines `CdsPlugin` interface with typed lifecycle hooks. Loader reads `.claude/cds-plugins.json`, dynamic-imports each plugin. | `@cds/plugin-sdk` (new package) |
| Runtime adapters | Thin wrappers translating `dispatchAgent`-style calls to Gemini, Copilot, or OpenAI. Selected by `CDS_RUNTIME` env or `--runtime` flag. | `@cds/cli` (new files, not new package) |
| MCP marketplace listing | Static `registry.json` in repo root + README badges. No runtime code — purely metadata. | Root repo metadata |

## Recommended Project Structure (v1.1 additions)

```
packages/
├── cds-core/src/
│   ├── vault/
│   │   ├── backend.ts          # NEW — VaultBackend interface + FsBackend
│   │   ├── graph.ts            # NEW — getEntityGraph()
│   │   ├── multi-search.ts     # NEW — searchAllProjects() ATTACH pattern
│   │   ├── sessions.ts         # EXTENDED — openSessionsDB accepts optional backend
│   │   └── index.ts            # EXTENDED — export new symbols
│   └── index.ts                # EXTENDED
│
├── cds-s3-backend/src/
│   └── index.ts                # PROMOTED — real S3Backend (replaces 5-line stub)
│
├── cds-cli/src/
│   ├── quick.ts                # PATCHED — OAuth to API key bridge (DEMO-01 fix)
│   ├── graph-export.ts         # NEW — 'cds graph' subcommand
│   ├── cross-search.ts         # NEW — 'cds search --global' flag
│   ├── vault-sync.ts           # NEW — 'cds vault sync' subcommand
│   ├── runtime/
│   │   ├── gemini.ts           # NEW — Gemini dispatch adapter
│   │   ├── copilot.ts          # NEW — Copilot dispatch adapter
│   │   └── codex.ts            # NEW — Codex dispatch adapter
│   └── mcp-server.ts           # EXTENDED — 3 new MCP tools
│
├── cds-dashboard/              # NEW PACKAGE
│   ├── package.json            # @cds/dashboard, deps: vite, react, @cds/core
│   ├── server.ts               # node:http JSON API => @cds/core reads
│   └── web/                    # Vite + React SPA (pre-bundled dist/ in npm)
│       ├── src/
│       │   ├── pages/Sessions.tsx
│       │   ├── pages/Graph.tsx   # D3 force-directed entity graph
│       │   └── pages/Search.tsx  # cross-project search UI
│       └── vite.config.ts
│
├── cds-plugin-sdk/             # NEW PACKAGE
│   ├── package.json            # @cds/plugin-sdk, zero runtime deps
│   └── src/
│       ├── index.ts            # CdsPlugin interface + PluginRegistry class
│       └── loader.ts           # reads .claude/cds-plugins.json, dynamic import
│
└── cds-migrate/                # UNCHANGED
```

### Structure Rationale

- **`vault/backend.ts` in @cds/core:** The abstraction lives in core so all CLI commands call `openSessionsDB()` without knowing whether storage is local or S3. S3 sync is a `push/pull` at session boundaries — sessions.db stays local during active sessions.
- **`@cds/s3-backend` separate from core:** Keeps `@aws-sdk/client-s3` isolated. Users who never use S3 don't pay the install cost. `@cds/core` imports the interface type only; the concrete S3Backend class is injected via env/config at the CLI entry point.
- **`@cds/dashboard` as its own package:** Has a separate build pipeline (Vite bundling), heavy devDependencies (React, D3, TypeScript DOM), and pre-built `dist/` shipped to npm. Dashboard users pay the install cost; non-dashboard users do not.
- **`@cds/plugin-sdk` as its own package:** Third-party plugin authors depend on this slim interface-only package, not on `@cds/core`. This creates a stable public surface for external packages and avoids exposing vault internals.
- **Runtime adapters in `@cds/cli/src/runtime/`:** Each adapter is ~100 LOC and shares the same `dispatchAgent`-compatible interface. A separate package per adapter would add workspace overhead with no benefit. They're only loaded when `CDS_RUNTIME` is set.

## Architectural Patterns

### Pattern 1: VaultBackend Interface Injection

**What:** `VaultBackend` is a two-method interface (`pull`, `push`) in `@cds/core`. `openSessionsDB()` accepts an optional `backend` parameter defaulting to `FsBackend` (no-op). CLI commands that need S3 sync pass the `S3Backend` instance explicitly.

**When to use:** Everywhere `openSessionsDB()` is called from `@cds/cli`. Session-start hook uses default (no S3 needed mid-session). The new `cds vault sync` command uses `S3Backend` explicitly.

**Trade-offs:** Slightly more complex call signature, but avoids global env-based branching inside the vault module. The interface stays small and stable.

**Example:**
```typescript
// @cds/core/vault/backend.ts
export interface VaultBackend {
  pull(projectPath: string): Promise<void>;
  push(projectPath: string): Promise<void>;
}

export class FsBackend implements VaultBackend {
  async pull(_projectPath: string): Promise<void> { /* no-op */ }
  async push(_projectPath: string): Promise<void> { /* no-op */ }
}
```

### Pattern 2: SQLite ATTACH for Cross-Project Search

**What:** `searchAllProjects(query, vaultPath)` opens the first project DB, issues `ATTACH 'other.db' AS p1`, ..., up to 9 attachments (SQLite default limit: 10 per connection). Runs a UNION FTS5 MATCH query. Batches in JS when project count exceeds 9.

**When to use:** `cds search --global` CLI flag and the new `sessions.search_global` MCP tool.

**Trade-offs:** SQLite ATTACH limit is 10 by default. Batching adds a JS loop but is necessary for correctness when project count grows. Each ATTACH is per-connection, not persistent — no cleanup risk.

**Example:**
```typescript
// @cds/core/vault/multi-search.ts
export function searchAllProjects(query: string, vaultPath: string): CrossSearchHit[] {
  const projectDbs = findAllProjectDbs(vaultPath); // glob ~/vault/projects/*/sessions.db
  const results: CrossSearchHit[] = [];
  // Batch in groups of 9 (1 main + 9 attached, SQLite limit = 10)
  for (let i = 0; i < projectDbs.length; i += 9) {
    const batch = projectDbs.slice(i, i + 9);
    const db = new Database(batch[0].path);
    batch.slice(1).forEach((p, j) => db.prepare(`ATTACH ? AS p${j}`).run(p.path));
    results.push(...runUnionQuery(db, query, batch));
    db.close();
  }
  return results;
}
```

### Pattern 3: Dashboard as Local HTTP Server

**What:** `cds dashboard` spawns a `node:http` server on `localhost:3847` serving the pre-built Vite SPA plus a JSON API (`/api/sessions`, `/api/graph`, `/api/search`). The API delegates to `@cds/core` functions. No auth — localhost-only, developer tool.

**When to use:** User wants a visual analytics view. Server starts on demand, not as a background daemon.

**Trade-offs:** Pre-bundled SPA means dashboard is usable without a build step for end users. `@cds/dashboard` ships its pre-built `dist/` to npm (~500KB gzipped). Acceptable for a developer tool. The dashboard server is dynamically imported by `@cds/cli` so users without `@cds/dashboard` installed get a friendly error rather than a crash.

### Pattern 4: Plugin Hook System with Per-Registry Isolation

**What:** A plugin is an npm package exporting a `CdsPlugin` object with typed lifecycle hooks. `@cds/plugin-sdk` defines the interface. The CLI loader reads `.claude/cds-plugins.json` (list of npm package names), dynamic-imports each, and calls matching hooks. Each hook call is wrapped in try/catch — plugin errors never crash the main process.

**When to use:** Third-party integrations that need to react to session boundaries (start/end) or observation appends.

**Trade-offs:** Dynamic import means plugin discovery happens at runtime. Plugin authors pin `@cds/plugin-sdk` version — the interface must stay backward compatible. Tests must create fresh `PluginRegistry` instances (avoid module-level state).

**Example:**
```typescript
// @cds/plugin-sdk/src/index.ts
export interface CdsPlugin {
  name: string;
  onSessionStart?: (ctx: { sessionId: string; project: string }) => Promise<void>;
  onSessionEnd?: (ctx: { sessionId: string; observations: number }) => Promise<void>;
  onObservationAppended?: (obs: { type: string; content: string }) => Promise<void>;
}
```

## Data Flow

### S3 Backend Sync Flow

```
Session ends (Stop hook fires)
    |
@cds/cli stop.ts writes observations to local sessions.db
    |
VaultBackend.push(projectPath) called when CDS_VAULT_BACKEND=s3
    |
S3Backend: PutObject sessions.db => s3://{CDS_S3_BUCKET}/vault/projects/{name}/sessions.db
    |
On next session start on different machine:
VaultBackend.pull(projectPath)
    |
S3Backend: GetObject => overwrite local sessions.db (ETag-based conditional GET)
```

### Entity Graph Data Flow

```
User: cds graph [--format dot|json] [--project name]
    |
@cds/cli graph-export.ts main()
    |
@cds/core graph.ts getEntityGraph(projectPath)
    |
SELECT entities.*, relations.* FROM entities JOIN relations  (raw SQL, no FTS)
    |
Returns { nodes: Entity[], edges: Relation[] }
    |
CLI formats as DOT (Graphviz) or JSON
Dashboard: JSON => D3 force-directed layout in browser
MCP tool sessions.graph: returns JSON for Claude Code to read
```

### Cross-Project Search Flow

```
User: cds search --global "authentication bug"
  OR  MCP tool: sessions.search_global
    |
@cds/core multi-search.ts searchAllProjects(query, ~/vault)
    |
glob ~/vault/projects/*/sessions.db => list of DB paths
    |
Batch in groups of 9:
  ATTACH each DB in batch
  UNION FTS5 MATCH query across all schemas
  Annotate hits with { project: basename }
    |
Return CrossSearchHit[] with project field added to standard SearchHit
```

### Real SDK Dispatch (DEMO-01 Fix)

```
/cds-quick skill (UserPromptSubmit hook) invoked
    |
DEMO-01 current behavior: skill calls Agent(haiku) directly, bypasses quick.ts
  => no cost_usd display
    |
Fix: update SKILL.md to exec `claude-dev-stack quick "<task>"` via Bash tool
  + quick.ts OAuth->API key bridge (same pattern as v0.12 budget detection Keychain read)
    |
cost_usd displayed correctly in both CLI and skill invocation paths
```

## Integration Points — New Features vs Existing Packages

### S3 Vault Backend

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `@cds/core/vault/backend.ts` | NEW FILE | `VaultBackend` interface + `FsBackend` |
| `@cds/core/vault/sessions.ts` | MODIFIED | `openSessionsDB()` optional `backend` param |
| `@cds/core/vault/index.ts` | MODIFIED | Export `VaultBackend`, `FsBackend` |
| `@cds/s3-backend/src/index.ts` | PROMOTED | Replace 5-line stub with real `S3Backend` |
| `@cds/s3-backend/package.json` | MODIFIED | Add `@aws-sdk/client-s3` dependency |
| `@cds/cli/src/vault-sync.ts` | NEW FILE | `cds vault sync` subcommand |

### Entity Relationship Graph

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `@cds/core/vault/graph.ts` | NEW FILE | `getEntityGraph()` — pure data, no rendering |
| `@cds/core/vault/index.ts` | MODIFIED | Export `EntityGraph`, `getEntityGraph` |
| `@cds/cli/src/graph-export.ts` | NEW FILE | `cds graph` CLI subcommand |
| `@cds/cli/src/mcp-server.ts` | MODIFIED | New MCP tool `sessions.graph` |
| `@cds/dashboard/src/pages/Graph.tsx` | NEW FILE | D3 force-directed visualization |

### Cross-Project Memory Search

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `@cds/core/vault/multi-search.ts` | NEW FILE | `searchAllProjects()` ATTACH pattern |
| `@cds/core/vault/index.ts` | MODIFIED | Export `CrossSearchHit`, `searchAllProjects` |
| `@cds/cli/src/cross-search.ts` | NEW FILE | `--global` flag on `cds search` |
| `@cds/cli/src/mcp-server.ts` | MODIFIED | New MCP tool `sessions.search_global` |

### Web Dashboard

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `packages/cds-dashboard/` | NEW PACKAGE | `@cds/dashboard` — own Vite build pipeline |
| `pnpm-workspace.yaml` | UNCHANGED | Glob `packages/*` already covers new package |
| `@cds/cli/src/dashboard.ts` | NEW FILE | `cds dashboard` subcommand — dynamic imports `@cds/dashboard/server` |
| `@cds/core` | UNCHANGED | Dashboard server calls existing public API only |

### Plugin System

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `packages/cds-plugin-sdk/` | NEW PACKAGE | `@cds/plugin-sdk` — slim interface-only package |
| `@cds/cli/src/plugin-loader.ts` | NEW FILE | Reads `.claude/cds-plugins.json`, loads plugins |
| Stop hook (`hooks/stop.sh`) | MODIFIED | Calls plugin loader `onSessionEnd` after capture |
| `@cds/cli/src/mcp-server.ts` | MODIFIED | New MCP tool `plugins.list` |

### Gemini / Copilot / Codex Runtime Support

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `@cds/cli/src/runtime/gemini.ts` | NEW FILE | `@google/generative-ai` wrapper, `CDS_RUNTIME=gemini` |
| `@cds/cli/src/runtime/copilot.ts` | NEW FILE | GitHub Copilot API wrapper, `CDS_RUNTIME=copilot` |
| `@cds/cli/src/runtime/codex.ts` | NEW FILE | OpenAI API wrapper, `CDS_RUNTIME=codex` |
| `@cds/cli/package.json` | MODIFIED | Optional peer deps for runtime SDK packages |
| `@cds/core/agent-dispatcher.ts` | MODIFIED | Add `runtime` field to `DispatchOptions` |

### Real SDK Dispatch for /cds-quick (DEMO-01)

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `@cds/cli/src/quick.ts` | MODIFIED | OAuth to API key bridge; cost_usd display fix |
| `skills/cds-quick/SKILL.md` | MODIFIED | Call `claude-dev-stack quick` via Bash, not Agent() directly |

### npm Publish @latest

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `.github/workflows/publish.yml` | MODIFIED | Remove `--tag alpha`, promote to `@latest` |
| Root `package.json` | MODIFIED | Version bump to `1.1.0` |
| `CHANGELOG.md` | MODIFIED | v1.1 entry |

### MCP Server Marketplace Listing

| Touch Point | Change Type | Notes |
|-------------|-------------|-------|
| `registry.json` (new root file) | NEW FILE | Smithery + Glama + registry.modelcontextprotocol.io JSON schema |
| `README.md` | MODIFIED | Add marketplace badges |

## Build Order (Considering Cross-Package Dependencies)

Dependencies flow strictly downward: `@cds/core` is depended on by `@cds/cli` and `@cds/dashboard`. `@cds/plugin-sdk` and `@cds/s3-backend` are consumed by `@cds/cli`. Nothing depends on `@cds/migrate`.

**Recommended phase build order:**

```
Phase 43: @cds/core — VaultBackend interface + FsBackend + graph.ts + multi-search.ts
          (no new external deps; all vault primitives land together)
              |
              +--> Phase 44a: @cds/s3-backend — real S3Backend impl
              |    (depends on @cds/core VaultBackend; @aws-sdk/client-s3 added here)
              |
              +--> Phase 44b: @cds/cli — graph-export + cross-search + 3 new MCP tools
                   (depends on @cds/core graph.ts + multi-search.ts)
                   [44a and 44b are parallelizable via TeamCreate]
              |
Phase 45: @cds/plugin-sdk — interface-only package (no deps, can start after 43)
          @cds/cli — plugin-loader.ts + onSessionEnd hook integration
              |
Phase 46: @cds/cli — runtime adapters gemini/copilot/codex
          @cds/cli — quick.ts DEMO-01 fix (OAuth bridge)
          [45 and 46 are parallelizable if plugin-sdk is done]
              |
Phase 47: @cds/dashboard — new package (depends on final shape of @cds/core public API)
              |
Phase 48: npm publish @latest + MCP marketplace listing (metadata, no new code)
```

**Rationale:**
- `VaultBackend` interface in `@cds/core` must land before `@cds/s3-backend` can implement it.
- `graph.ts` and `multi-search.ts` land in the same phase as `VaultBackend` (Phase 43) because they are pure vault reads with no new external dependencies — batching them avoids a second `@cds/core` release cycle.
- Dashboard is second-to-last because it depends on the final public API shape of all packages it reads. Moving it earlier risks rework if upstream API changes during Phases 43-46.
- npm publish and marketplace listing are always last.

**Parallelizable pairs (TeamCreate safe):**
- Phase 44a (@cds/s3-backend) AND Phase 44b (@cds/cli graph/search/MCP) — both depend only on Phase 43
- Phase 45 (@cds/plugin-sdk) AND Phase 46 (runtime adapters + DEMO-01) — independent of each other, both depend on Phase 44b for the mcp-server.ts context

## Anti-Patterns

### Anti-Pattern 1: Importing @cds/s3-backend Inside @cds/core

**What people do:** Pull the concrete `S3Backend` class into `@cds/core` to avoid the injection pattern.

**Why it's wrong:** `@cds/core` gains a hard dependency on `@aws-sdk/client-s3` (~2MB). Every install pays the cost even if S3 is never used. The clean core/optional-backend boundary is lost.

**Do this instead:** Keep `VaultBackend` as an interface in `@cds/core`. `S3Backend` lives in `@cds/s3-backend`. CLI entry points inject the concrete backend based on env vars.

### Anti-Pattern 2: Bundling the Dashboard SPA Inside @cds/cli

**What people do:** Add Vite SPA source to `packages/cds-cli/` and run `vite build` during `pnpm -r build`.

**Why it's wrong:** Dashboard brings React, D3, and TypeScript DOM types into the CLI package. Build times increase for every CI run. Dashboard install is forced on all users, not just those who want it.

**Do this instead:** `@cds/dashboard` is its own package with its own Vite config and pre-built `dist/`. The CLI `cds dashboard` command does `import('@cds/dashboard/server')` — dynamic import, so users without the package get a friendly error.

### Anti-Pattern 3: Cross-Project ATTACH Without Batching

**What people do:** ATTACH all project DBs in one connection. Works for 9 projects, silently fails (or throws) for the 10th.

**Why it's wrong:** SQLite's default ATTACH limit is 10 databases per connection (configurable up to 125 via `SQLITE_MAX_ATTACHED`, but that requires compile-time changes to better-sqlite3). A user with 11 projects gets a runtime crash with no clear error message.

**Do this instead:** Batch in groups of 9 (1 main + 9 attached). Aggregate results in JS. For most users this is transparent; for power users it is required for correctness.

### Anti-Pattern 4: Plugin Hooks as Module-Level Global State

**What people do:** Plugin system stores hooks in a module-level array. Any file calls `registerPlugin(p)` at import time.

**Why it's wrong:** Module-level state bleeds between tests. Plugin registered in one test contaminates the next. Import order affects behavior.

**Do this instead:** The loader returns a `PluginRegistry` instance. CLI entry points create one registry at startup and pass it to commands. Tests create fresh instances.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 projects | Current SQLite-per-project is ideal. ATTACH cross-search is a single query. S3 sync is one PUT/GET per session. |
| 10-50 projects | Cross-search needs batching (groups of 9). Dashboard needs pagination on session list. No structural changes needed. |
| 50+ projects | Consider a single shared `vault/global.db` with all observations plus `project` column, populated by a sync trigger. FTS5 across one DB outperforms batched ATTACH. This is a future milestone, not v1.1. |
| S3 sync | One sessions.db per project (~1MB typical). ETag-based conditional GET avoids unnecessary downloads. Single PutObject/GetObject — no streaming required at this scale. |

## Sources

- Direct codebase analysis: `packages/cds-core/src/vault/sessions.ts`, `packages/cds-cli/src/mcp-server.ts`, `packages/cds-cli/src/mcp-tools/sessions-search.ts`, `packages/cds-s3-backend/src/index.ts`, `packages/cds-core/src/vault/internal/db.ts`, migration SQL
- SQLite ATTACH: https://www.jvt.me/posts/2024/06/19/cross-sqlite-query/ + https://www.sqlitetutorial.net/sqlite-attach-database/
- AWS SDK v3 S3: Context7 `/aws/aws-sdk-js-v3` — S3Client, GetObjectCommand, PutObjectCommand (HIGH confidence, current docs)
- MCP server registration pattern: https://code.claude.com/docs/en/mcp (official)
- MCP marketplace: Smithery (2000+ listings), Glama (6000+ listings), registry.modelcontextprotocol.io (official Anthropic registry, launched September 2025)
- Gemini CLI runtime: https://github.com/google-gemini/gemini-cli (MCP-compatible, API key auth supported)

---
*Architecture research for: claude-dev-stack v1.1 — Full-Stack Evolution integration*
*Researched: 2026-04-17*
