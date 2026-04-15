# Plan 30-01 — CLAUDE.md Idempotent Merge (SUMMARY)

**Phase:** 30-claude-md-idempotent-merge
**Plan:** 01
**Requirements:** BUG-07
**Status:** complete
**Date:** 2026-04-14

## What was built

Fixed BUG-07 at the data-layer: stopped the wizard from overwriting
user-written CLAUDE.md content by routing all project-side writes through
a single marker-aware merge helper.

### New export `updateManagedSection(projectPath, managedContent)`

- Location: `lib/project-setup.mjs`
- Signature: `(projectPath: string, managedContent: string) => 'created' | 'updated' | 'appended' | 'unchanged'`
- Wraps `managedContent` in `<!-- @claude-dev-stack:start -->` /
  `<!-- @claude-dev-stack:end -->` markers and applies the 3-path policy:
  - Missing CLAUDE.md  → `'created'` (new file seeded with `# CLAUDE.md` H1 + managed section)
  - Markers present    → `'updated'` / `'unchanged'` (replace content between markers; `unchanged` if byte-identical)
  - Markers absent     → `'appended'` (user content left untouched, managed section appended at EOF)
- Threat-model notes inlined as JSDoc: T-30-01 (user-authored markers — accepted)
  and T-30-02 (concurrent wizard runs — accepted, no lockfile).

### Refactored `updateProjectClaudeMd(projectPath)` (D-03)

- Now a 3-line wrapper that calls `generateSkillsSection({ withMarkers: false })`
  and delegates to `updateManagedSection`.
- Existing callers (`setupProject`, `setupAllProjects`, `tests/project-setup.test.mjs`,
  the Output-Style-Override test suite) keep working with the same return shape.

### Refactored `generateSkillsSection()`

- Takes `{ withMarkers = false }` options bag.
- Default (no markers) is used by `updateProjectClaudeMd` since marker wrapping
  is the responsibility of `updateManagedSection` (single source of truth).
- Back-compat escape hatch: `generateSkillsSection({ withMarkers: true })`
  still returns the marker-wrapped string for any external caller.

### Rewrote `generateClaudeMD()` in `lib/install/claude-md.mjs` (BUG-07 fix)

- Deleted the buggy `userContentStart` / `userAdditions` slicing logic
  (lines 82-113 of the pre-fix file).
- Deleted `writeFileSync(claudePath, ...)` for project CLAUDE.md — all
  per-project writes now go through `updateManagedSection`.
- Built a `managedBody` string containing all managed sections (Language,
  Auto-Routing, Knowledge Base, Session Protocol, Code Style, Rules, References)
  — the Skills subsection is added by the wrapper path only (the wizard
  `generateClaudeMD` does NOT duplicate the skills section because
  `copyProjectSkills` + `updateProjectClaudeMd` are invoked elsewhere via
  `setupProject`).
- Preserved `writeFileSync(templatePath, template)` for `{vault}/CLAUDE.md.template`
  (D-08 — reference template stays non-idempotent).
- Per-project status output uses an inline switch that emits one of
  `created` / `updated` / `appended` / `unchanged` via `ok`/`warn`/`info`
  (final color-coded helper wiring lives in Plan 30-02 Task 1).

## Tests added

`tests/claude-md-idempotent.test.mjs` — 9 tests across 4 describe blocks:
- Scenario A — no CLAUDE.md → `'created'`
- Scenario B — markers present → `'updated'` (user content outside markers intact)
- Scenario C — markers absent → `'appended'` (user content byte-identical at start)
- Scenario D — user content before AND after markers → `'updated'` (both halves preserved byte-identical)
- Scenario E — idempotent re-run → `'created'` then `'unchanged'` (byte-identical file)
- Scenario F — user accidentally pasted our markers (T-30-01 accepted behavior)
- T-30-02 — concurrent runs `it.skip` (documented accepted risk)
- D-03 back-compat — `updateProjectClaudeMd` still writes skills section with markers
- Scenario H — integration: user content survives through `updateManagedSection` call

RED confirmed before implementation, all green after Task 2 + Task 3.

## Files modified

- `lib/project-setup.mjs` — +51 / −18 (new export, refactored wrapper, optioned generateSkillsSection)
- `lib/install/claude-md.mjs` — +23 / −46 (delete buggy merge logic, delegate to updateManagedSection)
- `tests/claude-md-idempotent.test.mjs` — new (218 lines)

## Commits

- `test(30): add failing tests for updateManagedSection (BUG-07)` — 29f1533 (RED)
- `feat(30): add updateManagedSection + refactor updateProjectClaudeMd to wrapper (BUG-07 D-01..D-03)` — bd6086f (GREEN)
- `fix(30): generateClaudeMD delegates to updateManagedSection — preserves user content (BUG-07 D-04, D-05)` — fce0c29

## Acceptance criteria (Plan 01)

- [x] `export function updateManagedSection` in `lib/project-setup.mjs` — 1 match
- [x] `updateManagedSection(project.path` in `lib/install/claude-md.mjs` — 1 match
- [x] `writeFileSync(claudePath` in `lib/install/claude-md.mjs` — 0 matches (legacy overwrite path deleted)
- [x] `writeFileSync(templatePath` in `lib/install/claude-md.mjs` — 1 match (D-08 template still written)
- [x] `userAdditions | userContentStart` in `lib/install/claude-md.mjs` — 0 matches (buggy slicing logic deleted)
- [x] `node --test tests/claude-md-idempotent.test.mjs tests/project-setup.test.mjs tests/install.test.mjs` — 132 pass, 0 fail, 1 skip (T-30-02 documentation placeholder)

## BUG-07 success-criteria status (after Plan 01)

- [x] SC#1 — user content outside markers preserved (Scenarios B, D, Scenario H integration)
- [x] SC#2 — marker pair already existed pre-phase; Plan 01 preserves them
- [x] SC#3 — `generateClaudeMD` delegates to marker-based merge (no `writeFileSync` overwrite)
- [x] SC#4 — first install without CLAUDE.md creates file with markers (Scenario A)
- [x] SC#5 — re-install where markers exist replaces content between them (Scenarios B, D)
- [x] SC#6 — re-install where markers absent appends managed section (Scenario C, D-07)
- [ ] SC#7 — status-line wiring (no "overwritten") — lives in Plan 30-02 Task 1

## Key-link verification

- `lib/install/claude-md.mjs` imports `updateManagedSection` from `../project-setup.mjs` — matches pattern `import.*updateManagedSection.*from.*project-setup`
- `updateProjectClaudeMd` internally calls `updateManagedSection(projectPath, ...)` — matches pattern `updateManagedSection\(`

## Notes / deviations

- The `generateClaudeMD` managed body intentionally omits the Skills subsection:
  that content is injected by the `updateProjectClaudeMd` wrapper path
  (called from `setupProject` after `copyProjectSkills`). The wizard's
  `generateClaudeMD` step runs BEFORE per-project `setupProject`, so the
  first run creates CLAUDE.md with the general managed body; the Skills
  subsection is added on the subsequent `setupProject` call (single-marker-pair
  invariant holds because `updateManagedSection` operates on the same markers).
- If future UX testing reveals the per-step ordering needs to be combined into
  a single managed section, revisit by folding `generateSkillsSection({ withMarkers: false })`
  into `generateClaudeMD`'s `managedBody` string.
