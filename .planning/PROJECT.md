# claude-dev-stack

## What This Is

CLI tool that sets up a complete Claude Code development environment in one command — vault for cross-session memory, skills for auto-invocation, hooks for lifecycle logging, plus MCP servers, plugins, and stack templates. Solves Claude Code's #1 problem: total amnesia between sessions. Distributed as `npx claude-dev-stack`.

Target user: individual developers using Claude Code seriously across multiple projects who want persistent context, reproducible setup, and consistent workflow across machines.

## Core Value

**Claude Code can resume work across sessions as if it remembered everything.**

Everything else — plugins, templates, MCP catalog, stack detection — is supporting infrastructure for this one thing. If memory/context restoration breaks, the product fails even if all other features work.

## Current Milestone: v0.10 — Query, Sync Automation & Quality

**Goal:** Make NotebookLM a two-way tool (upload + query), auto-sync vault on session end, fix v0.9 bugs, and prepare infrastructure for parallel phase execution.

**Target features:**
- **NotebookLM Query API** — wrap `ask`, `generate` in `lib/notebooklm.mjs`, CLI `notebooklm ask "question"`, save answers to vault. Currently only upload/sync; query exists in notebooklm-py but not in our wrapper.
- **Auto-sync on session end** — session-end hook triggers `notebooklm sync` silently in background after session log creation. Currently sync is manual-only.
- **Migration bugfixes** — ADR path resolution (`ADR-NNNN-` prefix → `NNNN-` filename mapping), sync stats `undefined` display fix.
- **install.mjs refactor** — split 1287-line monolith into focused modules, remove shared.mjs utility duplication.
- **Code review fixes** — 5 warnings from Phase 6 review (hasCommand shell injection, --full mode bug, Go detector performance, settings.json parse error, withStubBinary async).
- **ADR bridge** — auto-populate vault/decisions from .planning/CONTEXT.md decisions during GSD workflow. Currently two parallel systems that don't sync.
- **Parallel Phase Execution via Teams** — GSD orchestrates independent phases through TeamCreate with user consent (cost awareness). Currently phases run strictly sequential even when independent.

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

### Current State

**Last shipped:** v0.8.1 NotebookLM Auto-Sync hotfix (2026-04-11) — SHIPPED ✅

v0.8.0 + v0.8.1 hotfix: 5 phases, 10 plans, 36/36 requirements, 247 tests (+193 from baseline). Full architecture rationale in 12 ADRs at `~/vault/projects/claude-dev-stack/decisions/`. Milestone archive: [`.planning/milestones/v0.8-ROADMAP.md`](milestones/v0.8-ROADMAP.md).

**What shipped in v0.8 / v0.8.1:**
- `lib/notebooklm.mjs` — 7-function CLI wrapper over `notebooklm-py` (ADR-0001 pivot), with cp-to-tmp `uploadSource` title workaround (v0.8.1)
- `lib/notebooklm-sync.mjs` — `syncVault(opts)` walks vault → uploads с `{project}__` naming
- `lib/notebooklm-manifest.mjs` — SHA-256 change detection с atomic writes + corrupt recovery
- `lib/notebooklm-cli.mjs` — `notebooklm sync`/`status` CLI commands
- `lib/session-context.mjs` — real fix for context.md auto-update bug
- `hooks/notebooklm-sync-trigger.mjs` + runner — detached background sync после session end
- `bin/install.mjs` — full NotebookLM wizard (pipx → login stdio inherit → first sync)
- `lib/doctor.mjs` — 3-line NotebookLM health section с ADR-0012 severity discipline

**Post-v0.8 tech-debt cleanup (2026-04-11, between v0.8.1 and v0.9 init):**
- ✅ GitHub Actions v4→v5 migration (PR #17, `becd975`) — fixes Node 20 deprecation warning
- ✅ Sync log rotation in `notebooklm-sync-runner.mjs` (PR #18, `fd7fdba`) — `_rotateLogIfNeeded` keeps last 100 lines
- ✅ Output-style hijack defense (PR #19, `288ec69`) — doctor warning + CLAUDE.md template override against `learning-output-style`/`explanatory-output-style` plugin SessionStart hooks that hijack agent behavior
- ✅ GSD `branching_strategy` → `none` + `quick_branch_template` → `chore/{slug}` (PR #20, `3725def`) — workaround for upstream `cmdCommit` branch hijack bug, enables clean per-quick-task branches

Test count after cleanup: **264** (247 + 17 from cleanup PRs).

### Active

<!-- v0.9 milestone active — see Current Milestone section above for goal and target features. -->

**Milestone v0.9 in progress.** See "Current Milestone: v0.9" section above for goal and target features. Phase numbering starts at **Phase 6** (continues from v0.8 which ended at Phase 5). Branching strategy is `none` — each phase will be on a feature branch + PR + CI → merge to main, like the 4 cleanup PRs above.

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
*Last updated: 2026-04-11 — milestone v0.9 (Git Conventions & NotebookLM Per-Project) initiated via `/gsd-new-milestone`. Added Current Milestone section, refreshed Current State with v0.8.1 hotfix and 4 post-v0.8 cleanup PRs (#17/#18/#19/#20), Out of Scope reorganized into "now in v0.9", "still deferred to v0.10+", and "carried forward from v0.8". Phase numbering continues from Phase 6.*
