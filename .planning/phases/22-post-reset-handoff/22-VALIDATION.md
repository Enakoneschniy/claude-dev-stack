---
phase: 22
slug: post-reset-handoff
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — runner invoked directly |
| **Quick run command** | `node --test tests/handoff.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/handoff.test.mjs`
- **After every plan wave:** Run `node --test tests/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green (≥578 pass, ≤1 pre-existing fail)
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 0 | LIMIT-04 | — | N/A | unit | `node --test tests/handoff.test.mjs` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 1 | LIMIT-04 | — | N/A | unit | `node --test tests/handoff.test.mjs` | ✅ | ⬜ pending |
| 22-01-03 | 01 | 1 | LIMIT-04 | — | N/A | unit | `node --test tests/handoff.test.mjs` | ✅ | ⬜ pending |
| 22-01-04 | 01 | 1 | LIMIT-04 | — | N/A | integration | `node bin/cli.mjs handoff status 2>&1` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/handoff.test.mjs` — stubs for LIMIT-04 (create file with describe/it stubs before implementing)
- [ ] `tests/fixtures/state/` — STATE.md fixture files for each test scenario

*Existing `node:test` infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloud task fresh-clone picks up correct state | LIMIT-04 SC-2 | Requires actual cloud task execution | After merge: create cloud task with prompt "/gsd-resume-work", verify it reads STATE.md from fresh clone |
| Desktop task resumes correctly | LIMIT-04 SC-1 | Requires actual Desktop task scheduling | After merge: schedule Desktop task, verify it calls `/gsd-resume-work` and reads state |
