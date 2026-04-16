---
plan_id: 33-01-monorepo-scaffolding
phase: 33
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - pnpm-workspace.yaml
  - .npmrc
  - package.json
  - pnpm-lock.yaml
  - packages/cds-core/package.json
  - packages/cds-core/src/index.ts
  - packages/cds-cli/package.json
  - packages/cds-cli/src/index.ts
  - packages/cds-migrate/package.json
  - packages/cds-migrate/src/index.ts
  - packages/cds-s3-backend/package.json
  - packages/cds-s3-backend/src/index.ts
autonomous: true
requirements:
  - MONO-01
user_setup: []
must_haves:
  truths:
    - "Running `pnpm install` from repo root resolves all four packages and links workspace deps (ROADMAP SC#1)"
    - "All 4 `packages/*/package.json` are `private: true` and named `@cds/{core,cli,migrate,s3-backend}` (D-07)"
    - "Root `package.json` `name`, `bin`, `files`, `dependencies` fields are untouched (D-03)"
    - "Root `package.json` gains `packageManager` pin and `devDependencies` for vitest/typescript/@types/node"
    - "`pnpm-lock.yaml` is committed so CI `--frozen-lockfile` will succeed (Pitfall 5)"
  artifacts:
    - path: "pnpm-workspace.yaml"
      provides: "pnpm workspace declaration"
      contains: "packages:"
    - path: ".npmrc"
      provides: "pnpm config (shamefully-hoist off, strict-peer off)"
    - path: "packages/cds-core/package.json"
      provides: "@cds/core package manifest"
      contains: '"name": "@cds/core"'
    - path: "packages/cds-cli/package.json"
      provides: "@cds/cli package manifest with workspace:* dep on @cds/core"
      contains: '"@cds/core": "workspace:*"'
    - path: "packages/cds-migrate/package.json"
      provides: "@cds/migrate package manifest with workspace:* dep on @cds/core"
      contains: '"@cds/core": "workspace:*"'
    - path: "packages/cds-s3-backend/package.json"
      provides: "@cds/s3-backend package manifest with workspace:* dep on @cds/core"
      contains: '"@cds/core": "workspace:*"'
    - path: "packages/cds-core/src/index.ts"
      provides: "Stub placeholder export"
      contains: "CDS_CORE_VERSION"
    - path: "pnpm-lock.yaml"
      provides: "Frozen lockfile for CI reproducibility"
  key_links:
    - from: "root package.json devDependencies"
      to: "vitest@4.1.4, typescript@6.0.2, @types/node@25.6.0"
      via: "pnpm install"
      pattern: '"vitest":\s*"4\.1\.4"'
    - from: "pnpm-workspace.yaml"
      to: "packages/*/"
      via: "pnpm workspace resolution"
      pattern: "packages/\\*"
    - from: "packages/cds-{cli,migrate,s3-backend}/package.json"
      to: "@cds/core (workspace link)"
      via: "workspace:* protocol"
      pattern: '"@cds/core":\s*"workspace:\*"'
---

<objective>
Scaffold a pnpm workspaces monorepo inside `claude-dev-stack` — declare the workspace, create the 4 private packages (`@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`) with stub `src/index.ts`, add tooling devDependencies (vitest/typescript/@types/node), pin pnpm via `packageManager`, and generate `pnpm-lock.yaml`. No existing code moves, no tests run yet — this plan is pure structural groundwork for Plans 02/03/04.

Purpose: satisfy MONO-01 (pnpm workspace with 4 packages resolving via `pnpm install`). Scaffold-only per D-01: `lib/`, `bin/`, `tests/`, `hooks/`, `skills/`, `templates/` untouched.

Output: `pnpm-workspace.yaml`, `.npmrc`, 4 `packages/*/` trees with `package.json` + `src/index.ts` stub each, modified root `package.json` (devDependencies + scripts placeholder only), committed `pnpm-lock.yaml`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/33-monorepo-foundation/33-CONTEXT.md
@.planning/phases/33-monorepo-foundation/33-RESEARCH.md
@.planning/phases/33-monorepo-foundation/33-PATTERNS.md
@.planning/phases/33-monorepo-foundation/33-VALIDATION.md
@./CLAUDE.md
@./package.json
@./.gitignore

<interfaces>
<!-- Existing root package.json fields that MUST stay untouched (D-03 locked). -->
<!-- Executor should preserve these byte-for-byte except for adding the three new top-level fields (packageManager, devDependencies, scripts.test placeholder). -->

From root `package.json` (as it exists today, v0.12.1):
```json
{
  "name": "claude-dev-stack",
  "version": "0.12.1",
  "bin": { "claude-dev-stack": "./bin/cli.mjs" },
  "type": "module",
  "engines": { "node": ">=18" },
  "dependencies": { "prompts": "^2.4.2" },
  "publishConfig": { "provenance": true, "access": "public" },
  "files": ["bin/", "lib/", "hooks/", "patches/", "skills/", "templates/", "README.md", "LICENSE"]
}
```

All of the above fields MUST be preserved. ONLY the following fields are added/modified:
- `packageManager`: NEW — `"pnpm@10.6.3"`
- `devDependencies`: NEW — `{ "vitest": "4.1.4", "typescript": "6.0.2", "@types/node": "25.6.0" }`
- `scripts`: MODIFY — replace `"test": "node --test tests/*.test.mjs"` with `"test": "vitest run"` (so Plan 03 root test migration works; vitest binary is installed in this plan; actual vitest.config.ts lands in Plan 03 but the script name is updated here so `pnpm test` doesn't 404 between plans).
- `scripts.build`: NEW — `"build": "tsc --build"` (so Plan 02 can invoke `pnpm build`; tsc binary installed here, tsconfigs land in Plan 02).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create pnpm-workspace.yaml, .npmrc, and 4 scaffold packages</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md §"pnpm-workspace.yaml", §"packages/cds-core/package.json (and cds-cli, cds-migrate, cds-s3-backend)", §".npmrc", §"Stub src/index.ts"
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pattern 1: pnpm-workspace.yaml", §"Pattern 2: workspace:* protocol", §"Code Examples: Minimal per-package package.json", §"Stub src/index.ts"
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md §decisions (D-07: private @cds/* names, D-09: option-preserving)
  </read_first>
  <files>
    - pnpm-workspace.yaml (new)
    - .npmrc (new)
    - packages/cds-core/package.json (new)
    - packages/cds-core/src/index.ts (new)
    - packages/cds-cli/package.json (new)
    - packages/cds-cli/src/index.ts (new)
    - packages/cds-migrate/package.json (new)
    - packages/cds-migrate/src/index.ts (new)
    - packages/cds-s3-backend/package.json (new)
    - packages/cds-s3-backend/src/index.ts (new)
  </files>
  <action>
  Create all 10 new files below exactly as specified.

  **File 1: `pnpm-workspace.yaml`** (repo root):
  ```yaml
  packages:
    - 'packages/*'
  ```

  **File 2: `.npmrc`** (repo root):
  ```ini
  # .npmrc — pnpm configuration for claude-dev-stack monorepo
  shamefully-hoist=false
  strict-peer-dependencies=false
  save-workspace-protocol=rolling
  ```
  `save-workspace-protocol=rolling` (per guidance) makes pnpm write `workspace:*` rather than a pinned version when adding workspace deps.

  **File 3: `packages/cds-core/package.json`** (base package, no workspace deps):
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

  **File 4: `packages/cds-core/src/index.ts`**:
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

  **Files 5–10: the remaining 3 packages** — each has the same per-package shape as cds-core EXCEPT they add `@cds/core` as a workspace dependency.

  `packages/cds-cli/package.json`:
  ```json
  {
    "name": "@cds/cli",
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
    },
    "dependencies": {
      "@cds/core": "workspace:*"
    }
  }
  ```

  `packages/cds-cli/src/index.ts`:
  ```typescript
  /**
   * @cds/cli — CLI entry points and MCP server for claude-dev-stack.
   *
   * Phase 33 stub. Real implementation in Phase 37+:
   * - MCP server (MCP-01/02)
   * - CLI subcommand wiring migrated from bin/install.mjs + lib/install/*
   */
  export const CDS_CLI_VERSION = '0.0.0-stub';
  ```

  `packages/cds-migrate/package.json`:
  ```json
  {
    "name": "@cds/migrate",
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
    },
    "dependencies": {
      "@cds/core": "workspace:*"
    }
  }
  ```

  `packages/cds-migrate/src/index.ts`:
  ```typescript
  /**
   * @cds/migrate — Markdown → SQLite session backfill for claude-dev-stack.
   *
   * Phase 33 stub. Real implementation in Phase 38:
   * - sessions-md-to-sqlite migrator (MIGRATE-01)
   * - CLI subcommand `claude-dev-stack migrate sessions` (MIGRATE-02)
   */
  export const CDS_MIGRATE_VERSION = '0.0.0-stub';
  ```

  `packages/cds-s3-backend/package.json`:
  ```json
  {
    "name": "@cds/s3-backend",
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
    },
    "dependencies": {
      "@cds/core": "workspace:*"
    }
  }
  ```

  `packages/cds-s3-backend/src/index.ts`:
  ```typescript
  /**
   * @cds/s3-backend — S3-backed vault backend for claude-dev-stack.
   *
   * Phase 33 stub. Real implementation deferred (SEED-003, v1.1+):
   * - S3 adapter for vault/projects/*/sessions.db sync
   */
  export const CDS_S3_BACKEND_VERSION = '0.0.0-stub';
  ```

  All paths are relative to repo root. Use `mkdir -p packages/cds-core/src packages/cds-cli/src packages/cds-migrate/src packages/cds-s3-backend/src` first to create parent dirs.
  </action>
  <verify>
    <automated>test -f pnpm-workspace.yaml && test -f .npmrc && test -d packages/cds-core/src && test -d packages/cds-cli/src && test -d packages/cds-migrate/src && test -d packages/cds-s3-backend/src && grep -q '"name": "@cds/core"' packages/cds-core/package.json && grep -q '"name": "@cds/cli"' packages/cds-cli/package.json && grep -q '"name": "@cds/migrate"' packages/cds-migrate/package.json && grep -q '"name": "@cds/s3-backend"' packages/cds-s3-backend/package.json && grep -q '"private": true' packages/cds-core/package.json && grep -q '"@cds/core": "workspace:\*"' packages/cds-cli/package.json && grep -q '"@cds/core": "workspace:\*"' packages/cds-migrate/package.json && grep -q '"@cds/core": "workspace:\*"' packages/cds-s3-backend/package.json && grep -q 'CDS_CORE_VERSION' packages/cds-core/src/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f pnpm-workspace.yaml` → exits 0
    - `test -f .npmrc` → exits 0
    - `grep -c "packages:" pnpm-workspace.yaml` → ≥ 1
    - `grep -c "'packages/\*'" pnpm-workspace.yaml` → 1
    - `grep -c "shamefully-hoist=false" .npmrc` → 1
    - For each pkg in `{cds-core, cds-cli, cds-migrate, cds-s3-backend}`:
      - `test -d packages/$pkg/src` → exits 0
      - `test -f packages/$pkg/package.json` → exits 0
      - `test -f packages/$pkg/src/index.ts` → exits 0
      - `grep -q '"private": true' packages/$pkg/package.json` → exits 0
      - `grep -q '"type": "module"' packages/$pkg/package.json` → exits 0
    - `grep -c '"@cds/core": "workspace:\*"' packages/cds-{cli,migrate,s3-backend}/package.json` → 3 lines total (one per non-core pkg)
    - `grep -c '"@cds/core": "workspace:\*"' packages/cds-core/package.json` → 0 (no self-dep)
    - `packages/cds-core/src/index.ts` contains the literal string `CDS_CORE_VERSION` and `'0.0.0-stub'`
  </acceptance_criteria>
  <done>
  10 files created exactly as specified. Names, privacy, workspace dependencies all match spec. No `pnpm install` run yet — that's Task 3.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update root package.json with packageManager, devDependencies, and scripts</name>
  <read_first>
    - ./package.json (current state — version 0.12.1, with `"name": "claude-dev-stack"`, `"bin"`, `"files"` arrays)
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md §"package.json (root — modified, NOT rewritten)" — explicit "fields that MUST NOT change" list
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Standard Stack" — exact versions: vitest@4.1.4, typescript@6.0.2, @types/node@25.6.0
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md §decisions D-03 (no breaking changes), D-04/D-05 (vitest replaces node:test)
  </read_first>
  <files>
    - package.json (modified in-place)
  </files>
  <action>
  Modify root `package.json` IN-PLACE. Preserve all existing fields byte-for-byte. Add three new top-level fields and replace one scripts value.

  **Fields that MUST NOT change (D-03 lock):**
  - `"name": "claude-dev-stack"`
  - `"version"`, `"description"`, `"keywords"`, `"author"`, `"license"`, `"repository"`
  - `"bin": { "claude-dev-stack": "./bin/cli.mjs" }`
  - `"type": "module"`
  - `"engines": { "node": ">=18" }`
  - `"dependencies": { "prompts": "^2.4.2" }` (single-runtime-dep constraint)
  - `"publishConfig"`
  - `"files"` array (controls npm tarball — adding `packages/` here would ship stubs; DO NOT touch)

  **Fields to ADD / REPLACE:**

  1. Add `"packageManager": "pnpm@10.6.3"` (per PATTERNS.md and guidance — pins pnpm version via Corepack).

  2. Replace existing `"scripts"` block:
     ```json
     "scripts": {
       "test": "vitest run",
       "build": "tsc --build"
     }
     ```
     Rationale: `scripts.test` moves from `node --test tests/*.test.mjs` to `vitest run` — Plan 03 migrates the test files and adds `vitest.config.ts`. Between Plans 01 and 03, `pnpm test` will not find tests (no vitest.config.ts yet) but that's expected — vitest binary is installed in this task (Task 3) and script name needs to be updated here so the switch is atomic with vitest install. Do NOT keep the old `node --test` invocation.

  3. Add `"devDependencies"`:
     ```json
     "devDependencies": {
       "vitest": "4.1.4",
       "typescript": "6.0.2",
       "@types/node": "25.6.0"
     }
     ```
     Versions verified in RESEARCH.md §Standard Stack (npm registry query dated 2026-04-16).

  **Concrete full replacement `package.json` (copy verbatim, including all preserved fields):**
  ```json
  {
    "name": "claude-dev-stack",
    "version": "0.12.1",
    "description": "One command to set up a complete AI-powered development workflow with Claude Code. Persistent memory, session management, 35+ CLI tools.",
    "keywords": [
      "claude-code",
      "claude-skills",
      "obsidian",
      "notebooklm",
      "dev-workflow",
      "context-engineering",
      "session-management",
      "ai-development"
    ],
    "author": "coremind s.r.o.",
    "license": "MIT",
    "repository": {
      "type": "git",
      "url": "https://github.com/Enakoneschniy/claude-dev-stack"
    },
    "packageManager": "pnpm@10.6.3",
    "scripts": {
      "test": "vitest run",
      "build": "tsc --build"
    },
    "bin": {
      "claude-dev-stack": "./bin/cli.mjs"
    },
    "type": "module",
    "engines": {
      "node": ">=18"
    },
    "dependencies": {
      "prompts": "^2.4.2"
    },
    "devDependencies": {
      "vitest": "4.1.4",
      "typescript": "6.0.2",
      "@types/node": "25.6.0"
    },
    "publishConfig": {
      "provenance": true,
      "access": "public"
    },
    "files": [
      "bin/",
      "lib/",
      "hooks/",
      "patches/",
      "skills/",
      "templates/",
      "README.md",
      "LICENSE"
    ]
  }
  ```

  Write this to `package.json` exactly.
  </action>
  <verify>
    <automated>node -e "const p=require('./package.json'); if(p.name!=='claude-dev-stack')throw'name changed'; if(p.bin['claude-dev-stack']!=='./bin/cli.mjs')throw'bin changed'; if(!p.packageManager||!p.packageManager.startsWith('pnpm@'))throw'packageManager missing'; if(p.devDependencies.vitest!=='4.1.4')throw'vitest version wrong'; if(p.devDependencies.typescript!=='6.0.2')throw'typescript version wrong'; if(p.devDependencies['@types/node']!=='25.6.0')throw'@types/node wrong'; if(p.scripts.test!=='vitest run')throw'test script wrong'; if(p.scripts.build!=='tsc --build')throw'build script wrong'; if(p.dependencies.prompts!=='^2.4.2')throw'prompts dep changed'; if(!p.files.includes('bin/')||!p.files.includes('lib/'))throw'files array changed'; if(p.files.includes('packages/'))throw'FATAL packages/ in files array'; console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `jq -r '.name' package.json` → `claude-dev-stack` (unchanged)
    - `jq -r '.bin."claude-dev-stack"' package.json` → `./bin/cli.mjs` (unchanged)
    - `jq -r '.packageManager' package.json` → starts with `pnpm@`
    - `jq -r '.devDependencies.vitest' package.json` → `4.1.4`
    - `jq -r '.devDependencies.typescript' package.json` → `6.0.2`
    - `jq -r '.devDependencies["@types/node"]' package.json` → `25.6.0`
    - `jq -r '.scripts.test' package.json` → `vitest run`
    - `jq -r '.scripts.build' package.json` → `tsc --build`
    - `jq -r '.dependencies.prompts' package.json` → `^2.4.2` (single-dep preserved)
    - `jq -r '.files | contains(["bin/","lib/","hooks/","patches/","skills/","templates/","README.md","LICENSE"])' package.json` → `true`
    - `jq -r '.files | contains(["packages/"])' package.json` → `false` (packages MUST NOT ship in tarball per D-03)
  </acceptance_criteria>
  <done>
  Root `package.json` updated in place. All D-03-protected fields preserved verbatim. `packageManager`, `devDependencies`, and new `scripts` added. The npm tarball still ships exactly what it shipped in v0.12.1.
  </done>
</task>

<task type="auto">
  <name>Task 3: Run pnpm install, generate and commit pnpm-lock.yaml, verify workspace resolution</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pitfall 5: pnpm-lock.yaml not committed" — MUST commit lockfile
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pattern 2: workspace:* protocol" — pnpm install creates local symlinks for @cds/* refs
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md §"Integration Points" — package-lock.json may exist from v0.12.x; keep or delete, pnpm ignores either way
  </read_first>
  <files>
    - pnpm-lock.yaml (generated by pnpm install, then committed)
    - node_modules/ (generated, gitignored in Plan 04; do NOT commit)
    - packages/*/node_modules (generated via pnpm's hoisted store symlinks)
  </files>
  <action>
  Run `pnpm install` to resolve the workspace, generate `pnpm-lock.yaml`, and verify the `@cds/*` workspace links are in place.

  **Steps:**

  1. Confirm `pnpm` is available: `pnpm --version` (should print a semver; Corepack may auto-install 10.6.3 per `packageManager` field from Task 2).

  2. Run `pnpm install` from repo root. Expected behavior:
     - pnpm reads `pnpm-workspace.yaml` → discovers 4 packages
     - pnpm reads `.npmrc` → applies `shamefully-hoist=false`, `save-workspace-protocol=rolling`
     - pnpm resolves `prompts@^2.4.2` (single runtime dep)
     - pnpm resolves `vitest@4.1.4`, `typescript@6.0.2`, `@types/node@25.6.0` (devDeps)
     - pnpm creates `node_modules/.pnpm/` content-addressed store
     - pnpm symlinks `packages/cds-{cli,migrate,s3-backend}/node_modules/@cds/core` → `packages/cds-core`
     - pnpm generates `pnpm-lock.yaml` at repo root

  3. Verify the install produced expected output:
     - `pnpm ls --depth 0` from repo root should list the workspace packages (`@cds/core`, `@cds/cli`, `@cds/migrate`, `@cds/s3-backend`) plus `prompts` and `vitest`/`typescript`/`@types/node`.
     - `pnpm ls --filter @cds/cli --depth 0` should show `@cds/core` linked via workspace protocol.

  4. Verify no package-confusion risk (T-33-03 threat mitigation): after install, inspect `packages/cds-cli/node_modules/@cds/core` is a symlink to `packages/cds-core` within the workspace (NOT a tarball from npm). Run:
     ```
     readlink packages/cds-cli/node_modules/@cds/core
     ```
     Expected output: a relative path pointing into the workspace (e.g. `../../../cds-core` or `../../.pnpm/...`). This proves pnpm refused to resolve `@cds/core` from a public registry.

  5. Commit `pnpm-lock.yaml` to git. Do NOT commit `node_modules/` (gitignored by existing .gitignore `node_modules/` entry). Do NOT delete the existing `package-lock.json` in this task — Plan 04 decides whether to remove it after CI is verified.

  **If `pnpm install` fails:** Report the failure and stop. Most likely causes and fixes:
  - `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE`: use `pnpm install` WITHOUT `--frozen-lockfile` (this is first-ever install, lockfile is being generated).
  - `ERR_PNPM_UNSUPPORTED_ENGINE` for `pnpm@10.6.3`: verify Node >= 18. Upgrade local Node if needed — do not downgrade pnpm.
  - Peer dependency warnings: acceptable (we set `strict-peer-dependencies=false` in .npmrc).
  - Disk space error in `~/.pnpm-store`: user issue, escalate.

  **Supply chain note (T-33-01 mitigation):** The lockfile records the exact resolved tarball integrity hashes for every dep. After install, `pnpm audit --prod --audit-level high` should be run (informational — acceptable criteria is "no HIGH or CRITICAL advisories"). If high/critical advisories exist in `prompts` or `vitest`, escalate to the user before committing the lockfile. Low/moderate advisories are accepted for Phase 33.
  </action>
  <verify>
    <automated>pnpm install && test -f pnpm-lock.yaml && pnpm ls --depth 0 --filter @cds/core --json | grep -q '"name": "@cds/core"' && pnpm ls --depth 0 --filter @cds/cli --json | grep -q '"@cds/core"' && readlink packages/cds-cli/node_modules/@cds/core | grep -qE '(\.pnpm|cds-core)' && pnpm audit --prod --audit-level high || true</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm install` exit code = 0
    - `test -f pnpm-lock.yaml` exits 0
    - `pnpm ls --depth 0 --filter @cds/core --json` JSON contains `"name": "@cds/core"` and `"version": "0.0.1"`
    - `pnpm ls --depth 0 --filter @cds/cli --json` output contains reference to `@cds/core` (workspace dep resolved)
    - `packages/cds-cli/node_modules/@cds/core` exists as a symlink (verifiable via `test -L` OR `readlink` returns a path containing `cds-core` OR `.pnpm` — either proves local resolution, no public registry fetch)
    - `node_modules/vitest/package.json` exists and has `"version": "4.1.4"`
    - `node_modules/typescript/package.json` exists and has `"version": "6.0.2"`
    - `pnpm audit --prod --audit-level high` reports 0 high/critical advisories (low/moderate are accepted)
    - `pnpm-lock.yaml` is committed to git (staged for Plan 01 commit)
    - Test baseline preservation signal: `node --test tests/shared.test.mjs` still runs successfully (just a smoke check — the real vitest migration is Plan 03, but existing `node:test` infrastructure should be untouched by this plan)
  </acceptance_criteria>
  <done>
  `pnpm install` succeeded. 4 workspace packages linked. `pnpm-lock.yaml` generated and committed. No high/critical supply-chain advisories. T-33-01 (supply chain) and T-33-03 (private scope confusion) threats mitigated by lockfile + verified local workspace symlinks.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry → local `node_modules` | Untrusted tarball downloads cross here. Mitigated by `pnpm-lock.yaml` integrity hashes. |
| `@cds/*` scope → local workspace vs public npm | Unclaimed public scope is an attack surface if pnpm ever resolves outside workspace. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-33-01 | Tampering / Supply chain | root `package.json` devDependencies (vitest, typescript, @types/node) | mitigate | Pin exact versions (no `^` or `~`) so `pnpm-lock.yaml` records exact integrity hashes. Run `pnpm audit --prod --audit-level high` after install — block commit if HIGH/CRITICAL advisory present. No typosquat risk: all three packages are first-party Microsoft/Vitest-team maintained. Acceptance criterion in Task 3 explicitly checks audit output. |
| T-33-02 | — (deferred to Plan 04) | GitHub Actions token | — | Not applicable to Plan 01 — no CI changes here. Addressed in 33-04. |
| T-33-03 | Spoofing / Dependency confusion | `@cds/*` workspace deps | mitigate | All 4 package.jsons set `"private": true` preventing accidental publish. `.npmrc` has `save-workspace-protocol=rolling` ensuring pnpm writes `workspace:*` protocol in package.jsons. Task 3 acceptance criterion verifies `packages/cds-cli/node_modules/@cds/core` is a symlink into the workspace (not a registry tarball) via `readlink`. If an attacker ever claims `@cds/core` on public npm, pnpm still prefers the workspace match — `workspace:*` protocol is unambiguous. If workspace resolution ever broke, `"private": true` on cds-core would prevent `npm publish` from leaking our own code, and the consumer packages would refuse to install because `workspace:*` has no fallback semver. |
</threat_model>

<verification>
Phase-level checks for Plan 01 contribution to MONO-01:

1. `pnpm install` from repo root exits 0.
2. `pnpm ls --depth 0` lists 4 `@cds/*` workspace packages plus root deps.
3. `pnpm-lock.yaml` is committed.
4. Workspace `@cds/core` dep in consumer packages resolves to local symlink (not npm tarball).
5. Root `package.json` `files`, `bin`, `name`, `dependencies.prompts` unchanged (D-03 lock).
6. No HIGH or CRITICAL security advisories in `pnpm audit --prod`.
</verification>

<success_criteria>
MONO-01 satisfied: "Running `pnpm install` from repo root resolves all four packages (`cds-core`, `cds-cli`, `cds-migrate`, `cds-s3-backend`) and links workspace deps." Plan 01 is the sole contributor to this criterion; Plans 02/03/04 build on top.
</success_criteria>

<output>
After completion, create `.planning/phases/33-monorepo-foundation/33-01-SUMMARY.md` listing:
- Files created (10 new, 1 modified)
- pnpm-lock.yaml hash fragment (for cross-plan verification)
- `pnpm audit` summary (low/moderate/high/critical counts)
- Any deviation from spec (should be zero)
- Ready-to-execute status for Plan 02 (TS project references) and Plan 03 (vitest)
</output>
