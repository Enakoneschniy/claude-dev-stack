---
plan_id: 40-01-fix-detect-test-mjs-failures
phase: 40
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/detect.test.mjs
autonomous: true
requirements:
  - DETECT-TEST-FIX
user_setup: []
must_haves:
  truths:
    - "All 3 previously failing `detect.test.mjs` subtests asserting `state.profile === null` pass under HOME-isolated process env"
    - "Real `~/vault/meta/profile.json` of the maintainer is NEVER read during the test run (HOME pointer is overridden to a temp dir before any test body runs)"
    - "`lib/install/detect.mjs` is NOT modified — `readInstallProfile` retains its v1.x reserved semantics per D-127"
    - "`pnpm vitest run tests/detect.test.mjs` exits 0 with all subtests green on macOS + Linux"
    - "No new external dependencies; pattern matches `packages/cds-cli/tests/helpers/temp-home.ts` from Phase 39 Plan 02"
  artifacts:
    - path: "tests/detect.test.mjs"
      provides: "HOME-isolated detect.test.mjs with module-level beforeAll/afterAll setting fakeHome before any in-process detectInstallState() call"
      contains: "process.env.HOME"
    - path: "tests/detect.test.mjs"
      provides: "Comment block citing D-127 explaining why the real vault must not leak into the test sandbox"
      contains: "D-127"
  key_links:
    - from: "tests/detect.test.mjs (top-level beforeAll)"
      to: "process.env.HOME"
      via: "mkdtempSync + assignment before in-process tests run"
      pattern: "process.env.HOME"
    - from: "tests/detect.test.mjs (in-process suites)"
      to: "lib/install/detect.mjs::readInstallProfile via VAULT_CANDIDATES homedir() resolution"
      via: "homedir() reads HOME env"
      pattern: "homedir\\(\\)"
---

<objective>
Fix the 3 pre-existing `detect.test.mjs` failures (carried since v0.12) that block CI's new `publish.yml` step running `pnpm test`. Root cause per D-127: tests asserting `state.profile === null` (the v1-deferred behavior) call `detectInstallState()` in the test process, which calls `readInstallProfile(vaultPath)` against the maintainer's real `~/vault/meta/profile.json` and returns a non-null profile object. Fix at the test level by overriding `process.env.HOME` to a temp dir BEFORE any in-process detection runs, so VAULT_CANDIDATES (computed via `homedir()` at call time) resolve to a clean sandbox with no vault.

Purpose: unblock CI for the v1.0.0-alpha.1 release.

Output: a single test-file edit. Production code is NOT touched.

response_language: ru — все user-facing сообщения от тестов и комментарии уровня файла на английском (тесты — код), комментарии-обоснования на английском, общение с разработчиком в чате на русском.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md
@./CLAUDE.md
@./tests/detect.test.mjs
@./lib/install/detect.mjs

<interfaces>
Existing structure (DO NOT modify):

- `lib/install/detect.mjs` exports `detectInstallState()` and helpers. `readInstallProfile(vaultPath)` returns the JSON contents of `{vaultPath}/meta/profile.json` if it exists, else `null`. The function is correct and intentional — see D-127 in 40-CONTEXT.md.
- `lib/install/detect.mjs` defines `VAULT_CANDIDATES` as a module-top-level constant computed at import time from `homedir()`. This means changing `process.env.HOME` AFTER `detect.mjs` is imported into the test process does NOT change which paths are searched.
- The 3 currently-failing tests are the in-process (NOT child-process) ones that call `detectInstallState()` directly:
  1. `describe('detectInstallState() — no vault')` -> `it('returns vaultExists: false when no candidate paths exist')` — asserts `state.profile === null`
  2. `describe('detectInstallState() — vault present (temp dir simulation)')` -> `it('profile is always null (v1 — CONTEXT.md deferred)')` — asserts `state.profile === null`
  3. `describe('detectInstallState() — does not throw on missing resources')` -> `it('returns consistent shape on repeated calls')` — asserts `a.profile === null` AND `b.profile === null`

The functional (child-process) tests already use `runDetect(fakeHome)` which spawns a fresh Node process with overridden HOME — those work and do NOT need changes.

Pattern to follow: `packages/cds-cli/tests/helpers/temp-home.ts` from Phase 39 Plan 02 (mkdtempSync into a per-suite fakeHome, restore in afterAll).

Critical wrinkle: `VAULT_CANDIDATES` in `detect.mjs` is computed at import time. The static import `import { detectInstallState } from '../lib/install/detect.mjs'` at the top of the test file therefore captures candidates pointing at the REAL `~/vault`. Setting HOME after that import has no effect on those tests. Solution: set `process.env.HOME = fakeHome` BEFORE the static import is evaluated. With Vitest there are two viable approaches:

A) **vi.hoisted approach** (Phase 39 Plan 02 pattern): use `vi.hoisted(() => { /* set HOME here */ })` to run before any module imports. Works because vi.hoisted is itself hoisted above static imports.

B) **Dynamic-import approach**: replace the static `import { detectInstallState } from '../lib/install/detect.mjs'` with a top-level `let detectInstallState; beforeAll(async () => { process.env.HOME = mkdtempSync(...); ({ detectInstallState } = await import('../lib/install/detect.mjs')); });`

Approach A is preferred — it matches Phase 39 D-121 patterns and keeps the test body shape identical.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add vi.hoisted HOME override at top of tests/detect.test.mjs</name>
  <read_first>
    - tests/detect.test.mjs (full current file)
    - lib/install/detect.mjs (confirm VAULT_CANDIDATES is module-top-level homedir())
    - .planning/phases/40-v1-0-alpha-polish-and-blockers/40-CONTEXT.md §D-127
    - .planning/phases/39-cds-quick-demo-alpha-release/39-02-cds-quick-cli-SUMMARY.md (vi.hoisted pattern reference, Bug 1)
    - packages/cds-cli/tests/helpers/temp-home.ts (mkdtempSync + cleanup pattern)
  </read_first>
  <files>
    - tests/detect.test.mjs (modify)
  </files>
  <action>
  Open `tests/detect.test.mjs`. Add `vi` to the existing vitest import:

  ```js
  import { describe, it, beforeAll, afterAll, vi } from 'vitest';
  ```

  Immediately AFTER the existing imports (after `import { fileURLToPath } from 'node:url';`) and BEFORE the `const __dirname = ...` block, insert a `vi.hoisted` block that allocates a temp HOME and overrides `process.env.HOME` BEFORE the static import of `detect.mjs` is evaluated. Use a module-scoped `_TEST_HOME` reference for cleanup later:

  ```js
  // ── D-127: Isolate HOME before detect.mjs is imported ─────────────────
  // detect.mjs computes VAULT_CANDIDATES at module import time via homedir().
  // If HOME points at the maintainer's real ~/vault, the in-process tests
  // assert against a populated vault and the `profile === null` assertions
  // fail (carried 3-test gap from v0.12). Per Phase 40 CONTEXT.md D-127 we
  // override HOME at hoist time so VAULT_CANDIDATES resolves to a sandbox
  // with no vault. Production code is NOT changed — readInstallProfile
  // remains the deliberate exported function for v1.x consumers.
  const _TEST_HOME = vi.hoisted(() => {
    const { mkdtempSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const { join } = require('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'detect-isolated-home-'));
    process.env.HOME = dir;
    return dir;
  });
  ```

  Note: vi.hoisted runs BEFORE ES module imports are evaluated. Inside vi.hoisted, ES `import` statements are not yet resolved, so we use CommonJS `require()` for `node:fs`, `node:os`, `node:path` (these are always available in Node ≥20 even from ESM contexts). This mirrors the Phase 39 Plan 02 pattern (Bug 1 in 39-02 SUMMARY) where vi.hoisted cannot reference imported helpers.

  At the very BOTTOM of the file (after the last `describe` block), add a top-level `afterAll` that cleans up the isolated HOME:

  ```js
  // Clean up the D-127 isolated HOME after all suites finish.
  afterAll(() => {
    try {
      const { rmSync } = require('node:fs');
      rmSync(_TEST_HOME, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort — temp dir will be reaped by the OS otherwise.
    }
  });
  ```

  Do NOT remove or restructure any existing `describe` blocks. Do NOT touch the child-process functional tests (`runDetect(fakeHome)`) — they already isolate via `env: { ...process.env, HOME: fakeHome }`.

  Do NOT delete the existing `assert.strictEqual(state.profile, null, ...)` assertions — once HOME is isolated those will pass.

  IMPORTANT: confirm `tests/detect.test.mjs` currently uses `import { describe, it, beforeAll, afterAll } from 'vitest';` (vitest, NOT node:test). The file already does — adding `vi` to the same import is purely additive.
  </action>
  <verify>
    <automated>pnpm vitest run tests/detect.test.mjs --reporter=basic</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "vi.hoisted" tests/detect.test.mjs` -> >= 1
    - `grep -c "D-127" tests/detect.test.mjs` -> >= 1
    - `grep -c "process.env.HOME" tests/detect.test.mjs` -> >= 2 (one in vi.hoisted, plus the existing functional-test usage which stays)
    - `grep -c "_TEST_HOME" tests/detect.test.mjs` -> >= 2 (declaration + afterAll cleanup)
    - `grep -c "vi" tests/detect.test.mjs` -> >= 1 (in the vitest import line)
    - `pnpm vitest run tests/detect.test.mjs --reporter=basic` exits 0
    - Inside the vitest output, all 3 previously-failing subtests pass:
      - "returns vaultExists: false when no candidate paths exist"
      - "profile is always null (v1 — CONTEXT.md deferred)"
      - "returns consistent shape on repeated calls"
    - `git diff --stat lib/install/` -> empty (production code untouched)
  </acceptance_criteria>
  <done>
  Test file modified to override HOME at vi.hoisted time; all 3 previously-failing in-process subtests pass; production `lib/install/detect.mjs` is byte-identical to before this plan.
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify full test suite remains green after the HOME isolation change</name>
  <read_first>
    - tests/detect.test.mjs (post-Task-1 state)
    - vitest.config.ts
    - package.json (verify "test" script invokes pnpm test or vitest)
  </read_first>
  <files>
    - (no source modifications — pure verification task)
  </files>
  <action>
  Run the full repository test suite to confirm the HOME override in `tests/detect.test.mjs` does not bleed into other test files. The `vi.hoisted` runs per-test-file in Vitest, so HOME mutation should be scoped to this single test file and reverted naturally as each worker exits.

  Run:

  ```bash
  pnpm test 2>&1 | tail -60
  ```

  Inspect the tail for any new failures. If a sibling test file (e.g. `tests/install-vault.test.mjs`, `tests/projects.test.mjs`) regressed because of the HOME mutation, this is a vitest worker pool isolation issue. In that case, add an explicit teardown in the `afterAll` to restore the original HOME:

  ```js
  // Capture original HOME before override, restore in afterAll.
  const _ORIGINAL_HOME = vi.hoisted(() => process.env.HOME);
  // ... and in afterAll: process.env.HOME = _ORIGINAL_HOME;
  ```

  Add this only if a regression appears — vitest's default `pool: 'forks'` should already isolate.

  No commit for this task unless a follow-up edit was needed.
  </action>
  <verify>
    <automated>pnpm test 2>&1 | tee /tmp/p40-01-fulltest.log; grep -E "Test Files|Tests" /tmp/p40-01-fulltest.log | tail -4</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test` exits 0
    - The summary line `Tests  N passed (N)` shows zero failures
    - `tests/detect.test.mjs` block in the output reports all subtests passing
    - No previously-passing test file shows a new failure (compare against `git stash` of pre-Task-1 results if uncertain)
  </acceptance_criteria>
  <done>
  Full `pnpm test` suite is green at HEAD with the HOME isolation in place.
  </done>
</task>

</tasks>

<verification>
Final commands to run before marking plan complete:

```sh
# 1. Targeted: detect.test.mjs all green
pnpm vitest run tests/detect.test.mjs --reporter=verbose

# 2. Full suite green (regression guard for sibling tests)
pnpm test

# 3. Production code untouched
git diff --stat lib/install/   # must be empty

# 4. Test file changes minimal
git diff --stat tests/detect.test.mjs   # 1 file, ~30-40 line insert

# 5. Frontmatter sanity
grep -c "D-127" tests/detect.test.mjs   # >= 1 (traceability)
```
</verification>
</content>
</invoke>