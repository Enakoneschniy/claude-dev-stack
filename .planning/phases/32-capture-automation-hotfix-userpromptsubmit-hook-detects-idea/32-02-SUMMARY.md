---
phase: 32-capture-automation-hotfix
plan: 02
subsystem: install-wizard
tags: [wizard, hooks-registration, userpromptsubmit, idea-capture, requirements-backfill]

# Dependency graph
requires:
  - phase: 32-capture-automation-hotfix
    plan: 01
    provides: hooks/idea-capture-trigger.mjs + hooks/idea-capture-triggers.json
provides:
  - Wizard installs idea-capture hook to project-level .claude/settings.json (D-18)
  - Idempotent re-run (substring-match existence check prevents duplicate UserPromptSubmit entries)
  - File-level test coverage for the new hook (4 assertions: exists, shebang, node --check, JSON valid)
  - REQUIREMENTS.md traceability for CAPTURE-01..04 → Phase 32
affects:
  - v0.12.1 patch release — end-to-end idea-capture pipeline now ships in wizard
  - `npx claude-dev-stack` re-runs on configured projects gain idea-capture hook automatically

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Substring-match idempotency (entry.hooks.some(h => h.command?.includes('idea-capture-trigger'))) — reused from dev-router / project-switcher registration blocks"
    - "Static data file copy alongside hook script (idea-capture-triggers.json in notebooklm-sync-* loop) — no chmod, JSON config pattern"
    - "File-level test convention (exists + shebang + node --check + config JSON well-formed) — matches Phase 29 gsd-workflow-enforcer test block"

key-files:
  created: []
  modified:
    - lib/install/hooks.mjs
    - tests/hooks.test.mjs
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Placement of CAPTURE-01 registration block: BEFORE SKL-04 git-conventions block to keep UserPromptSubmit entries grouped (dev-router → project-switcher → idea-capture, then switch to PreToolUse for git-conventions)"
  - "CAPTURE-01..04 all marked [x] complete in REQUIREMENTS.md — code for all four was delivered across Phase 32 Plans 01 + 02; no pending behavior remains"
  - "Task-2 REQUIREMENTS.md commit uses docs(32): prefix not docs(32-02): — matches repo convention of phase-level commit scopes in docs commits"

patterns-established:
  - "UserPromptSubmit hook registration template — 14 lines, copy-paste-adapt for future Phase N hooks following this surface (dev-router → project-switcher → idea-capture is now the 3rd example)"

requirements-completed: [CAPTURE-01, CAPTURE-02, CAPTURE-03, CAPTURE-04]

# Metrics
duration: ~8 min
completed: 2026-04-15
---

# Phase 32 Plan 02: Install Wizard Wire-Up + REQUIREMENTS Backfill Summary

**Wired `hooks/idea-capture-trigger.mjs` into the install wizard so `npx claude-dev-stack` registers it as a UserPromptSubmit hook in each configured project's `.claude/settings.json` (project-scoped per D-18), added 4 file-level tests, and backfilled CAPTURE-01..04 into REQUIREMENTS.md with traceability.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-04-15
- **Tasks:** 2/2
- **Files created:** 0
- **Files modified:** 3

## Accomplishments

- Installer copies `idea-capture-trigger.mjs` (executable) and `idea-capture-triggers.json` (data file, no chmod) to `~/.claude/hooks/` — same pattern as dev-router / project-switcher / notebooklm helpers.
- `_writeSettingsFile` registers the hook as a UserPromptSubmit entry in the project's `.claude/settings.json` — idempotent via `entry.hooks?.some(h => h.command?.includes('idea-capture-trigger'))`.
- 4 new file-level test cases for `idea-capture-trigger.mjs` (exists, shebang, `node --check`, JSON config well-formed) — matches the Phase 29 gsd-workflow-enforcer convention.
- REQUIREMENTS.md: new `### Capture Automation (CAPTURE)` section with CAPTURE-01..04 fully specified + 4 Traceability rows + header count increment.
- All four requirements marked complete (code already delivers them across Plans 01 + 02).

## Task Commits

Each task committed atomically on `gsd/phase-32-capture-automation-hotfix`:

1. **Task 1: Installer + tests** — `bb441ef` (feat)
2. **Task 2: REQUIREMENTS.md backfill** — `9f25f65` (docs)

## Files Created/Modified

- `lib/install/hooks.mjs` — (+16 lines) added `'idea-capture-trigger.mjs'` to the hook-copy loop, `'idea-capture-triggers.json'` to the data-file loop, and a 14-line UserPromptSubmit registration block placed between the Phase 31 SKL-03 project-switcher block and the SKL-04 git-conventions block.
- `tests/hooks.test.mjs` — (+30 lines) new `describe('idea-capture-trigger.mjs', () => {})` block with 4 test cases sibling to the `gsd-workflow-enforcer.mjs` block.
- `.planning/REQUIREMENTS.md` — (+20 lines) new CAPTURE section + 4 Traceability rows + header count increment from `+1 SSR-01 backfill` to `+1 SSR-01 backfill + 4 CAPTURE backfills`.

## Decisions Made

All plan-level decisions locked in CONTEXT.md (D-18..D-22) from vault cds-core-independence-plan.md — plan followed exactly.

Minor implementation choice: placed CAPTURE-01 block immediately after the SKL-03 project-switcher block and BEFORE the SKL-04 git-conventions block, keeping all three UserPromptSubmit registrations grouped together (this matches the plan's `<action>` step 1 guidance).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**Pre-existing `tests/detect.test.mjs` failures unchanged** — 3 `detectInstallState()` subtests continue to fail (documented in Plan 01 SUMMARY + `.planning/phases/32-capture-automation-hotfix-userpromptsubmit-hook-detects-idea/deferred-items.md`). Out of scope for this plan (different file, different subsystem). Net test count changed from 927/3-fail baseline to 931/3-fail (4 new hook-level assertions added, all pass).

## Verification

- `node --check lib/install/hooks.mjs` — passes
- `node --check tests/hooks.test.mjs` — passes
- `node --test tests/hooks.test.mjs` — **47/47 pass** (4 new CAPTURE-01 assertions green)
- `npm test` — **927/931 pass; 3 pre-existing `detect.test.mjs` failures unchanged; 1 skipped** → no new regressions from this plan
- `grep 'idea-capture-trigger' lib/install/hooks.mjs` → 4 occurrences (copy loop, dest path var, existence check, command arg) ✓ (spec requires ≥3)
- `grep 'idea-capture-triggers.json' lib/install/hooks.mjs` → 1 occurrence (data-file loop) ✓ (spec requires ≥1)
- REQUIREMENTS.md: CAPTURE section + 4 Traceability rows present; all four marked `[x]` complete ✓

## Self-Check: PASSED

- `lib/install/hooks.mjs` modifications — FOUND (installer copy loop + UserPromptSubmit registration block at line ~236)
- `tests/hooks.test.mjs` modifications — FOUND (`describe('idea-capture-trigger.mjs')` block at line ~414)
- `.planning/REQUIREMENTS.md` CAPTURE section — FOUND (above Traceability table)
- `.planning/REQUIREMENTS.md` Traceability rows — FOUND (4 new rows appended after SKL-04)
- Commit `bb441ef` (feat) — FOUND in git log
- Commit `9f25f65` (docs) — FOUND in git log

## Next Phase Readiness

- Phase 32 is code-complete. Branch `gsd/phase-32-capture-automation-hotfix` ready for PR → merge → v0.12.1 tag → npm publish.
- Manual UAT (optional before merge): run `npx claude-dev-stack` in a test project, confirm `.claude/settings.json` gains the UserPromptSubmit idea-capture entry, re-run wizard and confirm no duplicate entry, then trigger the hook with a real Russian/English prompt in a Claude Code session.
- No blockers. No open deferred items from this plan (the pre-existing `detect.test.mjs` failure is already tracked in `deferred-items.md` from Plan 01).

---
*Phase: 32-capture-automation-hotfix*
*Completed: 2026-04-15*
