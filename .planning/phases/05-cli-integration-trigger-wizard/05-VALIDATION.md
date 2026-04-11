---
phase: 05
slug: cli-integration-trigger-wizard
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
approved: 2026-04-11
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node.js native) |
| **Config file** | none — zero config, runs via `npm test` script |
| **Quick run command** | `node --test tests/notebooklm-cli.test.mjs tests/hooks.test.mjs tests/notebooklm-manifest.test.mjs tests/doctor.test.mjs tests/install.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~6-8 seconds (baseline 183 tests + ~35-50 new Phase 5 tests) |

---

## Sampling Rate

- **After every task commit:** Run focused `node --test <new-file>` for the module being changed
- **After every plan wave:** Run `npm test` (full suite, catches regressions — especially to Phase 3 manifest tests that change due to D-15 gitignore extension)
- **Before `/gsd-verify-work`:** Full suite must be green (TEST-04 continuous gate)
- **Max feedback latency:** ~8s (full suite)

---

## Per-Task Verification Map

> Concrete task IDs populated after plan decomposition. Each row references a task created in a PLAN.md file and maps to a requirement ID + automated test command.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 5-01-01 | 05-01 | 1 | NBLM-19 (`notebooklm sync` CLI) | No credential leak in output; stats printed but error `reason` truncated to ≤200 chars (T-05-01) | unit (fake binary) + integration (temp vault) | `node --test tests/notebooklm-cli.test.mjs` | ⬜ pending |
| 5-01-01 | 05-01 | 1 | NBLM-20 (`notebooklm status` CLI) | Reads manifest but never writes to it; dryRun:true bypasses all API calls (research Pitfall 4) | unit (temp vault + manifest fixture) | `node --test tests/notebooklm-cli.test.mjs` | ⬜ pending |
| 5-01-02 | 05-01 | 1 | NBLM-24 (`bin/cli.mjs` routes `notebooklm`) | No collision with existing `case 'status':` at line 158 (research finding #6); top-level `status` still routes to analytics | unit (CLI dispatch test via execFileSync) | `node --test tests/cli.test.mjs` | ⬜ pending |
| 5-01-02 | 05-01 | 1 | NBLM-25 (help text includes sync/status) | Help text grep-assertable | unit (capture stdout) | `node --test tests/cli.test.mjs` | ⬜ pending |
| 5-01-03 | 05-01 | 1 | TEST-02 (fresh vault smoke test) | `notebooklm status` exits 0 on empty vault with "Last sync: never" message; no manifest created as side effect | integration (temp vault, no manifest) | `node --test tests/project-setup.test.mjs` | ⬜ pending |
| 5-02-01 | 05-02 | 2 | NBLM-22 (detached spawn, non-blocking) | Trigger exit wall-clock <1000ms regardless of stub runner duration; `.unref()` releases parent | integration (real spawn + `.unref()`, wall-clock measurement) | `node --test tests/hooks.test.mjs` | ⬜ pending |
| 5-02-01 | 05-02 | 2 | NBLM-21 (session-end trigger conditional — part 1) | Trigger silent-skips when binary absent | integration (empty PATH → trigger exits 0) | `node --test tests/hooks.test.mjs` | ⬜ pending |
| 5-02-02 | 05-02 | 2 | NBLM-21 (session-end trigger conditional — part 2) | Runner skips syncVault when auth check exits non-zero; log entry `reason=auth-check-failed` | integration (NOTEBOOKLM_SYNC_STUB_AUTH_EXIT=1) | `node --test tests/hooks.test.mjs` | ⬜ pending |
| 5-02-02 | 05-02 | 2 | NBLM-23 (best-effort — log, never terminal) | All runner errors caught; uncaughtException handler installed; exit 0 on every branch; grep verifies `process.exit([1-9])` = 0 | integration (failing stub + source grep) | `node --test tests/hooks.test.mjs` | ⬜ pending |
| 5-02-03 | 05-02 | 2 | NBLM-21 (session-end hook wiring — D-07 ordering) | Trigger invocation appears AFTER update-context AND BEFORE vault git push in session-end-check.sh; source-level string-index test | unit (source-level grep + index assertions) | `node --test tests/hooks.test.mjs` | ⬜ pending |
| 5-03-01 | 05-03 | 2 | Phase 3 extension (gitignore block 3→4 entries) | Migration-safe sentinel per research finding #5; existing 3-entry vaults get `.notebooklm-sync.log` appended without duplicating existing entries | unit (existing vault fixture with 3-line block + T3-07 update) | `node --test tests/notebooklm-manifest.test.mjs` | ⬜ pending |
| 5-03-02 | 05-03 | 2 | NBLM-27 (doctor 3 lines) | `info` severity for missing binary per ADR-0012 (not `fail` or `warn`); never increments `issues` / `warnings` counters on optional binary absence | unit (doctor output capture with empty PATH vs stub PATH) | `node --test tests/doctor.test.mjs` | ⬜ pending |
| 5-03-03 | 05-03 | 2 | NBLM-26 (install wizard — detect + install + login + verify) | No API key prompted or stored (grep `NOTEBOOKLM_API_KEY` = 0); pipx first, pip --user fallback; `stdio: 'inherit'` for login; SIGINT handled | unit (grep structural) + functional (mocked prompts, fake binary) | `node --test tests/install.test.mjs` | ⬜ pending |
| 5-03-03 | 05-03 | 2 | `bin/install.mjs::installNotebookLM` replacement (collision fix) | Existing function at line 816 REPLACED (research finding #4); old `pip install [browser] --break-system-packages` pattern removed | grep + unit | `grep -c 'break-system-packages' bin/install.mjs` (expect 0) | ⬜ pending |
| 5-03-04 | 05-03 | 2 | NBLM-26 end-to-end (interactive) | Real `notebooklm login` subprocess handoff works on dev machine | manual checkpoint:human-verify | See Plan 05-03 Task 4 how-to-verify | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **Nyquist compliance:** All 14 task×requirement rows have an automated verification command OR a manual checkpoint with explicit human-verify steps. No two consecutive task rows are both manual. Wave 0 test files are ALL referenced by at least one row. Phase 3 regression rows (T3-01..T3-08) are covered transitively by `node --test tests/notebooklm-manifest.test.mjs`.

---

## Wave 0 Requirements

- [x] `tests/notebooklm-cli.test.mjs` — Plan 05-01 Task 1 creates this file (~15-18 tests for module routing, runSync, runStatus, help text)
- [x] `tests/cli.test.mjs` — Plan 05-01 Task 2 creates or extends this file (~5-6 dispatch tests)
- [x] `tests/project-setup.test.mjs` — Plan 05-01 Task 3 extends this file (~2 new TEST-02 tests)
- [x] `tests/hooks.test.mjs` — Plan 05-02 Tasks 1-3 extend this file (~10-14 new integration tests)
- [x] `tests/fixtures/notebooklm-sync-stub.sh` — Plan 05-02 Task 1 extends stub with `auth check` mode (NOTEBOOKLM_SYNC_STUB_AUTH_EXIT env var)
- [x] `tests/notebooklm-manifest.test.mjs` — Plan 05-03 Task 1 updates T3-07 from 3 to 4 entries AND adds migration test for existing 3-line vaults
- [x] `tests/doctor.test.mjs` — Plan 05-03 Task 2 creates this file (~6-8 tests for NotebookLM section + ADR-0012 severity discipline)
- [x] `tests/install.test.mjs` — Plan 05-03 Task 3 creates this file (~5-8 tests for wizard step — mix of structural grep + mocked subprocess)

*Wave 0 NEW tests total: ~40-55 across 4 new files + 4 extended files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `notebooklm login` interactive flow | NBLM-26 (d) | Opens browser, touches real Google auth, can invalidate dev machine session | Plan 05-03 Task 4 (checkpoint:human-verify) — run wizard against disposable /tmp/phase5-vault; verify detection + login + auth check + first-sync prompt |
| Real `pipx install notebooklm-py` on clean machine | NBLM-26 (c) | Requires clean Python env without pre-installed notebooklm-py; CI matrix doesn't have this | Docs-only: document expected flow in Plan 05-03 Task 4 acceptance; Phase 5 SUMMARY flags for v0.9 CI matrix expansion |
| Session-end trigger with REAL NotebookLM sync | NBLM-21/22 integration | Would pollute dev's real notebook during test | Dev-only: run `session-end-check.sh` manually once with trigger enabled against disposable notebook; verify log entry created and session-end UI returned in <1s |

*The second and third manual tests are opt-in for developer confidence, NOT gating for CI. Only Plan 05-03 Task 4 is a blocking checkpoint gate.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify OR are checkpoint:human-verify with explicit `<how-to-verify>` steps
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (Task 4 is the only manual checkpoint; Tasks 1-3 all have automated commands)
- [x] Wave 0 covers all MISSING test file references (7 files listed above, all created or extended by Plan 05-01/02/03 tasks)
- [x] No watch-mode flags (TEST-04 runs once per wave)
- [x] Feedback latency < 10s (baseline 183 + Phase 5 ~40-55 new = ~220-240 tests, ~8s)
- [x] `nyquist_compliant: true` set in frontmatter (approved)

**Approval:** APPROVED 2026-04-11. All per-task rows reference concrete test commands. Every Phase 5 requirement (NBLM-19..27 + TEST-02) is mapped to at least one row. Plans 05-01, 05-02, 05-03 populate the test files named above. Wave 0 test infrastructure is complete.
