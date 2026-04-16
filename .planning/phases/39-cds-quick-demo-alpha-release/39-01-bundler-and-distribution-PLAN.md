---
plan_id: 39-01-bundler-and-distribution
phase: 39
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tsup.config.ts
  - package.json
  - bin/cli.mjs
  - pnpm-lock.yaml
  - tests/tsup-config.test.mjs
  - tests/tsup-build.test.mjs
  - tests/version-bump.test.mjs
  - tests/pack-files-array.test.mjs
  - tests/pack-size.test.mjs
  - tests/cli-dispatch.test.mjs
  - tests/node-version-scan.test.mjs
autonomous: true
requirements:
  - RELEASE-01
user_setup: []
must_haves:
  truths:
    - "`tsup.config.ts` exists at repo root with exactly three externals: better-sqlite3, @anthropic-ai/claude-agent-sdk, @modelcontextprotocol/sdk"
    - "`pnpm tsup` produces dist/core/index.js, dist/cli/index.js, dist/cli/quick.js, dist/cli/mcp-server.js, dist/migrate/index.js, dist/migrate/cli.js with corresponding .d.ts sidecars"
    - "Root package.json `version` is exactly `1.0.0-alpha.1`"
    - "Root package.json `engines.node` is `>=20`"
    - "Root package.json `dependencies` adds better-sqlite3@^12.9.0, @anthropic-ai/claude-agent-sdk@^0.2.110, @modelcontextprotocol/sdk@^1.29.0 (prompts@^2.4.2 preserved)"
    - "Root package.json `files` array contains `dist/`, keeps bin/, lib/, hooks/, patches/, skills/, templates/, README.md, LICENSE, NOTICES.md; does NOT contain `packages/` or `.planning/`"
    - "Root package.json `scripts.build` is `tsup` (replaces `tsc --build`); `scripts.test` remains `vitest run`; new `scripts.typecheck` is `tsc --build`"
    - "`bin/cli.mjs` routes `case 'quick':` to dist/cli/quick.js via resolveDistPath helper; `case 'mcp':` serve subcommand routes to dist/cli/mcp-server.js; `case 'migrate':` routes to dist/migrate/cli.js; CDS_DEV=1 redirects to packages/cds-*/dist/"
    - "`pnpm pack --dry-run` produces a tarball whose reported size is under 5_242_880 bytes"
    - "No config file under .github/, root package.json, or .planning/config.json contains `node: 18`, `\"node\": \">=18\"`, or references to Node 18 specifically (D-128)"
  artifacts:
    - path: "tsup.config.ts"
      provides: "tsup bundler configuration — 6 entries, ESM, three externals, sourcemap on, minify off"
      contains: "better-sqlite3"
      min_lines: 25
    - path: "package.json"
      provides: "Root manifest with 1.0.0-alpha.1 version, Node 20+ engine, bundled deps in dependencies, dist/ in files"
      contains: "1.0.0-alpha.1"
    - path: "bin/cli.mjs"
      provides: "CLI dispatcher with resolveDistPath helper + cases for quick/mcp/migrate routing to dist/"
      contains: "resolveDistPath"
    - path: "tests/tsup-config.test.mjs"
      provides: "Asserts tsup.config.ts has three externals + six entries"
      contains: "externals"
    - path: "tests/tsup-build.test.mjs"
      provides: "Runs pnpm tsup, asserts dist/cli/quick.js + mcp-server.js + migrate/cli.js exist and do not inline externals"
      contains: "dist/cli/quick.js"
    - path: "tests/version-bump.test.mjs"
      provides: "Reads package.json, asserts version + engines.node + dependencies presence"
      contains: "1.0.0-alpha.1"
    - path: "tests/pack-files-array.test.mjs"
      provides: "Asserts package.json files array contains dist/ and excludes packages/ and .planning/"
      contains: "dist/"
    - path: "tests/pack-size.test.mjs"
      provides: "Runs pnpm pack --json via execFileSync, asserts tarball size < 5 MB"
      contains: "5242880"
    - path: "tests/cli-dispatch.test.mjs"
      provides: "Exercises bin/cli.mjs resolveDistPath for quick/mcp/migrate, prod and CDS_DEV modes"
      contains: "resolveDistPath"
    - path: "tests/node-version-scan.test.mjs"
      provides: "Uses git ls-files + regex to ensure no 'node: 18' / '>=18' references in active configs (D-128)"
      contains: "node-version"
  key_links:
    - from: "tsup.config.ts"
      to: "packages/cds-core/src/index.ts + cds-cli/src/{quick,mcp-server,index}.ts + cds-migrate/src/{cli,index}.ts"
      via: "entry map — tsup resolves TypeScript sources via workspace packages"
      pattern: "packages/cds-(core|cli|migrate)/src/"
    - from: "bin/cli.mjs resolveDistPath"
      to: "dist/cli/quick.js (prod) OR packages/cds-cli/dist/quick.js (CDS_DEV=1)"
      via: "dynamic import based on CDS_DEV env var"
      pattern: "CDS_DEV"
    - from: "package.json dependencies"
      to: "better-sqlite3, @anthropic-ai/claude-agent-sdk, @modelcontextprotocol/sdk"
      via: "runtime require — externals not bundled"
      pattern: '"better-sqlite3":\s*"\^12\.9\.0"'
    - from: "package.json files"
      to: "dist/ (tsup output)"
      via: "npm pack tarball inclusion"
      pattern: '"dist/"'
---

<objective>
Establish the Phase 39 bundler-and-distribution foundation: tsup bundler config, root package.json alpha bump + dependency relaxation + files array rewrite, bin/cli.mjs routing update to dist/ layout, and D-128 Node 18 sweep. This is Wave 1 — Plans 02/03/04/05 all depend on a working tsup build + version bump.

Purpose: satisfy RELEASE-01 infrastructure (publishable tarball exists) + unlock Plans 02-05 (they consume `dist/cli/quick.js` etc.).

Output: tsup.config.ts (new), modified root package.json + bin/cli.mjs, 7 test files under tests/, frozen pnpm-lock.yaml with tsup as devDependency.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md
@.planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md
@./CLAUDE.md
@./package.json
@./bin/cli.mjs

<interfaces>
CRITICAL state-at-plan-start assumption: Phases 33-38 are merged. That means:
  - packages/cds-core/src/{index,agent-dispatcher,cost-tracker}.ts exists
  - packages/cds-cli/src/{index,mcp-server}.ts exists
  - packages/cds-migrate/src/{index,cli}.ts exists
  - hooks/session-end-capture.{sh,mjs} exists
This plan does NOT create those files — it assumes them. If absent, fail loudly with STATE.md blocker.

Current (pre-phase-39) root package.json preserved fields:
```json
{
  "name": "claude-dev-stack",
  "description": "...",
  "keywords": [...],
  "author": "coremind s.r.o.",
  "license": "MIT",
  "repository": {...},
  "packageManager": "pnpm@10.6.3",
  "bin": { "claude-dev-stack": "./bin/cli.mjs" },
  "type": "module",
  "publishConfig": { "provenance": true, "access": "public" }
}
```

Changed fields (Plan 01 writes):
- `version`: `0.12.1` -> `1.0.0-alpha.1`
- `engines.node`: `>=18` -> `>=20`
- `scripts.build`: `tsc --build` -> `tsup`
- `scripts.typecheck`: NEW -> `tsc --build`
- `scripts.test`: remains `vitest run`
- `dependencies`: add three externals
- `devDependencies`: add `tsup@^8.3.0`
- `files`: rewrite array per D-117

Security note: all new test files use `execFileSync` from `node:child_process` with argv arrays (not `execSync` which invokes shell). This avoids shell injection and matches the repo's safer pattern.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create tsup.config.ts</name>
  <read_first>
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §"tsup.config.ts"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §"Pattern 1"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-115"
    - ./packages/cds-core/src/index.ts (verify exists)
    - ./packages/cds-cli/src/mcp-server.ts (verify — Phase 37 artifact)
    - ./packages/cds-migrate/src/cli.ts (verify — Phase 38 artifact)
  </read_first>
  <files>
    - tsup.config.ts (new)
  </files>
  <action>
  Create `tsup.config.ts` at repo root with EXACTLY the following content (copy verbatim):

  ```ts
  // tsup.config.ts
  // Phase 39 bundler — produces dist/ from packages/cds-*/src sources.
  // Three externals: better-sqlite3 (native addon), @anthropic-ai/claude-agent-sdk
  // (dynamic streaming helpers), @modelcontextprotocol/sdk (transport adapter dynamic imports).
  // Source: .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 1.
  import { defineConfig } from 'tsup';

  export default defineConfig({
    entry: {
      'core/index': 'packages/cds-core/src/index.ts',
      'cli/index': 'packages/cds-cli/src/index.ts',
      'cli/quick': 'packages/cds-cli/src/quick.ts',
      'cli/mcp-server': 'packages/cds-cli/src/mcp-server.ts',
      'migrate/index': 'packages/cds-migrate/src/index.ts',
      'migrate/cli': 'packages/cds-migrate/src/cli.ts',
    },
    format: ['esm'],
    target: 'node20',
    external: [
      'better-sqlite3',
      '@anthropic-ai/claude-agent-sdk',
      '@modelcontextprotocol/sdk',
    ],
    dts: true,
    clean: true,
    outDir: 'dist',
    splitting: false,
    sourcemap: true,
    minify: false,
  });
  ```

  The entry `packages/cds-cli/src/quick.ts` references a file CREATED IN PLAN 02. Creating tsup.config.ts that references it is fine — tsup is not invoked in this task. Task 6 runs tsup AFTER Plan 02 or after creating a stub quick.ts. See Wave Sequencing note at bottom of plan.
  </action>
  <verify>
    <automated>test -f tsup.config.ts && grep -q "better-sqlite3" tsup.config.ts && grep -q "@anthropic-ai/claude-agent-sdk" tsup.config.ts && grep -q "@modelcontextprotocol/sdk" tsup.config.ts && grep -q "'core/index'" tsup.config.ts && grep -q "'cli/quick'" tsup.config.ts && grep -q "'migrate/cli'" tsup.config.ts && grep -q "target: 'node20'" tsup.config.ts && grep -q "splitting: false" tsup.config.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tsup.config.ts` -> exits 0
    - `grep -c "better-sqlite3" tsup.config.ts` -> >= 1
    - `grep -c "@anthropic-ai/claude-agent-sdk" tsup.config.ts` -> >= 1
    - `grep -c "@modelcontextprotocol/sdk" tsup.config.ts` -> >= 1
    - `grep -c "entry:" tsup.config.ts` -> 1
    - `grep -c "external:" tsup.config.ts` -> 1
    - `grep -c "target: 'node20'" tsup.config.ts` -> 1
    - `grep -c "dts: true" tsup.config.ts` -> 1
    - `grep -c "minify: false" tsup.config.ts` -> 1
  </acceptance_criteria>
  <done>
  tsup.config.ts exists with exact content. No tsup run yet — that's Task 6.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update root package.json — version, engines, deps, files, scripts</name>
  <read_first>
    - ./package.json (current state — version 0.12.1, engines.node >=18)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-116" (dependencies), §"D-117" (files)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §"package.json (root — modified)"
  </read_first>
  <files>
    - package.json (modified in-place)
    - pnpm-lock.yaml (regenerated)
  </files>
  <action>
  Modify root `package.json` with the following changes. ALL OTHER FIELDS PRESERVED BYTE-FOR-BYTE.

  1. Change `"version"` field:
     - OLD: `"version": "0.12.1"`
     - NEW: `"version": "1.0.0-alpha.1"`

  2. Change `"engines"` field:
     - OLD: `"engines": { "node": ">=18" }`
     - NEW: `"engines": { "node": ">=20" }`

  3. Change `"scripts"` object — modify `build`, ADD `typecheck`:
     - OLD: `"build": "tsc --build"` (if present)
     - NEW: `"build": "tsup"` + `"typecheck": "tsc --build"`
     - `"test"` stays `"vitest run"`

  4. Replace `"dependencies"` with (alphabetical):
     ```json
     {
       "dependencies": {
         "@anthropic-ai/claude-agent-sdk": "^0.2.110",
         "@modelcontextprotocol/sdk": "^1.29.0",
         "better-sqlite3": "^12.9.0",
         "prompts": "^2.4.2"
       }
     }
     ```

  5. Update `"devDependencies"` — add `tsup`; preserve Phase 33 entries:
     ```json
     {
       "devDependencies": {
         "@types/node": "25.6.0",
         "tsup": "^8.3.0",
         "typescript": "6.0.2",
         "vitest": "4.1.4"
       }
     }
     ```

  6. Replace `"files"` with:
     ```json
     {
       "files": [
         "bin/",
         "dist/",
         "hooks/",
         "lib/",
         "patches/",
         "skills/",
         "templates/",
         "README.md",
         "LICENSE",
         "NOTICES.md"
       ]
     }
     ```
     Include `NOTICES.md` even if not yet present (Phase 34 created it).

  7. Preserve these fields byte-for-byte:
     - `"name"` = "claude-dev-stack"
     - `"description"`, `"keywords"`, `"author"`, `"license"`, `"repository"`
     - `"packageManager"` = "pnpm@10.6.3"
     - `"bin"` = `{ "claude-dev-stack": "./bin/cli.mjs" }`
     - `"type"` = "module"
     - `"publishConfig"` = `{ "provenance": true, "access": "public" }`

  After editing, run `pnpm install` to refresh `pnpm-lock.yaml`. Commit package.json AND pnpm-lock.yaml together.
  </action>
  <verify>
    <automated>node -e 'const p=JSON.parse(require("fs").readFileSync("package.json","utf8"));if(p.version!=="1.0.0-alpha.1"||p.engines.node!==">=20"||!p.dependencies["better-sqlite3"]||!p.dependencies["@anthropic-ai/claude-agent-sdk"]||!p.dependencies["@modelcontextprotocol/sdk"]||!p.dependencies.prompts||!p.devDependencies.tsup||!p.files.includes("dist/")||p.files.includes("packages/")||p.scripts.build!=="tsup"||p.scripts.typecheck!=="tsc --build")process.exit(1)' && test -f pnpm-lock.yaml</automated>
  </verify>
  <acceptance_criteria>
    - `node -e 'const p=require("./package.json");if(p.version!=="1.0.0-alpha.1")process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(p.engines.node!==">=20")process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(!p.dependencies["better-sqlite3"])process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(!p.dependencies["@anthropic-ai/claude-agent-sdk"])process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(!p.dependencies["@modelcontextprotocol/sdk"])process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(!p.dependencies.prompts)process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(!p.devDependencies.tsup)process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(!p.files.includes("dist/"))process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(p.files.includes("packages/"))process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(p.files.includes(".planning/"))process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(p.scripts.build!=="tsup")process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(p.scripts.typecheck!=="tsc --build")process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(p.name!=="claude-dev-stack")process.exit(1)'` -> exits 0
    - `node -e 'const p=require("./package.json");if(p.packageManager!=="pnpm@10.6.3")process.exit(1)'` -> exits 0
    - `test -f pnpm-lock.yaml` -> exits 0
  </acceptance_criteria>
  <done>
  package.json updated in-place with 7 field changes; all others byte-for-byte preserved. pnpm-lock.yaml refreshed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update bin/cli.mjs with resolveDistPath helper + quick/mcp/migrate cases</name>
  <read_first>
    - ./bin/cli.mjs (entire file)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-PATTERNS.md §"bin/cli.mjs dispatch update"
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-118"
  </read_first>
  <files>
    - bin/cli.mjs (modified in-place)
  </files>
  <action>
  Modify `bin/cli.mjs` in-place:

  1. Add imports at top (after the existing header comment, before `const args = process.argv.slice(2);`):

     ```js
     import { fileURLToPath } from 'node:url';
     import path from 'node:path';
     const __dirname = path.dirname(fileURLToPath(import.meta.url));

     /**
      * Resolve bundled dist path. In prod (installed from npm), files are in dist/.
      * In dev (CDS_DEV=1), files are in packages/cds-<pkg>/dist/ for fast iteration
      * without repeat `pnpm tsup`.
      *
      * @param {string} subPath - e.g., "cli/quick.js" or "migrate/cli.js"
      * @returns {string} absolute path
      */
     function resolveDistPath(subPath) {
       const [pkg, ...rest] = subPath.split('/');
       const file = rest.join('/');
       if (process.env.CDS_DEV === '1') {
         return path.join(__dirname, '..', 'packages', `cds-${pkg}`, 'dist', file);
       }
       return path.join(__dirname, '..', 'dist', pkg, file);
     }
     ```

  2. REPLACE the existing `case 'mcp':` block. Current code routes to `lib/mcp.mjs` for catalog. Phase 37 added `mcp serve` subcommand. Phase 39 routes serve to dist/:

     ```js
     case 'mcp': {
       if (args[1] === 'serve') {
         const mcp = await import(resolveDistPath('cli/mcp-server.js'));
         await mcp.main(args.slice(2));
       } else {
         const { main } = await import('../lib/mcp.mjs');
         await main(args.slice(1));
       }
       break;
     }
     ```

  3. ADD/REPLACE `case 'migrate':` block (Phase 38 added it; Phase 39 updates path):

     ```js
     case 'migrate': {
       const migrate = await import(resolveDistPath('migrate/cli.js'));
       await migrate.main(args.slice(1));
       break;
     }
     ```

  4. ADD new `case 'quick':` immediately after `case 'mcp':`:

     ```js
     case 'quick': {
       const quick = await import(resolveDistPath('cli/quick.js'));
       await quick.main(args.slice(1));
       break;
     }
     ```

  5. Add `quick` help entry near the other command sections (before `Meta`):

     ```js
     console.log(`  ${c.cyan}${c.bold}Quick Task${c.reset}`);
     console.log(`    ${c.white}claude-dev-stack quick 'task'${c.reset}         ${c.dim}One-shot agent dispatch with cost report${c.reset}`);
     console.log('');
     ```

  All existing cases (`projects`, `docs`, `skills`, `plugins`, `budget`, `notebooklm`, etc.) MUST remain untouched. File goes from ~294 lines to ~320 lines (net +26).
  </action>
  <verify>
    <automated>grep -q "resolveDistPath" bin/cli.mjs && grep -q "case 'quick':" bin/cli.mjs && grep -q "resolveDistPath('cli/quick.js')" bin/cli.mjs && grep -q "resolveDistPath('cli/mcp-server.js')" bin/cli.mjs && grep -q "resolveDistPath('migrate/cli.js')" bin/cli.mjs && grep -q "CDS_DEV" bin/cli.mjs && grep -q "args\[1\] === 'serve'" bin/cli.mjs && grep -q "fileURLToPath" bin/cli.mjs && grep -q "case 'projects':" bin/cli.mjs && node --check bin/cli.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "function resolveDistPath" bin/cli.mjs` -> 1
    - `grep -c "case 'quick':" bin/cli.mjs` -> 1
    - `grep -c "resolveDistPath('cli/quick.js')" bin/cli.mjs` -> 1
    - `grep -c "resolveDistPath('cli/mcp-server.js')" bin/cli.mjs` -> 1
    - `grep -c "resolveDistPath('migrate/cli.js')" bin/cli.mjs` -> 1
    - `grep -c "CDS_DEV" bin/cli.mjs` -> >= 1
    - `grep -c "args\[1\] === 'serve'" bin/cli.mjs` -> 1
    - `grep -c "fileURLToPath" bin/cli.mjs` -> 1
    - `grep -c "case 'projects':" bin/cli.mjs` -> 1 (preserved)
    - `grep -c "case 'docs':" bin/cli.mjs` -> 1 (preserved)
    - `grep -c "case 'skills':" bin/cli.mjs` -> 1 (preserved)
    - `grep -c "claude-dev-stack quick" bin/cli.mjs` -> >= 1 (help entry)
    - `node --check bin/cli.mjs` -> exits 0
  </acceptance_criteria>
  <done>
  bin/cli.mjs updated with resolveDistPath + 3 dispatch cases + help entry. All existing routing preserved.
  </done>
</task>

<task type="auto">
  <name>Task 4: D-128 — remove remaining Node 18 references in ci.yml</name>
  <read_first>
    - ./.github/workflows/ci.yml
    - ./package.json (just updated in Task 2)
    - .planning/config.json (if exists)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-CONTEXT.md §"D-128"
  </read_first>
  <files>
    - .github/workflows/ci.yml (modified in-place)
  </files>
  <action>
  D-128 cleanup: verify no `node: 18`, `"node": ">=18"`, or `node-version: [18, ...]` remain in active repo config.

  Expected matches (based on Phase 33 ci.yml):
  - `.github/workflows/ci.yml` line ~49 and ~72: matrix `node-version: [18, 20, 22]`

  Fix: REPLACE both `node-version: [18, 20, 22]` occurrences with `node-version: [20, 22]`.

  Verify the rest of the repo is clean using git ls-files to avoid node_modules:

  ```sh
  git ls-files '*.yml' '*.yaml' '*.json' '*.mjs' '*.ts' \
    | grep -v '.planning/phases/' \
    | grep -v '.planning/milestones/' \
    | xargs grep -lE 'node-version:\s*18|node-version:\s*\[\s*18|"node":\s*">=18"' 2>/dev/null \
    || echo "CLEAN"
  ```

  If the grep finds additional files not caught by the expected list, fix each by replacing `18` with `20` as the minimum in any Node version spec.

  Historical `.planning/phases/33-monorepo-foundation/*` context legitimately references Node 18 (as the pre-Phase-33 state). Those are read-only and excluded from the scan. The migration guide (docs/migration-v0-to-v1-alpha.md, Plan 04) intentionally documents the Node 18 -> 20 break and is excluded.
  </action>
  <verify>
    <automated>grep -c "node-version: \[18" .github/workflows/ci.yml; test $? -ne 0 && grep -c "node-version: \[20, 22\]" .github/workflows/ci.yml</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "node-version: \[18" .github/workflows/ci.yml` -> 0 (exit code 1 from grep = no match)
    - `grep -c "node-version: \[20, 22\]" .github/workflows/ci.yml` -> 2 (both matrices updated)
    - `grep -c '">=18"' package.json` -> 0
    - `grep -c '">=20"' package.json` -> 1 (engines.node)
    - No active config file (excluding .planning/phases/, .planning/milestones/, docs/migration-*) matches `node-version: 18` or `"node": ">=18"`
  </acceptance_criteria>
  <done>
  Repo grep-clean of Node 18 references in active configs/workflows. Historical `.planning/phases/*` CONTEXT references preserved.
  </done>
</task>

<task type="auto">
  <name>Task 5: Create tests/tsup-config.test.mjs</name>
  <read_first>
    - ./tsup.config.ts (created in Task 1)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-01-01
  </read_first>
  <files>
    - tests/tsup-config.test.mjs (new)
  </files>
  <action>
  Create `tests/tsup-config.test.mjs` with EXACTLY:

  ```js
  // tests/tsup-config.test.mjs
  // Structural assertions on tsup.config.ts — content-level without executing tsup.
  // Source: Phase 39 VALIDATION §Task 39-01-01
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.join(__dirname, '..', 'tsup.config.ts');
  const configText = readFileSync(configPath, 'utf8');

  describe('tsup.config.ts structure', () => {
    it('declares all three externals', () => {
      expect(configText).toContain("'better-sqlite3'");
      expect(configText).toContain("'@anthropic-ai/claude-agent-sdk'");
      expect(configText).toContain("'@modelcontextprotocol/sdk'");
    });

    it('declares 6 entries (core, cli, cli/quick, cli/mcp-server, migrate, migrate/cli)', () => {
      expect(configText).toContain("'core/index'");
      expect(configText).toContain("'cli/index'");
      expect(configText).toContain("'cli/quick'");
      expect(configText).toContain("'cli/mcp-server'");
      expect(configText).toContain("'migrate/index'");
      expect(configText).toContain("'migrate/cli'");
    });

    it('targets node20 + ESM format', () => {
      expect(configText).toContain("target: 'node20'");
      expect(configText).toContain("format: ['esm']");
    });

    it('emits dts + sourcemap, no minify, no splitting', () => {
      expect(configText).toContain('dts: true');
      expect(configText).toContain('sourcemap: true');
      expect(configText).toContain('minify: false');
      expect(configText).toContain('splitting: false');
    });

    it('outputs to dist/', () => {
      expect(configText).toContain("outDir: 'dist'");
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/tsup-config.test.mjs && pnpm -w vitest run --project root tests/tsup-config.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/tsup-config.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/tsup-config.test.mjs` -> exits 0 + all 5 tests pass
    - `grep -c "describe.*tsup.config" tests/tsup-config.test.mjs` -> 1
  </acceptance_criteria>
  <done>
  tsup-config.test.mjs exists and all 5 structural tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 6: Create tests/tsup-build.test.mjs + placeholder stub for quick.ts</name>
  <read_first>
    - ./tsup.config.ts
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-01-02
  </read_first>
  <files>
    - packages/cds-cli/src/quick.ts (stub — overwritten by Plan 02)
    - tests/tsup-build.test.mjs (new)
  </files>
  <action>
  Step 1 — write the STUB `packages/cds-cli/src/quick.ts` so tsup has something to resolve:

  ```ts
  // packages/cds-cli/src/quick.ts — Plan 01 stub. Plan 02 overwrites with real logic.
  export async function main(args: string[]): Promise<void> {
    void args;
    console.error('cds-quick: not yet implemented (Plan 02 wave pending)');
    process.exit(1);
  }
  ```

  Step 2 — create the integration test. Uses `execFileSync` (not `execSync`) for command invocation to avoid shell-injection patterns:

  ```js
  // tests/tsup-build.test.mjs
  // Integration test: runs `pnpm tsup` via execFileSync (no shell) and asserts bundle outputs.
  // Source: Phase 39 VALIDATION §Task 39-01-02
  import { describe, it, expect, beforeAll } from 'vitest';
  import { execFileSync } from 'node:child_process';
  import { existsSync, readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(__dirname, '..');

  beforeAll(() => {
    // Run tsup via pnpm using execFileSync with argv (no shell).
    execFileSync('pnpm', ['tsup'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  }, 60_000);

  describe('tsup build output', () => {
    const entries = [
      'dist/core/index.js',
      'dist/core/index.d.ts',
      'dist/cli/index.js',
      'dist/cli/index.d.ts',
      'dist/cli/quick.js',
      'dist/cli/quick.d.ts',
      'dist/cli/mcp-server.js',
      'dist/cli/mcp-server.d.ts',
      'dist/migrate/index.js',
      'dist/migrate/index.d.ts',
      'dist/migrate/cli.js',
      'dist/migrate/cli.d.ts',
    ];

    for (const e of entries) {
      it(`produces ${e}`, () => {
        expect(existsSync(path.join(root, e))).toBe(true);
      });
    }

    it('externals are NOT inlined (better-sqlite3 internals, SDK internals)', () => {
      const quick = readFileSync(path.join(root, 'dist/cli/quick.js'), 'utf8');
      // Inlined externals would show large class bodies. Imports from external names are OK.
      expect(quick).not.toMatch(/class DatabaseNapi\s*\{/);
    });

    it('mcp-server.js exports async function main', () => {
      const mcp = readFileSync(path.join(root, 'dist/cli/mcp-server.js'), 'utf8');
      expect(mcp).toMatch(/export\s+(?:async\s+)?function\s+main/);
    });

    it('each bundled js has a sourcemap sidecar', () => {
      const jsFiles = entries.filter((e) => e.endsWith('.js'));
      for (const f of jsFiles) {
        expect(existsSync(path.join(root, f + '.map'))).toBe(true);
      }
    });
  });
  ```

  Wave sequencing: this test runs after Task 1 (tsup.config.ts exists) and after the stub quick.ts exists. The test passes as soon as tsup successfully builds even the stub. Plan 02 later overwrites quick.ts with real logic and reruns this test as regression.
  </action>
  <verify>
    <automated>test -f packages/cds-cli/src/quick.ts && test -f tests/tsup-build.test.mjs && pnpm tsup 2>&1 | tail -5 && test -f dist/cli/quick.js && test -f dist/cli/mcp-server.js && test -f dist/migrate/cli.js && pnpm -w vitest run --project root tests/tsup-build.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-cli/src/quick.ts` -> exits 0 (stub exists)
    - `pnpm tsup` -> exits 0
    - `test -f dist/core/index.js` -> exits 0
    - `test -f dist/cli/quick.js` -> exits 0
    - `test -f dist/cli/mcp-server.js` -> exits 0
    - `test -f dist/migrate/cli.js` -> exits 0
    - `test -f dist/cli/quick.d.ts` -> exits 0
    - `pnpm -w vitest run --project root tests/tsup-build.test.mjs` -> exits 0 + all tests pass
  </acceptance_criteria>
  <done>
  tsup builds successfully producing 12 expected files; integration test passes. Plan 02 later overwrites quick.ts stub and reruns this test.
  </done>
</task>

<task type="auto">
  <name>Task 7: Create tests/version-bump.test.mjs</name>
  <read_first>
    - ./package.json (updated in Task 2)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-01-03
  </read_first>
  <files>
    - tests/version-bump.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/version-bump.test.mjs
  // Asserts root package.json is bumped to 1.0.0-alpha.1 with correct engines + deps.
  // Source: Phase 39 VALIDATION §Task 39-01-03
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

  describe('root package.json v1.0.0-alpha.1 bump', () => {
    it('version is exactly 1.0.0-alpha.1', () => {
      expect(pkg.version).toBe('1.0.0-alpha.1');
    });

    it('engines.node is >=20', () => {
      expect(pkg.engines.node).toBe('>=20');
    });

    it('dependencies include the three bundled externals + prompts', () => {
      expect(pkg.dependencies['better-sqlite3']).toMatch(/^\^12\./);
      expect(pkg.dependencies['@anthropic-ai/claude-agent-sdk']).toMatch(/^\^0\./);
      expect(pkg.dependencies['@modelcontextprotocol/sdk']).toMatch(/^\^1\./);
      expect(pkg.dependencies.prompts).toMatch(/^\^2\./);
    });

    it('devDependencies include tsup', () => {
      expect(pkg.devDependencies.tsup).toMatch(/^\^8\./);
    });

    it('scripts.build is tsup and scripts.typecheck is tsc --build', () => {
      expect(pkg.scripts.build).toBe('tsup');
      expect(pkg.scripts.typecheck).toBe('tsc --build');
    });

    it('name, bin, type, publishConfig preserved byte-for-byte', () => {
      expect(pkg.name).toBe('claude-dev-stack');
      expect(pkg.bin['claude-dev-stack']).toBe('./bin/cli.mjs');
      expect(pkg.type).toBe('module');
      expect(pkg.publishConfig.provenance).toBe(true);
      expect(pkg.publishConfig.access).toBe('public');
    });

    it('packageManager pinned to pnpm@10.6.3', () => {
      expect(pkg.packageManager).toBe('pnpm@10.6.3');
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/version-bump.test.mjs && pnpm -w vitest run --project root tests/version-bump.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/version-bump.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/version-bump.test.mjs` -> exits 0 + all 7 tests pass
  </acceptance_criteria>
  <done>
  Version bump test passes — package.json has correct version, engines, deps, scripts, preserved fields.
  </done>
</task>

<task type="auto">
  <name>Task 8: Create tests/pack-files-array.test.mjs</name>
  <read_first>
    - ./package.json
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-01-04
  </read_first>
  <files>
    - tests/pack-files-array.test.mjs (new)
  </files>
  <action>
  ```js
  // tests/pack-files-array.test.mjs
  // Asserts package.json "files" shape per D-117.
  // Source: Phase 39 VALIDATION §Task 39-01-04
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

  describe('package.json "files" array', () => {
    it('includes dist/ (bundler output)', () => {
      expect(pkg.files).toContain('dist/');
    });

    it('keeps bin/, lib/, hooks/, skills/, templates/, patches/', () => {
      for (const f of ['bin/', 'lib/', 'hooks/', 'skills/', 'templates/', 'patches/']) {
        expect(pkg.files).toContain(f);
      }
    });

    it('keeps README.md, LICENSE, NOTICES.md', () => {
      for (const f of ['README.md', 'LICENSE', 'NOTICES.md']) {
        expect(pkg.files).toContain(f);
      }
    });

    it('does NOT include packages/ (source, not distributed)', () => {
      expect(pkg.files).not.toContain('packages/');
      expect(pkg.files.some((f) => f.startsWith('packages'))).toBe(false);
    });

    it('does NOT include .planning/ (internal dev artifact)', () => {
      expect(pkg.files).not.toContain('.planning/');
      expect(pkg.files.some((f) => f.includes('.planning'))).toBe(false);
    });

    it('does NOT include tests/ or tsup.config.ts', () => {
      expect(pkg.files).not.toContain('tests/');
      expect(pkg.files).not.toContain('tsup.config.ts');
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/pack-files-array.test.mjs && pnpm -w vitest run --project root tests/pack-files-array.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/pack-files-array.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/pack-files-array.test.mjs` -> exits 0 + all 6 tests pass
  </acceptance_criteria>
  <done>
  files array shape validated — includes dist/, excludes packages/ and .planning/.
  </done>
</task>

<task type="auto">
  <name>Task 9: Create tests/pack-size.test.mjs</name>
  <read_first>
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-01-05
    - .planning/phases/39-cds-quick-demo-alpha-release/39-RESEARCH.md §Pattern 6
  </read_first>
  <files>
    - tests/pack-size.test.mjs (new)
  </files>
  <action>
  Uses `execFileSync` (no shell) for command invocation. Pattern matches safe-command invocation guidance from the repo security note.

  ```js
  // tests/pack-size.test.mjs
  // Asserts `pnpm pack --json` tarball size < 5 MB (D-119).
  // Requires tsup build to have run first. Uses execFileSync (no shell).
  // Source: Phase 39 VALIDATION §Task 39-01-05, RESEARCH §Pattern 6
  import { describe, it, expect, beforeAll } from 'vitest';
  import { execFileSync } from 'node:child_process';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(__dirname, '..');

  describe('tarball size budget', () => {
    let packInfo;

    beforeAll(() => {
      // Ensure dist/ exists before packing
      execFileSync('pnpm', ['tsup'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
      const output = execFileSync('pnpm', ['pack', '--json'], { cwd: root, encoding: 'utf8' });
      // pnpm emits progress + JSON on stdout. Find the JSON array.
      const match = output.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (!match) throw new Error('pnpm pack --json did not emit JSON array:\n' + output);
      packInfo = JSON.parse(match[0])[0];
    }, 90_000);

    it('tarball size is under 5 MB', () => {
      expect(packInfo.size).toBeLessThan(5_242_880);
    });

    it('unpacked size is under 20 MB (sanity)', () => {
      expect(packInfo.unpackedSize).toBeLessThan(20_971_520);
    });

    it('tarball includes dist/core/index.js + dist/cli/quick.js + dist/cli/mcp-server.js + dist/migrate/cli.js', () => {
      const files = packInfo.files.map((f) => f.path);
      expect(files).toContain('dist/core/index.js');
      expect(files).toContain('dist/cli/quick.js');
      expect(files).toContain('dist/cli/mcp-server.js');
      expect(files).toContain('dist/migrate/cli.js');
    });

    it('tarball does NOT include packages/ or tests/ or .planning/', () => {
      const files = packInfo.files.map((f) => f.path);
      for (const f of files) {
        expect(f.startsWith('packages/'), `forbidden path in tarball: ${f}`).toBe(false);
        expect(f.startsWith('tests/'), `forbidden path in tarball: ${f}`).toBe(false);
        expect(f.startsWith('.planning/'), `forbidden path in tarball: ${f}`).toBe(false);
      }
    });

    it('tarball includes hooks/session-end-capture.sh + .mjs (Phase 36 artifacts)', () => {
      const files = packInfo.files.map((f) => f.path);
      expect(files).toContain('hooks/session-end-capture.sh');
      expect(files).toContain('hooks/session-end-capture.mjs');
    });

    it('tarball includes skills/cds-quick/SKILL.md (Plan 03 artifact)', () => {
      const files = packInfo.files.map((f) => f.path);
      expect(files).toContain('skills/cds-quick/SKILL.md');
    });
  });
  ```

  Cross-plan dependency: last two assertions depend on Phase 36 artifacts AND Plan 03's SKILL.md. When Plan 01 Task 9 creates this file, those specific tests fail until Plan 03 lands. That's acceptable — the plan-checker gate at phase end requires all assertions to pass.
  </action>
  <verify>
    <automated>test -f tests/pack-size.test.mjs</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/pack-size.test.mjs` -> exits 0
    - At phase-end (after Plans 02/03 land + hooks/session-end-capture.* exist): `pnpm -w vitest run --project root tests/pack-size.test.mjs` -> exits 0
  </acceptance_criteria>
  <done>
  pack-size.test.mjs exists. Passes once Plans 02/03 land.
  </done>
</task>

<task type="auto">
  <name>Task 10: Create tests/cli-dispatch.test.mjs</name>
  <read_first>
    - ./bin/cli.mjs (updated in Task 3)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-01-06
  </read_first>
  <files>
    - tests/cli-dispatch.test.mjs (new)
  </files>
  <action>
  Uses `spawnSync` (no shell) to invoke the CLI — safer than execSync for this purpose.

  ```js
  // tests/cli-dispatch.test.mjs
  // Asserts bin/cli.mjs routing for quick/mcp/migrate to dist/*/*.js (and CDS_DEV=1 -> packages/).
  // Source: Phase 39 VALIDATION §Task 39-01-06
  import { describe, it, expect } from 'vitest';
  import { spawnSync } from 'node:child_process';
  import { readFileSync, existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(__dirname, '..');
  const cli = path.join(root, 'bin', 'cli.mjs');

  const cliText = readFileSync(cli, 'utf8');

  describe('bin/cli.mjs routing shape', () => {
    it('has resolveDistPath helper', () => {
      expect(cliText).toMatch(/function resolveDistPath\s*\(/);
      expect(cliText).toMatch(/CDS_DEV/);
    });

    it('case "quick" routes to resolveDistPath("cli/quick.js")', () => {
      expect(cliText).toMatch(/case 'quick':/);
      expect(cliText).toMatch(/resolveDistPath\('cli\/quick\.js'\)/);
    });

    it('case "mcp" serve subcommand routes to resolveDistPath("cli/mcp-server.js")', () => {
      expect(cliText).toMatch(/case 'mcp':/);
      expect(cliText).toMatch(/args\[1\] === 'serve'/);
      expect(cliText).toMatch(/resolveDistPath\('cli\/mcp-server\.js'\)/);
    });

    it('case "migrate" routes to resolveDistPath("migrate/cli.js")', () => {
      expect(cliText).toMatch(/case 'migrate':/);
      expect(cliText).toMatch(/resolveDistPath\('migrate\/cli\.js'\)/);
    });

    it('__dirname derived from fileURLToPath', () => {
      expect(cliText).toMatch(/fileURLToPath/);
      expect(cliText).toMatch(/__dirname\s*=\s*path\.dirname/);
    });

    it('existing cases preserved (projects, docs, skills)', () => {
      expect(cliText).toMatch(/case 'projects':/);
      expect(cliText).toMatch(/case 'docs':/);
      expect(cliText).toMatch(/case 'skills':/);
    });
  });

  describe('bin/cli.mjs runtime invocation', () => {
    it('claude-dev-stack --version prints 1.0.0-alpha.1', () => {
      const result = spawnSync('node', [cli, '--version'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('1.0.0-alpha.1');
    });

    it('claude-dev-stack help includes "quick" command', () => {
      const result = spawnSync('node', [cli, 'help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/claude-dev-stack quick/);
    });

    it('claude-dev-stack quick with no args prints usage to stderr and exits non-zero (after quick.js exists)', () => {
      if (!existsSync(path.join(root, 'dist', 'cli', 'quick.js'))) {
        return; // dist not yet built; skip runtime assertion
      }
      const result = spawnSync('node', [cli, 'quick'], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/Usage|not yet implemented/i);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/cli-dispatch.test.mjs && pnpm -w vitest run --project root tests/cli-dispatch.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/cli-dispatch.test.mjs` -> exits 0
    - Static shape tests (6): pass immediately after Task 3
    - Runtime tests (version, help): pass immediately after Task 3
    - Quick-usage test: auto-skips until dist/cli/quick.js exists (Task 6 builds it)
    - After Task 6: `pnpm -w vitest run --project root tests/cli-dispatch.test.mjs` -> exits 0 all tests pass
  </acceptance_criteria>
  <done>
  cli-dispatch tests cover static shape (resolveDistPath, 3 cases, preservation) + runtime (version, help, usage).
  </done>
</task>

<task type="auto">
  <name>Task 11: Create tests/node-version-scan.test.mjs</name>
  <read_first>
    - ./.github/workflows/ci.yml (fixed in Task 4)
    - .planning/phases/39-cds-quick-demo-alpha-release/39-VALIDATION.md §Task 39-01-07
  </read_first>
  <files>
    - tests/node-version-scan.test.mjs (new)
  </files>
  <action>
  Uses `execFileSync` (no shell) to call `git ls-files`. Pure file-read + regex thereafter.

  ```js
  // tests/node-version-scan.test.mjs
  // Regression guard: no "node: 18" / ">=18" references in active repo config (D-128).
  // Uses execFileSync + git ls-files to enumerate tracked files (safer than shell glob).
  // Source: Phase 39 VALIDATION §Task 39-01-07
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { execFileSync } from 'node:child_process';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.join(__dirname, '..');

  function repoFiles() {
    const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  }

  describe('D-128 Node 18 sweep', () => {
    const BANNED_PATTERNS = [
      /node-version:\s*18\b/,
      /node-version:\s*\[\s*18\b/,
      /"node":\s*">=18"/,
      /"node":\s*"18/,
    ];

    const ALLOWED_PATHS = [
      /^\.planning\/phases\//,          // historical phase context
      /^\.planning\/milestones\//,      // archived roadmaps
      /^CHANGELOG\.md$/,                // documents Node 18 -> 20 break
      /^docs\/migration-v0-to-v1-alpha\.md$/,  // migration guide intentionally references Node 18
      /^docs\/release-notes-template\.md$/,    // release template may describe Node 18 users
      /^tests\/node-version-scan\.test\.mjs$/, // this very test file
    ];

    const relevantFiles = repoFiles().filter((f) => {
      if (!/\.(yml|yaml|json|mjs|ts|md)$/.test(f)) return false;
      if (ALLOWED_PATHS.some((rx) => rx.test(f))) return false;
      return true;
    });

    for (const f of relevantFiles) {
      it(`${f} has no Node 18 references`, () => {
        const text = readFileSync(path.join(root, f), 'utf8');
        for (const pat of BANNED_PATTERNS) {
          expect(text, `Expected ${f} to NOT match ${pat}`).not.toMatch(pat);
        }
      });
    }
  });
  ```
  </action>
  <verify>
    <automated>test -f tests/node-version-scan.test.mjs && pnpm -w vitest run --project root tests/node-version-scan.test.mjs --reporter=default</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tests/node-version-scan.test.mjs` -> exits 0
    - `pnpm -w vitest run --project root tests/node-version-scan.test.mjs` -> exits 0 + all tests pass (no Node 18 refs in active config files)
  </acceptance_criteria>
  <done>
  Repo grep-clean of Node 18 references (minus documented exceptions in migration guide, release template, historical planning, and this scan's own regex literals).
  </done>
</task>

</tasks>

<verification>
Before marking this plan complete, executor MUST pass:

```sh
pnpm install --frozen-lockfile
pnpm typecheck                                          # tsc --build, all packages
pnpm -w vitest run --project root tests/tsup-config.test.mjs
pnpm -w vitest run --project root tests/version-bump.test.mjs
pnpm -w vitest run --project root tests/pack-files-array.test.mjs
pnpm -w vitest run --project root tests/cli-dispatch.test.mjs
pnpm -w vitest run --project root tests/node-version-scan.test.mjs
pnpm tsup                                               # builds dist/
pnpm -w vitest run --project root tests/tsup-build.test.mjs
# pack-size.test.mjs passes only after Plans 02/03 complete (depends on skill SKILL.md + hooks/session-end-capture.*)
```

All 7 tests passing + tsup build succeeding = Plan 01 DONE.
</verification>

<wave_sequencing>
Wave 1 tasks that run immediately (Tasks 1-5, 7-8, 10-11):
- Task 1: tsup.config.ts
- Task 2: package.json + pnpm-lock.yaml
- Task 3: bin/cli.mjs
- Task 4: D-128 sweep (ci.yml)
- Task 5: tsup-config.test.mjs
- Task 7: version-bump.test.mjs
- Task 8: pack-files-array.test.mjs
- Task 10: cli-dispatch.test.mjs (static tests pass now; runtime quick-usage test auto-skips until build)
- Task 11: node-version-scan.test.mjs

Still Wave 1 (after Task 1-3 land) but inside this plan:
- Task 6: stub quick.ts + tsup-build.test.mjs (runs pnpm tsup against stub; passes; Plan 02 later overwrites stub)
- Task 9: pack-size.test.mjs (file creation; full assertion passes only after Plans 02-04 land)

The plan commit structure: Tasks 1-11 in one phase-branch sequence. Executor commits each task atomically per gsd-executor convention. The two deferred assertions (Task 9 skill SKILL.md check, Task 6 re-run after Plan 02) are revalidated at phase end by `/gsd-verify-work`.
</wave_sequencing>
