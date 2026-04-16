---
phase: 36
slug: auto-session-capture
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-16
notes: |
  Unit tests (transcript.test.ts, prompts.test.ts) and mock-integration tests
  (session-end-capture.test.mjs) self-satisfy Wave 0 — they are authored by the
  same PLANs that add the code under test. No separate Wave 0 fixture generation
  phase required. Live API test (INTEGRATION=1) gated separately.
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (packages/cds-core) + vitest-or-node:test (root `tests/`, matches existing root setup) |
| **Config file** | `vitest.config.ts` (Phase 33 root) + per-package config extending root (Phase 33 D-05) |
| **Quick run command** | `pnpm -w vitest run --project cds-core packages/cds-core/src/capture` |
| **Full suite command** | `pnpm test` (all packages + root tests via test.projects) |
| **Estimated runtime** | ~50 seconds (Phase 33 baseline 45s + ~5s for new capture tests) |

---

## Sampling Rate

- **After every task commit:** `pnpm -w vitest run --project cds-core packages/cds-core/src/capture` (unit tier, <10s)
- **After every plan wave:** `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** `pnpm test` full suite must be green + manual `INTEGRATION=1 pnpm vitest run tests/hooks/session-end-capture.live.test.mjs`
- **Max feedback latency:** 30 seconds (unit + mock integration tier; live tier is manual-gated)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | CAPTURE-05 | — | tool_use schema rejects malformed payload | unit | `pnpm -w vitest run packages/cds-core/src/capture/prompts.test.ts` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | CAPTURE-05 | — | transcript parser handles empty/malformed jsonl safely | unit | `pnpm -w vitest run packages/cds-core/src/capture/transcript.test.ts` | ❌ W0 | ⬜ pending |
| 36-01-03 | 01 | 1 | CAPTURE-05 | — | tier-2 truncation cap enforced | unit | `pnpm -w vitest run packages/cds-core/src/capture/transcript.test.ts -t truncation` | ❌ W0 | ⬜ pending |
| 36-01-04 | 01 | 1 | CAPTURE-05 | — | capture barrel export surface | unit | `pnpm -w vitest run packages/cds-core/src/capture/index.test.ts` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 2 | CAPTURE-05 | T-36-01 | shell-safe subprocess (spawn, not shell-string) | structural | `node scripts/check-no-shell-interpolation.mjs hooks/session-end-capture.mjs` | ❌ W0 | ⬜ pending |
| 36-02-02 | 02 | 2 | CAPTURE-05 | — | hook exits 0 on forced dispatch throw | mock-integration | `pnpm test tests/hooks/session-end-capture.test.mjs -t forced-throw` | ❌ W0 | ⬜ pending |
| 36-02-03 | 02 | 2 | CAPTURE-05 | — | transaction rollback on partial write | mock-integration | `pnpm test tests/hooks/session-end-capture.test.mjs -t rollback` | ❌ W0 | ⬜ pending |
| 36-02-04 | 02 | 2 | CAPTURE-05 | — | wrapper returns in <100ms | structural | `pnpm test tests/hooks/session-end-capture.test.mjs -t wrapper-latency` | ❌ W0 | ⬜ pending |
| 36-02-05 | 02 | 2 | CAPTURE-05 | — | AbortController aborts at 60s | mock-integration | `pnpm test tests/hooks/session-end-capture.test.mjs -t timeout` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 3 | CAPTURE-06 | — | wizard removes old entry, adds new | structural | `pnpm test tests/install/hooks-migration.test.mjs -t replaces` | ❌ W0 | ⬜ pending |
| 36-03-02 | 03 | 3 | CAPTURE-06 | — | wizard idempotent on re-run | structural | `pnpm test tests/install/hooks-migration.test.mjs -t idempotent` | ❌ W0 | ⬜ pending |
| 36-03-03 | 03 | 3 | CAPTURE-06 | — | wizard preserves custom Stop hooks | structural | `pnpm test tests/install/hooks-migration.test.mjs -t custom-preserved` | ❌ W0 | ⬜ pending |
| 36-03-04 | 03 | 3 | CAPTURE-06 | — | chmod 0o755 applied to wrapper | structural | `pnpm test tests/install/hooks-migration.test.mjs -t executable-bit` | ❌ W0 | ⬜ pending |
| 36-03-05 | 03 | 3 | CAPTURE-06 | — | SKILL.md description narrowed | structural | `grep -q "fallback" skills/session-manager/SKILL.md` | ❌ W0 | ⬜ pending |
| 36-04-01 | 04 | 3 | CAPTURE-05 | — | end-to-end live capture produces SQLite rows | live-integration | `INTEGRATION=1 pnpm vitest run tests/hooks/session-end-capture.live.test.mjs` | ❌ W0 | ⬜ pending |
| 36-04-02 | 04 | 3 | CAPTURE-05 | — | cost within $0.05/session budget | live-integration | Same as 36-04-01, asserts `total().cost_usd < 0.05` | ❌ W0 | ⬜ pending |
| 36-04-03 | 04 | 3 | CAPTURE-05 | — | full success-criteria audit | integration | `pnpm test tests/hooks/phase36-success-criteria.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ❌ W0 = missing, created by the plan itself*

---

## Wave 0 Requirements

No separate Wave 0 — test scaffolding is generated by the same PLANs that add the code under test:

- Plan 01 creates `packages/cds-core/src/capture/transcript.test.ts`, `prompts.test.ts`, `index.test.ts`, and the `fixtures/` directory.
- Plan 02 creates `tests/hooks/session-end-capture.test.mjs` (mock integration tier) + `scripts/check-no-shell-interpolation.mjs` guard.
- Plan 03 creates `tests/install/hooks-migration.test.mjs` (wizard tier).
- Plan 04 creates `tests/hooks/session-end-capture.live.test.mjs` (live tier) + `tests/hooks/phase36-success-criteria.test.mjs` (acceptance audit).

vitest config + test.projects registration at root already exist (Phase 33). No framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end UX: session ends → capture runs detached → SQLite populated | CAPTURE-05 SC#1 | Requires real Claude Code session lifecycle, not just unit mocks | Inside a real configured project, start Claude Code, run any task, say "done". Within 60s run `sqlite3 ~/vault/projects/claude-dev-stack/sessions.db 'SELECT COUNT(*) FROM sessions, observations WHERE sessions.id = (SELECT id FROM sessions ORDER BY created_at DESC LIMIT 1)'` — expect ≥1 session row + N observation rows. |
| Wizard messaging | CAPTURE-06 SC#4 | Requires seeing wizard stdout | Re-run `npx claude-dev-stack configure` on a project that has legacy session-end-check.sh. Assert output contains `auto-capture enabled, /end no longer required for routine sessions`. |
| dispatch throw → session exit unblocked | SC#3 | Requires forcing real throw inside the hook | Temporarily set `ANTHROPIC_API_KEY=invalid-key` in the user's env, end a session, assert Claude Code exits normally with no visible error + no partial DB rows. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify commands (17/17 above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (verified — every task has a command)
- [ ] Wave 0 covers all MISSING references (self-satisfying — plans create their own test scaffolding)
- [ ] No watch-mode flags (`vitest run`, never `vitest` default watch)
- [ ] Feedback latency < 30s for unit + mock tier; live tier gated manually
- [ ] `nyquist_compliant: true` set in frontmatter ✓

**Approval:** pending (will be approved after plan checker passes)
