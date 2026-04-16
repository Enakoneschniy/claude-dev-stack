# Roadmap: claude-dev-stack

## Milestones

- ✅ **v0.8 NotebookLM Sync** — Phases 1–5 (shipped 2026-04-10)
- ✅ **v0.9 Git Conventions & NotebookLM Per-Project** — Phases 6–9 (shipped 2026-04-11)
- ✅ **v0.10 Query, Sync Automation & Quality** — Phases 10–13 (shipped 2026-04-13)
- ✅ **v0.11 DX Polish & Ecosystem** — Phases 14–18.1 (shipped 2026-04-13)
- ✅ **v0.12 Hooks & Limits** — Phases 19–32 (shipped 2026-04-16)
- 📋 **v1.0 CDS-Core Independence** — Phase A monorepo scaffolding (planning)

---

## Phases

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
- Auto-ADR capture code (Phase 26, UAT deferred)

**Known Gaps carried to v0.13**: ADR-02 UAT, SSR-01 UAT, Phase 21/25 SUMMARY.md backfill, Phase 32 pre-existing `detect.test.mjs` failures. See `.planning/MILESTONES.md` for details.

Archive: `.planning/milestones/v0.12-ROADMAP.md`

</details>

---

## 📋 v1.0 — CDS-Core Independence (Planning)

**Milestone Goal:** Carve `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend` into a pnpm monorepo; port memory primitives to Claude Agent SDK; ship `claude-dev-stack@1.0.0-alpha.1` via `--tag alpha`.

Next milestone will be generated via `/gsd-new-milestone`. See `docs/cds-core-independence-plan.md` and SEED-004 (`vault/projects/claude-dev-stack/seeds/SEED-004-tiered-vault.md`) for scoping.

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–5 | v0.8 | ✅ | Complete | 2026-04-10 |
| 6–9 | v0.9 | ✅ | Complete | 2026-04-11 |
| 10–13 | v0.10 | ✅ | Complete | 2026-04-13 |
| 14–18.1 | v0.11 | ✅ | Complete | 2026-04-13 |
| 19–32 | v0.12 | ✅ | Complete | 2026-04-16 |
| TBD | v1.0 | — | Planning | — |

---

*Roadmap reorganized: 2026-04-16 — v0.12 archived, v1.0 placeholder added. Full per-phase history preserved in `.planning/milestones/v0.12-ROADMAP.md`.*
