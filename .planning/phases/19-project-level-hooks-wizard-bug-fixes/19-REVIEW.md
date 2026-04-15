---
phase: 19-project-level-hooks-wizard-bug-fixes
reviewed: 2026-04-14T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - lib/install/hooks.mjs
  - hooks/gsd-auto-reapply-patches.sh
  - tests/install.test.mjs
  - tests/hooks.test.mjs
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-04-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files reviewed: the hooks installation module (`lib/install/hooks.mjs`), the patch-reapply shell script (`hooks/gsd-auto-reapply-patches.sh`), and their corresponding test suites. The core logic is sound and the BUG-01 through BUG-06 fixes are correctly implemented. No critical security issues found. Four warnings were identified — two logic/correctness issues in `hooks.mjs` and two reliability gaps in the shell script. Three informational items cover dead variables, a swallowed error, and a missing test assertion.

## Warnings

### WR-01: `budgetResetDest` path is computed from `homedir()` instead of the already-resolved `hooksDir`

**File:** `lib/install/hooks.mjs:128`

**Issue:** Hook 4 (budget-reset) and Hook 5 (budget-check) build their destination paths by calling `join(homedir(), '.claude', 'hooks', ...)` independently rather than reusing the `hooksDir` variable defined at line 13. If `homedir()` ever returns a different value within the same process (unlikely but not impossible under test harness with mutated `HOME`), or if `hooksDir` is later refactored to point elsewhere, the two paths will silently diverge. The functional test at `install.test.mjs:446` already mutates `process.env.HOME` — if `os.homedir()` is cached by Node internals that test is safe, but this is a latent brittleness.

**Fix:**
```js
// line 128 — replace hard-coded homedir() calls:
const budgetResetDest = join(hooksDir, 'budget-reset.mjs');
// ...
const budgetCheckDest = join(hooksDir, 'budget-check.mjs');
```
`hooksDir` is already `join(homedir(), '.claude', 'hooks')` so this is semantically identical today but renames the coupling to be local rather than global.

---

### WR-02: `chmodSync` error is silently swallowed with an empty `catch {}`

**File:** `lib/install/hooks.mjs:36`

**Issue:** `try { chmodSync(dest, 0o755); } catch {}` silently drops any `chmod` failure (e.g., read-only filesystem, wrong permissions on the hooks directory). A hook script that lacks execute permission will fail at runtime with a cryptic "Permission denied" error that the user cannot trace back to installation. The empty catch gives no signal that this happened.

**Fix:**
```js
try {
  chmodSync(dest, 0o755);
} catch (err) {
  warn(`Could not set executable bit on ${dest}: ${err.message}`);
}
```

---

### WR-03: Unquoted glob expansion in `gsd-auto-reapply-patches.sh` is word-split sensitive

**File:** `hooks/gsd-auto-reapply-patches.sh:38`

**Issue:** Lines 38-43 iterate over `$candidate` with an inner `for expanded in $candidate` loop. The unquoted `$candidate` expansion is subject to word-splitting and glob expansion by the shell. If a path contains spaces (e.g., a user's home directory is `/Users/John Smith`), the loop will misparse the path. The outer candidates at lines 33-36 are hardcoded literals so spaces are unlikely, but path variables (e.g., `HOME`) can legitimately contain spaces on some systems.

**Fix:** Quote the expansion and use a separate glob step, or restrict the space-sensitive path to `"$HOME"` references:
```bash
# For the npm candidate where glob is needed, use find or a safer expansion:
for candidate in \
  "$(npm root -g 2>/dev/null)/claude-dev-stack/patches" \
  "$HOME/.local/share/npm/lib/node_modules/claude-dev-stack/patches"; do
  if [ -d "$candidate" ]; then
    PATCHES_DIR="$candidate"
    break
  fi
done
# Handle npx glob separately with a find command:
if [ -z "$PATCHES_DIR" ]; then
  PATCHES_DIR="$(find "$HOME/.npm/_npx" -type d -name 'patches' -path '*/claude-dev-stack/patches' 2>/dev/null | head -1)"
fi
```

---

### WR-04: `shasum` fallback silently produces empty SHA on systems without `shasum`

**File:** `hooks/gsd-auto-reapply-patches.sh:72-74`

**Issue:** The patch comparison uses `shasum -a 256 ... 2>/dev/null | awk '{print $1}'`. If `shasum` is not present (it is not part of POSIX; on some Linux distros only `sha256sum` is available), the command silently exits with empty output. Both `PATCH_SHA` and `TARGET_SHA` will be empty strings and compare as equal (`"" == ""`), so the patch is never applied even when the files actually differ. This is a silent no-op failure.

**Fix:**
```bash
# Prefer sha256sum, fall back to shasum:
_sha256() { sha256sum "$1" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'; }

PATCH_SHA=$(_sha256 "$PATCH_FILE")
TARGET_SHA=$(_sha256 "$TARGET_FILE")
# Guard: if both are empty, force apply to be safe
if [ -z "$PATCH_SHA" ] || [ -z "$TARGET_SHA" ] || [ "$PATCH_SHA" != "$TARGET_SHA" ]; then
  cp "$PATCH_FILE" "$TARGET_FILE"
  APPLIED=$((APPLIED + 1))
fi
```

---

## Info

### IN-01: `startDest`, `endDest`, `pushDest` variables are computed but only used inside `_writeSettingsFile` indirectly via the fallback branch

**File:** `lib/install/hooks.mjs:26-28`

**Issue:** `startDest`, `endDest`, and `pushDest` are declared at the top of `installSessionHook` and passed into every `_writeSettingsFile` call. The values are always `join(hooksDir, 'session-*.sh')` which `_writeSettingsFile` uses as literal command strings. This is fine, but the variable names suggest they are "destination" paths checked for file existence — they are not (only the `budgetResetDest`/`budgetCheckDest` are existence-checked). A future maintainer might add an `existsSync` guard thinking the pattern is consistent, which would silently skip hooks on a fresh install before the copy loop. A comment clarifying the intent would prevent this confusion.

**Fix:** Add a brief comment:
```js
// These are the installed paths used as command strings in settings.json.
// Existence is not checked here — the copy loop above ensures they are present.
const startDest = join(hooksDir, 'session-start-context.sh');
```

---

### IN-02: `execFileSync` return value unused in `hooks.test.mjs` bash syntax check

**File:** `tests/hooks.test.mjs:30-35`

**Issue:** The `it('is valid bash syntax')` test calls `execFileSync('bash', ['-n', hookPath], ...)` and assigns the result to `result`, then never uses it. The variable is dead. If `bash -n` exits non-zero, `execFileSync` throws, so the test still catches failures — but the unused variable assignment is misleading.

**Fix:**
```js
it('is valid bash syntax', () => {
  execFileSync('bash', ['-n', hookPath], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // throws on non-zero exit — no return value needed
});
```

---

### IN-03: `install.test.mjs` BUG-01 test does not assert the project-level `settings.json` was actually created

**File:** `tests/install.test.mjs:409-443`

**Issue:** The test at line 409 ("installSessionHook does NOT write to ~/.claude/settings.json when projects provided") correctly verifies the global settings file is untouched, but does not assert that the per-project `.claude/settings.json` was created at `tmpProjectPath/.claude/settings.json`. If `installSessionHook` silently fails to write to either location, the test still passes. This leaves the primary happy-path of BUG-01 unverified in this test.

**Fix:** Add after line 431:
```js
const projectSettingsPath = join(tmpProjectPath, '.claude', 'settings.json');
assert.ok(
  existsSync(projectSettingsPath),
  'project-level .claude/settings.json must have been created',
);
```

---

_Reviewed: 2026-04-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
