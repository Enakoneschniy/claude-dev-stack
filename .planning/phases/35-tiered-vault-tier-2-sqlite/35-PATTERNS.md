# Phase 35 — Pattern Map

**Created:** 2026-04-16
**Scope:** File-by-file classification of every artifact the phase creates or modifies, with the closest existing codebase analog.

---

## Files to Create or Modify

Extracted from `35-CONTEXT.md` (Phase Boundary + Additional Required Scope) and `35-RESEARCH.md` (Recommended Project Structure).

| File | Role | Data Flow | Existing Analog | Analog Status |
|------|------|-----------|-----------------|---------------|
| `.github/workflows/ci.yml` | CI config — matrix amend | none | itself (Phase 33 Plan 04 created it) | modify in place |
| `package.json` (root) | Engines + dev metadata | none | itself | modify `engines.node` field only |
| `NOTICES.md` | License attribution for third-party deps | none | itself (Phase 34 created it) | append new entry |
| `packages/cds-core/package.json` | Dependency manifest + build script | build | itself (Phase 33 scaffold) | add deps + update `build` script |
| `packages/cds-core/scripts/copy-migrations.mjs` | Post-build file copy | build-time | NEW — no existing analog | novel; simple `fs.cpSync` script |
| `packages/cds-core/src/index.ts` | Package barrel export | public surface | itself (Phase 33 stub) | add one `export *` line |
| `packages/cds-core/src/vault/index.ts` | Vault public facade | public surface | `packages/cds-core/src/index.ts` (Phase 33 stub) — same pattern | NEW file, mirrors barrel pattern |
| `packages/cds-core/src/vault/sessions.ts` | Public session writer API + error classes + types | write path | NO direct analog in cds-core (empty post-scaffold); closest analog is `lib/adr-bridge-session.mjs` (session memory writer but markdown, not SQLite) | NEW |
| `packages/cds-core/src/vault/internal/db.ts` | Raw DB factory, PRAGMAs, FTS5 verification | internal write path | NO direct analog in cds-core | NEW |
| `packages/cds-core/src/vault/internal/migrations/runner.ts` | Transactional migration loop | internal write path | NO direct analog in cds-core | NEW |
| `packages/cds-core/src/vault/internal/migrations/001-initial.sql` | Schema DDL + triggers + FTS5 vtab | schema source of truth | NO analog in project (first SQL file) | NEW |
| `packages/cds-core/src/vault/sessions.test.ts` | Integration tests for sessions API | test | `packages/cds-core/src/sanity.test.ts` (Phase 33 Plan 03) | NEW — follows existing vitest layout |
| `packages/cds-core/src/vault/migration.test.ts` | Migration runner behavior tests | test | same | NEW |
| `packages/cds-core/src/vault/vault.boundary.test.ts` | VAULT-03 regression test (boundary enforcement) | test | same | NEW |

---

## Analog: Phase 33 `@cds/core` barrel export (`src/index.ts`)

**Source of truth for:** ESM module layout + public-surface convention. Shows how `@cds/core` exposes a single re-export barrel from a `src/` directory into the `dist/` package main.

**Current content:**
```typescript
// packages/cds-core/src/index.ts  (verbatim from gsd/phase-33-monorepo-foundation)
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

**What Phase 35 copies:** Phase 35 adds a single line: `export * from './vault/index.js';`. No restructure. The existing `CDS_CORE_VERSION` constant remains.

**What Phase 35 does NOT copy:** Existing file is ~8 lines; Phase 35 only appends.

---

## Analog: Phase 33 `packages/cds-core/package.json`

**Source of truth for:** Dependency declaration, package metadata, build/test scripts, `files` field for npm tarball.

**Current content:**
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

**What Phase 35 copies:**
- Same `"type": "module"` + ESM convention
- Same dual-field `main` + `types` + `exports` map
- Same `scripts.build` = `tsc --build` (extended with a copy step — see Pitfall 5 in RESEARCH.md)

**What Phase 35 adds:**
- `dependencies.better-sqlite3`: `^12.9.0`
- `devDependencies["@types/better-sqlite3"]`: latest `^7.x`
- `scripts.build` updated to: `tsc --build && node scripts/copy-migrations.mjs`
- `files`: `["dist"]` added if not already present (needed so `.sql` files in `dist/` ship in the npm tarball)

**What Phase 35 does NOT change:**
- `"private": true` stays (cds-core never published solo; only the root `claude-dev-stack` package publishes)
- `exports` map stays as-is (single entry for `.`; no sub-path exports)

---

## Analog: Phase 33 `.github/workflows/ci.yml` (matrix section)

**Source of truth for:** CI matrix format + pnpm/node action versions.

**Current content (excerpt):**
```yaml
packages-job:
    needs: detect-changes
    if: ${{ needs.detect-changes.outputs.packages == 'true' || github.event_name == 'push' }}
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsc --build
      - run: pnpm --filter "...[origin/main]" -r run test
```

And the same matrix appears in `root-tests-job` a few lines below.

**What Phase 35 changes:** Two surgical edits — `matrix.node-version` lines in BOTH jobs from `[18, 20, 22]` to `[20, 22]` (or `[20, 22, 24]` if Node 24 is the current LTS at execution time; planner picks at execution). No other CI edits.

---

## Analog: Phase 34 `NOTICES.md` (third-party attribution)

**Source of truth for:** Format + entry structure. [ASSUMED — file format inferred from Phase 34 context; if file format differs at execution time, executor follows existing convention.]

**Expected entry format (Plan 01 appends):**
```markdown
## better-sqlite3

- **Package:** better-sqlite3
- **Version:** ^12.9.0
- **License:** MIT
- **Source:** https://github.com/WiseLibs/better-sqlite3
- **Used by:** @cds/core (vault/sessions SQLite backend — VAULT-01/02/03)
```

---

## Analog: Phase 33 Plan 03 `packages/cds-core/src/sanity.test.ts`

**Source of truth for:** vitest test layout inside a monorepo package — imports, `test`/`expect` pattern, one-file scope.

**Expected content (per Phase 33 Plan 03 SUMMARY):**
- `import { test, expect } from 'vitest';`
- Flat tests exercising the package's public surface
- No custom `describe` nesting required
- Runs via `pnpm --filter @cds/core test`

**What Phase 35 tests copy:**
- Same import + harness
- Same top-level `test()` calls (no `describe` unless genuinely useful)
- Per-test tmpdir for DB file (`mkdtempSync` + `rmSync({recursive: true})`)
- Same package-local convention: `src/vault/*.test.ts` (matches existing `vitest.config.ts` include glob `src/**/*.test.ts`)

---

## Analog: Root `vitest.config.ts` (monorepo projects discovery)

**Source of truth for:** How root test runner finds per-package tests.

**Current content:**
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

**What Phase 35 relies on:** The `'packages/*'` glob already picks up `packages/cds-core/vitest.config.ts`, which in turn includes `src/**/*.test.ts`. No changes to root `vitest.config.ts` or `packages/cds-core/vitest.config.ts` — new test files drop into the existing pattern.

---

## Analog: Phase 33 Plan 02 TypeScript composite build (`packages/cds-core/tsconfig.json`)

**Source of truth for:** NodeNext ESM + composite project refs.

**Current content:**
```json
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

**What Phase 35 relies on:** `"include": ["src/**/*.ts"]` already catches `src/vault/**/*.ts` + `src/vault/internal/**/*.ts`. `"exclude": ["**/*.test.ts"]` ensures test files don't compile into `dist/`. No tsconfig changes needed.

**What Phase 35 does NOT change:** `tsconfig.json` stays as-is.

---

## Novel Patterns (no analog in project)

### N1. Numbered SQL migration file

No prior SQL files exist in the project. New convention locked by D-36:
- Location: `packages/cds-core/src/vault/internal/migrations/NNN-name.sql`
- Naming: `\d{3}-[a-z0-9-]+\.sql` regex
- Content: pure SQL (DDL + optional DML), no comments that would break SQLite parser
- First file: `001-initial.sql` (tables + FTS5 vtab + all triggers)

### N2. External-content FTS5 pattern

No prior FTS5 use in the project. Pattern + triggers come from SQLite official docs (see RESEARCH.md Pattern 2). Trigger names follow SQLite convention: `<table>_ai` / `_au` / `_ad` (after insert/update/delete).

### N3. Post-build file copy (tsc doesn't copy .sql)

No prior non-TS-asset in any `dist/` output. Plan 02 introduces `scripts/copy-migrations.mjs` — simplest possible `fs.cpSync` with a `.sql` filter. Called from package `scripts.build` after `tsc --build`.

### N4. Module-level handle cache (D-49)

No prior use of module-level cache in cds-core (Phase 33 scaffold is pure stub). Pattern is standard ESM — `const CACHE = new Map<string, SessionsDB>()` at top of `sessions.ts`.

### N5. Runtime filesystem scan for boundary enforcement (Plan 04)

No prior regression test walks the filesystem to prove a negative (absence of an import). `vault.boundary.test.ts` introduces the pattern — minimal `walkAllFiles(dir, cb)` helper traversing `packages/cds-*/src` + `lib`. Runs on every test invocation; cost is low (few dozen files).

---

## Summary — What Planner / Executor Should Replicate

1. **Every source file is a `.ts` file under `packages/cds-core/src/`.** Tests co-located as `*.test.ts`. No test moved to a separate `tests/` tree inside the package (matches Phase 33 convention).
2. **Every module uses ESM `.js` extensions in imports** (e.g. `import { runPendingMigrations } from './migrations/runner.js'`) — NodeNext + `"type": "module"` requires this.
3. **Every DB mutation is wrapped in `db.transaction(fn)`** — never manual BEGIN/COMMIT unless there is an explicit test reason.
4. **Error classes extend a base `VaultError` that extends `Error`** — never plain strings or raw SQLite errors to callers.
5. **No change to root `package.json` scripts** except `engines.node` — Phase 33 already ships `"test": "vitest run"` and `"build": "tsc --build"` at root.
6. **No change to root `vitest.config.ts` or root `tsconfig.json`** — they already discover `packages/cds-core` correctly.
7. **`files: ["dist"]` in `packages/cds-core/package.json` is already implied by Phase 33**; Plan 02 verifies and ensures `.sql` files are in `dist/` via the copy script so they ship automatically.

## PATTERN MAPPING COMPLETE
