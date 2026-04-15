---
phase: 31-skills-to-hooks-migration
plan: 04
subsystem: planning-docs
tags: [requirements, traceability, docs-only]
requires: []
provides:
  - SKL-01..04 requirement entries in REQUIREMENTS.md
  - 4 Traceability rows mapping to Phase 31
affects:
  - .planning/REQUIREMENTS.md
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - .planning/REQUIREMENTS.md
decisions:
  - D-20 Backfill SKL-01..04 into existing REQUIREMENTS.md section-and-table format
metrics:
  test_delta: 0 (docs only)
  commits: 1
---

# Phase 31 Plan 04: SKL Requirements Backfill Summary

Adds the 4 new Skills→Hooks requirements to `.planning/REQUIREMENTS.md` so the
IDs referenced by every other Phase 31 plan's frontmatter are resolvable to real
entries.

## Tasks Completed

### Task 1: Append SKL section + 4 Traceability rows
- **Commit:** `docs(31): backfill SKL-01..04 requirements + Traceability (D-20)` (f48ec20)
- Inserted `### Skills→Hooks (SKL)` section between `### Wizard UX Polish (UX)` and the
  `---` separator before `## Future Requirements`
- Appended 4 rows `| SKL-0N | 31 | — | pending |` to the Traceability table after `| UX-07 | 24 | — | pending |`
- Pre-existing entries (BUG-01..07, LIMIT-01..04, DX-07..13, UX-01..07, WF-01) untouched
- Markdown structure validated: `## Future Requirements` still present, tables not broken

## Test Delta
- 0 (docs-only change)

## Deviations from Plan
None — plan executed exactly as written.

## Auth Gates
None.

## Self-Check: PASSED
- .planning/REQUIREMENTS.md: `### Skills→Hooks (SKL)` == 1, 4× `**SKL-0N**` bold IDs, 4× `| SKL-0N | 31 |` rows
- Commit f48ec20: FOUND
