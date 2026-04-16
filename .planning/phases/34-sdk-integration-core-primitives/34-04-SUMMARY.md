# Plan 34-04 — CostTracker + Barrel — Summary + Phase 34 Close

**Completed:** 2026-04-16
**Requirements:** CORE-02 (primary); also completes SDK-01 / SDK-02 / CORE-01 exposure via barrel
**Commit:** (this commit)

## What shipped (Plan 04 only)

- `packages/cds-core/src/pricing.ts` — Bundled USD-per-million-token table for
  Haiku 4.5 ($1.00 / $5.00), Sonnet 4.5 and 4.6 ($3.00 / $15.00), Opus 4.6
  ($15.00 / $75.00) as of 2026-04-16 + `loadPricingSync()` with user-override
  merge + `pricingOverridePath()` helper + shape validation.
- `packages/cds-core/src/cost-tracker.ts` — `CostTracker` class. `record()` /
  `total()` / `dump()`. Pattern-suffix pricing match (`'claude-haiku-4-5-*'`
  matches `'claude-haiku-4-5-20260301'`). DI constructor for tests.
- `packages/cds-core/src/cost-tracker.test.ts` — 15 tests across 3 describe
  blocks: aggregation across multiple calls, bundled model resolution,
  pattern-suffix match, UnknownModelError throw + hierarchy check
  (extends DispatchError), dump format (three-line header + $X.XX cost),
  `~/.claude/anthropic-pricing.json` override (merge + add-new + malformed
  fallback + invalid-shape fallback).
- `packages/cds-core/src/errors.ts` — `UnknownModelError extends DispatchError`
  appended. Hierarchy now: `CdsCoreError` → `DispatchError` →
  `LicenseKeyError`, `UnknownModelError`.
- `packages/cds-core/src/index.ts` — Public barrel. Re-exports:
  - Functions: `dispatchAgent`, `resolveModel`, `loadPricingSync`,
    `pricingOverridePath`, `contextFilePath`
  - Classes: `Context`, `CostTracker`, `DispatchError`, `LicenseKeyError`,
    `UnknownModelError`
  - Constants: `MODEL_ALIASES`, `PRICING_TABLE`, `CDS_CORE_VERSION`
  - Types: `DispatchOptions`, `DispatchResult`, `ConversationMessage`,
    `PricingEntry`, `Tool` (aliased from SDK `SdkMcpToolDefinition`)
- `packages/cds-core/src/index.test.ts` — Public-surface smoke: every export
  is present, error hierarchy is correct, aliases resolve, a trivial Context
  + CostTracker construction works end-to-end (8 tests).

## Decisions honored (Plan 04)

- D-27: `CostTracker` API surface — constructor / record / total / dump
- D-28: bundled + override merge via `loadPricingSync()`
- D-29: unknown model throws — silent zero-cost prohibited
- D-30: per-session only, no cross-session aggregation; `dump()` matches
  CONTEXT.md format sketch
- D-31: sessionId is a convention — CostTracker accepts it for labeling
  (no primary-key role, hence fallback to empty string when unset)

## Deviations from plan text

- **Pricing values:** user instruction override specified current Anthropic
  prices (Haiku $1/$5, Sonnet $3/$15, Opus $15/$75 per MTok) instead of the
  plan's proposed $0.25/$1.25 for Haiku. Implemented user's values and
  updated `cost-tracker.test.ts` expected-cost assertions to match.
- **Sonnet family coverage:** added exact + pattern keys for both
  `claude-sonnet-4-5` and `claude-sonnet-4-6` (user hint mentioned both
  Sonnet generations).
- **SDK `Tool` type:** SDK 0.2.111 does not export a type named `Tool`; it
  exports `SdkMcpToolDefinition`. Index barrel re-exports it under the alias
  `Tool` for consumer ergonomics (`export type { SdkMcpToolDefinition as Tool }`).
- **errors.ts placeholder:** Plan 01 did not leave a placeholder comment —
  `UnknownModelError` was appended after the existing `LicenseKeyError` class
  instead. Three-class hierarchy intact: `DispatchError` →
  `LicenseKeyError`, `UnknownModelError`.

## Phase 34 — Close

**Requirements satisfied:**
- SDK-01 — Plan 01 (NOTICES.md + license disclosure + REQUIREMENTS.md D-15 correction)
- SDK-02 — Plan 02 (dispatchAgent + mock + INTEGRATION=1 live test)
- CORE-01 — Plan 03 (Context class + persistence)
- CORE-02 — Plan 04 (CostTracker + pricing table + override)

**ROADMAP Success Criteria — status:**
1. `NOTICES.md` lists SDK with Anthropic Commercial ToS (Plan 01).
2. `dispatchAgent({ model: 'haiku' })` returns `{ output, tokens, cost_usd }`
   with non-zero tokens from live SDK (Plan 02 integration test, gated by
   `INTEGRATION=1`).
3. `Context` accumulates messages via `add()` and persists to
   `~/.claude/cds-context-{session_id}.json` (Plan 03).
4. `CostTracker` aggregates per-session token + USD via `total()` / `dump()`
   (Plan 04).

**Test matrix:**
- Plan 02 (`agent-dispatcher.test.ts`): 8 mock tests + 1 INTEGRATION=1 live test
- Plan 03 (`context.test.ts`): 21 tests across 4 describe groups (tmp-HOME redirect)
- Plan 04 (`cost-tracker.test.ts`): 15 tests across 3 describe groups
- `index.test.ts`: 8 public-surface smoke tests
- Total `@cds/core` tests: **52 passed + 1 skipped**
- Root full-suite: **996 passed** (Phase 33 baseline 945 preserved; Phase 34
  adds ~51 cds-core tests)
- 3 pre-existing failures in `tests/detect.test.mjs` unchanged (unrelated)

**Assumption log (from RESEARCH.md) — closure:**
- A1 (SDK result shape): confirmed via mock + SDK type inspection in Plan 02
- A2 (SDK accepts `abortController`): confirmed via mock test in Plan 02
- A3 (2026-04-16 pricing values): sourced from user instructions at execution
  time; retrieval date is comment-preserved in `pricing.ts`. User override
  path (`~/.claude/anthropic-pricing.json`) documented as runtime-correctness
  mechanism.
- A4 (NOTICES.md auto-in-pack): confirmed in Plan 01 Task 3
- A5 (SDK `engines.node >= 18`): asserted in Plan 01 Task 1
- A6 (`pnpm licenses list` detects copyleft): exercised in Plan 01 Task 3

**Open items deferred to later phases (per CONTEXT.md `<deferred>`):**
- Refactoring `lib/adr-bridge-session.mjs` to use `dispatchAgent` → Phase 36
- Streaming variant `dispatchAgentStream()` → Phase 39 or later
- `Context.compact()` → v1.1+
- Cross-session cost aggregation → v1.1+ / analytics
- CI-time license drift detection → v1.1+

## Ready for Phase 35

`@cds/core` public surface is stable — TS build emits `dist/index.d.ts` with
every primitive, type, error, and utility. Phase 35 (Tiered Vault — Tier 2
SQLite) can now assume `dispatchAgent` / `Context` / `CostTracker` are
importable. Phase 36 (Auto Session Capture) is the first real consumer of
`dispatchAgent`, unblocking the failing v0.12 ADR-02 subprocess pattern.
