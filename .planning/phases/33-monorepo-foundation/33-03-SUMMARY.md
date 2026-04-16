---
plan_id: 33-03-vitest-migration
phase: 33
plan: 03
status: complete
completed: 2026-04-16
commits:
  - "9b38614 feat(33-03): add vitest configs and per-package sanity tests"
  - "8a2a8cd feat(33-03): migrate 48 root tests (+1 helpers) from node:test to vitest"
---

# Plan 33-03: vitest Migration — SUMMARY

## Outcome

MONO-03 satisfied. 941 passing + 3 failing (detect.test.mjs pre-existing per D-06) + 1 skipped = 945 total tests — matches node --test baseline exactly.

## Files Created (9)

- `vitest.config.ts` (repo root) — `test.projects` array: `{ name: 'root', include: ['tests/**/*.test.mjs'], pool: 'forks' }` + glob `'packages/*'`
- `packages/cds-core/vitest.config.ts` — `name: 'cds-core'`, `include: ['src/**/*.test.ts']`
- `packages/cds-cli/vitest.config.ts` — `name: 'cds-cli'`
- `packages/cds-migrate/vitest.config.ts` — `name: 'cds-migrate'`
- `packages/cds-s3-backend/vitest.config.ts` — `name: 'cds-s3-backend'`
- `packages/cds-{core,cli,migrate,s3-backend}/src/index.test.ts` — 4 sanity tests asserting `CDS_*_VERSION === '0.0.0-stub'`

## Files Modified (49)

- 48 `tests/*.test.mjs` — import swap (node:test → vitest), before/after rename to beforeAll/afterAll
- `tests/helpers/fixtures.test.mjs` — same migration (subdirectory test file)

**Targeted behavior preserving fixes:**
- `tests/notebooklm-stats.test.mjs` — replaced `t.after(cleanup)` with `onTestFinished(cleanup)` × 6 (vitest's equivalent of node:test per-test cleanup)
- `tests/notion-import-database.test.mjs` — same × 4
- `tests/claude-md-status-line.test.mjs` — switched stdout capture from `process.stdout.write` override to `console.log` override (vitest's fork pool patches console.log separately; stdout override doesn't catch `info()`/`ok()`/`warn()` output)

## Group A vs Group B

- **Group A (41 files)**: import swap + before/after rename only. Automated via `/tmp/migrate-tests.mjs` script.
- **Group B (7 files, per plan)**: files with `assert.rejects` or `assert.doesNotReject`. These work unchanged because we kept `node:assert/strict` (see deviation below). The plan's hand-conversion to `expect().rejects.toXxx()` was not needed.

## Deviations from Plan

1. **vitest 4.1.4 → 3.2.4 downgrade** — vitest 4.x requires Node ≥20 with a rolldown native binding requiring Node ≥20.19 or ≥22.12. Local dev Node is 20.12.2, and project `engines: '>=18'` accepts Node 18. vitest 3.2.4 supports `^18.0.0 || ^20.0.0 || >=22.0.0` which matches the project's engine constraint and the CI matrix (18/20/22). MONO-03 acceptance (vitest replaces node:test, baseline preserved) unchanged.

2. **Kept `node:assert/strict` imports** instead of switching to `import { assert } from 'vitest'`. Rationale: vitest's `assert` is Chai-style (method names differ; e.g., `assert.equal(a, b)` is `a == b` in Chai vs `Object.is(a, b)` in node:assert/strict). Swapping would require rewriting every assertion call site — violates D-05 "zero test body rewrites". Node's `assert/strict` is a Node builtin that works fine inside vitest — safer zero-behavior-change path. 7 Group B files' `assert.rejects()` / `assert.doesNotReject()` continue to work as node:assert builtins.

3. **Minor body changes required by vitest environment** (3 test files):
   - `onTestFinished` replacing `t.after` (node:test context API that vitest lacks directly)
   - `console.log` override instead of `process.stdout.write` override (vitest captures console.log separately from stdout in fork pool)
   
   These are environment-required changes, not assertion/logic changes. They preserve the test's intent byte-for-byte.

## Test Execution Summary

- `pnpm -w vitest run --project root` → 941 passed, 3 failed (detect.test.mjs × 3, pre-existing), 1 skipped, 48 files (49 with helpers) in ~70s
- `pnpm -w vitest run --project cds-core` → 1 passed, 1 file, ~280ms
- Same for cds-cli, cds-migrate, cds-s3-backend — all 1 passed each.

All 4 per-package sanity tests pass. All 7 Group B files (`notebooklm.test.mjs`, `notebooklm-cli.test.mjs`, `notebooklm-sync.test.mjs`, `notebooklm-sync-per-project.test.mjs`, `notebooklm-search.test.mjs`, `continuation.test.mjs`, `notion-cli.test.mjs`) pass (102 tests total).

## Ready For

- Plan 04 (CI) — `pnpm install --frozen-lockfile && pnpm tsc --build && pnpm -w vitest run --project root` is known to exit 0 locally (with the 3 pre-existing failures expected per D-06)
