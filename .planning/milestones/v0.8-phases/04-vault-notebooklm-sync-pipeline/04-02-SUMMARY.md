---
phase: 04
plan: 02
subsystem: vault-sync
tags:
  - notebooklm
  - vault-sync
  - orchestration
  - manifest
dependency_graph:
  requires:
    - 04-01 (listNotebooks, notebooklm-sync.mjs scaffold, argv-aware stub, buildTitle)
    - Phase 3 (notebooklm-manifest.mjs: hashFile, readManifest, writeManifest)
    - Phase 2 (notebooklm.mjs: uploadSource, deleteSourceByTitle, createNotebook, NotebooklmRateLimitError)
  provides:
    - lib/notebooklm-sync.mjs::syncVault (full orchestration)
    - lib/notebooklm-sync.mjs::walkProjectFiles (private, _walkProjectFiles test hook)
    - lib/notebooklm-sync.mjs::ensureNotebook (private, _ensureNotebook test hook)
    - lib/notebooklm-sync.mjs::syncOneFile (private, _syncOneFile test hook)
  affects:
    - Phase 5 consumers of syncVault black-box API
tech_stack:
  added: []
  patterns:
    - TDD (RED-GREEN per task: tests written before implementation)
    - per-file atomic manifest write via writeManifest (D-14)
    - test hooks with _ prefix and @internal docstring (mirrors _resetBinaryCache pattern)
    - argv-aware bash stub for multi-call sync testing
key_files:
  created: []
  modified:
    - lib/notebooklm-sync.mjs
    - tests/notebooklm-sync.test.mjs
    - .planning/phases/04-vault-notebooklm-sync-pipeline/04-VALIDATION.md
decisions:
  - D-11 walk order (context first, then decisions, docs, sessions) enforced in walkProjectFiles
  - D-12 sessions presence-check (not hash) implemented in syncOneFile
  - D-13 non-sessions hash-delta + delete-then-upload implemented in syncOneFile
  - D-08 rate-limit abort: NotebooklmRateLimitError rethrown at all 5 try/catch sites
  - D-07 per-file failure: NotebooklmCliError collected in stats.errors[], sync continues
  - D-09 ensureNotebook: strict === equality, throw on >=2 matches (research finding #3)
  - D-20 dryRun: all API calls bypassed, stats.planned[] populated instead
  - D-14 crash-resilience: writeManifest called after each successful upload
  - Research finding #2: NotebooklmCliError from deleteSourceByTitle swallowed (not-found semantics)
metrics:
  duration: ~45 minutes
  completed: 2026-04-11
  tasks_completed: 4
  tasks_total: 4
  files_modified: 3
  tests_added: 32
  tests_total: 183
---

# Phase 4 Plan 2: Vault Sync Orchestration — Implementation Summary

**One-liner:** Full syncVault orchestration replacing Plan 04-01 stubs — walker with D-11 ordering, ensureNotebook with strict-equality + multi-match throw, syncOneFile with D-12/D-13 semantics, rate-limit abort, per-file manifest writes, and 32 new tests covering all 5 ROADMAP SCs and NBLM-07..13.

---

## What Was Built

### lib/notebooklm-sync.mjs (466 lines, up from 201)

Four stub bodies replaced with real implementations:

**walkProjectFiles(vaultRoot)** — walks `vault/projects/*/` in exact D-11 order per project (context.md → decisions/*.md → docs/*.md → sessions/*.md), projects sorted alphabetically. Excludes `_template`, never descends into `shared/` or `meta/`, filters to `.md` only, warns+skips ADR regex mismatches, emits POSIX-slashed `vaultRelativePath` via `path.relative + split(sep).join('/')` (research Option B).

**ensureNotebook(notebookName)** — calls `listNotebooks()`, filters by strict `title === notebookName` equality. Zero matches → `createNotebook`. One match → return `id`. Two+ matches → throw `NotebooklmCliError` with "multiple notebooks found" message (T-04-09 mitigation, research finding #3).

**syncOneFile({fileEntry, vaultRoot, notebookId, manifest, stats, dryRun})** — branches on category:
- Sessions (D-12): manifest presence check only. Skip if entry exists. Upload + record if absent.
- Non-sessions (D-13): `hashFile` compare. Skip on hash match. Delete-then-upload on mismatch or missing.
- `deleteSourceByTitle` errors: swallow `NotebooklmCliError` (research finding #2), rethrow `NotebooklmRateLimitError`.
- Upload errors: `NotebooklmRateLimitError` rethrown; `NotebooklmCliError` collected in `stats.errors[]` (D-07).
- Per-file `writeManifest` after each successful upload (D-14 crash-resilience).
- dryRun: pushes `{action, file, title}` to `stats.planned[]`, no API calls.

**syncVault(opts)** — full orchestration:
1. Resolve vaultRoot (passedVaultRoot ?? findVault()), throw `Error('Vault not found')` if missing.
2. Resolve notebookName (opts → env `NOTEBOOKLM_NOTEBOOK_NAME` → `'claude-dev-stack-vault'`).
3. dryRun=false: `ensureNotebook` → cache `notebookId`; rate-limit here aborts with `stats.rateLimited=true`.
4. `walkProjectFiles` → `readManifest` → iterate files via `syncOneFile`.
5. `NotebooklmRateLimitError` in loop sets `stats.rateLimited=true` and breaks.
6. Returns D-16-shaped stats; removes `planned` field when not dryRun.

Three `@internal` test hooks exported: `_walkProjectFiles`, `_ensureNotebook`, `_syncOneFile`.

### tests/notebooklm-sync.test.mjs (761 lines, up from 160)

**32 new tests in 3 new describe blocks:**

Walker (8): D-11 order single project, cross-project alphabetical, NBLM-11 shared/meta skipped, non-.md ignored, ADR regex mismatch warn+skip, _template excluded, optional category dirs, POSIX slash assertion.

ensureNotebook (4): existing notebook returns id, zero matches creates, multi-match throws with "multiple notebooks found", strict equality not prefix match.

syncOneFile (8): session first-time upload, session already-in-manifest skip, non-session unchanged hash skip, non-session changed hash delete+upload, new non-session file upload-only, deleteSourceByTitle CliError swallow, deleteSourceByTitle rate-limit rethrow, uploadSource CliError collected in stats.

syncVault integration (12): first run 6 files 2 projects (SC1), second run skips all (SC1), edited ADR replace-by-filename (SC2), shared/meta absent from manifest (SC3), notebook auto-created (SC4), notebook reused on second run (SC4), NOTEBOOKLM_NOTEBOOK_NAME env override (NBLM-13), rate-limit abort stats.rateLimited=true, dryRun planned[] populated, vault-not-found throws, D-16 stats shape validated, durationMs non-negative.

---

## Tasks Executed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | walkProjectFiles + 8 walker tests | e4a14b3 | lib/notebooklm-sync.mjs, tests/notebooklm-sync.test.mjs |
| 2 | ensureNotebook + syncOneFile + 12 unit tests + syncVault scaffold body | 85b664d | lib/notebooklm-sync.mjs, tests/notebooklm-sync.test.mjs |
| 3 | 12 syncVault integration tests | e21fd23 | tests/notebooklm-sync.test.mjs |
| 4 | 04-VALIDATION.md rows flipped to green | 6dd53fb | .planning/phases/04-vault-notebooklm-sync-pipeline/04-VALIDATION.md |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scaffold test expected "not yet implemented" throw — now invalid**
- **Found during:** Task 2 (syncVault body replaced)
- **Issue:** Plan 04-01 added a test `'syncVault scaffold marker throws orchestration-not-implemented when vault IS valid'` that asserted the scaffold throw. Once Plan 04-02 replaced the body, this test became a false-positive blocker.
- **Fix:** Replaced that test with `'syncVault is an async function (replaced scaffold, now real implementation)'` — a lightweight structural assertion that stays valid for the full implementation.
- **Files modified:** tests/notebooklm-sync.test.mjs
- **Commit:** 85b664d

**2. [Rule 3 - Blocking] `statSync` import referenced in scaffold marker but unused after Task 1**
- **Found during:** Task 1 (import cleanup)
- **Issue:** The scaffold body used `statSync` inside `_scaffoldMarker` to keep it "referenced" for lint. After walkProjectFiles was implemented without statSync, the import became genuinely unused and would cause issues.
- **Fix:** Removed `statSync` from the `node:fs` import line.
- **Files modified:** lib/notebooklm-sync.mjs
- **Commit:** e4a14b3

---

## ROADMAP Phase 4 Success Criteria Status

| SC | Description | Status |
|----|-------------|--------|
| SC1 | Fresh vault 2+ projects → correct {project}__ naming all 4 categories | SATISFIED (integration test: "first run uploads all 6 files") |
| SC2 | Re-run after editing ADR → replace not duplicate | SATISFIED (integration test: "edited ADR → replace-by-filename") |
| SC3 | shared/ and meta/ absent from notebook after sync | SATISFIED (integration test: "shared/ and meta/ files are never uploaded") |
| SC4 | Notebook auto-created first run, reused second | SATISFIED (integration tests: auto-create + reuse) |
| SC5 | No duplicated slug-generation code path | SATISFIED (walker uses dir name directly via D-17; no re-sanitization) |

---

## Known Stubs

None — all stub bodies from Plan 04-01 have been replaced with real implementations. `syncVault` returns real stats, `walkProjectFiles` emits real file entries, `ensureNotebook` calls real listNotebooks/createNotebook, `syncOneFile` performs real hash comparison and API calls.

---

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond what was in the Plan 04-02 threat model.

---

## Self-Check

Checking claims before finalizing...

- [x] FOUND: lib/notebooklm-sync.mjs
- [x] FOUND: tests/notebooklm-sync.test.mjs
- [x] FOUND: 04-02-SUMMARY.md
- [x] FOUND: commits e4a14b3, 85b664d, e21fd23, 6dd53fb
- [x] npm test: 183 tests, 183 pass, 0 fail

## Self-Check: PASSED
