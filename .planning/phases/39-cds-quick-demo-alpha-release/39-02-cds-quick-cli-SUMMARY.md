---
plan_id: 39-02-cds-quick-cli
phase: 39
plan: 02
subsystem: cli
tags: [cds-quick, demo-01, agent-sdk, capture, alpha-release]
dependency_graph:
  requires:
    - phases/39-cds-quick-demo-alpha-release/39-01-bundler-and-distribution
    - phases/34-sdk-integration (dispatchAgent, CostTracker, resolveModel)
    - phases/36-auto-session-capture (session-end-capture.sh hook)
  provides:
    - packages/cds-cli/src/quick.ts (real body)
    - packages/cds-cli/src/capture-standalone.ts
  affects:
    - dist/cli/quick.js (rebundled with real body)
tech_stack:
  added: []
  patterns:
    - vi.hoisted + vi.mock for ESM module mocking
    - child.on('error') for async spawn ENOENT swallow (Node spawn does not throw sync)
    - resolveModel(alias) before CostTracker.record (CostTracker requires full model id)
key_files:
  created:
    - packages/cds-cli/src/capture-standalone.ts
    - packages/cds-cli/src/quick.test.ts
    - packages/cds-cli/src/capture-standalone.test.ts
    - packages/cds-cli/src/quick.integration.test.ts
    - packages/cds-cli/tests/helpers/mock-dispatch-agent.ts
    - packages/cds-cli/tests/helpers/temp-home.ts
    - packages/cds-cli/tests/fixtures/synthetic-transcript-expected.jsonl
  modified:
    - packages/cds-cli/src/quick.ts (overwrites Plan 01 stub + later TS fix)
decisions:
  - "Inline vi.fn() inside vi.hoisted() instead of importing mockDispatchAgent helper — vi.hoisted runs before module imports, so imported helpers are unreferenced at hoist time"
  - "Drop stop_reason from local DispatchResult annotation — @cds/core's actual DispatchResult exposes { output, tokens, cost_usd, toolUses } not stop_reason"
  - "Add child.on('error', ...) listener to capture-standalone — Node spawn() reports missing binaries via async 'error' event, NOT synchronous throw, so try/catch alone leaks ENOENT"
metrics:
  duration: ~12min (inline execution after subagent failure)
  completed: 2026-04-16
  tasks_completed: 7
  files_created: 7
  files_modified: 1 (quick.ts: stub→real + later type fix)
  test_results:
    cds-cli: 96 passed | 2 skipped (98 total)
    plan_01_regression:
      tsup-build: 15 passed
      cli-dispatch: 9 passed
---

# Phase 39 Plan 02: cds-quick CLI Summary

DEMO-01 deliverable: real `/cds-quick` CLI body replacing the Plan 01 stub, plus its
sibling `capture-standalone.ts` helper for triggering Phase 36 session-end-capture
when running outside Claude Code.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Real quick.ts body (overwrite Plan 01 stub) | 6f4be08 | packages/cds-cli/src/quick.ts |
| 2 | capture-standalone.ts helper | 931375c | packages/cds-cli/src/capture-standalone.ts |
| 3 | Test helpers + JSONL fixture | (in 931375c chain) | mock-dispatch-agent.ts, temp-home.ts, synthetic-transcript-expected.jsonl |
| 4 | quick.test.ts unit tests | c8be40c | packages/cds-cli/src/quick.test.ts |
| 5 | capture-standalone.test.ts unit tests | 0bf3f1a | packages/cds-cli/src/capture-standalone.test.ts |
| 6 | quick.integration.test.ts (gated) | 7e4a68f | packages/cds-cli/src/quick.integration.test.ts |
| 7 | Verify tsup rebuild + Plan 01 regression | (verification) | — |
| — | Type-fix bug | 544871f | packages/cds-cli/src/quick.ts |

## Deviations from Plan

### Bug 1 — vi.hoisted cannot reference imports (Plan 02 Task 4)

**Found during:** First `pnpm vitest run src/quick.test.ts`
**Issue:** Plan body called `mockDispatchAgent()` inside `vi.hoisted(() => ...)` but vi.hoisted runs BEFORE ES module imports — so `mockDispatchAgent` was undefined at hoist time. Result: `ReferenceError: Cannot access '__vi_import_0__' before initialization`.
**Fix:** Inlined a minimal `vi.fn(async (_opts) => mockResult)` directly inside vi.hoisted. Same treatment for `mockCapture`. The mock-dispatch-agent helper file remains for use cases where the test file itself doesn't need vi.hoisted (none in this plan, but kept for Plan 04/05 reuse).
**Commit:** c8be40c (initial), then in-place hoist fix.

### Bug 2 — DispatchResult shape mismatch (Plan 02 Task 1, fixed Task 7)

**Found during:** `pnpm --filter @cds/cli exec tsc --noEmit`
**Issue:** Plan body annotated `result` as `{ output, tokens, stop_reason }` but @cds/core's actual `DispatchResult` is `{ output, tokens, cost_usd, toolUses }` — no `stop_reason`. Result: TS2741 missing-property error.
**Fix:** Removed `stop_reason` from the local annotation (it was unused anyway).
**Commit:** 544871f.

### Bug 3 — async spawn ENOENT escapes try/catch (Plan 02 Task 2, fixed Task 7)

**Found during:** `pnpm --filter @cds/cli exec vitest run src/capture-standalone.test.ts`
**Issue:** Node `spawn()` reports missing binaries via async `error` event on the child process, NOT via synchronous throw. The plan's `try { spawn() } catch {}` did not catch the async event → unhandled rejection → test "fail-silent when hook missing" failed.
**Fix:** Added `child.on('error', () => {})` listener BEFORE `child.unref()`. Kept the try/catch for the rare synchronous spawn failure case.
**Commit:** (folded into 931375c after spawn fix).

## Verification

```sh
$ pnpm --filter @cds/cli exec tsc --noEmit
# (clean, exit 0)

$ pnpm --filter @cds/cli exec vitest run
Test Files  12 passed | 1 skipped (13)
     Tests  96 passed | 2 skipped (98)

$ pnpm tsup
DTS dist/cli/quick.d.ts      243.00 B    # bundled

$ grep -c "dispatchAgent\|captureStandalone" dist/cli/quick.js
5    # real body bundled, not stub

$ npx vitest run tests/tsup-build.test.mjs tests/cli-dispatch.test.mjs
Test Files  2 passed (2)
     Tests  24 passed (24)    # Plan 01 regression GREEN
```

## Process Note (Wave 2 Recovery)

This plan was originally spawned as a parallel worktree subagent but blocked silently on
Bash permission in CC 2.1.x (see backlog item 999.2). Files were rescued/rewritten inline
on the main branch. The original quick.ts body from the failed executor was preserved
(it was correct — only the type annotation needed fixing). All other files written from
scratch following the plan body verbatim, with the 3 deviations above auto-fixed.

## Next Up

Wave 3: Plan 04 (migration guide + wizard hardenings).
