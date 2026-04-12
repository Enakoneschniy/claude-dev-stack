---
phase: 6
slug: git-conventions-skill-ecosystem
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node.js native) |
| **Config file** | none — native to Node.js 18+ |
| **Quick run command** | `node --test tests/git-scopes.test.mjs tests/git-conventions.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/git-scopes.test.mjs tests/git-conventions.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | INFRA-01 | — | N/A | unit | `node --test tests/helpers/fixtures.test.mjs` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | INFRA-02 | — | Atomic write prevents partial JSON | unit | `node --test tests/shared.test.mjs` | ✅ | ⬜ pending |
| 6-02-01 | 02 | 1 | GIT-01 | — | N/A | unit | `node --test tests/git-scopes.test.mjs` | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 1 | GIT-02 | — | N/A | unit | `node --test tests/git-scopes.test.mjs` | ❌ W0 | ⬜ pending |
| 6-02-03 | 02 | 1 | GIT-03 | — | N/A | unit | `node --test tests/git-scopes.test.mjs` | ❌ W0 | ⬜ pending |
| 6-02-04 | 02 | 1 | GIT-04 | — | N/A | unit | `node --test tests/git-scopes.test.mjs` | ❌ W0 | ⬜ pending |
| 6-02-05 | 02 | 1 | GIT-05 | — | N/A | unit | `node --test tests/git-scopes.test.mjs` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 2 | GIT-06 | — | N/A | unit | `node --test tests/git-conventions.test.mjs` | ❌ W0 | ⬜ pending |
| 6-03-02 | 03 | 2 | GIT-07 | — | Fallback chain prevents crash on missing origin/HEAD | unit | `node --test tests/git-conventions.test.mjs` | ❌ W0 | ⬜ pending |
| 6-03-03 | 03 | 2 | GIT-08 | — | N/A | unit | `node --test tests/git-conventions.test.mjs` | ❌ W0 | ⬜ pending |
| 6-03-04 | 03 | 2 | GIT-09 | — | commitlint never auto-installed | unit | `node --test tests/git-conventions.test.mjs` | ❌ W0 | ⬜ pending |
| 6-03-05 | 03 | 2 | GIT-10 | — | N/A | unit | `node --test tests/git-conventions.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/helpers/fixtures.mjs` — shared test fixtures (makeTempVault, makeTempGitRepo, makeTempMonorepo, withStubBinary)
- [ ] `tests/helpers/fixtures.test.mjs` — fixture self-tests
- [ ] `tests/git-scopes.test.mjs` — stubs for GIT-01..05
- [ ] `tests/git-conventions.test.mjs` — stubs for GIT-06..10

*Existing infrastructure (`tests/shared.test.mjs`) covers INFRA-02 additions.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Skill auto-triggers in live Claude session | GIT-06 | Requires live Claude Code runtime | Open project with git-conventions installed, say "commit this as a fix", verify type(scope): subject output |
| Setup wizard UX flow | GIT-08 | Interactive prompts require human driver | Run `claude-dev-stack install`, verify git-conventions step appears with correct defaults |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
