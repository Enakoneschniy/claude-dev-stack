# Phase 33: Monorepo Foundation - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 26 new/modified files (12 new scaffold files, 4 modified config files, 48 test files, 1 CI workflow, 1 .gitignore, 1 .npmrc)
**Analogs found:** 3 / 26 (3 codebase analogs; all new config files use research doc patterns — no existing monorepo config to copy from)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `pnpm-workspace.yaml` | config | — | none (first monorepo config) | no analog |
| `tsconfig.base.json` | config | — | none | no analog |
| `tsconfig.json` (root solution) | config | — | none | no analog |
| `vitest.config.ts` | config | — | none | no analog |
| `.npmrc` | config | — | none | no analog |
| `packages/cds-core/package.json` | config | — | root `package.json` (partial) | partial |
| `packages/cds-core/tsconfig.json` | config | — | none | no analog |
| `packages/cds-core/src/index.ts` | utility | — | `lib/shared.mjs` (same role) | partial |
| `packages/cds-core/src/index.test.ts` | test | request-response | `tests/shared.test.mjs` | partial |
| `packages/cds-cli/package.json` | config | — | root `package.json` (partial) | partial |
| `packages/cds-cli/tsconfig.json` | config | — | same as cds-core tsconfig | no analog |
| `packages/cds-cli/src/index.ts` | utility | — | `lib/shared.mjs` | partial |
| `packages/cds-cli/src/index.test.ts` | test | — | `tests/shared.test.mjs` | partial |
| `packages/cds-migrate/package.json` | config | — | root `package.json` (partial) | partial |
| `packages/cds-migrate/tsconfig.json` | config | — | same as cds-core tsconfig | no analog |
| `packages/cds-migrate/src/index.ts` | utility | — | `lib/shared.mjs` | partial |
| `packages/cds-migrate/src/index.test.ts` | test | — | `tests/shared.test.mjs` | partial |
| `packages/cds-s3-backend/package.json` | config | — | root `package.json` (partial) | partial |
| `packages/cds-s3-backend/tsconfig.json` | config | — | same as cds-core tsconfig | no analog |
| `packages/cds-s3-backend/src/index.ts` | utility | — | `lib/shared.mjs` | partial |
| `packages/cds-s3-backend/src/index.test.ts` | test | — | `tests/shared.test.mjs` | partial |
| `package.json` (root — modified) | config | — | itself (existing) | exact |
| `.github/workflows/ci.yml` (replace in-place) | config | event-driven | itself (existing, replaced) | exact |
| `tests/*.test.mjs` (48 files — import swap) | test | request-response | themselves (modified in-place) | exact |
| `.gitignore` (append) | config | — | itself (existing) | exact |
| `.npmrc` | config | — | none | no analog |

---

## Pattern Assignments

### `pnpm-workspace.yaml` (config — no codebase analog)

**Analog:** none — pnpm-native file, first monorepo config in this repo
**Source:** RESEARCH.md Pattern 1 (verified via pnpm docs)

**Complete file pattern:**
```yaml
# Source: RESEARCH.md §Pattern 1 — https://pnpm.io/pnpm-workspace_yaml
packages:
  - 'packages/*'
```

**Key fact:** Root `package.json` does NOT need a `"workspaces"` field. `pnpm-workspace.yaml` alone is sufficient for pnpm. npm/yarn ignore this file.

---

### `tsconfig.base.json` (config — no codebase analog)

**Analog:** none — no TypeScript in the repo today
**Source:** RESEARCH.md §Pattern 3 + §Code Examples "tsconfig.base.json"

**Complete file pattern** (RESEARCH.md lines 613–630):
```jsonc
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

**Why NodeNext over Bundler:** Packages run directly by Node.js without a bundler in Phase 33. NodeNext is correct for direct Node.js execution. Bundler mode would conflict with D-08's deferral of bundler choice to Phase 39. (RESEARCH.md §Alternatives Considered)

---

### `tsconfig.json` (root solution file — no codebase analog)

**Analog:** none
**Source:** RESEARCH.md §Pattern 3 + §Code Examples "Root tsconfig.json"

**Complete file pattern** (RESEARCH.md lines 632–644):
```jsonc
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

**Key fact:** `"files": []` is mandatory — it prevents tsc from including root `.mjs` files in the solution build. Root `tsconfig.json` is purely a solution aggregator; it has no `compilerOptions` or `include`.

---

### `vitest.config.ts` (config — no codebase analog)

**Analog:** none — no vitest in the repo today
**Source:** RESEARCH.md §Pattern 4 + §Code Examples "vitest.config.ts (root — complete)" (lines 538–559)

**Complete file pattern:**
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
          pool: 'forks',   // REQUIRED: root tests use execFileSync/spawnSync
        },
      },
      // Glob discovers each packages/* that has a vitest.config.ts
      'packages/*',
    ],
  },
});
```

**Critical constraints:**
- Use `test.projects` NOT `test.workspace` — `workspace` is deprecated in vitest 3.2+ (RESEARCH.md §Pitfall 4)
- `pool: 'forks'` is mandatory for root tests — they call `execFileSync`, `spawnSync`, `child_process`; worker threads break these (RESEARCH.md §Pitfall 7)
- DO NOT use `globals: true` as a substitute for import swapping — it doesn't replace `node:test` imports (RESEARCH.md §Anti-Patterns)

---

### `packages/cds-core/package.json` (and cds-cli, cds-migrate, cds-s3-backend)

**Analog:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/package.json` (partial — same project, same ESM/module conventions)

**Existing root package.json reference** (lines 1–48):
- `"type": "module"` — ESM-only, matches project constraint
- `"engines": {"node": ">=18"}` — same Node version floor
- `"license": "MIT"` — same license

**Per-package pattern** (RESEARCH.md §Code Examples "Minimal per-package package.json", lines 576–596):
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

**Package-specific variations:**
- `@cds/core` — no workspace deps (base package)
- `@cds/cli` — add `"dependencies": { "@cds/core": "workspace:*" }` (RESEARCH.md §Pattern 2)
- `@cds/migrate` — add `"dependencies": { "@cds/core": "workspace:*" }`
- `@cds/s3-backend` — add `"dependencies": { "@cds/core": "workspace:*" }`

**`workspace:*` protocol** (RESEARCH.md §Pattern 2): Guarantees local resolution, never registry. `pnpm install` links local packages. When pnpm publishes (never for private packages), it replaces `workspace:*` with the actual version.

**`exports` field is mandatory** for TypeScript to resolve `@cds/core` module references at build time (RESEARCH.md §Pitfall 6).

---

### `packages/cds-core/tsconfig.json` (and cds-cli, cds-migrate, cds-s3-backend)

**Analog:** none in codebase
**Source:** RESEARCH.md §Pattern 3 + §Code Examples "Per-package tsconfig.json" (lines 598–611)

**Per-package tsconfig pattern:**
```jsonc
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

**`composite: true` requirements** (RESEARCH.md §Pattern 3):
- Mandates `declaration: true` (inherited from base, but composite enforces it)
- All source files must be matched by `include`
- `rootDir` must be set explicitly

---

### `packages/cds-core/src/index.ts` (and all other packages)

**Analog:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/lib/shared.mjs` (same utility role in the project, different language)

**Stub pattern** (RESEARCH.md §Code Examples "Stub src/index.ts", lines 646–658):
```typescript
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

**Per-package JSDoc variations:**
- `@cds/core` — "agent-dispatcher, Context, CostTracker (Phase 34)"
- `@cds/cli` — "CLI entry points, MCP server (Phase 37)"
- `@cds/migrate` — "sessions-md-to-sqlite migrator (Phase 38)"
- `@cds/s3-backend` — "S3 vault backend (Phase 39+)"

---

### `packages/cds-core/src/index.test.ts` (and all other packages)

**Analog:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/tests/shared.test.mjs` (lines 1–20 — same pattern: import from lib module, run describe/it assertions)

**Existing test analog imports** (`tests/shared.test.mjs` lines 1–8):
```javascript
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
// imports module under test
import { c, ok, fail, ... } from '../lib/shared.mjs';
```

**New package test pattern** (RESEARCH.md §Code Examples "Sanity test", lines 660–671):
```typescript
import { describe, it, expect } from 'vitest';
import { CDS_CORE_VERSION } from './index.js';

describe('@cds/core', () => {
  it('package loads without error', () => {
    expect(CDS_CORE_VERSION).toBe('0.0.0-stub');
  });
});
```

**Note:** Import uses `'./index.js'` not `'./index.ts'` — NodeNext moduleResolution requires explicit `.js` extensions even for `.ts` source files.

---

### Per-package `vitest.config.ts` (inside each `packages/*/`)

**Analog:** none in codebase
**Source:** RESEARCH.md §Code Examples "Per-package vitest.config.ts" (lines 562–574)

**Per-package vitest config pattern:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cds-core',   // change per package: cds-cli, cds-migrate, cds-s3-backend
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

---

### `package.json` (root — modified, NOT rewritten)

**Analog:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/package.json` (itself — modify in-place)

**Current file** (lines 1–48) — fields that MUST NOT change (D-03):
- `"name": "claude-dev-stack"` — do not change
- `"bin": {"claude-dev-stack": "./bin/cli.mjs"}` — do not change
- `"files": [...]` array — do not change (controls npm tarball contents)
- `"dependencies": {"prompts": "^2.4.2"}` — do not change (single runtime dep constraint)

**Fields to ADD:**
```json
{
  "packageManager": "pnpm@10.6.3",
  "devDependencies": {
    "vitest": "4.1.4",
    "typescript": "6.0.2",
    "@types/node": "25.6.0"
  },
  "scripts": {
    "test": "vitest run",
    "build": "tsc --build"
  }
}
```

**Scripts note:** Replace `"test": "node --test tests/*.test.mjs"` with `"test": "vitest run"`. The root vitest config's `projects` array handles both root `.mjs` tests and package `.ts` tests via single `vitest run` invocation.

---

### `.github/workflows/ci.yml` (replace in-place)

**Analog:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/.github/workflows/ci.yml` (itself — replaced in-place per D-12)

**Current file** (lines 1–36 — existing structure to replace):
```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: node --check ...
      - run: npm test
```

**Replacement pattern** (RESEARCH.md §Pattern 6 "GitHub Actions CI workflow", lines 371–449):

The replacement introduces 3 jobs instead of 1:
1. `detect-changes` — `dorny/paths-filter@v4` to output `packages: bool` and `root: bool`
2. `packages-job` — matrix [18,20,22], runs `pnpm --filter "...[origin/main]" run test` only when packages changed
3. `root-tests-job` — matrix [18,20,22], runs `pnpm vitest run tests/` only when lib/bin/hooks/tests changed

**Key action versions** (D-10 verbatim + RESEARCH.md verified):
- `actions/checkout@v4` with `fetch-depth: 0` (mandatory for `--filter '[origin/main]'`)
- `pnpm/action-setup@v4` with `version: 10`
- `actions/setup-node@v4` with `cache: 'pnpm'`

**Complete replacement** (copy directly from RESEARCH.md §Pattern 6, lines 373–449):
```yaml
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
          fetch-depth: 0
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

---

### `tests/*.test.mjs` — import swap migration (48 files)

**Analog:** All 48 files in `/Users/eugenenakoneschniy/Projects/claude-dev-stack/tests/` — modified in-place

**Current import pattern** (from live files, e.g. `tests/shared.test.mjs` line 1–2, `tests/notebooklm.test.mjs` lines 1–2):
```javascript
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
```

**Standard replacement pattern** (RESEARCH.md §Pattern 5 + §Code Examples lines 673–683):

**Group A — files with NO `assert.rejects`/`assert.doesNotReject` (39 of 48 files):**
```javascript
// BEFORE
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// AFTER (adjust named imports to match what each file actually uses)
import { describe, it, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { assert } from 'vitest';
```

Critical rename: `before` → `beforeAll`, `after` → `afterAll` (RESEARCH.md §Pitfall 1).
`beforeEach` and `afterEach` keep the same name.

**Files in Group A that use `before`/`after` (need rename to beforeAll/afterAll):**
Confirmed from live codebase grep (30 files import `before` or `after` from `node:test`):
- `detect.test.mjs`, `project-setup.test.mjs`, `git-scopes.test.mjs`, `adr-bridge.test.mjs`, `project-naming.test.mjs`, `budget.test.mjs`, `notion-config.test.mjs`, `hooks.test.mjs`, `install-gitignore-marker.test.mjs`, `git-conventions-check-hook.test.mjs`, `session-start-marker.test.mjs`, `decisions-cli.test.mjs`, `project-switcher-hook.test.mjs`, `budget-gate.test.mjs`, `session-context.test.mjs`, `idea-capture-trigger.test.mjs`, `install-patches-copy.test.mjs`, `git-conventions.test.mjs`, `install.test.mjs`, `gsd-auto-reapply-patches.test.mjs`, `adr-bridge-session.test.mjs`, `dev-router-hook.test.mjs`, `silent-session-start.test.mjs`, `skills.test.mjs`, `workflow-enforcer.test.mjs` (and others confirmed in grep output above)

**Files in Group A with no before/after (import swap only, no rename needed):**
`cli.test.mjs`, `handoff.test.mjs`, `templates.test.mjs`, `claude-md-status-line.test.mjs`, and others that only import `describe, it`.

**Also need rename of call sites:** Every occurrence of `before(` → `beforeAll(` and `after(` → `afterAll(` inside the test body (not just the import line).

---

**Group B — files with `assert.rejects` or `assert.doesNotReject` (7 files confirmed from grep):**

Files requiring body-level rewrites beyond import swap:
1. `notebooklm.test.mjs` (27 `assert.rejects` calls)
2. `notebooklm-cli.test.mjs` (4 `assert.rejects`)
3. `notebooklm-sync.test.mjs` (4 `assert.rejects`)
4. `notebooklm-sync-per-project.test.mjs` (1 `assert.rejects`)
5. `notebooklm-search.test.mjs` (1 `assert.rejects`, regex style)
6. `continuation.test.mjs` (4 `assert.doesNotReject` calls)
7. `notion-cli.test.mjs` (confirmed via grep)

**Conversion template — `assert.rejects` with callback validator** (RESEARCH.md §Pattern 5 lines 341–355):
```javascript
// BEFORE (node:assert/strict)
await assert.rejects(
  () => nblm.createNotebook('Test'),
  (err) => err instanceof nblm.NotebooklmCliError && /expected/.test(err.message)
);

// AFTER (vitest)
await expect(nblm.createNotebook('Test')).rejects.toSatisfy(
  (err) => err instanceof nblm.NotebooklmCliError && /expected/.test(err.message)
);
// OR if checking only instance type:
await expect(nblm.createNotebook('Test')).rejects.toBeInstanceOf(nblm.NotebooklmCliError);
```

**Conversion template — `assert.doesNotReject`** (RESEARCH.md §Pattern 5 lines 357–366, from `continuation.test.mjs`):
```javascript
// BEFORE
await assert.doesNotReject(() => mod.handleNow());

// AFTER
await expect(mod.handleNow()).resolves.toBeDefined();
```

**Note on `assert.equal` strictness** (RESEARCH.md §Pitfall 2): `node:assert/strict.equal` is `===`. Chai `assert.equal` is `==`. The 675 `assert.equal` calls across these tests compare strings/numbers where `==` and `===` agree — no test failures expected, but this is a documented semantic difference. Files that need strict equality comparison should use `assert.strictEqual` (which IS strict in Chai).

---

### `.gitignore` (append — do NOT rewrite)

**Analog:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/.gitignore` (itself — append only)

**Current content** (lines 1–7):
```
node_modules/
.DS_Store
*.log

# Claude Code local files (per-developer, not committed)
.claude/
```

**Lines to append:**
```gitignore
# Monorepo build artifacts (Phase 33+)
**/dist/
**/*.tsbuildinfo
packages/*/node_modules/
pnpm-debug.log*
```

**Do not add `pnpm-lock.yaml` to .gitignore** — the lockfile MUST be committed so CI `--frozen-lockfile` works (RESEARCH.md §Pitfall 5).

---

### `.npmrc` (new file, optional)

**Analog:** none in codebase
**Source:** pnpm docs convention

**Pattern:**
```ini
# .npmrc — pnpm configuration
shamefully-hoist=false
strict-peer-dependencies=false
```

**Note:** This file is optional for Phase 33. pnpm works without it. Only add if pnpm install raises peer dependency warnings during local setup. Planner may choose to skip or add based on actual `pnpm install` output.

---

## Shared Patterns

### ESM-only constraint (applies to all new files)
**Source:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/package.json` line 27 — `"type": "module"`
**Apply to:** All `packages/*/package.json` files
```json
"type": "module"
```
All packages must be `"type": "module"`. No CJS output. `tsc` emits `.js` (ESM) per NodeNext module setting.

### Import extensions in TypeScript (applies to all `.ts` files)
**Source:** RESEARCH.md §Pitfall 6 / NodeNext module resolution requirement
**Apply to:** All `packages/*/src/*.ts` and `packages/*/src/*.test.ts` files
```typescript
// Import with .js extension even though source file is .ts
import { CDS_CORE_VERSION } from './index.js';  // NOT './index.ts'
```
NodeNext moduleResolution requires explicit file extensions in imports. TypeScript compiles `.ts` → `.js` but the import path must already reference `.js`.

### pnpm `workspace:*` protocol (applies to all inter-package deps)
**Source:** RESEARCH.md §Pattern 2
**Apply to:** `packages/cds-cli/package.json`, `packages/cds-migrate/package.json`, `packages/cds-s3-backend/package.json`
```json
"dependencies": {
  "@cds/core": "workspace:*"
}
```

### vitest import style for new `.ts` tests
**Source:** RESEARCH.md §Code Examples "Sanity test" (lines 660–671)
**Apply to:** All `packages/*/src/index.test.ts` files
```typescript
import { describe, it, expect } from 'vitest';
// No 'node:test' or 'node:assert/strict' in new .ts test files
```

---

## No Analog Found

Files with no close match in the codebase (planner uses RESEARCH.md patterns directly):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `pnpm-workspace.yaml` | config | — | First pnpm monorepo config in this repo |
| `tsconfig.base.json` | config | — | No TypeScript in repo today |
| `tsconfig.json` (root solution) | config | — | No TypeScript solution files in repo |
| `vitest.config.ts` | config | — | No vitest in repo today |
| `packages/*/tsconfig.json` (4 files) | config | — | No per-package TS configs in repo |
| `packages/*/vitest.config.ts` (4 files) | config | — | No vitest configs in repo |
| `.npmrc` | config | — | No pnpm config in repo |

---

## Metadata

**Analog search scope:** `/Users/eugenenakoneschniy/Projects/claude-dev-stack/` — all `.mjs`, `.yml`, `.json`, `.gitignore` files
**Files scanned:** 49 test files, 2 workflow files, 1 root package.json, 1 .gitignore, ~36 lib modules
**Pattern extraction date:** 2026-04-16
**Research doc:** `.planning/phases/33-monorepo-foundation/33-RESEARCH.md` — HIGH confidence, all patterns verified via Context7 + npm registry
