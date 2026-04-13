---
phase: 12-sync-automation-install-mjs-refactor
fixed_at: 2026-04-13T12:15:00Z
review_path: .planning/phases/12-sync-automation-install-mjs-refactor/12-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-04-13T12:15:00Z
**Source review:** .planning/phases/12-sync-automation-install-mjs-refactor/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Command injection via unescaped tmpDir in rm -rf

**Files modified:** `lib/install/skills.mjs`
**Commit:** 832abc4
**Applied fix:** Replaced `runCmd(\`rm -rf ${tmpDir}\`)` with `rmSync(tmpDir, { recursive: true, force: true })` from `fs` module. Added `rmSync` to the import statement.

### WR-05: --break-system-packages in Deep Research pyyaml install

**Files modified:** `lib/install/skills.mjs`
**Commit:** 832abc4
**Applied fix:** Replaced `pip3 install pyyaml --break-system-packages` with `python3 -m pip install --user pyyaml` as primary method, falling back to `pip3` and `pip` without the dangerous flag.

### WR-01: Unguarded prompt result -- ready can be undefined on Ctrl+C

**Files modified:** `bin/install.mjs`
**Commit:** 618e2c9
**Applied fix:** Added `process.on('SIGINT', ...)` handler at the top of `main()` that prints a cancellation message and exits cleanly with code 0.

### WR-03: Unused tmpFile variable in loadPluginData

**Files modified:** `lib/install/plugins.mjs`
**Commit:** 0d2c9af
**Applied fix:** Added `unlinkSync` import and cleanup calls after temp file read (both success and error paths) to prevent `/tmp/claude-plugins-*.json` from persisting.

### WR-02: stepNum counter can desync from totalSteps

**Files modified:** `bin/install.mjs`
**Commit:** 4081b30
**Applied fix:** Changed `generateClaudeMD` and `installSessionHook` calls to pass and increment `stepNum` properly instead of passing `undefined`. All three post-component steps now correctly participate in the step counter.

### WR-04: Missing await on installGitConventions return value check

**Files modified:** `bin/install.mjs`
**Commit:** 4081b30
**Applied fix:** Captured `installGitConventions` return value and added result to `installed`/`failed` arrays so git-conventions status appears in the wizard summary.

---

_Fixed: 2026-04-13T12:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
