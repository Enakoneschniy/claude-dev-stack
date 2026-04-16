---
phase: 35-tiered-vault-tier-2-sqlite
plan: 01
subsystem: vault
tags: [v1.0, node-20, better-sqlite3, ci]
requires: []
provides:
  - Node 20+ baseline for v1.0 alpha
  - better-sqlite3 runtime available to @cds/core
  - NOTICES.md repo-root attribution file
affects:
  - .github/workflows/ci.yml (CI matrix)
  - package.json (engines)
  - packages/cds-core/package.json (deps)
  - NOTICES.md (new)
  - pnpm-lock.yaml
tech-stack:
  added:
    - better-sqlite3@^12.9.0 (resolved 12.9.0, MIT, WiseLibs)
    - "@types/better-sqlite3@^7.6.13"
  patterns:
    - pnpm.onlyBuiltDependencies approval pattern for native builds
key-files:
  created:
    - NOTICES.md
    - .planning/phases/35-tiered-vault-tier-2-sqlite/35-01-SUMMARY.md
  modified:
    - .github/workflows/ci.yml
    - package.json
    - packages/cds-core/package.json
    - pnpm-lock.yaml
key-decisions:
  - Added pnpm.onlyBuiltDependencies=[better-sqlite3, esbuild] to root package.json
    so native build scripts are approved under pnpm 10's default-deny policy.
    This is a necessary addition beyond the plan's literal task list — without it,
    better-sqlite3's prebuild-install step is skipped and `require('better-sqlite3')`
    fails at runtime.
  - NOTICES.md created fresh (rather than appended) because Phase 34 has not merged
    to main yet; Phase 34's NOTICES.md entries will be merged at PR time.
requirements-completed:
  - VAULT-01 (partial — dependency installed; DB implementation lands in Plans 02-04)
duration: "~10 min"
completed: 2026-04-16
---

# Phase 35 Plan 01: Node 20+ Baseline and better-sqlite3 Install — Summary

Bumped CDS baseline from Node 18 to Node 20+ and installed `better-sqlite3@^12.9.0` into `@cds/core`, clearing the runtime prerequisites for Phase 35's SQLite-backed session memory layer.

## What Was Built

1. **CI matrix** (`.github/workflows/ci.yml`): dropped Node 18 from both `packages-job` and `root-tests-job` matrices — now `[20, 22]`.
2. **Root engines** (`package.json`): `node: >=18` → `node: >=20`.
3. **Native build approval** (`package.json`): added `pnpm.onlyBuiltDependencies = ["better-sqlite3", "esbuild"]`. Required for pnpm 10's default-deny build-script policy.
4. **@cds/core dependency** (`packages/cds-core/package.json`):
   - `dependencies.better-sqlite3` = `^12.9.0` (resolved 12.9.0)
   - `devDependencies.@types/better-sqlite3` = `^7.6.13`
5. **NOTICES.md** (new, repo root): MIT attribution for better-sqlite3 with source URL `https://github.com/WiseLibs/better-sqlite3`.
6. **pnpm-lock.yaml**: regenerated via pnpm CLI; 6 occurrences of `better-sqlite3` (root manifest + `packages:` block + transitives).

## Verification

| Check | Result |
|-------|--------|
| `grep -n "node-version:" .github/workflows/ci.yml` | Only `[20, 22]` entries (2 lines) |
| `node -e "...engines.node"` | `>=20` |
| `node -e "...dependencies['better-sqlite3']"` | `^12.9.0` |
| `grep better-sqlite3 NOTICES.md` | Matches (MIT, WiseLibs URL) |
| `pnpm install --frozen-lockfile` | Exit 0 |
| `pnpm -r run build` | Exit 0 — 4/5 packages built |
| `pnpm -r run test` | Exit 0 — 4/4 workspace test suites pass |
| Root `pnpm test` | 945 passed, 3 pre-existing fails in `tests/detect.test.mjs`, 1 skipped — baseline preserved |
| SQLite smoke test | `SELECT sqlite_version()` → 3.53.0, FTS5 compile option = 1 |

## Task Results

- **Task 1** (CI matrix Node 18 drop): PASS — 2 matrices updated, no other diff.
- **Task 2** (root engines ≥20): PASS — single line change.
- **Task 3** (add better-sqlite3 + @types): PASS — added via `pnpm --filter @cds/core add …`. Had to add `pnpm.onlyBuiltDependencies` to approve the prebuild-install script (pnpm 10 default-denies build scripts).
- **Task 4** (NOTICES.md): PASS — created new file (Phase 34 has not landed its NOTICES.md yet; merge resolution deferred to PR).
- **Task 5** (green build + test): PASS — `pnpm -r run build` and `pnpm -r run test` both exit 0. Root `pnpm test` holds the documented baseline (945 pass + 3 pre-existing fail + 1 skipped).

## Commits

| Hash | Message |
|------|---------|
| `b04c399` | chore(ci)(35-01): drop node 18 from matrix for v1.0 baseline (D-33) |
| `4a14f2b` | chore(35-01): bump root engines.node to >=20 (D-33) |
| `679d09b` | feat(35-01): add better-sqlite3@^12.9.0 to @cds/core (VAULT-01) |
| `a9bfe1d` | docs(35-01): add NOTICES.md with better-sqlite3 MIT attribution (VAULT-01) |

## Deviations from Plan

**[Rule 2 — Missing Critical] pnpm 10 `onlyBuiltDependencies` approval** — Found during: Task 3 verification. Issue: pnpm 10 default-denies third-party build scripts, so `prebuild-install` never ran and `require('better-sqlite3')` would fail at runtime (no `build/Release/better_sqlite3.node`). Fix: added `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }` to root `package.json`, then `pnpm rebuild better-sqlite3` / `npm run install` inside the package to pull the prebuilt binary. Files modified: `package.json` (added block). Verification: `node -e "const Database = require('better-sqlite3'); ...pragma('journal_mode = WAL')..."` exits 0 with SQLite 3.53.0 and FTS5=1. Commit hash: `679d09b` (bundled with the dependency add).

**Total deviations:** 1 auto-fixed (missing critical). **Impact:** without this, Plans 02-04 would fail at the first `new Database()` call.

## Resolved Versions

- `better-sqlite3`: resolved to `12.9.0` (prebuild available for darwin-arm64 on Node 20 ABI).
- `@types/better-sqlite3`: resolved to `7.6.13` (latest 7.x at time of execution — per RESEARCH.md A1 compatible with v12).

## Pre-existing Test Failures (NOT caused by Plan 01)

These 3 failures already existed on main pre-Phase 35. Carried forward untouched:

- `tests/detect.test.mjs > detectInstallState() — no vault > returns vaultExists: false when no candidate paths exist`
- `tests/detect.test.mjs > detectInstallState() — vault present (temp dir simulation) > profile is always null (v1 — CONTEXT.md deferred)`
- `tests/detect.test.mjs > detectInstallState() — does not throw on missing resources > returns consistent shape on repeated calls`

## Next

Ready for Plan 02 (`35-02-schema-and-migration-runner`): schema + migrations runner land on the now-installed better-sqlite3 driver, Node 20+ baseline, and approved native builds.

## Self-Check: PASSED

- [x] All 5 tasks executed.
- [x] Each task committed individually (4 commits — Task 3 combines package.json + pnpm-lock + onlyBuiltDependencies fix).
- [x] CI matrix, root engines, package.json, NOTICES.md all updated exactly per plan.
- [x] `pnpm install --frozen-lockfile` exits 0.
- [x] `pnpm -r run build` and `pnpm -r run test` exit 0.
- [x] Root test baseline (945 pass + 3 pre-existing fail + 1 skipped) preserved.
- [x] NOTICES.md contains MIT + WiseLibs URL.
- [x] SQLite smoke test confirms FTS5 availability.
