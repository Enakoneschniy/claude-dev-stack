---
phase: 05
slug: cli-integration-trigger-wizard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node.js native) |
| **Config file** | none — zero config, runs via `npm test` script |
| **Quick run command** | `node --test tests/notebooklm-cli.test.mjs tests/hooks.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~6 seconds (baseline 183 tests + new Phase 5 tests) |

---

## Sampling Rate

- **After every task commit:** Run focused `node --test <new-file>` for the module being changed
- **After every plan wave:** Run `npm test` (full suite, catches regressions — especially to Phase 3 manifest tests that change due to D-15 gitignore extension)
- **Before `/gsd-verify-work`:** Full suite must be green (TEST-04 continuous gate)
- **Max feedback latency:** ~6s (full suite)

---

## Per-Task Verification Map

> Planner populates concrete task IDs (5-01-XX, 5-02-XX, etc.) after wave decomposition. Requirement IDs (NBLM-19..27, TEST-02) are fixed.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 5-TBD | 05-XX | TBD | NBLM-19 (`notebooklm sync` CLI) | No credential leak in output; stats printed but never raw stderr of subprocess | unit (fake binary) + integration (temp vault) | `node --test tests/notebooklm-cli.test.mjs --test-name-pattern="runSync"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-20 (`notebooklm status` CLI) | Reads manifest but never writes to it; no API calls (dryRun mode) | unit (temp vault + manifest fixture) | `node --test tests/notebooklm-cli.test.mjs --test-name-pattern="runStatus"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-21 (session-end trigger conditional) | Trigger silent-skips if binary absent OR auth fails; never spawns sync in those cases | integration (fake session-end hook + fake binary absent) | `node --test tests/hooks.test.mjs --test-name-pattern="trigger skip"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-22 (detached spawn, non-blocking) | Trigger exit <100ms regardless of sync duration; runner survives parent exit | integration (measure trigger wall-clock, assert <1s) | `node --test tests/hooks.test.mjs --test-name-pattern="detached"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-23 (best-effort failures → log, never terminal) | All runner errors caught; log file receives entry; exit 0 always | integration (runner with failing fake binary) | `node --test tests/hooks.test.mjs --test-name-pattern="runner best-effort"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-24 (`bin/cli.mjs` routes `notebooklm`) | No collision with existing `case 'status':` at line 158 (analytics); top-level `status` unchanged | unit (CLI dispatch test) | `node --test tests/cli.test.mjs --test-name-pattern="notebooklm routing"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-25 (help text includes sync/status) | Help text grep-assertable | unit (capture stdout) | `node --test tests/cli.test.mjs --test-name-pattern="help text notebooklm"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-26 (install wizard — detect + install + login + verify) | No API key prompted or stored; pipx first, pip --user fallback; login inherits stdio; auth check captured | integration (mock prompts, fake binary) | `node --test tests/install.test.mjs --test-name-pattern="NotebookLM setup"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | NBLM-27 (doctor 3 lines) | `info` severity for missing binary (not `fail`); never panic-red | unit (doctor output capture) | `node --test tests/doctor.test.mjs --test-name-pattern="notebooklm section"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | TEST-02 (fresh vault smoke test) | `notebooklm status` exits 0 on empty vault with "no sync yet" message | integration (temp vault, no manifest) | `node --test tests/project-setup.test.mjs --test-name-pattern="notebooklm status fresh"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | Phase 3 extension (gitignore block 3→4 entries) | Idempotency sentinel bug fixed per research finding #5; existing vaults migrate correctly | unit (existing vault fixture with 3-line block) | `node --test tests/notebooklm-manifest.test.mjs --test-name-pattern="migration|four entries"` | ⬜ pending |
| 5-TBD | 05-XX | TBD | `bin/install.mjs::installNotebookLM` replacement (collision) | Existing function at line 816 REPLACED (not just placeholder at 1103-1114); old `pip install [browser]` pattern gone | grep + unit (install.mjs parsing) | `grep -c "pip install.*notebooklm-py\[browser\]" bin/install.mjs` (expect 0) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Planner MUST populate concrete task IDs (5-01-XX) AND ensure every row references tests that will be created by the named task.

---

## Wave 0 Requirements

- [ ] `tests/notebooklm-cli.test.mjs` — new file, ~15-20 tests for module routing, runSync, runStatus, help text
- [ ] `tests/hooks.test.mjs` — extended with trigger + runner integration tests (~8-12 new tests)
- [ ] `tests/cli.test.mjs` — extended with notebooklm dispatch test + help text assertion (~3-5 new tests)
- [ ] `tests/doctor.test.mjs` — new file OR extend existing — NotebookLM section tests (~4-6 tests)
- [ ] `tests/install.test.mjs` — existing or new — NotebookLM wizard step tests with mocked prompts (~5-8 tests)
- [ ] `tests/project-setup.test.mjs` — extended with TEST-02 fresh vault smoke test (~1-2 tests)
- [ ] `tests/notebooklm-manifest.test.mjs` — UPDATE existing T3-07 from 3 to 4 entries + add migration test for existing 3-line vaults
- [ ] `tests/fixtures/notebooklm-auth-stub.sh` OR extend existing `notebooklm-stub.sh` — fake binary supporting `auth check` and `login` modes (planner decides)

*Wave 0 NEW tests total: ~35-50. Wave 0 MODIFIED tests: ~3-5.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `notebooklm login` interactive flow | NBLM-26 (d) | Opens browser, touches real Google auth, can invalidate dev machine session | Dev-only smoke: run wizard against a disposable test user account; verify OAuth flow completes and `notebooklm auth check` returns exit 0 afterwards |
| Real `pipx install notebooklm-py` on clean machine | NBLM-26 (c) | Requires clean Python env without pre-installed notebooklm-py; CI matrix doesn't have this | Docs-only: document expected flow in Phase 5 SUMMARY.md; planner flags for v0.9 CI matrix expansion |
| Session-end trigger with REAL NotebookLM sync | NBLM-21/22 integration | Would pollute dev's real notebook during test | Dev-only: run `session-end-check.sh` manually once with trigger enabled against disposable notebook; verify log entry created and session-end UI returned in <1s |

*All three manual tests are opt-in for developer confidence, NOT gating for CI.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies — **populated by planner**
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (TEST-04 runs once)
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter after planner populates per-task rows

**Approval:** pending — planner must populate per-task rows, flip `status: approved`, and set `nyquist_compliant: true` after PLAN.md files reference every requirement.
