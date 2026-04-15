# Phase 31 — Validation Scaffold

**Status:** to be filled by /gsd-uat or executor verification step
**Created:** 2026-04-15

This file is a scaffold for post-execution validation. Each plan summary should
update its rows here with PASS/FAIL + brief evidence (commit hash, command output).

---

## SKL-01 — dev-router hook (Plan 31-01)

| Truth | PASS/FAIL | Evidence |
|-------|-----------|----------|
| Dev keyword in prompt → routing hint emitted | | |
| Russian dev keyword (сделай/исправь) → routing hint emitted | | |
| Research keyword → research hint emitted | | |
| No-keyword prompt → hook silent | | |
| Empty stdin / malformed JSON → hook silent (exit 0) | | |
| Routing hint ≤ 200 chars | | |
| Hook installed by wizard at ~/.claude/hooks/dev-router.mjs (mode 0755) | | |
| settings.json has UserPromptSubmit entry referencing dev-router.mjs | | |
| skills/dev-router/SKILL.md deleted from repo | | |

## SKL-02 — session-manager start-path migrated (Plan 31-03)

| Truth | PASS/FAIL | Evidence |
|-------|-----------|----------|
| `### /resume or /start` section removed | | |
| `## Automatic Behavior` section removed | | |
| D-06 note "Context is loaded at SessionStart" present | | |
| `### /end`, `### /handoff`, `### /status`, `## ADR Creation` retained | | |
| Test suite asserts SKL-02 absences + presence | | |

## SKL-03 — project-switcher hook (Plan 31-01 + 31-02)

| Truth | PASS/FAIL | Evidence |
|-------|-----------|----------|
| Prompt mentions other project → switch hint emitted with absolute path | | |
| Prompt mentions current cwd's project → hook silent (noise reduction) | | |
| Word-boundary match: "coremind" matches but "scoremind" does not | | |
| Missing project-map.json → hook silent | | |
| Empty stdin → hook silent | | |
| Hook installed by wizard; UserPromptSubmit entry registered | | |
| skills/project-switcher/SKILL.md deleted from repo | | |
| ~/.claude/skills/project-switcher/ removed by wizard re-run (D-17) | | |

## SKL-04 — git-conventions PreToolUse hook (Plan 31-01 + 31-02)

| Truth | PASS/FAIL | Evidence |
|-------|-----------|----------|
| Valid conventional commit (`fix: x`) → hook silent | | |
| Invalid commit (`fix stuff`) → warn-only stdout suggestion, exit 0 | | |
| Strict mode via .planning/config.json → exit 2 on invalid | | |
| `git commit` without -m → silent (cannot validate) | | |
| Heredoc / amend → silent (Claude's discretion) | | |
| settings.json has PreToolUse entry with matcher: "Bash" + if: "Bash(git commit*)" | | |
| Suggestion output ≤ 200 chars | | |

---

## Cross-cutting

| Truth | PASS/FAIL | Evidence |
|-------|-----------|----------|
| Full test suite green: `node --test tests/*.test.mjs` exits 0 | | |
| No new npm dependencies in package.json | | |
| All 3 hooks fail-silent on bad input (no exception leaks to Claude Code) | | |
| ReDoS guard: 1000-char pathological prompt completes < 100ms | | |
| Wizard re-run is idempotent: no duplicate settings entries | | |
| REQUIREMENTS.md SKL section + 4 Traceability rows present | | |
| vault/shared/patterns.md "Skills vs Hooks" section appended without overwriting user content | | |

---

## Manual UAT

(filled during /gsd-uat phase 31)

- [ ] Fresh install on test project → 3 hooks fire as designed in real Claude Code session
- [ ] Re-install over existing project → no settings duplication, deprecated skills removed
- [ ] Bad commit blocked in strict mode end-to-end (set config.json, attempt commit)
