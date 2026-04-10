# Project State: claude-dev-stack

**Last updated:** 2026-04-10 (after Phase 2 context captured + scope pivot via ADR-0001)

---

## Project Reference

**Project:** claude-dev-stack — CLI tool that sets up a complete Claude Code development environment in one command.

**Core Value:** Claude Code can resume work across sessions as if it remembered everything. The v0.8 milestone extends this with grounded recall from historical vault content via NotebookLM.

**Source of truth:** `.planning/PROJECT.md`
**Requirements:** `.planning/REQUIREMENTS.md` (36 v1 requirements for this milestone)
**Roadmap:** `.planning/ROADMAP.md` (5 phases)

**Current milestone:** v0.8 — NotebookLM Auto-Sync MVP
**Current focus:** Phases 1 and 2 context captured; scope pivoted for Phase 2 via ADR-0001 — ready to plan 1 or discuss 3

---

## Current Position

**Phase:** 2 — NotebookLM CLI Wrapper (last discussed); Phase 1 also has CONTEXT captured
**Plan:** n/a (both phases awaiting planning)
**Status:** 01-CONTEXT.md and 02-CONTEXT.md written, phases 1 and 2 ready for `/gsd-plan-phase`
**Progress:** ░░░░░░░░░░ 0% (0/5 phases complete, 2/5 discuss-phase done)

**Next step options:**
- `/gsd-discuss-phase 3` — continue parallel discuss chain for Phase 3 (sync manifest, SHA-256, atomic write)
- `/gsd-plan-phase 1` or `/gsd-plan-phase 2` — start planning for Phase 1 or 2 (both have locked context)

**Recent milestone-level change:** Phase 2 scope was pivoted from "HTTP client with API key" to "thin wrapper over `notebooklm-py` CLI" after discuss-phase investigation revealed Google NotebookLM has no public REST API. Full rationale in `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md`. REQUIREMENTS.md NBLM-01..06 and ROADMAP.md Phase 2 + Phase 5 were rewritten accordingly. PROJECT.md Constraints now include a system dependency on `notebooklm-py >= 0.3.4` (NotebookLM feature only).

**Alternative parallel starts** (config.parallelization = true):
- Phase 3 (manifest) — pure local file work, still parallel-ready, no dependencies
- Phase 1 (session-manager fix) — small phase, tight scope, can plan anytime

Phases 4 and 5 are blocked and cannot start yet.

---

## Performance Metrics

**Milestone targets:**
- v1 requirements: 36 (SKILL: 5, NBLM: 27, TEST: 4 including TEST-04 continuous)
- Phases: 5
- Coverage: 36/36 = 100%
- Orphaned requirements: 0

**Project-wide:**
- Tests currently passing: 54 (baseline — TEST-04 requires this count + new tests to keep passing)
- Runtime dependencies: 1 (`prompts`) — must stay at 1 after v0.8 ships
- Supported Node.js: 18+
- Last shipped release: v0.7.8

---

## Accumulated Context

### Decisions (from PROJECT.md — carried forward into this milestone)

- **Single shared NotebookLM notebook** for MVP with `{project}__` filename prefixes. Per-project notebooks deferred to v2.
- **Context.md fix bundled into NotebookLM milestone** as Phase 1 — syncing stale data is worse than not syncing, so the fix is a hard prerequisite.
- **JavaScript single-dep constraint preserved**: `package.json` stays `{"prompts": "^2.4.2"}` after v0.8 ships. No `axios`, `node-fetch`, `playwright`, etc.
- **NotebookLM integration is a CLI wrapper** over `notebooklm-py` — Google has no public REST API. System dep `notebooklm-py >= 0.3.4` documented in PROJECT.md Constraints. **Per ADR-0001, established 2026-04-10 during Phase 2 discuss.**
- **Authentication is delegated entirely to `notebooklm-py`** (browser OAuth via `notebooklm login`). Claude-dev-stack never stores credentials or handles `NOTEBOOKLM_API_KEY` (that env var was invalidated during the pivot).
- **Replace-by-filename** semantics for all non-session uploads (sessions are append-only).

### Decisions (made during roadmap creation)

- **Phases 1-3 are independent** and can run in parallel waves. Phase 4 blocks on 2+3, Phase 5 blocks on 1+2+3+4. Dependency graph is explicit in `ROADMAP.md`.
- **TEST-04 treated as continuous requirement**, not a standalone phase — each plan's verify step runs `npm test`.
- **The `notebooklm` Claude Code skill** at `~/.claude/skills/notebooklm/` was investigated during Phase 2 discuss. It's `notebooklm-py v0.3.4` — a Python CLI, not a reusable JS HTTP client. This investigation invalidated the original Phase 2 scope and led to ADR-0001 pivot. ✓ done.
- **No UI phase needed** — every phase marked `UI hint: no`. This is a pure CLI/backend milestone; `config.workflow.ui_phase = true` stays on for future UI-touching milestones but does not apply here.
- **REQUIREMENTS.md count mismatch corrected** from "37 total" to "36 total" during the pivot commit (`e6c21b7`). ✓ done.

### Todos

- [ ] Plan Phase 1 via `/gsd-plan-phase 1` (CONTEXT.md ready at `.planning/phases/01-fix-session-manager-context-auto-update/01-CONTEXT.md`)
- [ ] Plan Phase 2 via `/gsd-plan-phase 2` (post-pivot CONTEXT.md at `.planning/phases/02-notebooklm-api-client/02-CONTEXT.md`; downstream agents MUST read ADR-0001 first — referenced in canonical_refs)
- [ ] Discuss Phase 3 via `/gsd-discuss-phase 3` — sync manifest (SHA-256, atomic write)
- [ ] (Backlog, next stage) Reconcile `~/vault/projects/{name}/decisions/` ADR folder with GSD `.planning/phases/*/CONTEXT.md` — two parallel decision-capture systems exist; user flagged during Phase 1 discuss. ADR-0001 bootstrapped the decisions folder usage. Not scheduled yet. See `memory/project_vault_decisions_vs_gsd_planning.md`.
- [ ] (Phase 5 planning task) Cross-platform install strategy for `notebooklm-py` during wizard: `pipx` vs `pip --user` vs `uv pip install` — validate on macOS/Linux/Windows
- [ ] (Phase 5 research task) `notebooklm login` UX inside `install.mjs` wizard — subprocess inheritance of stdin for browser OAuth flow may be tricky in some terminals

### Blockers

None currently. Ready to start planning.

### Risks to monitor

- **`notebooklm-py` upstream fragility** — the pivot inherited a transitive dependency on a reverse-engineered RPC layer. When Google changes internal APIs and breaks `notebooklm-py`, claude-dev-stack breaks until upstream releases a fix. Mitigated by typed errors (users see actionable messages, not stack traces) and the session-end trigger treating failures as "skip silently".
- **Python runtime requirement for NotebookLM feature** — new class of user who hits "feature not available because `notebooklm-py` isn't installed". Mitigated by Phase 5 install wizard doing the setup and `doctor` check reporting status.
- **Cross-platform `pipx install notebooklm-py`** — Phase 5 wizard needs to work on macOS, Linux, Windows. Fallback paths (`pip install --user`, system-level pip) add complexity. Mitigated by treating NotebookLM as opt-in during install.
- **JavaScript single-dep constraint** under pressure — any plan that tries to add `playwright` or similar must be rejected at code-review. Wrapper-over-CLI approach eliminates the temptation.
- **context.md regressions** — Phase 1 must not break existing session-manager behavior for users who don't use NotebookLM sync at all.
- **Parallel agent safety** in `notebooklm-py` — upstream's shared `~/.notebooklm/context.json` is unsafe across concurrent processes. Mitigated by always passing explicit `-n <notebookId>` in Phase 2 wrapper (D-09 in 02-CONTEXT.md).

---

## Session Continuity

**Last session activity:** Phase 2 CONTEXT.md captured via `/gsd-discuss-phase 2`. The session uncovered a fundamental scope contradiction (Google NotebookLM has no public REST API), led to a milestone-level pivot formalized as ADR-0001, atomic rewrite of REQUIREMENTS.md NBLM-01..06 + ROADMAP.md Phases 2 & 5 + PROJECT.md Constraints (commit `e6c21b7`), then resumed discuss on the new scope with 4 tactical gray areas. All recommendations accepted in single turn (`1`). 15 decisions (D-01..D-15) locked in 02-CONTEXT.md. Committed as `docs(02): capture phase context` (`a5399f8`).

Session also wrote ADR-0001 to `~/vault/projects/claude-dev-stack/decisions/`, bootstrapping the use of the previously-unused decisions folder. Vault auto-sync hook already committed it (vault commit `a5f2aaf`).

**To resume next session:**
1. `cat .planning/PROJECT.md` — core value and constraints (post-pivot)
2. `cat .planning/ROADMAP.md` — 5 phases and dependency graph (Phase 2 + 5 rewritten)
3. `cat .planning/STATE.md` — this file
4. `cat ~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` — the architectural pivot rationale, **required reading before touching Phase 2 code**
5. `cat .planning/phases/01-fix-session-manager-context-auto-update/01-CONTEXT.md` — locked decisions for Phase 1
6. `cat .planning/phases/02-notebooklm-api-client/02-CONTEXT.md` — locked decisions for Phase 2
7. Continue: `/gsd-discuss-phase 3` (Phase 3 — sync manifest) OR start planning with `/gsd-plan-phase 1` or `/gsd-plan-phase 2`

**Files written during Phase 2 context session:**
- `~/vault/projects/claude-dev-stack/decisions/0001-notebooklm-integration-via-cli-wrapper.md` (new, in vault — auto-committed via vault hook)
- `.planning/phases/02-notebooklm-api-client/02-CONTEXT.md` (new)
- `.planning/phases/02-notebooklm-api-client/02-DISCUSSION-LOG.md` (new)
- `.planning/REQUIREMENTS.md` (updated — NBLM-01..06 rewritten, NBLM-21/23/26/27 updated, count corrected 37→36)
- `.planning/ROADMAP.md` (updated — Phase 2 and Phase 5 rewritten)
- `.planning/PROJECT.md` (updated — Constraints, Active, Key Decisions sections)
- `.planning/STATE.md` (this file — updated)

**Git trail (this session, in chronological order):**
- `5c56dfe` — docs(01): capture phase context [Phase 1]
- `63654af` — docs(state): record phase 1 context session
- `e6c21b7` — docs: pivot phase 2 scope to notebooklm-py CLI wrapper (ADR-0001)
- `a5399f8` — docs(02): capture phase context [Phase 2]
- (pending) — docs(state): record phase 2 context session + pivot

---

*State initialized: 2026-04-10 after roadmap creation*
*State updated: 2026-04-10 after Phase 1 context captured*
*State updated: 2026-04-10 after Phase 2 context captured + ADR-0001 pivot*
