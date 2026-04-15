---
phase: 19-project-level-hooks-wizard-bug-fixes
fixed_at: 2026-04-14T00:00:00Z
review_path: .planning/phases/19-project-level-hooks-wizard-bug-fixes/19-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-04-14T00:00:00Z
**Source review:** .planning/phases/19-project-level-hooks-wizard-bug-fixes/19-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01 through WR-04; IN-* excluded by fix_scope: critical_warning)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: `budgetResetDest` and `budgetCheckDest` paths use `homedir()` instead of `hooksDir`

**Files modified:** `lib/install/hooks.mjs`
**Commit:** 78b293f
**Applied fix:** Replaced `join(homedir(), '.claude', 'hooks', 'budget-reset.mjs')` and the equivalent `budget-check.mjs` call with `join(hooksDir, 'budget-reset.mjs')` / `join(hooksDir, 'budget-check.mjs')`. Since these variables are inside `_writeSettingsFile` (which does not receive `hooksDir` as a parameter), a local `const hooksDir = join(homedir(), '.claude', 'hooks')` was added at the top of `_writeSettingsFile` so both budget dest variables resolve consistently from the same single declaration rather than two independent `homedir()` calls.

### WR-02: `chmodSync` error silently swallowed with empty `catch {}`

**Files modified:** `lib/install/hooks.mjs`
**Commit:** 78b293f
**Applied fix:** Changed `try { chmodSync(dest, 0o755); } catch {}` to `try { chmodSync(dest, 0o755); } catch (err) { warn(\`Could not set executable bit on ${dest}: ${err.message}\`); }` so chmod failures are surfaced to the user via the existing `warn` helper rather than silently dropped.

### WR-03: Unquoted glob expansion in `gsd-auto-reapply-patches.sh` is word-split sensitive

**Files modified:** `hooks/gsd-auto-reapply-patches.sh`
**Commit:** 037a477
**Applied fix:** Replaced the `for candidate ... for expanded in $candidate` double-loop with two separate blocks: a quoted `for` loop over the deterministic candidates (npm global root and `~/.local/share/npm` path), and a separate `find` invocation for the npx cache glob (`$HOME/.npm/_npx/.../claude-dev-stack/patches`). All path variables are now properly double-quoted, eliminating word-splitting risk on paths with spaces.

### WR-04: `shasum` fallback silently produces empty SHA on systems without `shasum`

**Files modified:** `hooks/gsd-auto-reapply-patches.sh`
**Commit:** 037a477
**Applied fix:** Added a portable `_sha256()` shell function that tries `sha256sum` first (standard on Linux) and falls back to `shasum -a 256` (macOS). Both `PATCH_SHA` and `TARGET_SHA` now use `_sha256`. Added an explicit guard: if either SHA is empty (no sha tool available), the patch is force-applied rather than silently skipped, preventing the silent no-op failure.

---

_Fixed: 2026-04-14T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
