---
phase: 04
slug: vault-notebooklm-sync-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node.js native) |
| **Config file** | none — zero config, runs via `npm test` script in package.json |
| **Quick run command** | `node --test tests/notebooklm-sync.test.mjs tests/notebooklm.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (baseline 128 tests + new Phase 4 tests) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/notebooklm-sync.test.mjs` (quick, focused on new module)
- **After every plan wave:** Run `npm test` (full suite, catches regressions)
- **Before `/gsd-verify-work`:** Full suite must be green (TEST-04 continuous gate)
- **Max feedback latency:** ~5s (full suite)

---

## Per-Task Verification Map

> The planner will populate this table with specific tasks (T{N}-XX format) once PLAN.md files are created. The requirement references (NBLM-07..13) are fixed; the test IDs (T4-*) will be assigned by the planner based on the wave decomposition.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 4-TBD | 04-XX | TBD | NBLM-07 (sessions walk + upload) | Only existing vault paths walked (no path traversal via symlinks) | unit + integration | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="walks sessions"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | NBLM-08 (ADR walk + replace-by-filename) | `deleteSourceByTitle` only called with locally-generated titles, never user input | unit + integration | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="ADR regex"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | NBLM-09 (docs walk + replace) | Same as NBLM-08 | unit + integration | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="docs"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | NBLM-10 (context.md upload) | No secrets leaked — context.md assumed to be user-curated | unit + integration | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="context"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | NBLM-11 (shared/meta skipped) | Walker NEVER descends into `~/vault/shared/` or `~/vault/meta/`; verified by fixture containing files in those dirs and assertion that zero upload calls touch them | unit (walker test) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="skip shared meta"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | NBLM-12 (notebook auto-create) | `listNotebooks` throws on >1 match with same title (prevents uploading to wrong notebook) | unit (fake binary) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="notebook creation"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | NBLM-13 (`NOTEBOOKLM_NOTEBOOK_NAME` env override) | Env var value passed directly to `createNotebook` — no shell expansion | unit (env var set) | `NOTEBOOKLM_NOTEBOOK_NAME=test-vault node --test tests/notebooklm-sync.test.mjs --test-name-pattern="env override"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | D-07 (per-file failure → continue, collect) | Errors contain no stack traces leaking internal paths to logs | unit (fake binary returns error) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="continue on error"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | D-08 (rate limit → abort) | Partial stats returned — no silent success | unit (fake binary returns rate-limit stderr) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="rate limit abort"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | D-12 (sessions upload-once) | Manifest-presence check skips session regardless of hash change | unit (manifest fixture with session entry) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="session append-only"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | D-13 (non-sessions hash delta) | Skip on unchanged hash verified (zero API calls) | integration (fake binary + manifest fixture) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="skip unchanged"` | ⬜ pending |
| 4-TBD | 04-XX | TBD | D-10 (listNotebooks 7th function) | JSON shape normalized (id+title required, extras stripped per research finding #2) | unit (stub binary) | `node --test tests/notebooklm.test.mjs --test-name-pattern="listNotebooks"` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Planner MUST replace `4-TBD` task IDs with concrete `4-01-XX`, `4-02-XX` etc. after wave decomposition and MUST ensure every row's test command exists in the final test suite.

---

## Wave 0 Requirements

- [ ] `tests/notebooklm-sync.test.mjs` — new file, 15-25 tests covering rows above
- [ ] `tests/notebooklm.test.mjs` — extended with `listNotebooks` test cases (~4-6 new tests)
- [ ] `tests/fixtures/notebooklm-stub.sh` — may need extension for multi-mode support (handling `list`, `upload`, `delete-by-title`, `create`) OR new fixtures per scenario — planner's call per CONTEXT.md Claude's Discretion
- [ ] Vault fixture helper — `mkdtempSync` + create `projects/P1/context.md`, `projects/P1/sessions/2026-01-01-a.md`, etc. — reference Phase 3 test pattern at `tests/notebooklm-manifest.test.mjs`

*No new framework installation needed — all infrastructure already present from Phase 1/2/3.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end sync against real notebook | NBLM-07..13 integration | Cannot safely automate without polluting user's real NotebookLM account | Run `syncVault({ notebookName: 'phase-4-manual-test' })` against dev machine's `notebooklm-py`, verify via `notebooklm list` + `notebooklm source list -n <id>` that sources match walked files |
| First-run notebook auto-creation on real backend | NBLM-12 | `createNotebook` is side-effectful and rate-limited | Run `syncVault` when `phase-4-manual-test` doesn't exist, observe creation via `notebooklm list --json`, then re-run to verify reuse |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies — **populated by planner**
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (TEST-04 runs once)
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — planner must populate per-task rows and flip `status: approved` + `nyquist_compliant: true` in frontmatter after PLAN.md files reference every requirement.
