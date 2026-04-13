1	# Roadmap: claude-dev-stack

## Milestones

- ✅ **v0.8 NotebookLM Sync** - Phases 1–5 (shipped 2026-04-10)
- ✅ **v0.9 Git Conventions & NotebookLM Per-Project** - Phases 6–9 (shipped 2026-04-11)
- ✅ **v0.10 Query, Sync Automation & Quality** - Phases 10–13 (shipped 2026-04-13)
- ✅ **v0.11 DX Polish & Ecosystem** - Phases 14–18.1 (shipped 2026-04-13)
- 🚧 **v0.12 Hooks & Limits** - Phases 19–22 (in progress)

---

<details>
<summary>✅ v0.8–v0.11 (Phases 1–18.1) - SHIPPED 2026-04-13</summary>

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

---

## 🚧 v0.12 — Hooks & Limits (In Progress)

**Milestone Goal:** Fix global hooks architecture (move to project-level), fix wizard UAT bugs, and integrate Claude Code's scheduling primitives for limit-aware execution.

**Phase numbering:** continues from v0.11 (last phase: 18.1) → starts at Phase 19
**Granularity:** standard
**Test baseline:** 558 (v0.11.0)
**Branching:** `phase` → `gsd/phase-{phase}-{slug}`

## Phases

- [ ] **Phase 19: Project-Level Hooks & Wizard Bug Fixes** — Move hooks to project-level settings, add allowedTools, fix all 3 wizard pre-select bugs, git-conventions skip, and GSD patch persistence (BUG-01..06)
- [ ] **Phase 20: Budget Detection** — Monitor session usage and emit warnings at configurable threshold (LIMIT-01)
- [ ] **Phase 21: Continuation Prompt & loop.md** — 4-option continuation prompt when budget low + loop.md template for scheduled tasks (LIMIT-02, LIMIT-03)
- [ ] **Phase 22: Post-Reset Handoff** — Load STATE.md on scheduled task fire and continue from stopped_at (LIMIT-04)

---

## Phase Details

### Phase 19: Project-Level Hooks & Wizard Bug Fixes
**Goal**: Session hooks run only for projects configured via claude-dev-stack, wizard pre-selects existing state so users do not re-enter known values, and git-conventions does not overwrite existing config.
**Depends on**: Nothing (starts off main)
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06
**Success Criteria** (what must be TRUE):
  1. User running the install wizard on a configured project sees session hooks written to `.claude/settings.json` in the project directory — not to `~/.claude/settings.json`. Existing global hooks remain untouched.
  2. User inspecting project `.claude/settings.json` sees an `allowedTools` list that includes vault read/write patterns and safe git bash commands — no permission prompt appears when session-manager reads context.md or writes session logs.
  3. User re-running the install wizard sees projects already in `project-map.json` pre-checked in the `collectProjects` step — they do not start with a blank selection.
  4. User re-running the install wizard sees components already detected as installed marked with "(installed)" in `selectComponents` and pre-selected by default.
  5. User running git-conventions setup on a project that already has `git-scopes.json` is offered "(already configured) — reconfigure?" instead of silent re-initialization.
  6. After `/gsd-update`, transition.md TeamCreate patch is auto-reapplied from package-shipped `patches/` via SessionStart hook. User sees "GSD patches auto-reapplied" message if patch was restored.
**Plans**: TBD

---

### Phase 20: Budget Detection
**Goal**: Claude Code sessions emit a visible warning before hitting the context limit, giving users enough time to act before execution stops.
**Depends on**: Nothing (independent monitoring feature)
**Requirements**: LIMIT-01
**Success Criteria** (what must be TRUE):
  1. When session usage crosses the configurable threshold (default 70%), a warning message appears in the session output including the remaining budget estimate.
  2. The threshold is configurable — user can set a different percentage and the hook respects it on next session start.
  3. Warning fires at most once per threshold crossing — it does not spam on every subsequent message after the threshold is crossed.
**Plans**: TBD

---

### Phase 21: Continuation Prompt & loop.md
**Goal**: When budget is low, users choose exactly what happens next — whether that is a reminder, a scheduled local continuation, a cloud task, or proceeding immediately — and recurring scheduled tasks have a GSD-aware template to follow.
**Depends on**: Phase 20 (budget warning must fire before continuation prompt can be triggered)
**Requirements**: LIMIT-02, LIMIT-03
**Success Criteria** (what must be TRUE):
  1. When budget warning fires, user sees a 4-option prompt: (1) Remind me later, (2) Auto-continue locally, (3) Auto-continue in cloud, (4) Continue now.
  2. Selecting "Remind me later" triggers a one-shot CronCreate reminder — user receives a notification when the reminder fires.
  3. Selecting "Auto-continue locally" schedules a Desktop task that runs the GSD resume command when triggered.
  4. Selecting "Auto-continue in cloud" schedules a Cloud task that clones the repo and resumes autonomously.
  5. User running the install wizard can choose to install `loop.md` to their project `.claude/` directory — the template provides a GSD-aware maintenance loop for scheduled/recurring tasks.
**Plans**: TBD
**UI hint**: yes

---

### Phase 22: Post-Reset Handoff
**Goal**: Scheduled tasks (local or cloud) pick up exactly where the previous session stopped — no manual state lookup, no re-orientation needed.
**Depends on**: Phase 21 (scheduling primitives must be in place before handoff logic is meaningful)
**Requirements**: LIMIT-04
**Success Criteria** (what must be TRUE):
  1. When a scheduled task fires, it reads `.planning/STATE.md`, extracts `stopped_at` and `resume_file`, and begins execution from that point — no manual step required.
  2. Handoff works after a fresh git clone — all state is committed to git and the scheduled task operates on a clean checkout without needing previous session artifacts.
  3. If `stopped_at` is missing or STATE.md is absent, the task surfaces a clear error instead of silently executing from the wrong position.
**Plans**: TBD

---

## Coverage Table

All 10 v1 requirements mapped to exactly one owning phase:

| REQ-ID | Phase | Description |
|--------|-------|-------------|
| BUG-01 | 19 | Wizard writes hooks to project-level .claude/settings.json |
| BUG-02 | 19 | Wizard writes allowedTools to project-level .claude/settings.json |
| BUG-03 | 19 | collectProjects pre-selects existing project-map.json entries |
| BUG-04 | 19 | selectComponents pre-selects installed components with "(installed)" label |
| BUG-05 | 19 | installGitConventions skips or prompts when git-scopes.json exists |
| BUG-06 | 19 | GSD transition.md TeamCreate patch auto-reapplied after /gsd-update |
| LIMIT-01 | 20 | Budget detection hook with configurable threshold and warning |
| LIMIT-02 | 21 | 4-option continuation prompt triggering corresponding scheduling primitive |
| LIMIT-03 | 21 | loop.md template for GSD-aware scheduled/recurring tasks |
| LIMIT-04 | 22 | Post-reset handoff reads STATE.md stopped_at and resumes execution |

**Coverage check**: 10/10 requirements mapped (100%), 0 orphaned.

- Phase 19: 6 requirements (BUG-01, BUG-02, BUG-03, BUG-04, BUG-05, BUG-06)
- Phase 20: 1 requirement (LIMIT-01)
- Phase 21: 2 requirements (LIMIT-02, LIMIT-03)
- Phase 22: 1 requirement (LIMIT-04)

Total: 6 + 1 + 2 + 1 = 10 ✓

---

## Dependency Graph

```
Phase 19 — Project-Level Hooks & Wizard Bug Fixes (MEDIUM risk)
  ├─ touches bin/install.mjs wizard flow and lib/install/hooks.mjs
  ├─ backward compat: existing global hooks must remain untouched
  └─ no upstream deps — starts off main

Phase 20 — Budget Detection (LOW risk)
  ├─ independent monitoring feature — no upstream deps
  ├─ new hook or skill that reads /context or /cost output
  └─ can run in parallel with Phase 19

Phase 21 — Continuation Prompt & loop.md (MEDIUM risk)
  ├─ depends on Phase 20: budget warning must fire before prompt triggers
  ├─ integrates CronCreate, Desktop task, Cloud task scheduling primitives
  └─ loop.md template install is independent sub-feature within this phase

Phase 22 — Post-Reset Handoff (LOW risk)
  ├─ depends on Phase 21: scheduling primitives in place
  ├─ reads STATE.md — pure reader, no write risk
  └─ must handle missing-state gracefully
```

**Parallel opportunities:**
- Phases 19 and 20 are fully independent — can run in parallel
- Phase 21 depends only on Phase 20
- Phase 22 depends only on Phase 21

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 10. Bugfixes | v0.10 | 2/2 | Complete | 2026-04-12 |
| 11. NotebookLM Query API | v0.10 | 2/2 | Complete | 2026-04-12 |
| 12. Sync Automation + install.mjs Refactor | v0.10 | 3/3 | Complete | 2026-04-13 |
| 13. GSD Infrastructure | v0.10 | 2/2 | Complete | 2026-04-13 |
| 14. Code Review Fixes + Quality Refactor | v0.11 | 2/2 | Complete | 2026-04-13 |
| 15. DX — Auto-Approve & Smart Re-install | v0.11 | 2/3 | Complete | 2026-04-13 |
| 16. Git Conventions Ecosystem | v0.11 | 2/2 | Complete | 2026-04-13 |
| 17. NotebookLM Cross-Notebook Search | v0.11 | 2/2 | Complete | 2026-04-13 |
| 18. Notion Database Import + Analytics Integration | v0.11 | 2/2 | Complete | 2026-04-13 |
| 18.1. Always-on TeamCreate execution | v0.11 | 1/1 | Complete | 2026-04-13 |
| 19. Project-Level Hooks & Wizard Bug Fixes | v0.12 | 0/? | Not started | - |
| 20. Budget Detection | v0.12 | 0/? | Not started | - |
| 21. Continuation Prompt & loop.md | v0.12 | 0/? | Not started | - |
| 22. Post-Reset Handoff | v0.12 | 0/? | Not started | - |

---

*Roadmap updated: 2026-04-13 — v0.12 Hooks & Limits milestone added. 4 phases (19–22), 9 requirements, 100% coverage.*
