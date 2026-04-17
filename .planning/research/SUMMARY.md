# Project Research Summary

**Project:** claude-dev-stack v1.1 — Full-Stack Evolution
**Domain:** CLI tool (pnpm monorepo, TypeScript) — subsequent milestone expanding v1.0 alpha into production-ready multi-platform memory system
**Researched:** 2026-04-17
**Confidence:** HIGH

## Executive Summary

claude-dev-stack v1.1 expands a working v1.0 local-first CLI memory tool into a full-stack product with cloud sync, memory intelligence, a web dashboard, a plugin system, and multi-runtime AI support. The v1.0 foundation is solid: a pnpm monorepo with `@cds/core` (SQLite + FTS5 + agent dispatch), `@cds/cli` (CLI commands), and `@cds/mcp-adapter` (MCP server). All new v1.1 capabilities build on this without restructuring the core.

The recommended approach is a strictly layered build order: vault primitives first (VaultBackend interface, graph data API, cross-project search), then optional backends (S3, plugin SDK), then consumer surfaces (dashboard, runtime adapters), then operational release tasks (npm promotion, MCP marketplace listing).

The biggest risks are architectural and must be resolved via ADRs before code: S3 sync requires a merge-on-download strategy (not last-write-wins — silent data loss), AWS SDK must stay isolated to `@cds/s3-backend` (single-dep constraint), plugin system must remain manifest-only for v1.1 (arbitrary `import()` is unacceptable security surface), and `better-sqlite3` prebuilt gaps on Node 24 must be verified before `@latest` promotion.

## Key Findings

### Recommended Stack

New additions are lean and scoped to specific packages — no library touches the existing `@cds/cli` dependency surface.

**Core technologies:**
- `@aws-sdk/client-s3 ^3.1031.0` + `@aws-sdk/lib-storage`: S3 vault sync — tree-shakeable, ESM-native, IAM credential chain. Lives in `@cds/s3-backend` only.
- `cytoscape ^3.33.2`: Entity relationship graph — uniquely supports `headless: true` for Node.js server-side computation. vis-network rejected (DOM-only).
- `minisearch ^7.2.0`: Cross-project fuzzy search + auto-suggest — zero deps, JSON-serializable index stores in SQLite. FTS5 handles exact search, MiniSearch handles fuzzy + suggest.
- `hono ^4.12.14` + `@hono/node-server`: Dashboard HTTP server — zero deps, ESM-native, Node.js 18+. Express rejected (not ESM-native).
- `ai ^4.x` (Vercel AI SDK) + `@ai-sdk/google` + `@ai-sdk/openai`: Multi-runtime dispatch — one unified provider abstraction for Gemini, Copilot (OpenAI-compat), Codex.
- Plugin system: zero new packages — native ESM dynamic imports + TypeScript interface contract.

### Expected Features

**Must have (table stakes — P1, release-blocking):**
- S3 vault backend (real implementation replacing stub)
- Cross-project memory search (fan-out FTS5 across project DBs)
- Real SDK dispatch for `/cds-quick` (DEMO-01 OAuth bridge fix)
- npm `@latest` promotion (with migration from 0.12.x)

**Should have (differentiators — P2, v1.1.x):**
- Web dashboard (local analytics, cost drill-down, entity graph visualization)
- Entity graph data API (new `memory.graph` MCP tool)
- Plugin API contract (`@cds/plugin-sdk`, manifest-only)
- MCP marketplace listings (zero code — operational)

**Defer (v1.2+):**
- Gemini/Copilot/Codex RuntimeAdapters (design-heavy, needs live validation)
- Encrypted S3 via KMS
- Auto-bidirectional sync
- Vector embeddings (FTS5 BM25 is 95% as good at this scale)
- Plugin sandboxing

### Architecture Approach

`VaultBackend` interface in `@cds/core` is the structural keystone — `pull()`/`push()` methods, `FsBackend` as no-op default, `S3Backend` injected by CLI entry points. Cross-project search uses SQLite `ATTACH` batched in groups of 9 (per-connection limit). Dashboard is a fully isolated `@cds/dashboard` package.

**Major components:**
1. `@cds/core` — VaultBackend interface, graph.ts, multi-search.ts (new); sessions, vault, agent-dispatcher (existing)
2. `@cds/s3-backend` — S3Backend implementing VaultBackend, WAL checkpoint, merge-on-download
3. `@cds/dashboard` — Hono server, pre-built SPA (Chart.js/cytoscape viz), PID-file lifecycle
4. `@cds/plugin-sdk` — slim interface-only package for third-party plugin authors
5. `@cds/mcp-adapter` — extended with `memory.graph`, `sessions.searchAll` tools

### Critical Pitfalls

1. **WAL not checkpointed before S3 upload** — `PRAGMA wal_checkpoint(TRUNCATE)` in `closeSessionsDB()` before any S3 code, or uploaded DB is incomplete
2. **Last-write-wins S3 sync** → merge-on-download (GetObject → merge by UUID → PutObject); ADR must be first deliverable of S3 phase
3. **AWS SDK in `@cds/cli`** → must live only in `@cds/s3-backend`; ADR resolves single-dep constraint
4. **Plugin `import(userPath)` security** → manifest-only for v1.1; ADR mandates no arbitrary code execution
5. **Silent `0.12.x` → `1.1.0` upgrade** → publish as `@next` first; `cds-migrate` must be real (currently stub); Docker UAT required
6. **`better-sqlite3` Node 24 prebuilt gaps** — verify before `@latest` promotion or ship with fallback build instructions
7. **OAuth→API key bridge** has 3 documented upstream failure modes (headless refresh, auth conflict, macOS-only Keychain) — needs Linux testing

## Implications for Roadmap

### Phase 43: Core Vault Primitives
**Rationale:** Everything else depends on VaultBackend interface and data APIs
**Delivers:** VaultBackend interface + FsBackend, getEntityGraph(), searchAllProjects() with ATTACH batching
**Addresses:** Foundation for S3 backend, graph viz, cross-project search
**Avoids:** Building consumers before API shape is stable

### Phase 44: S3 Backend
**Rationale:** SEED-003 core deliverable; enables cross-device sync
**Delivers:** Real S3Backend with WAL checkpoint, merge-on-download, `cds vault sync` command
**Uses:** @aws-sdk/client-s3, VaultBackend from Phase 43
**First deliverable:** ADR on merge strategy + dependency constraint

### Phase 45: Cross-Project Search + Graph + MCP Tools
**Rationale:** Can run after Phase 43; parallel with Phase 44
**Delivers:** `cds search --global`, `cds graph`, memory.graph + sessions.searchAll MCP tools
**Uses:** cytoscape (headless), minisearch, ATTACH batching from Phase 43

### Phase 46: SDK Dispatch + DEMO-01 Fix
**Rationale:** Closes v1.0 tech debt; credential resolver needed for multi-platform later
**Delivers:** Real /cds-quick via CLI quick.ts, credential resolver (OAuth→API key bridge)
**Avoids:** OAuth failure modes via cross-platform testing

### Phase 47: Plugin SDK
**Rationale:** Interface-only, no runtime risk; enables ecosystem
**Delivers:** @cds/plugin-sdk manifest-only contract, Stop hook extension point
**First deliverable:** ADR on plugin trust model (manifest-only for v1.1)

### Phase 48: Web Dashboard
**Rationale:** Consumes final API shape of all upstream packages — must be last code phase
**Delivers:** @cds/dashboard with Hono server, session analytics, entity graph viz, cost drill-down
**Uses:** hono, cytoscape (browser), Chart.js CDN
**Avoids:** Stale process pitfall via PID-file + shutdown handler

### Phase 49: Release — npm @latest + MCP Marketplace
**Rationale:** Operational — all code phases must be complete
**Delivers:** @next publish → Docker UAT (0.12.x migration) → @latest promotion, MCP marketplace listings
**Avoids:** Silent upgrade breakage via staged rollout

### Phase Ordering Rationale

- Phase 43 is the critical gate — all subsequent phases depend on VaultBackend + data APIs
- Phases 44 and 45 can run in parallel after Phase 43 (different packages, no shared state)
- Phases 46 and 47 can run in parallel after Phase 45 (SDK dispatch and plugin SDK are independent)
- Phase 48 (dashboard) must be last code phase — reads final API shape
- Phase 49 (release) is always last

### Research Flags

**Needs deeper research during planning:**
- **Phase 44 (S3 Backend):** Merge-on-download conflict strategy needs ADR with explicit scenario enumeration. Two-device simulation test spec needed upfront.
- **Phase 48 (Dashboard):** ARCHITECTURE.md and STACK.md contradict on SPA strategy (Vite+React vs plain HTML+CDN). Must resolve before phase starts.

**Standard patterns — skip research-phase:**
- **Phase 43:** SQLite ATTACH, interface injection, FTS5 — all well-documented
- **Phase 45:** Graph computation + search indexing — standard patterns
- **Phase 46:** SDK dispatch + credential resolution — standard Node.js patterns
- **Phase 47:** TypeScript interfaces + ESM dynamic import — standard
- **Phase 49:** npm publish, dist-tag promotion — documented procedures

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All libraries verified via Context7 + npm registry. Versions confirmed current. |
| Features | HIGH | v1.0 codebase directly inspected. Dependency graph mapped against actual package structure. |
| Architecture | HIGH | Direct file-level codebase analysis. SQLite ATTACH pattern verified against official docs. |
| Pitfalls | HIGH | Critical pitfalls traced to specific GitHub issues and official SQLite documentation. |

**Overall confidence:** HIGH

### Gaps to Address

- Dashboard SPA strategy contradiction (Vite+React vs plain HTML+CDN) — resolve in Phase 48 planning
- Vercel AI SDK v4 `Agent` interface interaction with existing `dispatchAgent` — defer to v1.2 (runtime adapters deferred)
- `cds-migrate` stub completeness for `0.12.x` schema — audit required before Phase 49
- `better-sqlite3` Node 24 prebuilt verification — test in Phase 49 Docker UAT

## Sources

### Primary (HIGH confidence)
- Context7: cytoscape, hono, minisearch, @aws-sdk/client-s3 — API patterns + versions
- SQLite official docs — ATTACH, FTS5, WAL checkpoint behavior
- npm registry — package versions and dependency analysis

### Secondary (MEDIUM confidence)
- Vercel AI SDK docs — multi-provider pattern (Copilot endpoint compatibility inferred)
- GitHub issues: better-sqlite3 #1384, Claude Code #2633/#11587/#12447

---
*Research completed: 2026-04-17*
*Ready for roadmap: yes*
