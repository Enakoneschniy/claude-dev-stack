---
phase: 19
slug: project-level-hooks-wizard-bug-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — native runner |
| **Quick run command** | `node --test tests/install.test.mjs` |
| **Full suite command** | `node --test` |
| **Estimated runtime** | ~70 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/install.test.mjs`
- **After every plan wave:** Run `node --test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 70 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | BUG-01 | — | Hooks written to project dir, not global | unit | `node --test tests/install.test.mjs` | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | BUG-02 | — | allowedTools in project settings | unit | `node --test tests/install.test.mjs` | ✅ | ⬜ pending |
| 19-01-03 | 01 | 2 | BUG-06 | — | Wizard copies patches to gsd-local-patches | unit | `node --test tests/install.test.mjs` | ❌ W0 | ⬜ pending |
| 19-01-04 | 01 | 2 | BUG-06 | — | SessionStart reapplies patch when hash differs | unit | `node --test tests/hooks.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/install.test.mjs` §patches — add 2 tests: wizard copies patches/transition.md to ~/.claude/gsd-local-patches/
- [ ] `tests/hooks.test.mjs` §patch-reapply — add 1-2 tests: gsd-auto-reapply-patches.sh prefers gsd-local-patches/ over runtime heuristics

*Existing infrastructure covers BUG-01/02 tests — only BUG-06 D-07 gap needs new stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session start shows "GSD patches auto-reapplied" after /gsd-update | BUG-06 | Requires live Claude Code session + /gsd-update | 1. Run /gsd-update. 2. Start new Claude Code session. 3. Verify message in SessionStart output. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 70s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
