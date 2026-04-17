---
phase: 42
slug: living-memory
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (workspace-aware) |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npx vitest run packages/cds-cli/src/memory.test.ts` |
| **Full suite command** | `pnpm -r run build && npx vitest run packages/cds-cli/src/*.test.ts` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run packages/cds-cli/src/memory.test.ts`
- **After every plan wave:** Run `pnpm -r run build && npx vitest run packages/cds-cli/src/*.test.ts`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | D-146, D-140 | — | N/A | unit | `npx vitest run packages/cds-cli/src/memory.test.ts` | ❌ W0 | ⬜ pending |
| 42-02-01 | 02 | 2 | D-144 | — | N/A | unit | `npx vitest run packages/cds-cli/src/search.test.ts` | ❌ W0 | ⬜ pending |
| 42-02-02 | 02 | 2 | D-145 | — | N/A | unit | `npx vitest run packages/cds-cli/src/stats.test.ts` | ❌ W0 | ⬜ pending |
| 42-03-01 | 03 | 3 | D-142 | — | N/A | manual | skill invocation test | ❌ | ⬜ pending |
| 42-03-02 | 03 | 3 | D-143 | — | N/A | manual | skill invocation test | ❌ | ⬜ pending |
| 42-04-01 | 04 | 2 | D-141 | — | N/A | unit | `grep -c 'sessions.search' lib/install/claude-md.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cds-cli/src/memory.test.ts` — stubs for D-146 memory CLI + D-140 hook integration
- [ ] `packages/cds-cli/src/search.test.ts` — stubs for D-144 search CLI
- [ ] `packages/cds-cli/src/stats.test.ts` — stubs for D-145 stats CLI

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/cds-search` skill works in Claude Code | D-142 | Requires Claude Code session + MCP server | Type `/cds-search "test query"` in Claude Code |
| `/cds-stats` skill shows stats | D-143 | Requires Claude Code session + MCP server | Type `/cds-stats` in Claude Code |
| SessionStart hook injects memory | D-140 | Requires new Claude Code session start | Start new session, check for "Recent memory" in context |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
