---
phase: 21
slug: continuation-prompt-loop-md
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | none — runner invoked directly |
| **Quick run command** | `node --test tests/continuation.test.mjs tests/budget.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/continuation.test.mjs tests/budget.test.mjs`
- **After every plan wave:** Run `node --test tests/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 0 | LIMIT-02 | — | N/A | unit | `node --test tests/continuation.test.mjs` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 1 | LIMIT-02 | — | N/A | unit | `node --test tests/continuation.test.mjs` | ✅ | ⬜ pending |
| 21-01-03 | 01 | 1 | LIMIT-02 | — | N/A | integration | `node bin/cli.mjs budget continue --help 2>&1 \| grep -i continue` | ✅ | ⬜ pending |
| 21-02-01 | 02 | 0 | LIMIT-03 | — | N/A | unit | `node --test tests/templates.test.mjs` | ✅ | ⬜ pending |
| 21-02-02 | 02 | 1 | LIMIT-03 | — | N/A | unit | `test -f templates/loop.md && echo PASS` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/continuation.test.mjs` — stubs for LIMIT-02 option handlers
- [ ] `templates/loop.md` — loop.md template file must exist before wizard test runs

*Existing `tests/budget.test.mjs` covers existing budget utilities — extend but do not recreate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CronCreate fires reminder after "+1h" | LIMIT-02 | Requires live Claude Code session with CronCreate tool | Run `/budget-continue`, select "Remind me later", verify CronCreate is called |
| Desktop task fires GSD resume | LIMIT-02 | Requires local scheduler + wait time | Run `/budget-continue`, select "Auto-continue locally", verify Desktop task created |
| Cloud task clones and resumes | LIMIT-02 | Requires cloud infra + git remote | Run `/budget-continue`, select "Auto-continue in cloud", verify Cloud task created |
| loop.md installed to .claude/ | LIMIT-03 | Wizard flow (interactive) | Run install wizard, select loop.md, verify `{project}/.claude/loop.md` exists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
