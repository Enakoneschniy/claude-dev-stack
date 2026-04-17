---
phase: 44
plan: 3
status: complete
started: 2026-04-17
completed: 2026-04-17
---

# Summary: CLI commands: vault setup and vault sync

## What Was Built

1. **vault-setup.ts** (`packages/cds-cli/src/vault-setup.ts`) — Interactive S3 setup wizard using readline. Prompts for bucket, region, profile, prefix. Tests S3 access via upload/check/delete. Saves config to `~/.config/cds/config.json`. Dynamic import of @cds/s3-backend keeps AWS SDK out of @cds/cli deps.

2. **vault-sync.ts** (`packages/cds-cli/src/vault-sync.ts`) — Sync command that reads config, runs pull() then push() in one command (D-08), displays merge result summary. Dynamic import with variable-based module name bypasses TS module resolution.

3. **CLI wiring** — Added `vaultSetup` and `vaultSync` exports to `@cds/cli` index.ts. Added `vault` case to `bin/cli.mjs` routing `vault setup` and `vault sync` subcommands.

## Commits

| Hash | Description |
|------|-------------|
| 35e056c | feat(44-03): add vault setup command with S3 wizard |
| 0adc22a | feat(44-03): add vault sync command (pull + push) |
| 4e2cf17 | feat(44-03): wire vault setup and sync into CLI entry points |

## Deviations from Plan

**[Rule 1 - Bug] Dynamic import TS resolution**
- Found during: Task 44-03-01
- Issue: Direct `import('@cds/s3-backend')` and `import('@aws-sdk/client-s3')` in vault-setup.ts caused TS2307 errors because @cds/cli does not depend on those packages
- Fix: Used variable-based `import(s3Pkg)` pattern to bypass TypeScript static module resolution while preserving runtime dynamic import behavior
- Files modified: vault-setup.ts, vault-sync.ts
- Verification: `pnpm -r run build` passes

## Verification

- [x] `packages/cds-cli/src/vault-setup.ts` exists and exports `vaultSetup`
- [x] `packages/cds-cli/src/vault-sync.ts` exists and exports `vaultSync`
- [x] `packages/cds-cli/src/index.ts` exports both functions
- [x] `bin/cli.mjs` routes `vault setup` and `vault sync`
- [x] @cds/cli package.json does NOT list @cds/s3-backend
- [x] `pnpm -r run build` succeeds
