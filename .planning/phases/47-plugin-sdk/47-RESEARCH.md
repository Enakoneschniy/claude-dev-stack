# Phase 47: Plugin SDK — Research

**Researched:** 2026-04-17
**Phase Goal:** Third-party developers can build plugins against a stable manifest-only interface, and Stop hook exposes an extension point for custom post-session actions.
**Requirements:** DX-05, DX-06

## RESEARCH COMPLETE

---

## 1. Domain Analysis

### What is @cds/plugin-sdk?

A **types-only** npm package that third-party developers import to build plugins for claude-dev-stack. It contains:
- TypeScript interface definitions (`PluginManifest`, `PluginHookContext`, `StopHookHandler`)
- No runtime code — zero dependencies
- No imports from `@cds/core` — the SDK is the stable contract; core is the implementation

### Why manifest-only?

The ROADMAP mandates an ADR: "Plugin trust model — manifest-only for v1.1, no arbitrary `import(userPath)` code execution."

Manifest-only means:
- Plugins declare capabilities via a JSON/TypeScript manifest (name, version, hooks, metadata)
- The host (`@cds/cli` or `@cds/core`) reads the manifest and invokes registered handlers
- No dynamic imports of arbitrary user paths — eliminates code injection risk
- Plugin code runs only through well-defined extension points (Stop hook handlers)

### Stop Hook Extension Point

The existing Stop hook in `hooks/` runs at session end. Phase 47 adds:
- A plugin registry that reads installed plugin manifests
- An extension point in the Stop hook that iterates registered `onSessionEnd` handlers
- Handlers receive a `PluginHookContext` with session data (read-only) and respond with actions

---

## 2. Existing Codebase Patterns

### Package Structure (from pnpm-workspace.yaml)

```
packages/
  cds-cli/       — CLI entry point, commands
  cds-core/      — Core primitives (vault, capture, dispatch)
  cds-migrate/   — Schema migration tool
  cds-s3-backend/ — S3 vault backend (Phase 44)
```

New package: `packages/cds-plugin-sdk/`

### Existing Package Conventions

From `@cds/core` (`packages/cds-core/package.json`):
- `"type": "module"` — ESM
- `"main": "./dist/index.js"` — compiled output
- `"types": "./dist/index.d.ts"` — type declarations
- `exports` map with subpath exports
- Build: `tsc --build`
- Test: `vitest run`
- TypeScript project references via `tsconfig.json`

**@cds/plugin-sdk should follow the same conventions** but simpler:
- No runtime dependencies (zero `dependencies`)
- No build scripts beyond `tsc --build`
- No test runner needed (types-only package ��� type-check IS the test)

### Hook System

Current hooks live in `hooks/` directory:
- `hooks/session-start-context.sh` — SessionStart hook (shell script)
- Stop hook pattern: shell script that runs at session end

The Stop hook extension point needs to:
1. Read plugin manifests from a known location
2. For each plugin with `onSessionEnd` handler — invoke it
3. Pass `PluginHookContext` with session metadata
4. Collect results without blocking session teardown

### Barrel Export Pattern

From `packages/cds-core/src/index.ts`:
- Named exports with explicit type re-exports
- Subpath exports in package.json `exports` map
- JSDoc comments on the barrel file

---

## 3. ADR: Plugin Trust Model

**Required before code.** The ADR must document:

### Decision: Manifest-Only Plugin Model (v1.1)

**Context:** Plugins need a way to extend CDS behavior without introducing arbitrary code execution risk.

**Decision:** v1.1 uses a manifest-only model:
1. Plugins are npm packages that export a `PluginManifest` conforming to `@cds/plugin-sdk` interfaces
2. The manifest declares: `name`, `version`, `description`, `hooks` (object mapping hook names to handler metadata)
3. Handlers are **named exports** from the plugin package — the host imports them by name, not by arbitrary path
4. No dynamic code construction or string-based code execution
5. Plugin discovery: scan `node_modules/@cds-plugin-*` or read from a config file

**Consequences:**
- Safe: no arbitrary code execution paths
- Limited: plugins can only do what the extension points allow
- Upgradeable: v1.2 can add sandboxed execution if demand arises

**Explicitly excluded (per REQUIREMENTS.md Out of Scope):**
- Plugin sandboxing (vm2, isolated-vm)
- Dynamic module loading from user-specified paths

### Trust Boundary

```
Host (@cds/cli)
  +-- Plugin Registry
  |     reads manifests
  |     validates against SDK
  |     invokes named handlers
  |
  +-- Stop Hook Extension Point
        iterates registered onSessionEnd handlers
        passes read-only context

---- npm package boundary ----

Third-party plugin (@cds-plugin-example)
  implements PluginManifest
  exports onSessionEnd handler
  NO imports from @cds/core
```

---

## 4. Interface Design

### PluginManifest

```typescript
export interface PluginManifest {
  /** Unique plugin identifier (npm package name) */
  name: string;
  /** Semver version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Minimum @cds/plugin-sdk version required */
  sdkVersion: string;
  /** Hook registrations */
  hooks?: {
    onSessionEnd?: StopHookHandler;
  };
  /** Plugin metadata (freeform, for UI display) */
  metadata?: Record<string, unknown>;
}
```

### PluginHookContext

```typescript
export interface PluginHookContext {
  /** Current project name */
  projectName: string;
  /** Session ID (if available) */
  sessionId?: string;
  /** Session duration in seconds */
  sessionDurationSec?: number;
  /** Number of observations captured */
  observationCount?: number;
  /** Vault database path (read-only access) */
  vaultPath?: string;
  /** Timestamp of session end */
  timestamp: string;
}
```

### StopHookHandler

```typescript
export interface StopHookResult {
  /** Whether the handler succeeded */
  success: boolean;
  /** Optional message to display */
  message?: string;
}

export type StopHookHandler = (
  context: PluginHookContext
) => Promise<StopHookResult> | StopHookResult;
```

---

## 5. Package Structure

### @cds/plugin-sdk package layout

```
packages/cds-plugin-sdk/
  package.json          — name: "@cds/plugin-sdk", zero dependencies
  tsconfig.json         — strict, declaration: true
  src/
    index.ts            — barrel re-exports all interfaces
    manifest.ts         — PluginManifest interface
    hooks.ts            — PluginHookContext, StopHookHandler, StopHookResult
    version.ts          — SDK_VERSION constant for compatibility checking
  README.md             — developer-facing docs (how to build a plugin)
```

### package.json shape

```json
{
  "name": "@cds/plugin-sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc --build"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

**Key: zero `dependencies`.** This is a types-only package.

---

## 6. Plugin Registry and Discovery

### Where plugins are registered

Option A: **Config file** — `.cds/plugins.json` lists installed plugins
Option B: **Convention** — scan `node_modules/@cds-plugin-*` packages
Option C: **package.json** — `cds.plugins` field in the project's package.json

**Recommended: Option A (config file)** for v1.1:
- Explicit — user knows exactly which plugins are active
- No scanning overhead
- Easy to disable a plugin (remove from list)
- Aligns with manifest-only philosophy (explicit over implicit)

### plugins.json structure

```json
{
  "plugins": [
    { "package": "@cds-plugin/slack-notify", "enabled": true },
    { "package": "@cds-plugin/custom-export", "enabled": false }
  ]
}
```

### Plugin loading flow

1. Read `plugins.json` (or equivalent config)
2. For each enabled plugin: load the package by name, get default export (PluginManifest)
3. Validate manifest against SDK version
4. Register handlers in the hook chain
5. On session end: iterate handlers, pass `PluginHookContext`, collect results

**Note:** Loading by package name is safe because the name comes from a config file the user controls, not from arbitrary user input. The package must be installed via npm (standard supply chain trust model).

---

## 7. Stop Hook Integration

### Current Stop hook behavior

The Stop hook runs when a Claude Code session ends. Currently it follows a shell script pattern.

### Extension point design

```
Session ends
    |
    v
Stop hook fires
    |
    +-- Existing behavior (session capture, etc.)
    |
    v
Plugin extension point
    |
    +-- Load plugin registry
    +-- Build PluginHookContext from session state
    +-- For each registered onSessionEnd handler:
    |     +-- Call handler(context)
    |     +-- Timeout after 5 seconds (prevent hanging)
    |     +-- Log result (success/failure + message)
    +-- Continue teardown regardless of plugin failures
```

### Key constraints

- **Non-blocking:** Plugin failures must not prevent session teardown
- **Timeout:** Each handler gets max 5 seconds
- **Sequential:** Handlers run in registration order (from plugins.json)
- **Read-only:** Context is immutable; plugins cannot modify session state
- **Logging:** Results are logged but not surfaced to the user (silent by default)

---

## 8. Testing Strategy

### Types-only package testing

Since `@cds/plugin-sdk` has no runtime code, testing means:
1. **Type-check test:** `tsc --noEmit` passes — proves interfaces are valid TypeScript
2. **Assignability test:** A test file that creates objects conforming to each interface — proves interfaces are usable
3. **Example plugin test:** A minimal plugin implementation that type-checks against the SDK

### Stop hook extension point testing

1. **Unit test:** Mock plugin registry, verify handlers are called with correct context
2. **Integration test:** Install a test plugin, trigger session end, verify handler output
3. **Timeout test:** Plugin that sleeps longer than 5s, verify it gets killed and other plugins still run
4. **Failure isolation test:** Plugin that throws, verify other plugins still run

---

## 9. Validation Architecture

### Dimension 1: Functional Correctness
- All SDK interfaces compile and are importable
- Plugin manifest can be created without @cds/core imports
- Stop hook invokes registered handlers

### Dimension 2: Contract Compliance
- DX-05: @cds/plugin-sdk defines manifest-only interface
- DX-06: Stop hook supports plugin extension points

### Dimension 3: Security Boundary
- Only package-name imports from config — no arbitrary path imports
- No dynamic code construction or string-based code execution
- Plugin handlers receive read-only context

### Dimension 4: Integration
- Plugin SDK types are compatible with @cds/core types (PluginHookContext fields match session data shape)
- Stop hook extension point integrates with existing hook chain

### Dimension 5: Developer Experience
- Third-party developer can `npm install @cds/plugin-sdk` and implement a plugin with autocomplete
- README.md provides a working example

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Plugin manifest schema changes breaking plugins | High | Semver the SDK; `sdkVersion` field enables compatibility checks |
| Slow plugins blocking session teardown | Medium | 5-second timeout per handler; parallel execution option for v1.2 |
| Plugin loading failure crashing session end | High | Try/catch around each plugin load; log error and continue |
| No plugins exist yet — SDK may be over-designed | Low | Keep interfaces minimal; defer advanced features to v1.2 |
| Loading a package executes code at import time | Medium | Acceptable for v1.1 — package is npm-installed (user chose to install). Document in ADR. |

---

## 11. Dependencies

### Phase 47 depends on

- **Phase 45** (stable @cds/core + MCP surface) — PluginHookContext needs to know the shape of session data
- **ADR** — Plugin trust model must be written before implementation

### Phase 47 produces for downstream

- **Phase 48** (Dashboard) — could use plugin SDK to allow dashboard plugins in v1.2
- **Phase 49** (Release) — @cds/plugin-sdk must be published alongside other packages

---

*Research complete for Phase 47: Plugin SDK*
