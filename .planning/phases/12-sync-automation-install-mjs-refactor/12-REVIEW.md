---
phase: 12-sync-automation-install-mjs-refactor
reviewed: 2026-04-13T12:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - bin/install.mjs
  - lib/install/claude-md.mjs
  - lib/install/components.mjs
  - lib/install/git-conventions.mjs
  - lib/install/gsd.mjs
  - lib/install/hooks.mjs
  - lib/install/notebooklm.mjs
  - lib/install/plugins.mjs
  - lib/install/prereqs.mjs
  - lib/install/profile.mjs
  - lib/install/projects.mjs
  - lib/install/skills.mjs
  - lib/install/summary.mjs
  - lib/install/vault.mjs
  - tests/install.test.mjs
  - tests/sync-automation.test.mjs
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-13T12:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The install.mjs refactor decomposes a monolithic wizard into 13 focused modules under `lib/install/`. The decomposition is clean, with each module owning a single wizard step. Test coverage uses structural (grep-based) assertions and importability smoke tests. Two test files cover sync automation and install modules.

Key concerns: one command injection vector in `skills.mjs`, several missing null/undefined guards on prompt results that could crash the wizard, and a dead variable in `plugins.mjs`. Overall code quality is good with consistent patterns across modules.

## Critical Issues

### CR-01: Command injection via unescaped tmpDir in rm -rf

**File:** `lib/install/skills.mjs:98`
**Issue:** The `tmpDir` variable is constructed using `process.pid` which is safe, but the pattern `runCmd(\`rm -rf ${tmpDir}\`)` passes a string directly to a shell. If this pattern were copied to other contexts where the path component is user-controlled, it would be a command injection vector. More importantly, if `process.pid` somehow returns an unexpected value or the template is modified, `rm -rf` with shell interpolation is dangerous. Use `rmSync` from `fs` instead.
**Fix:**
```javascript
import { existsSync, cpSync, readdirSync, rmSync } from 'fs';
// ...
// line 98: replace runCmd(`rm -rf ${tmpDir}`) with:
rmSync(tmpDir, { recursive: true, force: true });
```

## Warnings

### WR-01: Unguarded prompt result — `ready` can be undefined on Ctrl+C

**File:** `bin/install.mjs:29`
**Issue:** When the user presses Ctrl+C during the `prompt()` call, the `prompts` library returns an empty object `{}`. Destructuring `{ ready }` yields `undefined`, and the `if (!ready)` guard does handle this. However, on line 69, `{ setupSync }` from prompt has the same pattern but `setupSync` being `undefined` falls through to the `else` branch safely. The real risk is on line 80: `{ remoteUrl }` will be `undefined` on Ctrl+C, but `if (remoteUrl)` guards it. All prompt results in `bin/install.mjs` happen to be safe by coincidence (falsy defaults), but this is fragile. Consider a centralized Ctrl+C handler.
**Fix:** Add at the top of `main()`:
```javascript
process.on('SIGINT', () => {
  console.log(`\n  ${c.dim}Cancelled. No changes made.${c.reset}\n`);
  process.exit(0);
});
```

### WR-02: stepNum counter can desync from totalSteps

**File:** `bin/install.mjs:39-64`
**Issue:** `totalSteps` is computed as `setupSteps + installCount + 2`, but `stepNum` is incremented independently for each conditional component. The `+2` accounts for git-conventions and claude-md steps (lines 63-64), but `installSessionHook` on line 65 receives `undefined` for stepNum/totalSteps. If a new optional step is added, the counter easily desyncs. The `installSessionHook(undefined, undefined, PKG_ROOT)` call on line 65 means the hook step has no progress indicator at all.
**Fix:** Either pass `stepNum++` and `totalSteps` to `installSessionHook`, or document that hooks are intentionally silent. Also consider building the step sequence as an array to avoid manual counting.

### WR-03: Unused tmpFile variable in loadPluginData

**File:** `lib/install/plugins.mjs:13`
**Issue:** `tmpFile` is declared on line 13 but never used for writing in the initial `spawnSync` call. It is only used in the fallback `catch` block (line 26). However, the fallback writes to `tmpFile` via a shell redirect but never cleans it up. The temp file `/tmp/claude-plugins-{pid}.json` persists after the wizard finishes.
**Fix:** Add cleanup after the fallback:
```javascript
try {
  const content = readFileSync(tmpFile, 'utf8');
  try { unlinkSync(tmpFile); } catch {}
  return JSON.parse(content);
} catch {
  try { unlinkSync(tmpFile); } catch {}
  return null;
}
```

### WR-04: Missing await on installGitConventions return value check

**File:** `bin/install.mjs:63`
**Issue:** `installGitConventions` is an `async` function but its return value is not checked or used. While `await` is correctly used, the function always returns `true` even on errors (it just calls `continue` for individual project failures). This means the wizard cannot report git-conventions failures in the summary. The `installed`/`failed` arrays on lines 49-50 never include git-conventions results.
**Fix:** Track git-conventions results in the installed/failed arrays, or at minimum document the intentional omission.

### WR-05: --break-system-packages in Deep Research pyyaml install

**File:** `lib/install/skills.mjs:95`
**Issue:** The `runCmd` call uses `--break-system-packages` flag for pip3 install of pyyaml. On managed Python environments (e.g., Debian 12+, Ubuntu 23.04+), this bypasses the externally-managed check. While this is a fallback with `|| pip install pyyaml`, it could corrupt a user's system Python packages. The notebooklm module correctly avoids this pattern (verified by test on line 96-108 of install.test.mjs), but skills.mjs still uses it.
**Fix:** Use `pipx` or `python3 -m pip install --user pyyaml` as the primary method, consistent with the notebooklm approach:
```javascript
runCmd('python3 -m pip install --user pyyaml 2>/dev/null || pip3 install pyyaml 2>/dev/null || pip install pyyaml 2>/dev/null');
```

## Info

### IN-01: Empty catch blocks for chmodSync

**File:** `lib/install/hooks.mjs:34,44,57,79`
**Issue:** Four `try { chmodSync(...) } catch {}` blocks silently swallow errors. While chmod failures on non-Unix platforms are expected, logging a debug message would aid troubleshooting.
**Fix:** Add `warn` call in catch: `catch (e) { /* chmod not supported on this platform */ }`

### IN-02: Hardcoded step number in selectComponents and getVaultPath

**File:** `lib/install/components.mjs:8`, `lib/install/vault.mjs:10`
**Issue:** `step(4, totalSteps, ...)` and `step(6, totalSteps, ...)` use hardcoded step numbers. If the wizard step order changes, these will show wrong progress indicators. Other modules receive `stepNum` as a parameter.
**Fix:** Pass `stepNum` as a parameter instead of hardcoding, consistent with other modules.

### IN-03: Magic string '...' for earlyTotal

**File:** `bin/install.mjs:32`
**Issue:** `earlyTotal` is set to the string `'...'` and passed to `checkPrerequisites`, `collectProfile`, and `collectComponents`. This is displayed in the step counter as "Step N/..." which is intentional UX (total unknown until component selection), but the magic string is undocumented.
**Fix:** Add a comment: `// Total unknown until component selection; display as "N/..." in step headers`

### IN-04: Re-export of installNotebookLM from bin/install.mjs

**File:** `bin/install.mjs:98`
**Issue:** `export { installNotebookLM } from '../lib/install/notebooklm.mjs'` is a re-export from the bin entry point. This is unusual for a bin file (which is an executable, not a library). It appears to exist for backward compatibility or test convenience.
**Fix:** Consider moving this re-export to a dedicated barrel file if other consumers need it, or document why the bin file re-exports a library function.

---

_Reviewed: 2026-04-13T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
