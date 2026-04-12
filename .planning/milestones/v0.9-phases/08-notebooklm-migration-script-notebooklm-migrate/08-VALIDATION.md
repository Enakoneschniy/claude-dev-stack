---
phase: 8
slug: notebooklm-migration-script-notebooklm-migrate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node.js native) |
| **Config file** | none — native to Node.js 18+ |
| **Quick run command** | `node --test tests/notebooklm-migrate.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/notebooklm-migrate.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | NBLM-V2-05 | unit | `node --test tests/notebooklm-migrate.test.mjs` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | NBLM-V2-06 | unit | `node --test tests/notebooklm-migrate.test.mjs` | ❌ W0 | ⬜ pending |
| 8-01-03 | 01 | 1 | NBLM-V2-07 | unit | `node --test tests/notebooklm-migrate.test.mjs` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 2 | TEST-03 | unit | `node --test tests/notebooklm-migrate.test.mjs` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/notebooklm-migrate.test.mjs` — full fixture matrix (TEST-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-notebook smoke test | TEST-03 | Requires live notebooklm-py + burner notebook | Create burner notebook with 2-3 sources, run migrate --execute, verify round-trip |

---

## Validation Sign-Off

- [ ] All tasks have automated verify
- [ ] Sampling continuity maintained
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
