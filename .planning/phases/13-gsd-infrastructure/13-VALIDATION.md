---
phase: 13
slug: gsd-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — tests auto-discovered via `tests/*.test.mjs` glob |
| **Quick run command** | `node --test tests/adr-bridge.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~70 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run quick test for the module being modified
- **After each plan completes:** Run `npm test` (full suite)
- **Before verification:** Run `npm test` + check for regressions

---

## Validation Architecture

### INFRA-03: ADR Bridge
- Unit tests for D-XX extraction regex from CONTEXT.md
- Unit tests for ADR file generation (format, numbering, provenance)
- Unit tests for idempotency (re-running bridge produces no duplicates)
- Integration test: CONTEXT.md → vault/decisions/ ADR file
- Edge cases: empty CONTEXT.md, no D-XX entries, existing ADRs with same phase

### INFRA-04: Parallel Phase Execution
- Unit tests for depends_on overlap detection
- Unit tests for cost estimation calculation
- Structural tests: transition.md or execute-phase.md contains parallel offer logic
- Edge cases: all phases dependent, single phase remaining, circular deps
