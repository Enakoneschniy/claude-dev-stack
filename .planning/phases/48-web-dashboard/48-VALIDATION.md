---
phase: 48
slug: web-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/cds-cli/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @cds/cli test -- --reporter=verbose` |
| **Full suite command** | `pnpm -r run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @cds/cli test -- --reporter=verbose`
- **After every plan wave:** Run `pnpm -r run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | DX-01 | — | N/A | unit | `pnpm --filter @cds/cli test -- dashboard` | ❌ W0 | ⬜ pending |
| 48-01-02 | 01 | 1 | DX-04 | — | PID file cleanup on shutdown | unit | `pnpm --filter @cds/cli test -- dashboard` | ❌ W0 | ⬜ pending |
| 48-02-01 | 02 | 2 | DX-02 | — | N/A | unit | `pnpm --filter @cds/cli test -- dashboard` | ❌ W0 | ⬜ pending |
| 48-02-02 | 02 | 2 | DX-03 | — | N/A | unit | `pnpm --filter @cds/cli test -- dashboard` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cds-cli/src/dashboard.test.ts` — stubs for DX-01, DX-02, DX-03, DX-04
- [ ] `hono` + `@hono/node-server` dependencies installed in @cds/cli

*Existing vitest infrastructure covers test runner requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser opens on `cds dashboard` | DX-01 | Requires GUI environment | Run `cds dashboard`, verify browser opens to localhost |
| Visual chart rendering | DX-02 | Canvas rendering not testable in vitest | Open dashboard, verify charts display data |
| Interactive graph click events | DX-03 | DOM interaction not testable in vitest | Open dashboard, click entity node, verify detail panel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
