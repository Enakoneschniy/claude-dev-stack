---
phase: 02-notebooklm-api-client
plan: "01"
subsystem: notebooklm-cli-wrapper
tags:
  - notebooklm
  - cli-wrapper
  - errors
  - test-fixture
  - binary-detection
dependency_graph:
  requires:
    - lib/shared.mjs (hasCommand)
  provides:
    - lib/notebooklm.mjs (error classes + runNotebooklm helper + _resetBinaryCache)
    - tests/fixtures/notebooklm-stub.sh (parameterized fake binary)
    - tests/notebooklm.test.mjs (PATH injection harness + 6 invariant tests)
  affects:
    - plan 02-02 (consumes all three artifacts above)
tech_stack:
  added: []
  patterns:
    - fake-binary PATH injection test fixture pattern
    - lazy binary detection with cache reset hook
    - dual-mode spawnSync helper (jsonMode boolean)
    - subclass error hierarchy for instanceof discrimination
key_files:
  created:
    - lib/notebooklm.mjs
    - tests/fixtures/notebooklm-stub.sh
    - tests/notebooklm.test.mjs
  modified: []
decisions:
  - "D-04/D-05: lazy detection — importing module never spawns subprocess; _ensureBinary called only at first public function invocation"
  - "D-06: NotebooklmNotInstalledError.message includes both pipx and pip --user install hints"
  - "D-07: _resetBinaryCache export chosen over dynamic-import-per-test for test ergonomics"
  - "D-08: runNotebooklm is module-private (not exported); Plan 02-02 public functions call it via closure"
  - "D-10: rawOutput set only on JSON parse failure to avoid leaking auth-adjacent diagnostic text in default logging"
  - "D-11/D-12: dual-path rate-limit detection — JSON code===RATE_LIMITED for JSON-mode; RATE_LIMIT_PATTERNS regex scan on stderr for text-mode"
  - "D-13: ENOENT race guard — secondary NotebooklmNotInstalledError if binary disappears between lazy check and spawnSync"
  - "D-14: stdio:['ignore','pipe','pipe'] — no stdin inheritance to prevent prompt leakage"
metrics:
  duration: ~10min
  completed_date: "2026-04-10"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 2 Plan 01: NotebookLM Scaffold — Error Classes, Helper, Test Fixture Summary

**One-liner:** Typed error hierarchy (`NotebooklmCliError -> NotebooklmRateLimitError`, standalone `NotebooklmNotInstalledError`), dual-mode `runNotebooklm` private helper with `spawnSync` argv-array invocation and two-path rate-limit detection, lazy binary detection with `_resetBinaryCache` test hook, parameterized bash stub, and 6-test invariant harness with PATH injection.

---

## What Was Built

### Files Created

**`lib/notebooklm.mjs`** (294 lines)
- Module-level jsdoc documenting ADR-0001 auth delegation (no credentials ever stored/read)
- Three error classes:
  - `NotebooklmCliError extends Error` — generic CLI failure with `.command`, `.exitCode`, `.stderr`, optional `.rawOutput`
  - `NotebooklmRateLimitError extends NotebooklmCliError` — rate-limit subclass adding `.matchedPattern` for retry logic
  - `NotebooklmNotInstalledError extends Error` — installation-state failure (NOT a subclass of `NotebooklmCliError`) with install hints
- `RATE_LIMIT_PATTERNS` — `Object.freeze([...])` array of 5 RegExp patterns for stderr scanning
- `_ensureBinary(functionName)` — private lazy detection via `hasCommand('notebooklm')`, cached in module-scoped booleans
- `export function _resetBinaryCache()` — test hook to invalidate cache after PATH mutation
- `function runNotebooklm(args, { jsonMode = true, functionName = 'notebooklm' } = {})` — private helper:
  - Calls `_ensureBinary` first
  - `spawnSync('notebooklm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })` — argv array form, no shell
  - ENOENT race guard -> `NotebooklmNotInstalledError`
  - Exit 0 + jsonMode: parses stdout JSON, checks `error.code === 'RATE_LIMITED'` -> `NotebooklmRateLimitError`; other error codes -> `NotebooklmCliError`; parse failure -> `NotebooklmCliError` with `.rawOutput`
  - Exit 0 + text mode: returns `{ stdout, stderr }` trimmed
  - Non-zero exit + jsonMode: tries stdout JSON parse first for structured error JSON
  - Non-zero exit (both modes): scans stderr via `RATE_LIMIT_PATTERNS` -> `NotebooklmRateLimitError` with `.matchedPattern`
  - Non-zero exit + no pattern match -> generic `NotebooklmCliError`

**`tests/fixtures/notebooklm-stub.sh`** (25 lines, mode 0755)
- Parameterized bash stub driven by `NOTEBOOKLM_STUB_STDOUT`, `NOTEBOOKLM_STUB_STDERR`, `NOTEBOOKLM_STUB_EXIT` env vars
- Ignores argv entirely — test scenarios encoded in env vars
- Empty env vars produce no output on that stream; default exit is 0

**`tests/notebooklm.test.mjs`** (113 lines)
- `before()`: creates PID-scoped temp dir, copies stub as `notebooklm`, `chmodSync(0o755)`, prepends dir to `process.env.PATH`, then dynamic-imports `lib/notebooklm.mjs`
- `beforeEach()`: clears stub env vars, calls `nblm._resetBinaryCache()`
- `after()`: restores original PATH, rmSync temp dir
- `describe('lib/notebooklm.mjs — error classes and invariants')` with 6 `it` blocks (Plan 02-02 extends this file)

---

## Decisions Encoded

| Decision | Encoded Where |
|----------|---------------|
| D-04: module import is side-effect-free | `_binaryChecked` starts false; hasCommand called only via `_ensureBinary` |
| D-05: lazy detection on first call | `_ensureBinary` called at top of `runNotebooklm` |
| D-06: dual install hint in error message | `NotebooklmNotInstalledError` super() message |
| D-07: _resetBinaryCache over dynamic import | Named export `_resetBinaryCache`, called in `beforeEach()` |
| D-08: runNotebooklm is private | `function runNotebooklm` — no `export` keyword |
| D-10: rawOutput only on parse failure | `rawOutput: stdout` added only inside catch block |
| D-11: JSON-mode rate-limit via code check | `if (code === 'RATE_LIMITED')` branches in runNotebooklm |
| D-12: text-mode rate-limit via regex scan | `for (const pattern of RATE_LIMIT_PATTERNS)` loop |
| D-13: ENOENT race guard | `if (result.error && result.error.code === 'ENOENT')` |
| D-14: stdin isolation | `stdio: ['ignore', 'pipe', 'pipe']` |

---

## Requirements Fulfilled

| Requirement | Status | Notes |
|-------------|--------|-------|
| NBLM-02 (scaffold) | Done | Lazy detection + NotebooklmNotInstalledError with install hint + _resetBinaryCache hook |
| NBLM-03 | Done | package.json dependencies unchanged — exactly `{prompts: ^2.4.2}` |
| NBLM-04 (helper portion) | Done | runNotebooklm captures non-zero exit -> NotebooklmCliError with command/exitCode/stderr |
| NBLM-05 (helper portion) | Done | Dual-path rate-limit detection: JSON code + stderr regex; NotebooklmRateLimitError with matchedPattern |
| TEST-01 (scaffold) | Done | tests/notebooklm.test.mjs with PATH injection harness + 6 passing invariant tests |

---

## Security Invariants Verified

| Invariant | Check | Result |
|-----------|-------|--------|
| No credentials in module | grep for API key / storage state / login subcommand | 0 matches |
| No shell: true | grep in lib/notebooklm.mjs | 0 matches |
| runNotebooklm not exported | grep for export keyword on function | 0 matches |
| Public functions absent | grep for createNotebook/listSources/etc. | 0 matches |
| spawnSync argv form | literal binary name, array arg | Confirmed |
| stdio stdin ignored | `stdio: ['ignore', 'pipe', 'pipe']` | Confirmed |

---

## Test Count Delta

| Stage | Count |
|-------|-------|
| Baseline (end of Phase 1) | 68 |
| After Plan 02-01 Task 3 | 74 |
| Delta | +6 |

All 74 tests pass (`npm test` exit 0).

The 6 public functions (`createNotebook`, `listSources`, `uploadSource`, `deleteSource`, `deleteSourceByTitle`, `updateSource`) are NOT yet implemented — that is Plan 02-02's scope.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Removed credential-specific strings from jsdoc to satisfy grep invariant**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** The plan's copy-paste jsdoc comment included specific credential-related strings (API key env var name, storage state filename, auth subcommand) as examples of what the module does NOT do. The acceptance criteria grep returned 2 (in comment lines), contradicting the requirement of 0 matches.
- **Fix:** Rephrased jsdoc to use generic descriptions ("API keys", "credential storage files", "auth subcommands") — equivalent meaning, no grep false-positives.
- **Files modified:** `lib/notebooklm.mjs`
- **Commit:** `ef52063`

### Claude's Discretion Calls

1. **Both Tasks 1 and 2 written in a single file write** — since both tasks modify the same file and the complete content was provided in the plan, writing the full file once was more efficient than doing an intermediate commit with a half-complete file. Two separate commits were made with appropriate messages reflecting the logical split.
2. **_resetBinaryCache chosen over dynamic import** (D-07 confirmed) — implemented as a named export called in `beforeEach()`.
3. **Single parameterized bash stub** driven by env vars rather than per-scenario stubs — the plan's stub design was followed exactly.
4. **Error classes inline in lib/notebooklm.mjs** — file is 294 lines including runNotebooklm. Clean and readable within a single module.

---

## Contract Delivered to Plan 02-02

Plan 02-02 can implement the 6 public functions by:
1. Adding them to the same `lib/notebooklm.mjs` file — `runNotebooklm` is accessible via closure
2. Calling `runNotebooklm(args, { jsonMode: true/false, functionName: 'functionName' })`
3. Normalizing the return value per shapes documented in 02-RESEARCH.md
4. Extending `tests/notebooklm.test.mjs` with new `it` blocks that set stub env vars and call public functions

Helper signature:
```
runNotebooklm(args, { jsonMode = true, functionName = 'notebooklm' } = {})
Returns: jsonMode=true -> parsed JSON; jsonMode=false -> { stdout, stderr }
Throws: NotebooklmNotInstalledError | NotebooklmRateLimitError | NotebooklmCliError
```

---

## Self-Check: PASSED

- `lib/notebooklm.mjs` exists: FOUND
- `tests/fixtures/notebooklm-stub.sh` exists + executable: FOUND
- `tests/notebooklm.test.mjs` exists: FOUND
- Commits: 9b2d89e, e88c122, ae52fd1, ef52063
- `npm test`: 74 pass, 0 fail
- Credentials grep: 0
- Public functions absent: confirmed
