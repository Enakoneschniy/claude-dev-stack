---
phase: 45
slug: cross-project-search-graph-mcp-tools
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/cds-cli/vitest.config.ts` |
| **Quick run command** | `pnpm -r run test --filter @cds/cli` |
| **Full suite command** | `pnpm -r run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -r run test --filter @cds/cli`
- **After every plan wave:** Run `pnpm -r run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | MEM-03 | — | N/A | unit | `pnpm -r run test --filter @cds/cli` | ❌ W0 | ⬜ pending |
| 45-01-02 | 01 | 1 | MEM-05 | T-45-01 | assertValidScopeBasename on project param | unit | `pnpm -r run test --filter @cds/cli` | ❌ W0 | ⬜ pending |
| 45-02-01 | 02 | 1 | MEM-01 | — | N/A | unit | `pnpm -r run test --filter @cds/cli` | ✅ | ⬜ pending |
| 45-03-01 | 03 | 2 | MEM-06 | — | N/A | unit | `pnpm -r run test --filter @cds/cli` | ✅ | ⬜ pending |
| 45-03-02 | 03 | 2 | MEM-07 | — | N/A | unit | `pnpm -r run test --filter @cds/cli` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/cds-cli/src/mcp-tools/sessions-search-all.test.ts` — stubs for MEM-03
- [ ] `packages/cds-cli/src/mcp-tools/memory-graph.test.ts` — stubs for MEM-05
- [ ] `minisearch` dependency installed in `packages/cds-cli/package.json`

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP tools callable from Claude Code session | MEM-03, MEM-05 | Requires live Claude Code session with MCP server | Start `cds mcp serve`, verify tools appear in Claude Code tool list |
| SessionStart hook surfaces observations in session preamble | MEM-06 | Requires live Claude Code session start | Open new Claude Code session in a project with vault data, check preamble |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
