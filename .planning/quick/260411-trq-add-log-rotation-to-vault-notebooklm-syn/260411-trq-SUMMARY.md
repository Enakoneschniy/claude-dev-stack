# Quick Task 260411-trq — SUMMARY

**Status:** ✅ Shipped
**Date:** 2026-04-11
**Branch:** `chore/sync-log-rotation`

## What changed

| File | Change |
|---|---|
| `lib/notebooklm-sync.mjs` | + `MAX_LOG_LINES` export, + `_rotateLogIfNeeded()` export, +2 imports (`readFileSync`, `writeFileSync`) |
| `hooks/notebooklm-sync-runner.mjs` | + 1-line wire-up at top of `main()`, import `_rotateLogIfNeeded` |
| `tests/notebooklm-sync.test.mjs` | + 10 new unit tests in new `describe('_rotateLogIfNeeded')` block |

**Net:** 173 insertions, 4 deletions across 3 files.

## Behavioural contract (validated by tests)

- File missing → `{ rotated: false }`, no side effects
- File ≤ maxLines → `{ rotated: false }`, file untouched
- File > maxLines → `{ rotated: true, before, after }`, file overwritten with last `maxLines` lines
- Trailing newline preserved when present
- Read/write errors swallowed, return `{ rotated: false }` (NBLM-23 best-effort)
- Default `maxLines = 100` via `MAX_LOG_LINES` constant export
- Empty file treated as zero lines (no rotation)

## Commits

- `d992957 feat(notebooklm): rotate ~/vault/.notebooklm-sync.log to last 100 lines`

## Verification

- ✅ `node --check` clean on all 3 modified files
- ✅ `npm test` — 247 → **257 tests** (+10), 0 failures
- ⏳ CI matrix on PR — Node 18/20/22

## Threshold rationale

`MAX_LOG_LINES = 100` chosen because:
- Each sync run appends 2-4 lines (start + done [+ optional warn/error])
- 100 lines = 25-50 sync runs of history
- ~10 KB max file size at typical line length
- Sufficient for debugging the last few weeks of session-end activity

If a future use case needs more history, the constant is exported and trivially configurable.

## Strategy decision

**Variant (1) chosen: trim head, keep tail.** Read-modify-write on a single file under existing single-writer guarantee.

**Rejected**: rolling files (`.log.1`, `.log.2`) — adds complexity (rename chain, multiple files on disk) without meaningful debug benefit at our 2-4 lines/run scale.

## Backlog item closed

P2-#5 from `~/vault/projects/claude-dev-stack/sessions/2026-04-11-v0.8.1-hotfix-shipped.md`:
> **Sync log rotation** — `~/vault/.notebooklm-sync.log` может разрастаться. Deferred from v0.8 intentionally. Simple rotation scheme (max 5 runs kept, each run <500 lines) would be sufficient.

(Implementation generalised "max 5 runs" → "last 100 lines" because the runner emits a fixed 2-4 lines per run, making line-count a more robust ceiling than run-count.)

## Out of scope (deferred)

- Configurable threshold via env var (YAGNI)
- Compression of rotated content
- Time-based rotation (e.g., daily)
- Integration test that exercises `notebooklm-sync-runner.mjs` directly — runner has top-level side effects + detached subprocess; unit tests on `_rotateLogIfNeeded` cover the rotation logic, wire-up is a 1-line addition that's visually verifiable
