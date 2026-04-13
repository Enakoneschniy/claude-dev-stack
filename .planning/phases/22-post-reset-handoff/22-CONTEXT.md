# Phase 22: Post-Reset Handoff — Context

**Gathered:** 2026-04-13 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

When a scheduled task fires (Desktop or Cloud), it must automatically read `.planning/STATE.md`, extract `stopped_at` and `resume_file`, and resume execution from that point — no manual lookup required.

This phase is a **pure reader**: it adds state-reading logic at task startup, it does NOT write to STATE.md (that is GSD's job during normal session flow).

**Single requirement:** LIMIT-04

Sub-features:
1. **State reader** — `lib/handoff.mjs` that reads STATE.md and returns `stopped_at` + `resume_file`
2. **Entrypoint integration** — the scheduled task prompt (from `loop.md` and `/gsd-resume-work`) calls the state reader at startup
3. **Error handling** — missing STATE.md or missing `stopped_at` surfaces a clear error, no silent wrong execution

</domain>

<prior_decisions>
## Project-Level Constraints

- Single-dep constraint: `prompts@^2.4.2` only — no new JS runtime dependencies.
- All new `lib/*.mjs` files need matching `tests/*.test.mjs` (test baseline: 613 after Phase 21).
- Branching strategy: `gsd/phase-22-*` branches.
- No Co-Authored-By in commits.

## From Phase 21 (Continuation Prompt & loop.md)

- `lib/continuation.mjs` — 4-option prompt and scheduling handlers. Scheduled tasks run `/gsd-resume-work`.
- `templates/loop.md` — reads STATE.md in Step 1 (`stopped_at` / `resume_file`). Phase 22 provides the implementation that backs this documented behavior.
- Cloud tasks: fresh git clone — all state must be in git. GSD guarantees this via commit-everything approach.
- The scheduled task prompt is `/gsd-resume-work` (for both Desktop and Cloud tasks).

## From Phase 20 (Budget Detection)

- `lib/budget.mjs` — pattern for a focused utility module with pure functions. Follow same pattern for `lib/handoff.mjs`.
- State is in `~/.claude/budget-state.json` for budget; for handoff, state is in `.planning/STATE.md` (project-relative).

## From SEED-001

- Key insight: Cloud tasks do a fresh git clone — "all state must be in git (which GSD already guarantees). No local-only state."
- Missing STATE.md → clear error, not silent wrong execution.

</prior_decisions>

<decisions>
## Implementation Decisions

### LIMIT-04: Post-Reset Handoff

**D-01: New module — `lib/handoff.mjs`**
[auto] Create `lib/handoff.mjs` with the following exports:
- `readHandoffState(projectRoot?)` — reads `.planning/STATE.md`, parses YAML frontmatter, returns `{ stopped_at, resume_file }`.
- `validateHandoffState(state)` — validates that `stopped_at` is present and non-empty; throws `HandoffError` if not.
- `formatHandoffSummary(state)` — formats a human-readable summary: "Resuming from: {stopped_at}" + optional "Context file: {resume_file}".

**D-02: STATE.md parsing strategy**
[auto] STATE.md uses YAML frontmatter (between `---` delimiters) followed by Markdown body. Parse ONLY the frontmatter for `stopped_at` and `resume_file`. Use a simple regex/line-split parser — no new deps. The frontmatter fields are:
```yaml
stopped_at: "Phase N complete — ..."
resume_file: path/to/file.md  # optional
```
If `resume_file` is `None` (string) or absent, treat as no resume file — skip file loading.

**D-03: projectRoot resolution**
[auto] `readHandoffState` accepts an optional `projectRoot` argument. Default: resolve from `process.cwd()` by walking up until `.planning/STATE.md` is found, or falling back to `process.cwd()`. This makes it work correctly both from project root and from subdirectories (important for cloud tasks doing fresh clone).

**D-04: Error handling — missing STATE.md**
[auto] If `.planning/STATE.md` does not exist:
- Throw `HandoffError` with message: `"STATE.md not found at {path}. Ensure you are running from a GSD-managed project root with committed state."`
- Exit code 1 when invoked from CLI context.
- Never silently proceed to wrong execution.

**D-05: Error handling — missing stopped_at**
[auto] If STATE.md exists but `stopped_at` is absent or empty:
- Throw `HandoffError` with message: `"STATE.md exists but stopped_at is not set. No interrupted session to resume. Run /gsd-next to advance the milestone."`
- This is a valid state (no interrupted work) — surface as informational, not a crash.

**D-06: CLI integration — `claude-dev-stack handoff status`**
[auto] Add a `handoff status` subcommand to `bin/cli.mjs`:
- Reads STATE.md and prints: current `stopped_at`, `resume_file` (if any), whether state is resumable.
- Exit 0 if resumable, exit 1 if not (allows scripting: `claude-dev-stack handoff status && /gsd-resume-work`).
- Useful for debugging scheduled tasks.

**D-07: loop.md integration — documentation alignment**
[auto] `loop.md` already documents the correct behavior (Step 1: read STATE.md → run `/gsd-resume-work`). Phase 22 provides the backing implementation. No changes needed to `templates/loop.md` — it is already correct.

**D-08: `/gsd-resume-work` skill awareness**
[auto] The `/gsd-resume-work` GSD skill handles the actual resumption. Phase 22's job is NOT to reimplement GSD's resume logic — it is to provide:
1. `lib/handoff.mjs` — the state-reading utility (importable, testable)
2. `claude-dev-stack handoff status` — CLI for scripted checks and debugging
3. Tests proving the error cases work correctly

**D-09: Fresh git clone compatibility**
[auto] `lib/handoff.mjs` uses only `node:fs` and `node:path` — no local state outside of `.planning/STATE.md`. Since GSD commits STATE.md on every phase/plan completion, a fresh `git clone` will have the correct state. No additional work needed beyond confirming the file-read logic works from any cwd.

**D-10: Test file**
[auto] Create `tests/handoff.test.mjs` with:
- Happy path: valid STATE.md with `stopped_at` → returns correct state object.
- Missing STATE.md → `HandoffError` with clear message.
- STATE.md present but `stopped_at` absent/empty → `HandoffError` with informational message.
- `resume_file` is optional — absent is valid.
- `resume_file: None` (string) treated as absent.
- `formatHandoffSummary` output format test.
Use `tests/fixtures/` for test STATE.md files (follow existing fixture pattern).

**D-11: New `HandoffError` class**
[auto] Export `HandoffError extends Error` from `lib/handoff.mjs`. Has `code` property (`'MISSING_STATE'` or `'MISSING_STOPPED_AT'`). Makes error type distinguishable in tests and CLI handler.

### Claude's Discretion

- Exact regex for YAML frontmatter parsing (simple line-split preferred)
- Whether `readHandoffState` is async or sync (sync preferred — no I/O async benefit here)
- Internal variable naming in `lib/handoff.mjs`
- Exact CLI output formatting for `handoff status`

</decisions>

<canonical_refs>
## Canonical References

### Phase 21 — Scheduling Primitives (baseline)
- `lib/continuation.mjs` — scheduling handlers, `/gsd-resume-work` as task prompt
- `templates/loop.md` — documents Step 1 STATE.md read behavior (Phase 22 backs this)
- `tests/continuation.test.mjs` — existing tests (do not break)

### Phase 20 — Budget Utilities (module pattern to follow)
- `lib/budget.mjs` — pattern: focused utility, pure functions, named exports
- `tests/budget.test.mjs` — pattern: test file structure, fixtures usage

### CLI Entry
- `bin/cli.mjs` — add `handoff` command group

### State File
- `.planning/STATE.md` — source of truth for `stopped_at` and `resume_file`

### SEED-001 Design Reference
- `.planning/seeds/SEED-001-delegated-execution-service.md` — cloud task fresh-clone constraint, all-state-in-git principle

### Fixtures Pattern
- `tests/fixtures/` — existing test fixtures (add `state/` subdir for STATE.md fixtures)

</canonical_refs>

<deferred>
## Deferred / Out of Scope

- Writing to STATE.md (GSD handles this — Phase 22 is read-only)
- Reimplementing `/gsd-resume-work` logic (that is GSD's domain)
- Per-project STATE.md paths (always `.planning/STATE.md` relative to project root)
- Managed Agents integration (deferred — not GA stable)
- Two-way state sync with external schedulers (out of scope)

</deferred>

<auto_log>
## Auto-Selected Choices (--auto mode)

- [auto] No existing CONTEXT.md found — fresh context capture.
- [auto] No existing plans found — proceeding to context capture.
- [auto] No matching todos found for Phase 22.
- [auto] D-01: `lib/handoff.mjs` with three exports (`readHandoffState`, `validateHandoffState`, `formatHandoffSummary`).
- [auto] D-02: Simple regex/line-split YAML frontmatter parser — no new deps.
- [auto] D-03: `projectRoot` optional arg, walk-up fallback to cwd.
- [auto] D-04: `HandoffError` with `'MISSING_STATE'` code for absent STATE.md.
- [auto] D-05: `HandoffError` with `'MISSING_STOPPED_AT'` code for absent stopped_at — informational, not crash.
- [auto] D-06: `claude-dev-stack handoff status` CLI subcommand — exit 0/1 for scripting.
- [auto] D-07: `templates/loop.md` already correct — no changes needed.
- [auto] D-08: Phase 22 = state reader + CLI; does NOT reimplement `/gsd-resume-work`.
- [auto] D-09: `node:fs` + `node:path` only — fresh clone compatible by design.
- [auto] D-10: `tests/handoff.test.mjs` with fixture-based tests for all error paths.
- [auto] D-11: `HandoffError` with `code` property for distinguishable error types.

</auto_log>
