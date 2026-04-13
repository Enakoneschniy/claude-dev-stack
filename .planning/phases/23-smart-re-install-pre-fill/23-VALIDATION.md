---
phase: 23
slug: smart-re-install-pre-fill
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — uses node --test |
| **Quick run command** | `node --test tests/install-prefill.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/install-prefill.test.mjs`
- **After every plan wave:** Run `node --test tests/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | DX-07 | — | N/A | unit | `node --test tests/install-prefill.test.mjs` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | DX-08 | — | N/A | unit | `node --test tests/install-prefill.test.mjs` | ❌ W0 | ⬜ pending |
| 23-01-03 | 01 | 1 | DX-09 | — | N/A | unit | `node --test tests/install-prefill.test.mjs` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 1 | DX-10 | — | N/A | unit | `node --test tests/install-prefill.test.mjs` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 2 | DX-11 | — | N/A | unit | `node --test tests/install-prefill.test.mjs` | ❌ W0 | ⬜ pending |
| 23-02-02 | 02 | 2 | DX-12 | — | N/A | unit | `node --test tests/install-prefill.test.mjs` | ❌ W0 | ⬜ pending |
| 23-02-03 | 02 | 2 | DX-13 | — | N/A | unit | `node --test tests/install-prefill.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/install-prefill.test.mjs` — test stubs for DX-07..DX-13
- [ ] Test fixtures for mock vault/meta/profile.json, project-map.json

*Existing test infrastructure (node:test) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full wizard walkthrough | All DX-* | Interactive CLI prompts | Run `npx claude-dev-stack` on configured machine, verify each step shows pre-filled values |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
