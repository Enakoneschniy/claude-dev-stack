# Plan 34-02 — dispatchAgent + Models — Summary

**Completed:** 2026-04-16
**Requirement:** SDK-02
**Commit:** (this commit)

## What shipped

- `packages/cds-core/src/models.ts` — `MODEL_ALIASES` constant + `resolveModel(alias | full_id)` resolver.
- `packages/cds-core/src/agent-dispatcher.ts` — `dispatchAgent(opts): Promise<DispatchResult>` wrapping SDK `query()`. Handles:
  - API key fast-fail (`LicenseKeyError` with actionable message)
  - Model alias resolution via `resolveModel()`
  - AbortSignal → AbortController bridge (internal `signalToAbortController`)
  - System prompt pass-through (`{ type: 'preset', preset: 'claude_code', append }`)
  - SDK-native `tools` pass-through (D-20)
  - Full for-await iteration (NO `break` — Pitfall 2 lock)
  - Non-success result → `DispatchError`
- `packages/cds-core/src/agent-dispatcher.test.ts` — 8 mock-based tests:
  1. Aggregates assistant text + tokens + cost
  2. Throws `LicenseKeyError` without API key
  3. Throws `DispatchError` on `error_max_turns` subtype
  4. Resolves `'haiku'` → `'claude-haiku-4-5'`
  5. Passes full model IDs unchanged
  6. Bridges `AbortSignal` to SDK `AbortController`
  7. System prompt shape pass-through
  8. Pitfall 2 regression guard (late assistant messages preserved)
  Plus 1 `INTEGRATION=1`-gated live SDK hello-world: returns non-zero tokens for Haiku, output contains "pong".

## Threading & scope

- D-31 honored: dispatcher does NOT mutate caller-provided `Context`/`CostTracker` instances. `session_id` is accepted but NOT forwarded to SDK.
- D-19 honored: no streaming in Phase 34; output is full text after loop completes.
- D-32 honored: default `pnpm --filter @cds/core test` passes WITHOUT `ANTHROPIC_API_KEY` (verified: 9 tests passed, 1 skipped).

## Assumptions verified in execution

- A1 (SDK result shape: `usage.input_tokens` / `usage.output_tokens` / `total_cost_usd`): verified against installed SDK `sdk.d.ts` — `SDKResultSuccess` has `total_cost_usd: number`, `usage: NonNullableUsage`. Mock test pins these fields.
- A2 (SDK accepts `options.abortController: AbortController`): verified — `Options.abortController?: AbortController` confirmed in SDK types. Test captures the option and asserts it is an AbortController instance.

## Deviations from plan text

- **Test fix in Task 3:** the `throws DispatchError on non-success result subtype` test originally used `mockReturnValue(mockIter)` with a single generator instance, but called `dispatchAgent` twice via `rejects.toThrow`. Async generators are single-use, so the second call saw an exhausted iterator and resolved with zero-token success. Fixed by switching to `mockImplementation(() => freshGenerator())` which produces a new iterator per call. Inline comment in the test documents the rationale. All other tests verified correct under verbatim plan code.
- **SDK `tools` option type drift:** SDK 0.2.111 `Options.tools` expects `string[] | { type: 'preset'; preset: 'claude_code' }`, not `Tool[]`. Plan 02's `as never` cast absorbs this. MCP-style tool pass-through in the SDK appears to flow through other fields (agents/MCP servers); a future plan can refine if needed. Not blocking SDK-02.

## Ready for downstream

Plan 03 (Context) and Plan 04 (CostTracker) can now be written against the `dispatchAgent` interface. Plan 04 Task 4 will re-export `dispatchAgent`, `DispatchOptions`, `DispatchResult` from `packages/cds-core/src/index.ts` alongside the other primitives.
