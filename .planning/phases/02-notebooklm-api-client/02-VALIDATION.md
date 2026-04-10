---
phase: 2
slug: notebooklm-api-client
status: draft
nyquist_compliant: false
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
| TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | ⬜ pending | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/notebooklm.test.mjs` — new test file, all 6 functions + error scenarios + fake binary fixture
- [ ] `tests/fixtures/notebooklm-stub.sh` — fake binary shell script (bash) placed in temp PATH during tests
- [ ] `lib/notebooklm.mjs` — the deliverable module itself (imported by tests)
- [ ] `node --test tests/notebooklm.test.mjs` command wired to existing `npm test` script (should already work — `tests/*.test.mjs` glob)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end smoke against real `notebooklm-py` v0.3.4 | NBLM-01..06 | Requires authenticated `notebooklm login` session on dev machine; not reproducible in CI | On dev machine with `notebooklm login` done: `node -e "import('./lib/notebooklm.mjs').then(m => m.createNotebook('smoke-test')).then(console.log)"` — should return `{ id, title }` without throwing |
| Cross-platform binary detection | NBLM-02 | `hasCommand` wrapper uses `which` which isn't available on Windows | Phase 5 doctor will test this in wizard flow; Phase 2 ships with POSIX-only detection documented |
| Install matrix for Phase 5 | (Phase 5 prep) | Requires different machines/VMs | Document expected commands in 02-RESEARCH.md §Install Matrix; actual testing is Phase 5 responsibility |

---

## Success Criteria Observability

From `02-RESEARCH.md` §Success Criteria Observability:

| Criterion | Observable Proof |
|-----------|-----------------|
| SC1: 6 exports exist | ESM import without error; each is a function (assert via `typeof m.createNotebook === 'function'`) |
| SC2: Single dep preserved | `JSON.parse(readFileSync('package.json')).dependencies` has exactly 1 key: `prompts` |
| SC3: Fake binary tests pass | `npm test` → notebooklm.test.mjs shows 0 failures |
| SC4: Missing binary → NotebooklmNotInstalledError | Test asserts `instanceof` + `.message` includes `pipx install notebooklm-py` |
| SC5: No credential handling | `grep` for `NOTEBOOKLM_API_KEY`, `storage_state`, `notebooklm login` in `lib/notebooklm.mjs` → 0 matches |

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

---

## Known Gotchas (from 02-RESEARCH.md)

1. **`source delete` / `source delete-by-title` don't support `--json`** — output is plain text; `runNotebooklm` needs `jsonMode: boolean` branch to handle text-mode parsing
2. **`uploadSource` actual JSON shape differs from SKILL.md docs** — real shape is `{"source": {"id", "title", ...}}` (nested), not `{"source_id", "status"}` (flat)
3. **`source list --json` on empty notebook emits Python WARNING to stderr** — benign, exits 0 with valid JSON `{"sources": []}` — wrapper must NOT treat stderr presence as error when exit is 0
4. **Rate-limit error shapes differ by command type** — JSON commands return `{"error": true, "code": "RATE_LIMITED"}` on stdout; text commands emit stderr regex patterns

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`tests/notebooklm.test.mjs`, `tests/fixtures/notebooklm-stub.sh`, `lib/notebooklm.mjs`)
- [ ] No watch-mode flags (node:test doesn't support watch by default, safe)
- [ ] Feedback latency < 5 seconds per task commit
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills per-task map)

**Approval:** pending — awaiting planner to populate per-task verification map
