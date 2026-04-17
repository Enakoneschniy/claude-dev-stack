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
| **Framework** | node:test (built-in) |
| **Config file** | none — uses existing test setup |
| **Quick run command** | `node --test tests/memory.test.mjs` |
| **Full suite command** | `pnpm -r run build && node --test tests/*.test.mjs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/memory.test.mjs`
- **After every plan wave:** Run `pnpm -r run build && node --test tests/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | D-146 | — | N/A | unit | `node --test tests/memory.test.mjs` | ❌ W0 | ⬜ pending |
| 42-01-02 | 01 | 1 | D-140 | — | N/A | integration | `node --test tests/session-start.test.mjs` | ❌ W0 | ⬜ pending |
| 42-02-01 | 02 | 1 | D-144 | — | N/A | unit | `node --test tests/search-cli.test.mjs` | ❌ W0 | ⬜ pending |
| 42-02-02 | 02 | 1 | D-145 | — | N/A | unit | `node --test tests/stats-cli.test.mjs` | ❌ W0 | ⬜ pending |
| 42-03-01 | 03 | 2 | D-142 | — | N/A | manual | skill invocation test | ❌ | ⬜ pending |
| 42-03-02 | 03 | 2 | D-143 | — | N/A | manual | skill invocation test | ❌ | ⬜ pending |
| 42-04-01 | 04 | 2 | D-141 | — | N/A | unit | `node --test tests/claude-md.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/memory.test.mjs` — stubs for D-146 memory CLI command
- [ ] `tests/search-cli.test.mjs` — stubs for D-144 search CLI
- [ ] `tests/stats-cli.test.mjs` — stubs for D-145 stats CLI

*Existing test infrastructure (node:test) covers framework needs.*

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
