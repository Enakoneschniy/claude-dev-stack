# Phase 12: Sync Automation + install.mjs Refactor - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Two independent goals: (1) verify existing sync automation from v0.9 meets SYNC-01 criteria, (2) split `bin/install.mjs` monolith (1471 lines) into focused importable modules under `lib/install/`.

</domain>

<decisions>
## Implementation Decisions

### SYNC-01: Session-end sync automation
- **D-01:** Sync trigger/runner/hook chain already implemented in v0.9 (Phase 9). Phase 12 only needs to **verify** it meets SYNC-01 success criteria — no new implementation expected
- **D-02:** Verification approach: confirm non-blocking behavior, log output to `~/vault/.notebooklm-sync.log`, failure exits 0, no modal prompt. Mark SYNC-01 done if passing

### install.mjs Split Strategy
- **D-03:** Create `lib/install/` directory with one module per wizard section: `{prereqs, profile, projects, components, plugins, vault, gsd, skills, notebooklm, git-conventions, claude-md, hooks, summary}.mjs` — each exports its main function
- **D-04:** Keep `bin/install.mjs` as thin orchestrator (~100 lines max) that imports from `lib/install/*.mjs` and calls them in sequence
- **D-05:** No wizard behavior changes — all existing interactive flows, prompts, and defaults preserved exactly

### Shared Utility Dedup
- **D-06:** Remove all duplicated helpers from install.mjs, import `{c, ok, fail, warn, info, prompt, askPath, runCmd, hasCommand, mkdirp, listDirs}` from `lib/shared.mjs`. Extracted modules also import from shared
- **D-07:** Add `step()` function (progress display) to `lib/shared.mjs` — useful utility, belongs in shared

### Testing
- **D-08:** Unit tests per extracted module in `tests/install/` or `tests/install-*.test.mjs`. Existing `tests/install.test.mjs` updated for new imports. No E2E wizard run needed

### Module Boundaries
- **D-09:** Pass args explicitly — each module function takes what it needs as params and returns results. `main()` in install.mjs threads data through. No shared mutable state object

### Backward Compatibility
- **D-10:** `bin/install.mjs` stays as entry point (package.json bin field). npx users see no change. New `lib/install/*.mjs` files are internal-only

### Claude's Discretion
- Exact function signatures for each extracted module
- Which sections group into same module vs separate files (some small sections may combine)
- Test fixture strategy for wizard module testing
- Whether `getDirSuggestions` moves to shared or stays install-specific

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Install Wizard
- `bin/install.mjs` — Current monolith to refactor (1471 lines, 20+ functions)
- `lib/shared.mjs` — Shared utilities that install.mjs duplicates

### Sync Automation (verification only)
- `hooks/session-end-check.sh` — Session-end hook that triggers sync
- `hooks/notebooklm-sync-trigger.mjs` — Fire-and-forget launcher (89 lines)
- `hooks/notebooklm-sync-runner.mjs` — Detached subprocess (150 lines)
- `lib/notebooklm-sync.mjs` — syncVault() function

### Testing
- `tests/install.test.mjs` — Existing install tests to update

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/shared.mjs` — all utility functions install.mjs needs (c, ok, fail, warn, info, prompt, askPath, runCmd, hasCommand, mkdirp, listDirs)
- `lib/git-scopes.mjs` — already imported by install.mjs for git conventions
- Sync automation chain — fully implemented in v0.9, just needs verification

### Established Patterns
- Each `lib/*.mjs` exports `async function main(args)` for CLI modules
- `lib/shared.mjs` is the canonical source for all shared helpers
- Tests use `node:test` with describe/test/assert pattern

### Integration Points
- `bin/install.mjs` called via `package.json` bin field → `npx claude-dev-stack`
- `lib/install/*.mjs` modules must be importable by both `bin/install.mjs` and tests
- `lib/shared.mjs` must export `step()` function after D-07

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following existing patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-sync-automation-install-mjs-refactor*
*Context gathered: 2026-04-12*
