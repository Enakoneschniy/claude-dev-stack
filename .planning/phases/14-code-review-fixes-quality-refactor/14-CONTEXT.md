# Phase 14: Code Review Fixes + Quality Refactor - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers two independent cleanups:
1. **REVIEW-01** — Fix 4 code review warnings from Phase 11 (WR-01..WR-04) in `lib/notebooklm.mjs` and `lib/notebooklm-cli.mjs`
2. **QUALITY-01** — Centralize path→slug mapping from 4 files into `lib/project-naming.mjs`

Both are mechanical — no new features, no behavior changes for users.

</domain>

<decisions>
## Implementation Decisions

### Phase 11 Code Review Fixes (REVIEW-01)

- **D-01:** Fix all 4 warnings: WR-01 (unused tmpdir in test), WR-02 (missing null check), WR-03 (shell quoting), WR-04 (silent flag discard). Per session log 2026-04-13-phase11-shipped-phase12-planned.md.
- **D-02:** Target files: `lib/notebooklm.mjs` and `lib/notebooklm-cli.mjs` (and their test files if WR-01 is in tests).
- **D-03:** No behavior changes — fixes are defensive (null checks, quoting) not functional.

### Path→Slug Centralization (QUALITY-01)

- **D-04:** New module `lib/project-naming.mjs` exports `toSlug(name)` and `fromSlug(slug)`.
- **D-05:** `toSlug(name)` — `name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')`. Same logic currently in `lib/add-project.mjs:110,118` and `lib/docs.mjs:247`.
- **D-06:** `fromSlug(slug)` — reverse lookup via vault project directories. Scans `vault/projects/` for matching directory name.
- **D-07:** All 4 consumer files (`add-project.mjs`, `projects.mjs`, `project-setup.mjs`, `docs.mjs`) import from `lib/project-naming.mjs` — no local slug logic remains.
- **D-08:** `tests/project-naming.test.mjs` — unit tests for toSlug edge cases (spaces, special chars, consecutive hyphens, leading/trailing).

### Claude's Discretion

- Whether to also centralize the slug pattern in `lib/adr-bridge.mjs` (Phase 13 just added a similar pattern). If convenient, yes — but not required by QUALITY-01.
- Test count expectations — whatever covers the edge cases.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Slug Mapping Locations (current state)
- `lib/add-project.mjs` lines 110, 118 — `clean = val.toLowerCase().replace(...)`
- `lib/docs.mjs` lines 235, 247 — `slug = title.toLowerCase().replace(...)`
- `lib/projects.mjs` — uses project directory names directly (may not need slug)
- `lib/project-setup.mjs` — uses project names for directory matching

### Phase 11 Review Warnings
- Session log: `~/vault/projects/claude-dev-stack/sessions/2026-04-13-phase11-shipped-phase12-planned.md` — WR-01..WR-04 descriptions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/adr-bridge.mjs:181` — has a similar slug pattern (could import from project-naming.mjs)
- `lib/shared.mjs` — existing shared utilities module (project-naming.mjs follows same pattern)

### Established Patterns
- All lib modules are ESM (.mjs), export named functions, import from relative paths
- Tests use `node:test` + `node:assert/strict`

### Integration Points
- 4 files need import updates for slug centralization
- notebooklm.mjs and notebooklm-cli.mjs need targeted fixes for WR-01..WR-04

</code_context>

<specifics>
## Specific Ideas

No specific requirements — mechanical cleanup following established patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-code-review-fixes-quality-refactor*
*Context gathered: 2026-04-13*
