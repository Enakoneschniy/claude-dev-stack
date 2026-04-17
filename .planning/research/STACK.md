# Stack Research — v1.1 Full-Stack Evolution

**Domain:** CLI tool + pnpm monorepo (TypeScript, Node.js 18+) — NEW capabilities only
**Researched:** 2026-04-17
**Confidence:** HIGH (verified via Context7, npm registry, official docs)

---

## Scope of This Document

This document covers ONLY new stack additions required for v1.1 features. The existing validated
stack is NOT re-researched:

- `@anthropic-ai/claude-agent-sdk` — agent dispatch (DEMO-01 bridge builds on this)
- `better-sqlite3` — SQLite vault (Tier 2 sessions, search index persistence)
- `@modelcontextprotocol/sdk` — MCP adapter
- `vitest` — testing
- `pnpm workspaces` + TypeScript project references — monorepo tooling
- `prompts@^2.4.2` — wizard UI (unchanged)

---

## Recommended Stack — New Additions

### Feature: S3 Vault Backend (`@cds/s3-backend` package)

The `packages/cds-s3-backend/` package already exists as a stub (v0.0.1, Phase 33 placeholder).
v1.1 implements it.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@aws-sdk/client-s3` | `^3.1031.0` | S3 object operations (get, put, delete, list, presigned URLs) | AWS SDK v3 is tree-shakeable and modular — only pay for what you import. ESM-native. Latest: 3.1031.0. Official AWS recommendation over legacy `aws-sdk` v2. |
| `@aws-sdk/lib-storage` | `^3.1031.0` | Multipart upload for large vault files | Handles chunked PUT with automatic parallelism and retry. Required for session DB uploads >5MB. Ships alongside `client-s3` in the v3 monorepo — same version pin. |

**Key integration notes:**
- Credentials delegated to standard AWS credential chain (`~/.aws/credentials`, env vars, IAM role). SEED-003 explicitly forbids storing creds in CDS config.
- `@cds/s3-backend` remains `private: true` in its `package.json` — not published to npm separately.
- R2/B2/MinIO compatibility is free: same S3 API, different `endpoint` config.
- Etag-based optimistic concurrency for atomic writes (SEED-003 requirement).

**What NOT to add:**
- `@aws-sdk/credential-providers` — the default credential chain in `@aws-sdk/client-s3` is sufficient for individual-developer use cases.
- `aws-sdk` v2 — deprecated, not tree-shakeable, 70MB+ installed size.

---

### Feature: Real SDK Dispatch for `/cds-quick` (DEMO-01)

No new packages needed. `@anthropic-ai/claude-agent-sdk ^0.2.110` (already in `@cds/core`) provides the dispatch. The fix is a bridge layer in `@cds/cli` that reads OAuth token from macOS Keychain (already implemented in v1.0 for budget detection via `security find-generic-password`) and exchanges it for an API key — pure Node.js `child_process.spawnSync` + `fetch`, zero new deps.

---

### Feature: Entity Relationship Graph (`@cds/core` or new `@cds/graph` package)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `cytoscape` | `^3.33.2` | Graph data model + layout algorithms + headless analysis in Node.js | Runs headless in Node.js without a DOM (verified via Context7: `headless: true` flag). Dual-use: server-side graph computation in `@cds/core` AND browser rendering in the dashboard. 3.33.2 is actively maintained (released 9 days ago). Context7 ID: `/cytoscape/cytoscape.js` (612 snippets, High reputation, score 85.85). |

**Why Cytoscape.js over alternatives:**
- **vis-network (10.0.2)**: DOM-only, no headless Node.js mode. Rejected — dashboard doesn't exist yet and graph computation must run in CLI context.
- **D3 force graph**: 200KB+ of general-purpose primitives; requires DOM/canvas for rendering. Overkill for entity graph with <1000 nodes. Cytoscape is purpose-built for graph theory.
- **graphlib / dagre**: Layout-only, no rendering. Would need a separate renderer anyway.

**Placement:** Add to `@cds/core` as an optional import (dynamic `import('cytoscape')`) OR create `@cds/graph` workspace package if graph surface area grows. Decision: start in `@cds/core`, extract to `@cds/graph` once >3 modules reference it.

---

### Feature: Cross-Project Memory Search (`@cds/core`)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `minisearch` | `^7.2.0` | In-memory full-text search with fuzzy matching, prefix search, and auto-suggest | Zero dependencies, ESM-native, runs in Node 18+. JSON-serializable index can be persisted to `better-sqlite3` (store as JSON blob in a `search_index` table — no schema migration complexity). Auto-suggest API (`miniSearch.autoSuggest()`) directly covers the "relevant past observations" use case. Context7 ID: `/lucaong/minisearch` (267 snippets, verified). |

**Why MiniSearch over alternatives:**
- **Fuse.js (7.x)**: Fuzzy-only, no TF-IDF ranking, no field boosting. Too simplistic for cross-project memory search where recency + project relevance matter.
- **SQLite FTS5** (already in `better-sqlite3`): viable alternative for pure text search. Reject for graph/relationship queries; use FTS5 as fallback/complement for simple keyword search, MiniSearch for ranked fuzzy search with auto-suggest.
- **Elasticsearch/Typesense**: server processes, out of scope for local CLI tool.

**Placement:** `@cds/core` — search index builder as a module in `src/search/`. Index is populated from vault session logs at `cds memory index` command invocation and persisted to SQLite.

---

### Feature: Web Dashboard (`packages/cds-dashboard` — new package)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `hono` | `^4.12.14` | HTTP server for dashboard API + static file serving | Zero dependencies, Web Standards API (fetch/Response/Request), works on Node.js 18+ via `@hono/node-server`. ESM-native. 4.12.14 released 14 hours ago — extremely active. Context7 ID: `/websites/hono_dev` (599 snippets). Replaces Express which is not ESM-native and carries legacy baggage. |
| `@hono/node-server` | `^1.x` | Node.js adapter for Hono | Required to run Hono on Node.js http module. Ships as a separate adapter package — Hono's architecture keeps core runtime-agnostic. |

**Frontend strategy (for dashboard UI):**
No framework. The dashboard is a dev tool that opens in a browser — ship a single-page HTML file served by Hono with inline `<script type="module">` tags that import chart libraries from CDN (e.g., `https://cdn.jsdelivr.net/npm/chart.js@4`). This avoids a build step for the dashboard package and keeps the monorepo clean. No React, no Vite, no bundler for the dashboard itself.

**Why Hono over alternatives:**
- **Express**: CommonJS default, no TypeScript types built-in, no Web Standards API. Express 5.x exists but still not ESM-first.
- **Fastify**: Excellent choice but heavier (schema validation, plugin system overhead). Hono is leaner for a local dev tool dashboard that needs 3-4 routes.
- **http (builtin)**: Viable but requires manual routing, content-type handling, static files. Hono gives that for free with zero deps.

**Dashboard package structure:**
```
packages/cds-dashboard/
  src/
    server.ts        # Hono app, routes: /api/sessions, /api/graph, /api/search
    static/
      index.html     # Single-page UI, Chart.js from CDN
  package.json       # name: @cds/dashboard, private: true
```

---

### Feature: Plugin System (`@cds/core`)

No new npm packages needed. Plugin system uses Node.js ESM dynamic imports:

```typescript
// Plugin contract (TypeScript interface in @cds/core)
export interface CdsPlugin {
  name: string;
  version: string;
  hooks?: Partial<CdsHooks>;
  commands?: CdsCommand[];
}
```

**Architecture decision:** Convention-over-configuration loading from `~/.claude/cds-plugins/` directory. Each plugin is an npm package with a default export implementing `CdsPlugin`. Loading via `import(pluginPath)` with ES module caching handles deduplication. No plugin registry framework needed.

**What NOT to add:**
- `tapable` (webpack plugin system): overkill, brings a runtime dep for a problem solvable with plain objects and function arrays.
- `rollup plugin` pattern: webpack-centric. Not appropriate for a CLI tool.

---

### Feature: Multi-Platform Runtime Support (Gemini / Copilot / Codex)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `ai` (Vercel AI SDK) | `^4.x` | Provider-agnostic LLM dispatch abstraction | Unified `generateText` / `streamText` API across OpenAI, Anthropic, Google Gemini, and community providers (GitHub Copilot via `@ai-sdk/openai` compatible endpoint). 20M+ monthly downloads. SDK 6 landed in 2026 with `Agent` interface. Prevents per-provider boilerplate. |
| `@ai-sdk/google` | `^1.x` | Gemini provider for AI SDK | Official Google Gemini adapter for `ai`. Same API surface as `@ai-sdk/anthropic`. |
| `@ai-sdk/openai` | `^1.x` | OpenAI / Codex / Copilot provider for AI SDK | GitHub Copilot exposes an OpenAI-compatible endpoint; Codex CLI also uses OpenAI API. One adapter covers all three. |

**Integration point:** New `@cds/runtime-adapter` workspace package (or `src/runtime/` in `@cds/core`). The adapter wraps `ai` SDK to match the existing `@anthropic-ai/claude-agent-sdk` dispatch interface used by `@cds/core`. This lets existing code paths run unchanged; only the provider config differs.

**Why Vercel AI SDK over rolling our own:**
- Writing per-provider HTTP clients for Gemini + Copilot + Codex would be 500+ LOC per provider, each with streaming, error handling, and retry logic.
- `ai` SDK handles streaming, tool calling, and provider-specific quirks.
- The `@google/gemini-cli-core` (Gemini CLI SDK) is an option for Gemini specifically but it's coupled to Gemini CLI internals. `@ai-sdk/google` is cleaner for our use case.

**What NOT to add:**
- `@google/generative-ai` (legacy Google SDK) — superseded by `@ai-sdk/google` in the AI SDK ecosystem.
- `openai` npm package directly — `@ai-sdk/openai` wraps it; adding both creates version conflict risk.

---

### Feature: MCP Server Marketplace Listing

No new packages. Listing on the MCP marketplace is a documentation/registry submission, not a code change. The existing `@modelcontextprotocol/sdk ^1.29.0` already implements the MCP server protocol.

---

## Package Placement Summary

| New Library | Added To | Why There |
|-------------|----------|-----------|
| `@aws-sdk/client-s3` | `packages/cds-s3-backend/` | S3 backend is an optional separate package per SEED-003 |
| `@aws-sdk/lib-storage` | `packages/cds-s3-backend/` | Companion to client-s3 for multipart |
| `cytoscape` | `packages/cds-core/` or new `packages/cds-graph/` | Graph computation runs in core; extracted if it grows |
| `minisearch` | `packages/cds-core/` | Search index lives alongside vault session data |
| `hono` + `@hono/node-server` | new `packages/cds-dashboard/` | Dashboard is a separate deployable, isolates HTTP server dep |
| `ai` + `@ai-sdk/google` + `@ai-sdk/openai` | new `packages/cds-runtime-adapter/` or `packages/cds-core/src/runtime/` | Provider abstraction isolated from core vault logic |

---

## Installation

```bash
# @cds/s3-backend (workspace package, installed by users who opt-in)
pnpm --filter @cds/s3-backend add @aws-sdk/client-s3 @aws-sdk/lib-storage

# @cds/core additions
pnpm --filter @cds/core add cytoscape minisearch
pnpm --filter @cds/core add -D @types/cytoscape

# @cds/dashboard (new package)
pnpm --filter @cds/dashboard add hono @hono/node-server

# @cds/runtime-adapter or @cds/core (multi-platform)
pnpm --filter @cds/core add ai @ai-sdk/google @ai-sdk/openai
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@aws-sdk/client-s3 v3` | `aws-sdk v2` | v2 is deprecated, not tree-shakeable, ESM-incompatible |
| `@aws-sdk/client-s3 v3` | `s3-lite-client (bradenmacdonald)` | s3-lite-client is zero-dep and lighter, but lacks multipart upload and IAM credential chain integration. AWS SDK v3 is the safer choice for production vault sync |
| `cytoscape` | `vis-network` | vis-network is DOM-only; no headless Node.js execution |
| `cytoscape` | `d3-force` | D3 is a general-purpose toolkit, not graph-specific; no headless graph algorithms |
| `minisearch` | `SQLite FTS5` | FTS5 lacks auto-suggest and fuzzy scoring. Use FTS5 for simple keyword queries, MiniSearch for ranked fuzzy + auto-suggest |
| `hono` | `express` | Express is not ESM-native; legacy API surface |
| `hono` | `fastify` | Fastify is heavier (plugin system, schema validation); overkill for a 4-route dev tool |
| `ai` (Vercel AI SDK) | Custom HTTP clients per provider | 500+ LOC per provider with no streaming/retry handling; maintenance burden exceeds SDK adoption cost |
| `ai` (Vercel AI SDK) | `@google/gemini-cli-core` | Couples to Gemini CLI internals; only covers one provider |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `axios` / `node-fetch` | Project convention: use `fetch` (Node 18+ builtin) or `node:https` | Built-in `fetch` |
| `react` / `vue` / `svelte` | Dashboard is a dev tool — inline HTML + CDN chart libs sufficient; no build step needed | Single-page HTML served by Hono |
| `vite` / `webpack` for dashboard | Adds build complexity to monorepo; dashboard has no bundling requirements | Static HTML with CDN imports |
| `tapable` | Plugin system is implementable with plain TypeScript interfaces and dynamic `import()` | Native ESM dynamic imports |
| `@aws-sdk/credential-providers` | Default credential chain in `@aws-sdk/client-s3` handles all CDS use cases | Built-in credential resolution |
| `@google/generative-ai` | Legacy Google AI SDK, superseded | `@ai-sdk/google` |
| `openai` (direct) | Redundant when `@ai-sdk/openai` wraps it | `@ai-sdk/openai` |

---

## Version Compatibility

| Package | Node.js | TypeScript | ESM | Notes |
|---------|---------|------------|-----|-------|
| `@aws-sdk/client-s3 ^3.1031` | 18+ | 4.9+ | Yes (CJS + ESM exports) | AWS SDK v3 publishes dual CJS/ESM bundles |
| `cytoscape ^3.33.2` | 18+ | via `@types/cytoscape` | Yes | Works headless with `headless: true` option |
| `minisearch ^7.2.0` | ES2018+ (Node 10+) | bundled types | Yes | JSON-serializable index, no native deps |
| `hono ^4.12.14` | 18+ | bundled types | Yes | Zero dependencies |
| `@hono/node-server ^1.x` | 18+ | bundled types | Yes | Requires `hono` peer dep |
| `ai ^4.x` | 18+ | bundled types | Yes | Requires Node 18+ fetch |
| `@ai-sdk/google ^1.x` | 18+ | bundled types | Yes | Peer: `ai` |
| `@ai-sdk/openai ^1.x` | 18+ | bundled types | Yes | Peer: `ai` |

---

## Sources

- `@aws-sdk/client-s3` — [npm registry](https://www.npmjs.com/package/@aws-sdk/client-s3) — version 3.1031.0 confirmed
- `@aws-sdk/lib-storage` — [npm registry](https://www.npmjs.com/package/@aws-sdk/lib-storage) — multipart upload API confirmed
- `cytoscape` — Context7 `/cytoscape/cytoscape.js` (612 snippets) + [npm registry](https://www.npmjs.com/package/cytoscape) — 3.33.2, headless mode verified
- `minisearch` — Context7 `/lucaong/minisearch` (267 snippets) + [npm registry](https://www.npmjs.com/package/minisearch) — 7.2.0, auto-suggest verified
- `hono` — Context7 `/websites/hono_dev` (599 snippets) + [npm registry](https://www.npmjs.com/package/hono) — 4.12.14, Node.js adapter verified
- `ai` (Vercel AI SDK) — [ai-sdk.dev](https://ai-sdk.dev/docs/introduction) + [npm registry](https://www.npmjs.com/package/ai) — multi-provider abstraction confirmed
- SEED-003 — `.planning/seeds/SEED-003-vault-s3-storage-option.md` — S3 architecture constraints
- `packages/cds-s3-backend/src/index.ts` — stub confirmed, ready for implementation

---
*Stack research for: claude-dev-stack v1.1 Full-Stack Evolution (NEW capabilities only)*
*Researched: 2026-04-17*
