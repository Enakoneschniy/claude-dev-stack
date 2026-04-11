---
phase: 04
slug: vault-notebooklm-sync-pipeline
status: approved
nyquist_compliant: true
wave_0_complete: true
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

> Populated by the planner on 2026-04-11 after Plans 04-01 and 04-02 decomposed the phase. Task IDs are concrete; status is flipped during execution via `/gsd-execute-phase`.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 4-02-01 + 4-02-03 | 04-02 | 2 | NBLM-07 (sessions walk + upload) | Only existing vault paths walked (no path traversal via symlinks — T-04-07 accepted); walkProjectFiles uses readdirSync on `projects/` subtree only | unit (walker) + integration (first run) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="walkProjectFiles\|syncVault integration"` | ✅ green |
| 4-02-01 + 4-02-03 | 04-02 | 2 | NBLM-08 (ADR walk + replace-by-filename) | `deleteSourceByTitle` only called with locally-generated titles from `buildTitle(category, slug, basename)`, never user input (T-04-03 inherited mitigation) | unit (walker ADR regex) + integration (edited ADR) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="ADR\|replace-by-filename"` | ✅ green |
| 4-02-03 | 04-02 | 2 | NBLM-09 (docs walk + replace) | Same as NBLM-08 — `buildTitle('doc', ...)` fixed format | integration (first run + second run) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="first run uploads all 6"` | ✅ green |
| 4-02-03 | 04-02 | 2 | NBLM-10 (context.md upload) | No secrets leaked — context.md assumed user-curated; `buildTitle('context', ...)` deterministic | integration (first run) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="first run uploads all 6"` | ✅ green |
| 4-02-01 + 4-02-03 | 04-02 | 2 | NBLM-11 (shared/meta skipped) | Walker NEVER descends into `~/vault/shared/` or `~/vault/meta/`; verified by fixture containing files in those dirs + assertion that manifest has zero keys matching those prefixes | unit (walker) + integration | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="shared\|NBLM-11"` | ✅ green |
| 4-02-02 + 4-02-03 | 04-02 | 2 | NBLM-12 (notebook auto-create) | `ensureNotebook` throws `NotebooklmCliError` on ≥2 matches with same title (T-04-09 mitigation — prevents uploading to wrong notebook); strict `===` equality used for lookup (T-04-08) | unit (ensureNotebook) + integration (first run creates + second run reuses) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="ensureNotebook\|auto-created"` | ✅ green |
| 4-02-03 | 04-02 | 2 | NBLM-13 (`NOTEBOOKLM_NOTEBOOK_NAME` env override) | Env var value passed directly to `createNotebook` via argv array — no shell expansion (Phase 2 inherited) | integration (env var set) | `NOTEBOOKLM_NOTEBOOK_NAME=test-vault node --test tests/notebooklm-sync.test.mjs --test-name-pattern="env var override"` | ✅ green |
| 4-02-02 | 04-02 | 2 | D-07 (per-file failure → continue, collect) | `stats.errors[]` contains `{file, title, reason, error}` shape; `reason` truncated at 200 chars; no manifest entry written for failed file | unit (syncOneFile upload-fail) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="uploadSource throws generic"` | ✅ green |
| 4-02-02 + 4-02-03 | 04-02 | 2 | D-08 (rate limit → abort) | Partial stats returned with `rateLimited: true`; no silent success; manifest entries for prior successful files persist (T-04-12 mitigation via D-14 per-file write) | unit (syncOneFile rate-limit) + integration (rate-limit abort) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="rate[- ]limit"` | ✅ green |
| 4-02-02 + 4-02-03 | 04-02 | 2 | D-12 (sessions upload-once) | Manifest-presence check skips session regardless of file content change | unit (syncOneFile session in manifest) + integration (second run) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="session.*already in manifest\|second run skips"` | ✅ green |
| 4-02-02 + 4-02-03 | 04-02 | 2 | D-13 (non-sessions hash delta) | Skip on unchanged hash verified (zero API calls); delete-then-upload on change; `deleteSourceByTitle` errors swallowed per research finding #2 | unit (syncOneFile unchanged + changed) + integration (edit ADR) | `node --test tests/notebooklm-sync.test.mjs --test-name-pattern="non-session\|edited ADR"` | ✅ green |
| 4-01-01 | 04-01 | 1 | D-10 (listNotebooks 7th function) | JSON shape normalized (id+title required, `index`/`is_owner`/`count` stripped per research finding #1); T-04-01 mitigation | unit (stub binary) | `node --test tests/notebooklm.test.mjs --test-name-pattern="listNotebooks"` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Task ID legend:**
- `4-01-01` = Plan 04-01, Task 1 (listNotebooks + 6 unit tests in tests/notebooklm.test.mjs)
- `4-01-02` = Plan 04-01, Task 2 (argv-aware stub + lib/notebooklm-sync.mjs scaffold + buildTitle + scaffold tests)
- `4-01-03` = Plan 04-01, Task 3 (full suite gate + decision coverage self-check)
- `4-02-01` = Plan 04-02, Task 1 (walkProjectFiles + 8 walker unit tests)
- `4-02-02` = Plan 04-02, Task 2 (ensureNotebook + syncOneFile + 12 helper unit tests)
- `4-02-03` = Plan 04-02, Task 3 (syncVault orchestration + 12 integration tests)

---

## Wave 0 Requirements

- [x] `tests/notebooklm-sync.test.mjs` — new file, planned ≥25 tests covering rows above (created in plan 04-01 Task 2, extended by 04-02 Tasks 1-3)
- [x] `tests/notebooklm.test.mjs` — extended with `listNotebooks` test cases (6 new tests in plan 04-01 Task 1)
- [x] `tests/fixtures/notebooklm-sync-stub.sh` — argv-aware stub branching on `$1` subcommand (`list`, `create`, `source add`, `source delete-by-title`) with per-mode env var overrides (created in plan 04-01 Task 2)
- [x] Vault fixture helper — `mkdtempSync` + create `projects/P1/context.md`, `projects/P1/sessions/...`, etc. — planned in plan 04-02 Task 1 (walker tests) and Task 3 (integration tests)

*No new framework installation needed — all infrastructure already present from Phase 1/2/3.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end sync against real notebook | NBLM-07..13 integration | Cannot safely automate without polluting user's real NotebookLM account | Run `syncVault({ notebookName: 'phase-4-manual-test' })` against dev machine's `notebooklm-py`, verify via `notebooklm list` + `notebooklm source list -n <id>` that sources match walked files |
| First-run notebook auto-creation on real backend | NBLM-12 | `createNotebook` is side-effectful and rate-limited | Run `syncVault` when `phase-4-manual-test` doesn't exist, observe creation via `notebooklm list --json`, then re-run to verify reuse |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — **populated by planner; ticked during execution**
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (TEST-04 runs once)
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — planner populated per-task rows 2026-04-11. Execution phase (`/gsd-execute-phase 04`) ticks the remaining checkboxes after each task's automated verify passes.
