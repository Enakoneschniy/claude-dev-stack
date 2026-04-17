---
phase: 42-living-memory
fixed_at: 2026-04-17T19:05:00Z
review_path: .planning/phases/42-living-memory/42-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-04-17T19:05:00Z
**Source review:** .planning/phases/42-living-memory/42-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — IN-01 excluded per fix_scope: critical_warning)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `searchObservations` post-filters after SQL LIMIT, can silently under-return

**Files modified:** `packages/cds-core/src/vault/sessions.ts`
**Commit:** 7616e69
**Applied fix:** Replaced the single-parameter `searchStmt` prepared statement with a
six-parameter variant that includes `AND (? IS NULL OR o.session_id = ?) AND (? IS NULL OR o.type = ?)`
clauses before `LIMIT`. Updated `searchObservations` implementation to pass
`sessionId` and `type` (or `null`) as SQL parameters and removed the JS-side
post-filter loop. LIMIT is now applied after filtering so callers reliably
receive up to N matching results.

---

### WR-02: `topEntities` always returns count = 1 per entity

**Files modified:** `packages/cds-core/src/vault/sessions.ts`
**Commit:** 7616e69
**Applied fix:** Replaced `topEntitiesStmt` SQL from `SELECT name, COUNT(*) FROM entities GROUP BY name`
to a JOIN-based query that counts relation edges per entity:
`SELECT e.name, COUNT(*) FROM entities e JOIN relations r ON r.from_entity = e.id OR r.to_entity = e.id GROUP BY e.id ORDER BY count DESC LIMIT @limit`.
This gives a meaningful "most referenced" ranking instead of a constant count of 1.

Note: entities with zero relation edges will no longer appear in the top-entities
list (they have no relation rows to join). This is the correct semantic for
"most referenced" — entities never linked to others were not referenced.

**Requires human verification:** The fix uses `relations` table linkage as the
reference count proxy. If the project primarily tracks entity references via
the `observations.entities` JSON column rather than the `relations` table, the
alternate approach from the review (using `json_each`) may be more accurate.

---

### WR-03: `memory.ts` uses literal `'session'` as FTS query

**Files modified:** `packages/cds-cli/src/memory.ts`, `packages/cds-cli/src/memory.test.ts`
**Commit:** 1c6dd2b
**Applied fix:**
- Added `listObservations(options: { sessionId: string; limit?: number }): Observation[]`
  to the `SessionsDB` interface and implementation in `sessions.ts` (included in
  commit 7616e69). Uses a direct `SELECT ... FROM observations WHERE session_id = ? ORDER BY id DESC LIMIT ?`
  query — no FTS involved.
- Updated `memory.ts` to call `db.listObservations({ sessionId: s.id, limit: 3 })`
  instead of `db.searchObservations('session', ...)`. Adjusted topic-excerpt
  mapping from `o.observation.content` (SearchHit shape) to `o.content`
  (Observation shape).
- Updated `memory.test.ts` to mock `listObservations` instead of `searchObservations`,
  and updated all mock return values from SearchHit objects to plain Observation objects.

---

_Fixed: 2026-04-17T19:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
