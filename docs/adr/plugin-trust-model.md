# ADR: Plugin Trust Model — Manifest-Only (v1.1)

**Status:** Accepted
**Date:** 2026-04-17
**Phase:** 47 (Plugin SDK)

## Context

claude-dev-stack needs a plugin system for third-party extensions. Plugins must be able to run custom code at session end (Stop hook) without compromising host security.

## Decision

v1.1 uses a **manifest-only** plugin model:

1. **Interface contract:** Plugins implement `PluginManifest` from `@cds/plugin-sdk` (types-only package, zero dependencies).

2. **Discovery:** Plugins are registered in `~/.claude-dev-stack/plugins.json`. Each entry specifies an npm package name and enabled/disabled status.

3. **Loading:** Plugins are loaded by npm package name (standard node_modules resolution). No arbitrary filesystem path imports.

4. **Extension points:** v1.1 supports one extension point: `onSessionEnd` (Stop hook). Handlers receive a read-only `PluginHookContext` with session metadata.

5. **Isolation:** Each handler runs with a 5-second timeout. Failures are caught and logged. Plugin errors never crash session teardown.

6. **No dynamic code construction:** No string-based code generation or execution patterns. Handlers are standard exported functions from npm packages.

## Consequences

### Positive
- Simple, secure: no arbitrary code execution paths
- Standard npm trust model (supply chain security via package-lock)
- Type-safe: plugin authors get autocomplete and compile-time checks
- Forward-compatible: adding new extension points doesn't break existing plugins

### Negative
- Limited: plugins can only do what extension points allow
- Loading an npm package still executes its top-level code (acceptable — user chose to install it)

### Deferred to v1.2+
- Plugin sandboxing (vm2, isolated-vm)
- Additional extension points (onSessionStart, onObservation)
- Plugin marketplace / discovery
- Plugin configuration UI in dashboard

## References

- REQUIREMENTS.md: DX-05, DX-06
- ROADMAP.md: Phase 47 — "ADR required first: Plugin trust model"
- Out of Scope: "Plugin sandboxing — Manifest-only model eliminates arbitrary code execution risk"
