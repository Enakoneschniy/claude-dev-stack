# Phase 47: Plugin SDK - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-17
**Phase:** 47-plugin-sdk
**Areas discussed:** Plugin manifest, Stop hook extension, SDK package scope

---

## Plugin Manifest

| Option | Description | Selected |
|--------|-------------|----------|
| JSON manifest (Recommended) | plugin.json in npm package root. CDS discovers via node_modules scan. | ✓ |
| Package.json field | 'cds' field in existing package.json. | |
| You decide | | |

**User's choice:** JSON manifest (Recommended)

## Stop Hook Extension

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest-declared (Recommended) | plugin.json declares hooks.stop path. CDS calls in order. | |
| Registry API | Plugins call cds.registerStopHook(fn) at load time. | ✓ |
| You decide | | |

**User's choice:** Registry API

## SDK Package Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Interfaces + registerHook (Recommended) | TS interfaces + registerStopHook() runtime helper. | ✓ |
| Interfaces only | Pure types, no runtime. | |
| You decide | | |

**User's choice:** Interfaces + registerHook (Recommended)

## Deferred Ideas

- Plugin sandboxing — v1.2
- Plugin commands execution — v1.2
- Plugin marketplace — v1.2
