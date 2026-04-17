---
plan: 47-01
title: "@cds/plugin-sdk Package — Types-Only Plugin Interface"
status: complete
started: 2026-04-17T23:30:00Z
completed: 2026-04-17T23:35:00Z
---

# Summary: 47-01 @cds/plugin-sdk Package

## What Was Built

Created `@cds/plugin-sdk` as a zero-dependency, types-only npm package under `packages/cds-plugin-sdk/`. The package defines the stable interface for third-party CDS plugins:

- **PluginManifest** — Plugin identity (name, version, description, sdkVersion) and hook registrations
- **PluginHookContext** — Read-only session data passed to hook handlers (projectName, sessionId, observationCount, etc.)
- **StopHookHandler** — Function type for onSessionEnd handlers
- **StopHookResult** — Handler return value (success + optional message)
- **SDK_VERSION** — Version constant (0.1.0) for compatibility checking

## Key Files

### Created
- `packages/cds-plugin-sdk/package.json` — Package manifest, zero dependencies
- `packages/cds-plugin-sdk/tsconfig.json` — TypeScript config extending base
- `packages/cds-plugin-sdk/src/hooks.ts` — PluginHookContext, StopHookResult, StopHookHandler
- `packages/cds-plugin-sdk/src/manifest.ts` — PluginManifest interface
- `packages/cds-plugin-sdk/src/version.ts` — SDK_VERSION constant
- `packages/cds-plugin-sdk/src/index.ts` — Barrel re-exports

### Modified
- `tsconfig.json` — Added project reference for cds-plugin-sdk

## Deviations

- Removed `typescript` from devDependencies — workspace root provides TypeScript 6.0.2, and adding `^5.7.0` caused `ignoreDeprecations: "6.0"` conflict from tsconfig.base.json

## Self-Check: PASSED

- `pnpm --filter @cds/plugin-sdk build` exits 0
- `dist/` contains all .js and .d.ts files
- No `@cds/core` import statements in dist/
- `pnpm -r run build` exits 0 (no regressions)
