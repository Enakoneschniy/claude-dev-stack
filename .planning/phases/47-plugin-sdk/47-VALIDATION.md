---
phase: 47
slug: plugin-sdk
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (workspace root) |
| **Quick run command** | `pnpm -r run test -- --reporter=verbose` |
| **Full suite command** | `pnpm -r run test -- --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -r run test -- --reporter=verbose`
- **After every plan wave:** Run `pnpm -r run test -- --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | DX-05 | — | N/A | type-check | `pnpm --filter @cds/plugin-sdk build` | ❌ W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | DX-05 | — | N/A | assignability | `tsc --noEmit packages/cds-plugin-sdk/src/__tests__/assignability.test.ts` | ❌ W0 | ⬜ pending |
| 47-02-01 | 02 | 2 | DX-06 | — | Plugin failures do not crash host | unit | `pnpm --filter @cds/cli test` | ❌ W0 | ⬜ pending |
| 47-02-02 | 02 | 2 | DX-06 | — | Timeout kills slow handlers | unit | `pnpm --filter @cds/cli test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cds-plugin-sdk/` — package scaffold with tsconfig.json
- [ ] `packages/cds-plugin-sdk/src/__tests__/assignability.test.ts` — type assignability stubs
- [ ] Vitest already installed at workspace level — no new framework needed

*Existing infrastructure covers test runner requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Third-party developer experience | DX-05 | Requires human evaluation of DX | Create a minimal plugin using only @cds/plugin-sdk, verify no @cds/core imports needed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
