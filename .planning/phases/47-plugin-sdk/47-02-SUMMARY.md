---
plan: 47-02
title: "Stop Hook Plugin Extension Point and Registry"
status: complete
started: 2026-04-17T23:35:00Z
completed: 2026-04-17T23:45:00Z
---

# Summary: 47-02 Stop Hook Plugin Extension Point and Registry

## What Was Built

Implemented the runtime side of the plugin system — plugin registry and Stop hook extension point:

- **Plugin registry** (`packages/cds-cli/src/plugin-registry.ts`) — reads `~/.claude-dev-stack/plugins.json`, loads enabled plugin manifests via npm package name, validates SDK version compatibility, and invokes onSessionEnd handlers with 5-second timeout per handler.
- **Stop hook integration** — extended `hooks/session-end-capture.mjs` with a plugin extension point that runs after all existing capture work completes. Plugin failures are isolated and logged.
- **ADR** (`docs/adr/plugin-trust-model.md`) — documents the manifest-only trust model decision for v1.1.

## Key Files

### Created
- `packages/cds-cli/src/plugin-registry.ts` — Plugin registry with discovery, loading, and invocation
- `packages/cds-cli/src/plugin-registry.test.ts` — 9 unit tests for version compat and registry
- `docs/adr/plugin-trust-model.md` — ADR for plugin trust model

### Modified
- `packages/cds-cli/package.json` — Added @cds/plugin-sdk dependency and ./plugin-registry subpath export
- `packages/cds-cli/tsconfig.json` — Added cds-plugin-sdk project reference
- `hooks/session-end-capture.mjs` — Added plugin extension point after cost log

## Deviations

None.

## Self-Check: PASSED

- `pnpm -r run build` exits 0
- `pnpm --filter @cds/cli test` passes all 136 tests (9 new)
- Plugin extension point wrapped in try/catch (non-fatal)
- ADR created as required by ROADMAP
