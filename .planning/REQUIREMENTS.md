# Milestone v0.12 Requirements — Hooks & Limits

**Goal**: Fix global hooks architecture (move to project-level), fix wizard UAT bugs, and integrate Claude Code's scheduling primitives for limit-aware execution.

**Phase numbering**: continues from v0.11 (last phase: 18.1) → starts at Phase 19
**Test baseline**: 558 (v0.11.0)
**Total requirements**: 12 v1 requirements (+ 15 DX/UX/WF/BUG-07 backfills + 1 ADR-02 backfill + 1 GSD-01 backfill + 1 SSR-01 backfill + 4 CAPTURE backfills).

---

## v1 Requirements

### Bug Fixes (BUG)

- [x] **BUG-01**: Wizard writes session hooks (SessionStart, Stop) to project-level `.claude/settings.json` instead of global `~/.claude/settings.json`. Hooks only run for projects configured via claude-dev-stack. Existing global hooks preserved for backward compat during migration.
- [x] **BUG-02**: Wizard writes `allowedTools` (vault read/write patterns + safe bash commands like `git status`, `git branch -d`, `git remote prune`) to project-level `.claude/settings.json`. Permissions persist across sessions and are not overwritten by other tools.
- [x] **BUG-03**: Re-install wizard (`collectProjects`) pre-selects projects already registered in vault's `project-map.json`. User sees existing projects checked by default and can add/remove.
- [x] **BUG-04**: Re-install wizard (`selectComponents`) pre-selects components already installed (vault, skills, hooks detected via `detectInstallState`). Components show "(installed)" indicator.
- [x] **BUG-05**: `installGitConventions()` checks for existing `git-scopes.json` per project and skips or offers "(already configured) — reconfigure?" instead of blindly re-initializing.
- [x] **BUG-06**: GSD transition.md TeamCreate patch (Phase 18.1) survives `/gsd-update`. Package ships patched transition.md in `patches/`, install wizard copies it to `~/.claude/gsd-local-patches/`, and a SessionStart hook auto-reapplies if GSD overwrites it.

### Limit Management (LIMIT)

- [x] **LIMIT-01**: Budget detection skill/hook monitors session usage (via `/context` or `/cost` output parsing, or `anthropic-ratelimit-unified-*` headers for API users) and emits a warning when usage exceeds configurable threshold (default 70%). Warning includes remaining budget estimate.
- [x] **LIMIT-02**: When budget warning fires, user is presented with 4 continuation options: (1) "Remind me later" — one-shot CronCreate reminder, (2) "Auto-continue locally" — Desktop scheduled task with GSD resume command, (3) "Auto-continue in cloud" — Cloud scheduled task (fresh clone, autonomous), (4) "Continue now" — proceed and accept extra usage. Selection triggers the corresponding scheduling primitive.
- [x] **LIMIT-03**: Install wizard offers a `loop.md` template that provides GSD-aware maintenance loop for scheduled/recurring tasks — continue unfinished phases, tend PRs, run cleanup. Template installed to project `.claude/` directory.
- [x] **LIMIT-04**: When a scheduled task fires (local or cloud), it loads GSD state from `.planning/STATE.md`, reads `stopped_at` + `resume_file`, and continues execution from where it left off. Works with fresh git clone (cloud tasks) because all state is in git.

- [x] **BUG-07**: `lib/install/claude-md.mjs` overwrites entire CLAUDE.md from template (`writeFileSync`) instead of using idempotent `updateProjectClaudeMd()` from `project-setup.mjs` which preserves user content outside markers. Must merge template with existing content, not replace.

### Smart Re-install (DX)

- [x] **DX-07**: Re-install wizard pre-fills communication language and code language from vault profile. Shows "Language: ru (change? y/N)" instead of blank prompt.
- [x] **DX-08**: Re-install wizard pre-fills projects directory from existing `project-map.json`. Shows "Projects directory: ~/Projects/ (change? y/N)" instead of re-asking.
- [x] **DX-09**: Already-registered projects (in `project-map.json`) skip the "Project name for X" prompt entirely. Wizard only asks names for newly selected projects.
- [x] **DX-10**: Use case selection pre-filled from previous install. Shows current value with change option instead of blank selector.
- [x] **DX-11**: GSD install checks installed version against latest — skips `npx get-shit-done-cc@latest` if already up to date. Same for Obsidian Skills.
- [x] **DX-12**: NotebookLM login checks `~/.notebooklm/storage_state.json` existence — skips browser OAuth if already authenticated. "First sync" text replaced with "Run sync now?" for re-installs.
- [x] **DX-13**: Bulk prompts (loop.md per project, git-conventions per project) use "Install for all N projects? (Y/n)" or multiselect instead of N individual y/N prompts.

### Wizard UX Polish (UX)

- [x] **UX-01**: Git sync step detects existing configured remote and shows "Git sync: configured (remote: origin → github.com/...)" instead of offering "(recommended)" sync setup.
- [x] **UX-02**: loop.md installation uses "Install loop.md for all N projects? (Y/n)" bulk prompt instead of N separate per-project confirms.
- [x] **UX-03**: git-conventions installation uses "Install git-conventions for all N projects? (Y/n)" bulk prompt instead of N separate per-project confirms.
- [x] **UX-04**: Git sync step checks for existing remote (`git remote -v` in vault) — if remote exists, shows status instead of re-running init/push flow.
- [x] **UX-05**: Wizard step counter is accurate — total step count matches actual steps shown (no "Step 15 of 14").
- [x] **UX-06**: Detect banner project count matches vault step project count — both use same source (`project-map.json`), no "0 projects" vs "8 project(s)" discrepancy.
- [x] **UX-07**: All wizard confirmation prompts use consistent select-style prompts instead of mixed confirm (y/N) and select styles.

### Decisions (ADR)

- [ ] **ADR-02**: Session-end hook scans session transcript (not just GSD discuss-phase) for architectural decisions — new dependencies, API changes, data model changes, significant refactors — and creates ADR files in `vault/projects/{project}/decisions/`. Includes duplicate detection (same topic → update, not duplicate), YAML frontmatter with source (session log path + commit SHA), and `claude-dev-stack decisions` CLI (list/show/search) for browsing.

  Success Criteria:
  1. Session-end hook scans session transcript for architectural decisions (new dependencies added, API endpoints changed, data model changes, significant refactors) and creates ADR files in `vault/projects/{project}/decisions/`.
  2. ADR bridge runs on session end in addition to GSD discuss-phase — decisions from any workflow (manual coding, bug fixes, hotfixes) are captured.
  3. Duplicate detection: if a decision about the same topic already exists, it updates the existing ADR instead of creating a duplicate.
  4. Each ADR includes: context (why), decision (what), consequences (tradeoffs), and source (session log link or commit hash).
  5. `claude-dev-stack decisions` CLI lists all decisions for current project with dates and status.

### GSD Workflow (GSD)

- [x] **GSD-01**: Projects using claude-dev-stack + GSD can override GSD workflow behavior (e.g., `workflows/manager.md`, `workflows/transition.md`) via package-shipped patches that survive `/gsd-update`. Implementation: shipped `patches/*.md`, install wizard copies to `~/.claude/gsd-local-patches/`, SessionStart hook re-applies any patch whose SHA-256 differs from the upstream workflow file. Formalized scope; extended features (per-project `.planning/gsd-overrides/`, `gsd customize` CLI, diff-based patches, `workflow.auto_push`/`auto_pr`/`merge_strategy` config gates) are deferred to backlog.

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

### Skills→Hooks (SKL)

- [x] **SKL-01**: `dev-router` skill replaced by `hooks/dev-router.mjs` UserPromptSubmit hook. Hook reads prompt from stdin JSON, regex-matches dev/research/session/end keywords, emits a routing hint as `additionalContext` (≤200 chars). Fail-silent on empty stdin / malformed JSON. Skill file removed from `skills/` and from `lib/install/skills.mjs` skillNames; deprecated install at `~/.claude/skills/dev-router/` cleaned up by wizard re-run.
- [x] **SKL-02**: `session-manager` skill start-path (auto-load context.md + last sessions on first message) fully migrated to SessionStart hook (`hooks/session-start-context.sh`, owned by Phase 28). Phase 31 removes the `### /resume or /start` section and `## Automatic Behavior` block from the skill body. Skill retains `/end` (session log + ADR), `/handoff`, `/status`, `## ADR Creation`, `## Best Practices`. New note line at top of skill body directs readers to the hook.
- [x] **SKL-03**: `project-switcher` skill replaced by `hooks/project-switcher.mjs` UserPromptSubmit hook. Hook parses project names from `vault/project-map.json` (NOT project-registry.md — JSON is reliable), uses word-boundary regex to match prompt against known projects, emits switch hint only when matched project differs from current cwd's project. Fail-silent when registry absent. Skill file removed from `skills/` and skillNames; deprecated install cleaned up by wizard.
- [x] **SKL-04**: `git-conventions` enforcement migrated to `hooks/git-conventions-check.mjs` PreToolUse hook with `matcher: "Bash"` and per-hook `if: "Bash(git commit*)"` scope-narrowing. Hook validates the `-m "..."` message against conventional commits regex `/^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\(.+\))?!?:\s.+/`. Default mode: warn-only (exit 0 with stdout suggestion). Strict mode (exit 2 blocking) opt-in via `.planning/config.json` → `workflow.commit_validation: "strict"`. Coexists with GSD's `gsd-validate-commit.sh` (per research finding #3 — GSD is opt-in via community flag).

### Capture Automation (CAPTURE)

- [x] **CAPTURE-01**: Hook installation wired into install wizard at project-level `.claude/settings.json` (NOT global `~/.claude/settings.json`). Wizard copies `hooks/idea-capture-trigger.mjs` + `hooks/idea-capture-triggers.json` into `~/.claude/hooks/` and registers the hook as a UserPromptSubmit entry in each configured project's `.claude/settings.json`. Idempotent — re-running the wizard on an already-configured project does NOT duplicate the entry. Per D-18 in vault cds-core-independence-plan.md.
- [x] **CAPTURE-02**: Trigger regex matches Russian + English phrases from `hooks/idea-capture-triggers.json`, case-insensitive, word-boundary-aware. Russian uses explicit boundary class `(?:^|[\s.,!?;:()"'«»—-])` (JS `\b` is ASCII-only). English uses standard `\b`. False-positive guard: "идеальный" does NOT match trigger "идея"; "идентификатор" does NOT match any trigger. Hook truncates prompts to 4096 chars before regex testing (ReDoS guard). Per D-19.
- [x] **CAPTURE-03**: On match, hook emits exactly this hint to stdout: `💡 IDEA-CAPTURE HINT: Detected trigger phrase "{phrase}" in user message. Consider invoking /gsd-note to capture the idea to .planning/notes/.` — where `{phrase}` is the literal trigger string from the JSON config (not the user's possibly-capitalized match). Output goes to stdout per Claude Code UserPromptSubmit hook protocol (plain-stdout form, matching dev-router.mjs / project-switcher.mjs pattern). Per D-20 / D-21.
- [x] **CAPTURE-04** (OPTIONAL): Telemetry counter `idea_capture_hints_fired` in `~/.claude/cds-stats.json` increments each time the hook fires. Counter initialized if file absent; fail-silent on any filesystem error (EPERM, ENOSPC, corrupt JSON). User opt-out = delete the stats file. Informs v1.0 escalation decision per D-19/D-20.

  Success Criteria (for all four):
  1. `hooks/idea-capture-trigger.mjs` exists, passes `node --check`, has `#!/usr/bin/env node` shebang, exits 0 on empty/malformed stdin, emits no output when no trigger matches.
  2. `hooks/idea-capture-triggers.json` exists, parses as `{ russian: string[], english: string[] }` with the full 9 Russian + 7 English phrase list per D-19.
  3. Matching user prompt produces exactly one line of stdout matching the CAPTURE-03 format; first-match-wins when multiple triggers present.
  4. Telemetry counter increments on match, is unchanged on no-match, never crashes the hook on filesystem errors.
  5. `lib/install/hooks.mjs` copies the .mjs and .json into `~/.claude/hooks/` and registers the hook in each project's `.claude/settings.json` UserPromptSubmit list idempotently.
  6. Full `npm test` suite passes with 0 regressions.

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
| BUG-01 | 19 | — | complete |
| BUG-02 | 19 | — | complete |
| BUG-03 | 19 | — | complete |
| BUG-04 | 19 | — | complete |
| BUG-05 | 19 | — | complete |
| BUG-06 | 19 | — | complete |
| BUG-07 | 30 | — | complete |
| LIMIT-01 | 20 | — | complete |
| LIMIT-02 | 21 | — | complete |
| LIMIT-03 | 21 | — | complete |
| LIMIT-04 | 22 | — | complete |
| LIMIT-05 | 25 | — | complete |
| DX-07 | 23 | — | complete |
| DX-08 | 23 | — | complete |
| DX-09 | 23 | — | complete |
| DX-10 | 23 | — | complete |
| DX-11 | 23 | — | complete |
| DX-12 | 23 | — | complete |
| DX-13 | 23 | — | complete |
| UX-01 | 24 | — | complete |
| UX-02 | 24 | — | complete |
| UX-03 | 24 | — | complete |
| UX-04 | 24 | — | complete |
| UX-05 | 24 | — | complete |
| UX-06 | 24 | — | complete |
| UX-07 | 24 | — | complete |
| ADR-02 | 26 | — | pending |
| GSD-01 | 27 | 27-01..04 | complete |
| WF-01 | 29 | 29-01, 29-02 | complete |
| SSR-01 | 28 | 28-01..03 | pending |
| SKL-01 | 31 | 31-01, 31-02 | complete |
| SKL-02 | 31 | 31-03 | complete |
| SKL-03 | 31 | 31-01, 31-02 | complete |
| SKL-04 | 31 | 31-01, 31-02 | complete |
| CAPTURE-01 | 32 | 32-02 | complete |
| CAPTURE-02 | 32 | 32-01 | complete |
| CAPTURE-03 | 32 | 32-01 | complete |
| CAPTURE-04 | 32 | 32-01 | complete |
