# Phase 12: Sync Automation + install.mjs Refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 12-sync-automation-install-mjs-refactor
**Areas discussed:** SYNC-01 verification, install.mjs split strategy, Shared utility dedup, Testing the refactor, Module boundaries, Backward compatibility

---

## SYNC-01 Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Verify only | Run existing chain, check log, confirm non-blocking | ✓ |
| Known gaps exist | User knows of specific issues | |
| Skip SYNC-01 | Focus on REFACTOR-01 only | |

**User's choice:** Verify only (Recommended)

---

## install.mjs Split Strategy

### Split Approach

| Option | Description | Selected |
|--------|-------------|----------|
| lib/install/ directory | One module per wizard section (~13 files) | ✓ |
| Fewer larger modules | 3 grouped files | |
| You decide | Claude's discretion | |

**User's choice:** lib/install/ directory (Recommended)

### Entry Point

| Option | Description | Selected |
|--------|-------------|----------|
| Keep bin/install.mjs as thin orchestrator | ~100 lines max, imports from lib/install/ | ✓ |
| Move everything to lib/ | 5-line shim | |
| You decide | Claude's discretion | |

**User's choice:** Keep bin/install.mjs as thin orchestrator (Recommended)

---

## Shared Utility Dedup

### Dedup Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Import from lib/shared.mjs | Remove duplicates, import from shared | ✓ |
| Create lib/install/shared.mjs | Dedicated shared for install only | |
| You decide | Claude's discretion | |

**User's choice:** Import from lib/shared.mjs (Recommended)

### step() Function

| Option | Description | Selected |
|--------|-------------|----------|
| Add to lib/shared.mjs | Useful utility, belongs in shared | ✓ |
| Keep in install modules only | Wizard-specific | |
| You decide | Claude's discretion | |

**User's choice:** Add to lib/shared.mjs (Recommended)

---

## Testing the Refactor

| Option | Description | Selected |
|--------|-------------|----------|
| Unit tests per module | Each lib/install/*.mjs gets tests | ✓ |
| Snapshot comparison | Before/after stdout comparison | |
| You decide | Claude's discretion | |

**User's choice:** Unit tests per module (Recommended)

---

## Module Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Pass args explicitly | Functions take params, return results | ✓ |
| Shared config object | Mutable WizardState object | |
| You decide | Claude's discretion | |

**User's choice:** Pass args explicitly (Recommended)

---

## Backward Compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| No concerns | bin/install.mjs stays as entry point | ✓ |
| Add lib/install/ to files array | Explicit package.json listing | |

**User's choice:** No concerns (Recommended)

---

## Claude's Discretion

- Exact function signatures for extracted modules
- Small section grouping decisions
- Test fixture strategy
- getDirSuggestions placement

## Deferred Ideas

None — discussion stayed within phase scope.
