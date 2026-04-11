---
phase: 05
plan: 01
subsystem: cli-routing
tags:
  - notebooklm
  - cli
  - routing
  - tdd
dependency_graph:
  requires:
    - lib/notebooklm-sync.mjs (Phase 4 syncVault)
    - lib/notebooklm-manifest.mjs (Phase 3 readManifest)
    - lib/notebooklm.mjs (Phase 2 error classes)
    - lib/projects.mjs (findVault)
    - lib/shared.mjs (c, ok, fail, warn, info, hasCommand)
  provides:
    - lib/notebooklm-cli.mjs::main(args) — CLI dispatcher for notebooklm subcommands
    - bin/cli.mjs case 'notebooklm' routing
    - bin/cli.mjs printHelp() NotebookLM Sync section
  affects:
    - bin/cli.mjs (extended, not replaced)
    - tests/cli.test.mjs (extended with 8 new dispatch tests)
    - tests/project-setup.test.mjs (extended with 2 TEST-02 smoke tests)
tech_stack:
  added: []
  patterns:
    - Lazy dynamic import dispatch pattern (matches existing mcp/projects/skills cases)
    - manifest-file-existence check before readManifest to detect fresh vault
    - truncateReason() 200-char cap for T-05-01 info-disclosure mitigation
key_files:
  created:
    - lib/notebooklm-cli.mjs
    - tests/notebooklm-cli.test.mjs
  modified:
    - bin/cli.mjs
    - tests/cli.test.mjs
    - tests/project-setup.test.mjs
decisions:
  - "D-01 semantic drift resolved: CLI dispatcher lives in lib/notebooklm-cli.mjs, not lib/notebooklm.mjs (Phase 2 purity preserved)"
  - "Fresh vault detection uses existsSync('.notebooklm-sync.json') before readManifest — emptyManifest() always returns generated_at=NOW so cannot be used as sentinel"
  - "case 'notebooklm' inserted after case 'mcp' (line 134), before Templates — matches research finding #6 insertion point"
metrics:
  duration: "~30 minutes"
  completed: "2026-04-11"
  tasks: 3
  files: 5
  tests_before: 183
  tests_after: 207
  tests_added: 24
---

# Phase 5 Plan 01: CLI Integration — notebooklm Dispatcher Summary

One-liner: `claude-dev-stack notebooklm sync|status` CLI surface wired via lib/notebooklm-cli.mjs dispatcher with fresh-vault safety and 24 new tests.

## What Was Built

- **`lib/notebooklm-cli.mjs`** (224 lines): Exports `main(args)` dispatching to `runSync` / `runStatus` / `printNotebooklmHelp`. Key behaviors:
  - `runSync`: calls `syncVault({ vaultRoot })` inline, prints per-error lines (truncated to 200 chars per T-05-01), summary line, handles `NotebooklmNotInstalledError` with install hint, `NotebooklmRateLimitError` with warning + throw
  - `runStatus`: detects fresh vault via `existsSync('.notebooklm-sync.json')` before calling `readManifest`, calls `syncVault({ dryRun: true })` for stale counts, prints 3-4 line summary; fresh vault exits 0 with "Last sync: never"
  - `printNotebooklmHelp`: shows sync/status subcommand reference
  - `truncateReason()`: caps error output at 200 chars (T-05-01 security mitigation)

- **`bin/cli.mjs`** (+10 lines):
  - `case 'notebooklm':` at line 134 — lazy import + `main(args.slice(1))`
  - `printHelp()` extended with "NotebookLM Sync" section after Analytics

- **`tests/notebooklm-cli.test.mjs`** (294 lines, 14 tests): unit tests for all dispatch paths, runStatus fresh/populated vault, runSync error paths
- **`tests/cli.test.mjs`** (+91 lines, 8 new tests): dispatch routing tests + NBLM-25 help text + research-finding-#6 collision guard
- **`tests/project-setup.test.mjs`** (+42 lines, 2 new tests): TEST-02 smoke test via `execFileSync` with `VAULT_PATH` env override

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for notebooklm-cli | bfeadab | tests/notebooklm-cli.test.mjs |
| 1 (GREEN) | Create lib/notebooklm-cli.mjs | 547a8fd | lib/notebooklm-cli.mjs, tests/notebooklm-cli.test.mjs |
| 2 (RED) | Failing CLI dispatch + help tests | 3b80e40 | tests/cli.test.mjs |
| 2 (GREEN) | Wire bin/cli.mjs routing + help | 7b0f1b8 | bin/cli.mjs, tests/cli.test.mjs |
| 3 | TEST-02 smoke test (fresh vault) | 05088e8 | tests/project-setup.test.mjs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fresh vault detection via file existence check**
- **Found during:** Task 1 implementation
- **Issue:** Plan's runStatus template used `manifest.generated_at` as sentinel for "fresh vault". However `readManifest()` calls `emptyManifest()` on missing file, which always sets `generated_at = new Date().toISOString()`. A fresh vault would incorrectly show "Last sync: just now".
- **Fix:** Added `existsSync(join(vaultRoot, '.notebooklm-sync.json'))` check before `readManifest`. If file doesn't exist, `lastSync = null` → "Last sync: never" branch taken correctly.
- **Files modified:** lib/notebooklm-cli.mjs
- **Commit:** 547a8fd

**2. [Rule 1 - Bug] Duplicate import in test file**
- **Found during:** Task 1 test write
- **Issue:** Added `writeFileSync` import via separate line after initial Write, leaving duplicate `node:fs` import.
- **Fix:** Merged into single destructured import line.
- **Files modified:** tests/notebooklm-cli.test.mjs
- **Commit:** 547a8fd

**3. [Rule 1 - Bug] "7 days ago" test used writeManifest which overwrites generated_at**
- **Found during:** Task 1 test run (1 failure after GREEN)
- **Issue:** `writeManifest()` always sets `generated_at = new Date().toISOString()` on write (Phase 3 D-03). Test expected to set a 7-days-ago timestamp via writeManifest — impossible.
- **Fix:** Write manifest JSON directly via `writeFileSync` with explicit `generated_at` value, bypassing `writeManifest`.
- **Files modified:** tests/notebooklm-cli.test.mjs
- **Commit:** 547a8fd

## Known Stubs

None. All implemented functions are fully wired to live Phase 4 syncVault.

## Threat Flags

None. No new network endpoints, auth paths, or trust-boundary-crossing file access introduced beyond what the plan documented in its threat model.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| lib/notebooklm-cli.mjs exists | FOUND |
| tests/notebooklm-cli.test.mjs exists | FOUND |
| 05-01-SUMMARY.md exists | FOUND |
| case 'notebooklm' in bin/cli.mjs | 1 occurrence |
| case 'status' in bin/cli.mjs | 1 occurrence (analytics, untouched) |
| NOTEBOOKLM_API_KEY in lib/notebooklm-cli.mjs | 0 occurrences |
| npm test | 207 tests, 0 failures |
| Commits bfeadab, 547a8fd, 3b80e40, 7b0f1b8, 05088e8 | All present |
| Phase 2/3/4 files unchanged | git diff empty |
