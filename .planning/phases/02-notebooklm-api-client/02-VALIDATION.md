---
phase: 2
slug: notebooklm-api-client
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Based on `02-RESEARCH.md` §Validation Architecture (lines 533-600).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node.js native) |
| **Config file** | None |
| **Quick run command** | `node --test tests/notebooklm.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2-5 seconds (unit tests with fake binary) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/notebooklm.test.mjs`
- **After every plan wave:** Run `npm test` (must stay at 68+ passing, 0 failing — current baseline after Phase 1)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

*Populated by planner during `/gsd-plan-phase` — one row per task.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | NBLM-02, NBLM-05 | T-02-03, T-02-04, T-02-05 | Error classes typed + install hint present + lazy detection side-effect free + frozen RATE_LIMIT_PATTERNS | unit (no binary) | `node --check lib/notebooklm.mjs` then dynamic import + instanceof assertions | ⬜ (file created by task) | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | NBLM-04, NBLM-05 | T-02-01, T-02-02, T-02-07, T-02-08 | spawnSync argv form; ENOENT fallback; JSON rate-limit code + stderr regex; rawOutput on parse failure | unit (no binary yet — tested via Plan 02's functions) | `node --check lib/notebooklm.mjs` + grep on security invariants | ⬜ (file extended by task) | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | NBLM-06, TEST-01 | T-02-06 | Fake binary PATH-injection harness with PID-scoped tmpdir; `_resetBinaryCache` isolation between tests; error-class invariants | unit (fake binary scaffold) | `node --test tests/notebooklm.test.mjs` (6 passing) + `npm test` (full suite green) | ⬜ (file created by task) | ⬜ pending |
| 02-02-T1 | 02-02 | 2 | NBLM-01 | T-02-10, T-02-11, T-02-12 | 6 exported async functions; all use runNotebooklm; all pass explicit -n; uploadSource resolves filepath via path.resolve | unit (no binary) | `node --check lib/notebooklm.mjs` + grep for export count, -n flag count, credential absence | ⬜ (file extended by task) | ⬜ pending |
| 02-02-T2 | 02-02 | 2 | NBLM-01, NBLM-04, NBLM-05, NBLM-06, TEST-01 | T-02-11, T-02-14 | Per-function happy paths + input validation (TypeError) + error propagation (generic/RateLimit/parse) + static invariants (single-dep, no credentials) | unit (fake binary driven by NOTEBOOKLM_STUB_* env vars) | `node --test tests/notebooklm.test.mjs` (≥24 passing) + `npm test` (full suite ≥90 passing, 0 failing) | ⬜ (file extended by task) | ⬜ pending |
| 02-02-T3 | 02-02 | 2 | NBLM-03 | — | System dependency documentation: notebooklm-py >= 0.3.4 entry with install path (pipx / pip --user fallback) and ADR-0001 reference; single-bullet insertion in Constraints section only | static (grep assertion) | `grep -q "notebooklm-py" .planning/PROJECT.md && grep -q "pipx install notebooklm-py" .planning/PROJECT.md && grep -q "0.3.4" .planning/PROJECT.md` | ⬜ (file edited by task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** Every task has an `<automated>` verify command. No 3-consecutive-task gap. All Wave 0 file creations (lib/notebooklm.mjs, tests/notebooklm.test.mjs, tests/fixtures/notebooklm-stub.sh) happen in Plan 02-01 before Plan 02-02 extends them.

---

## Wave 0 Requirements

- [ ] `tests/notebooklm.test.mjs` — new test file, all 6 functions + error scenarios + fake binary fixture
- [ ] `tests/fixtures/notebooklm-stub.sh` — fake binary shell script (bash) placed in temp PATH during tests
- [ ] `lib/notebooklm.mjs` — the deliverable module itself (imported by tests)
- [ ] `node --test tests/notebooklm.test.mjs` command wired to existing `npm test` script (should already work — `tests/*.test.mjs` glob)

All four Wave 0 items are created in Plan 02-01 (the first wave plan). Plan 02-02 extends them but does not create new Wave 0 files.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end smoke against real `notebooklm-py` v0.3.4 | NBLM-01..06 | Requires authenticated `notebooklm login` session on dev machine; not reproducible in CI | On dev machine with `notebooklm login` done: `node -e "import('./lib/notebooklm.mjs').then(m => m.createNotebook('smoke-test')).then(console.log)"` — should return `{ id, title }` without throwing |
| updateSource happy-path end-to-end | NBLM-01 | updateSource makes two sequential spawnSync calls; the single stateless stub cannot differentiate between them. The propagate-failure path is covered by unit tests; the happy path is covered here. | On dev machine with an authenticated notebook: create a test file, upload it via `uploadSource`, then call `updateSource(notebookId, sourceId, newFilepath)` — should return `{ sourceId, title }` with the new file content. Verify via `listSources` that the old sourceId is gone and a new one exists with the expected title. |
| Cross-platform binary detection | NBLM-02 | `hasCommand` wrapper uses `which` which isn't available on Windows | Phase 5 doctor will test this in wizard flow; Phase 2 ships with POSIX-only detection documented |
| Install matrix for Phase 5 | (Phase 5 prep) | Requires different machines/VMs | Document expected commands in 02-RESEARCH.md §Install Matrix; actual testing is Phase 5 responsibility |

---

## Success Criteria Observability

From `02-RESEARCH.md` §Success Criteria Observability:

| Criterion | Observable Proof |
|-----------|-----------------|
| SC1: 6 exports exist | ESM import without error; each is a function (assert via `typeof m.createNotebook === 'function'`) — covered by Plan 02-02 T1 acceptance criteria |
| SC2: Single dep preserved | `JSON.parse(readFileSync('package.json')).dependencies` has exactly 1 key: `prompts` — covered by Plan 02-02 T2 invariant test |
| SC3: Fake binary tests pass | `npm test` → notebooklm.test.mjs shows 0 failures — covered by Plan 02-02 T2 automated verify |
| SC4: Missing binary → NotebooklmNotInstalledError | Test asserts `instanceof` + `.message` includes `pipx install notebooklm-py` — covered by Plan 02-01 T3 unit tests |
| SC5: No credential handling | `grep` for `NOTEBOOKLM_API_KEY`, `storage_state`, `notebooklm login` in `lib/notebooklm.mjs` → 0 matches — covered by Plan 02-02 T2 invariant test (static readFileSync assertion) |

---

## Boundary Conditions → Error Types

From `02-RESEARCH.md` §Boundary Conditions → Error Types:

| Condition | Expected Error Type | Detection Method |
|-----------|---------------------|------------------|
| Binary absent from PATH | `NotebooklmNotInstalledError` | `hasCommand('notebooklm')` returns false |
| Auth expired (AUTH_ERROR code) | `NotebooklmCliError` | CLI exit 1 + stderr contains auth error text |
| Rate limited (RATE_LIMITED code, JSON path) | `NotebooklmRateLimitError` | `parsedOutput.code === 'RATE_LIMITED'` |
| Rate limited (text stderr, delete path) | `NotebooklmRateLimitError` | Regex on stderr matches `RATE_LIMIT_PATTERNS` |
| Invalid JSON from CLI | `NotebooklmCliError` | `JSON.parse` throws, caught by `runNotebooklm` |
| Missing required field in JSON | `NotebooklmCliError` | Schema validation in per-function normalization |
| Network offline | `NotebooklmCliError` | Generic non-zero exit propagation |
| `deleteSource`: source not found | `NotebooklmCliError` | Text parse of stderr indicates "not found" — not rate-limited |

---

## Invariants

1. `package.json` dependencies remains `{prompts: "^2.4.2"}` after Phase 2 completes — verified by commit diff + per-commit grep
2. `lib/notebooklm.mjs` imports only Node builtins and `lib/shared.mjs` (no npm packages) — verified by grep
3. Importing `lib/notebooklm.mjs` produces no side effects (no `hasCommand` at import time per D-04 lazy detection) — verified by import-then-grep-process-exec test
4. No `NOTEBOOKLM_API_KEY`, `storage_state`, `notebooklm login` references in Phase 2 code — verified by grep (credential delegation)
5. All CLI invocations use argv array form (`spawnSync('notebooklm', [...args])`), never string-concatenated shell form — verified by grep for shell-exec patterns
6. Every notebook-scoped function passes explicit `-n <notebookId>` argv element (parallel safety) — verified by grep count

---

## Known Gotchas (from 02-RESEARCH.md)

1. **`source delete` / `source delete-by-title` don't support `--json`** — output is plain text; `runNotebooklm` needs `jsonMode: boolean` branch to handle text-mode parsing. **Resolved in Plan 02-01 Task 2** (dual-mode runNotebooklm helper).
2. **`uploadSource` actual JSON shape differs from SKILL.md docs** — real shape is `{"source": {"id", "title", ...}}` (nested), not `{"source_id", "status"}` (flat). **Resolved in Plan 02-02 Task 1** (uploadSource extracts from parsed.source).
3. **`source list --json` on empty notebook emits Python WARNING to stderr** — benign, exits 0 with valid JSON `{"sources": []}` — wrapper must NOT treat stderr presence as error when exit is 0. **Resolved in Plan 02-01 Task 2** (runNotebooklm only reads stderr on non-zero exit for error path; on exit 0 stderr is ignored). **Tested in Plan 02-02 Task 2** (listSources empty-notebook test explicitly sets stderr to the WARNING string).
4. **Rate-limit error shapes differ by command type** — JSON commands return `{"error": true, "code": "RATE_LIMITED"}` on stdout; text commands emit stderr regex patterns. **Resolved in Plan 02-01 Task 2** (dual-path rate-limit detection). **Tested in Plan 02-02 Task 2** (two separate error-propagation tests: one for JSON path via createNotebook, one for text path via deleteSource).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`tests/notebooklm.test.mjs`, `tests/fixtures/notebooklm-stub.sh`, `lib/notebooklm.mjs`)
- [x] No watch-mode flags (node:test doesn't support watch by default, safe)
- [x] Feedback latency < 5 seconds per task commit
- [x] `nyquist_compliant: true` set in frontmatter (planner populated per-task map)

**Approval:** ✅ approved — planner populated per-task verification map 2026-04-10; nyquist_compliant flipped true; wave_0_complete remains false until execution completes Plan 02-01 Task 3.
