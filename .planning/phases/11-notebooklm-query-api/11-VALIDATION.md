---
phase: 11
slug: notebooklm-query-api
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-12
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (native) |
| **Config file** | package.json scripts.test |
| **Quick run command** | `node --test tests/notebooklm.test.mjs tests/notebooklm-cli.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| TBD | 01 | 1 | QUERY-01 | unit | `node --test tests/notebooklm.test.mjs` | pending |
| TBD | 01 | 1 | QUERY-03 | unit | `node --test tests/notebooklm.test.mjs` | pending |
| TBD | 02 | 2 | QUERY-02 | unit | `node --test tests/notebooklm-cli.test.mjs` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All Wave 0 questions resolved during planning:

- [x] `notebooklm download report --json` output shape — RESOLVED: writes to file, returns `{output_path}` in JSON. No Wave 0 verification task needed.
- [x] Test stubs for askNotebook, generateArtifact — created inline with TDD tasks in Plan 01
- [x] Test stubs for ask/generate CLI — created inline with TDD task in Plan 02
