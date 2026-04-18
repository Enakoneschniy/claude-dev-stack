---
phase: 50-gsd-fork-vendor
plan: 01
subsystem: infra
tags: [vendoring, gsd, workflow-engine, cds-workflow, path-rewrite, MIT-license]

# Dependency graph
requires: []
provides:
  - vendor/cds-workflow/ — complete vendored copy of GSD workflow engine (core + agents + skills)
  - vendor/cds-workflow/VERSION — CDS fork version marker (1.36.0-cds.1)
  - vendor/cds-workflow/LICENSE — original MIT license preserved
  - NOTICES.md — MIT attribution for get-shit-done by Lex Christopherson (TACHES)
  - scripts/vendor-gsd.mjs — one-time vendor script for reproducibility
affects: [50-02, install-wizard, update-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vendor/ directory for bundled workflow engine (committed to git, included in npm package)"
    - "Path rewrite at copy time (not at install time) via replaceAll('/.claude/get-shit-done', '/.claude/cds-workflow')"
    - "Safe replacement pattern: /.claude/get-shit-done (not bare get-shit-done) avoids npm package name corruption"

key-files:
  created:
    - vendor/cds-workflow/ (entire tree — 291 files)
    - vendor/cds-workflow/bin/gsd-tools.cjs
    - vendor/cds-workflow/workflows/ (71 workflow .md files)
    - vendor/cds-workflow/agents/ (31 gsd-*.md agent files)
    - vendor/cds-workflow/skills/ (73 gsd-*/ skill directories)
    - vendor/cds-workflow/VERSION
    - vendor/cds-workflow/LICENSE
    - scripts/vendor-gsd.mjs
  modified:
    - NOTICES.md

key-decisions:
  - "Used /.claude/get-shit-done as replacement pattern (not bare get-shit-done) to protect npm package name get-shit-done-cc"
  - "LICENSE copyright is Lex Christopherson (TACHES is the org/brand), both preserved in NOTICES.md"
  - "vendor-gsd.mjs script left in scripts/ for reproducibility — future forks can re-run it"

patterns-established:
  - "Pattern 1: Bulk path rewrite at vendor copy time, not at install time — keeps install logic simple"
  - "Pattern 2: Post-rewrite corruption check (grep for cds-workflow-cc) as safety gate"

requirements-completed: [GSD-01]

# Metrics
duration: 15min
completed: 2026-04-17
---

# Phase 50 Plan 01: GSD Fork + Vendor Summary

**Full GSD workflow engine (71 workflows, 31 agents, 73 skill dirs) vendored into vendor/cds-workflow/ with all /.claude/get-shit-done path references rewritten to /.claude/cds-workflow and MIT license attribution added**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-17T00:00:00Z
- **Completed:** 2026-04-17T00:15:00Z
- **Tasks:** 2
- **Files modified:** 293 (291 created in vendor/, NOTICES.md modified, LICENSE created)

## Accomplishments
- Vendored complete GSD source tree (core + agents + skills) into vendor/cds-workflow/ — zero upstream npm dependency for runtime
- Rewrote all 291 text files: /.claude/get-shit-done -> /.claude/cds-workflow with zero corruption of get-shit-done-cc npm package name
- Set fork VERSION to 1.36.0-cds.1 and preserved original MIT license from upstream GSD repo
- Updated NOTICES.md with proper attribution (get-shit-done by Lex Christopherson / TACHES, MIT, April 2026 fork)

## Task Commits

Each task was committed atomically:

1. **Task 1: Copy GSD source tree into vendor/cds-workflow/ and rewrite paths** - `9ebcc72` (feat)
2. **Task 2: Add LICENSE and NOTICES.md attribution** - `3b084ae` (feat)

## Files Created/Modified
- `vendor/cds-workflow/` - Entire vendored GSD tree (291 files across bin/, workflows/, agents/, skills/, templates/, references/, contexts/)
- `vendor/cds-workflow/VERSION` - Contains `1.36.0-cds.1`
- `vendor/cds-workflow/LICENSE` - Original MIT license from get-shit-done upstream
- `scripts/vendor-gsd.mjs` - One-time vendor script (reproducible)
- `NOTICES.md` - Added Workflow Engine section with MIT attribution for get-shit-done

## Decisions Made
- Used `/.claude/get-shit-done` as the search pattern (not bare `get-shit-done`) so that the npm package name `get-shit-done-cc` is never touched — this was the critical safety constraint from RESEARCH.md Pitfall 1.
- The GSD LICENSE names "Lex Christopherson" as copyright holder; TACHES is the project/org name. Both are included in NOTICES.md for completeness.
- Left `scripts/vendor-gsd.mjs` in the repo as a reproducibility artifact — if GSD 1.37 ships, the script can be re-run to refresh the vendor copy.

## Deviations from Plan

None — plan executed exactly as written. The replacement pattern, directory structure, and attribution wording all matched the plan spec. The copyright name in the fetched LICENSE was "Lex Christopherson" (not TACHES) — NOTICES.md includes both, which satisfies the D-09 attribution requirement.

## Issues Encountered
- None

## User Setup Required
None — no external service configuration required.

## Known Stubs
None — vendor/cds-workflow/ is a complete functional copy. All path references point to the new cds-workflow location.

## Threat Flags
None — no new network endpoints, auth paths, or trust boundaries introduced. Vendoring is a file system operation on MIT-licensed source.

## Next Phase Readiness
- vendor/cds-workflow/ is ready for Plan 02 (install/update wizard rewrite)
- Plan 02 will update bin/install.mjs and lib/update.mjs to copy from vendor/cds-workflow/ instead of calling npx get-shit-done-cc@latest
- No blockers

---
*Phase: 50-gsd-fork-vendor*
*Completed: 2026-04-17*
