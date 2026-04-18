# Roadmap: claude-dev-stack

## Milestones

- ✅ **v0.8 NotebookLM Sync** — Phases 1–5 (shipped 2026-04-10)
- ✅ **v0.9 Git Conventions & NotebookLM Per-Project** — Phases 6–9 (shipped 2026-04-11)
- ✅ **v0.10 Query, Sync Automation & Quality** — Phases 10–13 (shipped 2026-04-13)
- ✅ **v0.11 DX Polish & Ecosystem** — Phases 14–18.1 (shipped 2026-04-13)
- ✅ **v0.12 Hooks & Limits** — Phases 19–32 (shipped 2026-04-16)
- ✅ **v1.0-alpha CDS-Core Independence** — Phases 33–42 (shipped 2026-04-17)
- 🚧 **v1.0 Full-Stack Evolution + GSD Independence** — Phases 43–55 (in progress)

---

## ✅ v1.0-alpha — CDS-Core Independence — Shipped 2026-04-17

<details>
<summary>Phases 33–42 — 10 phases, 40 plans, 347 files changed, 55K+ LOC</summary>

**Milestone Goal:** Carve `claude-dev-stack` into a pnpm monorepo on Claude Agent SDK with tiered vault architecture (markdown for cold docs, SQLite for warm session memory, markdown for hot context) and auto session capture replacing the manual `/end` flow. Ship as `claude-dev-stack@1.0.0-alpha.1` via `npm publish --tag alpha`.

What shipped: pnpm monorepo + Agent SDK + SQLite vault + auto-capture + MCP adapter + backfill migration + /cds-quick demo + alpha release + doctor GSD permissions + Docker UAT harness + Living Memory (search/stats/skills/SessionStart hook).

Archive: [`.planning/milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md)

### Phase 33: Monorepo Foundation
**Goal**: Repository runs as a pnpm workspace with TypeScript project references, vitest, and CI on Node 18/20/22.
**Requirements**: MONO-01, MONO-02, MONO-03, MONO-04
**Plans**: Complete

### Phase 34: SDK Integration & Core Primitives
**Goal**: `@cds/core` exposes `dispatchAgent`, `Context`, and `CostTracker` backed by `@anthropic-ai/claude-agent-sdk`.
**Requirements**: SDK-01, SDK-02, CORE-01, CORE-02
**Plans**: Complete

### Phase 35: Tiered Vault — Tier 2 SQLite
**Goal**: A per-project `sessions.db` (better-sqlite3, WAL mode, FTS5) is the single write target for session memory.
**Requirements**: VAULT-01, VAULT-02, VAULT-03
**Plans**: 4/4 Complete

### Phase 36: Auto Session Capture
**Goal**: When a Claude Code session ends, structured observations land in SQLite without the user typing `/end`.
**Requirements**: CAPTURE-05, CAPTURE-06
**Plans**: Complete

### Phase 37: MCP Adapter
**Goal**: A Claude Code session can query session memory + docs + planning state through MCP tools.
**Requirements**: MCP-01, MCP-02
**Plans**: Complete

### Phase 38: Backfill Migration
**Goal**: Existing 30+ markdown session logs are queryable via SQLite.
**Requirements**: MIGRATE-01, MIGRATE-02
**Plans**: Complete

### Phase 39: `/cds-quick` Demo & Alpha Release
**Goal**: `/cds-quick` end-to-end on new stack + `claude-dev-stack@1.0.0-alpha.1` published.
**Requirements**: DEMO-01, RELEASE-01
**Plans**: 5/5 Complete

### Phase 40: v1.0 Alpha Implementation Polish
**Goal**: Close all implementation blockers for v1.0.0-alpha.1 release.
**Plans**: 5/6 Complete

### Phase 41: v1.0 Alpha UAT & Sandbox
**Goal**: Validate v1.0.0-alpha.1 end-to-end in Docker sandbox.
**Plans**: 2/2 Complete

### Phase 42: Living Memory
**Goal**: SQLite session memory actively useful — loaded at session start, queryable via CLI and skills.
**Plans**: 4/4 Complete

### Progress (v1.0)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 33. Monorepo Foundation | — | Complete | 2026-04-16 |
| 34. SDK Integration & Core Primitives | — | Complete | 2026-04-16 |
| 35. Tiered Vault — Tier 2 SQLite | 4/4 | Complete | 2026-04-16 |
| 36. Auto Session Capture | — | Complete | 2026-04-16 |
| 37. MCP Adapter | — | Complete | 2026-04-16 |
| 38. Backfill Migration | — | Complete | 2026-04-16 |
| 39. `/cds-quick` Demo & Alpha Release | 5/5 | Complete | 2026-04-16 |
| 40. v1.0 Alpha Implementation Polish | 5/6 | Complete | 2026-04-17 |
| 41. v1.0 Alpha UAT & Sandbox | 2/2 | Complete | 2026-04-17 |
| 42. Living Memory | 4/4 | Complete | 2026-04-17 |

</details>

---

## 🚧 v1.0 — Full-Stack Evolution + GSD Independence (In Progress)

**Milestone Goal:** Transform claude-dev-stack from alpha CLI into a production-ready memory system with cloud sync, intelligent surfacing, web dashboard, plugin SDK — AND fork GSD to eliminate upstream dependency. Ship as `claude-dev-stack@1.0.0` stable.

**Phase numbering:** continues from v1.0-alpha (last phase: 42) → starts at **Phase 43**
**Branching:** `phase` → `gsd/phase-{N}-{slug}`, PR-only to main
**Total requirements:** 34 reqs across 5 categories (INFRA×3, HARD×8, MEM×7, DX×8, GSD×8)

### Phases

- [x] **Phase 43: Core Vault Primitives** — VaultBackend interface, FsBackend, graph API, cross-project search foundation
- [x] **Phase 44: S3 Backend** — Real S3Backend with WAL checkpoint and merge-on-download sync
- [x] **Phase 45: Cross-Project Search + Graph + MCP Tools** — global search, entity graph, new MCP tools
- [x] **Phase 46: SDK Dispatch + DEMO-01 Fix** — /cds-quick through CLI quick.ts, credential resolver
- [x] **Phase 47: Plugin SDK** — @cds/plugin-sdk manifest-only interface, Stop hook extension points
- [x] **Phase 48: Web Dashboard** — local analytics dashboard with Hono server, entity graph viz
- [x] **Phase 50: GSD Fork + Vendor** — fork GSD into CDS codebase, remove upstream npm dep, NOTICES.md (completed 2026-04-18)
- [ ] **Phase 51: Planning Relocation** — move `.planning/` to vault, `cds.config.json` pointer
- [ ] **Phase 52: CDS CLI Commands** — `/cds-*` commands replace `/gsd-*`, mapping layer, deprecation notices
- [ ] **Phase 53: Config System** — `cds.config.json` with per-project override layers
- [ ] **Phase 54: Update + Statusline** — CDS update notification, statusline parity
- [ ] **Phase 55: Release — npm @latest + MCP Marketplace** — staged rollout, migration, marketplace listings

### Dependency Graph

```
  Phases 43-48 (DONE)
        │
        ▼
  Phase 50 (GSD Fork)
        │
        ▼
  Phase 51 (.planning/ relocation)
        │
  ┌─────┴─────┐
  ▼           ▼
Phase 52    Phase 53
(CDS CLI)  (Config)
  │           │
  └─────┬─────┘
        ▼
  Phase 54 (Update+Statusline)
        │
        ▼
  Phase 55 (Release)
```

**Parallelization:** Phases 52 and 53 can run in parallel after Phase 51. Phase 54 depends on both. Phase 55 is always last.

### Phase Details

### Phase 43: Core Vault Primitives
**Goal**: `@cds/core` exposes a stable VaultBackend interface, FsBackend as the no-op default, graph data API, and cross-project search primitives — unblocking every v1.1 consumer.
**Depends on**: Phase 42 (v1.0 Living Memory — existing SQLite + MCP foundation)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, MEM-02, MEM-04
**Success Criteria** (what must be TRUE):
  1. `VaultBackend` interface with `pull()` and `push()` methods is importable from `@cds/core` and has no runtime implementation (interface-only).
  2. `FsBackend` implements `VaultBackend` as a no-op (returns immediately) — existing behavior is preserved with zero regression.
  3. `getEntityGraph()` returns entity-relation data from a project's `sessions.db` (nodes, edges with types).
  4. `searchAllProjects()` in `@cds/core` uses SQLite `ATTACH` in batches of 9 and returns ranked results across all configured project vaults.
**Plans**: 2 plans
Plans:
- [x] 43-01-PLAN.md — VaultBackend interface + FsBackend + getEntityGraph()
- [x] 43-02-PLAN.md — searchAllProjects() + barrel exports + boundary test

### Phase 44: S3 Backend
**Goal**: Users can configure S3 as a vault backend and sync their SQLite sessions across devices with no silent data loss.
**Depends on**: Phase 43 (VaultBackend interface must exist)
**Requirements**: HARD-01, HARD-02, HARD-03, INFRA-03
**ADR required first**: Merge-on-download conflict strategy (GetObject → merge by UUID → PutObject; explicit scenario enumeration required before any S3 code)
**Success Criteria** (what must be TRUE):
  1. Running `cds vault setup --backend s3` prompts for bucket, region, and credentials, and writes S3 config to vault settings.
  2. Running `cds vault sync` on two devices results in each device's observations merged into a single consistent `sessions.db` (no row lost, no duplicate UUID).
  3. Before any S3 upload, `PRAGMA wal_checkpoint(TRUNCATE)` executes — verified by a test that inspects DB state after checkpoint.
  4. AWS SDK lives only in `@cds/s3-backend`; importing `@cds/core` or `@cds/cli` does not transitively pull in `@aws-sdk/*`.
**Plans**: TBD

### Phase 45: Cross-Project Search + Graph + MCP Tools
**Goal**: Users can search memory across all projects and visualize entity relationships — both via CLI and MCP tools consumed by Claude Code.
**Depends on**: Phase 43 (searchAllProjects + getEntityGraph primitives)
**Requirements**: MEM-01, MEM-03, MEM-05, MEM-06, MEM-07
**Success Criteria** (what must be TRUE):
  1. Running `cds search --global "query"` returns ranked results from all project vaults, showing project name and session date per result.
  2. MCP tool `sessions.searchAll` returns the same cross-project results as the CLI, callable from a Claude Code session.
  3. MCP tool `memory.graph` returns entity-relation data for the current project — nodes with type labels and directional edges.
  4. SessionStart hook auto-surfaces relevant past observations from the current project (fuzzy + FTS5 combined) in the session preamble.
  5. Auto-suggestion correctly returns results for misspelled/partial queries (MiniSearch fuzzy) and exact-phrase queries (FTS5).
**Plans**: TBD
**UI hint**: yes

### Phase 46: SDK Dispatch + DEMO-01 Fix
**Goal**: `/cds-quick` dispatches through CLI `quick.ts` and displays cost, closing the v1.0 DEMO-01 partial; credential resolver supports three auth fallback paths.
**Depends on**: Phase 45 (search pipeline complete; stable MCP surface consumed by quick.ts)
**Requirements**: HARD-04, HARD-05
**Success Criteria** (what must be TRUE):
  1. Running `/cds-quick "<task>"` dispatches through `packages/cds-cli/src/quick.ts` (not `Agent(haiku)` directly) and prints `cost_usd` in the response.
  2. Credential resolver tries OAuth token first, then API key, then `ANTHROPIC_API_KEY` env var — in that order — and surfaces a clear error if all three fail.
  3. The OAuth→API key bridge works on Linux (not just macOS Keychain) — verified in the Docker UAT environment.
**Plans**: TBD

### Phase 47: Plugin SDK
**Goal**: Third-party developers can build plugins against a stable manifest-only interface, and Stop hook exposes an extension point for custom post-session actions.
**Depends on**: Phase 45 (stable @cds/core + MCP surface for plugins to consume)
**ADR required first**: Plugin trust model — manifest-only for v1.1, no arbitrary `import(userPath)` code execution
**Requirements**: DX-05, DX-06
**Success Criteria** (what must be TRUE):
  1. `@cds/plugin-sdk` is a publishable package with TypeScript interface definitions for `PluginManifest`, `PluginHookContext`, and the Stop hook extension point — no runtime code.
  2. A third-party plugin author can create a plugin by implementing the manifest interface without importing any `@cds/core` internals.
  3. Stop hook reads the plugin extension point and invokes registered post-session handlers in order, without executing arbitrary module paths.
**Plans**: TBD

### Phase 48: Web Dashboard
**Goal**: Users can open a local web dashboard to explore session analytics, token costs, and the entity relationship graph — all without leaving their machine.
**Depends on**: Phase 45 (graph + search APIs must be in final shape before dashboard consumes them)
**Requirements**: DX-01, DX-02, DX-03, DX-04
**Research flag**: Resolve SPA strategy contradiction (Vite+React vs plain HTML+CDN) before planning starts
**Success Criteria** (what must be TRUE):
  1. Running `cds dashboard` starts an HTTP server and opens `localhost:{port}` in the default browser, showing a session timeline.
  2. Dashboard displays token usage and cost breakdown per project (sourced from `sessions.db`).
  3. Dashboard renders a clickable entity relationship graph for the active project (nodes = entities, edges = relations).
  4. Stopping `cds dashboard` (Ctrl-C or `cds dashboard stop`) cleans up the PID file and leaves no stale process behind — verified by checking `ps` output after shutdown.
**Plans**: TBD
**UI hint**: yes

### Phase 50: GSD Fork + Vendor
**Goal**: Fork GSD workflow engine into CDS codebase, remove upstream `get-shit-done-cc` npm dependency, add license attribution.
**Depends on**: Phase 48 (all feature phases complete)
**Requirements**: GSD-01
**Success Criteria** (what must be TRUE):
  1. GSD workflow files live inside CDS repo (e.g., `vendor/cds-workflow/` or `src/workflow/`).
  2. `get-shit-done-cc` is removed from npm dependencies — CDS uses vendored copy.
  3. `NOTICES.md` contains MIT license attribution for original GSD.
  4. All existing GSD commands still work identically after vendor.
**Plans**: 2 plans
Plans:
- [x] 50-01-PLAN.md — Vendor copy + path rewrite + LICENSE + NOTICES.md
- [x] 50-02-PLAN.md — Install/update/detect rewrite + patches dissolution + test updates

### Phase 51: Planning Relocation
**Goal**: Move `.planning/` directory out of project git into vault, with a pointer file in the project repo.
**Depends on**: Phase 50 (GSD vendored — can modify planning paths)
**Requirements**: GSD-02, GSD-03
**Success Criteria** (what must be TRUE):
  1. Planning artifacts live at `vault/projects/{name}/planning/` instead of `{project}/.planning/`.
  2. `cds.config.json` in project repo points to planning location: `{ "planning": "vault://planning" }`.
  3. Project git history no longer receives planning commits (STATE.md, ROADMAP.md changes go to vault).
  4. Existing `.planning/` content migrated to vault automatically on first run.
**Plans**: 2 plans
Plans:
- [ ] 51-01-PLAN.md — Vault-aware path resolution + .cds/config.json + .gitignore
- [ ] 51-02-PLAN.md — Auto-migration of .planning/ to vault + human verification

### Phase 52: CDS CLI Commands
**Goal**: CDS CLI commands (`/cds-*`) replace all `/gsd-*` commands with a mapping layer and deprecation notices.
**Depends on**: Phase 51 (planning paths updated)
**Requirements**: GSD-04, GSD-05
**Success Criteria** (what must be TRUE):
  1. Every `/gsd-*` command has a `/cds-*` equivalent that works identically.
  2. Running `/gsd-*` shows a deprecation notice: "Use /cds-* instead" and still executes.
  3. Skills and hooks reference `/cds-*` commands, not `/gsd-*`.
**Plans**: TBD

### Phase 53: Config System
**Goal**: Unified config via `cds.config.json` with per-project override layers, replacing GSD's narrow toggle set.
**Depends on**: Phase 51 (planning location configurable)
**Requirements**: GSD-06
**Success Criteria** (what must be TRUE):
  1. `cds.config.json` schema supports: planning location, branching strategy, model profile, workflow toggles, vault backend, plugin list.
  2. Per-project overrides: project `cds.config.json` extends global `~/.config/cds/config.json`.
  3. Existing GSD `config.json` settings migrated automatically.
**Plans**: TBD

### Phase 54: Update + Statusline
**Goal**: CDS update notification and statusline fully replace GSD equivalents.
**Depends on**: Phase 52, Phase 53 (CDS CLI and config in place)
**Requirements**: GSD-07, GSD-08
**Success Criteria** (what must be TRUE):
  1. `npm view claude-dev-stack` check runs detached on session start, result cached.
  2. Statusline shows CDS version + update available indicator (no GSD statusline).
  3. `cds update` command updates CDS itself + vendored workflow.
**Plans**: TBD

### Phase 55: Release — npm @latest + MCP Marketplace
**Goal**: `claude-dev-stack@1.0.0` is promoted to `@latest` on npm, alpha users have a working migration path, and `@cds/mcp-adapter` is listed on two MCP marketplaces.
**Depends on**: Phase 54 (all GSD independence phases complete)
**Requirements**: HARD-06, HARD-07, HARD-08, DX-07, DX-08
**Success Criteria** (what must be TRUE):
  1. `npm install claude-dev-stack` (no tag) installs `1.0.0`; `npm install claude-dev-stack@1.0.0-alpha.1` still resolves the alpha.
  2. Running `cds-migrate` on a `1.0.0-alpha.1` vault completes without data loss — verified in Docker UAT.
  3. Docker UAT validates clean upgrade from `1.0.0-alpha.1` to `1.0.0` — all assertions pass.
  4. `@cds/mcp-adapter` has an active listing on Smithery marketplace and on the official MCP Registry.
**Plans**: TBD

### Progress (v1.0)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 43. Core Vault Primitives | v1.0 | 2/2 | Complete | 2026-04-17 |
| 44. S3 Backend | v1.0 | 4/4 | Complete | 2026-04-17 |
| 45. Cross-Project Search + Graph + MCP Tools | v1.0 | 3/3 | Complete | 2026-04-17 |
| 46. SDK Dispatch + DEMO-01 Fix | v1.0 | 2/2 | Complete | 2026-04-17 |
| 47. Plugin SDK | v1.0 | 2/2 | Complete | 2026-04-17 |
| 48. Web Dashboard | v1.0 | 2/2 | Complete | 2026-04-17 |
| 50. GSD Fork + Vendor | v1.0 | 2/2 | Complete    | 2026-04-18 |
| 51. Planning Relocation | v1.0 | 0/2 | Planned | — |
| 52. CDS CLI Commands | v1.0 | 0/? | Not started | — |
| 53. Config System | v1.0 | 0/? | Not started | — |
| 54. Update + Statusline | v1.0 | 0/? | Not started | — |
| 55. Release | v1.0 | 0/? | Not started | — |

---

## Phases (Historical)

<details>
<summary>✅ v0.8–v0.11 (Phases 1–18.1) — SHIPPED 2026-04-13</summary>

### v0.8 — NotebookLM Sync (Phases 1–5)

4 phases completed. NotebookLM sync pipeline, manifest change detection, CLI integration, session-context fix.

### v0.9 — Git Conventions & NotebookLM Per-Project (Phases 6–9)

4 phases completed. Git conventions skill ecosystem, per-project notebook manifest v2, migration script, Notion auto-import via MCP.

### v0.10 — Query, Sync Automation & Quality (Phases 10–13)

4 phases completed. Bugfixes, NotebookLM Query API, sync automation + install.mjs refactor, GSD infrastructure (ADR bridge + parallel execution).

Archive: `.planning/milestones/v0.10-ROADMAP.md`

### v0.11 — DX Polish & Ecosystem (Phases 14–18.1)

6 phases completed (including 18.1 insertion). Auto-approve vault ops, smart re-install wizard, path→slug centralization, git-conventions (gitmoji, GitHub Action, migration helper), NotebookLM cross-notebook search, Notion database import, analytics integration, always-on TeamCreate parallel execution.

Archive: `.planning/milestones/v0.11-ROADMAP.md`

</details>

<details>
<summary>✅ v0.12 Hooks & Limits (Phases 19–32) — SHIPPED 2026-04-16</summary>

13 phases, 32 plans, 912 tests. Published as `claude-dev-stack@0.12.0` (PR #37) + hotfix `@0.12.1` (PR #41).

What shipped: Project-level hooks, OAuth budget detection, 4-option continuation prompt, smart re-install wizard, Skills→Hooks migration, GSD workflow customization, CLAUDE.md idempotent merge, capture-automation hotfix, auto-ADR capture code.

Archive: `.planning/milestones/v0.12-ROADMAP.md`

</details>

---

## Backlog

Unsequenced items captured from session work — promote to active milestone via `/gsd-review-backlog`.

*(No new backlog items at v1.1 start)*

---

## Cumulative Progress

| Phases | Milestone | Status | Completed |
|--------|-----------|--------|-----------|
| 1–5 | v0.8 | ✅ Complete | 2026-04-10 |
| 6–9 | v0.9 | ✅ Complete | 2026-04-11 |
| 10–13 | v0.10 | ✅ Complete | 2026-04-13 |
| 14–18.1 | v0.11 | ✅ Complete | 2026-04-13 |
| 19–32 | v0.12 | ✅ Complete | 2026-04-16 |
| 33–42 | v1.0-alpha | ✅ Complete | 2026-04-17 |
| 43–55 | v1.0 Full-Stack + GSD Independence | 🚧 In progress | — |

---

*Roadmap updated: 2026-04-18 — renamed v1.1→v1.0 (alpha was not a real release). Added GSD Independence phases 50-54 (release blocker). Release renumbered to Phase 55. Phases 43-48 complete (2026-04-17). 34 requirements total, 22 complete, 12 pending.*
