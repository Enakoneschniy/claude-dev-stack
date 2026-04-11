---
phase: quick-260411-sg2
plan: 01
subsystem: notebooklm
tags: [hotfix, v0.8.1, notebooklm, uploadSource, cp-to-tmp]
requires:
  - lib/notebooklm.mjs (uploadSource Phase 2 scaffold)
  - lib/notebooklm-sync.mjs (syncOneFile Phase 4 orchestration)
  - tests/fixtures/notebooklm-stub.sh (Phase 2 argv-blind stub)
provides:
  - "uploadSource(notebookId, filepath, { title }) that materializes the title as a temp-file basename"
  - "syncOneFile passing fileEntry.title to uploadSource at both call sites"
  - "NOTEBOOKLM_STUB_ARGV_LOG env-driven argv capture for the test stub"
  - "package.json version 0.8.1"
affects:
  - lib/notebooklm.mjs
  - lib/notebooklm-sync.mjs
  - tests/fixtures/notebooklm-stub.sh
  - tests/notebooklm.test.mjs
  - package.json
tech-stack:
  added: []
  patterns:
    - "cp-to-tmp workaround: mkdtempSync + copyFileSync + finally rmSync to control notebooklm-py source titles"
    - "env-driven argv capture: stub appends $3 to NOTEBOOKLM_STUB_ARGV_LOG file when the var is set, unchanged behavior otherwise"
key-files:
  created: []
  modified:
    - lib/notebooklm.mjs (lines 23-27 imports, 383-436 uploadSource body)
    - lib/notebooklm-sync.mjs (line 267 session branch, line 323 non-session branch)
    - tests/fixtures/notebooklm-stub.sh (argv-log block added after existing env-var wiring)
    - tests/notebooklm.test.mjs (imports extended, beforeEach cleared new var, 4 new it() blocks in uploadSource describe)
    - package.json (version 0.8.0 → 0.8.1)
decisions:
  - "cp-to-tmp workaround is the only viable path — notebooklm-py v0.3.4 ignores --title for file uploads and uses the basename of the uploaded file as the source title (verified manually on real notebook 2026-04-11)"
  - "Backward compatibility preserved: uploadSource without options behaves byte-for-byte identically to v0.8.0. The existing 3 uploadSource tests at lines 197-221 continue to pass without modification."
  - "The finally block cleans up the temp dir even when runNotebooklm throws, preventing /tmp leaks on rate-limit or upload failure"
  - "The stub's argv log file lives OUTSIDE the upload tmpDir in a dedicated mkdtemp path — otherwise the log file would be swept away by uploadSource's finally-block rmSync before the test can read it"
  - "updateSource line 505 was deliberately NOT changed — it calls uploadSource without title, preserving its existing v0.8.0 behavior. updateSource is currently uncalled by syncOneFile and out of scope for this hotfix."
metrics:
  duration: "~25 minutes (sequential inline execution)"
  completed: "2026-04-11"
  tests_before: 243
  tests_after: 247
  test_delta: "+4 new (no regressions)"
  commits: 3
---

# Quick 260411-sg2: v0.8.1 Hotfix — uploadSource Title via cp-to-tmp Summary

Hotfix for v0.8.0 regression where uploaded NotebookLM sources had raw basenames as titles, breaking `{project}__` query filtering, replace-by-filename semantics, and creating duplicates in multi-project vaults. Patches `uploadSource` to accept `{ title }` and materialize it as a temp-file basename via the verified cp-to-tmp workaround; wires `syncOneFile` to pass `fileEntry.title`.

## Commits

| # | Hash      | Type | Subject                                                                   |
|---|-----------|------|---------------------------------------------------------------------------|
| 1 | `8dbceaf` | fix  | fix(notebooklm): uploadSource respects { title } via cp-to-tmp workaround |
| 2 | `2148066` | test | test(notebooklm): add uploadSource title-via-cp-to-tmp coverage           |
| 3 | `5d3a1fa` | chore | chore: bump version to 0.8.1 (uploadSource title hotfix)                 |

## Files Changed

| File                                 | Change                                                                                                 |
|--------------------------------------|--------------------------------------------------------------------------------------------------------|
| `lib/notebooklm.mjs`                 | Imports extended (+`join`, +`mkdtempSync`/`copyFileSync`/`rmSync` from `node:fs`, +`tmpdir` from `node:os`). `uploadSource` signature gains `options = {}`. New TypeError guard for `options.title`. Body wraps `runNotebooklm` in try/finally with cp-to-tmp when `options.title` is set. |
| `lib/notebooklm-sync.mjs`            | `syncOneFile` now passes `{ title }` to `uploadSource` at both call sites (line 267 session branch, line 323 non-session branch). |
| `tests/fixtures/notebooklm-stub.sh`  | New `ARGV_LOG` env-var driven block: when `NOTEBOOKLM_STUB_ARGV_LOG` is set, appends `$3` to the log file. Existing tests unaffected. |
| `tests/notebooklm.test.mjs`          | Imports extended with `mkdtempSync`/`writeFileSync`. `beforeEach` clears `NOTEBOOKLM_STUB_ARGV_LOG`. 4 new `it()` blocks inside `describe('uploadSource')`. |
| `package.json`                       | Version `0.8.0` → `0.8.1`. No other changes.                                                           |

## Test Count

- **Before:** 243 tests (v0.8.0 shipped baseline)
- **After:** 247 tests (+4 new uploadSource coverage)
- **Regressions:** 0

### New tests (all inside `describe('uploadSource')`)

1. `passes title via temp file when { title } option is provided (cp-to-tmp workaround)` — asserts stub received `<tmpDir>/<title>`, parent dir matches `/cds-nblm-/`, and the tmpDir is removed after the call returns (cleanup verified via `existsSync === false`).
2. `passes raw filepath when no { title } option is provided (backward compat)` — asserts the original resolved path is propagated verbatim.
3. `throws TypeError when { title } is empty string` — empty string is invalid.
4. `throws TypeError when { title } is non-string` — number 42 is invalid.

## Backward Compatibility Verification

The existing 3 uploadSource tests at `tests/notebooklm.test.mjs` lines 197-221 (returns-shape happy path, missing-source-key error, empty-filepath TypeError) continue to pass **without modification**. The new backward-compat test #2 additionally asserts the CLI receives the original absolute resolved path when no `{ title }` option is provided — byte-for-byte equivalent to v0.8.0.

## Key Implementation Detail: Log File Lives Outside the Upload tmpDir

The `uploadSource` cleanup happens in a `finally` block — the temp directory created for the title workaround is removed **before** the function returns. If the test's argv log file lived inside the upload tmpDir, the rmSync would sweep it away before the test could read it.

Solution: the test creates **two separate** mkdtemp directories:
- `cds-uploadsource-test-*` for the source file (workDir)
- `cds-test-argvlog-*` for the argv log file (argvLogDir)

The stub writes the log to `argvLogDir/argv.log`, which is untouched by `uploadSource`'s finally-block cleanup. The test then extracts the upload tmpDir path from the log line's `dirname` and asserts it no longer exists, verifying cleanup.

## Deviations from Plan

**None.** All 3 tasks executed exactly as specified:
- Task 1 actions 1-7 applied verbatim to `lib/notebooklm.mjs` and `lib/notebooklm-sync.mjs`.
- Task 2 actions 1-6 applied verbatim to `tests/fixtures/notebooklm-stub.sh` and `tests/notebooklm.test.mjs`. The separate-argv-log-dir pattern was pre-specified in the execution constraints and matched the plan's `<behavior>` requirement that the test observe cleanup.
- Task 3 bumped version 0.8.0 → 0.8.1, no other package.json changes.

## Success Criteria Checklist

- [x] `lib/notebooklm.mjs::uploadSource` accepts optional `{ title }` and uses cp-to-tmp when present
- [x] `lib/notebooklm.mjs::uploadSource` without options is byte-for-byte equivalent to v0.8.0
- [x] `lib/notebooklm-sync.mjs::syncOneFile` passes `{ title }` at both call sites
- [x] Temp dir removed in `finally` block (verified via test)
- [x] `tests/fixtures/notebooklm-stub.sh` supports `NOTEBOOKLM_STUB_ARGV_LOG` mode
- [x] `tests/notebooklm.test.mjs` has 4 new tests covering title-via-cp-to-tmp + backward compat + TypeError validation
- [x] All 243 existing tests still pass; total now 247
- [x] `package.json` version === `0.8.1`
- [x] No new dependencies added (single-dep `{"prompts": "^2.4.2"}` constraint preserved)
- [x] Three commits authored, none containing `Co-Authored-By` (CLAUDE.md rule)
- [x] Commit messages follow conventional commits: `fix(notebooklm): ...`, `test(notebooklm): ...`, `chore: ...`

## Manual Post-Merge Steps (Left for User)

These are out of scope for this execution — the user handles them after merging the hotfix branch:

1. **Integration test on real notebook** (not in CI — CI has no NotebookLM auth):
   - Delete the 26 incorrectly-titled sources from the shared notebook via `notebooklm source list --json` + `notebooklm source delete`.
   - Delete `~/vault/.notebooklm-sync.json` manifest to force a full re-sync.
   - Run `claude-dev-stack notebooklm sync` and verify titles via `notebooklm source list -n <id> --json` — all sources should now have `{project}__` prefixes.
2. **PR creation** — `gh pr create` from `fix/v0.8.1-upload-title` targeting `main`.
3. **CI verification** — wait for the Node 18/20/22 matrix to go green on the PR.
4. **Merge to main** — squash or merge commit per project preference.
5. **GitHub Release v0.8.1** — create a release with notes describing the fix; this triggers the `publish.yml` OIDC workflow.
6. **Update v0.8.0 release notes** — add a "Fixed in v0.8.1" callout pointing users to upgrade.

## Self-Check: PASSED

- `lib/notebooklm.mjs` — FOUND, modified (uploadSource rewrite + new imports)
- `lib/notebooklm-sync.mjs` — FOUND, modified (2 call sites)
- `tests/fixtures/notebooklm-stub.sh` — FOUND, modified (ARGV_LOG block)
- `tests/notebooklm.test.mjs` — FOUND, modified (imports + beforeEach + 4 new its)
- `package.json` — FOUND, modified (version 0.8.1)
- Commit `8dbceaf` (fix) — FOUND in git log
- Commit `2148066` (test) — FOUND in git log
- Commit `5d3a1fa` (chore) — FOUND in git log
- `npm test` — 247 passing, 0 failing, 0 skipped
