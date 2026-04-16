---
plan_id: 33-02-typescript-project-references
phase: 33
plan: 02
type: execute
wave: 1
depends_on:
  - 33-01-monorepo-scaffolding
files_modified:
  - tsconfig.base.json
  - tsconfig.json
  - packages/cds-core/tsconfig.json
  - packages/cds-cli/tsconfig.json
  - packages/cds-migrate/tsconfig.json
  - packages/cds-s3-backend/tsconfig.json
autonomous: true
requirements:
  - MONO-02
user_setup: []
must_haves:
  truths:
    - "Running `pnpm tsc --build` compiles all 4 packages in dependency order with zero TypeScript errors (ROADMAP SC#2)"
    - "ESM-only output — every package emits `dist/index.js` and `dist/index.d.ts`, no `.cjs` (D-01, D-02)"
    - "`@cds/core` builds before `@cds/cli`, `@cds/migrate`, `@cds/s3-backend` (composite project-reference ordering)"
    - "Root `tsconfig.json` is a solution file only (empty `files`, references array populated) — it never compiles root `.mjs` sources"
    - "`tsc --build --dry --verbose` output shows reference graph cds-core ← {cds-cli, cds-migrate, cds-s3-backend}"
  artifacts:
    - path: "tsconfig.base.json"
      provides: "Shared compiler options (ESM NodeNext, composite, declaration, strict)"
      contains: '"module": "NodeNext"'
    - path: "tsconfig.json"
      provides: "Root solution file — references the 4 packages"
      contains: '"files": []'
    - path: "packages/cds-core/tsconfig.json"
      provides: "cds-core composite config (no references — base package)"
      contains: '"composite": true'
    - path: "packages/cds-cli/tsconfig.json"
      provides: "cds-cli composite config with reference to cds-core"
      contains: "packages/cds-core"
    - path: "packages/cds-migrate/tsconfig.json"
      provides: "cds-migrate composite config with reference to cds-core"
      contains: "packages/cds-core"
    - path: "packages/cds-s3-backend/tsconfig.json"
      provides: "cds-s3-backend composite config with reference to cds-core"
      contains: "packages/cds-core"
    - path: "packages/cds-core/dist/index.d.ts"
      provides: "Emitted declaration proving the composite build works"
      contains: "CDS_CORE_VERSION"
    - path: "packages/cds-core/dist/index.js"
      provides: "Emitted ESM output proving the NodeNext module setting works"
      contains: "CDS_CORE_VERSION"
  key_links:
    - from: "root tsconfig.json"
      to: "packages/{cds-core,cds-cli,cds-migrate,cds-s3-backend}/tsconfig.json"
      via: "references array"
      pattern: '"references":\s*\['
    - from: "packages/cds-{cli,migrate,s3-backend}/tsconfig.json"
      to: "packages/cds-core/tsconfig.json"
      via: "references array (composite dep ordering)"
      pattern: '"path":\s*"\.\.\/cds-core"'
    - from: "tsconfig.base.json"
      to: "packages/*/tsconfig.json"
      via: "extends"
      pattern: '"extends":\s*"\.\.\/\.\.\/tsconfig\.base\.json"'
---

<objective>
Wire TypeScript project references across the 4 workspace packages so `pnpm tsc --build` type-checks and emits ESM declarations + JS in dependency order. Create a shared `tsconfig.base.json`, a root solution `tsconfig.json`, and 4 per-package composite configs that reference `@cds/core` from the three consumer packages.

Purpose: satisfy MONO-02 (`pnpm tsc --build` compiles all packages in dependency order with zero errors, ESM-only output). Packages already exist from Plan 01 — this plan just adds the TS wiring on top.

Output: 6 tsconfig files (1 base + 1 root solution + 4 per-package) + emitted `packages/*/dist/` artifacts proving the build works.
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
<!-- Plan 01 created the scaffold. Plan 02 wires TS on top. -->
<!-- Executor MUST NOT modify any package.json from Plan 01. Only tsconfig files are touched here. -->

From Plan 01 (already on disk):
- `packages/cds-core/src/index.ts` exports `CDS_CORE_VERSION = '0.0.0-stub'`
- `packages/cds-cli/src/index.ts` exports `CDS_CLI_VERSION = '0.0.0-stub'`
- `packages/cds-migrate/src/index.ts` exports `CDS_MIGRATE_VERSION = '0.0.0-stub'`
- `packages/cds-s3-backend/src/index.ts` exports `CDS_S3_BACKEND_VERSION = '0.0.0-stub'`
- Each package.json already declares `"main": "./dist/index.js"` and `"types": "./dist/index.d.ts"` with an `exports` field — so after `tsc --build`, the emitted dist is discoverable.
- Root `package.json` has `"scripts": { "build": "tsc --build" }` so `pnpm build` invokes solution compile.
- `typescript@6.0.2` is in root devDependencies (installed by Plan 01 Task 3).

Module resolution: NodeNext chosen over Bundler per RESEARCH.md §Alternatives Considered.
Rationale: packages execute directly in Node.js runtime (no bundler in Phase 33); per-package sanity tests use `.js` import extensions which are correct for NodeNext and would break under Bundler. A future executor MUST NOT "correct" this to Bundler without migrating import specifiers.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create tsconfig.base.json and root solution tsconfig.json</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pattern 3: TypeScript solution-style project references", §"Code Examples: tsconfig.base.json (root)", §"Code Examples: Root tsconfig.json (solution file)"
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md §"tsconfig.base.json (config — no codebase analog)", §"tsconfig.json (root solution file — no codebase analog)"
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pitfall 6: TypeScript can't find @cds/core from @cds/cli during build" — exports field + NodeNext behavior
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md §Claude's Discretion — "ESM output, strict, declaration, composite. Final values left to planner." (confirms NodeNext per RESEARCH recommendation)
  </read_first>
  <files>
    - tsconfig.base.json (new)
    - tsconfig.json (new — root solution file)
  </files>
  <action>
  Create two files at repo root.

  **File 1: `tsconfig.base.json`** — shared compiler options extended by every package tsconfig. Use NodeNext (NOT Bundler, per RESEARCH.md §"Alternatives Considered" and §"Anti-Patterns to Avoid"):

  ```jsonc
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "lib": ["ES2022"],
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "strict": true,
      "esModuleInterop": false,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "noUncheckedIndexedAccess": true
    }
  }
  ```

  Notes on each option (rationale, for executor's reference — do not inline as comments in the file since JSONC comments are fine but base.json should be clean):
  - `target: ES2022` → Node 18+ supports all ES2022 features (our `engines.node >=18` constraint).
  - `module: NodeNext` + `moduleResolution: NodeNext` → Node.js-native ESM resolution; requires `.js` extensions on import specifiers, matches our packages' `"type": "module"`.
  - `declaration: true` + `declarationMap: true` → emit `.d.ts` + `.d.ts.map`; required by `composite: true` (enforced at per-package level).
  - `sourceMap: true` → emit `.js.map` for debuggability; low cost.
  - `strict: true` → strict null checks, noImplicitAny, etc. — non-negotiable for new TS code.
  - `esModuleInterop: false` → we are pure ESM (`"type": "module"`); interop shim not needed.
  - `skipLibCheck: true` → skip checking declarations in node_modules (standard speedup).
  - `forceConsistentCasingInFileNames: true` → catch cross-platform filename bugs early.
  - `resolveJsonModule: true` → allow importing JSON (low cost, useful for package.json reads in later phases).
  - `noUncheckedIndexedAccess: true` → additional strictness (array/object index returns `T | undefined`).

  **File 2: `tsconfig.json` (root solution)** — aggregates package references, has NO `include`, NO `compilerOptions`. Per RESEARCH.md §Pattern 3 "`files: []` is mandatory — it prevents tsc from including root `.mjs` files in the solution build."

  ```jsonc
  {
    "files": [],
    "references": [
      { "path": "./packages/cds-core" },
      { "path": "./packages/cds-cli" },
      { "path": "./packages/cds-migrate" },
      { "path": "./packages/cds-s3-backend" }
    ]
  }
  ```

  **Important:** the root `tsconfig.json` must NOT have `extends`, `include`, `exclude`, or `compilerOptions`. It is strictly a solution file. If the executor is tempted to add e.g. `"include": ["lib/**/*.ts"]` to cover root TS files — do not. D-02 explicitly defers `.mjs → .ts` conversion to Phase 34+. Root `lib/`, `bin/`, `tests/` stay `.mjs` and are not part of the TS build.

  Use the Write tool for both files (JSONC is valid JSON with comments; keep comments minimal or remove them entirely — the files above are pure JSON which TypeScript accepts).
  </action>
  <verify>
    <automated>test -f tsconfig.base.json && test -f tsconfig.json && node -e "const b=require('./tsconfig.base.json'); if(b.compilerOptions.module!=='NodeNext')throw'module not NodeNext'; if(b.compilerOptions.moduleResolution!=='NodeNext')throw'moduleResolution not NodeNext'; if(!b.compilerOptions.declaration)throw'declaration must be true'; if(!b.compilerOptions.strict)throw'strict must be true'; const r=require('./tsconfig.json'); if(!Array.isArray(r.files)||r.files.length!==0)throw'root files must be empty array'; if(!Array.isArray(r.references)||r.references.length!==4)throw'root must have 4 references'; console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `test -f tsconfig.base.json` exits 0
    - `test -f tsconfig.json` exits 0
    - `jq -r '.compilerOptions.module' tsconfig.base.json` → `NodeNext`
    - `jq -r '.compilerOptions.moduleResolution' tsconfig.base.json` → `NodeNext`
    - `jq -r '.compilerOptions.target' tsconfig.base.json` → `ES2022`
    - `jq -r '.compilerOptions.strict' tsconfig.base.json` → `true`
    - `jq -r '.compilerOptions.declaration' tsconfig.base.json` → `true`
    - `jq '.files | length' tsconfig.json` → `0`
    - `jq '.references | length' tsconfig.json` → `4`
    - `jq -r '.references[0].path' tsconfig.json` → `./packages/cds-core` (cds-core MUST be first for dependency ordering clarity, even though tsc --build re-orders based on actual refs)
    - Root tsconfig has NO `compilerOptions`, NO `include`, NO `extends` keys: `jq -e 'has("compilerOptions")' tsconfig.json` → false (returns exit 1 when key is absent)
  </acceptance_criteria>
  <done>
  `tsconfig.base.json` defines shared ESM + composite + strict options. Root `tsconfig.json` is a pure solution file pointing to 4 packages. Neither file compiles anything on its own — Task 2 adds per-package configs that actually emit code.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create per-package tsconfig.json for all 4 packages and run the composite build</name>
  <read_first>
    - .planning/phases/33-monorepo-foundation/33-PATTERNS.md §"packages/cds-core/tsconfig.json (and cds-cli, cds-migrate, cds-s3-backend)"
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Code Examples: Per-package tsconfig.json (composite)"
    - .planning/phases/33-monorepo-foundation/33-RESEARCH.md §"Pitfall 6: TypeScript can't find @cds/core from @cds/cli during build" — references must be set explicitly
    - .planning/phases/33-monorepo-foundation/33-CONTEXT.md §"Integration Points" — no `allowJs` cross-boundary hacks
  </read_first>
  <files>
    - packages/cds-core/tsconfig.json (new)
    - packages/cds-cli/tsconfig.json (new)
    - packages/cds-migrate/tsconfig.json (new)
    - packages/cds-s3-backend/tsconfig.json (new)
  </files>
  <action>
  Create 4 per-package tsconfig files. All extend `../../tsconfig.base.json`. The base package (`cds-core`) has no references (it is the dependency root). The three consumer packages (`cds-cli`, `cds-migrate`, `cds-s3-backend`) each declare `{ "path": "../cds-core" }` in their `references` array so `tsc --build` builds cds-core's declarations before compiling them.

  **File 1: `packages/cds-core/tsconfig.json`** (base package, no references):
  ```jsonc
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "composite": true,
      "outDir": "dist",
      "rootDir": "src"
    },
    "include": ["src/**/*.ts"],
    "exclude": ["dist", "node_modules", "**/*.test.ts"]
  }
  ```

  Note on `exclude: ["**/*.test.ts"]`: tests are run by vitest (Plan 03) from sources, not from `dist`. Excluding tests from the build keeps `dist/` clean of `.test.d.ts` files and prevents them from landing in would-be tarballs. This is a style choice, not a correctness requirement (composite still builds if tests are included, but dist becomes noisier).

  **File 2: `packages/cds-cli/tsconfig.json`** (depends on cds-core):
  ```jsonc
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "composite": true,
      "outDir": "dist",
      "rootDir": "src"
    },
    "include": ["src/**/*.ts"],
    "exclude": ["dist", "node_modules", "**/*.test.ts"],
    "references": [
      { "path": "../cds-core" }
    ]
  }
  ```

  **File 3: `packages/cds-migrate/tsconfig.json`** (depends on cds-core):
  ```jsonc
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "composite": true,
      "outDir": "dist",
      "rootDir": "src"
    },
    "include": ["src/**/*.ts"],
    "exclude": ["dist", "node_modules", "**/*.test.ts"],
    "references": [
      { "path": "../cds-core" }
    ]
  }
  ```

  **File 4: `packages/cds-s3-backend/tsconfig.json`** (depends on cds-core):
  ```jsonc
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "composite": true,
      "outDir": "dist",
      "rootDir": "src"
    },
    "include": ["src/**/*.ts"],
    "exclude": ["dist", "node_modules", "**/*.test.ts"],
    "references": [
      { "path": "../cds-core" }
    ]
  }
  ```

  **After creating all 4 files, run the composite build:**

  1. `pnpm tsc --build --dry --verbose` — dry run prints what WOULD be built and the reference graph. MUST exit 0. Output MUST include all 4 packages and show cds-core scheduled before the others.

  2. `pnpm tsc --build` — actually build. MUST exit 0 with no errors.

  3. Verify emitted artifacts:
     - `packages/cds-core/dist/index.js` — ESM output with `export const CDS_CORE_VERSION = '0.0.0-stub';`
     - `packages/cds-core/dist/index.d.ts` — declaration with `export declare const CDS_CORE_VERSION: "0.0.0-stub";`
     - Same pattern for cds-cli, cds-migrate, cds-s3-backend.

  4. Verify ESM-only output:
     - `grep -r "module.exports" packages/*/dist/` should return ZERO matches (CommonJS pattern must be absent).
     - `grep -l "^export " packages/cds-core/dist/index.js` should match (ESM named export).

  **Troubleshooting (if `tsc --build` fails):**

  - `TS6305: Output file X has not been built from source file Y` → one of the per-package tsconfigs is missing `composite: true` or the root solution doesn't reference it. Re-check Task 1 and Task 2 files.
  - `TS2307: Cannot find module '@cds/core'` in cds-cli (if cds-cli's src ever imports from cds-core; current stubs don't, so this shouldn't fire in Phase 33 — but if a later phase stub does, the fix is to ensure `packages/cds-core/package.json` `exports` field matches the actual dist path AND the consumer's tsconfig has `references: [{ path: "../cds-core" }]`).
  - `TS5023: Unknown compiler option 'noUncheckedIndexedAccess'` → TypeScript version mismatch. Verify `pnpm ls typescript` shows 6.0.2. If older TS is being picked up, reinstall with `pnpm install`.
  - `TS5083: Cannot read file .../tsconfig.base.json` → path from per-package to base is wrong. Must be `../../tsconfig.base.json` (two levels up from `packages/cds-*/`).
  </action>
  <verify>
    <automated>test -f packages/cds-core/tsconfig.json && test -f packages/cds-cli/tsconfig.json && test -f packages/cds-migrate/tsconfig.json && test -f packages/cds-s3-backend/tsconfig.json && pnpm tsc --build --dry --verbose && pnpm tsc --build && test -f packages/cds-core/dist/index.js && test -f packages/cds-core/dist/index.d.ts && test -f packages/cds-cli/dist/index.js && test -f packages/cds-cli/dist/index.d.ts && test -f packages/cds-migrate/dist/index.js && test -f packages/cds-migrate/dist/index.d.ts && test -f packages/cds-s3-backend/dist/index.js && test -f packages/cds-s3-backend/dist/index.d.ts && grep -q "CDS_CORE_VERSION" packages/cds-core/dist/index.d.ts && ! grep -rq "module.exports" packages/cds-core/dist/ packages/cds-cli/dist/ packages/cds-migrate/dist/ packages/cds-s3-backend/dist/</automated>
  </verify>
  <acceptance_criteria>
    - All 4 per-package tsconfig.json files exist (`test -f packages/*/tsconfig.json` × 4)
    - Every per-package tsconfig has `"composite": true`: `jq -r '.compilerOptions.composite' packages/cds-core/tsconfig.json` → `true` (and same for cds-cli/migrate/s3-backend)
    - cds-core has NO `references` field: `jq -e 'has("references")' packages/cds-core/tsconfig.json` → exits with code 1 (key absent) — cds-core is the base, so it MUST NOT reference anything
    - cds-cli, cds-migrate, cds-s3-backend each have a reference to `../cds-core`: `jq -r '.references[0].path' packages/cds-cli/tsconfig.json` → `../cds-core`
    - `pnpm tsc --build --dry --verbose` exits 0 (this is the VALIDATION.md 33-02-01 check)
    - `pnpm tsc --build` exits 0 (clean build)
    - `test -f packages/cds-core/dist/index.d.ts` exits 0 (VALIDATION.md 33-02-02 check)
    - `test -f packages/cds-core/dist/index.js` exits 0
    - `test -f packages/cds-cli/dist/index.d.ts` exits 0
    - `test -f packages/cds-migrate/dist/index.d.ts` exits 0
    - `test -f packages/cds-s3-backend/dist/index.d.ts` exits 0
    - `grep -rq "module.exports" packages/*/dist/` → NO match (ESM-only output, no CJS leak)
    - `grep -q "^export " packages/cds-core/dist/index.js` → match present (named ESM export)
    - Emitted declaration content: `grep -q "CDS_CORE_VERSION" packages/cds-core/dist/index.d.ts` exits 0
    - Second invocation is a no-op: `pnpm tsc --build` (again) prints "No changes were detected since last build" and exits 0 — proves incremental `.tsbuildinfo` caching works (incremental is implicit with `composite: true`). Note: NOT a hard acceptance criterion (some dist timestamps may differ), just a signal.
  </acceptance_criteria>
  <done>
  4 per-package tsconfig files created, each extends the base, each uses composite mode, and the three consumers reference cds-core. `pnpm tsc --build` emits ESM-only `.js` + `.d.ts` for every package. No CommonJS leaks into dist. Dependency order proven by dry run output showing cds-core built first.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| TypeScript compiler input (source `.ts`) → output (`dist/*.js`, `dist/*.d.ts`) | tsc is a trusted first-party tool, low risk for supply chain tampering beyond Plan 01's scope. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-33-01 | Tampering / Supply chain | `typescript@6.0.2` devDep | accept (already mitigated in Plan 01) | Plan 01 pins exact version and records integrity hash in `pnpm-lock.yaml`. Plan 02 consumes the same pinned tsc binary — no new supply chain surface. |
| T-33-02 | — | — | — | Not applicable to Plan 02 — no CI, no external tokens. Addressed in 33-04. |
| T-33-03 | Spoofing / Dependency confusion | TS project references resolving `@cds/core` from public npm instead of workspace | accept (already mitigated in Plan 01) | TS references are path-based (`"path": "../cds-core"`), not name-based, so the TS resolver cannot be spoofed by a public `@cds/core` package. Plan 01's `workspace:*` pnpm protocol + `"private": true` further ensures the runtime resolution also uses the workspace symlink. No additional mitigation required here. |
</threat_model>

<verification>
Phase-level checks for Plan 02 contribution to MONO-02:

1. `pnpm tsc --build --dry --verbose` exits 0 and output mentions all 4 packages.
2. `pnpm tsc --build` exits 0 and emits `dist/index.js` + `dist/index.d.ts` per package.
3. ESM-only output confirmed: no `module.exports` in any `packages/*/dist/` file.
4. Reference graph correct: cds-core has no refs, other 3 packages reference cds-core.
5. `packages/cds-core/dist/index.js` import path in an ESM consumer would resolve via NodeNext (future phases will verify with live imports; Phase 33 verification is "file exists, exports declared").
</verification>

<success_criteria>
MONO-02 satisfied: "Running `pnpm tsc --build` compiles all packages in dependency order with zero TypeScript errors and ESM output." Plan 02 is the sole contributor to this criterion.
</success_criteria>

<output>
After completion, create `.planning/phases/33-monorepo-foundation/33-02-SUMMARY.md` listing:
- Files created (6 new: 2 root-level + 4 per-package)
- `tsc --build --dry` output snippet showing reference graph
- dist artifacts verified (8 files: 4 × `.js` + 4 × `.d.ts`)
- Any deviation from spec (should be zero)
- Compiler version used: `pnpm tsc --version` output
- Ready-to-execute status for Plan 04 (CI)
</output>
