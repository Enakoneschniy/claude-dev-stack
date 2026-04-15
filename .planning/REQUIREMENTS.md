# Milestone v0.12 Requirements — Hooks & Limits

**Goal**: Fix global hooks architecture (move to project-level), fix wizard UAT bugs, and integrate Claude Code's scheduling primitives for limit-aware execution.

**Phase numbering**: continues from v0.11 (last phase: 18.1) → starts at Phase 19
**Test baseline**: 558 (v0.11.0)
**Total requirements**: 12 v1 requirements (+ 15 DX/UX/WF/BUG-07 backfills + 1 ADR-02 backfill + 1 GSD-01 backfill + 1 SSR-01 backfill).

---

## v1 Requirements

### Bug Fixes (BUG)

- [ ] **BUG-01**: Wizard writes session hooks (SessionStart, Stop) to project-level `.claude/settings.json` instead of global `~/.claude/settings.json`. Hooks only run for projects configured via claude-dev-stack. Existing global hooks preserved for backward compat during migration.
- [ ] **BUG-02**: Wizard writes `allowedTools` (vault read/write patterns + safe bash commands like `git status`, `git branch -d`, `git remote prune`) to project-level `.claude/settings.json`. Permissions persist across sessions and are not overwritten by other tools.
- [ ] **BUG-03**: Re-install wizard (`collectProjects`) pre-selects projects already registered in vault's `project-map.json`. User sees existing projects checked by default and can add/remove.
- [ ] **BUG-04**: Re-install wizard (`selectComponents`) pre-selects components already installed (vault, skills, hooks detected via `detectInstallState`). Components show "(installed)" indicator.
- [ ] **BUG-05**: `installGitConventions()` checks for existing `git-scopes.json` per project and skips or offers "(already configured) — reconfigure?" instead of blindly re-initializing.
- [ ] **BUG-06**: GSD transition.md TeamCreate patch (Phase 18.1) survives `/gsd-update`. Package ships patched transition.md in `patches/`, install wizard copies it to `~/.claude/gsd-local-patches/`, and a SessionStart hook auto-reapplies if GSD overwrites it.

### Limit Management (LIMIT)

- [ ] **LIMIT-01**: Budget detection skill/hook monitors session usage (via `/context` or `/cost` output parsing, or `anthropic-ratelimit-unified-*` headers for API users) and emits a warning when usage exceeds configurable threshold (default 70%). Warning includes remaining budget estimate.
- [ ] **LIMIT-02**: When budget warning fires, user is presented with 4 continuation options: (1) "Remind me later" — one-shot CronCreate reminder, (2) "Auto-continue locally" — Desktop scheduled task with GSD resume command, (3) "Auto-continue in cloud" — Cloud scheduled task (fresh clone, autonomous), (4) "Continue now" — proceed and accept extra usage. Selection triggers the corresponding scheduling primitive.
- [ ] **LIMIT-03**: Install wizard offers a `loop.md` template that provides GSD-aware maintenance loop for scheduled/recurring tasks — continue unfinished phases, tend PRs, run cleanup. Template installed to project `.claude/` directory.
- [ ] **LIMIT-04**: When a scheduled task fires (local or cloud), it loads GSD state from `.planning/STATE.md`, reads `stopped_at` + `resume_file`, and continues execution from where it left off. Works with fresh git clone (cloud tasks) because all state is in git.

- [ ] **BUG-07**: `lib/install/claude-md.mjs` overwrites entire CLAUDE.md from template (`writeFileSync`) instead of using idempotent `updateProjectClaudeMd()` from `project-setup.mjs` which preserves user content outside markers. Must merge template with existing content, not replace.

### Smart Re-install (DX)

- [ ] **DX-07**: Re-install wizard pre-fills communication language and code language from vault profile. Shows "Language: ru (change? y/N)" instead of blank prompt.
- [ ] **DX-08**: Re-install wizard pre-fills projects directory from existing `project-map.json`. Shows "Projects directory: ~/Projects/ (change? y/N)" instead of re-asking.
- [ ] **DX-09**: Already-registered projects (in `project-map.json`) skip the "Project name for X" prompt entirely. Wizard only asks names for newly selected projects.
- [ ] **DX-10**: Use case selection pre-filled from previous install. Shows current value with change option instead of blank selector.
- [ ] **DX-11**: GSD install checks installed version against latest — skips `npx get-shit-done-cc@latest` if already up to date. Same for Obsidian Skills.
- [ ] **DX-12**: NotebookLM login checks `~/.notebooklm/storage_state.json` existence — skips browser OAuth if already authenticated. "First sync" text replaced with "Run sync now?" for re-installs.
- [ ] **DX-13**: Bulk prompts (loop.md per project, git-conventions per project) use "Install for all N projects? (Y/n)" or multiselect instead of N individual y/N prompts.

### Wizard UX Polish (UX)

- [ ] **UX-01**: Git sync step detects existing configured remote and shows "Git sync: configured (remote: origin → github.com/...)" instead of offering "(recommended)" sync setup.
- [ ] **UX-02**: loop.md installation uses "Install loop.md for all N projects? (Y/n)" bulk prompt instead of N separate per-project confirms.
- [ ] **UX-03**: git-conventions installation uses "Install git-conventions for all N projects? (Y/n)" bulk prompt instead of N separate per-project confirms.
- [ ] **UX-04**: Git sync step checks for existing remote (`git remote -v` in vault) — if remote exists, shows status instead of re-running init/push flow.
- [ ] **UX-05**: Wizard step counter is accurate — total step count matches actual steps shown (no "Step 15 of 14").
- [ ] **UX-06**: Detect banner project count matches vault step project count — both use same source (`project-map.json`), no "0 projects" vs "8 project(s)" discrepancy.
- [ ] **UX-07**: All wizard confirmation prompts use consistent select-style prompts instead of mixed confirm (y/N) and select styles.

### Decisions (ADR)

- [ ] **ADR-02**: Session-end hook scans session transcript (not just GSD discuss-phase) for architectural decisions — new dependencies, API changes, data model changes, significant refactors — and creates ADR files in `vault/projects/{project}/decisions/`. Includes duplicate detection (same topic → update, not duplicate), YAML frontmatter with source (session log path + commit SHA), and `claude-dev-stack decisions` CLI (list/show/search) for browsing.

  Success Criteria:
  1. Session-end hook scans session transcript for architectural decisions (new dependencies added, API endpoints changed, data model changes, significant refactors) and creates ADR files in `vault/projects/{project}/decisions/`.
  2. ADR bridge runs on session end in addition to GSD discuss-phase — decisions from any workflow (manual coding, bug fixes, hotfixes) are captured.
  3. Duplicate detection: if a decision about the same topic already exists, it updates the existing ADR instead of creating a duplicate.
  4. Each ADR includes: context (why), decision (what), consequences (tradeoffs), and source (session log link or commit hash).
  5. `claude-dev-stack decisions` CLI lists all decisions for current project with dates and status.

### GSD Workflow (GSD)

- [ ] **GSD-01**: Projects using claude-dev-stack + GSD can override GSD workflow behavior (e.g., `workflows/manager.md`, `workflows/transition.md`) via package-shipped patches that survive `/gsd-update`. Implementation: shipped `patches/*.md`, install wizard copies to `~/.claude/gsd-local-patches/`, SessionStart hook re-applies any patch whose SHA-256 differs from the upstream workflow file. Formalized scope; extended features (per-project `.planning/gsd-overrides/`, `gsd customize` CLI, diff-based patches, `workflow.auto_push`/`auto_pr`/`merge_strategy` config gates) are deferred to backlog.

  Success Criteria (formalization cut):
  1. Package-shipped `patches/*.md` files replace same-named files under `~/.claude/get-shit-done/workflows/` whenever SHAs differ.
  2. Install wizard copies shipped `patches/` to `~/.claude/gsd-local-patches/` (wizard-pinned, authoritative source).
  3. `gsd-auto-reapply-patches.sh` SessionStart hook resolves patches in order: `$PATCHES_DIR` → `~/.claude/gsd-local-patches/` → npm global → dev checkout.
  4. Hook exits 0 silently when GSD is not installed or no patches source resolves.
  5. Hook is idempotent — re-running on already-patched workflows produces no change and no output.
  6. Regression tests under `tests/` cover hook behavior (`gsd-auto-reapply-patches.test.mjs`) and wizard copy (`install-patches-copy.test.mjs`).
  7. Pattern documented in `vault/shared/patterns.md` so other GSD-using projects can adopt it.

### Session Start/Resume (SSR)

- [ ] **SSR-01**: SessionStart hook is the single source of vault context
  loading for configured projects. The `session-manager` skill does not
  auto-activate on greetings; its `/resume` path checks a
  `.claude/.session-loaded` marker (atomic, ISO 8601 UTC) and skips the
  redundant `cat` when the marker is < 60 min old. CLAUDE.md template
  instructs Claude not to re-read `context.md` on the first message.
  Install wizard adds the marker path to project `.gitignore` idempotently.

  Success Criteria:
  1. CLAUDE.md template "Knowledge Base" section instructs Claude NOT to re-read `context.md` / session logs on the first message.
  2. `session-manager` skill description omits greeting triggers ("привет", "hi", "начинаем") and first-message auto-activation.
  3. SessionStart hook writes `.claude/.session-loaded` marker atomically (ISO 8601 UTC timestamp) on every successful run.
  4. Install wizard adds `.claude/.session-loaded` to each configured project's `.gitignore` idempotently.
  5. `session-manager` `/resume` path checks marker mtime — if < 60 min, uses pre-loaded context; otherwise falls through to explicit `cat`.
  6. `.planning/REQUIREMENTS.md` contains this section and the `| SSR-01 | 28 | — | pending |` traceability row.

---

## Future Requirements

- Per-project budget thresholds (different limits for different projects)
- Web dashboard for monitoring scheduled tasks
- Managed Agents integration for long-running phases (when GA and stable)
- Budget prediction — estimate remaining phases vs remaining budget

## Out of Scope

- **Custom sandbox/server infrastructure** — Anthropic ships Managed Agents, Dispatch, /schedule; we integrate, not rebuild (SEED-001 decision)
- **Billing/subscription model** — deferred; focus on free integration of existing primitives
- **Two-way sync with external schedulers** — we use Claude Code's native scheduling only
- **Budget detection for non-Claude-Code environments** — only Claude Code supported

---

## Traceability

| REQ-ID | Phase | Plan | Status |
|--------|-------|------|--------|
| BUG-01 | 19 | — | pending |
| BUG-02 | 19 | — | pending |
| BUG-03 | 19 | — | pending |
| BUG-04 | 19 | — | pending |
| BUG-05 | 19 | — | pending |
| BUG-06 | 19 | — | pending |
| LIMIT-01 | 20 | — | pending |
| LIMIT-02 | 21 | — | pending |
| LIMIT-03 | 21 | — | pending |
| LIMIT-04 | 22 | — | pending |
| DX-07 | 23 | — | pending |
| DX-08 | 23 | — | pending |
| DX-09 | 23 | — | pending |
| DX-10 | 23 | — | pending |
| DX-11 | 23 | — | pending |
| DX-12 | 23 | — | pending |
| DX-13 | 23 | — | pending |
| UX-01 | 24 | — | pending |
| UX-02 | 24 | — | pending |
| UX-03 | 24 | — | pending |
| UX-04 | 24 | — | pending |
| UX-05 | 24 | — | pending |
| UX-06 | 24 | — | pending |
| UX-07 | 24 | — | pending |
| ADR-02 | 26 | — | pending |
| GSD-01 | 27 | 27-01..04 | pending |
| SSR-01 | 28 | 28-01..03 | pending |
