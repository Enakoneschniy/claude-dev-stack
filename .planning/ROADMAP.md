# Roadmap: claude-dev-stack

## Milestones

- ✅ **v0.8 NotebookLM Sync** — Phases 1–5 (shipped 2026-04-10)
- ✅ **v0.9 Git Conventions & NotebookLM Per-Project** — Phases 6–9 (shipped 2026-04-11)
- ✅ **v0.10 Query, Sync Automation & Quality** — Phases 10–13 (shipped 2026-04-13)
- ✅ **v0.11 DX Polish & Ecosystem** — Phases 14–18.1 (shipped 2026-04-13)
- ✅ **v0.12 Hooks & Limits** — Phases 19–32 (shipped 2026-04-16)
- 🚧 **v1.0 CDS-Core Independence (Phase A)** — Phases 33–39 (In Progress)

---

## 🚧 v1.0 — CDS-Core Independence (Phase A) — In Progress

**Milestone Goal:** Carve `claude-dev-stack` into a pnpm monorepo on Claude Agent SDK with tiered vault architecture (markdown for cold docs, SQLite for warm session memory, markdown for hot context) and auto session capture replacing the manual `/end` flow. Ship as `claude-dev-stack@1.0.0-alpha.1` via `npm publish --tag alpha`.

**Source of truth:** [`vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md`](../../vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md) (D-28 Phase A scope) + [`SEED-004`](seeds/SEED-004-tiered-vault-sessions-auto-capture.md).

**Phase numbering:** continues from v0.12 (last phase: 32) → v1.0 starts at **Phase 33**
**Branching:** `phase` → `gsd/phase-{N}-{slug}`, PR-only to main
**Test baseline:** 928/931 (3 pre-existing `detect.test.mjs` failures untouched)
**Total requirements:** 19 v1 reqs across 9 categories (MONO×4, SDK×2, CORE×2, VAULT×3, CAPTURE×2, MCP×2, MIGRATE×2, DEMO×1, RELEASE×1)

### Phases

- [ ] **Phase 33: Monorepo Foundation** — pnpm workspaces, TS project references, vitest, CI matrix
- [ ] **Phase 34: SDK Integration & Core Primitives** — Claude Agent SDK license check + agent-dispatcher + context + cost-tracker
- [x] **Phase 35: Tiered Vault — Tier 2 SQLite** — better-sqlite3 sessions DB + FTS5 schema + boundary enforcement (completed 2026-04-16)
- [ ] **Phase 36: Auto Session Capture** — Stop hook → SDK Haiku → SQLite (closes v0.12 ADR-02 Known Gap retroactively)
- [ ] **Phase 37: MCP Adapter** — sessions.search/timeline/get_observations + docs.search + planning.status tools
- [ ] **Phase 38: Backfill Migration** — port existing markdown sessions into SQLite via Haiku entity extraction
- [ ] **Phase 39: `/cds-quick` Demo & Alpha Release** — proof-of-pipeline + `claude-dev-stack@1.0.0-alpha.1` via `npm publish --tag alpha`

### Dependency Graph

```
        Phase 33 (Monorepo Foundation)
              │
        ┌─────┴─────┐
        ▼           ▼
   Phase 34      Phase 35
   (SDK+Core)   (Tier 2 SQLite)
        │           │
        └─────┬─────┘
              ▼
        Phase 36 (Auto Capture)
              │
        ┌─────┴─────┐
        ▼           ▼
   Phase 37      Phase 38
   (MCP)        (Backfill)
        │           │
        └─────┬─────┘
              ▼
        Phase 39 (Demo + Release)
```

**Critical path:** 33 → 34 → 36 → 39 (SDK chain). Phases 35 and 38 can parallelize with 34 and 37 respectively if capacity allows.

### Phase Details

### Phase 33: Monorepo Foundation
**Goal**: Repository runs as a pnpm workspace with TypeScript project references, vitest, and CI on Node 18/20/22 — every existing test still passes.
**Depends on**: Nothing (foundation)
**Requirements**: MONO-01, MONO-02, MONO-03, MONO-04
**Success Criteria** (what must be TRUE):
  1. Running `pnpm install` from repo root resolves all four packages (`cds-core`, `cds-cli`, `cds-migrate`, `cds-s3-backend`) and links workspace deps.
  2. Running `pnpm tsc --build` compiles all packages in dependency order with zero TypeScript errors and ESM output.
  3. Running `pnpm test` executes the migrated 928-test suite in parallel per package with zero behavior change.
  4. A push to a feature branch triggers GitHub Actions matrix `[node 18, 20, 22]` running install + build + test, and fails on any TS or test error.
**Plans**: TBD

### Phase 34: SDK Integration & Core Primitives
**Goal**: `@cds/core` exposes `dispatchAgent`, `Context`, and `CostTracker` backed by `@anthropic-ai/claude-agent-sdk`, replacing the failing `claude -p` subprocess pattern.
**Depends on**: Phase 33 (needs monorepo + TS build to host new package code)
**Requirements**: SDK-01, SDK-02, CORE-01, CORE-02
**Success Criteria** (what must be TRUE):
  1. `NOTICES.md` lists `@anthropic-ai/claude-agent-sdk` with verified Apache-2.0/MIT license; if license check fails, milestone blocks before any SDK code is imported (see Risks below).
  2. A hello-world test calls `dispatchAgent({ model: 'haiku', prompt: ... })` and receives `{ output, tokens: { input, output }, cost_usd }` with non-zero token counts from the live SDK.
  3. `Context` instance accumulates conversation history across `add()` calls and persists to `~/.claude/cds-context-{session_id}.json` when persistence is enabled.
  4. `CostTracker` aggregates per-session token + USD totals across multiple `dispatchAgent` calls and returns them via `total()` / `dump()`.
**Plans**: TBD

### Phase 35: Tiered Vault — Tier 2 SQLite
**Goal**: A per-project `~/vault/projects/{name}/sessions.db` (better-sqlite3, WAL mode, FTS5) is the single write target for session memory, with type-level boundary enforcement.
**Depends on**: Phase 33 (needs monorepo to host `packages/cds-core/src/vault/`)
**Requirements**: VAULT-01, VAULT-02, VAULT-03
**Success Criteria** (what must be TRUE):
  1. Calling `openSessionsDB(projectPath)` for the first time creates `sessions.db` with WAL mode + FTS5 verified, and returns a usable connection.
  2. The opened DB contains tables `sessions`, `observations`, `entities`, `relations`, FTS5 virtual table `observations_fts`, and a `schema_version` row matching the latest migration in `vault/migrations/`.
  3. The only public write API is `sessions.ts`; attempting to import a raw `db` handle from outside that module fails TypeScript type-check.
  4. Existing markdown writers (`lib/notebooklm-sync.mjs`, `lib/adr-bridge-session.mjs`) cannot be modified to write to SQLite without explicit type errors — verified by a regression test that imports each writer and confirms no `db` handle is reachable.
**Plans**: TBD

### Phase 36: Auto Session Capture
**Goal**: When a Claude Code session ends, structured observations land in SQLite without the user typing `/end` — and a session exit is never blocked by capture failure. Closes the v0.12 ADR-02 Known Gap retroactively.
**Depends on**: Phase 34 (needs `dispatchAgent`) + Phase 35 (needs `sessions.ts` API)
**Requirements**: CAPTURE-05, CAPTURE-06
**Success Criteria** (what must be TRUE):
  1. Ending a Claude Code session in a configured project triggers `hooks/session-end-capture.mjs` detached, which writes one new `sessions` row + N `observations` rows to that project's `sessions.db` within 60s of session exit.
  2. `vault/projects/{name}/context.md` (Tier 3) gains a session pointer to the just-captured session ID.
  3. Forcing `dispatchAgent` to throw inside the hook causes the session to exit normally with no user-visible error and no partial DB writes (transaction rollback).
  4. Re-running the install wizard on a configured project replaces `session-end-check.sh` with `session-end-capture.mjs` in `.claude/settings.json` Stop hook list and prints `auto-capture enabled, /end no longer required for routine sessions`.
**Plans**: TBD

### Phase 37: MCP Adapter
**Goal**: A Claude Code session can query session memory + docs + planning state through MCP tools without reading any markdown file directly.
**Depends on**: Phase 35 (needs stable SQLite schema for sessions tools); Phase 36 strongly recommended for non-empty data
**Requirements**: MCP-01, MCP-02
**Success Criteria** (what must be TRUE):
  1. Running `cds mcp serve` starts an MCP server exposing 5 tools (`sessions.search`, `sessions.timeline`, `sessions.get_observations`, `docs.search`, `planning.status`) with MCP-spec-conformant JSON schemas.
  2. From a Claude Code session, calling `sessions.search("monorepo")` returns FTS5-ranked observations from the local `sessions.db`.
  3. Re-running the install wizard on a configured project registers the server in `.claude/settings.json` under `mcp.servers` exactly once (idempotent — second run produces no duplicate entry).
  4. `planning.status(project)` returns ROADMAP phase counts and STATE current position parsed from the project's `.planning/` (or vault planning location) markdown.
**Plans**: TBD

### Phase 38: Backfill Migration
**Goal**: Existing 30+ markdown session logs are queryable via SQLite without rewriting the markdown archive — historical context is preserved in the new memory layer.
**Depends on**: Phase 34 (needs `dispatchAgent` for Haiku entity extraction) + Phase 35 (needs `sessions.ts` API)
**Requirements**: MIGRATE-01, MIGRATE-02
**Success Criteria** (what must be TRUE):
  1. Running `claude-dev-stack migrate sessions --dry-run` walks `vault/projects/{name}/sessions/*.md` and prints per-session: file path, parsed observation count, estimated tokens, and total estimated cost (target <$0.50 for ~30 sessions).
  2. After user confirmation, running with `--apply` populates `sessions.db` with one `sessions` row per markdown file plus extracted observations and entities.
  3. Re-running `migrate sessions --apply` on an already-migrated vault is a no-op (zero new rows, prints "already migrated" per file).
  4. After backfill, `sessions.search("SEED-001")` returns observations from historical session logs alongside any post-Phase-36 auto-captured sessions.
**Plans**: TBD

### Phase 39: `/cds-quick` Demo & Alpha Release
**Goal**: A user runs `/cds-quick "<task>"` end-to-end on the new stack, sees a structured result with cost, and `claude-dev-stack@1.0.0-alpha.1` is installable via `npm install claude-dev-stack@alpha` without disturbing existing v0.12.x users on `@latest`.
**Depends on**: Phase 36 (auto-capture) + Phase 37 (MCP query) — proof-of-pipeline requires both write path and read path. Phase 38 nice-to-have for richer demo data.
**Requirements**: DEMO-01, RELEASE-01
**Success Criteria** (what must be TRUE):
  1. Running `/cds-quick "summarize current planning state"` invokes `dispatchAgent`, the resulting session is auto-captured into SQLite, and the user sees a result summary plus dollar cost in the same response.
  2. `npm install claude-dev-stack@alpha` installs `1.0.0-alpha.1`; `npm install claude-dev-stack` (no tag) still installs the latest `0.12.x`.
  3. `docs/migration-v0-to-v1-alpha.md` exists and documents settings.json schema changes, hook name changes, and the new SQLite dependency.
  4. The GitHub release for `v1.0.0-alpha.1` links the migration guide and calls out alpha-status caveats (auto-capture is the only canonical session writer; manual `/end` is fallback only).
**Plans**: 5 (complete 2026-04-16)

### Phase 40: v1.0 Alpha Implementation Polish
**Goal**: Close all implementation blockers for v1.0.0-alpha.1 release. After this phase, the codebase is ready for the formal UAT cycle in Phase 41.
**Depends on**: Phase 39 (demo + release plumbing)
**Requirements**: derived from Phase 39 follow-ups + 999.2 promotion + carried v0.12 known gap
**Scope** (implementation only; testing/UAT lives in Phase 41):
  1. **CI blocker** — fix 3 pre-existing `tests/detect.test.mjs` failures (carried since v0.12; new `publish.yml` runs `pnpm test` and they now block release).
  2. **CC 2.1.x subagent permission hardening** (promoted from backlog 999.2):
     - Auto-pass `mode=bypassPermissions` to `gsd-executor` Task() calls in `~/.claude/get-shit-done/workflows/execute-phase.md` (ships as a GSD workflow patch under `patches/` per Phase 27 patch infrastructure)
     - `claude-dev-stack doctor --gsd-permissions` populates `.claude/settings.local.json` allowlist (pnpm:*, npx:*, node:*, git merge-base:*, git reset:*, git status:*, tsc:*, vitest:*)
     - Worktree base check Read-fallback (read `.git/HEAD` directly when Bash denied)
     - Post-worktree-merge `pnpm install` step in `execute-phase.md`
     - Wizard CC 2.x detection + automatic permission allowlist setup at install time
  3. **Code review gate** for Phase 39:
     - `/gsd-code-review` for Phase 39 new code (`packages/cds-cli/src/quick.ts`, `packages/cds-cli/src/capture-standalone.ts`, `lib/install/hooks.mjs::registerCaptureHook`, `bin/install.mjs` Node check wiring)
     - Apply remediation for any high-severity findings via `/gsd-code-review-fix`
  4. **Documentation polish**:
     - README update: v1.0 install instructions + cross-link to `docs/migration-v0-to-v1-alpha.md` + CHANGELOG link
  5. **Phase 35 follow-up**: `db.pragma('busy_timeout = 5000')` in `openRawDb` (helps avoid SQLITE_BUSY under concurrent CLAUDE_SESSION_ID writes; non-blocking but ships before alpha for sturdiness).
**Success Criteria** (what must be TRUE):
  1. `pnpm test` is fully green at HEAD — no failing tests on macOS/Linux Node 20+.
  2. `~/.claude/get-shit-done/workflows/execute-phase.md` (post-patch) and `claude-dev-stack doctor --gsd-permissions` together let a fresh user run `/gsd-execute-phase` without any silent Bash denial.
  3. `/gsd-code-review` produces a clean REVIEW.md (no severity-blocking findings) for Phase 39 code.
  4. README front-matter mentions v1.0.0-alpha.1 install instructions and links the migration guide + CHANGELOG.
  5. `openRawDb` sets `busy_timeout = 5000` and a regression test confirms the pragma persists across reopens.
**Plans**: 6 plans
Plans:
- [ ] 40-01-PLAN.md — Fix detect.test.mjs failures (HOME isolation)
- [ ] 40-02-PLAN.md — GSD execute-phase bypassPermissions patch
- [ ] 40-03-PLAN.md — Doctor --gsd-permissions + wizard CC 2.x auto-config
- [ ] 40-04-PLAN.md — SQLite busy_timeout regression test
- [ ] 40-05-PLAN.md — README v1.0.0-alpha.1 update
- [ ] 40-06-PLAN.md — Code review Phase 39+40

### Phase 41: v1.0 Alpha UAT & Sandbox
**Goal**: Validate the v1.0.0-alpha.1 build end-to-end in a sandboxed environment so the release does NOT touch the maintainer's working Claude Code setup. This phase produces the Docker-based UAT harness, runs `/gsd-verify-work` for Phase 39 + Phase 40, and gates the release behind a green sandbox smoke.
**Depends on**: Phase 40 (implementation polish complete)
**Requirements**: RELEASE-01 testing tail
**Scope**:
  1. **Sandbox design** — Docker UAT harness:
     - `docker/uat/Dockerfile` — Node 20 + git + minimal toolchain
     - `docker/uat/run-smoke.sh` — installs `claude-dev-stack-1.0.0-alpha.1.tgz` inside container, runs wizard, asserts `.claude/settings.json` shape, runs every `bin/cli.mjs` subcommand, runs `migrate sessions --dry-run` against a synthetic vault, asserts MCP server entries
     - `pnpm uat` script wired to invoke the Docker harness
  2. **CLAUDE_CONFIG_DIR override** — verify whether Claude Code respects an env override for global config dir; if not, document workaround for safe smoke on host machine
  3. **Verification gates**:
     - `/gsd-verify-work` for Phase 39 (UAT)
     - `/gsd-verify-work` for Phase 40 (UAT)
  4. **Manual smoke procedure** — `docs/uat.md`: run Docker UAT first; only after green, optional manual smoke on host in `/tmp/cds-test-project-{uuid}/` with `CLAUDE_CONFIG_DIR=/tmp/cds-test-claude` to keep blast radius zero
**Success Criteria**:
  1. `pnpm uat` exits 0 on a clean machine — wizard completes, hooks registered, MCP server present, all CLI subcommands invokable, no warnings in container logs.
  2. `/gsd-verify-work` returns PASS for both Phase 39 and Phase 40.
  3. `docs/uat.md` documents the procedure such that a maintainer can repeat the UAT without referring to source.
  4. Maintainer's own `~/.claude/` and `~/vault/` are provably untouched by the UAT (audit via shasum diff before/after).
**Plans**: TBD


### Phase 42: Living Memory
**Goal**: Make SQLite session memory actively useful -- automatically loaded at session start, queryable via CLI and skills, with CLAUDE.md instructing Claude to use MCP tools for past decisions/work.
**Depends on**: Phase 37 (MCP tools), Phase 35 (SQLite sessions.db)
**Requirements**: derived from Phase 37 follow-up (memory surfacing)
**Scope**:
  1. Extend SessionsDB with listSessions + countObservationsByType methods
  2. `claude-dev-stack memory` internal CLI command + SessionStart hook wiring (D-140, D-146)
  3. `claude-dev-stack search` + `claude-dev-stack mem-stats` CLI commands (D-144, D-145)
  4. `/cds-search` + `/cds-stats` skills with MCP tool dispatch + CLI fallback (D-142, D-143)
  5. CLAUDE.md template Memory section instructing Claude to use MCP tools (D-141)
**Success Criteria**:
  1. SessionStart hook injects last 3 sessions summary from SQLite into Claude context.
  2. `claude-dev-stack search "query"` returns FTS5 results in terminal.
  3. `claude-dev-stack mem-stats` prints session count, observation breakdown, last activity.
  4. `/cds-search` and `/cds-stats` skills work in Claude Code via MCP tools with CLI fallback.
  5. Re-running wizard produces CLAUDE.md with Memory section referencing MCP tools.
**Plans**: 4 plans
Plans:
- [x] 42-01-PLAN.md -- SessionsDB extensions + memory command + hook wiring
- [x] 42-02-PLAN.md -- search + stats CLI commands
- [x] 42-03-PLAN.md -- /cds-search + /cds-stats skills
- [x] 42-04-PLAN.md -- CLAUDE.md template Memory section

### Risks & Critical Flags

- **SDK-01 license verification is a soft blocker on every downstream phase.** If `@anthropic-ai/claude-agent-sdk` license is not Apache-2.0/MIT-compatible at Phase 34 start, Phases 34/36/38/39 cannot proceed (every SDK call site is blocked). Mitigation: surface license check as the very first task of Phase 34; if it fails, escalate to user before any code import.
- **VAULT-01 driver choice is locked.** `better-sqlite3` is decided per SEED-004 + REQUIREMENTS. Do NOT re-open `bun:sqlite` discussion during Phase 35 planning.
- **CAPTURE-05 closes v0.12 ADR-02 Known Gap** — the failing `claude -p --model haiku --bare --output-format text` subprocess from v0.12 Phase 26 is replaced by SDK invocation. This is a feature win to call out in Phase 36 SUMMARY and v1.0 release notes.
- **DEMO-01 is the proof-of-pipeline criterion.** Without a working `/cds-quick` round-trip, alpha release should not ship — Phase 39 success criterion 1 gates RELEASE-01.
- **Test baseline preservation.** All 928 currently-passing tests must continue to pass after MONO-03 vitest migration; the 3 pre-existing `detect.test.mjs` failures stay untouched (route to dedicated quick task per v0.12 Known Gaps).

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 33. Monorepo Foundation | 0/? | Not started | — |
| 34. SDK Integration & Core Primitives | 0/? | Not started | — |
| 35. Tiered Vault — Tier 2 SQLite | 4/4 | Complete    | 2026-04-16 |
| 36. Auto Session Capture | 0/? | Not started | — |
| 37. MCP Adapter | 0/? | Not started | — |
| 38. Backfill Migration | 0/? | Not started | — |
| 39. `/cds-quick` Demo & Alpha Release | 5/5 | Complete   | 2026-04-16 |
| 40. v1.0 Alpha Implementation Polish | 5/6 | Complete    | 2026-04-17 |
| 41. v1.0 Alpha UAT & Sandbox | 2/2 | Complete   | 2026-04-17 |
| 42. Living Memory | 4/4 | Complete    | 2026-04-17 |

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

What shipped:

- Project-level hooks architecture with per-project `.claude/settings.json` + `allowedTools` (Phase 19)
- OAuth budget detection with SessionStart display + statusline footer (Phases 20 + 25)
- 4-option continuation prompt, `loop.md` template, post-reset handoff (Phases 21 + 22)
- Smart re-install wizard with pre-fill for language/projects/use-case + bulk prompts (Phases 23 + 24)
- Skills→Hooks migration: dev-router, project-switcher, session-manager start-path, git-conventions (Phase 31)
- GSD workflow customization via SHA-diff patches surviving `/gsd-update` (Phase 27)
- GSD workflow enforcer hook preventing per-phase execute when 2+ phases pending (Phase 29)
- CLAUDE.md idempotent merge via `updateProjectClaudeMd()` + markers (Phase 30)
- Capture-automation hotfix v0.12.1: idea-trigger UserPromptSubmit hook (Phase 32)
- Auto-ADR capture code (Phase 26, UAT deferred — closed retroactively by v1.0 Phase 36)

**Known Gaps carried to v0.13 / v1.0**: ADR-02 UAT (closed by Phase 36), SSR-01 UAT, Phase 21/25 SUMMARY.md backfill, Phase 32 pre-existing `detect.test.mjs` failures. See `.planning/MILESTONES.md` for details.

Archive: `.planning/milestones/v0.12-ROADMAP.md`

</details>

---

## Backlog

Unsequenced items captured from session work — promote to active milestone via `/gsd-review-backlog`.

### Phase 999.2: CC 2.1.x Subagent Permission Hardening (PROMOTED → Phase 40)

**Goal:** Eliminate the silent Bash-permission failure that breaks `gsd-executor` spawns under Claude Code 2.1.x.

**Source:** 2026-04-16 Phase 39 Wave 2 — both Plan 02 + Plan 03 executors blocked despite using dedicated `gsd-executor` subagent_type. Confirmed `mode=bypassPermissions` on `Task()` does NOT escalate above parent's permission mode (security model).

**Symptoms:**
- Subagent spawned in worktree returns within seconds with "Bash denied" message
- Worktree branch_check block requires Bash, so even base verification fails silently
- After worktree merge, deps installed inside the worktree's `node_modules` are gone — root must `pnpm install` again

**Sub-items (5):**
1. **GSD workflow auto-pass `mode=bypassPermissions`** to all `gsd-executor` Task() calls in `~/.claude/get-shit-done/workflows/execute-phase.md` (necessary even if not sufficient — sets the right intent).
2. **Auto-populate `.claude/settings.local.json` allowlist** for executor operations: `Bash(pnpm:*)`, `Bash(npx:*)`, `Bash(node:*)`, `Bash(git merge-base:*)`, `Bash(git reset:*)`, `Bash(git status:*)`, `Bash(tsc:*)`, `Bash(vitest:*)`. Could be a `claude-dev-stack doctor --gsd-permissions` command.
3. **Worktree base check Read-fallback**: if Bash denied, executor reads `.git/HEAD` + `.git/refs/heads/<branch>` directly to verify base — no shell required.
4. **Post-worktree-merge `pnpm install` step** in `execute-phase.md` (after `git worktree remove`) to recover deps installed inside the worktree's isolated `node_modules`.
5. **Wizard / setup detection**: detect CC 2.x at install time, configure GSD-required permission allowlist, document the model change in `docs/migration-v0-to-v1-alpha.md`.

**Plans:** 5/6 plans complete

---

## Cumulative Progress

| Phases | Milestone | Status | Completed |
|--------|-----------|--------|-----------|
| 1–5 | v0.8 | ✅ Complete | 2026-04-10 |
| 6–9 | v0.9 | ✅ Complete | 2026-04-11 |
| 10–13 | v0.10 | ✅ Complete | 2026-04-13 |
| 14–18.1 | v0.11 | ✅ Complete | 2026-04-13 |
| 19–32 | v0.12 | ✅ Complete | 2026-04-16 |
| 33–39 | v1.0 (Phase A) | 🚧 In Progress | — |

---

*Roadmap reorganized: 2026-04-16 — v1.0 CDS-Core Independence (Phase A) added with 7 phases (33–39) covering 19 v1 requirements at 100%. v0.12 archived in `<details>`. Full per-phase v0.12 history preserved in `.planning/milestones/v0.12-ROADMAP.md`.*
