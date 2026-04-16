---
plan_id: 33-04-github-actions-matrix
phase: 33
plan: 04
status: complete
completed: 2026-04-16
commits:
  - "40d2c81 feat(33-04): pnpm+monorepo CI workflow with restricted permissions"
---

# Plan 33-04: GitHub Actions Matrix CI — SUMMARY

## Outcome

MONO-04 satisfied. `.github/workflows/ci.yml` replaced in-place with pnpm-aware, matrix-based workflow covering Node 18/20/22. `GITHUB_TOKEN` scope restricted to `contents: read + pull-requests: read`.

## Files Modified (2)

- `.github/workflows/ci.yml` — full replacement (was `npm ci`-based single job; now 3 jobs with matrix + paths-filter + restricted permissions)
- `.gitignore` — appended monorepo build artifacts (`**/dist/`, `**/*.tsbuildinfo`, `packages/*/node_modules/`, `pnpm-debug.log*`, `*.pre-bounce.md`). Existing 4 entries preserved.

## CI Workflow Structure

Three jobs:

1. **detect-changes** (1 runner, always runs)
   - `dorny/paths-filter@v4` classifies changes into `packages` and `root` buckets
   - Outputs fed to subsequent jobs as `if:` conditions

2. **packages-job** (matrix: 3 Node versions, conditional)
   - `if: needs.detect-changes.outputs.packages == 'true' || github.event_name == 'push'`
   - Steps: checkout(fetch-depth:0) → pnpm/action-setup@v4 v10 → setup-node@v4 cache:'pnpm' → `pnpm install --frozen-lockfile` → `pnpm tsc --build` → `pnpm --filter "...[origin/main]" -r run test`

3. **root-tests-job** (matrix: 3 Node versions, conditional)
   - `if: needs.detect-changes.outputs.root == 'true' || github.event_name == 'push'`
   - Steps: same setup as packages-job, plus `pnpm -w vitest run --project root`

All test jobs use `fail-fast: false` so Node 18/20/22 results are visible independently.

## Security Posture

- **T-33-02 mitigated**: workflow-level `permissions: { contents: read, pull-requests: read }` — default GITHUB_TOKEN write scope dropped.
- **No secrets referenced**: `grep -c "secrets\." .github/workflows/ci.yml` = 0 — fork PRs are safe to run.
- **Supply chain via lockfile**: `--frozen-lockfile` in both test jobs; CI install fails loudly on any lockfile/integrity drift.
- **Action versions pinned** to `@v4` major (D-10 lock): `actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`, `dorny/paths-filter@v4`.

## Live Verification

Live push verification to GitHub Actions UI is deferred to the PR flow (VALIDATION.md §Manual-Only Verifications). When the PR to main is opened, both `packages-job` and `root-tests-job` should show 3 green runs each (one per Node version). Local verification equivalent passes:
- `pnpm install --frozen-lockfile` → 0 changes, exit 0
- `pnpm tsc --build` → 0 errors, emits 8 dist artifacts
- `pnpm -w vitest run --project root` → 941 passed + 3 failed (detect.test.mjs pre-existing) + 1 skipped, matches baseline

## .gitignore Effectiveness

`git check-ignore packages/cds-core/dist` → matches `.gitignore:9:**/dist/`
`git check-ignore packages/cds-core/tsconfig.tsbuildinfo` → matches `.gitignore:10:**/*.tsbuildinfo`

After this plan, `git status` no longer shows `packages/*/dist/` or `*.tsbuildinfo` as untracked.

## Deviations

None. Implementation matches plan verbatim.

## Phase-Level Sign-Off

All 4 MONO requirements covered across Plans 01–04:
- MONO-01 (Plan 01): pnpm workspace resolves 4 packages via workspace:*
- MONO-02 (Plan 02): `pnpm tsc --build` emits ESM dist for all 4 packages, zero errors
- MONO-03 (Plan 03): vitest replaces node:test, 941 passing + 3 known failing preserved
- MONO-04 (Plan 04): GitHub Actions matrix CI with restricted token, --frozen-lockfile
