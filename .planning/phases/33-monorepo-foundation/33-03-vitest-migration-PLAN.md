---
plan_id: 33-03-vitest-migration
phase: 33
plan: 03
type: execute
wave: 2
depends_on:
  - 33-01-monorepo-scaffolding
files_modified:
  - vitest.config.ts
  - packages/cds-core/vitest.config.ts
  - packages/cds-cli/vitest.config.ts
  - packages/cds-migrate/vitest.config.ts
  - packages/cds-s3-backend/vitest.config.ts
  - packages/cds-core/src/index.test.ts
  - packages/cds-cli/src/index.test.ts
  - packages/cds-migrate/src/index.test.ts
  - packages/cds-s3-backend/src/index.test.ts
  - tests/adr-bridge-session.test.mjs
  - tests/adr-bridge.test.mjs
  - tests/budget-gate.test.mjs
  - tests/budget.test.mjs
  - tests/claude-md-status-line.test.mjs
  - tests/cli.test.mjs
  - tests/continuation.test.mjs
  - tests/decisions-cli.test.mjs
  - tests/detect.test.mjs
  - tests/dev-router-hook.test.mjs
  - tests/git-conventions-check-hook.test.mjs
  - tests/git-conventions.test.mjs
  - tests/git-scopes.test.mjs
  - tests/gsd-auto-reapply-patches.test.mjs
  - tests/handoff.test.mjs
  - tests/hooks.test.mjs
  - tests/idea-capture-trigger.test.mjs
  - tests/install-gitignore-marker.test.mjs
  - tests/install-patches-copy.test.mjs
  - tests/install.test.mjs
  - tests/notebooklm-cli.test.mjs
  - tests/notebooklm-search.test.mjs
  - tests/notebooklm-sync-per-project.test.mjs
  - tests/notebooklm-sync.test.mjs
  - tests/notebooklm.test.mjs
  - tests/notion-cli.test.mjs
  - tests/notion-config.test.mjs
  - tests/project-naming.test.mjs
  - tests/project-setup.test.mjs
  - tests/project-switcher-hook.test.mjs
  - tests/session-context.test.mjs
  - tests/session-start-marker.test.mjs
  - tests/silent-session-start.test.mjs
  - tests/skills.test.mjs
  - tests/templates.test.mjs
  - tests/workflow-enforcer.test.mjs
autonomous: true
requirements:
  - MONO-03
user_setup: []
must_haves:
  truths:
    - "Running `pnpm -w vitest run --project root` executes the migrated 48 root tests and exits 0 with 928 passing tests + 3 pre-existing detect.test.mjs failures preserved (ROADMAP SC#3, D-06)"
    - "Running `pnpm -w vitest run --project cds-core` (and cds-cli, cds-migrate, cds-s3-backend) runs the per-package sanity test and exits 0"
    - "Root tests use `pool: 'forks'` (not threads) so `execFileSync`/`spawnSync` calls work (Pitfall 7)"
    - "Every root `tests/*.test.mjs` imports from `vitest` (not `node:test`) after migration"
    - "No test bodies rewritten beyond the mechanical changes in PATTERNS.md Group A/B — test assertions are 1:1 preserved (D-05)"
  artifacts:
    - path: "vitest.config.ts"
      provides: "Root vitest config declaring projects array (root + packages/*)"
      contains: "pool: 'forks'"
    - path: "packages/cds-core/vitest.config.ts"
      provides: "Per-package vitest project config"
      contains: "name: 'cds-core'"
    - path: "packages/cds-cli/vitest.config.ts"
      provides: "Per-package vitest project config"
      contains: "name: 'cds-cli'"
    - path: "packages/cds-migrate/vitest.config.ts"
      provides: "Per-package vitest project config"
      contains: "name: 'cds-migrate'"
    - path: "packages/cds-s3-backend/vitest.config.ts"
      provides: "Per-package vitest project config"
      contains: "name: 'cds-s3-backend'"
    - path: "packages/cds-core/src/index.test.ts"
      provides: "Sanity test proving vitest runs in the cds-core workspace"
      contains: "CDS_CORE_VERSION"
  key_links:
    - from: "vitest.config.ts"
      to: "tests/**/*.test.mjs"
      via: "projects[0].include glob"
      pattern: "tests/\\*\\*/\\*\\.test\\.mjs"
    - from: "vitest.config.ts projects"
      to: "packages/*"
      via: "glob-based project discovery"
      pattern: "packages/\\*"
    - from: "tests/*.test.mjs (48 files)"
      to: "vitest imports (not node:test)"
      via: "import swap per PATTERNS.md Group A/B"
      pattern: "from 'vitest'"
---

<objective>
Migrate the 48-file root test suite from `node:test` + `node:assert/strict` to vitest via the minimum-diff strategy locked in D-05: swap imports, rename `before`/`after` → `beforeAll`/`afterAll`, and convert the 7 files that use `assert.rejects` / `assert.doesNotReject` callbacks per PATTERNS.md templates. Add the root `vitest.config.ts` (with `projects` array covering root `.mjs` tests + packages glob), create per-package `vitest.config.ts` stubs, and add per-package sanity tests proving each workspace runs vitest.

Purpose: satisfy MONO-03 (vitest replaces node:test; 928 passing tests port over with zero behavior change; 3 pre-existing `detect.test.mjs` failures stay untouched per D-06).

Output: 5 vitest config files (1 root + 4 per-package), 4 per-package sanity tests (`.ts`), 48 modified root test files (`.mjs`). Zero test body rewrites beyond the mechanical Group A/B changes.

**CRITICAL:** Do NOT rewrite test bodies, do NOT remove `test.skip`, do NOT touch fixtures or helper modules in `tests/`. The changes are surgical: imports + `before`/`after` renames + targeted `assert.rejects`/`assert.doesNotReject` conversions per PATTERNS.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/33-monorepo-foundation/33-CONTEXT.md
@.planning/phases/33-monorepo-foundation/33-RESEARCH.md
@.planning/phases/33-monorepo-foundation/33-PATTERNS.md
@.planning/phases/33-monorepo-foundation/33-VALIDATION.md
@.planning/phases/33-monorepo-foundation/33-01-monorepo-scaffolding-PLAN.md
@./CLAUDE.md

<interfaces>
<!-- Plan 01 installed vitest@4.1.4 and set `"scripts.test": "vitest run"` in root package.json. -->
<!-- Plan 01 does NOT depend on Plan 02 — vitest runs source `.ts` via its own esbuild-based transform; tsc build is independent. -->
<!-- This plan only depends on Plan 01 (not Plan 02) because vitest doesn't read `dist/`. -->

From Plan 01 (already on disk):
- `packages/cds-core/src/index.ts` exports `CDS_CORE_VERSION = '0.0.0-stub'`
- `packages/cds-cli/src/index.ts` exports `CDS_CLI_VERSION = '0.0.0-stub'`
- `packages/cds-migrate/src/index.ts` exports `CDS_MIGRATE_VERSION = '0.0.0-stub'`
- `packages/cds-s3-backend/src/index.ts` exports `CDS_S3_BACKEND_VERSION = '0.0.0-stub'`
- `package.json` `scripts.test` = `"vitest run"`
- `devDependencies.vitest` = `"4.1.4"`
- `vitest` binary available via `pnpm exec vitest` or `pnpm -w vitest`
</interfaces>

<migration_groups>
<!-- Full list of 48 test files, split into Group A (import swap only) and Group B (import swap + body conversion). -->
<!-- Executor MUST use these exact lists. Source: PATTERNS.md §"tests/*.test.mjs — import swap migration". -->

**Group B (7 files requiring body-level conversion beyond import swap):**
1. `tests/notebooklm.test.mjs` (27 `assert.rejects` calls with callback validators)
2. `tests/notebooklm-cli.test.mjs` (4 `assert.rejects`)
3. `tests/notebooklm-sync.test.mjs` (4 `assert.rejects`)
4. `tests/notebooklm-sync-per-project.test.mjs` (1 `assert.rejects`)
5. `tests/notebooklm-search.test.mjs` (1 `assert.rejects`, regex style)
6. `tests/continuation.test.mjs` (4 `assert.doesNotReject` calls)
7. `tests/notion-cli.test.mjs` (confirmed via grep in PATTERNS.md)

**Group A (remaining 41 files — import swap + before/after rename only):**
- adr-bridge-session.test.mjs
- adr-bridge.test.mjs
- budget-gate.test.mjs
- budget.test.mjs
- claude-md-status-line.test.mjs
- cli.test.mjs
- decisions-cli.test.mjs
- detect.test.mjs (note: 3 pre-existing failures stay — do NOT try to fix them)
- dev-router-hook.test.mjs
- git-conventions-check-hook.test.mjs
- git-conventions.test.mjs
- git-scopes.test.mjs
- gsd-auto-reapply-patches.test.mjs
- handoff.test.mjs
- hooks.test.mjs
- idea-capture-trigger.test.mjs
- install-gitignore-marker.test.mjs
- install-patches-copy.test.mjs
- install.test.mjs
- notion-config.test.mjs
- project-naming.test.mjs
- project-setup.test.mjs
- project-switcher-hook.test.mjs
- session-context.test.mjs (note: PATTERNS says this also has `assert.throws`/`assert.rejects` — re-check on executor pass and promote to Group B if `assert.rejects` with callback exists)
- session-start-marker.test.mjs
- silent-session-start.test.mjs
- skills.test.mjs
- templates.test.mjs
- workflow-enforcer.test.mjs
- (and remaining files discovered by `ls tests/*.test.mjs` that aren't in Group B above)

**Executor MUST enumerate via `ls tests/*.test.mjs` and subtract Group B to produce the final Group A list dynamically.** The lists above are the authoritative spec; the ls output is the reality check.
</migration_groups>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create root vitest.config.ts, per-package vitest configs, and per-package sanity tests</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md §"vitest.config.ts (config — no codebase analog)", §"Per-package vitest.config.ts", §"packages/cds-core/src/index.test.ts (and all other packages)"
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Code Examples: vitest.config.ts (root — complete)", §"Per-package vitest.config.ts (stub)", §"Sanity test (per package)"
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pattern 4: vitest config with projects array" — `test.projects` NOT `test.workspace`; `pool: 'forks'` for root tests
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pitfall 4", §"Pitfall 7"
  </read_first>
  <files>
    - vitest.config.ts (new, repo root)
    - packages/cds-core/vitest.config.ts (new)
    - packages/cds-cli/vitest.config.ts (new)
    - packages/cds-migrate/vitest.config.ts (new)
    - packages/cds-s3-backend/vitest.config.ts (new)
    - packages/cds-core/src/index.test.ts (new)
    - packages/cds-cli/src/index.test.ts (new)
    - packages/cds-migrate/src/index.test.ts (new)
    - packages/cds-s3-backend/src/index.test.ts (new)
  </files>
  <action>
  Create 9 files. Configs use `defineConfig` from `vitest/config`. Sanity tests import the version constant from the stub and assert it equals `'0.0.0-stub'`.

  **File 1: `vitest.config.ts` (repo root)** — per PATTERNS.md and RESEARCH.md §Code Examples:

  ```typescript
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      environment: 'node',
      projects: [
        {
          test: {
            name: 'root',
            environment: 'node',
            include: ['tests/**/*.test.mjs'],
            pool: 'forks',
          },
        },
        // Glob discovers each packages/*/vitest.config.ts
        'packages/*',
      ],
    },
  });
  ```

  Critical constraints:
  - `test.projects` (NOT `test.workspace` — deprecated per vitest 3.2+).
  - Root project name is `'root'` — MUST match so `vitest run --project root` selects it.
  - `pool: 'forks'` for root is MANDATORY — root tests call `execFileSync`, `spawnSync`, `child_process` (per Pitfall 7). Removing this flag causes hangs / random failures.
  - Do NOT add `globals: true` — it does NOT replace `node:test` imports in existing files (Pitfall anti-pattern per RESEARCH.md).

  **Files 2–5: Per-package `vitest.config.ts`** (identical shape, different `name`):

  `packages/cds-core/vitest.config.ts`:
  ```typescript
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      name: 'cds-core',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  });
  ```

  `packages/cds-cli/vitest.config.ts`: same but `name: 'cds-cli'`.
  `packages/cds-migrate/vitest.config.ts`: same but `name: 'cds-migrate'`.
  `packages/cds-s3-backend/vitest.config.ts`: same but `name: 'cds-s3-backend'`.

  **Files 6–9: Per-package sanity tests** — import the version constant from the sibling `./index.js` (NodeNext ext rule — use `.js` even though source is `.ts`).

  `packages/cds-core/src/index.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { CDS_CORE_VERSION } from './index.js';

  describe('@cds/core', () => {
    it('package loads without error', () => {
      expect(CDS_CORE_VERSION).toBe('0.0.0-stub');
    });
  });
  ```

  `packages/cds-cli/src/index.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { CDS_CLI_VERSION } from './index.js';

  describe('@cds/cli', () => {
    it('package loads without error', () => {
      expect(CDS_CLI_VERSION).toBe('0.0.0-stub');
    });
  });
  ```

  `packages/cds-migrate/src/index.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { CDS_MIGRATE_VERSION } from './index.js';

  describe('@cds/migrate', () => {
    it('package loads without error', () => {
      expect(CDS_MIGRATE_VERSION).toBe('0.0.0-stub');
    });
  });
  ```

  `packages/cds-s3-backend/src/index.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { CDS_S3_BACKEND_VERSION } from './index.js';

  describe('@cds/s3-backend', () => {
    it('package loads without error', () => {
      expect(CDS_S3_BACKEND_VERSION).toBe('0.0.0-stub');
    });
  });
  ```

  **After writing all 9 files, validate per-package tests run:**

  `pnpm -w vitest run --project cds-core` should exit 0 with 1 passing test.
  Same for cds-cli, cds-migrate, cds-s3-backend.

  Do NOT run `pnpm -w vitest run --project root` yet — Task 2 migrates the root tests first.
  </action>
  <verify>
    <automated>test -f vitest.config.ts && test -f packages/cds-core/vitest.config.ts && test -f packages/cds-cli/vitest.config.ts && test -f packages/cds-migrate/vitest.config.ts && test -f packages/cds-s3-backend/vitest.config.ts && test -f packages/cds-core/src/index.test.ts && test -f packages/cds-cli/src/index.test.ts && test -f packages/cds-migrate/src/index.test.ts && test -f packages/cds-s3-backend/src/index.test.ts && grep -q "pool: 'forks'" vitest.config.ts && grep -q "name: 'root'" vitest.config.ts && grep -q "tests/\*\*/\*\.test\.mjs" vitest.config.ts && grep -q "packages/\*" vitest.config.ts && pnpm -w vitest run --project cds-core && pnpm -w vitest run --project cds-cli && pnpm -w vitest run --project cds-migrate && pnpm -w vitest run --project cds-s3-backend</automated>
  </verify>
  <acceptance_criteria>
    - All 9 files exist (`test -f ...` × 9)
    - Root `vitest.config.ts` contains literal `pool: 'forks'` (mandatory for root tests)
    - Root `vitest.config.ts` contains literal `name: 'root'`
    - Root `vitest.config.ts` contains literal `tests/**/*.test.mjs` (root project include glob)
    - Root `vitest.config.ts` contains literal `'packages/*'` (glob for package project discovery)
    - Root `vitest.config.ts` does NOT contain `test.workspace` or `workspace:` (Pitfall 4 — deprecated)
    - Root `vitest.config.ts` does NOT contain `globals: true`
    - Each per-package `vitest.config.ts` has a unique `name:` matching the package dir (cds-core, cds-cli, cds-migrate, cds-s3-backend)
    - `pnpm -w vitest run --project cds-core` exits 0 with "1 passed" (VALIDATION.md 33-03-02 check for cds-core)
    - `pnpm -w vitest run --project cds-cli` exits 0 with "1 passed"
    - `pnpm -w vitest run --project cds-migrate` exits 0 with "1 passed"
    - `pnpm -w vitest run --project cds-s3-backend` exits 0 with "1 passed"
  </acceptance_criteria>
  <done>
  Root vitest config targets both root `.mjs` tests and packages/* glob. Per-package configs are minimal, each named after its package. 4 sanity tests pass. The config is ready — Task 2 migrates the 48 root tests so `--project root` becomes green.
  </done>
</task>

<task type="auto">
  <name>Task 2: Migrate 48 root tests (Group A — import swap + before/after rename, 41 files)</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md §"tests/*.test.mjs — import swap migration (48 files)" — full Group A/B split
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pattern 5: import swap for node:test → vitest migration", §"Pitfall 1: before/after rename", §"Pitfall 2: assert.equal strictness difference"
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md §decisions D-04, D-05, D-06 (import swap only; no body rewrites; 3 detect.test.mjs failures stay)
  </read_first>
  <files>
    - tests/adr-bridge-session.test.mjs
    - tests/adr-bridge.test.mjs
    - tests/budget-gate.test.mjs
    - tests/budget.test.mjs
    - tests/claude-md-status-line.test.mjs
    - tests/cli.test.mjs
    - tests/decisions-cli.test.mjs
    - tests/detect.test.mjs
    - tests/dev-router-hook.test.mjs
    - tests/git-conventions-check-hook.test.mjs
    - tests/git-conventions.test.mjs
    - tests/git-scopes.test.mjs
    - tests/gsd-auto-reapply-patches.test.mjs
    - tests/handoff.test.mjs
    - tests/hooks.test.mjs
    - tests/idea-capture-trigger.test.mjs
    - tests/install-gitignore-marker.test.mjs
    - tests/install-patches-copy.test.mjs
    - tests/install.test.mjs
    - tests/notion-config.test.mjs
    - tests/project-naming.test.mjs
    - tests/project-setup.test.mjs
    - tests/project-switcher-hook.test.mjs
    - tests/session-context.test.mjs
    - tests/session-start-marker.test.mjs
    - tests/silent-session-start.test.mjs
    - tests/skills.test.mjs
    - tests/templates.test.mjs
    - tests/workflow-enforcer.test.mjs
    - (and any additional `tests/*.test.mjs` files not listed in Group B — enumerate via `ls tests/*.test.mjs` and subtract Group B)
  </files>
  <action>
  For each Group A file (41 files), apply two mechanical transformations per PATTERNS.md §"Pattern 5" template. Do NOT modify any other part of the file.

  **Transformation 1 — Import swap (line 1–2 of every file):**

  BEFORE (the exact patterns found in live tests):
  ```javascript
  import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
  import assert from 'node:assert/strict';
  ```
  (Named imports vary per file — some import only `describe, it`; some import `describe, it, beforeEach, afterEach`; some `describe, it, before, after`, etc. Preserve the EXACT named import list but change the source.)

  AFTER:
  ```javascript
  import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
  import { assert } from 'vitest';
  ```
  (Keep the same named imports the file actually used. If the file imported `before, after` → rewrite to `beforeAll, afterAll`. If it only imported `describe, it` → keep only `describe, it` in the new line. Preserve file-by-file minimalism: don't add imports the file never used.)

  **Transformation 2 — Call-site rename (body of every file):**

  Every occurrence of `before(` → `beforeAll(`
  Every occurrence of `after(` → `afterAll(`
  (NOT `beforeEach` or `afterEach` — those stay.)

  **Implementation approach (for the executor):**

  A safe sed-style one-pass per file. Pseudo-shell:
  ```
  for f in <Group A files>; do
    # 1. Import swap - regex-aware
    #    a. Replace "from 'node:test'" line — rename `before`/`after` in the named imports list, switch source to 'vitest'
    #    b. Replace "from 'node:assert/strict'" line — replace with "import { assert } from 'vitest';"
    # 2. Body rename: `before(` → `beforeAll(`, `after(` → `afterAll(`
    #    (careful: regex must NOT match beforeEach/afterEach → use word-boundary regex `\bbefore\(` / `\bafter\(`)
  done
  ```

  **Recommended executor approach:** Use the Edit tool OR a small Node.js scripted transform. NOT `sed -i` (portability issues between macOS and Linux). The Edit tool with the exact patterns is safest.

  **Important edge cases:**

  1. Files that do NOT import `before` or `after` — skip transformation 2, just do imports.
  2. Files that DO NOT import `assert` (some tests only use `describe`/`it`/`expect`-style assertions via... wait, they currently use `assert.X` from `node:assert/strict`, so most files DO import assert). If a file literally doesn't import `node:assert/strict`, skip the second import line transformation.
  3. `detect.test.mjs` — 3 subtests fail on `profile must be null in v1` (per STATE.md Known Gaps). DO NOT try to fix these failures. Migrate the imports like any other Group A file. The expected outcome after migration is still 3 failing subtests — this is intentional and preserved per D-06.
  4. Fixtures, helpers, mock data — do NOT touch any non-test files in `tests/`. If `tests/helpers.mjs` or `tests/fixtures/*` exist, they stay unchanged.

  **After migrating all 41 Group A files, run a targeted smoke test to catch obvious breakage:**

  `pnpm -w vitest run --project root tests/shared.test.mjs` (pick any file known to be simple and well-behaved — e.g. `tests/claude-md-status-line.test.mjs` which has no `before`/`after` per PATTERNS).

  Then run the full Group A subset:
  `pnpm -w vitest run --project root` — many files may be passing at this point, but Group B files will still fail because their `assert.rejects`/`assert.doesNotReject` calls don't exist in Chai. Task 3 fixes those. Do not block on full green here.

  Signal of success for Task 2: a large majority of root tests run, Group A files show passing or skipped subtests that match their `node --test` behavior. No `ReferenceError: before is not defined` errors (that would indicate a missed rename).
  </action>
  <verify>
    <automated># Enumerate ALL root test files, assert no residual node:test / node:assert imports
FAILED=""
for f in tests/*.test.mjs; do
  if grep -qE "^import.*from 'node:test'|^import.*from 'node:assert" "$f"; then
    FAILED="$FAILED $f"
  fi
done
if [ -n "$FAILED" ]; then
  echo "FAIL: files still have node:test/node:assert imports:$FAILED"
  exit 1
fi
echo "All root test files migrated from node:test → vitest"
# Check no file has bare before(/after( call AND vitest import simultaneously (missing rename to beforeAll/afterAll)
if grep -rlE "^\s*(before|after)\(" tests/*.test.mjs 2>/dev/null | xargs -r grep -l "from 'vitest'" 2>/dev/null | head -1 > /dev/null; then
  echo "FAIL: found file with bare before(/after( and vitest import — missing rename to beforeAll/afterAll"
  exit 1
fi
echo "Group A import-swap verification passed"</automated>
  </verify>
  <acceptance_criteria>
    - For every file listed in the Group A files list (41 files):
      - `grep -c "from 'node:test'" tests/<file>` → 0 (import removed)
      - `grep -c "from 'node:assert/strict'" tests/<file>` → 0 (import removed)
      - `grep -c "from 'vitest'" tests/<file>` → ≥ 1 (new import present)
    - NO root test file contains the bare identifier `before(` where it used to come from `node:test`: `grep -rE "^\s*before\(" tests/*.test.mjs` → zero matches (all renamed to `beforeAll`)
    - NO root test file contains the bare identifier `after(` at line start: `grep -rE "^\s*after\(" tests/*.test.mjs` → zero matches (all renamed to `afterAll`)
    - `beforeEach` and `afterEach` survive unchanged (they exist in both node:test and vitest with same name)
    - Test body lines (assertions) are unchanged: `git diff tests/ | grep -E "^[+-]\s*assert\." | grep -v "import"` — only the import line should have `assert` diffs; assertion call sites stay the same (1:1 `assert.ok`, `assert.equal`, `assert.deepEqual`, etc. all preserved)
    - `pnpm -w vitest run --project root` executes (may still fail on Group B files — that's Task 3). But NO Group A file throws `ReferenceError: before is not defined` or `ReferenceError: assert is not defined`.
  </acceptance_criteria>
  <done>
  41 Group A files migrated. All `node:test` / `node:assert/strict` imports replaced with vitest imports. All `before(`/`after(` renamed to `beforeAll(`/`afterAll(`. Test bodies untouched beyond this. Ready for Task 3 (Group B body conversions).
  </done>
</task>

<task type="auto">
  <name>Task 3: Migrate 7 Group B tests (body-level assert.rejects / assert.doesNotReject conversion) and run full suite</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md §"Group B — files with `assert.rejects` or `assert.doesNotReject`" — all 7 files + exact conversion templates
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Conversion template for `assert.rejects` with callback", §"Conversion template for `assert.doesNotReject`"
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pitfall 3: assert.rejects callback validator no Chai equivalent"
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md §decisions D-06 — 928 passing tests + 3 detect.test.mjs failures preserved
  </read_first>
  <files>
    - tests/notebooklm.test.mjs (27 assert.rejects to convert)
    - tests/notebooklm-cli.test.mjs (4 assert.rejects to convert)
    - tests/notebooklm-sync.test.mjs (4 assert.rejects to convert)
    - tests/notebooklm-sync-per-project.test.mjs (1 assert.rejects)
    - tests/notebooklm-search.test.mjs (1 assert.rejects, regex style)
    - tests/continuation.test.mjs (4 assert.doesNotReject calls)
    - tests/notion-cli.test.mjs (assert.rejects per PATTERNS.md confirmation)
  </files>
  <action>
  For each Group B file:

  **Step 1:** Apply Group A transformations first (import swap + before/after rename) IF Task 2 didn't already include these files. (The Group A task list in Task 2 should NOT include the 7 Group B files — verify by re-checking the Task 2 file list. If any Group B file leaked into Task 2's pass, that's fine; just proceed to Step 2 below.)

  After verifying imports are swapped, the Group B-specific imports in every file should include `expect` from vitest:

  ```javascript
  import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from 'vitest';
  // assert still imported for assert.ok, assert.equal, assert.deepEqual, etc. that stay unchanged
  import { assert } from 'vitest';
  ```

  Add `expect` to the vitest import list if it's not already there.

  **Step 2: Convert `assert.rejects(fn, validator)` → `await expect(fn()).rejects.<matcher>(...)`**

  Use the exact templates from PATTERNS.md §Group B and RESEARCH.md §"Conversion template for `assert.rejects` with callback":

  **Pattern 2A — callback validator with instanceof + regex:**
  ```javascript
  // BEFORE
  await assert.rejects(
    () => nblm.createNotebook('Test'),
    (err) => err instanceof nblm.NotebooklmCliError && /expected.*notebook/.test(err.message)
  );

  // AFTER
  await expect(nblm.createNotebook('Test')).rejects.toSatisfy(
    (err) => err instanceof nblm.NotebooklmCliError && /expected.*notebook/.test(err.message)
  );
  ```

  **Pattern 2B — regex validator only (e.g. notebooklm-search.test.mjs):**
  ```javascript
  // BEFORE
  await assert.rejects(() => nblm.search('q'), /no notebooks configured/);

  // AFTER
  await expect(nblm.search('q')).rejects.toThrow(/no notebooks configured/);
  ```

  **Pattern 2C — instance-check only (if simpler than callback style):**
  ```javascript
  // BEFORE (hypothetical simpler form)
  await assert.rejects(() => fn(), nblm.NotebooklmCliError);

  // AFTER
  await expect(fn()).rejects.toBeInstanceOf(nblm.NotebooklmCliError);
  ```

  **Step 3: Convert `assert.doesNotReject(fn)` → `await expect(fn()).resolves.toBeDefined()`**

  Per RESEARCH.md §"Conversion template for assert.doesNotReject":
  ```javascript
  // BEFORE (continuation.test.mjs, 4 call sites)
  await assert.doesNotReject(() => mod.handleNow());

  // AFTER
  await expect(mod.handleNow()).resolves.toBeDefined();
  ```

  If the return value of the function might genuinely be `undefined` (which `toBeDefined()` would reject), use the more liberal form instead:
  ```javascript
  await expect(mod.handleNow()).resolves.not.toThrow();
  ```
  Since `.resolves.not.toThrow()` only asserts no rejection, it matches `assert.doesNotReject` semantics exactly. Default to this form unless the callsite clearly expects a non-undefined return.

  **Per-file notes:**

  - `tests/notebooklm.test.mjs` — 27 call sites, all callback-validator style (Pattern 2A). Do NOT try to flatten callback validators into `.toThrow(instance)` — the original callbacks often combine instance check + regex on the message. Keep `toSatisfy` with the same callback.
  - `tests/notebooklm-cli.test.mjs` — 4 call sites, callback-validator style (Pattern 2A).
  - `tests/notebooklm-sync.test.mjs` — 4 call sites; 3 use callback style (Pattern 2A), 1 may use regex style (Pattern 2B) — check each.
  - `tests/notebooklm-sync-per-project.test.mjs` — 1 call site, callback style.
  - `tests/notebooklm-search.test.mjs` — 1 call site, regex style → use `rejects.toThrow(regex)`.
  - `tests/continuation.test.mjs` — 4 `assert.doesNotReject` call sites → use `rejects.not.toThrow()` or `resolves.toBeDefined()`.
  - `tests/notion-cli.test.mjs` — recheck exact usage; treat as callback-validator style unless the actual code shows regex.

  **Step 4: Run the full migrated suite and confirm baseline preservation (D-06):**

  ```
  pnpm -w vitest run --project root
  ```

  Expected outcome (per STATE.md + D-06):
  - **928 tests passing**
  - **3 tests failing** — all 3 in `tests/detect.test.mjs`, all with `profile must be null in v1` assertion (pre-existing, untouched, route to quick task per carried Known Gaps).
  - **0 tests erroring** — no `ReferenceError`, no `TypeError: assert.rejects is not a function` (would indicate a missed Group B conversion).
  - Runtime: ~45 seconds (per VALIDATION.md estimate).

  If tests other than those 3 `detect.test.mjs` subtests fail:
  - `TypeError: assert.rejects is not a function` → Group B conversion missed in some file. Recheck the 7 files.
  - `ReferenceError: before is not defined` → Group A rename missed. Run `grep -rE "^\s*before\(" tests/*.test.mjs` to find offenders.
  - `Cannot find module 'vitest'` → vitest wasn't installed (Plan 01 didn't run properly). Stop, report, do not proceed.
  - Random timeouts / child_process hangs → `pool: 'forks'` not set in vitest.config.ts. Recheck Task 1.
  - Genuinely new failures beyond the 3 known detect.test.mjs ones → investigate, but do NOT modify test bodies to make them pass. The principle is 1:1 behavior preservation. If a real regression exists, escalate to the user (revision mode may be needed).

  **Commit guidance (for downstream executor — plan-level guidance only, not a task):**
  Task 2 + Task 3 together constitute the test migration. Group commit as: `feat(33-03): migrate 48 root tests + 4 per-package sanity tests to vitest`. Do NOT split the test migration across multiple commits within Plan 03 — the change is atomic.
  </action>
  <verify>
    <automated>for f in tests/notebooklm.test.mjs tests/notebooklm-cli.test.mjs tests/notebooklm-sync.test.mjs tests/notebooklm-sync-per-project.test.mjs tests/notebooklm-search.test.mjs tests/continuation.test.mjs tests/notion-cli.test.mjs; do grep -q "from 'node:test'" "$f" && { echo "FAIL: $f still imports node:test"; exit 1; }; grep -q "assert\.rejects" "$f" && { echo "FAIL: $f still has assert.rejects (should be expect().rejects)"; exit 1; }; grep -q "assert\.doesNotReject" "$f" && { echo "FAIL: $f still has assert.doesNotReject"; exit 1; }; done; pnpm -w vitest run --project root 2>&1 | tee /tmp/vt.log; grep -qE "928 passed" /tmp/vt.log || { echo "FAIL: expected 928 passing tests"; exit 1; }; grep -qE "3 failed" /tmp/vt.log || { echo "FAIL: expected 3 pre-existing failures"; exit 1; }; echo "Baseline preserved: 928 passed, 3 failed"</automated>
  </verify>
  <acceptance_criteria>
    - All 7 Group B files no longer contain `assert.rejects(` — `grep -c "assert\.rejects(" tests/{notebooklm,notebooklm-cli,notebooklm-sync,notebooklm-sync-per-project,notebooklm-search,notion-cli}.test.mjs` → 0 across all
    - All 7 Group B files no longer contain `assert.doesNotReject(` — `grep -c "assert\.doesNotReject(" tests/continuation.test.mjs` → 0
    - All 7 Group B files contain `expect` in their vitest import line — `grep -l "expect" tests/{notebooklm,notebooklm-cli,notebooklm-sync,notebooklm-sync-per-project,notebooklm-search,continuation,notion-cli}.test.mjs` → 7 matches
    - All 7 Group B files contain at least one `.rejects.` or `.resolves.` matcher usage — `grep -lE "(\.rejects\.|\.resolves\.)" tests/{notebooklm,notebooklm-cli,notebooklm-sync,notebooklm-sync-per-project,notebooklm-search,continuation,notion-cli}.test.mjs` → 7 matches
    - **VALIDATION.md 33-03-01 check (THE critical acceptance):** `pnpm -w vitest run --project root` exits 0 (NOTE: vitest exit code is 0 when total fails are acceptable OR 1 when tests fail). D-06 permits 3 pre-existing detect.test.mjs failures. If vitest exits with code 1 reporting ONLY 3 failures all from `tests/detect.test.mjs` with message containing `profile must be null`, THAT is the expected baseline. Executor should interpret:
      - Exit 0 with "928 passed, 0 failed" → ❌ unexpected (detect.test.mjs failures vanished?? needs investigation)
      - Exit 1 with "928 passed, 3 failed, ALL 3 in detect.test.mjs, message mentions profile must be null" → ✅ accepted per D-06
      - Exit 1 with "failed" counts other than 3, or failures in files other than detect.test.mjs → ❌ regression, block
    - **VALIDATION.md 33-03-02 check:** `pnpm -w vitest run --project cds-core` exits 0 (sanity test from Task 1 — confirm still passing after Group B changes)
    - `pnpm -w vitest run --project root --reporter=verbose` output line count for passing tests ≥ 928
    - No test file uses the old `node:test` imports anywhere: `grep -r "from 'node:test'" tests/` → zero matches
    - No test file uses the old `node:assert/strict` imports anywhere: `grep -r "from 'node:assert/strict'" tests/` → zero matches
    - No test body has stray `before(` or `after(` at call-site level: `grep -rE "^\s*before\(" tests/*.test.mjs` → zero matches; `grep -rE "^\s*after\(" tests/*.test.mjs` → zero matches
  </acceptance_criteria>
  <done>
  7 Group B files converted per PATTERNS.md templates. All 48 root tests now run via vitest. Baseline preserved: 928 passing + 3 pre-existing `detect.test.mjs` failures (D-06 lock). Per-package sanity tests still pass. MONO-03 acceptance achieved.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test runner process (vitest) → child processes (execFileSync, spawnSync) | Root tests spawn real subprocesses during install/NotebookLM/hooks tests. `pool: 'forks'` isolation prevents cross-test pollution. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-33-01 | Tampering / Supply chain | `vitest@4.1.4` devDep | accept (already mitigated in Plan 01) | Plan 01's lockfile + audit already cover this. Plan 03 only consumes the pinned vitest, does not add new deps. |
| T-33-02 | — | — | — | Not applicable to Plan 03 (no CI changes). Addressed in 33-04. |
| T-33-03 | — | — | — | Not applicable to Plan 03 (no workspace package publication surface). |
| T-33-EXTRA-01 | Information disclosure (implicit) | Test fixture contents in `tests/` | accept | Test fixtures may contain example paths, fake tokens, or local-user-specific strings. This is unchanged from v0.12 — no new disclosure introduced by the migration. Fixtures are not touched by this plan (D-05 literal: "zero test body rewrites"). |
</threat_model>

<verification>
Phase-level checks for Plan 03 contribution to MONO-03:

1. `pnpm -w vitest run --project root` exits 1 with ONLY the 3 pre-existing `detect.test.mjs` failures (D-06 baseline).
2. Test pass count ≥ 928 in vitest output.
3. All 4 per-package projects (`cds-core`, `cds-cli`, `cds-migrate`, `cds-s3-backend`) exit 0 when run individually.
4. No test file imports from `node:test` or `node:assert/strict`.
5. Root vitest config uses `test.projects` (not `test.workspace`), `pool: 'forks'` for root project, default `threads` for packages.
6. No behavior change: assertions untouched, fixtures untouched, helper modules untouched (1:1 `git diff tests/` on assertion call sites shows zero changes beyond the imports line).
</verification>

<success_criteria>
MONO-03 satisfied: "Running `pnpm test` executes the migrated 928-test suite in parallel per package with zero behavior change." Achieved by: (a) root `vitest.config.ts` projects array unifying root+packages, (b) mechanical Group A/B migration of 48 files preserving assertion semantics, (c) 4 per-package sanity tests proving vitest runs in each workspace, (d) 3 pre-existing detect.test.mjs failures preserved per D-06 lock.

MONO-03 SC#3 "parallel per package" is satisfied in Phase 33 by vitest's `test.projects` array:
the root project (928 tests) runs concurrently with the 4 per-package sanity projects.
Meaningful per-package parallelism for the 928 tests becomes applicable in Phase 34+ when
test files migrate into packages per CONTEXT.md D-01 (scaffold-only → migrate-later).
</success_criteria>

<output>
After completion, create `.planning/phases/33-monorepo-foundation/33-03-SUMMARY.md` listing:
- Files created (9 new: 5 vitest configs + 4 sanity tests)
- Files modified (48 root test files — import swap + before/after rename + Group B body conversions)
- Final `pnpm -w vitest run --project root` output summary: "928 passed, 3 failed (pre-existing, detect.test.mjs), total in 48 files"
- Group A file count (should be 41) vs Group B file count (should be 7)
- Per-package sanity test status (4 × "1 passed")
- Any deviation from spec — ESPECIALLY if any Group B file required a matcher different from the PATTERNS.md templates (report the exact deviation)
- Ready-to-execute status for Plan 04 (CI)
</output>
