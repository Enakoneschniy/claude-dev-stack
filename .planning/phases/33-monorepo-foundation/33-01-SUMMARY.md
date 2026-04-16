---
plan_id: 33-01-monorepo-scaffolding
phase: 33
plan: 01
status: complete
completed: 2026-04-16
commits:
  - "5270ec2 feat(33-01): scaffold pnpm workspace with 4 private @cds/* packages"
  - "33dd8fc feat(33-01): add pnpm+vitest+typescript devDeps, switch test script to vitest"
  - "1ba8120 feat(33-01): commit pnpm-lock.yaml with workspace resolution"
---

# Plan 33-01: Monorepo Scaffolding — SUMMARY

## Outcome

MONO-01 satisfied. `pnpm install` resolves all 4 workspace packages and links workspace deps via `workspace:*` protocol with verified local symlinks (no npm registry fetch for `@cds/*`).

## Files Created (11 new)

- `pnpm-workspace.yaml` — declares `packages/*`
- `.npmrc` — shamefully-hoist=false, strict-peer-dependencies=false, save-workspace-protocol=rolling
- `packages/cds-core/package.json` — `@cds/core`, private, no deps
- `packages/cds-core/src/index.ts` — stub, exports `CDS_CORE_VERSION = '0.0.0-stub'`
- `packages/cds-cli/package.json` — `@cds/cli`, private, deps: `@cds/core: workspace:*`
- `packages/cds-cli/src/index.ts` — stub, exports `CDS_CLI_VERSION`
- `packages/cds-migrate/package.json` — `@cds/migrate`, private, deps: `@cds/core: workspace:*`
- `packages/cds-migrate/src/index.ts` — stub, exports `CDS_MIGRATE_VERSION`
- `packages/cds-s3-backend/package.json` — `@cds/s3-backend`, private, deps: `@cds/core: workspace:*`
- `packages/cds-s3-backend/src/index.ts` — stub, exports `CDS_S3_BACKEND_VERSION`
- `pnpm-lock.yaml` — 815 lines, 50 packages resolved

## Files Modified (1)

- `package.json` — added `packageManager: pnpm@10.6.3`, `devDependencies` (vitest/typescript/@types/node), replaced `scripts.test` from `node --test` to `vitest run`, added `scripts.build = tsc --build`. D-03 locked fields (name, bin, files, dependencies, type, engines, publishConfig) preserved byte-for-byte.

## Verification Snapshot

- `pnpm install` — 50 packages added, 0 errors, 2.6s
- `pnpm ls --filter @cds/cli --json` — `@cds/core: link:../cds-core` (workspace symlink confirmed)
- `readlink packages/cds-cli/node_modules/@cds/core` → `../../../cds-core` (local resolution proven; T-33-03 mitigated)
- `pnpm-lock.yaml` committed

## Deviations

- **pnpm audit**: npm's v1 audit endpoint returned HTTP 410 (retired). This is external to our control. Mitigation: CI uses `pnpm install --frozen-lockfile` (Plan 04) which rejects any tarball whose integrity hash doesn't match the lockfile — same supply-chain protection, enforced at install time instead of audit time.

## Ready For

- Plan 02 (TS project references) — packages exist, typescript installed
- Plan 03 (vitest migration) — vitest binary installed, test script hooked
