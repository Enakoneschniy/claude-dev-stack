---
phase: 40-v1-0-alpha-polish-and-blockers
plan: "03"
subsystem: cli
tags: [claude-code, permissions, doctor, install-wizard, bash-allowlist, settings-local-json]

requires:
  - phase: 40-02-gsd-execute-phase-bypassperms-patch
    provides: bypassPermissions mode patch for gsd-executor subagents

provides:
  - lib/install/permission-config.mjs — shared GSD permission writer (setupGsdPermissions + detectCCMajorVersion)
  - doctor --gsd-permissions subcommand writes Bash allowlist to .claude/settings.local.json
  - install wizard auto-configures permissions for CC 2.x at install time

affects:
  - gsd-executor agents (fixed silent Bash denial on CC 2.1.x)
  - install-wizard flow
  - doctor health check flow

tech-stack:
  added: []
  patterns:
    - "settings.local.json (project-scope) vs settings.json (global-scope) distinction"
    - "Idempotent permission merge — read/diff/write-if-changed"
    - "CC version detection via spawnSync claude --version"

key-files:
  created:
    - lib/install/permission-config.mjs
    - tests/install-permission-config.test.mjs
    - tests/doctor-gsd-permissions.test.mjs
  modified:
    - lib/doctor.mjs
    - bin/cli.mjs
    - bin/install.mjs

key-decisions:
  - "Write to .claude/settings.local.json (project-scope), NEVER to ~/.claude/settings.json (global)"
  - "Shared module pattern: setupGsdPermissions called from both doctor and wizard, not duplicated"
  - "Doctor --gsd-permissions is an early-return branch — runs only the permission write, skips full health check"
  - "Wizard CC 2.x detection: spawnSync claude --version, parse major version, skip if < 2 or not found"

patterns-established:
  - "settings.local.json is CC 2.x user-local override — project-scoped, not committed to git"
  - "Permission helpers in lib/install/ — small, focused, no prompts, pure write-or-skip"

requirements-completed:
  - GSD-PERMS-DOCTOR
  - GSD-PERMS-WIZARD

duration: ~45min
completed: 2026-04-17
---

# Phase 40 Plan 03: Doctor GSD Permissions and Wizard Summary

**`doctor --gsd-permissions` subcommand + wizard CC 2.x auto-detection write 12 Bash patterns to `.claude/settings.local.json`, fixing the silent Bash denial regression from Phase 39 Wave 2**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-17
- **Completed:** 2026-04-17
- **Tasks:** 6 (5 implementation + 1 verification)
- **Files modified:** 6

## Accomplishments

- Created `lib/install/permission-config.mjs` with `setupGsdPermissions(projectPath)` and `detectCCMajorVersion()` — idempotent, no prompts, pure write-or-skip
- Extended `lib/doctor.mjs` with `--gsd-permissions` early-return branch; updated `bin/cli.mjs` to plumb the flag and add help text
- Wired `setupGsdPermissions` into the install wizard (`bin/install.mjs`) as a new step that fires when CC >= 2.x is detected
- 8 tests (5 unit in `install-permission-config.test.mjs`, 3 integration in `doctor-gsd-permissions.test.mjs`) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/install/permission-config.mjs** - `b3b7b36` (feat)
2. **Task 2: Extend lib/doctor.mjs** - `98f8ce2` (feat)
3. **Task 3: Wire --gsd-permissions in bin/cli.mjs** - `2857b07` (feat)
4. **Task 4: Wizard step for CC 2.x permissions** - `599d437` (feat)
5. **Tasks 4+5: Tests for permissions modules** - `e52e703` (test)
6. **Task 6: Full suite verification** - (no source changes, confirmed green)

Post-plan fix: `96f08c9` `fix(40-06): add try/catch to doctor --gsd-permissions` — added EACCES error handling in doctor per code review finding.

## Files Created/Modified

- `lib/install/permission-config.mjs` — Shared GSD permission writer: `setupGsdPermissions`, `detectCCMajorVersion`, `GSD_BASH_PATTERNS` (12 patterns)
- `lib/doctor.mjs` — Added `--gsd-permissions` early-return branch; `main()` now accepts `{ gsdPermissions }` options object (backward-compatible)
- `bin/cli.mjs` — Doctor case extracts `--gsd-permissions` flag, passes `{ gsdPermissions }` to `main()`; help text updated
- `bin/install.mjs` — New "GSD permissions" wizard step with D-129 traceability comment; fires after CDS MCP server step
- `tests/install-permission-config.test.mjs` — Unit tests: fresh project, idempotency, partial allowlist, no-write noop, corrupt JSON recovery
- `tests/doctor-gsd-permissions.test.mjs` — Integration tests via `execFileSync`: flag recognized, creates settings file, idempotent second run

## Decisions Made

- Wrote to `.claude/settings.local.json` (project-scope per D-128), not global `~/.claude/settings.json` — this is CC 2.x's user-local override that should NOT be committed to git
- Single shared module (`lib/install/permission-config.mjs`) used by both doctor and wizard — avoids duplication and ensures the two entry points always stay in sync
- Doctor `--gsd-permissions` is a focused early-return command that exits after writing permissions; does NOT run the full vault/plugins health check
- Wizard step is fire-and-forget: skips silently if CC < 2 or not found, adds patterns if CC >= 2

## Deviations from Plan

None — plan executed exactly as written. The `try/catch` addition in `fix(40-06)` was a subsequent code review finding addressed in Plan 06.

## Issues Encountered

None during core implementation. The EACCES error-handling gap (unwritable `.claude/` directory) was caught in the Plan 06 code review and patched as `96f08c9`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- GSD executor Bash permission fix complete; combined with Plan 02's `bypassPermissions` patch, this closes the CC 2.1.x silent Bash denial regression
- Users can run `claude-dev-stack doctor --gsd-permissions` in any project directory to configure permissions idempotently
- New installs auto-configure permissions at wizard time when CC >= 2.0 is detected

---
*Phase: 40-v1-0-alpha-polish-and-blockers*
*Completed: 2026-04-17*
