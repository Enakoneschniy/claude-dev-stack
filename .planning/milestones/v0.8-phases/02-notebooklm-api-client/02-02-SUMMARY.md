---
phase: 02-notebooklm-api-client
plan: "02"
subsystem: notebooklm-cli-wrapper
tags:
  - notebooklm
  - cli-wrapper
  - public-api
  - json-normalization
  - integration-tests
dependency_graph:
  requires:
    - lib/notebooklm.mjs (runNotebooklm helper + error classes from Plan 02-01)
    - tests/fixtures/notebooklm-stub.sh (parameterized bash stub from Plan 02-01)
    - tests/notebooklm.test.mjs (PATH-injection harness from Plan 02-01)
  provides:
    - lib/notebooklm.mjs (6 exported public async functions — Phase 4's contract)
    - tests/notebooklm.test.mjs (28 notebooklm tests, 96 total suite)
    - .planning/PROJECT.md (updated system dependency wording)
  affects:
    - Phase 4 (sync pipeline consumes createNotebook, listSources, uploadSource, deleteSource, deleteSourceByTitle, updateSource)
    - Phase 5 (doctor + wizard integration builds on the typed error surface)
tech_stack:
  added: []
  patterns:
    - public-async-function-over-private-sync-helper (async wrapper over spawnSync for forward-compatible signatures)
    - text-mode-parse pattern for CLI commands without --json support (deleteSource, deleteSourceByTitle)
    - delete-then-upload orchestration with documented partial-failure semantics
    - stub-driven unit testing via NOTEBOOKLM_STUB_* env vars + stub() helper function
key_files:
  created: []
  modified:
    - lib/notebooklm.mjs (extended with 6 public async functions + path import, 295→506 lines)
    - tests/notebooklm.test.mjs (extended with 8 describe blocks + stub helper, 113→330 lines)
    - .planning/PROJECT.md (system dependency bullet updated to match plan-specified exact wording)
decisions:
  - "uploadSource extracts from parsed.source.id (nested shape) not parsed.source_id (flat shape from SKILL.md) — research-corrected per 02-RESEARCH.md §uploadSource"
  - "deleteSource and deleteSourceByTitle use jsonMode:false — no --json support in notebooklm-py v0.3.4 for delete commands"
  - "updateSource orchestrates via await deleteSource() then await uploadSource() at public API level — no internal runNotebooklm duplication"
  - "updateSource happy-path not unit-tested (stateless stub cannot differentiate two sequential calls) — covered by Manual-Only Verifications in 02-VALIDATION.md"
  - "stub() helper function added to test file for cleaner per-test env var setup"
  - "PROJECT.md system dep entry already existed from pivot commit; updated wording to match plan's exact text"
metrics:
  duration: ~15min
  completed_date: "2026-04-10"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 3
---

# Phase 2 Plan 02: NotebookLM Public API Functions Summary

**One-liner:** 6 exported async functions (`createNotebook`, `listSources`, `uploadSource`, `deleteSource`, `deleteSourceByTitle`, `updateSource`) with research-corrected JSON shapes, text-mode delete parsing, delete-then-upload orchestration, and 22 new stub-driven tests bringing the suite to 96 passing.

---

## What Was Built

### Files Modified

**`lib/notebooklm.mjs`** (extended from 295 to 506 lines)

Added `import { resolve as resolvePath } from 'path'` and 6 exported public async functions:

1. **`createNotebook(name)`** — `['create', name, '--json']`, jsonMode:true, validates `parsed.notebook.{id,title}`, returns `{ id, title }`
2. **`listSources(notebookId)`** — `['source', 'list', '-n', notebookId, '--json']`, jsonMode:true, validates `parsed.sources` is array, maps each to `{ id, title, status }` (strips index/type/url/status_id/created_at)
3. **`uploadSource(notebookId, filepath)`** — resolves filepath via `resolvePath()`, `['source', 'add', absolutePath, '-n', notebookId, '--json']`, jsonMode:true, validates `parsed.source.{id,title}`, returns `{ sourceId: parsed.source.id, title: parsed.source.title }` (corrects SKILL.md flat-shape documentation)
4. **`deleteSource(notebookId, sourceId)`** — `['source', 'delete', sourceId, '-n', notebookId, '-y']`, jsonMode:**false**, parses `"Deleted source: <id>"` from stdout via `/^Deleted source:\s*(\S+)/m`, returns `{ deleted: true, sourceId }`
5. **`deleteSourceByTitle(notebookId, title)`** — `['source', 'delete-by-title', title, '-n', notebookId, '-y']`, jsonMode:**false**, same text-parse pattern, returns `{ deleted: true, sourceId }`
6. **`updateSource(notebookId, sourceId, filepath)`** — `await deleteSource(notebookId, sourceId)` then `await uploadSource(notebookId, filepath)`, returns uploadSource shape; jsdoc documents partial-failure semantics

All 6 functions:
- Validate inputs with `TypeError` for missing/empty strings
- Pass explicit `-n <notebookId>` in argv (parallel safety — never rely on `notebooklm use` implicit context)
- Route through private `runNotebooklm` helper (no direct `spawnSync` outside the helper)

**`tests/notebooklm.test.mjs`** (extended from 113 to 330 lines)

Added `readFileSync` to imports. Added `stub()` helper and 8 new describe blocks:

| Describe block | Tests |
|---------------|-------|
| `createNotebook` | 3 (success, missing notebook field, empty name TypeError) |
| `listSources` | 4 (normalized array, empty notebook with benign WARNING stderr, bad sources, empty id TypeError) |
| `uploadSource` | 3 (corrected nested .source shape, flat shape rejection, empty filepath TypeError) |
| `deleteSource` | 2 (text parse success, unexpected format throws) |
| `deleteSourceByTitle` | 2 (text parse success, empty title TypeError) |
| `updateSource` | 2 (delete failure propagation, empty filepath TypeError) |
| `error propagation through runNotebooklm` | 4 (generic error, JSON RATE_LIMITED, text-mode rate limit, rawOutput on parse fail) |
| `lib/notebooklm.mjs — static invariants` | 2 (single-dep package.json, no credential refs) |

**Total: 22 new `it` blocks** (6 existing from Plan 02-01 = 28 total in notebooklm.test.mjs; 96 full suite)

**`.planning/PROJECT.md`**

System dependency bullet (line 86) updated to match plan-specified exact wording: explicitly states `notebooklm-py >= 0.3.4` must be on PATH as `notebooklm`, pipx (primary) and pip --user (fallback) install paths, feature-scoped (non-NotebookLM features need no Python), auth delegation (never reads NOTEBOOKLM_API_KEY), ADR-0001 reference.

---

## Requirements Fulfilled

| Requirement | Status | Notes |
|-------------|--------|-------|
| NBLM-01 | Done | All 6 functions exported; each wraps runNotebooklm; returns documented shape or throws typed error |
| NBLM-02 | Done (from 02-01, preserved) | Lazy detection + NotebooklmNotInstalledError propagates through all public functions |
| NBLM-03 | Done | package.json unchanged; system dep documented in PROJECT.md |
| NBLM-04 | Done | Non-zero exit propagates as NotebooklmCliError through all 6 functions (via runNotebooklm) |
| NBLM-05 | Done | Rate-limit detection propagates through all 6 functions (JSON path + stderr regex) |
| NBLM-06 | Done | tests/notebooklm.test.mjs covers all 6 functions + 4 error scenarios via stub |
| TEST-01 | Done | 96 tests passing, 0 failing |

---

## Security Invariants Verified

| Invariant | Check | Result |
|-----------|-------|--------|
| No credentials in module | grep NOTEBOOKLM_API_KEY\|storage_state\|notebooklm login | 0 matches |
| No shell: true | grep in lib/notebooklm.mjs | 0 matches |
| spawnSync argv form | runNotebooklm uses array args, no string interpolation | Confirmed |
| Explicit -n flag in all notebook-scoped functions | grep -c "'-n', notebookId" | 4 (listSources, uploadSource, deleteSource, deleteSourceByTitle) |
| uploadSource uses path.resolve | resolvePath(filepath) before argv construction | Confirmed (T-02-10) |
| package.json single-dep | grep '"prompts"' package.json | 1 match only |

---

## Test Count Delta

| Stage | Count |
|-------|-------|
| Baseline (after Plan 02-01) | 74 |
| After Plan 02-02 Task 2 | 96 |
| Delta | +22 |

All 96 tests pass (`npm test` exit 0).

---

## Deviations from Plan

### Claude's Discretion Calls

1. **PROJECT.md system dep entry already existed** — The entry was added during the Phase 2 pivot commit (`e6c21b7`) as documented in STATE.md. Task 3 updated the wording to exactly match the plan-specified text rather than being a true insertion. Noted in summary; no plan deviation.

2. **`stub()` helper placed before first describe block** — The plan's action block shows it after the closing `});` of the invariants describe. Placed before all describe blocks instead, so it's available to all test blocks including the static invariants block. No behavior change.

3. **Static invariants describe named `lib/notebooklm.mjs — static invariants`** — The plan specifies `lib/notebooklm.mjs — invariants` but the file already had `lib/notebooklm.mjs — error classes and invariants`. Used `static invariants` to distinguish from the existing block. No behavior change.

None of the above required architectural decisions (Rule 4). All auto-resolved per Rules 1-3.

---

## Phase 2 Completion

With Plan 02-02 shipped, Phase 2 is now fully complete:

- Plan 02-01 (scaffold): error classes, `runNotebooklm` helper, fake binary stub, 6 invariant tests
- Plan 02-02 (public API): 6 exported functions, 22 new tests, PROJECT.md docs

Phase 4 (sync pipeline) can now import:
```javascript
import {
  createNotebook, listSources, uploadSource,
  deleteSource, deleteSourceByTitle, updateSource
} from './lib/notebooklm.mjs';
```

---

## Known Stubs

None — all 6 functions are fully implemented and return real normalized data from the CLI. No placeholder values or hardcoded empty returns in the public API path.

---

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns introduced beyond what was planned. `uploadSource`'s `path.resolve()` call is the T-02-10 mitigation (already in threat model).

---

## Self-Check: PASSED

- `lib/notebooklm.mjs` exists and has 506 lines: CONFIRMED
- `tests/notebooklm.test.mjs` exists and has 330 lines: CONFIRMED
- `.planning/PROJECT.md` contains notebooklm-py: CONFIRMED (5 occurrences)
- Commits: e2db626, ea6c689, b5d5c3f
- `npm test`: 96 pass, 0 fail
- `grep -c "^export async function" lib/notebooklm.mjs`: 6
- `grep -c "'-n', notebookId" lib/notebooklm.mjs`: 4
- `grep -c "jsonMode: false" lib/notebooklm.mjs`: 2
- Credentials grep: 0 matches
- `grep -c '"prompts"' package.json`: 1
