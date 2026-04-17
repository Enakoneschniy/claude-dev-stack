# Phase 47: Plugin SDK - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Create `@cds/plugin-sdk` package with TypeScript interfaces and a minimal runtime helper (`registerStopHook`). Define the plugin manifest format (`plugin.json`). Implement the Stop hook extension point so plugins can run post-session actions. ADR on plugin trust model (manifest-only, no arbitrary code execution) is the first deliverable.

</domain>

<decisions>
## Implementation Decisions

### Plugin Manifest
- **D-01:** Plugins declare a `plugin.json` in their npm package root with: `{ name, version, description, hooks: { stop: './handlers/stop.js' }, commands: [...] }`.
- **D-02:** CDS discovers plugins by scanning `node_modules` for packages with a `plugin.json` file. Discovery runs at CLI startup, results cached for process lifetime.
- **D-03:** Manifest is JSON-only — no executable code in the manifest itself. The `hooks.stop` field points to a JS file path relative to the package root.

### Stop Hook Extension
- **D-04:** Plugins register handlers via a registry API: `cds.registerStopHook(fn)`. The plugin SDK exports this function.
- **D-05:** CDS calls registered Stop hook handlers sequentially in registration order after its own built-in Stop hook logic (session capture, etc.) completes.
- **D-06:** Each handler receives a `PluginHookContext` with: `{ projectPath, sessionId, vaultPath, timestamp }`. Handlers are async and given a 10-second timeout — if they don't resolve, CDS logs a warning and continues.

### SDK Package Scope
- **D-07:** `@cds/plugin-sdk` contains:
  - TypeScript interfaces: `PluginManifest`, `PluginHookContext`, `PluginCommand`
  - Runtime helper: `registerStopHook(handler: StopHookHandler): void`
  - No `@cds/core` dependency — SDK is standalone so plugin authors don't need CDS internals.
- **D-08:** ADR documenting "manifest-only for v1.1, no arbitrary `import(userPath)` code execution" is the FIRST deliverable.

### Claude's Discretion
- Plugin manifest JSON schema validation (strict or lenient)
- Whether `registerStopHook` uses a global registry or scoped instance
- Whether plugin commands are v1.1 scope or deferred (manifest defines them but CDS doesn't execute)
- Test strategy for plugin discovery and hook execution

</decisions>

<canonical_refs>
## Canonical References

### Research
- `.planning/research/PITFALLS.md` — Plugin security: manifest-only model, no arbitrary import()
- `.planning/research/FEATURES.md` — Plugin SDK as P2 feature
- `.planning/research/ARCHITECTURE.md` — @cds/plugin-sdk package design

### Existing Hooks
- `packages/cds-core/src/capture/index.ts` — Stop hook pattern (session capture)
- `.claude/settings.json` — Hook registration mechanism (existing)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Stop hook in `capture/index.ts` — existing pattern for post-session actions
- `@cds/s3-backend` package structure — template for new monorepo package

### Established Patterns
- Package isolation: each `@cds/*` is independent workspace package
- TypeScript interfaces exported via barrel `src/index.ts`

### Integration Points
- CDS CLI startup — plugin discovery and hook registration
- Stop hook chain — built-in capture → plugin handlers

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard plugin SDK pattern.

</specifics>

<deferred>
## Deferred Ideas

- **Plugin sandboxing** — deferred to v1.2 (manifest-only is the security model for v1.1)
- **Plugin commands execution** — manifest can declare commands but CDS doesn't execute them yet
- **Plugin marketplace / registry** — deferred

</deferred>

---

*Phase: 47-plugin-sdk*
*Context gathered: 2026-04-17*
