---
phase: 32-capture-automation-hotfix
plan: 01
subsystem: hooks
tags: [userpromptsubmit, regex, cyrillic, idea-capture, telemetry, tdd]

# Dependency graph
requires:
  - phase: 31-skills-to-hooks
    provides: dev-router.mjs + project-switcher.mjs patterns (ESM node hook, stdin JSON, fail-silent exit 0, ReDoS-safe boundary class for Cyrillic)
provides:
  - UserPromptSubmit hook that detects Russian + English idea-trigger phrases and emits IDEA-CAPTURE HINT to stdout
  - Extensible trigger phrase config (hooks/idea-capture-triggers.json) — editable without code change per D-19
  - Optional telemetry counter (~/.claude/cds-stats.json → idea_capture_hints_fired) per CAPTURE-04
  - 15 test cases covering match/no-match/case-insensitivity/false-positive/hint-format/telemetry
affects:
  - 32-02 (wizard wire-up) — will register hooks/idea-capture-trigger.mjs in project-level .claude/settings.json
  - v0.12.1 release

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-language regex (ASCII \\b for English + explicit boundary class for Cyrillic) — reused from dev-router.mjs"
    - "First-match-wins deterministic ordering (Russian before English)"
    - "Try/catch-wrapped telemetry file I/O — filesystem errors never affect hook exit status"
    - "Literal trigger phrase echoed from committed config (never user input) — prevents prompt-injection into Claude context"

key-files:
  created:
    - hooks/idea-capture-trigger.mjs
    - hooks/idea-capture-triggers.json
    - tests/idea-capture-trigger.test.mjs
  modified: []

key-decisions:
  - "Form A (plain stdout) for hint emission — matches existing CDS hook pattern (dev-router.mjs, project-switcher.mjs)"
  - "Telemetry folded into hook implementation (not a separate task) — ~15 lines of code, no justification for a separate task"
  - "Russian phrases scanned BEFORE English — deterministic first-match-wins ordering for reproducibility"
  - "Hint string uses trigger phrase from committed JSON config (not user input) — T-32-02 prompt-injection mitigation"

patterns-established:
  - "Cyrillic-aware UserPromptSubmit hook — template for future Russian-language trigger hooks"
  - "Opt-in telemetry via ~/.claude/cds-stats.json — opt-out by deleting file, counter uses existing stats file for aggregation"

requirements-completed: [CAPTURE-02, CAPTURE-03, CAPTURE-04]

# Metrics
duration: ~10 min
completed: 2026-04-15
---

# Phase 32 Plan 01: Idea-Capture Trigger Hook Summary

**UserPromptSubmit hook that regex-matches Russian + English idea-trigger phrases in user prompts, emits an IDEA-CAPTURE HINT nudging Claude to invoke /gsd-note, and tracks hint-fire count in ~/.claude/cds-stats.json — shipped TDD with 15 passing test cases.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-15T20:54:14Z
- **Tasks:** 2/2
- **Files created:** 3
- **Files modified:** 0

## Accomplishments
- Hook detects 9 Russian + 7 English trigger phrases with case-insensitive word-boundary matching
- False-positive guard: "идеальный" does NOT match "идея", "идентификатор" does NOT match trigger prefixes
- Telemetry counter increments on match, never on no-match, never crashes the hook on filesystem errors
- ReDoS-safe: MAX_PROMPT_LEN=4096 truncation + literal-string alternation (no nested quantifiers)
- Zero npm deps (node stdlib only), fail-silent on every error path

## Task Commits

Each task committed atomically on `gsd/phase-32-capture-automation-hotfix`:

1. **Task 1: Failing tests + config JSON (RED)** — `963cc66` (test)
2. **Task 2: Hook implementation (GREEN)** — `b8efc47` (feat)

## Files Created/Modified

- `hooks/idea-capture-trigger.mjs` — ESM UserPromptSubmit hook (135 lines), executable, zero-dep
- `hooks/idea-capture-triggers.json` — trigger phrase config with `russian` (9 entries) + `english` (7 entries) arrays
- `tests/idea-capture-trigger.test.mjs` — 15 test cases across 5 describe blocks

## Decisions Made

Followed plan as specified. Plan-level decisions locked in CONTEXT.md (D-18..D-22) from vault cds-core-independence-plan.md.

## Deviations from Plan

None — plan executed exactly as written.

Implementation matched the plan's proposed `<action>` code sketch with minor defensive additions (Array.isArray + string filter in `loadTriggers()` to reject malformed config shapes, Array check in `bumpTelemetry()` to reject JSON arrays as stats object). These are Rule-2 hardening (reject unexpected shapes silently) and were already implicit in the plan's "reject other shapes silently" behavior spec, so they are not deviations.

## Issues Encountered

**Pre-existing test failures in `tests/detect.test.mjs` (3 subtests about `detectInstallState().profile`)** — confirmed pre-existing on branch via `git stash -u && node --test tests/detect.test.mjs` before any Phase 32 changes. Logged to `.planning/phases/32-capture-automation-hotfix-userpromptsubmit-hook-detects-idea/deferred-items.md`. Out of scope for this plan (different file, different subsystem). Route to separate quick task.

## Verification

- `node --check hooks/idea-capture-trigger.mjs` — passes
- `node --test tests/idea-capture-trigger.test.mjs` — **15/15 pass** (GREEN)
- `npm test` — 923/927 pass; 3 pre-existing `detect.test.mjs` failures unchanged, 1 skipped; no new regressions from this plan
- Manual smoke: `echo '{"prompt":"кстати, вот идея"}' | node hooks/idea-capture-trigger.mjs` → emits exact hint
- Manual smoke: `echo '{"prompt":"normal message fixing things"}' | node hooks/idea-capture-trigger.mjs` → silent

## Self-Check: PASSED

- `hooks/idea-capture-trigger.mjs` — FOUND
- `hooks/idea-capture-triggers.json` — FOUND
- `tests/idea-capture-trigger.test.mjs` — FOUND
- Commit `963cc66` (test RED) — FOUND in git log
- Commit `b8efc47` (feat GREEN) — FOUND in git log

## TDD Gate Compliance

- RED gate: `963cc66` `test(32-01): add failing tests for idea-capture-trigger hook (CAPTURE-02/03/04)` — VERIFIED (14/15 tests failed as expected, 1 passed because config JSON existed)
- GREEN gate: `b8efc47` `feat(32-01): idea-capture UserPromptSubmit hook + regex triggers (CAPTURE-02/03/04)` — VERIFIED (15/15 pass)
- REFACTOR gate: not needed (hook implementation was minimal and clean)

## Next Phase Readiness

- Plan 32-02 (wizard wire-up) can now pick up `hooks/idea-capture-trigger.mjs` for project-level `.claude/settings.json` registration.
- No blockers. Hook is ready to ship in v0.12.1 patch release.

---
*Phase: 32-capture-automation-hotfix*
*Completed: 2026-04-15*
