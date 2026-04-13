# Milestone v0.12 Requirements — Hooks & Limits

**Goal**: Fix global hooks architecture (move to project-level), fix wizard UAT bugs, and integrate Claude Code's scheduling primitives for limit-aware execution.

**Phase numbering**: continues from v0.11 (last phase: 18.1) → starts at Phase 19
**Test baseline**: 558 (v0.11.0)
**Total requirements**: 10 v1 requirements.

---

## v1 Requirements

### Bug Fixes (BUG)

- [x] **BUG-01**: Wizard writes session hooks (SessionStart, Stop) to project-level `.claude/settings.json` instead of global `~/.claude/settings.json`. Hooks only run for projects configured via claude-dev-stack. Existing global hooks preserved for backward compat during migration.
- [x] **BUG-02**: Wizard writes `allowedTools` (vault read/write patterns + safe bash commands: git status, git branch -d, git remote prune) to project-level `.claude/settings.json`. Permissions persist across sessions.
- [x] **BUG-03**: Re-install wizard (`collectProjects`) pre-selects projects already registered in vault's `project-map.json`. User sees existing projects checked by default and can add/remove.
- [x] **BUG-04**: Re-install wizard (`selectComponents`) pre-selects components already installed (vault, skills, hooks detected via `detectInstallState`). Components show "(installed)" indicator.
- [x] **BUG-05**: `installGitConventions()` checks for existing `git-scopes.json` per project and skips or offers "(already configured) — reconfigure?" instead of blindly re-initializing.
- [x] **BUG-06**: GSD transition.md TeamCreate patch (Phase 18.1) survives `/gsd-update`. Package ships patched `patches/transition.md` + `hooks/gsd-auto-reapply-patches.sh`. `session-start-context.sh` invokes auto-reapply on every SessionStart.

### Limit Management (LIMIT)

- [ ] **LIMIT-01**: Budget detection skill/hook monitors session usage (via `/context` or `/cost` output parsing, or `anthropic-ratelimit-unified-*` headers for API users) and emits a warning when usage exceeds configurable threshold (default 70%). Warning includes remaining budget estimate.
- [ ] **LIMIT-02**: When budget warning fires, user is presented with 4 continuation options: (1) "Remind me later" — one-shot CronCreate reminder, (2) "Auto-continue locally" — Desktop scheduled task with GSD resume command, (3) "Auto-continue in cloud" — Cloud scheduled task (fresh clone, autonomous), (4) "Continue now" — proceed and accept extra usage. Selection triggers the corresponding scheduling primitive.
- [ ] **LIMIT-03**: Install wizard offers a `loop.md` template that provides GSD-aware maintenance loop for scheduled/recurring tasks — continue unfinished phases, tend PRs, run cleanup. Template installed to project `.claude/` directory.
- [ ] **LIMIT-04**: When a scheduled task fires (local or cloud), it loads GSD state from `.planning/STATE.md`, reads `stopped_at` + `resume_file`, and continues execution from where it left off. Works with fresh git clone (cloud tasks) because all state is in git.

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
