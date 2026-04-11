---
phase: 05
plan: 02
subsystem: session-lifecycle-hooks
tags:
  - notebooklm
  - hooks
  - session-lifecycle
  - background-sync
  - tdd
dependency_graph:
  requires:
    - lib/notebooklm-sync.mjs (Phase 4 syncVault)
    - lib/notebooklm.mjs (Phase 2 error classes)
    - hooks/update-context.mjs (Phase 1 architectural template)
    - hooks/session-end-check.sh (Phase 1 hook — extended)
    - tests/fixtures/notebooklm-sync-stub.sh (Phase 4 stub — extended)
  provides:
    - hooks/notebooklm-sync-trigger.mjs — fire-and-forget launcher (detached spawn + exit 0)
    - hooks/notebooklm-sync-runner.mjs — detached subprocess (auth + syncVault + log)
    - hooks/session-end-check.sh D-07 ordering (context-update -> trigger -> vault push)
  affects:
    - hooks/session-end-check.sh (3-line trigger block inserted)
    - tests/hooks.test.mjs (+16 new tests, 27 total hook tests)
    - tests/fixtures/notebooklm-sync-stub.sh (auth check mode added)
tech_stack:
  added: []
  patterns:
    - Detached spawn pattern (R5): spawn + .unref() + logFd for non-blocking background process
    - D-14 log format: ISO timestamp [level] message key=val (plain text, append-only)
    - Module-scope crash handler pattern: uncaughtException + unhandledRejection before main()
    - TDD RED/GREEN per task
key_files:
  created:
    - hooks/notebooklm-sync-trigger.mjs
    - hooks/notebooklm-sync-runner.mjs
  modified:
    - hooks/session-end-check.sh
    - tests/hooks.test.mjs
    - tests/fixtures/notebooklm-sync-stub.sh
decisions:
  - "trigger uses inline hasCommandInline() instead of importing lib/shared.mjs — keeps startup fast and self-contained (no lib/* imports)"
  - "runner uses module-scope VAULT_ROOT/LOG_PATH constants so uncaughtException handler can access log path before main() runs"
  - "test for trigger invocation line searches for node+$TRIGGER pattern (not literal trigger filename) — hook uses variable to avoid repetition"
  - "clearLog() replaced with writeFileSync reset (no require/dynamic import) for ESM compatibility"
metrics:
  duration: "~45 minutes"
  completed: "2026-04-11"
  tasks: 3
  files: 5
  tests_before: 207
  tests_after: 223
  tests_added: 16
---

# Phase 5 Plan 02: Session-End Trigger + Runner Summary

One-liner: Fire-and-forget NotebookLM sync wired into session-end hook via detached trigger+runner pair with D-14 log and 16 new integration tests.

## What Was Built

- **`hooks/notebooklm-sync-trigger.mjs`** (90 lines): Fire-and-forget launcher.
  - `hasCommandInline('notebooklm')` — synchronous binary check (no lib imports).
  - Validates `VAULT_PATH` exists; exits 0 silently on any skip condition (binary absent, vault absent, runner absent).
  - Opens log file fd with `openSync(logPath, 'a')` for integer-fd stdio inheritance.
  - `spawn(process.execPath, [runnerPath], { detached: true, stdio: ['ignore', outFd, outFd], env })` + `.unref()` + `process.exit(0)`.
  - Entire `main()` wrapped in try/catch — any crash exits 0 (NBLM-23).

- **`hooks/notebooklm-sync-runner.mjs`** (130 lines): Detached subprocess.
  - Module-scope `VAULT_ROOT` and `LOG_PATH` constants — accessible in crash handlers.
  - `uncaughtException` and `unhandledRejection` handlers installed before `main()` runs.
  - Auth check via `spawnSync('notebooklm', ['auth', 'check'], { stdio: ['ignore', 'pipe', 'pipe'] })`.
  - On auth fail: logs `sync skipped reason=auth-check-failed`, exits 0.
  - `syncVault({ vaultRoot: VAULT_ROOT, notebookName })` with full instanceof error branching.
  - `appendLogLine(level, message, kv)` helper composing D-14 format; try/catch prevents log-write failures from propagating.
  - `truncate(s, 200)` clips error messages (T-05-10 info-disclosure mitigation).
  - Exit 0 on every code path. Zero `throw` statements that escape.

- **`hooks/session-end-check.sh`** (+9 lines):
  - `SCRIPT_DIR` assignment lifted to top of `if ls *.md` branch (Option A).
  - Trigger block inserted after `update-context.mjs` call, before `if [ -d "$VAULT/.git" ]` vault push block (D-07 ordering).
  - Invocation: `VAULT_PATH="$VAULT" node "$TRIGGER" 2>/dev/null || true`.

- **`tests/fixtures/notebooklm-sync-stub.sh`** (+13 lines):
  - Auth check mode: `if [ "$CMD" = "auth" ] && [ "$SUB" = "check" ]` branch at top of dispatch.
  - Controlled by `NOTEBOOKLM_SYNC_STUB_AUTH_EXIT` (default 0 = success).
  - Additive — all Phase 4 stub behavior preserved.

- **`tests/hooks.test.mjs`** (+16 new tests, 27 total):
  - `notebooklm-sync-trigger`: 4 tests — binary absent exits 0, wall-clock <1000ms, vault absent exits 0, file exists.
  - `notebooklm-sync-runner`: 6 tests — auth success path, auth fail path, vault missing, append behavior, D-14 format, exit 0 always.
  - `session-end-check.sh — notebooklm trigger wiring`: 5 tests — D-07 source ordering, suffix assertion, bash -n syntax, graceful skip, invocation count.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED+GREEN) | trigger + stub auth mode + trigger tests | 6da6192 | hooks/notebooklm-sync-trigger.mjs, tests/fixtures/notebooklm-sync-stub.sh, tests/hooks.test.mjs |
| 2 (RED+GREEN) | runner + runner tests | f131b1e | hooks/notebooklm-sync-runner.mjs, tests/hooks.test.mjs |
| 3 (RED+GREEN) | hook wiring + ordering tests | c97ff5b | hooks/session-end-check.sh, tests/hooks.test.mjs |

## Wall-Clock Measurement

Trigger exit time verified by test: `spawnSync` with stub runner that sleeps 10 seconds, elapsed < 1000ms. Test passes consistently — detached spawn + unref + exit 0 pattern works as documented in research §R5.

## Log Format Stability (for Plan 05-03 doctor)

D-14 format is stable: `{ISO} [level] message key=val ...`

All log lines written by `appendLogLine()` match: `/^\d{4}-\d{2}-\d{2}T[\d:.]+Z \[(info|warn|error)\] /`

Key entry types Plan 05-03 doctor may parse:
- `sync done uploaded=N skipped=M failed=K duration=Tms` — last sync timestamp from ISO prefix
- `sync skipped reason=auth-check-failed` — feature not configured
- `sync skipped reason=vault-not-found` — vault missing
- `sync rate-limited` — throttled
- `error` level entries — unexpected failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESM incompatibility in test file (require() + dynamic import)**
- **Found during:** Task 2 test write
- **Issue:** Initial test draft used `require('fs').writeFileSync` and `await import('node:fs')` for log reset, which are invalid in ESM modules.
- **Fix:** Replaced `clearLog()` helper with `writeLogReset()` using synchronous `writeFileSync` (already imported at top of file).
- **Files modified:** tests/hooks.test.mjs
- **Commit:** f131b1e

**2. [Rule 1 - Bug] Test searched for literal trigger filename in node invocation line**
- **Found during:** Task 3 test run (1 failure)
- **Issue:** Hook uses `TRIGGER="$SCRIPT_DIR/notebooklm-sync-trigger.mjs"` then `node "$TRIGGER"` — the invocation line does not contain the literal filename. Test searched for `notebooklm-sync-trigger.mjs` on the node line.
- **Fix:** Updated test to search for `node` + `$TRIGGER` pattern, which is the actual invocation line.
- **Files modified:** tests/hooks.test.mjs
- **Commit:** c97ff5b

## Known Stubs

None. All implemented functions are fully wired to live Phase 4 syncVault.

## Threat Flags

None. No new network endpoints or auth paths introduced. Runner log append is bounded (200-char truncation per T-05-10). Log file is local append-only (`~/vault/.notebooklm-sync.log`).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| hooks/notebooklm-sync-trigger.mjs exists | FOUND |
| hooks/notebooklm-sync-runner.mjs exists | FOUND |
| trigger shebang `#!/usr/bin/env node` | PASS |
| runner shebang `#!/usr/bin/env node` | PASS |
| detached: true in trigger | 1 occurrence |
| .unref() in trigger | 1 occurrence |
| stdio: ['ignore' in trigger | 2 occurrences |
| process.exit(0) in trigger (≥3) | 5 occurrences |
| process.exit([1-9]) in trigger | 0 |
| lib/ imports in trigger | 0 |
| notebooklm-sync.mjs import in runner | 1 occurrence |
| uncaughtException in runner | 1 handler |
| unhandledRejection in runner | 1 handler |
| throw statements in runner | 0 |
| error classes (instanceof) in runner | 6 references |
| appendFileSync in runner | 2 occurrences |
| notebooklm-sync-trigger.mjs in hook | 1 occurrence |
| 2>/dev/null \|\| true in hook | 3 occurrences |
| bash -n session-end-check.sh | PASS |
| auth in stub fixture | 3 occurrences |
| NOTEBOOKLM_SYNC_STUB_AUTH_EXIT in stub | 2 occurrences |
| package.json prompts count | 1 (unchanged) |
| npm test | 223 tests, 0 failures |
| Commits 6da6192, f131b1e, c97ff5b | All present |
| Scope-bound files (notebooklm.mjs, notebooklm-sync.mjs, notebooklm-manifest.mjs, bin/install.mjs, doctor.mjs) | Unchanged |
