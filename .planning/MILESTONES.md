# Milestones

## v0.12 Hooks & Limits (Shipped: 2026-04-16)

**Phases completed:** 13 phases (19–32 incl. decimal 18.1, minus deleted Phase 28 reverted), 32 plans.
**Release:** published to npm as `claude-dev-stack@0.12.0` (PR #37, commit `b12d89e`) + hotfix `@0.12.1` (PR #41, commit `9d34682`).
**Tests:** 912 passing (baseline 558 → +354).

**Key accomplishments:**

- **Project-level hooks architecture** — all session hooks moved from global `~/.claude/settings.json` to per-project `.claude/settings.json`. Hooks only run for claude-dev-stack-configured projects; existing global hooks preserved for backward compat (Phase 19, BUG-01..06).
- **OAuth budget detection** — real `api.anthropic.com/api/oauth/usage` integration with Keychain token, SessionStart display (`5h: 17% | 7d: 71%`), UserPromptSubmit threshold warnings, statusline footer integration (Phase 20 + 25, LIMIT-01/05).
- **Limit-aware execution primitives** — 4-option continuation prompt (remind / local / cloud / continue-now), `loop.md` GSD-aware template, post-reset handoff via `STATE.md stopped_at` + `resume_file` (Phases 21/22, LIMIT-02/03/04).
- **Smart re-install wizard** — pre-fills language, projects dir, use case, GSD/NotebookLM version checks, bulk prompts for loop.md/git-conventions (Phase 23, DX-07..13; Phase 24, UX-01..07).
- **Skills → Hooks migration** — `dev-router`, `project-switcher`, `git-conventions` converted from LLM-invoked skills to deterministic UserPromptSubmit/PreToolUse hooks. `session-manager` start-path fully migrated to SessionStart hook. Token-free silent UX (Phase 31, SKL-01..04).
- **GSD workflow customization** — SHA-diff patch re-apply via SessionStart hook + wizard-pinned `~/.claude/gsd-local-patches/` survives `/gsd-update` (Phase 27, GSD-01). GSD workflow enforcer hook prevents per-phase execute when 2+ phases pending (Phase 29, WF-01).
- **CLAUDE.md idempotent merge** — wizard delegates to `updateProjectClaudeMd()` with `<!-- @claude-dev-stack:start/end -->` markers, preserves user content (Phase 30, BUG-07).
- **Capture-automation hotfix (v0.12.1)** — UserPromptSubmit hook detects 9 RU + 7 EN idea-trigger phrases, emits `💡 IDEA-CAPTURE HINT`, ReDoS-safe, telemetry counter in `cds-stats.json` (Phase 32, CAPTURE-01..04).
- **Auto-ADR capture (code shipped, UAT pending)** — session-end hook scans transcript via Haiku subprocess, writes decisions to `vault/projects/{project}/decisions/` with duplicate detection + supersede logic + `claude-dev-stack decisions` CLI (Phase 26, ADR-02).

**Known Gaps (carried into v0.13):**

- **ADR-02 UAT deferred** — code complete on `gsd/phase-26-auto-adr-capture` merged, but human verification of the full `/end → Haiku → ADR write` round-trip requires a live Claude Code session. Blocker: `claude -p --model haiku --bare --output-format text` subprocess command has failed in prior `/end` attempts — needs debugging.
- **SSR-01 UAT deferred** — SessionStart hook + 60-min marker mtime skip logic shipped, but real-session verification that `.claude/.session-loaded` mtime updates correctly and skip-reload triggers requires live UAT (Phase 28).
- **Phase 21 and Phase 25 bookkeeping gaps** — no `21-SUMMARY.md` or `25-SUMMARY.md` on disk; both shipped inline during adjacent phase sessions. Code is verified and committed (PR #37, `b12d89e`, 912 tests); `VERIFICATION.md` stubs created via quick task `260415-ps8` but no retrospective SUMMARY authored. Accepted as tech debt.
- **Phase 32 pre-existing test failures** — 3 subtests in `tests/detect.test.mjs` fail with `profile must be null in v1`; confirmed pre-existing on branch before Phase 32 work (see `phases/32-*/deferred-items.md`). Route to a separate bugfix quick task.

---

## v0.11 DX Polish & Ecosystem (Shipped: 2026-04-13)

**Phases completed:** 6 phases, 12 plans, 0 tasks

**Key accomplishments:**

- One-liner:
- 1. [Out of scope] `adr-bridge.mjs` also has an inline slug chain
- One-liner:
- `importDatabase(databaseId, vaultDocsDir, fetchFn)`
- `lib/notebooklm-stats.mjs`
- One-liner:

---

## v0.10 Query, Sync Automation & Quality (Shipped: 2026-04-13)

**Phases completed:** 5 phases, 9 plans, 4 tasks

**Key accomplishments:**

- Root cause:
- One-liner:
- One-liner:
- Task 1 — Thin orchestrator:
- One-liner:
- One-liner:

---
