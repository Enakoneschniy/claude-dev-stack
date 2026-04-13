---
phase: 14-code-review-fixes-quality-refactor
plan: 02
subsystem: lib/project-naming
tags: [refactor, slug, centralization, tdd]
dependency_graph:
  requires: []
  provides: [lib/project-naming.mjs]
  affects: [lib/add-project.mjs, lib/docs.mjs, lib/templates.mjs, lib/import.mjs, lib/install/projects.mjs]
tech_stack:
  added: [lib/project-naming.mjs]
  patterns: [single-source-of-truth slug utility, TDD red-green cycle]
key_files:
  created:
    - lib/project-naming.mjs
    - tests/project-naming.test.mjs
  modified:
    - lib/add-project.mjs
    - lib/docs.mjs
    - lib/templates.mjs
    - lib/import.mjs
    - lib/install/projects.mjs
decisions:
  - "toSlug adds consecutive-hyphen collapse and leading/trailing strip to existing pattern — safe because existing pattern never produced consecutive hyphens from spaces"
  - "cleanNotionFilename in docs.mjs intentionally left untouched — Notion UUID cleanup, different purpose"
  - "adr-bridge.mjs slug left out of scope — not listed in plan, deviation logged to deferred-items"
metrics:
  duration: ~3 minutes
  completed: 2026-04-13
---

# Phase 14 Plan 02: Centralize Slug Logic Summary

Centralized 8+ duplicate `toLowerCase().replace()` slug chains into `lib/project-naming.mjs` with `toSlug()` and `fromSlug()` exports. All 5 consumer files now import from one source.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create lib/project-naming.mjs with tests (TDD) | 1d03caf (RED), a25f2b9 (GREEN) | lib/project-naming.mjs, tests/project-naming.test.mjs |
| 2 | Replace inline slug logic in all consumer files | 539d115 | lib/add-project.mjs, lib/docs.mjs, lib/templates.mjs, lib/import.mjs, lib/install/projects.mjs |

## Decisions Made

- **toSlug spec extended**: Added `/-{2,}/g` collapse and `^-|-$` strip on top of the existing pattern. Safe because the pre-existing chain never produced consecutive hyphens from space-to-hyphen conversion, and outputs were a subset of the new function's outputs.
- **cleanNotionFilename untouched**: The `.replace(/\s+/g, '-').toLowerCase()` chain in `docs.mjs` strips Notion UUID suffixes — it is not a project slug and was deliberately excluded per plan notes.

## Deviations from Plan

### Out-of-scope discoveries (not fixed)

**1. [Out of scope] `adr-bridge.mjs` also has an inline slug chain**
- **Found during:** Task 2 final grep scan
- **Location:** `lib/adr-bridge.mjs:185`
- **Pattern:** `phaseName.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')`
- **Action:** Not touched — not in plan scope. Logged here for future cleanup.

## Verification Results

- `grep "export function toSlug" lib/project-naming.mjs` — PASS
- `grep "export function fromSlug" lib/project-naming.mjs` — PASS
- `grep "replace.*-{2,}" lib/project-naming.mjs` — PASS
- `node --test tests/project-naming.test.mjs` — 12/12 PASS
- `npm test` — 495/495 PASS (483 baseline + 12 new)
- All 5 consumer files import `toSlug` from `./project-naming.mjs` — PASS
- Zero remaining inline slug chains in scoped files — PASS

## Known Stubs

None.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced. `toSlug` sanitizes user input (strips non-alphanumeric chars, preventing path traversal) — fulfills T-14-03 mitigation as planned.

## Self-Check: PASSED

- `lib/project-naming.mjs` — FOUND
- `tests/project-naming.test.mjs` — FOUND
- Commit `1d03caf` (TDD RED) — FOUND
- Commit `a25f2b9` (TDD GREEN) — FOUND
- Commit `539d115` (consumer refactor) — FOUND
