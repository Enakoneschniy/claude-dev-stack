# Phase 33: Monorepo Foundation - Research

**Researched:** 2026-04-16
**Domain:** pnpm workspaces, TypeScript project references, vitest, GitHub Actions matrix CI
**Confidence:** HIGH (all key claims verified via Context7 + npm registry + live codebase scan)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 33 is scaffold-only. Root `lib/`, `bin/`, `tests/`, `hooks/`, `skills/`, `templates/` stay exactly as today. 4 new `packages/*/src/` contain only stubs + one sanity test each.
- **D-02:** All migrated code stays `.mjs` → `.ts` decision pushed to Phase 34. Phase 33 does not perform any conversion; TS used only in new scaffold stubs inside `packages/*/src/*.ts`.
- **D-03:** `bin/cli.mjs` remains the published entry point at `package.json` `"bin"`. Root `package.json` keeps `"name": "claude-dev-stack"` and `"files"` array unchanged. No breaking changes for `npx claude-dev-stack` users.
- **D-04:** vitest becomes the single test runner across root + packages. Existing `tests/*.test.mjs` stay where they are — add `vitest.config.ts` that matches `tests/**/*.test.mjs` + `packages/*/src/**/*.test.ts`.
- **D-05:** Migration tactic = node:test compat. Every `tests/*.test.mjs` gets imports swapped from `node:test` / `node:assert/strict` to vitest equivalents. Target: zero test body rewrites, only import + assertion surface changes.
- **D-06:** MONO-03's "zero behavior change" = every test currently passing on `node --test` must pass on vitest. The 3 pre-existing `detect.test.mjs` failures stay untouched.
- **D-07:** All 4 `packages/*/package.json` are `"private": true` with names `@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`. Never published to npm.
- **D-08:** Root `claude-dev-stack` remains the single public npm artifact. Bundler choice deferred to Phase 39.
- **D-09:** `"private": true` + `@cds/` scope is option-preserving — can flip to public with rename sweep only.
- **D-10:** CI uses pnpm native affected detection: `pnpm --filter '...[origin/main]' run <task>`. Requires `actions/checkout` with `fetch-depth: 0`.
- **D-11:** Root `tests/*.test.mjs` guarded separately via `dorny/paths-filter@v3` watching `lib/**`, `bin/**`, `hooks/**`, `tests/**`, `package.json`, `package-lock.json`.
- **D-12:** Matrix = `[node 18, 20, 22] × [affected-packages-job, root-tests-job]`. Both cache pnpm store via `cache: 'pnpm'`. Replaces `.github/workflows/ci.yml` in place.

### Claude's Discretion

- Exact `tsconfig.base.json` compiler options: ESM output (`"module": "ES2022"`, `"moduleResolution": "Bundler"`), strict mode on, `"declaration": true`, `"composite": true`. Final values left to planner.
- Structure of stub `src/index.ts` per package: one placeholder named export + JSDoc describing phase-34+ intent.
- One-sanity-test per package: a trivial `expect(true).toBe(true)` in `src/index.test.ts`.
- Whether root `tests/` directory becomes a workspace "test-harness" package or stays ambient.
- `package.json` root `scripts` composition: exact `"test"` invocation.

### Deferred Ideas (OUT OF SCOPE)

- Moving `lib/*.mjs` → `packages/cds-cli/src/` (Phase 34+)
- Converting `.mjs` → `.ts` (Phase 34+)
- Rewriting tests to vitest idioms (Phase 33 is import+assertion swap only)
- Introducing bundler (Phase 39)
- Publishing config beyond `"private": true` (Phase 39+)
- Any new runtime behavior
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MONO-01 | pnpm workspaces with 4 package dirs + `pnpm-workspace.yaml`, `pnpm install` resolves internal refs | pnpm workspace.yaml syntax verified; workspace:* protocol confirmed |
| MONO-02 | TS project references + `tsc --build` compiles all packages in dependency order, zero errors, ESM output | NodeNext/composite tsconfig pattern confirmed; vitest compat with TS packages verified |
| MONO-03 | vitest replaces node:test; 928 passing tests port with zero behavior change | CRITICAL: import swap strategy documented; assertion surface differences cataloged |
| MONO-04 | GitHub Actions matrix [node 18/20/22] × [changed-only packages]; pnpm cache; frozen-lockfile | Full workflow recipe documented; dorny/paths-filter@v3 syntax confirmed |
</phase_requirements>

---

## Summary

Phase 33 converts a single-package Node.js ESM CLI into a pnpm monorepo with TypeScript project references and vitest — but does NOT move any existing feature code. The complexity lies entirely in three areas: (1) migrating 48 test files from `node:test` + `node:assert/strict` to vitest imports, (2) wiring TypeScript project references for 4 empty stub packages, and (3) structuring a GitHub Actions workflow with split jobs for affected packages vs root tests.

The vitest migration is the highest-risk task. `globals: true` in vitest does NOT replace `node:test` imports — each file still needs its `node:test` imports swapped to vitest imports. More critically, vitest's `assert` module is Chai-based and has semantic differences from `node:assert/strict`: `assert.equal` uses `==` (non-strict) in Chai vs `===` in node:assert/strict, `assert.rejects` with a callback validator `(err) => boolean` is a node:assert-specific API that has no direct Chai equivalent and must be converted to `expect(fn).rejects` patterns. 37 `assert.rejects` calls and 22 `assert.throws` calls exist across 9 files — these require targeted body-level rewrites beyond pure import swap.

The TypeScript configuration decision (CONTEXT.md Claude's Discretion) suggests `"moduleResolution": "Bundler"` but for packages that run directly under Node.js without a bundler, `"moduleResolution": "NodeNext"` (paired with `"module": "NodeNext"`) is technically more correct. Since Phase 33 packages are stub-only and emit nothing meaningful at runtime, either works for this phase, but NodeNext avoids locking in a bundler-assumption that conflicts with D-08's defer of bundler choice.

**Primary recommendation:** Use `"module": "NodeNext"`, `"moduleResolution": "NodeNext"` for composite package tsconfigs; use vitest `projects` array to define two project inline configs (root `.mjs` tests + packages), with explicit `include` patterns to cover both `.mjs` and `.ts` test files. For assert migration, keep `import assert from 'node:assert/strict'` in files where all usages are `assert.ok`, `assert.equal`, `assert.deepEqual`, `assert.match`, `assert.strictEqual`, `assert.notEqual`, `assert.doesNotThrow`, `assert.doesNotMatch` — these all work identically in vitest's assert (Chai). Files using `assert.rejects` with callback validators or `assert.doesNotReject` need targeted conversion to `expect().rejects` / `expect().resolves`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| pnpm workspace setup | Root config | Package configs | pnpm-workspace.yaml + root package.json is the source of truth |
| TypeScript project references | Package tsconfigs | Root tsconfig (solution) | Each package owns its own composite config; root aggregates references |
| vitest config (root tests) | Root vitest.config.ts | — | Root `.mjs` tests are not inside any workspace package |
| vitest config (package tests) | Root vitest.config.ts `projects` | Per-package vitest shim | vitest 4.x `projects` array in root config covers all packages |
| CI workflow | `.github/workflows/ci.yml` | dorny/paths-filter | Replaces existing workflow in-place per D-12 |
| npm tarball | Root `package.json` `files` array | — | `packages/` NOT in files array — workspace dirs excluded from tarball |

---

## Standard Stack

### Core (devDependencies on root package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.4 | Test runner replacing node:test | Native ESM, `.mjs` support, monorepo projects config, Jest-compatible API |
| typescript | 6.0.2 | Type-check stub packages + emit declarations | Latest stable, project references support well-established |
| @types/node | 25.6.0 | Node.js type definitions for .ts stubs | Required for process, fs, path types in package stubs |
| pnpm | 10.6.3 | Package manager (already installed globally) | Already available on dev machine; workspace.yaml is pnpm-native |

[VERIFIED: npm registry — `npm view vitest version` → 4.1.4, `npm view typescript version` → 6.0.2, `npm view @types/node version` → 25.6.0, pnpm already installed at 10.6.3]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pnpm/action-setup | v5.0.0 | GitHub Actions pnpm install | Required for pnpm cache in CI with setup-node |
| dorny/paths-filter | v4.0.1 | Conditional job execution on file changes | Guards root-tests-job per D-11 |
| actions/checkout | v6.0.2 | Repository checkout with full history | Required for `--filter '...[origin/main]'` with `fetch-depth: 0` |
| actions/setup-node | v6.3.0 | Node.js matrix + pnpm store cache | `cache: 'pnpm'` requires pnpm/action-setup to run first |

[VERIFIED: GitHub API releases — checkout@v6.0.2, setup-node@v6.3.0, pnpm/action-setup@v5.0.0, dorny/paths-filter@v4.0.1]

**Note on CI action versions:** Current `.github/workflows/ci.yml` uses `actions/checkout@v5` and `actions/setup-node@v5`. New workflow should use `@v4` for checkout (as specified in D-10 context) or `@v6` (latest). Research recommends using latest stable to avoid future deprecation warnings. D-10 mentions `actions/checkout@v4` — planner should use `@v4` to match the locked decision verbatim.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `"moduleResolution": "NodeNext"` | `"moduleResolution": "Bundler"` | Bundler is appropriate when a bundler handles resolution; NodeNext is correct for packages run directly by Node.js. Phase 33 packages emit nothing meaningful yet, so either works. NodeNext avoids bundler-assumption lock-in. |
| `vitest 4.x` | `vitest 3.x` | v4 is @latest (4.1.4); workspace is deprecated in favor of `projects` in v3.2+. v4 is stable and recommended. |
| `typescript@6.0.2` | `typescript@5.9.3` | TS 6 is @latest and is a "transition release" preparing for TS 7. No breaking changes affect composite/project references. Safe to use. |

**Installation:**
```bash
# In root package.json devDependencies — add:
pnpm add -D vitest typescript @types/node -w
```

---

## Architecture Patterns

### System Architecture Diagram

```
Root (claude-dev-stack/)
├── pnpm-workspace.yaml  ────────────┐
├── tsconfig.base.json               │  references
├── tsconfig.json (solution) ────────┤──> packages/cds-core/tsconfig.json
├── vitest.config.ts                 │    packages/cds-cli/tsconfig.json
│    projects:                       │    packages/cds-migrate/tsconfig.json
│     ├── {name:'root-tests'}  ─>   │    packages/cds-s3-backend/tsconfig.json
│     │   include: tests/**/*.mjs   │
│     └── 'packages/*'  ─────────────┘
│
├── tests/*.test.mjs  (48 files, node:test→vitest import swap)
│
└── packages/
    ├── cds-core/
    │   ├── package.json ("@cds/core", private:true)
    │   ├── tsconfig.json (composite, extends ../../tsconfig.base.json)
    │   └── src/
    │       ├── index.ts  (placeholder export)
    │       └── index.test.ts  (sanity: expect(true).toBe(true))
    ├── cds-cli/         (same pattern, workspace:* dep on @cds/core)
    ├── cds-migrate/     (same pattern)
    └── cds-s3-backend/  (same pattern)

CI: .github/workflows/ci.yml
    jobs:
      detect-changes (dorny/paths-filter@v4)
      packages-job [node 18,20,22] (pnpm --filter '...[origin/main]' run test)
      root-tests-job [node 18,20,22] (vitest run tests/, if: lib|bin|hooks|tests changed)
```

### Recommended Project Structure
```
packages/
├── cds-core/
│   ├── package.json       # {"name":"@cds/core","private":true,"version":"0.0.1"}
│   ├── tsconfig.json      # composite, extends ../../tsconfig.base.json
│   └── src/
│       ├── index.ts       # export const CDS_CORE_VERSION = '0.0.0'; // Phase 34: agent-dispatcher, Context, CostTracker
│       └── index.test.ts  # trivial sanity test
├── cds-cli/
│   ├── package.json       # {"dependencies":{"@cds/core":"workspace:*"}}
│   └── src/index.ts + index.test.ts
├── cds-migrate/
│   └── src/index.ts + index.test.ts
└── cds-s3-backend/
    └── src/index.ts + index.test.ts
```

### Pattern 1: pnpm-workspace.yaml
**What:** Declares workspace package locations. Lives at repo root alongside `package.json`.
**When to use:** Any pnpm monorepo — this is the configuration file pnpm reads to discover packages.

```yaml
# Source: https://pnpm.io/pnpm-workspace_yaml
packages:
  - 'packages/*'
```

**Key fact:** pnpm-workspace.yaml is pnpm-native — npm/yarn ignore it. Root `package.json` does NOT need a `"workspaces"` field when using pnpm. The `pnpm-workspace.yaml` file alone is sufficient. [VERIFIED: pnpm docs]

### Pattern 2: workspace:* protocol for internal deps
**What:** Dependency protocol that guarantees local resolution, never registry.
**When to use:** Any dependency between workspace packages.

```json
// packages/cds-cli/package.json
{
  "name": "@cds/cli",
  "private": true,
  "version": "0.0.1",
  "dependencies": {
    "@cds/core": "workspace:*"
  }
}
```

**`workspace:*`** resolves to whatever version the local package has (ignores semver). This is the standard for internal-only packages. When pnpm publishes (which we never do for private packages), it replaces `workspace:*` with the actual version. [VERIFIED: pnpm workspace docs]

### Pattern 3: TypeScript solution-style project references
**What:** Root tsconfig.json acts as a "solution file" — it has no `include`, only `references`. Per-package tsconfigs use `composite: true`.
**When to use:** Any TS monorepo using `tsc --build` for incremental compilation.

```jsonc
// tsconfig.base.json (shared compiler options)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "esModuleInterop": false,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}

// tsconfig.json (root solution file — NO includes, just references)
{
  "files": [],
  "references": [
    { "path": "packages/cds-core" },
    { "path": "packages/cds-cli" },
    { "path": "packages/cds-migrate" },
    { "path": "packages/cds-s3-backend" }
  ]
}

// packages/cds-core/tsconfig.json (composite per-package)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Key requirement:** `composite: true` mandates that `declaration` defaults to `true` and all source files must be matched by `include`. The `rootDir` must be set explicitly (defaults to tsconfig location otherwise). [VERIFIED: TypeScript docs]

### Pattern 4: vitest config with projects array
**What:** vitest 4.x uses `test.projects` (not the deprecated `test.workspace`) to define multiple test environments in a single root config.
**When to use:** Monorepo with both legacy `.mjs` root tests (needing explicit `include`) and new `.ts` package tests.

```typescript
// vitest.config.ts (at root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      // Project 1: root legacy tests (tests/*.test.mjs)
      {
        test: {
          name: 'root',
          environment: 'node',
          include: ['tests/**/*.test.mjs'],
          pool: 'forks',   // required for spawnSync/execFileSync usage
        },
      },
      // Project 2: all workspace packages (each has its own vitest.config.ts OR
      // is discovered via glob)
      'packages/*',
    ],
  },
});
```

**Critical details:**
- vitest default `include` covers `**/*.{test,spec}.{ts,js,mjs,cjs,tsx,jsx}` — `.mjs` IS included by default [VERIFIED: Context7 vitest writing-tests.md]
- `pool: 'forks'` is required for root tests because they use `execFileSync`, `spawnSync`, `child_process` — these are multi-thread unsafe in `pool: 'threads'` [VERIFIED: Context7 vitest common-errors.md]
- `workspace` option is deprecated in vitest 3.2+ and renamed to `projects` [VERIFIED: Context7 vitest migration.md]

### Pattern 5: import swap for node:test → vitest migration
**What:** The minimum-diff migration path for 48 test files using `node:test` imports.
**When to use:** D-05 strategy — import swap only, zero body rewrites for compatible assertions.

**Standard swap (46 files — everything except `assert.rejects`/`assert.doesNotReject` with callback):**
```javascript
// BEFORE
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// AFTER
import { describe, it, beforeEach, afterEach } from 'vitest';
// Remove before/after from vitest import (they're named beforeAll/afterAll in vitest)
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { assert } from 'vitest';
```

**WARNING — `before`/`after` rename:** `node:test` uses `before` and `after`; vitest uses `beforeAll` and `afterAll`. This is a name change, not just an import swap. All 48 files need to be checked for `before(`/`after(` usage and renamed.

**Count of `before`/`after` usage:**
- 12 files import `before, after`
- 5 files import `before, after, beforeEach`
- 2 files import `before, after, beforeEach, afterEach`
- etc. (see full import inventory below)

**Assertion compatibility matrix:**
| node:assert/strict method | vitest assert (Chai) equivalent | Compatible? |
|--------------------------|--------------------------------|-------------|
| `assert.ok(v)` | `assert.ok(v)` | ✅ Direct |
| `assert.equal(a, b)` | DANGER: Chai `assert.equal` uses `==` not `===` | ⚠️ Functionally differs BUT in practice node:assert/strict files use `assert.equal` for string/number comparisons where `==` and `===` agree. Monitor carefully. |
| `assert.strictEqual(a, b)` | `assert.strictEqual(a, b)` | ✅ Direct |
| `assert.deepEqual(a, b)` | `assert.deepEqual(a, b)` | ✅ Direct |
| `assert.deepStrictEqual(a, b)` | `assert.deepEqual(a, b)` (Chai deep is strict) | ✅ Equivalent |
| `assert.notEqual(a, b)` | `assert.notEqual(a, b)` | ✅ Direct |
| `assert.match(str, regex)` | `assert.match(str, regex)` | ✅ Direct |
| `assert.doesNotMatch(str, regex)` | `assert.doesNotMatch(str, regex)` | ✅ Direct |
| `assert.throws(fn, /regex/)` | `assert.throws(fn, /regex/)` | ✅ Direct |
| `assert.doesNotThrow(fn)` | `assert.doesNotThrow(fn)` | ✅ Direct |
| `assert.rejects(fn, (err) => boolean)` | ❌ No Chai equivalent | ❌ Needs conversion |
| `assert.rejects(fn, /regex/)` | ❌ No Chai equivalent | ❌ Needs conversion |
| `assert.doesNotReject(fn)` | ❌ No Chai equivalent | ❌ Needs conversion |

**Files requiring assert.rejects conversion (9 files):**
- `notebooklm.test.mjs` — 27 `assert.rejects` calls, all with callback `(err) => boolean` validator
- `notebooklm-cli.test.mjs` — 4 `assert.rejects` calls, callback validator style
- `notebooklm-sync.test.mjs` — 4 `assert.rejects` calls, 3 with callback
- `notebooklm-sync-per-project.test.mjs` — 1 `assert.rejects`, callback
- `notebooklm-search.test.mjs` — 1 `assert.rejects`, regex style
- `adr-bridge.test.mjs` — `assert.throws` (sync, passes)
- `session-context.test.mjs` — `assert.throws`, `assert.rejects`
- `handoff.test.mjs` — `assert.throws`
- `continuation.test.mjs` — 4 `assert.doesNotReject` calls

**Conversion template for `assert.rejects` with callback:**
```javascript
// BEFORE (node:assert/strict)
await assert.rejects(
  () => nblm.createNotebook('Test'),
  (err) => err instanceof nblm.NotebooklmCliError && /expected.*notebook/.test(err.message)
);

// AFTER (vitest)
await expect(nblm.createNotebook('Test')).rejects.toSatisfy(
  (err) => err instanceof nblm.NotebooklmCliError && /expected.*notebook/.test(err.message)
);
// OR if just checking instance type:
await expect(nblm.createNotebook('Test')).rejects.toBeInstanceOf(nblm.NotebooklmCliError);
```

**Conversion template for `assert.doesNotReject`:**
```javascript
// BEFORE
await assert.doesNotReject(() => mod.handleNow());

// AFTER
await expect(mod.handleNow()).resolves.not.toThrow();
// OR more idiomatically:
await expect(mod.handleNow()).resolves.toBeDefined();
```

[VERIFIED: vitest assert API via Context7 — Chai assert does not have rejects/doesNotReject. Conversion patterns use vitest's expect().rejects chain.]

### Pattern 6: GitHub Actions CI workflow (D-10/D-11/D-12)

```yaml
# .github/workflows/ci.yml (replaces existing file)
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    outputs:
      packages: ${{ steps.filter.outputs.packages }}
      root: ${{ steps.filter.outputs.root }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v4
        id: filter
        with:
          filters: |
            packages:
              - 'packages/**'
            root:
              - 'lib/**'
              - 'bin/**'
              - 'hooks/**'
              - 'tests/**'
              - 'package.json'
              - 'package-lock.json'
              - 'vitest.config.ts'

  packages-job:
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.packages == 'true' || github.event_name == 'push' }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # Required for --filter '...[origin/main]'
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsc --build
      - run: pnpm --filter "...[origin/main]" run test

  root-tests-job:
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.root == 'true' || github.event_name == 'push' }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run tests/
```

**Known gotcha — `origin/main` on first push:** On the very first push to a brand new branch with no prior commits, `origin/main` must exist as a remote ref. With `fetch-depth: 0`, the full history is fetched including remote branches, so `origin/main` is available. On a PR, `origin/main` is always available. No issue for a non-initial-commit workflow. [VERIFIED: pnpm filter docs — the `...[origin/main]` syntax is exactly as pnpm docs show]

**Known gotcha — no matching packages:** When no packages changed, `pnpm --filter "...[origin/main]" run test` returns successfully with no output (does not error). The `--fail-if-no-match` flag would cause it to error — do NOT add this flag. [VERIFIED: pnpm filter docs]

**Why `push` gets `if: true`:** A direct push to main (after PR merge) should always run full jobs as a safety net. The `|| github.event_name == 'push'` clause ensures protection on the base branch even if no files changed (e.g., merge commit).

### Anti-Patterns to Avoid

- **`"moduleResolution": "Bundler"` with `composite: true`:** Bundler mode is designed for bundled output and recommends `noEmit: true`. For Node.js packages that emit `.js` files for direct execution, NodeNext is correct. [ASSUMED — based on TypeScript docs analysis; acceptable risk since Phase 33 packages are stub-only and don't emit meaningful runtime code]
- **`test.workspace` in vitest.config.ts:** Deprecated in vitest 3.2, will be removed in a future major. Use `test.projects` instead. [VERIFIED: Context7 vitest migration.md]
- **`vitest` + `globals: true` instead of explicit imports:** globals:true makes `describe`/`it`/`expect` available without imports but does NOT replace `node:test` imports in existing files — those still need to be changed. [VERIFIED: Context7 vitest globals.md]
- **`pool: 'threads'` for root tests:** Root tests use `execFileSync`, `spawnSync`, `child_process` extensively. Worker threads break these. Use `pool: 'forks'` for the root-tests project. [VERIFIED: Context7 vitest common-errors.md]
- **Adding `packages/` to root `"files"` array:** The npm tarball is controlled by root `package.json` `"files"` array. `packages/` is NOT in the files array → NOT shipped to npm registry users. Confirmed safe by D-03. [VERIFIED: npm publish behavior with `files` array]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| pnpm store caching in CI | Custom cache step | `cache: 'pnpm'` in setup-node | Automatically hashes pnpm-lock.yaml and caches `$(pnpm store path)` |
| TypeScript incremental build | Custom Makefile/shell scripts | `pnpm tsc --build` | tsc --build handles composite project dependency order natively |
| Affected package detection | Custom git diff + filter script | `pnpm --filter "...[origin/main]"` | pnpm natively diffs against git ref and resolves dependency graph |
| Conditional CI job execution | Complex `if:` expressions with git diff | `dorny/paths-filter@v4` | Well-maintained action, handles PR context, branch pushes, output as simple boolean |
| Workspace dependency linking | `npm link` / symlinks | `workspace:*` protocol in pnpm | pnpm handles linking, version resolution, and publish replacement automatically |

**Key insight:** pnpm's native affected detection is smarter than file-based diff — it understands the workspace dependency graph. If package A depends on package B and B changes, `--filter "...[origin/main]"` automatically includes A's tests even if A's source didn't change.

---

## Runtime State Inventory

Phase 33 is **NOT a rename/refactor phase** — it adds new structure without touching existing runtime state. No runtime state inventory required.

No stored data, live service config, OS-registered state, secrets/env vars, or build artifacts need to change. The only existing state that changes is `package.json` `scripts.test` (from `node --test tests/*.test.mjs` to a pnpm-aware vitest command) and `.github/workflows/ci.yml` (replaced in-place).

---

## Common Pitfalls

### Pitfall 1: `before`/`after` rename (node:test → vitest)
**What goes wrong:** Files importing `before, after` from `node:test` get import-swapped but the function names remain `before()` and `after()`, which don't exist in vitest — vitest uses `beforeAll()`/`afterAll()`.
**Why it happens:** The import swap instruction "change `node:test` to `vitest`" is accurate, but the named exports differ for lifecycle hooks.
**How to avoid:** During import swap, also rename: `before(` → `beforeAll(`, `after(` → `afterAll(`. Note: `beforeEach` and `afterEach` are the same in both.
**Warning signs:** Tests fail with `ReferenceError: before is not defined`.
**Affected files:** All 31+ files that import `before` or `after` from `node:test` (see import inventory).

### Pitfall 2: assert.equal strictness difference
**What goes wrong:** `node:assert/strict.equal` is strict (`===`). Chai `assert.equal` is non-strict (`==`). The import swap `from 'node:assert/strict'` → `import { assert } from 'vitest'` silently changes behavior.
**Why it happens:** vitest's `assert` is Chai's assert — `assert.equal` is defined as `==` in Chai.
**How to avoid:** Files using `assert.equal` on values where type coercion could matter should use `assert.strictEqual` instead after migration (which IS strict in Chai). In practice, the 675 `assert.equal` calls in these tests compare strings or numbers where `==` and `===` agree, but this should be documented as a known semantic change.
**Warning signs:** No immediate test failures (most assertions still pass), but subtle bugs in future tests if `assert.equal` is used to compare objects.

### Pitfall 3: assert.rejects callback validator no Chai equivalent
**What goes wrong:** `assert.rejects(fn, (err) => err instanceof SomeError)` is a node:assert-specific API that accepts a validation callback. Chai's assert has no `rejects` method at all.
**Why it happens:** node:assert/strict has async-aware assertion methods that Chai doesn't have.
**How to avoid:** Convert to `await expect(fn()).rejects.toBeInstanceOf(SomeError)` or `await expect(fn()).rejects.toSatisfy(v => ...)`. This is a body-level change, not just import swap.
**Warning signs:** `TypeError: assert.rejects is not a function` at runtime.
**Affected files:** 9 files with 37 total `assert.rejects` + 4 `assert.doesNotReject` calls (mostly in `notebooklm*.test.mjs` files).

### Pitfall 4: vitest `workspace` deprecation warning in CI output
**What goes wrong:** Using `vitest.workspace.ts` file (the old pattern) or `test.workspace:` key in vitest.config.ts generates deprecation warnings that pollute CI output.
**Why it happens:** vitest 3.2+ deprecated `workspace` in favor of `projects` in the root config.
**How to avoid:** Use `test.projects` array in `vitest.config.ts` directly. Do NOT create a separate `vitest.workspace.ts` file.

### Pitfall 5: pnpm-lock.yaml not committed / frozen-lockfile fails in CI
**What goes wrong:** `pnpm install --frozen-lockfile` fails in CI because `pnpm-lock.yaml` doesn't exist or is out of date.
**Why it happens:** pnpm generates `pnpm-lock.yaml` (not `package-lock.json`) — this file must be committed to git. Current repo has `package-lock.json` from npm; after switching to pnpm, both may exist.
**How to avoid:** After `pnpm install` locally, commit `pnpm-lock.yaml`. The old `package-lock.json` can be deleted (or kept for backward compat — pnpm ignores it).
**Warning signs:** CI fails on `pnpm install --frozen-lockfile` with "Missing lockfile".

### Pitfall 6: TypeScript can't find `@cds/core` from `@cds/cli` during build
**What goes wrong:** `tsc --build` errors: cannot find module `@cds/core` or its type declarations.
**Why it happens:** TypeScript project references require `composite: true` on referenced packages and that the referenced package has been built (declarations must exist in `dist/`). In a clean checkout, `dist/` doesn't exist.
**How to avoid:** `tsc --build` builds packages in dependency order — it will build `@cds/core` before `@cds/cli`. But the `paths` in `tsconfig.base.json` must resolve correctly. Using workspace protocol + NodeNext moduleResolution, TypeScript resolves via the `exports` field in package.json. Add `"exports": {"./": "./dist/"}` to package.json for each package.
**Warning signs:** TS error `Cannot find module '@cds/core' or its corresponding type declarations`.

### Pitfall 7: Root `.mjs` tests running with wrong pool in vitest
**What goes wrong:** Tests that call `execFileSync`, `spawnSync`, or other child_process APIs fail with cryptic errors or segfaults under vitest's default `threads` pool.
**Why it happens:** Node.js worker threads don't inherit the full process environment and some native Node APIs behave differently.
**How to avoid:** Set `pool: 'forks'` for the root tests project config in vitest.config.ts.
**Warning signs:** Tests that pass with `node --test` randomly fail or hang under vitest.

---

## Code Examples

### vitest.config.ts (root — complete)
```typescript
// vitest.config.ts
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
      // Glob discovers each packages/* that has a vitest.config.ts
      'packages/*',
    ],
  },
});
```

### Per-package vitest.config.ts (stub)
```typescript
// packages/cds-core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cds-core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

### Minimal per-package package.json
```json
{
  "name": "@cds/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run"
  }
}
```

### Per-package tsconfig.json (composite)
```jsonc
// packages/cds-core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

### tsconfig.base.json (root)
```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "esModuleInterop": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### Root tsconfig.json (solution file)
```jsonc
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "packages/cds-core" },
    { "path": "packages/cds-cli" },
    { "path": "packages/cds-migrate" },
    { "path": "packages/cds-s3-backend" }
  ]
}
```

### Stub src/index.ts (per package)
```typescript
// packages/cds-core/src/index.ts
/**
 * @cds/core — Core primitives for claude-dev-stack.
 *
 * Phase 33 stub. Real implementation in Phase 34+:
 * - agent-dispatcher (SDK-02)
 * - Context (CORE-01)
 * - CostTracker (CORE-02)
 */
export const CDS_CORE_VERSION = '0.0.0-stub';
```

### Sanity test (per package)
```typescript
// packages/cds-core/src/index.test.ts
import { describe, it, expect } from 'vitest';
import { CDS_CORE_VERSION } from './index.js';

describe('@cds/core', () => {
  it('package loads without error', () => {
    expect(CDS_CORE_VERSION).toBe('0.0.0-stub');
  });
});
```

### Root test import swap (template)
```javascript
// BEFORE (tests/example.test.mjs)
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// AFTER
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { assert } from 'vitest';
// Note: assert.rejects / assert.doesNotReject must be converted separately
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vitest.workspace.ts` file | `test.projects` in root `vitest.config.ts` | vitest 3.2 (Mar 2025) | `workspace` key prints deprecation warning; will error in future major |
| `actions/checkout@v2/v3` with `fetch-depth: 1` | `@v4`+ with `fetch-depth: 0` for affected detection | 2023+ | `fetch-depth: 1` breaks `pnpm --filter "[origin/main]"` — no git history to diff |
| Per-package `vitest.workspace.ts` | Root config with `projects: ['packages/*']` glob | vitest 3.2 | Simpler setup, single config entry point |
| `npm ci` in GitHub Actions | `pnpm install --frozen-lockfile` + pnpm/action-setup | pnpm adoption | pnpm store is ~2-3x faster to restore from cache than npm |
| `node --test` as test runner | vitest | Phase 33 migration | vitest provides parallel execution, per-package reporting, TypeScript support |

**Deprecated/outdated:**
- `test.workspace` key in vitest: deprecated → use `test.projects`
- `actions/checkout@v2`, `@v3`: security fix releases exist, use `@v4`
- `actions/setup-node@v3`: use `@v4`

---

## Existing Test File Inventory

**Confirmed baseline:** 931 total subtests, 927 passing (verified live run 2026-04-16), 3 failing (pre-existing `detect.test.mjs`), 1 skipped (`claude-md-idempotent.test.mjs`).

> Note: REQUIREMENTS.md says "928/931" — the 927 vs 928 discrepancy may be Node 18/20/22 matrix vs local Node 20.12.2. The 3 failures are the same in both counts. Treat 927-928/931 as the acceptable baseline.

**All 48 test files use `node:test` + `node:assert/strict` — confirmed:**
```
import { describe, it, [before, after, beforeEach, afterEach] } from 'node:test';
import assert from 'node:assert/strict';
```

**Import variant breakdown (48 files):**
- 12 files: `{ describe, it, before, after }`
- 12 files: `{ describe, it }`
- 5 files: `{ describe, it, beforeEach, afterEach }`
- 5 files: `{ describe, it, before, after, beforeEach }`
- 2 files: `{ describe, it, beforeEach }`
- 2 files: `{ describe, it, before, beforeEach, after, afterEach }`
- 2 files: `{ describe, it, before, after, beforeEach, afterEach }`
- 2 files: `{ describe, it, after, beforeEach }`
- 1 file: `{ test, describe, beforeEach, afterEach }` (`notion-cli.test.mjs`)
- 1 file: `{ test, describe, before, after }` (`project-naming.test.mjs`)
- 2 others: single extra import variants

**Files that import `test` (not `it`) from node:test:**
- `notion-cli.test.mjs` — imports `test` + `describe`
- `project-naming.test.mjs` — imports `test` + `describe`
These files use `test(...)` calls instead of `it(...)`. In vitest, `test` is a direct alias for `it` — pure rename, same behavior.

**Files with `it.skip`:** 1 file (`claude-md-idempotent.test.mjs` line 174). vitest supports `it.skip` natively. No change needed.

**node:test-specific features used:**
- `before`/`after` (31+ files) → rename to `beforeAll`/`afterAll`
- `it.skip` (1 file) → vitest supports this natively
- No `test.concurrent`, no `describe.concurrent`, no `t.mock.*`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `"moduleResolution": "Bundler"` (CONTEXT.md Claude's Discretion) is viable for composite packages — but research recommends NodeNext. If planner uses Bundler, it should work for Phase 33 stub-only packages but may require revisiting in Phase 34 when real imports happen. | tsconfig pattern | Low for Phase 33 (stub-only), Medium for Phase 34+ |
| A2 | The 927 vs 928 passing test discrepancy between local (Node 20.12.2) and CI (Node 18/20/22 matrix) is environment-specific and does not affect migration. The baseline to preserve is the count on the same Node version. | Test baseline | Low — 3 pre-existing failures are confirmed; 1 additional difference may be Node version sensitivity |
| A3 | Vitest 4.x default include pattern includes `.mjs` files. Confirmed by Context7 vitest docs: "Supported extensions include `.ts`, `.js`, `.mjs`, `.cjs`, `.tsx`, and `.jsx`" — but an explicit `include` in the root-tests project config is recommended for clarity. | vitest config | Low — explicit include removes ambiguity regardless |
| A4 | `assert.equal` semantic difference (Chai `==` vs node:assert/strict `===`) will not cause existing test failures because all 675 usages compare strings/numbers where `==` === `===`. | assert migration | Medium — unverified at individual test level; should be monitored during migration |

---

## Open Questions

1. **Bundler vs NodeNext for tsconfig.base.json**
   - What we know: CONTEXT.md Claude's Discretion says `"moduleResolution": "Bundler"`, research recommends `"NodeNext"` for packages run directly by Node.js
   - What's unclear: Phase 33 packages are stub-only and won't run directly; Phase 39 will bundle them. Does it matter for Phase 33?
   - Recommendation: Planner should use `"NodeNext"` for consistency with the project's Node.js runtime constraint; the stubs emit valid ESM either way. Note the deviation from CONTEXT.md suggestion with a comment.

2. **Root `tests/` as ambient vs pseudo-workspace-package**
   - What we know: CONTEXT.md marks this as Claude's Discretion
   - What's unclear: Keeping root tests ambient (no package.json in tests/) means vitest needs to handle them via root config's `projects` array
   - Recommendation: Keep ambient (no package.json in tests/). The `projects` array in root `vitest.config.ts` handles this cleanly via the `include: ['tests/**/*.test.mjs']` inline config.

3. **pnpm `packageManager` field in root package.json**
   - What we know: pnpm works without this field; Corepack uses it for version pinning
   - What's unclear: Should we add `"packageManager": "pnpm@10.6.3"` to root package.json?
   - Recommendation: Add it — it prevents developers accidentally using npm/yarn and pins the pnpm version for CI. Does not affect npm tarball. [ASSUMED — no explicit decision in CONTEXT.md]

4. **`actions/checkout@v4` vs `@v6`**
   - What we know: D-10 specifies `actions/checkout@v4`; latest is `@v6.0.2`; current CI uses `@v5`
   - Recommendation: Follow D-10 exactly and use `@v4` for the new workflow. Upgrading actions is a separate concern.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | workspace setup, CI | ✓ | 10.6.3 | — |
| node | runtime | ✓ | 20.12.2 (local), CI matrix 18/20/22 | — |
| TypeScript | `tsc --build` | ✗ (not installed) | — | Install as devDep |
| vitest | test runner | ✗ (not installed) | — | Install as devDep |
| git | pnpm filter affected | ✓ | (system) | — |

**Missing dependencies with no fallback:**
- `typescript` — must be installed as devDep in Wave 0
- `vitest` — must be installed as devDep in Wave 0

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` — Wave 0 creates this |
| Quick run command | `pnpm vitest run tests/` (root tests only) |
| Full suite command | `pnpm test` (root + packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MONO-01 | `pnpm install` resolves all 4 packages + links workspace deps | structural | `pnpm install && node -e "require('./packages/cds-core/package.json')"` or `ls packages/*/node_modules` | ❌ Wave 0 — simple shell assertions in Wave 1 |
| MONO-02 | `tsc --build` compiles all packages with zero errors, ESM output | structural | `pnpm tsc --build && ls packages/cds-core/dist/index.js` | ❌ Wave 0 |
| MONO-03 | 927+ tests pass under vitest (same as node:test baseline) | regression | `pnpm vitest run tests/ --reporter=verbose` | ❌ Wave 0 — test files need import swap in Wave 2 |
| MONO-04 | CI matrix triggers on push; pnpm filter excludes unchanged packages | CI | Manual push to feature branch, inspect GH Actions | ❌ Wave 0 — workflow file created in Wave 3 |

**MONO-03 is the hardest validation:** The success criterion is "927+ passing, 3 failing (same 3 as node:test baseline)". The planner must include a sub-task that verifies the exact count before and after migration.

### Sampling Rate
- **Per task commit:** `pnpm vitest run tests/` (root tests, ~65s baseline)
- **Per wave merge:** `pnpm test` (root + packages)
- **Phase gate:** `pnpm install && pnpm tsc --build && pnpm test` all green before PR

### Wave 0 Gaps
- [ ] `vitest.config.ts` — root project config (covers root tests + packages glob)
- [ ] `tsconfig.base.json` — shared TS compiler options
- [ ] `tsconfig.json` — root solution file with references
- [ ] `pnpm-workspace.yaml` — workspace declaration
- [ ] `packages/cds-core/vitest.config.ts` + `tsconfig.json` + `package.json`
- [ ] `packages/cds-cli/vitest.config.ts` + `tsconfig.json` + `package.json`
- [ ] `packages/cds-migrate/vitest.config.ts` + `tsconfig.json` + `package.json`
- [ ] `packages/cds-s3-backend/vitest.config.ts` + `tsconfig.json` + `package.json`
- [ ] devDep install: `pnpm add -D vitest typescript @types/node -w`
- [ ] Root `package.json` scripts update: `"test": "vitest run"` (or pnpm-r invocation)

---

## Security Domain

This phase has no security surface changes — no new runtime code, no new network calls, no auth changes. Security domain section is not applicable.

---

## Sources

### Primary (HIGH confidence)
- `/vitest-dev/vitest` (Context7) — globals, projects config, assert API, pool options, include patterns, migration from workspace to projects, mjs support
- `/websites/pnpm_io` (Context7) — pnpm-workspace.yaml syntax, workspace:* protocol, --filter "[origin/main]" syntax, --fail-if-no-match behavior
- `/microsoft/typescript-website` (Context7) — composite, project references, NodeNext vs Bundler resolution, TS 6.0 changes
- `/actions/setup-node` (Context7) — pnpm cache recipe, matrix setup
- `/pnpm/action-setup` (Context7) — pnpm/action-setup v4 monorepo setup, matrix build
- `/dorny/paths-filter` (Context7) — conditional job execution, filter syntax, output variables
- npm registry (`npm view` commands) — vitest@4.1.4, typescript@6.0.2, @types/node@25.6.0 [VERIFIED live]
- GitHub releases API — checkout@v6.0.2, setup-node@v6.3.0, pnpm/action-setup@v5.0.0, dorny/paths-filter@v4.0.1 [VERIFIED live]
- Live codebase scan — 48 test files, import patterns, assert usage counts, test baseline 927/931 [VERIFIED via grep + `node --test`]

### Secondary (MEDIUM confidence)
- TypeScript 6.0 "transition release" characterization — from Context7 TS docs release notes

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry
- Architecture: HIGH — verified via Context7 official docs + live codebase scan
- Pitfalls: HIGH — `before`/`after` rename and `assert.rejects` callback issues confirmed via direct inspection of test files
- Test migration strategy: HIGH — vitest assert Chai API vs node:assert API differences verified
- CI workflow: HIGH — all action versions and pnpm filter syntax verified

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days; vitest and pnpm are stable, versions unlikely to change)

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 33 |
|-----------|-------------------|
| ESM-only, Node 18+ | vitest must use `environment: 'node'`; tsconfig `module: NodeNext` (not CommonJS); all package.json must have `"type": "module"` |
| Single runtime dep (`prompts` only) | vitest, typescript, @types/node are devDeps only — not in `dependencies`; not shipped in npm tarball |
| Conventional commits | All commits: `feat(monorepo):`, `chore(monorepo):`, etc. |
| No Co-Authored-By | Enforced in commit messages |
| Branching strategy: `phase` | Branch: `gsd/phase-33-monorepo-foundation`, PR-only to main |
| PR-only to main | Never direct commit to main; all work goes through feature branch + GitHub PR |
| `"files"` array unchanged | `packages/` must NOT be added to root `package.json` `"files"` array |
| `bin/cli.mjs` stays as published entry point | Do not modify `"bin"` field in root package.json |
