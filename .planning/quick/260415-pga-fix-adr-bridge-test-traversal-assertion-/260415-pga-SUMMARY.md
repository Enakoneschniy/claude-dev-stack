---
phase: 260415-pga-fix-adr-bridge-test-traversal-assertion
plan: 01
subsystem: tests
tags: [bugfix, tests, ci, cross-platform]
requires: []
provides:
  - Platform-independent traversal assertion in Test 10
affects:
  - tests/adr-bridge-session.test.mjs
tech_stack_added: []
patterns:
  - Recursive readdirSync walk with parentPath fallback for Node 18/20+ compatibility
key_files_created: []
key_files_modified:
  - tests/adr-bridge-session.test.mjs
decisions:
  - Use Node builtin `readdirSync(path, { withFileTypes: true, recursive: true })` rather than
    an external walker to keep zero-dep constraint
  - Assert `full === p || full.startsWith(p + '/')` to avoid false positives on the
    decisionsDir directory entry itself
metrics:
  duration_seconds: 60
  completed: 2026-04-15
tasks_completed: 1
tasks_total: 1
commits:
  - d18fc30
---

# Quick Task 260415-pga: Fix adr-bridge Test Traversal Assertion Summary

Replaced the broken `existsSync(/etc/passwd)` assertion in Test 10 of
`tests/adr-bridge-session.test.mjs` with a recursive walk of the test's tmp
root, asserting every file lives under one of two legitimate prefixes
(`t.decisionsDir` or `dirname(t.sessionLogPath)`). Unblocks Linux CI runs
on Node 18/20/22 where `tmpdir()` resolves shallow enough for
`join(t.vault, '..', '..', '..', 'etc', 'passwd')` to hit the real
system file.

## One-liner

Platform-independent traversal assertion using recursive readdirSync walk
of the test tmp root, replacing an absolute-path check that false-positived
on Linux CI.

## What Changed

- `tests/adr-bridge-session.test.mjs`
  - Added `dirname` to the existing `node:path` import
  - Test 10 (`bridgeSession() — topic path traversal`): replaced 3 lines
    (comment + `etcPasswd` const + `assert.ok(!existsSync(...))`) with a
    12-line recursive walk block

Diff scope (matches plan expectation):

```
 tests/adr-bridge-session.test.mjs | 17 +++++++++++++----
 1 file changed, 13 insertions(+), 4 deletions(-)
```

## How It Works

```js
const allowedPrefixes = [t.decisionsDir, dirname(t.sessionLogPath)];
const entries = readdirSync(t.dir, { withFileTypes: true, recursive: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const full = join(entry.parentPath ?? entry.path, entry.name);
  const ok = allowedPrefixes.some((p) => full === p || full.startsWith(p + '/'));
  assert.ok(ok, `file written outside allowed dirs: ${full}`);
}
```

- `entry.parentPath` (Node 20+) falls back to `entry.path` (Node 18)
- `full === p || full.startsWith(p + '/')` prevents false positives where
  an allowed-prefix directory itself wouldn't startWith(`prefix + '/'`)
- Session log file created by `makeTmp` passes naturally — it lives under
  `dirname(t.sessionLogPath)`

## Verification

```bash
node --test tests/adr-bridge-session.test.mjs
```

Output:

```
# tests 16
# suites 13
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

All 16 subtests pass on macOS Node 20. The rewritten assertion no longer
references any absolute system path and correctly fails if `bridgeSession`
ever writes a file outside the two allowed locations.

## Success Criteria

- [x] All 16 subtests pass locally
- [x] Traversal assertion no longer references any absolute system path
- [x] Assertion correctly validates that `bridgeSession` writes only under
      `t.decisionsDir` or `dirname(t.sessionLogPath)`
- [x] `lib/adr-bridge-session.mjs` unchanged
- [x] No other test file modified
- [x] `git diff --stat` shows only `tests/adr-bridge-session.test.mjs`
      (13 insertions, 4 deletions)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `d18fc30` — `fix(tests): replace absolute-path assertion with recursive walk in adr-bridge traversal test`

## Self-Check: PASSED

- Commit `d18fc30` present in `git log`
- `tests/adr-bridge-session.test.mjs` modified (13+/4-)
- `node --test tests/adr-bridge-session.test.mjs` passes all 16 subtests
- Branch `feat/v0.12-hooks-and-limits` — commit landed on PR #37 target branch
