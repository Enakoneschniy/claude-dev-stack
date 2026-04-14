---
phase: 29-gsd-workflow-enforcer-hook
plan: 01
subsystem: hooks
tags: [hooks, workflow, gsd, posttooluse, enforcer]

requires:
  - phase: 25-budget-aware-execution-gate
    provides: PostToolUse Skill hook pattern (mirror architecture for budget-gate)
provides:
  - PostToolUse Skill hook emitting NEXT directive when 2+ pending phases remain
  - Fail-silent fallback on non-GSD projects (no ROADMAP.md)
  - Regex-DoS guard (MAX_LINES=10_000 + bounded phase-number regex)
  - Phase number validation preventing stdout injection
affects: [29-02 wizard install]

tech-stack:
  added: []
  patterns:
    - "PostToolUse Skill hook with tool_input.skill filter (mirror of Phase 25 Plan 01 pattern)"
    - "Fail-silent stdin read + JSON parse + top-level .catch().finally(exit(0))"

key-files:
  created:
    - hooks/gsd-workflow-enforcer.mjs
    - tests/workflow-enforcer.test.mjs
  modified: []

key-decisions:
  - "Read tool_input.skill (NOT skill_name) per Phase 25 research finding"
  - "Match phase-number regex ^- \\[ \\] \\*\\*Phase N: with bounded quantifiers (\\d{1,4}(?:\\.\\d{1,2})?) — linear-time, no backtracking hazard"
  - "Slice text to first MAX_LINES=10_000 lines before regex — hard cap against adversarial ROADMAP content"
  - "Re-validate each captured phase number against /^\\d{1,4}(\\.\\d{1,2})?$/ before stdout interpolation — blocks injection (newline, ANSI, shell metachars)"
  - "Detect 'planned' phase by presence of {N}-CONTEXT.md inside .planning/phases/{N}-*/ directory (directory matched by numeric prefix, flexible slug suffix)"

patterns-established:
  - "PostToolUse Skill hook with three-way output (directive path A | directive path B | silent)"
  - "Phase-number safe-interpolation: regex-validate before stdout write"

requirements-completed:
  - WF-01 (runtime SC#1..SC#5; SC#6 wizard install deferred to Plan 02)

duration: ~20min
completed: 2026-04-14
---

# Plan 29-01 Summary

**PostToolUse Skill hook ships — emits NEXT directive when 2+ pending phases remain, preventing premature /gsd-execute-phase suggestion mid-batch.**

## Performance

- **Tasks:** 1 of 1 complete
- **Files created:** 2 (hook script + test file)
- **Tests added:** 13 cases — all passing

## Accomplishments

- Implemented `hooks/gsd-workflow-enforcer.mjs` (110 lines, ESM, Node built-ins only)
- Three output paths matching D-06:
  1. `unplanned >= 1 && pending >= 2` → `NEXT: /gsd-discuss-phase M — ...`
  2. `unplanned === 0 && plannedButPending >= 2` → `NEXT: /gsd-manager — all N ...`
  3. `pending <= 1` → silent exit 0
- Fail-silent guards on every boundary:
  - stdin empty → return
  - JSON parse error → return
  - `tool_name !== 'Skill'` → return
  - `tool_input.skill !== 'gsd-plan-phase'` → return (covers all non-plan-phase skills)
  - Missing ROADMAP.md → return
  - readFileSync throws → return
  - Top-level `.catch(() => {}).finally(() => process.exit(0))`
- Security mitigations:
  - T-29-01 regex-DoS: MAX_LINES=10_000 slice + bounded `\d{1,4}(?:\.\d{1,2})?` — linear time, tested under 1.5s with 20k-line ROADMAP
  - T-29-02 output injection: VALID_PHASE_NUM re-validation after capture — digits-only cannot carry newlines/ANSI

## Verification

### Automated (13 test cases, all pass)

1. exits silently on non-Skill tool_name
2. exits silently when skill is not gsd-plan-phase
3. ignores tool_input.skill_name field (wrong key)
4. exits silently when ROADMAP.md is missing
5. emits discuss-next when 2+ unplanned phases pending
6. picks the FIRST unplanned phase as M
7. emits manager directive when all pending phases are planned
8. exits silently when only 1 pending phase remains
9. exits silently when 0 pending phases remain
10. handles decimal phase numbers like 28.1
11. rejects malformed phase numbers (regex-DoS guard, < 1.5s)
12. bounds scan to MAX_LINES (20k-line ROADMAP, < 1.5s)
13. outputs single line terminated by newline

### Manual smoke tests

- From repo root with `gsd-plan-phase` stdin → emits `NEXT: /gsd-manager — all 8 pending phases have plans...` (all current pending phases have CONTEXT.md, so manager-path fires)
- From repo root with `gsd-discuss-phase` stdin → silent (wrong skill filter)
- From `/tmp` (no .planning/) → silent (non-GSD project fallback)

### Full suite

- `npm test` → 731 passed, 3 failed (all 3 pre-existing `session-end-check.sh integration` failures, unrelated to Phase 29 — verified by running the same failing tests on baseline before Plan 29-01 work)
- Plan 29-01 contribution: +13 passing tests

## Known Issues

None from Plan 29-01. Pre-existing baseline failures in `tests/hooks.test.mjs:274` + `:308` (`session-end-check.sh integration`) are unrelated to WF-01 and predate this work.

## Next

Plan 29-02: wire the hook into `lib/install/hooks.mjs` so every configured project automatically gains the PostToolUse Skill → gsd-workflow-enforcer.mjs registration.
