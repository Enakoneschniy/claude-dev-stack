# Feature Research

**Domain:** CLI developer memory tool — v1.1 Full-Stack Evolution
**Researched:** 2026-04-17
**Confidence:** HIGH (v1.0 codebase examined; architecture known; patterns verified against current ecosystem)

---

## Existing v1.0 Infrastructure (Dependency Baseline)

Before categorizing new features, these v1.0 components are available to build on:

| Package | What It Provides |
|---------|-----------------|
| `@cds/core` vault/sessions.ts | SQLite DB with sessions, observations, entities, relations tables + FTS5 search |
| `@cds/core` agent-dispatcher.ts | `dispatchAgent()` wrapping Claude Agent SDK; returns `{ output, tokens, cost_usd }` |
| `@cds/core` cost-tracker.ts | Per-session USD cost accumulation |
| `@cds/s3-backend` | Stub package (`0.0.0-stub`), SEED-003 placeholder — no real S3 code yet |
| `@cds/cli` mcp-server.ts | MCP server exposing `sessions.search`, `sessions.timeline`, `sessions.get_observations` |
| `@cds/cli` search.ts / stats.ts / memory.ts | CLI surface for vault queries |
| `@cds/migrate` | Backfill pipeline from markdown sessions to SQLite |
| `lib/analytics.mjs` (legacy CLI) | Session analytics, context quality scores, stale detection |
| hooks + Stop hook | Auto-capture sessions on `claude` exit |

---

## Feature Landscape

### Category A: Production Hardening

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | v1.0 Dependency | Notes |
|---------|--------------|------------|-----------------|-------|
| S3 vault backend (read/write) | Cross-device sync is table stakes for any CLI tool storing persistent state. Without it, the tool only works on one machine — negates value for devs with laptop + desktop setups. | HIGH | `@cds/s3-backend` stub exists; `@cds/core` vault API is integration surface. Needs AWS SDK v3 or S3-compatible fetch client. | Must support AWS S3 + compatible providers (R2, Backblaze). Conflict resolution: last-write-wins on DB file is fragile — prefer versioned object keys or SQLite WAL + CRC check. SEED-003. |
| Configurable S3 credentials | Users expect `~/.aws/credentials` profile support or env vars. Storing creds in vault config is wrong (security). | MEDIUM | `@cds/core` context.ts holds config primitives. | Use existing AWS credential chain — do NOT roll credential storage. |
| Sync conflict detection | Users expect a warning, not silent data loss, when two machines diverge. | MEDIUM | Vault schema has `start_time`/`end_time` on sessions — usable as vector clock proxy. | Full CRDT is overkill; timestamp-based "newer wins with backup" sufficient for MVP. |
| Real SDK dispatch for /cds-quick | DEMO-01 partial: the `/cds-quick` skill currently calls `Agent(haiku)` directly, bypassing CLI `quick.ts`. Users expect cost display and proper session capture. | MEDIUM | `@cds/cli/quick.ts` and `agent-dispatcher.ts` are complete — gap is the OAuth to API key bridge in skill invocation path. | Close the OAuth bridge: detect `ANTHROPIC_API_KEY` presence; if absent, surface error with install hint. |
| npm @latest publish | Alpha tag blocks adoption — `npx claude-dev-stack` should install v1.0 stable, not v0.12.x. | LOW | CI publish workflow exists (`publish.yml` with OIDC provenance). | Promotion: remove `--tag alpha`, update CHANGELOG, bump semver to `1.0.0`. No code changes needed. |

#### Differentiators

| Feature | Value Proposition | Complexity | v1.0 Dependency | Notes |
|---------|-------------------|------------|-----------------|-------|
| Automatic bidirectional sync on session end | Other tools require user action. Auto-upload after Stop hook fires makes cross-device seamless. | HIGH | Stop hook already fires after every session; hook chain exists in `hooks/`. | Add S3 upload step at end of stop hook. Must be non-blocking (async detached process like existing sync-runner pattern). |
| Encrypted S3 objects | Developer vault contains private decisions, entity names, session summaries. Encryption at rest is a trust differentiator. | MEDIUM | No encryption in codebase today. | Use AES-256-GCM with user-supplied passphrase stored in OS keychain. Do NOT invent key management. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time live sync (WebSocket/long-poll) | "Always in sync across devices" sounds appealing | SQLite WAL + S3 is not suitable for real-time concurrent writes. Developer workflow is single-machine-at-a-time. | Session-boundary sync (on Stop hook). Document "one machine active at a time" model clearly. |
| Custom S3-compatible server wizard | Users might want MinIO, Backblaze, R2 setup guidance | Adds complexity. MinIO Community Edition archived Feb 2026 and no longer maintained. | Document environment variables for endpoint override. Use AWS SDK v3 `endpoint` option. |

---

### Category B: Memory Intelligence

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | v1.0 Dependency | Notes |
|---------|--------------|------------|-----------------|-------|
| Cross-project memory search | Users expect "what did I decide about auth across all projects?" — existing `sessions.search` is per-DB (per-project). Cross-project means opening multiple vault DBs. | MEDIUM | `@cds/core/vault/sessions.ts` openSessionsDB() + FTS5 already work. Need multi-DB fan-out query layer. | Fan-out pattern: iterate `vault/projects/*/sessions.db`, run parallel FTS5 queries, merge + rank results. No vector embeddings needed — FTS5 BM25 is sufficient at developer-scale. |
| Entity relationship graph data API | Users expect to navigate "which projects share entity X?" and "what relations does Y have?" Without this, entity/relation tables in v1.0 are dark data. | MEDIUM | `entities` and `relations` tables exist in SQLite schema. `sessions-get-observations.ts` exposes observations but not graph traversal. | New MCP tool `memory.graph` returning adjacency list JSON. SQLite recursive CTE handles traversal at this scale — no external graph DB needed. |
| SessionStart memory injection upgrade | Users expect relevant past observations in Claude's context at session start without manual search. | HIGH | `SessionStart` hook exists (Living Memory). Current impl fetches only recent sessions from current project. | Upgrade: run cross-project FTS5 against current project's recent entities + file paths, inject top-3 matches as formatted context block. |

#### Differentiators

| Feature | Value Proposition | Complexity | v1.0 Dependency | Notes |
|---------|-------------------|------------|-----------------|-------|
| Entity graph visualization (web) | Developers see which concepts recur across projects — reveals architecture drift and knowledge clusters. No tool provides this for coding session memory. | HIGH | Entity/relation tables in SQLite. Graph data API (above) as prerequisite. | Use D3.js force-directed graph or Cytoscape.js in web dashboard. Node = entity, edge = relation_type. Color by type (file, function, decision, concept). Filter by project or date range. |
| Auto-suggestion during coding (hook-based) | Proactively surface "3 sessions ago you decided X about this module" without user prompt. | HIGH | Stop hook + `@cds/core` dispatchAgent + FTS5 search all exist. | Trigger: `UserPromptSubmit` hook reads current prompt, runs FTS5 against entities+observations, prepends relevant hits as system context injection. Must have < 200ms budget or it disrupts flow. |
| Memory quality scores + stale detection | Confidence signals: "this observation is 30 days old, likely stale." `lib/analytics.mjs` has stale detection in v1.0 but not exposed per-entity. | MEDIUM | `lib/analytics.mjs` + `last_updated` field on entities. | Surface staleness per entity in graph visualization and search results. Flag entities not referenced in last N sessions. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Vector embeddings for semantic search | "Semantic similarity is better than keyword search" | Requires external embedding model or API call, adds latency, violates single-dep constraint, needs embedding storage. At developer-scale (hundreds of sessions), FTS5 BM25 is 95% as good with zero dependencies. | FTS5 with query expansion. Use entity names as secondary index. Semantic search is v2+ if FTS recall proves insufficient. |
| Automatic memory summarization/compression | "Too much memory causes context overflow" | Compressing memories requires LLM calls on every session, costs money, loses detail, introduces hallucination risk into your own memory store. | Staleness-based pruning: mark observations inactive after N days without reference. Let users explicitly archive. |
| Shared team memory across users | "Teammates could share context" | Multi-user vault is a different product (auth, conflict resolution, RBAC). Scope creep. | Document export for sharing snapshots. Not a v1.1 concern. |

---

### Category C: Developer Experience

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | v1.0 Dependency | Notes |
|---------|--------------|------------|-----------------|-------|
| Plugin API contract + documentation | The v1.0 milestone says "plugin system for third-party integrations." Without a defined interface, "plugin system" is just a directory. | MEDIUM | `lib/plugins.mjs` handles 19 plugin marketplaces (MCP servers, skills) — this is discovery/install, not runtime extensibility. A real plugin system needs a different surface. | Define `PluginManifest` interface (name, version, hooks[], permissions[]). Plugins register via `~/.config/claude-dev-stack/plugins/`. Runtime: load on startup, call registered hooks at lifecycle points. |
| Plugin lifecycle hooks | Plugins need session start/end and observation events to be useful. | MEDIUM | Stop/Start hooks already fire in bash. `@cds/core` events are synchronous. | Expose async plugin hook points: `onSessionEnd(session)`, `onObservation(obs)`, `onSessionStart(context)`. Plugins receive typed data. |
| Onboarding wizard improvements | The v1.0 install wizard has known DX gaps (select vs y/N, pre-fill). MEMORY.md documents this. | LOW | `lib/install/` 13-module orchestrator. Known issues in MEMORY.md (select over confirm). | Use `prompts` select for all binary choices. Add "quick setup" path for experienced users (skip stack selection, use defaults). |

#### Differentiators

| Feature | Value Proposition | Complexity | v1.0 Dependency | Notes |
|---------|-------------------|------------|-----------------|-------|
| Web dashboard for session analytics | Developers expect a GUI for "how am I using Claude?" — session heatmaps, cost over time, entity frequency. agentsview (wesm/agentsview) proves demand exists. | HIGH | `lib/analytics.mjs` (legacy) + `@cds/cli/stats.ts` + SQLite vault all exist. | Serve a local static app via `claude-dev-stack dashboard`. Use SQLite directly (no additional DB). Must work offline. Ship as optional `@cds/dashboard` sub-package. |
| Cost tracking dashboard | Developers spending money on Claude want ROI visibility: cost per project, cost per session type, cost per feature. | MEDIUM | `@cds/core/cost-tracker.ts` accumulates per-session costs. | Cost drill-down in dashboard: bar chart by project + date. Export CSV for expense reporting. |
| Plugin marketplace browser in dashboard | Discoverability of 19 plugin marketplaces + 14 stack templates is currently text-only CLI. Visual browsing reduces friction. | LOW | `lib/plugins.mjs` + `lib/mcp.mjs` catalog data. | Read-only catalog view in dashboard. "Install" button triggers `claude-dev-stack mcp install <id>` via shell. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Cloud-hosted dashboard | "Access from anywhere" | Requires auth, hosting, privacy policy, ToS. This is a local-first tool — the value prop is no cloud dependency. | Local-only dashboard at `localhost:PORT`. Document as explicitly local. |
| Plugin sandboxing / permissions enforcement | "Security for third-party plugins" | Full sandboxing (vm2, Deno) is complex and brittle. Node.js has no lightweight sandbox suitable for production. | Document that plugins run in same Node process with full permissions. Mark `permissions[]` in manifest as declarative-only (user consent, not enforcement). Defer true sandboxing to v2+. |
| Auto-update plugins in background | "Stay current automatically" | Silent updates can break sessions mid-work. | Manual `claude-dev-stack update` already exists. Add `--plugins` flag. |

---

### Category D: Platform Expansion

#### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | v1.0 Dependency | Notes |
|---------|--------------|------------|-----------------|-------|
| MCP server marketplace listing (mcp.so, Smithery, Cline) | Any MCP server wanting adoption must be listed. Smithery has 7,000+ servers; MCPMarket 10,000+. Without listing, discoverability is near-zero. | LOW | `@cds/cli/mcp-server.ts` is already a working MCP server. | Submit to: (1) modelcontextprotocol/servers GitHub, (2) Cline mcp-marketplace (requires 400x400 logo + README), (3) Smithery. All PR-based submissions. No code changes. |
| MCP Registry listing (official Anthropic) | Official registry launched September 2025. Absent from it signals unofficial or unmaintained. | LOW | Same MCP server as above. | Submit to `registry.modelcontextprotocol.io`. Requires `llms-install.md` for auto-install by AI agents. |

#### Differentiators

| Feature | Value Proposition | Complexity | v1.0 Dependency | Notes |
|---------|-------------------|------------|-----------------|-------|
| Gemini CLI runtime support | Arctic (multi-provider) and OpenCode (75+ providers) show multi-runtime is a real user need. A developer using both Claude Code and Gemini CLI loses CDS memory when switching. | HIGH | `@cds/core/agent-dispatcher.ts` is tightly coupled to `@anthropic-ai/claude-agent-sdk`. Adding Gemini requires a `RuntimeAdapter` interface abstraction. | Define `RuntimeAdapter` interface: `dispatch(options) -> DispatchResult`. Implement `ClaudeAdapter` (current) + `GeminiAdapter`. Hooks are the harder problem — lifecycle events differ across platforms. |
| GitHub Copilot / Codex runtime support | Copilot now supports Claude Opus 4.6 and Gemini (multi-model). Codex is OpenAI's agentic coding system (launched April 2025). | HIGH | Same RuntimeAdapter abstraction as Gemini. | After Gemini, Codex and Copilot adapters are additive. Each adapter is ~100 LoC. Hooks remain the harder problem. |
| Runtime-agnostic hooks | Hooks today are Claude-specific (`claude` binary, CLAUDE.md, `.claude/settings.json`). Multi-platform requires hooks that work regardless of runtime. | HIGH | All hook infrastructure is in bash + `.claude/settings.json`. | Abstract hook config into `~/.config/claude-dev-stack/runtime.json`. Each runtime has its own hook install path. High complexity, likely v1.2 or separate phase. |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Local model support (Ollama, LM Studio) | "Free, private AI" | Local models have no session management, no hooks, incompatible API shapes. CDS value relies on agent lifecycle hooks that local model tools don't expose. | Document as out of scope. Separate adapter experiment if demand grows. |
| Browser extension for AI web interfaces | "Use CDS memory with Claude.ai web" | Web scraping is brittle, ToS-risky, no lifecycle events. | Out of scope. Point users to Claude Code CLI instead. |

---

## Feature Dependencies

```
[S3 Backend read/write]
    requires --> [S3 credentials config]
    requires --> [@cds/s3-backend stub to real implementation]
    enables  --> [Auto bidirectional sync on session end]
    enables  --> [Encrypted S3 objects]

[Cross-project memory search]
    requires --> [Multi-DB fan-out query layer]
    enables  --> [Entity graph visualization]
    enables  --> [Auto-suggestion during coding]

[Entity graph data API (MCP tool)]
    requires --> [Cross-project memory search]
    enables  --> [Entity graph visualization (web dashboard)]

[Web dashboard]
    requires --> [@cds/cli/stats.ts + analytics.mjs data]
    requires --> [Entity graph data API] (for graph view)
    optional --> [Cost tracking (cost-tracker.ts)]

[Plugin API contract]
    requires --> [Plugin lifecycle hooks]
    enables  --> [Plugin marketplace browser in dashboard]
    enables  --> [Third-party integrations]

[RuntimeAdapter interface]
    enables  --> [Gemini CLI support]
    enables  --> [Codex support]
    enables  --> [Runtime-agnostic hooks]

[Real SDK dispatch for /cds-quick]
    requires --> [OAuth to API key bridge in skill path]
    requires --> [ANTHROPIC_API_KEY detection]

[npm @latest publish]
    requires --> [All Production Hardening complete]
    independent from [Memory Intelligence and Platform Expansion]
```

### Dependency Notes

- **S3 backend requires AWS SDK v3**: The single-dep constraint (`prompts` only) applies to legacy `bin/install.mjs`, not the monorepo packages. `@cds/core` already depends on `better-sqlite3` and `@anthropic-ai/claude-agent-sdk`. AWS SDK v3 in `@cds/s3-backend` is consistent with the monorepo pattern.
- **Cross-project search has no infrastructure blocker**: FTS5 is already working in v1.0 SQLite. Only new code is a fan-out query across multiple DB files. Estimated 1-2 days.
- **Web dashboard is the highest-risk new surface**: Requires choosing a frontend bundler (vite or esbuild), an HTTP server (node http module or express), and a charting library. None are in the monorepo today. Must ship as isolated `@cds/dashboard` to avoid contaminating the lean CLI.
- **RuntimeAdapter needs design before Gemini implementation**: If adapter interface is wrong, it requires a breaking refactor. Spend a full research phase on this before coding.
- **MCP marketplace listings require zero code changes**: Submit to Cline, Smithery, and official registry as pure operational tasks. Block zero other features.

---

## MVP Definition for v1.1

### Launch With (v1.1 Release-Blocking)

- [ ] S3 vault backend — real implementation in `@cds/s3-backend` — enables cross-device use
- [ ] Cross-project memory search — fan-out FTS5 query — makes entity/relation data useful
- [ ] Real SDK dispatch for /cds-quick — closes DEMO-01 — removes "partial" status from alpha
- [ ] npm @latest publish — removes `alpha` tag — promotes to stable adoption

### Add After Validation (v1.1.x)

- [ ] Web dashboard (local, `@cds/dashboard`) — trigger: user feedback that CLI stats are insufficient
- [ ] Entity graph visualization — trigger: dashboard is live and graph data API is done
- [ ] Auto-suggestion during coding (UserPromptSubmit hook upgrade) — trigger: cross-project search working
- [ ] Plugin API contract — trigger: at least 1 external user wants to write a plugin

### Future Consideration (v1.2+)

- [ ] Gemini CLI RuntimeAdapter — trigger: confirmed user demand from non-Claude users
- [ ] MCP server marketplace listings — operational task, no code; do immediately outside roadmap
- [ ] Onboarding wizard improvements — low urgency, polish-only
- [ ] Encrypted S3 objects — trigger: user reports sensitive data concern with plaintext S3
- [ ] Auto-bidirectional sync — trigger: S3 backend validated and stable
- [ ] Codex / Copilot RuntimeAdapter — trigger: after Gemini adapter validates the abstraction

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| npm @latest publish | HIGH | LOW | P1 |
| Real SDK dispatch /cds-quick | HIGH | MEDIUM | P1 |
| S3 vault backend | HIGH | HIGH | P1 |
| Cross-project memory search | HIGH | MEDIUM | P1 |
| MCP marketplace listings | HIGH | LOW (operational) | P1 |
| Entity graph data API | MEDIUM | MEDIUM | P2 |
| SessionStart memory injection upgrade | HIGH | MEDIUM | P2 |
| Web dashboard | MEDIUM | HIGH | P2 |
| Entity graph visualization | MEDIUM | HIGH | P2 |
| Plugin API contract | MEDIUM | MEDIUM | P2 |
| Auto-suggestion during coding | MEDIUM | HIGH | P2 |
| Gemini CLI support | MEDIUM | HIGH | P3 |
| Encrypted S3 | LOW | MEDIUM | P3 |
| Codex / Copilot support | LOW | HIGH | P3 |
| Onboarding wizard improvements | LOW | LOW | P3 |

**Priority key:** P1 = v1.1 release blocker, P2 = v1.1.x add-on, P3 = v1.2+ consideration

---

## Competitor / Ecosystem Feature Analysis

| Feature Category | Comparable Tools | Their Approach | CDS Differentiator |
|-----------------|-----------------|----------------|--------------------|
| Session memory | Mem0, Zep, MemClaw | Cloud-hosted, requires API key, vendor lock-in | Local-first SQLite, user owns data |
| Cross-device sync | Cursor (cloud), Copilot (GitHub) | Proprietary cloud sync, no export | S3-compatible: user controls bucket and provider |
| Memory visualization | Obsidian Canvas, Logseq | Notes-focused, not coding-session-aware | Entity graph scoped to coding decisions and observations |
| Multi-platform | Arctic CLI, OpenCode | New tools replacing Claude Code | CDS adds memory to existing Claude Code workflows, not replacing them |
| Agent dashboard | agentsview (wesm) | Token/cost only, no memory graph | CDS: cost + memory quality + entity graph |
| MCP server | 10,000+ on Smithery | General-purpose | CDS MCP is session-aware with vault-backed context |

---

## Sources

- v1.0 codebase examined: `packages/cds-core/src/vault/sessions.ts`, `packages/cds-s3-backend/src/index.ts`, `packages/cds-cli/src/quick.ts`, `packages/cds-cli/src/mcp-tools/`
- MCP Registry launch Sep 2025: https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/
- Cline MCP Marketplace submission: https://github.com/cline/mcp-marketplace
- MCPMarket (10,000+ servers): https://mcpmarket.com/
- Arctic multi-provider adapter pattern: https://github.com/arctic-cli/interface
- agentsview session analytics: https://github.com/wesm/agentsview
- Mem0 hybrid vector+graph: https://mem0.ai/blog/mcp-knowledge-graph-memory-enterprise-ai
- MinIO Community Edition archived Feb 2026 (MEDIUM confidence — via search results)
- MemClaw workspace memory for Claude Code: https://felo.ai/blog/memclaw-vs-mem0/
- MCP Registry best practices 2026: https://www.truefoundry.com/blog/best-mcp-registries
- Multi-AI CLI comparison 2026: https://www.codeant.ai/blogs/claude-code-cli-vs-codex-cli-vs-gemini-cli-best-ai-cli-tool-for-developers-in-2025

---
*Feature research for: claude-dev-stack v1.1 Full-Stack Evolution*
*Researched: 2026-04-17*
