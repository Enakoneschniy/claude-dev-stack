# claude-dev-stack

## What This Is

CLI tool that sets up a complete Claude Code development environment in one command — vault for cross-session memory, skills for auto-invocation, hooks for lifecycle logging, plus MCP servers, plugins, and stack templates. Solves Claude Code's #1 problem: total amnesia between sessions. Distributed as `npx claude-dev-stack`.

Target user: individual developers using Claude Code seriously across multiple projects who want persistent context, reproducible setup, and consistent workflow across machines.

## Core Value

**Claude Code can resume work across sessions as if it remembered everything.**

Everything else — plugins, templates, MCP catalog, stack detection — is supporting infrastructure for this one thing. If memory/context restoration breaks, the product fails even if all other features work.

## Current Milestone: v1.0 — CDS-Core Independence (Planning)

**Goal:** Carve `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend` into a pnpm monorepo; port memory primitives to Claude Agent SDK; ship `claude-dev-stack@1.0.0-alpha.1` via `--tag alpha`.

**Phase A scope (from `docs/cds-core-independence-plan.md` + SEED-004):**
- pnpm workspaces monorepo scaffolding with TS project references + vitest + CI
- Pi SDK hello-world — first Claude Agent SDK dispatch
- Core primitives: agent-dispatcher, context, cost-tracker
- Tiered vault (hot/warm/cold) + auto session capture with Haiku entity extraction
- `/cds-quick` end-to-end demo
- Docs + alpha release via `npm publish --tag alpha`

**Open questions for Phase A kickoff:**
- `@anthropic-ai/claude-agent-sdk` license verification (Apache-2.0 / MIT — confirm)
- SQLite driver choice: `better-sqlite3` vs `bun:sqlite`
- Backfill strategy: migrate existing 30+ markdown sessions into SQLite via Haiku entity extraction

<details>
<summary>v0.12 — Hooks & Limits — SHIPPED ✅ (2026-04-16)</summary>

13 phases (19–32), 32 plans, 912 tests (+354 from v0.11 baseline 558). Published as `claude-dev-stack@0.12.0` (PR #37) + hotfix `@0.12.1` (PR #41). Archive: [`.planning/milestones/v0.12-ROADMAP.md`](milestones/v0.12-ROADMAP.md).

What shipped: project-level hooks + allowedTools (Phase 19), OAuth budget detection + statusline (Phases 20+25), 4-option continuation prompt + `loop.md` + post-reset handoff (Phases 21+22), smart re-install wizard with pre-fill + bulk prompts (Phases 23+24), auto-ADR capture code (Phase 26, UAT deferred), GSD workflow patches + enforcer hook (Phases 27+29), CLAUDE.md idempotent merge (Phase 30), Skills→Hooks migration (Phase 31), idea-capture UserPromptSubmit hook v0.12.1 (Phase 32).

Known Gaps carried to v0.13: ADR-02 + SSR-01 live UAT, Phase 21/25 SUMMARY.md backfill, pre-existing `detect.test.mjs` failures.
</details>

<details>
<summary>v0.11 — DX Polish & Ecosystem — SHIPPED ✅ (2026-04-13)</summary>

6 phases (14–18.1), 12 plans, 558 tests. Archive: [`.planning/milestones/v0.11-ROADMAP.md`](milestones/v0.11-ROADMAP.md).

What shipped: Auto-approve vault ops, smart re-install wizard, path→slug centralization, git-conventions (gitmoji, GitHub Action, migration helper), NotebookLM cross-notebook search, Notion database import, analytics integration, always-on TeamCreate parallel execution.
</details>

<details>
<summary>v0.10 — Query, Sync Automation & Quality — SHIPPED ✅ (2026-04-13)</summary>

4 phases (10–13), 9 plans, 483 tests (+77 from baseline 406). Archive: [`.planning/milestones/v0.10-ROADMAP.md`](milestones/v0.10-ROADMAP.md).

What shipped: NotebookLM Query API (ask + generate), session-end sync automation, install.mjs refactor (1471→108 lines), bugfixes, ADR bridge, parallel phase execution.
</details>

## Requirements

### Validated

<!-- Shipped in v0.2–v0.7.8, confirmed working. Inferred from codebase map. -->

- ✓ CLI router in `bin/cli.mjs` — routes 35+ subcommands to feature modules — v0.2
- ✓ Setup wizard in `bin/install.mjs` — interactive config with use-case recommendations — v0.2
- ✓ Vault discovery — checks `~/vault`, `~/Vault`, `~/.vault`, `~/obsidian-vault`, `~/Documents/vault` + `VAULT_PATH` env — v0.2
- ✓ Project management — add/remove/list/map projects in vault (`lib/projects.mjs`, `lib/add-project.mjs`) — v0.3
- ✓ Skills catalog — install/remove skills from catalog + Git URL (`lib/skills.mjs`) — v0.4
- ✓ Plugin system — 19 marketplaces + presets + use-case selection (`lib/plugins.mjs`) — v0.4
- ✓ MCP server management — 18-server catalog (`lib/mcp.mjs`) — v0.4
- ✓ Stack templates — 14 stacks (Next.js, React, FastAPI, Django, Rails, Laravel, Spring Boot, Nuxt, SvelteKit, Astro, etc.) — v0.5–v0.7
- ✓ Import from 6 AI tools — `.cursorrules`, CLAUDE.md, Cursor, Aider, Continue, Windsurf (`lib/import.mjs`) — v0.5
- ✓ Export vault — `.tar.gz` + git sync (init/push/pull) (`lib/export.mjs`) — v0.5
- ✓ Docs management — files, Notion markdown export, paste (`lib/docs.mjs`) — v0.5
- ✓ Analytics dashboard — sessions, context quality scores, stale detection (`lib/analytics.mjs`) — v0.6
- ✓ Doctor health check — prereqs, vault, skills, plugins, settings (`lib/doctor.mjs`) — v0.6
- ✓ Update flow — auto-refresh skills, hooks, GSD, CLI (`lib/update.mjs`) — v0.6
- ✓ SessionStart/Stop hooks — reliable session boundary logging (`hooks/session-*.sh`) — v0.6
- ✓ GitHub Actions CI — Node 18/20/22 matrix with syntax checks + tests — v0.6
- ✓ npm publishing with OIDC provenance (`.github/workflows/publish.yml`) — v0.6
- ✓ Project-level skills installation — copies session-manager, project-switcher, dev-router, dev-research to `{project}/.claude/skills/` so they auto-invoke via Skill tool — v0.7.8
- ✓ Idempotent CLAUDE.md update — markers `<!-- @claude-dev-stack:start/end -->` for safe re-runs — v0.7.8
- ✓ Superpowers auto-install, GSD optional — workflow engine shift (GSD off by default) — v0.7.8
- ✓ Missing project-map entries surfaced instead of silent skip (commit e4a03ad) — v0.7.9 (unreleased)
- ✓ NotebookLM Query API — askNotebook + generateArtifact + CLI ask/generate — v0.10
- ✓ Session-end sync automation — hook chain: trigger→runner→detached background sync — v0.10
- ✓ install.mjs refactored to 108-line orchestrator + 13 lib/install/ modules — v0.10
- ✓ Bugfixes: ADR path resolution, sync stats undefined, 5 Phase 6 code review warnings — v0.10
- ✓ ADR bridge — auto-populate vault/decisions from CONTEXT.md decisions during GSD transitions — v0.10
- ✓ Parallel phase execution via TeamCreate with cost estimate + consent — v0.10
- ✓ Project-level hooks architecture — session hooks + `allowedTools` in `.claude/settings.json` — v0.12 (BUG-01..06)
- ✓ OAuth budget detection — `api.anthropic.com/api/oauth/usage` + SessionStart display + statusline footer — v0.12 (LIMIT-01, LIMIT-05)
- ✓ 4-option continuation prompt + `loop.md` + post-reset handoff — v0.12 (LIMIT-02..04)
- ✓ Smart re-install wizard pre-fill + bulk prompts — v0.12 (DX-07..13, UX-01..07)
- ✓ GSD workflow patches (SHA-diff re-apply) + enforcer hook — v0.12 (GSD-01, WF-01)
- ✓ CLAUDE.md idempotent merge via markers — v0.12 (BUG-07)
- ✓ Skills→Hooks migration (dev-router, project-switcher, session-manager start, git-conventions) — v0.12 (SKL-01..04)
- ✓ Idea-capture UserPromptSubmit hook (RU + EN triggers) — v0.12.1 (CAPTURE-01..04)

### Current State

**Last shipped:** v0.12 Hooks & Limits (2026-04-16) — SHIPPED ✅

v0.12: 13 phases (19–32), 32 plans, 912 tests (+354 from v0.11 baseline 558). Published as `claude-dev-stack@0.12.0` (PR #37, commit `b12d89e`) + hotfix `@0.12.1` (PR #41, commit `9d34682`). Milestone archive: [`.planning/milestones/v0.12-ROADMAP.md`](milestones/v0.12-ROADMAP.md).

Known Gaps carried to v0.13 / v1.0 planning:
- ADR-02 UAT deferred — code shipped on `gsd/phase-26-auto-adr-capture`, but `/end → Haiku → ADR write` round-trip failed with `claude -p --model haiku --bare --output-format text` subprocess error; needs debugging.
- SSR-01 UAT deferred — SessionStart marker mtime + 60-min skip-reload logic shipped, real-session verification pending.
- Phase 21 / Phase 25 SUMMARY.md — shipped inline, no retrospective written; accepted as tech debt.
- `detect.test.mjs` 3 pre-existing subtest failures (`profile must be null in v1`) — route to bugfix quick task.

### Active

**Milestone v1.0 in planning.** Next step: `/gsd-new-milestone v1.0 "CDS-Core Independence"` to generate roadmap from `docs/cds-core-independence-plan.md` + SEED-004 (tiered vault + auto session capture). Phase numbering will continue from Phase 33+. Branching strategy remains `phase` — `gsd/phase-{N}-{slug}` branches.

**Target capabilities for v1.0:**
- pnpm workspaces monorepo (`@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`)
- TypeScript project references + vitest + CI
- Claude Agent SDK (Pi SDK) port — first agent dispatch
- Core primitives: agent-dispatcher, context, cost-tracker
- Tiered vault (hot/warm/cold) with SQLite session capture
- Haiku entity extraction for backfill of existing markdown sessions
- `/cds-quick` end-to-end demo
- Alpha release via `npm publish --tag alpha`

### Out of Scope

<!-- Explicit boundaries — this section spans v0.8 (closed) and v0.9 (active). Deferred items revisited at next milestone boundary. -->

**Now in v0.9 (no longer out of scope):**
- **Per-project NotebookLM notebooks** — promoted to v0.9, with full migration script for existing 27 sources
- **Notion → vault auto-import via MCP** — promoted to v0.9, intent-triggered, page-specific config

**Still out of scope for v0.9 (deferred to v0.10+):**
- **`.planning/` structural split** (team contract vs execution state) — deferred to v0.10
- **Analytics dashboard NotebookLM integration** — deferred to v0.10
- **`dev-research` skill standalone improvements** — deferred to v0.10 (per-project notebooks in v0.9 automatically improve `{project}__` filter)
- **Cron-based periodic NotebookLM sync** — rejected; intent-based and session-end is sufficient
- **vault/decisions vs `.planning/decisions/` policy unification** — orthogonal cleanup, not blocking
- **Migration helper from prose CLAUDE.md → structured `git-scopes.json`** — deferred to v0.10
- **Whole-workspace Notion imports** — rejected; page-specific only per `notion_pages.json`
- **Notion REST API fallback when MCP unavailable** — rejected; MCP-only
- **Two-way Notion sync** (vault → Notion) — rejected; vault is canonical source of truth
- **Hybrid NotebookLM mode** (some projects shared, some per-project) — rejected; strict per-project from v0.9 migration onwards

**Still out of scope (carried forward from v0.8):**
- **Two-way sync (NotebookLM → vault)** — rejected; NotebookLM is read-only consumer, vault is source of truth
- **External library docs sync** (e.g. React docs into NotebookLM) — separate concern, belongs to `dev-research` skill, not vault sync
- **Shared patterns (`~/vault/shared/patterns.md`) sync** — deferred; not part of per-project flow

## Context

**Technical environment:**
- ESM-only Node.js CLI (`.mjs`), single runtime dependency (`prompts`), no linter/formatter/TypeScript by design — simplicity is a feature
- 14 feature modules in `lib/`, one god-file `bin/install.mjs` (1287 lines) that remains monolithic because wizard flow benefits from linear top-down read
- Test runner: `node:test` + `node:assert/strict`, 54 tests (cli, hooks, shared, skills, templates, project-setup)
- CI matrix: Node 18/20/22, publishing: Node 24 with npm provenance

**Prior work relevant to this milestone:**
- `dev-research` skill already exists as a NotebookLM client scaffold — invoked manually today, consumes an existing notebook. NotebookLM sync milestone will *populate* notebooks that `dev-research` reads from.
- `lib/docs.mjs` already handles Notion markdown import into `vault/projects/{name}/docs/` — NotebookLM sync automatically picks them up once they land in vault.
- User has no existing NotebookLM notebook yet. This is a pilot run — first real sync test will establish baseline.

**Known issues (from `.planning/codebase/CONCERNS.md`) to factor into planning:**
- `session-manager` context.md auto-update not implemented (blocks NotebookLM sync of stale data)
- Path ↔ project-slug mapping scattered across 4 files — should not expand this surface area; NotebookLM sync should reuse existing `reverseProjectMap()`
- No integration test infrastructure — new sync logic should ship with unit tests but end-to-end testing is manual for now
- `prompts@2.4.2` unmaintained but stable — no migration in this milestone

## Constraints

- **Runtime**: Node.js 18+ — do not use APIs that require Node 20+ (e.g., `fetch` is OK, `navigator` is not)
- **JavaScript dependencies**: Stay single-dep (`prompts` only) — no `axios`, `node-fetch`, `playwright`, or similar additions. Use `node:https`, `fetch`, or `child_process.spawnSync` instead.
- **System dependencies (NotebookLM feature only)**: `notebooklm-py >= 0.3.4` must be installed and available on `PATH` as `notebooklm` for the NotebookLM sync feature to work. Install with `pipx install notebooklm-py` (primary) or `pip install --user notebooklm-py` (fallback). Non-NotebookLM features of claude-dev-stack do NOT require Python — the system dependency is feature-scoped. Authentication is delegated entirely to `notebooklm-py` (browser OAuth via `notebooklm login`); claude-dev-stack never reads `NOTEBOOKLM_API_KEY` or stores credentials. Per ADR-0001.
- **Distribution**: Must install via `npx` with no post-install step — cannot require compilation or native bindings
- **Style**: Conventional commits (feat/fix/chore/docs), no Co-Authored-By, no linter but consistent ESM + destructuring + template literals + `c.X` color strings (NOT functions)
- **Comms**: Code and commits in English; user-facing CLI output in English; communication (issues, PRs, chat) in Russian
- **Testing**: Every new `lib/*.mjs` module needs a matching `tests/*.test.mjs` file; tests use `node:test` only, no external frameworks. External CLI dependencies (like `notebooklm`) are mocked via bash stubs placed at the front of `PATH` in the test, never by invoking the real binary.
- **Backward compatibility**: Project already shipped v0.7.8 to real users — breaking changes to public commands/flags require major bump and migration notes
- **Secrets**: Claude-dev-stack never stores NotebookLM credentials. Authentication is delegated entirely to `notebooklm-py` (browser OAuth via `notebooklm login`, cookies at `~/.notebooklm/storage_state.json`). No `NOTEBOOKLM_API_KEY` env var, no `.env` files in repo. Per ADR-0001.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Superpowers over GSD as primary workflow in v0.7.8 | GSD user-level skills don't auto-invoke via Skill tool; superpowers does. Project-level copying solved it but GSD stayed optional to keep default install simple. | ✓ Good — verified in v0.7.8 sandbox |
| Project-level skill copying via `lib/project-setup.mjs` | User-level `~/.claude/skills/` don't auto-trigger; copying to `{project}/.claude/skills/` is the only reliable way | ✓ Good — verified 7/7 projects in live test |
| `missing` array instead of silent skip in `setupAllProjects` | Silent failure mode hid stale project-map entries; loud warning with cleanup hint is worth the extra output noise | ✓ Good — shipped in e4a03ad |
| Single shared NotebookLM notebook (for MVP) | Pilot phase has no existing notebook; one notebook is simpler to set up, test, and observe. Migration path to per-project stays open. | — Pending validation (upcoming milestone) |
| Filename prefix `{project}__` in shared notebook | Lets user ask "only look at biko-pro__ files" to scope queries; cheap disambiguation | — Pending validation |
| Fix context.md auto-update inside NotebookLM milestone (not as separate fix) | Sync of stale context.md is worse than not syncing — the fix is a hard prerequisite for the sync feature. Bundling keeps the feedback loop closed. | — Pending |
| Manual Notion export step kept for now | Already works via `docs add`; automating via Notion MCP is a future phase once pilot validates the pipeline | — Deferred |
| NotebookLM integration via `notebooklm-py` CLI wrapper, not a custom HTTP client (ADR-0001) | Google NotebookLM has no public REST API. `notebooklm-py` already implements the reverse-engineered RPC + browser OAuth layer. Writing our own would break single-dep (needs playwright) and duplicate work. | ✓ Good — accepted during Phase 2 discuss-phase 2026-04-10; full rationale in `vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` |
| Project-level hooks over global hooks (v0.12 Phase 19) | Global `~/.claude/settings.json` affected all projects including non-claude-dev-stack ones. Moving to per-project `.claude/settings.json` scopes hooks to configured projects only. | ✓ Good — shipped in v0.12, verified in live wizard |
| OAuth usage API for budget detection (v0.12 Phase 20) | No public rate-limit headers on subscription plans. `api.anthropic.com/api/oauth/usage` with Keychain-stored token is the only reliable source. | ✓ Good — shipped with 60s cache + SessionStart display + statusline |
| Haiku subprocess for auto-ADR capture (v0.12 Phase 26 D-01) | Session transcript is too long for in-context decision extraction. `claude -p --model haiku --bare` gives structured XML output cheaply. | ⚠️ Revisit — UAT failed with subprocess command error; needs debug before v1.0 |
| Skills→Hooks migration for deterministic routers (v0.12 Phase 31) | Deterministic keyword matching doesn't need LLM activation. Hooks save tokens and fire silently (no skill-activation UI noise). | ✓ Good — 4 skills migrated, token cost ~zero |
| Drop GSD branching_strategy "none", keep "phase" (v0.12 Phase 19 + memory feedback) | "none" caused commits on main instead of feat branches. `phase` + PR-only merge is the right default. | ✓ Good — enforced via user feedback memory |
| v1.0 pivot to pnpm monorepo + Claude Agent SDK (SEED-004) | Current single-package CLI has outgrown `bin/install.mjs` (1287 lines god-file). Carving into `@cds/core` primitives unblocks SDK port + alpha release path. | — Pending v1.0 kickoff |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after v0.12 milestone — full evolution review. v0.12 collapsed to `<details>`, v1.0 CDS-Core Independence added as current planning milestone. 9 v0.12 capabilities moved to Validated. 6 new decisions logged. Known Gaps (ADR-02 UAT, SSR-01 UAT, Phase 21/25 SUMMARY gaps, `detect.test.mjs` failures) carried to v0.13 planning.*
