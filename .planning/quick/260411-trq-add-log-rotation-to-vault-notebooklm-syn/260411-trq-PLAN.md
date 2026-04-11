# Quick Task 260411-trq — Sync log rotation

**Date:** 2026-04-11
**Type:** Tech debt — backlog P2 #5 from `sessions/2026-04-11-v0.8.1-hotfix-shipped.md`
**Branch:** `chore/sync-log-rotation`

## Goal

Prevent unbounded growth of `~/vault/.notebooklm-sync.log`. Each session-end trigger appends 2-4 lines via `appendFileSync` from `hooks/notebooklm-sync-runner.mjs`. With daily use, the log grows linearly forever.

## Strategy chosen

**Variant (1): trim head, keep tail.** When line count exceeds threshold, read entire file, slice the last N lines, overwrite atomically. Single file, application-managed.

Rejected alternative: rolling files (`.log.1`, `.log.2`) — adds complexity (rename chain, multiple files on disk) without meaningful benefit at our scale (2-4 lines per run × ~daily frequency).

## Threshold

`MAX_LOG_LINES = 100`. Reasoning:
- Average run: 2 lines (start + done). Worst case: 4 lines (start + done + warn + error).
- 100 lines = 25–50 sync runs of history.
- Approx 10 KB max file size at typical line length.
- Sufficient for debugging the last few weeks of session-end activity.
- If a future use case needs more, the constant is trivially configurable.

## Architecture

### New export in `lib/notebooklm-sync.mjs`

```js
export const MAX_LOG_LINES = 100;

/**
 * Trim a line-oriented log file in place when it exceeds maxLines.
 * Single-writer assumption: hooks/notebooklm-sync-runner.mjs is the only
 * writer, spawned at most once per session-end via trigger gate.
 *
 * Test-visible internal: prefixed `_` per project convention.
 *
 * @param {string} logPath  absolute path to log file
 * @param {number} maxLines retain at most this many trailing lines
 * @returns {{ rotated: boolean, before?: number, after?: number }}
 */
export function _rotateLogIfNeeded(logPath, maxLines = MAX_LOG_LINES) {
  // TODO: user contribution
}
```

### Wire-up in `hooks/notebooklm-sync-runner.mjs`

Call once at the very top of `main()`, **before** the first `appendLogLine('info', 'sync start', ...)`:

```js
async function main() {
  _rotateLogIfNeeded(LOG_PATH);  // <-- new line
  appendLogLine('info', 'sync start', { project: basename(VAULT_ROOT) });
  // ... rest unchanged
}
```

## Behavioural contract

| Input state | Expected output |
|---|---|
| File doesn't exist | no-op, returns `{rotated: false}` |
| File has ≤ maxLines lines | no-op, returns `{rotated: false}` |
| File has > maxLines lines | overwrite with last `maxLines` lines, return `{rotated: true, before: N, after: maxLines}` |
| File is unreadable (permission error etc.) | catch + return `{rotated: false}` — must NEVER throw (NBLM-23 best-effort philosophy) |
| File ends with trailing newline | preserve trailing newline in output |

## Tests (in `tests/notebooklm-sync.test.mjs`)

New `describe('lib/notebooklm-sync.mjs — _rotateLogIfNeeded (P2-#5)')` block with:

1. `returns {rotated: false} when file does not exist`
2. `returns {rotated: false} when file has fewer lines than maxLines`
3. `returns {rotated: false} when file has exactly maxLines lines`
4. `trims to last maxLines lines when file exceeds threshold`
5. `preserves trailing newline after rotation`
6. `never throws on unreadable file (returns {rotated: false})`
7. `default maxLines is 100 (MAX_LOG_LINES exported)`

Optional integration test deferred — `notebooklm-sync-runner.mjs` is hard to test directly (top-level side effects, detached subprocess). Unit tests on `_rotateLogIfNeeded` cover the rotation behaviour; the wire-up is a 1-line addition that can be visually verified.

## Verification

1. `npm test` — must pass 247 → 254 (+7 tests)
2. `node --check hooks/notebooklm-sync-runner.mjs` — syntax sanity
3. Manual: `seq 1 200 | xargs -I{} echo "line {}" > /tmp/test.log && node -e 'import("./lib/notebooklm-sync.mjs").then(m=>console.log(m._rotateLogIfNeeded("/tmp/test.log")))'` → expect `{rotated: true, before: 200, after: 100}`, `wc -l /tmp/test.log` → 100

## Out of scope

- Configurable threshold via env var (YAGNI — fix the constant first)
- Compression of rotated content (variant 2 territory)
- Time-based rotation (e.g., daily) — line-count is sufficient and simpler

## Risk

**Very low.** Read-modify-write on a single file under single-writer guarantee. Worst case: rotation fails silently → log keeps growing → unchanged status quo.
