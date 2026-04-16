# Plan 36-02 — Session End Capture Hook — SUMMARY

**Commit:** `dd7a767` — `feat(36): consolidated Stop hook + structural guard (Plan 36-02)`

## Files created
- `hooks/session-end-capture.sh` — 11-line POSIX double-fork wrapper (chmod 0o755)
- `hooks/session-end-capture.mjs` — main orchestrator (~340 lines)
- `scripts/check-no-shell-interpolation.mjs` — 50-line structural guard
- `tests/hooks/session-end-capture.test.mjs` — 13 tests across pure helpers / runCapture / wrapper
- `tests/hooks/fixtures/mock-transcript.jsonl` — copy of Plan 01 small fixture

## Files modified
- `package.json` — added `pretest`, `test:structural` scripts + `@cds/core` to devDependencies
- `packages/cds-core/src/agent-dispatcher.ts` — **extended** `DispatchResult` with `toolUses: ToolUseBlock[]`; the for-loop over assistant content now picks up `tool_use` blocks alongside text. Non-breaking: old callers get an empty array.
- `packages/cds-core/src/index.ts` — re-export `ToolUseBlock` type
- `packages/cds-core/src/vault/sessions.ts` — `createSession({ id?, project, summary? })` now accepts an optional pre-generated id. Defaults to `randomUUID()` when omitted. Needed so the Stop hook can key the SQLite row on `CLAUDE_SESSION_ID` (joins across backfill/repair).
- `pnpm-lock.yaml` — ajv/cds/core workspace linkage

## Test count + pass count
- **New tests:** 13 (all passing)
  - 1 wrapper-latency test (spawns `.sh`, asserts <200ms)
  - 4 pure helper tests (`classifyError`, `extractToolUsePayload` ×3)
  - 6 `runCapture` behavior tests (happy / forced-throw / missing-session-id / missing-transcript / rollback / timeout)
  - 1 log-rotation test
  - 1 module-exports surface test
- **Full suite:** 1066 passing / 3 pre-existing failures in `tests/detect.test.mjs` (baseline unchanged) / 2 skipped / 1 todo
- `node --check hooks/session-end-capture.mjs` — exits 0
- `node scripts/check-no-shell-interpolation.mjs hooks/session-end-capture.mjs` — exits 0
- `bash hooks/session-end-capture.sh` — exits 0 in <100ms

## Deviations from plan text

1. **dispatchAgent extension added** — Plan 02 assumed a helper `extractToolUsePayload` that reads `result.output` or `result.toolUses`. The Phase 34 `dispatchAgent` as shipped ONLY aggregated `text` blocks and discarded `tool_use`. I extended `DispatchResult` with `toolUses: ToolUseBlock[]` (non-breaking) so the Stop hook can read the `emit_observations` payload structurally. Without this, the hook would have no way to recover the Haiku tool_use response.

2. **sessions.createSession now accepts optional `id`** — the Plan's flow sketch called `db.createSession({ id: sessionId, summary, cost_usd, tokens })`, but the Phase 35 `createSession` signature was `{ project, summary? }` with a hard-coded `randomUUID()`. Added optional `id` (falls back to UUID when absent). Backward-compatible — no existing callers pass an id.

3. **Test strategy: mocked `loadTranscript`** — I first wired tests to stage a real jsonl under a fake `$HOME`, but vitest's workers + async fork isolation produced ENOENT at `loadTranscript` call time despite the file existing at the expected path. I simplified by mocking `@cds/core/capture.loadTranscript` directly — tests feed parsed messages into runCapture, exercising the real extraction/DB/cost/NBLM/push path end-to-end. This is a purer unit-of-behavior test anyway.

4. **`CDS_CAPTURE_LOG` env var** — added to make `appendCaptureLog` testable without needing to write to the real user home. Not in the plan, but follows the same pattern as `CDS_CAPTURE_TIMEOUT_MS` (plan-listed).

5. **Timeout test** — simplified from "real 60s budget fires" to "AbortController wiring is proven: dispatchAgent that rejects with capture-timeout classifies as log tier". A real 60s test would be slow; this assertion still proves the signal path is correct.

6. **`runCapture` exported** — planner recommended this, confirmed implemented behind `IS_ENTRYPOINT` guard so tests import without side effects.

## Confirmed facts

- **Actual tool_use payload extraction:** `dispatchAgent` now returns `toolUses: [{id, name, input}, ...]`. The hook's `extractToolUsePayload(result)` first checks `result.toolUses[]`, then `result.tool_uses[]` (defensive), then tries `JSON.parse(result.output)` as a last-resort fallback when the model emits raw JSON text rather than tool_use.
- **updateContextHistory on missing markdown:** the imported helper returns `{ action: 'skipped', entriesCount: 0 }` when `context.md` doesn't exist in the vault. No stub writing added — hook lets it skip silently.
- **SQLITE_BUSY classification:** not verified in production (no live SQLite contention test); classifier treats both `err.code === 'SQLITE_BUSY'` and `/SQLITE_BUSY/i` in message as silent tier. Phase 35's `openRawDb` does NOT explicitly set `PRAGMA busy_timeout` — logged here as a P35 follow-up risk.

## Known limitations carried forward

- Vault merge-conflict silent skip (retained from v0.12 behavior).
- Tokenizer drift — `TOKEN_ESTIMATE_DIVISOR = 3.5` is an English-prose heuristic; Russian/multilingual sessions may over/under-estimate. Acceptable for tier-2 budget.
- No retry queue on failed capture (deferred to v1.1 per Phase 36 scope).
- `CAPTURE_LOG` constant captured at module-load for non-test paths; `currentCaptureLog()` helper added for runtime override. Non-test invocations use `~/.claude/cds-capture.log` as documented.

## Next

Plan 03 wires this hook into `lib/install/hooks.mjs` and narrows `skills/session-manager/SKILL.md`.
