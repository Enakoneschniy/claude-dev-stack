---
phase: 06-git-conventions-skill-ecosystem
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - lib/shared.mjs
  - lib/git-scopes.mjs
  - lib/git-conventions.mjs
  - lib/doctor.mjs
  - bin/install.mjs
  - templates/skills/git-conventions/SKILL.md.tmpl
  - tests/helpers/fixtures.mjs
  - tests/helpers/fixtures.test.mjs
  - tests/git-scopes.test.mjs
  - tests/git-conventions.test.mjs
  - tests/install.test.mjs
  - tests/doctor.test.mjs
  - tests/shared.test.mjs
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The Phase 06 implementation introduces the git-conventions skill ecosystem: `lib/git-scopes.mjs` (detection/schema), `lib/git-conventions.mjs` (CLI dispatcher), an updated `lib/doctor.mjs` (health check section), `bin/install.mjs` (wizard step), `templates/skills/git-conventions/SKILL.md.tmpl` (skill template), and a full test suite backed by shared fixtures.

The code is well-structured, idiomatic, and consistent with the project's conventions. Core detection logic (detectStack, detectMainBranch, installSkill, validateScopes) is correct and thoroughly tested. No critical (security or data-loss) issues were found.

Five warnings were identified — all correctness/reliability issues that could produce confusing runtime behavior:

1. `runCmd` in `lib/shared.mjs` passes user-visible names (e.g. `which ${name}`) through shell, creating a mild injection surface for `hasCommand`.
2. `cmdInit` in `lib/git-conventions.mjs` continues silently when `--full` and `--quick` are both omitted (defaulting to quick), making the `full` prompt block unreachable without `--full`.
3. `detectStack` in `lib/git-scopes.mjs` scans all top-level directories for `go.mod`, including `node_modules`, `.git`, `vendor`, and other large trees — causing slow I/O on large projects.
4. `installSessionHook` in `bin/install.mjs` swallows the JSON parse error for `settings.json` with an empty `catch {}`, silently overwriting a corrupt settings file with partial changes.
5. `withStubBinary` in `tests/helpers/fixtures.mjs` is synchronous — if `fn` is async, the `finally` cleanup runs before the async work completes, leaving the stub binary in place during the async phase.

Six informational items cover naming consistency, missing test coverage gaps, and a magic-number pattern.

---

## Warnings

### WR-01: `hasCommand` passes argument through shell — potential injection

**File:** `lib/shared.mjs:49`
**Issue:** `hasCommand(name)` calls `runCmd(`which ${name}`)`. `runCmd` delegates to `execSync` with the full string evaluated by the shell. If a caller passes an attacker-controlled name (e.g. a plugin ID sourced from an external JSON), this runs `which <arbitrary shell>`. Current callers use hardcoded strings, but the pattern is fragile. The same construct is duplicated in `bin/install.mjs:65`.
**Fix:**
```js
// lib/shared.mjs
export function hasCommand(name) {
  // Use spawnSync to avoid shell interpretation
  const r = spawnSync('which', [name], { encoding: 'utf8', stdio: 'pipe' });
  return r.status === 0;
}
```

### WR-02: `cmdInit` `--full` prompt block is unreachable without the flag

**File:** `lib/git-conventions.mjs:133-221`
**Issue:** The quick/full branching logic is:
```js
const useQuick = quick || !full;   // true unless --full is passed
if (useQuick) { /* prompts 1-4 */ }
if (full) { /* prompts 5-7 */ }
```
When neither `--quick` nor `--full` is supplied (the common case from `scopes init`), `useQuick` is `true` and `full` is `false` — only prompts 1-4 run. This is the intended "default quick" behavior, **but** the help text says `--quick` is "default", implying `--full` enables extra prompts. What actually happens is:
- `scopes init` → quick (correct)
- `scopes init --full` → quick + full (correct)
- `scopes init --quick` → quick (correct, redundant flag)

The bug: when `--full` is passed, the code runs **both** the quick block AND the full block. Prompt 3 (confirm main branch) appears twice — once inside `useQuick` (lines 165-179) and once implicitly via the full block if a user re-prompts. More critically, `config.main_branch` is confirmed in the quick block and could then be re-set by a custom branch prompt in `cmdInit`. The duplication of branch confirmation in full mode is unintentional.

**Fix:** Guard the quick block with `!full` OR restructure so full mode replaces quick mode:
```js
const useQuick = !full;  // full mode subsumes quick mode
```
Or deduplicate the branch prompt so it only appears once regardless of mode.

### WR-03: `detectStack` Go detector scans all top-level directories including large ones

**File:** `lib/git-scopes.mjs:231-255`
**Issue:** The Go multi-module detector (step 7) unconditionally calls `readdirSync(projectDir)` to enumerate every top-level entry, then for each directory checks one level deeper. On a typical Node.js project this scans `node_modules` (tens of thousands of entries), `.git` (large), `vendor`, etc. This runs synchronously and blocks the event loop.

The Go detector is reached only after all other detectors fail, so it fires on every non-monorepo project. The inner loop (`readdirSync(subDir)`) has its own `try/catch` but the outer read has none — a permission error on `projectDir` itself would propagate as an uncaught exception at line 231.

**Fix:**
```js
// Filter out well-known heavy directories before scanning
const entries = readdirSync(projectDir, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('.') &&
    e.name !== 'node_modules' && e.name !== 'vendor' && e.name !== 'dist');
```
Also wrap the outer `readdirSync` in `try/catch` for consistency with other detectors.

### WR-04: `installSessionHook` silently swallows JSON parse errors

**File:** `bin/install.mjs:1119-1122`
**Issue:**
```js
try {
  settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
} catch {}
```
If `settings.json` exists but contains invalid JSON (e.g. partial write, manual editing mistake), `settings` stays as `{}`. The code then proceeds to write a new `settings.json` with only hooks — **overwriting the existing file** and silently discarding all user settings (e.g. `enabledPlugins`, `mcpServers`). A user with a corrupt settings file would lose their entire Claude config with no warning.
**Fix:**
```js
try {
  settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
} catch {
  warn('settings.json could not be parsed — your existing settings will be preserved as-is.');
  info('Fix the JSON manually before re-running setup, or backup and delete it.');
  return; // abort hook installation rather than overwrite
}
```

### WR-05: `withStubBinary` is synchronous — async `fn` leaves stub alive during execution

**File:** `tests/helpers/fixtures.mjs:100-117`
**Issue:** `withStubBinary(name, script, fn)` is synchronous:
```js
let result;
try {
  result = fn(dir);   // fn could return a Promise
} finally {
  process.env.PATH = originalPath;
  rmSync(dir, { recursive: true, force: true });
}
return result;  // returns the Promise without awaiting
```
If `fn` is or becomes `async`, the stub directory is deleted and PATH is restored **before** the async work completes. Any commands that check PATH during the async phase (e.g. `hasCommand`) would not find the stub. Currently all callers in `fixtures.test.mjs` pass synchronous fns, but the API silently breaks for async usage without any indication.
**Fix:**
```js
export async function withStubBinary(name, scriptContent, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cds-stub-'));
  // ... setup ...
  try {
    return await fn(dir);
  } finally {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  }
}
```

---

## Info

### IN-01: `bin/install.mjs` duplicates `lib/shared.mjs` utilities verbatim

**File:** `bin/install.mjs:28-128`
**Issue:** `bin/install.mjs` defines its own local copies of `c`, `ok`, `fail`, `warn`, `info`, `runCmd`, `hasCommand`, `mkdirp`, `mkdirpKeep`, `step`, `listDirs`, and `askPath` — all identical to their counterparts in `lib/shared.mjs`. This is intentional (the file predates shared.mjs standardization) but is a maintenance risk: a fix in shared.mjs needs to be mirrored in install.mjs. Now that `lib/git-scopes.mjs` is already imported in install.mjs (line 19), importing from shared.mjs is feasible.
**Fix:** Not required immediately, but worth a future cleanup to `import { c, ok, fail, warn, info, runCmd, hasCommand, mkdirp, mkdirpKeep, step, listDirs, askPath } from '../lib/shared.mjs'`.

### IN-02: Magic string `'core'` in fallback detection

**File:** `lib/git-scopes.mjs:287`
**Issue:** The fallback detector returns `{ scopes: ['core'], ... }`. The string `'core'` is a hardcoded default with no named constant. If the default scope name ever changes, it must be updated in multiple places.
**Fix:** Extract to a named constant at the top of the file:
```js
const DEFAULT_SCOPE = 'core';
// ...
return { scopes: [DEFAULT_SCOPE], confidence: 'low', source: 'fallback' };
```

### IN-03: `cmdInit --full` runs `useQuick` block first but never prompts for ticket_regex

**File:** `lib/git-conventions.mjs:194-221`
**Issue:** The full-mode block (lines 194-221) prompts for `ticket_prefix`, `branch_format`, and `co_authored_by`, but never prompts for `ticket_regex` even though the config schema includes it (as seen in `createDefaultConfig` — it defaults to `''`). The commitlint instructions print `ticket_prefix` but `ticket_regex` is left empty with no way to set it interactively. This is a completeness gap, not a bug, but worth noting for future `--full` enhancement.

### IN-04: `detectMainBranch` calls `git remote set-head` which mutates repository state

**File:** `lib/git-scopes.mjs:348`
**Issue:** Step 2 of the detection chain runs `git remote set-head origin --auto`. This is a side effect — it writes to the git repo's refs. On repos where the user has not set up an origin or the remote is unreachable, this command may print an error to stderr (silently swallowed via `2>/dev/null`) and takes a network round-trip. This is a low-severity issue since it only fires when step 1 fails, but callers may not expect a read-only detection function to mutate repo state.

### IN-05: `tests/git-conventions.test.mjs` `cmdList` weak assertion

**File:** `tests/git-conventions.test.mjs:95`
**Issue:** The test for "prints failure when no config exists" only asserts `output.length > 0` — it doesn't verify that a failure/error message was shown. A future refactor that prints something other than an error (e.g. an empty line) would pass this test silently.
**Fix:**
```js
assert.ok(output.includes('No .claude/git-scopes.json') || output.includes('✘'),
  'should print a failure message when config is missing');
```

### IN-06: `tests/install.test.mjs` no-python functional test has a weak assertion

**File:** `tests/install.test.mjs:246-254`
**Issue:** The assertion accepts `result.status !== null` as a passing condition — which is always true when the process runs at all. The intended check (that the function returns `false` when python is absent) is not reliably validated. The test could pass even if `installNotebookLM` throws or prints garbage.
**Fix:** Focus the assertion on `stdout === 'false'` or check for the specific "Neither pipx nor python3 detected" message in stdout/stderr.

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
