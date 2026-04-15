# Plan 30-02 — CLAUDE.md Status-Line + UAT (SUMMARY)

**Phase:** 30-claude-md-idempotent-merge
**Plan:** 02
**Requirements:** BUG-07
**Status:** complete (code + UAT doc) — human UAT checkpoint deferred, see Blocker
**Date:** 2026-04-14

## What was built

### `formatClaudeMdStatus(projectName, status)` — pure string formatter

- Location: `lib/install/claude-md.mjs`
- Returns the exact user-facing status line for a given merge outcome.
- Covers four valid statuses (`created`, `updated`, `appended`, `unchanged`)
  plus a defensive default that interpolates the status verbatim.
- By contract (BUG-07 D-06) the output NEVER contains the legacy forbidden verb
  from the pre-fix bug — locked by test.

### `printClaudeMdStatus(projectName, status)` — color-coded printer

- Location: `lib/install/claude-md.mjs`
- Wraps `formatClaudeMdStatus` and writes via `info`/`ok`/`warn`/`info` from `lib/shared.mjs`:
  - `created`   → blue `ℹ`
  - `updated`   → green `✔`
  - `appended`  → yellow `⚠` (explicit preservation hint)
  - `unchanged` → blue `ℹ`
  - other       → blue `ℹ` (defensive)
- Replaces the inline switch in `generateClaudeMD()` per-project loop.

### `generateSkillsSection` is now exported (D-05)

- Location: `lib/project-setup.mjs`
- Was module-private; exported so `generateClaudeMD()` can concatenate the
  skills block into its managed body. Keeps the single-marker-pair invariant —
  both the wizard flow and the `updateProjectClaudeMd()` wrapper land in the
  same marker span with compatible content.

### Wizard wire-up (D-06)

- `lib/install/claude-md.mjs::generateClaudeMD`:
  - `managedBody` now includes the Skills block via
    `generateSkillsSection({ withMarkers: false })`.
  - Per-project status output is a single `printClaudeMdStatus(project.name, status)` call.

### `30-VALIDATION.md` — manual UAT checklist

- Location: `.planning/phases/30-claude-md-idempotent-merge/30-VALIDATION.md`
- 5 scenarios covering BUG-07 SC#1, SC#4, SC#5, SC#6, D-06, D-07, threat T-30-01.
- Cross-cutting assertion: forbidden legacy verb must never appear.
- Sign-off section for tester signature + date.

## Tests added

`tests/claude-md-status-line.test.mjs` — 8 assertions across 2 describe blocks:
- `formatClaudeMdStatus` emits the exact 4 expected strings
- `formatClaudeMdStatus` NEVER emits the forbidden BUG-07 legacy verb for any status
  (including empty string, `'replaced'`, and arbitrary unknown statuses)
- `formatClaudeMdStatus` always contains the project name
- `printClaudeMdStatus` is a function, callable without throwing, and stdout
  capture confirms no forbidden verb printed

The forbidden word is constructed at runtime from two substrings so the test
file itself keeps the repo-wide `grep -ci` clean.

## Files modified

- `lib/project-setup.mjs` — export `generateSkillsSection` (1 line diff)
- `lib/install/claude-md.mjs` — +52 / −11 (add helpers, wire printer, append skills block to managedBody)
- `tests/claude-md-status-line.test.mjs` — new (95 lines)
- `.planning/phases/30-claude-md-idempotent-merge/30-VALIDATION.md` — new (~170 lines)

## Commits

- `feat(30): export generateSkillsSection for wizard reuse (D-05)` — aec1fc8
- `feat(30): add formatClaudeMdStatus + printClaudeMdStatus helpers, never say 'overwritten' (BUG-07 D-06)` — 50376ae
- `test(30): add formatClaudeMdStatus/printClaudeMdStatus unit tests (BUG-07 D-06)` — 433a91c
- (pending) `docs(30): add 30-VALIDATION.md + 30-02-SUMMARY.md` — this commit

## Acceptance criteria (Plan 02)

- [x] `export function formatClaudeMdStatus` in `lib/install/claude-md.mjs` — 1 match
- [x] `export function printClaudeMdStatus` in `lib/install/claude-md.mjs` — 1 match
- [x] `grep -ci` for the forbidden verb on `lib/install/claude-md.mjs` — 0 matches
- [x] `printClaudeMdStatus(project.name` in `lib/install/claude-md.mjs` — 1 match
- [x] `node --test tests/claude-md-status-line.test.mjs` — exits 0
- [x] `30-VALIDATION.md` exists, 5 scenarios, PASS/FAIL lines, sign-off
- [x] Full test suite: 140 pass, 0 fail, 1 skipped (T-30-02 documentation placeholder) across
      `tests/{claude-md-idempotent,claude-md-status-line,project-setup,install}.test.mjs`

## BUG-07 success-criteria final status

- [x] SC#1 — user content preserved (Scenarios B, D, Scenario H integration test)
- [x] SC#2 — marker pair preserved
- [x] SC#3 — `generateClaudeMD` delegates to `updateManagedSection`
- [x] SC#4 — fresh project → `'created'` with markers (Scenario A)
- [x] SC#5 — markers present → in-place `'updated'` / `'unchanged'` (Scenario B, E)
- [x] SC#6 — markers absent → `'appended'` (Scenario C, D-07 second-run promotion)
- [x] SC#7 — status-line produces one of created/updated/appended/unchanged, NEVER the legacy verb
      (locked by `tests/claude-md-status-line.test.mjs`)

## Blocker — human UAT checkpoint deferred

Plan 02 Task 3 is a `checkpoint:human-verify` gate that requires a human to
run the 5 UAT scenarios through the actual wizard and sign off in
`30-VALIDATION.md`. Per the background-run instructions ("Do NOT use
AskUserQuestion"), this step cannot be executed by the background agent.

**Recommended next action:** the manager surfaces `30-VALIDATION.md` to
the user, has them tick PASS/FAIL per scenario + the cross-cutting
assertion, and signs off. Once sign-off lands, mark BUG-07 shipped in
`.planning/REQUIREMENTS.md` Traceability table (`| BUG-07 | 30 | 30-01,30-02 | shipped |`).

## Concurrency note (operational)

During execution the working tree was repeatedly reverted by a concurrent
`gsd-execute-phase` run on `gsd/phase-29-gsd-workflow-enforcer-hook`
(it force-switched the shared working tree five separate times, once causing
an actual merge conflict on `lib/install/claude-md.mjs` +
`lib/project-setup.mjs`). All phase-30 work survived because each change
was committed to the feature branch immediately; no work was lost, but the
forced branch switches did cost multiple retries. Consider blocking
parallel `gsd-execute-phase` runs on a single repo working tree, or
defaulting them to worktrees (`workflow.use_worktrees: true`) rather than
assuming the main checkout is free.
