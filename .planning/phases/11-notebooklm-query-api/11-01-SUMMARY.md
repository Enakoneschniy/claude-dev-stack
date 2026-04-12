---
phase: 11-notebooklm-query-api
plan: "01"
subsystem: notebooklm
tags: [notebooklm, query-api, askNotebook, generateArtifact, tdd]
dependency_graph:
  requires: []
  provides: [askNotebook, generateArtifact, BINARY_ARTIFACT_TYPES]
  affects: [lib/notebooklm.mjs, tests/notebooklm.test.mjs]
tech_stack:
  added: []
  patterns:
    - "runNotebooklm() reuse for new public functions — same spawnSync wrapper, no new invocation machinery"
    - "_runFn injection for two-step test isolation (generate + download mocking)"
    - "NOTEBOOKLM_STUB_ARGV_LOG_MODE=all for full argv logging in stub"
key_files:
  created: []
  modified:
    - lib/notebooklm.mjs
    - tests/notebooklm.test.mjs
    - tests/fixtures/notebooklm-stub.sh
decisions:
  - "sourceTitle: null in citations — NOT in ask output per RESEARCH.md; v1 omits enrichment pass"
  - "question passed as last positional arg (after all flags) per CLI spec Pitfall 6"
  - "generateArtifact delegates retry to notebooklm-py via --retry 2, no wrapper retry (D-12)"
  - "output_path read via readFileSync, not dlResult.content or dlResult.text (research-verified)"
  - "NOTEBOOKLM_STUB_ARGV_LOG_MODE=all added to stub for flag-ordering tests without breaking existing uploadSource tests"
metrics:
  duration_seconds: 261
  completed_date: "2026-04-12"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
  tests_added: 15
  test_baseline: 406
  test_final: 435
---

# Phase 11 Plan 01: askNotebook + generateArtifact library functions

**One-liner:** `askNotebook()` and `generateArtifact()` added to `lib/notebooklm.mjs` — wraps `notebooklm ask --json` with 2x rate-limit retry, and `notebooklm generate --wait --retry 2 --json` with two-step text download via `output_path` file read.

## What Was Built

Two new exported async functions in `lib/notebooklm.mjs`:

**`askNotebook(notebookId, question, options)`**
- Wraps `notebooklm ask -n {id} --json [--source ...] {question}`
- Returns `{answer: string, citations: [{index, sourceId, sourceTitle: null, snippet}]}`
- Question always last positional arg (after all flags), per CLI spec
- Retries 2x on `NotebooklmRateLimitError` with 1s→2s exponential backoff
- Non-rate-limit errors thrown immediately
- JSDoc documents best-effort fresh conversation (no `--conversation-id`)

**`generateArtifact(notebookId, type, options)`**
- Wraps `notebooklm generate {type} -n {id} --wait --retry 2 --json`
- Returns `{artifactId, content, type}` — content is text for text types, null for binary
- Two-step for text types: generate then `notebooklm download {type} --json --latest`, reads content from the FILE at `dlResult.output_path` (not inline JSON)
- Binary types (audio, video, cinematic-video, slide-deck, infographic) skip download step
- `options._runFn` injection for test isolation without real CLI

**Also exported:** `BINARY_ARTIFACT_TYPES` Set for use by CLI layer (Plan 02)

**Stub extended:** `NOTEBOOKLM_STUB_ARGV_LOG_MODE=all` added so tests can verify full argv ordering without breaking existing uploadSource tests (which rely on default `arg3` mode logging only `$3`).

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add askNotebook() with tests (TDD) | 2d169f5 | lib/notebooklm.mjs, tests/notebooklm.test.mjs, tests/fixtures/notebooklm-stub.sh |
| 2 | Add generateArtifact() with tests (TDD) | 5dc116d | lib/notebooklm.mjs, tests/notebooklm.test.mjs |

## Decisions Made

- **sourceTitle: null** — `notebooklm ask --json` output does not include source title in citation references (per RESEARCH.md); set to null in v1; enrichment via `listSources()` is deferred
- **question positional last** — CLI spec Pitfall 6: question must be last argv element to prevent misparse as a flag value
- **retry delegation** — `generateArtifact` passes `--retry 2` to notebooklm-py; no wrapper retry needed (D-12). `askNotebook` implements its own retry loop (D-11) since notebooklm-py ask has no built-in retry flag
- **output_path file read** — `notebooklm download` writes content to a FILE on disk and returns JSON with `output_path`; it does NOT return content inline. Verified from Python source (research finding)
- **_runFn injection** — avoids two-stub-invocation problem for generate+download tests; no production code path ever passes `_runFn`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Stub ARGV_LOG_MODE for full argv logging**
- **Found during:** Task 1 — `--source` flag test needed full argv visibility
- **Issue:** Existing stub only logged `$3` (uploadSource file path); no way to verify all args
- **Fix:** Added `NOTEBOOKLM_STUB_ARGV_LOG_MODE` env var to stub — `all` logs full `$*`, default `arg3` preserves existing behavior
- **Files modified:** `tests/fixtures/notebooklm-stub.sh`
- **Commit:** 2d169f5

None beyond the above — plan executed as written.

## Known Stubs

None. Both functions are fully implemented with real CLI delegation.

## Threat Flags

None. All T-11-xx mitigations applied:
- T-11-01: question passed as last positional arg to spawnSync array (no shell interpolation)
- T-11-02: errors propagated via typed error classes; lib layer does not print
- T-11-03: `_runFn` test-only, no production code path
- T-11-04: `output_path` file read from mkdtempSync dir, cleanup in finally block

## Self-Check: PASSED

- `lib/notebooklm.mjs` exists and contains both functions ✓
- `tests/notebooklm.test.mjs` contains describe('askNotebook') and describe('generateArtifact') ✓
- Commit 2d169f5 exists ✓
- Commit 5dc116d exists ✓
- All 435 tests pass ✓
