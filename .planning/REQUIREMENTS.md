# Milestone v1.0 Requirements — CDS-Core Independence (Phase A)

**Goal**: Carve `claude-dev-stack` into a pnpm monorepo on Claude Agent SDK with tiered vault architecture (markdown for cold docs, SQLite for warm session memory, markdown for hot context) and auto session capture replacing the manual `/end` flow. Ship as `claude-dev-stack@1.0.0-alpha.1` via `npm publish --tag alpha`.

**Phase numbering**: continues from v0.12 (last phase: 32) → starts at **Phase 33**
**Test baseline**: 928/931 (3 pre-existing `detect.test.mjs` failures untouched)
**Total requirements**: 19 v1 requirements across 9 categories (MONO×4, SDK×2, CORE×2, VAULT×3, CAPTURE×2, MCP×2, MIGRATE×2, DEMO×1, RELEASE×1).

**Source of truth**: `vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md` (D-28 Phase A scope expansion) + `.planning/seeds/SEED-004-tiered-vault-sessions-auto-capture.md`.

---

## v1 Requirements

### Monorepo Scaffolding (MONO)

- [ ] **MONO-01**: Repository converted to pnpm workspaces with `packages/cds-core/`, `packages/cds-cli/`, `packages/cds-migrate/`, `packages/cds-s3-backend/` package directories. Root `pnpm-workspace.yaml` declares all packages. Existing single-package code in `lib/` and `bin/` either moved into the appropriate package or shimmed to import from packages during transition. `pnpm install` from root resolves all internal package references.

- [ ] **MONO-02**: TypeScript project references wire packages together — each `packages/*/tsconfig.json` declares its dependencies via `references`, and root `tsconfig.json` uses solution-style references. `pnpm tsc --build` compiles all packages in dependency order with zero errors. ESM-only output (no CJS) per existing project constraint.

- [ ] **MONO-03**: vitest replaces `node:test` as the test runner with workspace-aware configuration. Each package has a `vitest.config.ts` extending a shared root config. `pnpm test` runs all packages' tests in parallel and reports results per package. Existing 928 passing tests from `tests/` directory port over with zero behavior change.

- [ ] **MONO-04**: GitHub Actions CI workflow updated for pnpm + monorepo: matrix `[node 18, 20, 22] × [packages: changed-only]`. Caches pnpm store. Runs `pnpm install --frozen-lockfile`, `pnpm tsc --build`, `pnpm test`. Fails build on any TS error or test failure. Existing `.github/workflows/test.yml` migrated, not duplicated.

### Pi SDK Integration (SDK)

- [ ] **SDK-01**: `@anthropic-ai/claude-agent-sdk` license verified (Apache-2.0 or MIT confirmed compatible with CDS distribution model). License compatibility documented in a new `NOTICES.md` at the repo root listing every runtime dependency and its license. SDK is added to `packages/cds-core/package.json` dependencies (NOT `prompts` — `prompts` stays single-dep for the CLI surface).

  **Correction (2026-04-16, Phase 34 execution):** `@anthropic-ai/claude-agent-sdk@0.2.111` is licensed under Anthropic Commercial Terms of Service (NOT Apache-2.0/MIT as originally assumed). Accepted as internal infrastructure dependency per Phase 34 CONTEXT.md D-13..D-16 and documented in `NOTICES.md`. Corrected acceptance phrasing: "license confirmed compatible with CDS distribution model (Anthropic Commercial ToS for claude-agent-sdk, documented in NOTICES.md)".

  **LGPL transitive allowlist note (2026-04-16):** `@img/sharp-libvips-*` packages (LGPL-3.0-or-later) are pulled transitively via `@modelcontextprotocol/sdk → sharp` as optional platform bindings. Allowlisted per dynamic-linking convention (libvips standard), documented under "LGPL-3.0-or-later (dynamic-linked native bindings — allowlisted)" in `NOTICES.md`.

- [ ] **SDK-02**: `packages/cds-core/src/agent-dispatcher.ts` exports `dispatchAgent({ model, prompt, system?, tools? })` that wraps `@anthropic-ai/claude-agent-sdk` agent invocation. Returns structured result `{ output: string, tokens: { input, output }, cost_usd }`. Replaces the failing `claude -p` subprocess pattern from `lib/adr-bridge-session.mjs`. Hello-world test: dispatching Haiku with a simple prompt returns expected output and non-zero token counts.

### Core Primitives (CORE)

- [ ] **CORE-01**: `packages/cds-core/src/context.ts` exports a `Context` class managing the cross-call context window — system prompts, conversation history, attached files. Replaces ad-hoc context passing in current `lib/`. Has `add()`, `clear()`, `summarize()` methods. Backed by in-memory state with optional persistence to `~/.claude/cds-context-{session_id}.json`.

- [ ] **CORE-02**: `packages/cds-core/src/cost-tracker.ts` exports `CostTracker` aggregating per-session token usage and dollar cost across all SDK calls. Reads pricing from `~/.claude/anthropic-pricing.json` (cached daily). Provides `record(call)`, `total()`, `dump()` for end-of-session reporting. Used by `agent-dispatcher` to attribute costs to the originating call site.

### Tiered Vault — Tier 2 SQLite (VAULT)

- [ ] **VAULT-01**: `packages/cds-core/src/vault/sqlite.ts` exports `openSessionsDB(projectPath)` returning a `better-sqlite3` connection to `~/vault/projects/{name}/sessions.db`. Driver choice: **better-sqlite3** (synchronous, native compile, battle-tested; rejected `bun:sqlite` because we are not on Bun runtime). DB created on first call with WAL mode + FTS5 extension verified.

- [ ] **VAULT-02**: SQLite schema initialized on DB open: tables `sessions(id PK, start_time, end_time, project, summary)`, `observations(id PK, session_id FK, type, content, entities JSON, created_at)`, `entities(id PK, name, type, first_seen, last_updated)`, `relations(from_entity FK, to_entity FK, relation_type, observed_in_session FK)`. FTS5 virtual table `observations_fts` indexes `observations.content` and `sessions.summary`. Schema migrations are versioned in `packages/cds-core/src/vault/migrations/` with a `schema_version` table enforcing forward-only upgrades.

- [ ] **VAULT-03**: Tier boundary enforcement — only `packages/cds-core/src/vault/sessions.ts` API methods write to SQLite. Any direct `INSERT` outside this module fails type-check (no exported raw `db` handle). Markdown vault writers (`lib/notebooklm-sync.mjs`, `lib/adr-bridge-session.mjs`, etc.) cannot accidentally write to SQLite. Decisions/docs/planning remain markdown-only — no migration path that moves them into SQLite.

### Auto Session Capture (CAPTURE)

- [ ] **CAPTURE-05**: New `hooks/session-end-capture.mjs` Stop hook (replaces the manual `/end` skill flow) reads the session transcript from Claude Code env (`CLAUDE_SESSION_ID`, `~/.claude/projects/{slug}/{id}.jsonl`), extracts user messages + key assistant responses, calls `dispatchAgent({ model: 'haiku', prompt: <ADR+session-summary prompt> })` via Pi SDK, writes structured observations to SQLite via `vault/sessions.ts` API, updates `vault/projects/{name}/context.md` (Tier 3) with session pointer. Runs detached so session exit is never blocked. Fails silently on any error.

- [ ] **CAPTURE-06**: Wizard installs `hooks/session-end-capture.mjs` to `~/.claude/hooks/` and registers it in each configured project's `.claude/settings.json` `Stop` hook list, replacing the existing `session-end-check.sh` registration. Existing manual `/end` skill in `~/.claude/skills/session-manager/` is deprecated (kept for fallback) — wizard prints "auto-capture enabled, /end no longer required for routine sessions".

### MCP Adapter (MCP)

- [ ] **MCP-01**: `packages/cds-cli/src/mcp-server.ts` implements an MCP server exposing 5 tools: `sessions.search(query, filters?)` returns top-N FTS5 hits, `sessions.timeline(anchor_id, window?)` returns chronological context, `sessions.get_observations(ids[])` returns full text, `docs.search(query)` greps Tier 1 markdown across `vault/projects/*/docs/`, `planning.status(project)` returns ROADMAP + STATE summary. All tools return JSON schemas conformant to MCP spec.

- [ ] **MCP-02**: Wizard registers the MCP server in each configured project's `.claude/settings.json` under `mcp.servers` with command `cds mcp serve` (subcommand of `claude-dev-stack` CLI). Idempotent — re-running wizard on configured project does not duplicate the entry. Server starts on first MCP client connection per Claude Code spec.

### Backfill Migration (MIGRATE)

- [ ] **MIGRATE-01**: `packages/cds-migrate/src/sessions-md-to-sqlite.ts` exports `migrateMarkdownSessions({ vaultPath, projectName, dryRun? })` that walks `vault/projects/{name}/sessions/*.md`, parses each session log, extracts entities + observations via Haiku entity-extraction prompt, writes to SQLite. Idempotent — re-running on already-migrated sessions is a no-op (checks `sessions.id` from filename slug). Reports progress per file. Estimated cost: <$0.50 for 30 sessions at Haiku rates.

- [ ] **MIGRATE-02**: CLI subcommand `claude-dev-stack migrate sessions` invokes the migrator with current vault path, prompts user for confirmation showing estimated cost, runs with `--dry-run` first to preview, then with `--apply` after confirm. Dry-run output lists per-session: file path, parsed observation count, estimated tokens.

### `/cds-quick` End-to-End Demo (DEMO)

- [ ] **DEMO-01**: `/cds-quick` slash command (skill) takes a one-line task description, invokes a single agent dispatch via `agent-dispatcher`, captures the session into SQLite via the auto-capture hook, returns a result summary with cost. Proves the full pipeline (prompt → SDK → SQLite session record → MCP query result) end-to-end. First public demo of the new stack.

### Alpha Release (RELEASE)

- [ ] **RELEASE-01**: `claude-dev-stack@1.0.0-alpha.1` published to npm via `npm publish --tag alpha`. Tagged `--tag alpha` to ensure `npm install claude-dev-stack` (the implicit `@latest`) does NOT upgrade existing v0.12.x users. Migration guide at `docs/migration-v0-to-v1-alpha.md` documents breaking changes (settings.json schema, hook names, SQLite dependency). GitHub release notes link the migration guide and call out alpha-status caveats.

---

## Future Requirements (deferred to v1.1+)

- `.planning/` location migration — move planning out of project repos into `vault/projects/X/planning/` with `cds.config.json` pointer (plan-doc Refactor #1)
- Branching strategy auto-detection from branch-protection rules (plan-doc Refactor #2)
- Teams / parallel execute v2 with proper task topology (plan-doc Refactor #3)
- Skills/hooks boundary v2 — eliminate remaining duplication (plan-doc Refactor #4)
- Config system — `cds.config.json` schema with override layers (plan-doc Refactor #5)
- Statusline replacement v2 (plan-doc Refactor #6)
- Update notification — replicate `gsd-check-update.js` for CDS itself (plan-doc Refactor #8)
- GSD update mechanism dissolution — once `gsd-patches` is obsolete (plan-doc Refactor #9)
- SEED-003 S3 vault backend — depends on `.planning/` location migration first
- SEED-001 cloud agent integration — Cloud agents piece (Managed Agents already shipped in v0.12)

## Out of Scope

- **Vendored fork of GSD-1** — superseded by full TypeScript rewrite on Pi SDK per plan-doc D-07. SEED-002 was the original fork strategy; abandoned.
- **GSD-2 adoption as dependency** — rejected per plan-doc analysis (290 issues / 30 days, $GSD crypto token, single-vendor risk). GSD-2 is inspiration source, not dependency.
- **Replacing `prompts@^2.4.2`** — single-dep constraint preserved for the CLI surface. SDK is internal infrastructure dep.
- **Removing manual `/end` skill** — kept as fallback during alpha; deprecation in v1.1+ once auto-capture proven in production.
- **Migrating decisions/docs/planning to SQLite** — per SEED-004, these stay markdown forever (human-first content).
- **Bun runtime** — staying on Node.js. `bun:sqlite` rejected for VAULT-01.
- **AGPL-licensed dependencies** — claude-mem (`@thedotmack/claude-mem`) studied as inspiration only; AGPL-3.0 incompatible with CDS distribution.

---

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| MONO-01 | Phase 33 | — | pending |
| MONO-02 | Phase 33 | — | pending |
| MONO-03 | Phase 33 | — | pending |
| MONO-04 | Phase 33 | — | pending |
| SDK-01 | Phase 34 | — | pending |
| SDK-02 | Phase 34 | — | pending |
| CORE-01 | Phase 34 | — | pending |
| CORE-02 | Phase 34 | — | pending |
| VAULT-01 | Phase 35 | — | pending |
| VAULT-02 | Phase 35 | — | pending |
| VAULT-03 | Phase 35 | — | pending |
| CAPTURE-05 | Phase 36 | — | pending |
| CAPTURE-06 | Phase 36 | — | pending |
| MCP-01 | Phase 37 | — | pending |
| MCP-02 | Phase 37 | — | pending |
| MIGRATE-01 | Phase 38 | — | pending |
| MIGRATE-02 | Phase 38 | — | pending |
| DEMO-01 | Phase 39 | — | pending |
| RELEASE-01 | Phase 39 | — | pending |

**Coverage check**: 19/19 v1 requirements mapped to exactly one phase across Phases 33–39. Zero orphans, zero duplicates.
