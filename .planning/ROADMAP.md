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

- [x] **Phase 19: Project-Level Hooks & Wizard Bug Fixes** — Move hooks to project-level settings, add allowedTools, fix all 3 wizard pre-select bugs, git-conventions skip, and GSD patch persistence (BUG-01..06) (completed 2026-04-14)
- [x] **Phase 20: Budget Detection** — OAuth usage API, SessionStart display, UserPromptSubmit hook (LIMIT-01) (completed 2026-04-14)
- [ ] **Phase 21: Continuation Prompt & loop.md** — 4-option continuation prompt when budget low + loop.md template for scheduled tasks (LIMIT-02, LIMIT-03)
- [ ] **Phase 22: Post-Reset Handoff** — Load STATE.md on scheduled task fire and continue from stopped_at (LIMIT-04)
- [x] **Phase 23: Smart Re-install Pre-fill** — Wizard re-install pre-fills all steps with existing config (DX-07..DX-13) (completed 2026-04-13)
- [x] **Phase 24: Wizard UX Polish** — Fix step counter, project count, bulk prompts, git sync detection, consistent prompt style (UX-01..UX-07) (completed 2026-04-15)
- [ ] **Phase 25: Budget-Aware Execution Gate** — Pre-check plan usage before GSD operations, statusline integration, schedule-for-later via CronCreate (LIMIT-05)
- [ ] **Phase 26: Auto-ADR Capture** — Automatically create vault decisions from session activity, not just GSD discuss-phase (ADR-02)
- [ ] **Phase 27: GSD Workflow Customization via Patches** — Per-project GSD overrides for branching, push/PR behavior, agent prompts; survives /gsd-update (GSD-01)
- [ ] **Phase 29: GSD Workflow Enforcer Hook** — PostToolUse hook enforces discuss+plan+manager batching; prevents per-phase execute suggestion when multiple phases pending (WF-01)
- [x] **Phase 30: CLAUDE.md Idempotent Merge** — Wizard preserves user content in CLAUDE.md; claude-dev-stack section lives between markers, re-install updates only that section (BUG-07) (completed 2026-04-14)

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
**Plans**: 1 plan
Plans:
- [x] 19-01-PLAN.md — BUG-06 D-07 (wizard copy + hook precedence) + BUG-01/02 audit

---

### Phase 20: Budget Detection ✅
**Goal**: Track real Anthropic plan usage (5h/7d/extra) via OAuth API and display at session start.
**Depends on**: Nothing
**Requirements**: LIMIT-01
**Status**: Completed 2026-04-14 (implemented during Phase 23 session)
**What was built**:
  - OAuth usage API integration (`api.anthropic.com/api/oauth/usage`) with Keychain token
  - SessionStart hook shows plan usage: `⚠ Budget: 5h: 17% | 7d: 71% | extra: 75% | resets: 04:00`
  - UserPromptSubmit hook fires warning when threshold crossed (agent-visible)
  - API response cached 60s, threshold configurable via `~/.claude/budget-config.json`
  - CLI: `claude-dev-stack budget` / `budget set` / `budget reset`
**Plans**: Inline (no formal plan files — hotfix during Phase 23)

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
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [ ] 21-01-PLAN.md — Budget hook hint line + test assertions (LIMIT-02 hook side)
- [ ] 21-02-PLAN.md — SKILL.md rewrite for direct tool invocation + LIMIT-03 UAT verification

---

### Phase 22: Post-Reset Handoff
**Goal**: Scheduled tasks (local or cloud) pick up exactly where the previous session stopped — no manual state lookup, no re-orientation needed.
**Depends on**: Phase 21 (scheduling primitives must be in place before handoff logic is meaningful)
**Requirements**: LIMIT-04
**Success Criteria** (what must be TRUE):
  1. When a scheduled task fires, it reads `.planning/STATE.md`, extracts `stopped_at` and `resume_file`, and begins execution from that point — no manual step required.
  2. Handoff works after a fresh git clone — all state is committed to git and the scheduled task operates on a clean checkout without needing previous session artifacts.
  3. If `stopped_at` is missing or STATE.md is absent, the task surfaces a clear error instead of silently executing from the wrong position.
**Plans**: 2 plans

Plans:
- [ ] 22-01-PLAN.md — Zero-dep handoff-check.mjs script + wizard copy (D-01/D-02)
- [ ] 22-02-PLAN.md — loop.md rewrite + patches/gsd-resume-work.md + session-manager /end extension (D-03..D-07)

---

### Phase 25: Budget-Aware Execution Gate
**Goal**: GSD workflows check plan usage BEFORE starting expensive operations and offer to schedule for later if budget is tight. Statusline shows plan usage in footer.
**Depends on**: Phase 20 (OAuth usage API must be available)
**Requirements**: LIMIT-05
**Success Criteria** (what must be TRUE):
  1. Before `/gsd-execute-phase`, `/gsd-plan-phase`, or any GSD subagent spawn, system queries plan usage API and estimates if the operation will fit within remaining budget.
  2. If budget is tight (e.g., 5h utilization > 80%), user sees: "5h limit at 82%, phase execution needs ~12%. Options: Execute now / Schedule after reset (2h) / Cancel"
  3. Selecting "Schedule after reset" creates a CronCreate/RemoteTrigger task timed for the 5h reset window, with full GSD context (phase, plan, branch).
  4. Claude Code statusline footer shows real-time plan usage (e.g., `5h:17% 7d:71%`) alongside existing context % display.
  5. Statusline updates from cached API data (60s TTL), no extra API calls beyond what budget-check already makes.
**Plans**: 4 plans

Plans:
- [ ] 25-01-PLAN.md — PreToolUse budget-gate + PostToolUse budget-history hooks + wizard install (LIMIT-05 SC#1, SC#2)
- [ ] 25-02-PLAN.md — cds-statusline.js full replacement + global statusLine registration (LIMIT-05 SC#4, SC#5)
- [ ] 25-03-PLAN.md — Backfill LIMIT-05 into REQUIREMENTS.md + Traceability table (D-11)
- [ ] 25-04-PLAN.md — budget-gate-schedule skill + buildCronArgs helper + wizard registration (LIMIT-05 SC#3)

---

### Phase 26: Auto-ADR Capture
**Goal**: Architectural decisions are captured in vault automatically — not only from GSD discuss-phase, but from any session where significant decisions are made (new dependencies, API changes, architecture shifts).
**Depends on**: Nothing
**Requirements**: ADR-02
**Success Criteria** (what must be TRUE):
  1. Session-end hook scans session transcript for architectural decisions (new dependencies added, API endpoints changed, data model changes, significant refactors) and creates ADR files in `vault/projects/{project}/decisions/`.
  2. ADR bridge runs on session end in addition to GSD discuss-phase — decisions from any workflow (manual coding, bug fixes, hotfixes) are captured.
  3. Duplicate detection: if a decision about the same topic already exists, it updates the existing ADR instead of creating a duplicate.
  4. Each ADR includes: context (why), decision (what), consequences (tradeoffs), and source (session log link or commit hash).
  5. `claude-dev-stack decisions` CLI lists all decisions for current project with dates and status.
**Plans**: 4 plans

Plans:
- [ ] 26-01-PLAN.md — lib/adr-bridge-session.mjs core (Haiku subprocess + topic match + write/supersede) + tests (D-01..D-03, D-07..D-11)
- [ ] 26-02-PLAN.md — claude-dev-stack decisions CLI (list/show/search) + bin/cli.mjs wire + tests (D-12, D-13)
- [ ] 26-03-PLAN.md — session-manager SKILL.md /end integration (bash block + human verification) (D-04, D-05, D-06)
- [ ] 26-04-PLAN.md — Backfill ADR-02 into REQUIREMENTS.md + Traceability row (D-14)

---

### Phase 27: GSD Workflow Customization via Patches
**Goal**: Projects can override GSD workflow behavior (branching, push/PR, agent prompts) via local patch files that survive `/gsd-update`. Eliminates pain points: unwanted auto-push, PR spam, merge conflicts from rigid default workflows.
**Depends on**: Nothing
**Requirements**: GSD-01
**Success Criteria** (what must be TRUE):
  1. `.planning/gsd-overrides/` directory in a project can contain partial or full workflow file replacements (e.g., `execute-phase.md`, `transition.md`) that override `~/.claude/get-shit-done/workflows/`.
  2. GSD tools resolve workflows with override priority: project `.planning/gsd-overrides/` > package `patches/` > installed `~/.claude/get-shit-done/`.
  3. Per-project config in `.planning/config.json` supports: `workflow.auto_push: false` (no auto push), `workflow.auto_pr: false` (no auto PR creation), `workflow.merge_strategy: "rebase"|"merge"|"squash"`.
  4. `gsd-tools init` reads project overrides and passes resolved workflow paths to agents — agents use overridden prompts without knowing about the override mechanism.
  5. `/gsd-update` preserves `.planning/gsd-overrides/` — it only updates `~/.claude/get-shit-done/` (global install), project-level overrides are untouched.
  6. `claude-dev-stack gsd customize` CLI scaffolds `.planning/gsd-overrides/` with commented templates showing what can be overridden.
  7. Patch script supports diff-based patches (not just full file replacement) — user can patch a single section of a workflow without maintaining the entire file.
**Plans**: 4 plans

Plans:
- [ ] 27-01-PLAN.md — Extend gsd-auto-reapply-patches.sh into three-tier resolver with diff apply + baseline backup (D-01..D-06, D-09..D-11)
- [ ] 27-02-PLAN.md — patches/ship.md.patch config-aware gates + wizard writes workflow.auto_push/auto_pr/merge_strategy directly to config.json (D-07/D-08)
- [ ] 27-03-PLAN.md — lib/gsd-customize-cli.mjs with customize/list-overrides/remove subcommands (D-12..D-14)
- [ ] 27-04-PLAN.md — GSD-01 backfill into REQUIREMENTS.md + Traceability row (D-15)

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

| UX-01 | 24 | Wizard UX Polish |
| UX-02 | 24 | Wizard UX Polish |
| UX-03 | 24 | Wizard UX Polish |
| UX-04 | 24 | Wizard UX Polish |
| UX-05 | 24 | Wizard UX Polish |
| UX-06 | 24 | Wizard UX Polish |
| UX-07 | 24 | Wizard UX Polish |
| DX-07 | 23 | Smart Re-install Pre-fill |
| DX-08 | 23 | Smart Re-install Pre-fill |
| DX-09 | 23 | Smart Re-install Pre-fill |
| DX-10 | 23 | Smart Re-install Pre-fill |
| DX-11 | 23 | Smart Re-install Pre-fill |
| DX-12 | 23 | Smart Re-install Pre-fill |
| DX-13 | 23 | Smart Re-install Pre-fill |
| SSR-01 | 28 | Silent SessionStart + skill activation only on end/resume triggers |

**Coverage check**: 25/25 requirements mapped (100%), 0 orphaned.

- Phase 19: 6 requirements (BUG-01..BUG-06)
- Phase 20: 1 requirement (LIMIT-01)
- Phase 21: 2 requirements (LIMIT-02, LIMIT-03)
- Phase 22: 1 requirement (LIMIT-04)
- Phase 23: 7 requirements (DX-07..DX-13)
- Phase 24: 7 requirements (UX-01..UX-07)
- Phase 28: 1 requirement (SSR-01)
- BUG-07: Phase 19 (added post-UAT)

Total: 6 + 1 + 2 + 1 + 7 + 7 + 1 = 25 ✓

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
| 19. Project-Level Hooks & Wizard Bug Fixes | v0.12 | 1/1 | Complete   | 2026-04-14 |
| 20. Budget Detection | v0.12 | 0/? | Not started | - |
| 21. Continuation Prompt & loop.md | v0.12 | 0/? | Not started | - |
| 22. Post-Reset Handoff | v0.12 | 0/? | Not started | - |
| 23. Smart Re-install Pre-fill | v0.12 | 2/2 | Complete   | 2026-04-13 |
| 24. Wizard UX Polish | v0.12 | 2/2 | Complete   | 2026-04-15 |
| 28. Silent Session Start | v0.12 | 0/3 | Planned | - |

### Phase 23: Smart Re-install Pre-fill
**Goal**: Wizard re-install skips or pre-fills all steps that have existing configuration — no redundant prompts for already-configured values.
**Depends on**: Phase 19 (hooks architecture must be in place)
**Requirements**: DX-07, DX-08, DX-09, DX-10, DX-11, DX-12, DX-13
**Success Criteria** (what must be TRUE):
  1. User re-running wizard sees pre-filled language (e.g., "Language: ru (change? y/N)") — no blank prompt.
  2. User re-running wizard sees pre-filled projects directory — no re-entry of known path.
  3. Already-registered project names are skipped entirely — wizard only asks names for NEW projects.
  4. Use case pre-filled from previous selection — skip or show current with change option.
  5. GSD install checks version — if already latest, shows "GSD: up to date (v1.34.2)" and skips.
  6. NotebookLM login checks `storage_state.json` — if valid, shows "NotebookLM: authenticated" and skips browser login.
  7. Bulk prompts (loop.md, git-conventions) use "Install for all? (Y/n)" or multiselect instead of per-project y/N.
**Plans**: 2 plans
Plans:
- [x] 23-01-PLAN.md — Profile persistence + pre-fill for language, projects, use case (DX-07..DX-10)
- [x] 23-02-PLAN.md — GSD version check, NotebookLM auth, bulk prompts (DX-11..DX-13)

---

### Phase 24: Wizard UX Polish
**Goal**: Fix all UX inconsistencies found during manual UAT — step counter accuracy, project count discrepancy, bulk prompts for per-project operations, git sync remote detection, and consistent prompt style throughout wizard.
**Depends on**: Phase 23 (smart re-install pre-fill must be in place — UX-02/03 overlap with DX-13 bulk prompts)
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07
**Success Criteria** (what must be TRUE):
  1. Git sync step detects existing remote and shows status instead of offering re-setup.
  2. loop.md and git-conventions use bulk "Install for all?" prompt instead of per-project confirms.
  3. Git sync checks for existing remote before offering init/push flow.
  4. Step counter shows correct total (no "Step 15 of 14").
  5. Detect banner and vault step show consistent project counts from same data source.
  6. All confirmation prompts use consistent select-style (no mixed y/N and select).
**Plans**: 2 plans

Plans:
- [x] 24-01-PLAN.md — Git sync detection + dynamic step counter + unified project count + confirm-to-select sweep (UX-01, UX-04, UX-05, UX-06, UX-07)
- [x] 24-02-PLAN.md — UAT scaffold + full wizard verification for UX-02, UX-03 and regression coverage of UX-01/04/05/06/07

### Phase 28: Silent Session Start — move vault context loading to SessionStart hook, eliminate permission prompts and skill invocation

**Goal:** Starting a new Claude Code session on a claude-dev-stack project loads vault context silently via the SessionStart hook. Claude does NOT re-read `context.md` or session logs on the first user message. The `session-manager` skill activates only on explicit end/resume triggers — never on greetings. A marker file (`.claude/.session-loaded`) signals to the skill's `/resume` path whether to skip or perform an explicit load.
**Requirements**: SSR-01
**Depends on:** Phase 27 (roadmap-declared ordering; no hard code dependency — Phase 28 only touches CLAUDE.md template, session-manager skill, SessionStart hook, install wizard). Recommended sequencing: ship after Phase 30 (CLAUDE.md idempotent merge) for best user-content preservation, but not blocking — partial-merge fallback in existing `generateClaudeMD()` handles common cases.
**Success Criteria** (what must be TRUE):
  1. CLAUDE.md template "Knowledge Base" section instructs Claude NOT to re-read `context.md`/session logs on first message.
  2. session-manager skill description omits greeting triggers ("привет", "hi", "начинаем") and "first message" auto-activation.
  3. SessionStart hook writes `.claude/.session-loaded` marker atomically (ISO 8601 UTC timestamp) every successful run.
  4. Install wizard adds `.claude/.session-loaded` to each configured project's `.gitignore` idempotently.
  5. session-manager `/resume` path checks marker mtime — if < 60 min, uses pre-loaded context; otherwise falls through to explicit `cat`.
  6. `.planning/REQUIREMENTS.md` contains new `### Session Start/Resume (SSR)` section + `| SSR-01 | 28 | — | pending |` Traceability row.
**Plans**: 3 plans

Plans:
- [ ] 28-01-PLAN.md — CLAUDE.md template rewrite + session-manager SKILL.md description/body/resume changes (D-01..D-04, D-06)
- [ ] 28-02-PLAN.md — SessionStart hook marker writer + install wizard .gitignore helper (D-05, D-07)
- [ ] 28-03-PLAN.md — SSR-01 backfill into REQUIREMENTS.md (D-08)

### Phase 29: GSD Workflow Enforcer Hook
**Goal**: After `/gsd-plan-phase` completes, a hook automatically surfaces next-step guidance that prevents Claude from suggesting `/gsd-execute-phase` when more pending phases remain — enforcing the discuss+plan+manager batching design by default.
**Depends on**: Nothing (hook can be added anytime)
**Requirements**: WF-01
**Success Criteria** (what must be TRUE):
  1. Hook fires after `/gsd-plan-phase N` completes (PostToolUse on Skill tool).
  2. Hook reads `.planning/ROADMAP.md` / `.planning/STATE.md` to count remaining pending phases.
  3. If 2+ pending phases remain: hook outputs `NEXT: /gsd-discuss-phase M — do NOT run /gsd-execute-phase; use /gsd-manager only after all pending phases are planned` to session context.
  4. If 0–1 pending phase: hook stays silent (normal `/gsd-execute-phase` or completion flow unaffected).
  5. Hook fails silently (exit 0, no output) when `.planning/ROADMAP.md` is absent — does not break non-GSD projects.
  6. Wizard installs this hook into project `.claude/settings.json` (PostToolUse) alongside existing session hooks (BUG-01 compliant).
**Plans**: 2 plans

Plans:
- [ ] 29-01-PLAN.md — hooks/gsd-workflow-enforcer.mjs + tests (hook behavior, WF-01 SC#1..SC#5)
- [ ] 29-02-PLAN.md — lib/install/hooks.mjs extension + wizard wiring + install tests (WF-01 SC#6)

### Phase 30: CLAUDE.md Idempotent Merge
**Goal**: User-written CLAUDE.md content is preserved across wizard runs. Claude-dev-stack instructions live in a clearly delimited section between markers; re-install only updates the managed section, never touches user content.
**Depends on**: Nothing (hot-fixable at any time)
**Requirements**: BUG-07
**Success Criteria** (what must be TRUE):
  1. Running wizard on a project with existing user-written CLAUDE.md does NOT overwrite or delete user content outside the markers.
  2. Our section is wrapped in `<!-- @claude-dev-stack:start -->` ... `<!-- @claude-dev-stack:end -->` markers (reusing the mechanism already in `lib/project-setup.mjs`).
  3. `generateClaudeMD()` in `lib/install/claude-md.mjs` delegates to `updateProjectClaudeMd()` (or equivalent) instead of `writeFileSync` overwrite.
  4. On first install (no CLAUDE.md exists): file created with markers and our instructions between them.
  5. On re-install where markers exist: only the content between markers is replaced.
  6. On re-install where CLAUDE.md exists but markers are absent: our section is appended to the end — existing content left untouched.
  7. User running the wizard sees a status line distinguishing the three paths: `CLAUDE.md: created | updated | appended` (not "overwritten").
**Plans**: TBD

### Phase 31: Skills to Hooks Migration — replace deterministic skills (dev-router, session-manager start, project-switcher detection, git-conventions) with Claude Code hooks for silent UX and token savings. Scope: (1) dev-router → UserPromptSubmit regex hook with additionalContext; (2) session-manager context loading → fully in SessionStart hook (skill remains only for /end logging); (3) project-switcher detection → UserPromptSubmit regex against vault/meta/project-registry.md; (4) git-conventions → PreToolUse on Bash(git commit*) with conventional commits validation. Out of scope: gsd-* skills (third-party), research-*, notebooklm, obsidian — require LLM. Deliverable: candidate skills deactivated/removed, corresponding hooks added to ~/.claude/settings.json, documented in vault/shared/patterns.md.

**Goal:** Replace 4 deterministic skills (dev-router, session-manager start-path, project-switcher, git-conventions) with Claude Code hooks for silent UX and token savings. After this phase, prompt routing happens via UserPromptSubmit regex hooks (no skill activation cost), session context loads silently at SessionStart, project-switching is hinted by regex against vault/project-map.json, and conventional commits are enforced (warn-only by default) via PreToolUse Bash(git commit*) hook.
**Requirements**: SKL-01, SKL-02, SKL-03, SKL-04 (backfilled into REQUIREMENTS.md by Plan 04)
**Depends on:** Phase 28 (SessionStart marker + greeting trigger removal — required before deleting session-manager start-path body) + Phase 30 (CLAUDE.md idempotent merge — recommended so hook-written updates do not clobber user content)
**Plans:** 4 plans

Plans:
- [ ] 31-01-PLAN.md — TDD: 3 new hook scripts (dev-router.mjs, project-switcher.mjs, git-conventions-check.mjs) + tests (SKL-01/03/04)
- [ ] 31-02-PLAN.md — lib/install/hooks.mjs registration (UserPromptSubmit + PreToolUse Bash) + lib/install/skills.mjs cleanup + delete deprecated skill files (SKL-01/03/04)
- [ ] 31-03-PLAN.md — session-manager SKILL.md trim (D-04/D-05/D-06) + vault/shared/patterns.md Skills-vs-Hooks doc (SKL-02 / D-18)
- [ ] 31-04-PLAN.md — Backfill SKL-01..04 into REQUIREMENTS.md + Traceability rows (D-20)

---

*Roadmap updated: 2026-04-14 — Phase 28 (Silent Session Start) planned: 3 plans, requirement SSR-01 added, coverage table updated to 25/25.*
