# Phase 34: SDK Integration & Core Primitives - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Populate `packages/cds-core/src/` (scaffolded in Phase 33) with three production-ready primitives backed by the Anthropic Claude Agent SDK:

1. **`agent-dispatcher.ts`** — wraps `@anthropic-ai/claude-agent-sdk` agent invocation into a typed `dispatchAgent(options)` function returning `{ output, tokens, cost_usd }`.
2. **`context.ts`** — `Context` class managing cross-call conversation state with explicit persistence.
3. **`cost-tracker.ts`** — `CostTracker` class aggregating per-session token + USD totals across `dispatchAgent` calls.
4. **`NOTICES.md`** — repo-root licensing disclosure documenting the distinction between CDS's MIT license and the Anthropic Commercial ToS under which the embedded SDK is redistributed.

**Deferred explicitly to Phase 36 (NOT in Phase 34 scope):**
- Migrating `lib/adr-bridge-session.mjs` to use `dispatchAgent`. Phase 34 builds the primitive; Phase 36 is its first real user (Auto Session Capture closes v0.12 ADR-02 Known Gap).
- Any Stop-hook integration or session-capture wiring.

**Phase 34 does NOT:**
- Move any code from root `lib/` — only NEW files in `packages/cds-core/src/`
- Introduce a bundler (deferred to Phase 39 per CONTEXT.md Phase 33 D-08)
- Change root `package.json` beyond devDep bumps (SDK is dep of `@cds/core`, not root)
- Alter `bin/cli.mjs` routing

</domain>

<decisions>
## Implementation Decisions

### SDK License Policy (D-13 … D-16)
- **D-13:** `@anthropic-ai/claude-agent-sdk@0.2.110+` is licensed under **Anthropic Commercial Terms of Service** (verified via `npm view`, README). NOT Apache-2.0 or MIT. This contradicts the literal text of SDK-01 acceptance ("Apache-2.0 or MIT confirmed compatible"). We accept the SDK anyway as an **internal infrastructure dependency** because (a) the CDS CLI already invokes Claude via the same Commercial ToS when users run `claude -p` subprocess today, (b) Anthropic's Commercial ToS explicitly permits redistribution within products, (c) CDS ships under MIT and that license applies to CDS code; the embedded SDK carries its own terms transparently to end users.
- **D-14:** `NOTICES.md` MUST be created at repo root enumerating every runtime dependency and its license. Specific entries required for Phase 34: `@anthropic-ai/claude-agent-sdk` (Anthropic Commercial ToS, link to https://www.anthropic.com/legal/commercial-terms), `prompts` (MIT), plus any transitive runtime deps pulled through the SDK. NOTICES.md MUST NOT be added to the npm tarball `"files"` array only if it cannot — verify whether npm already picks up `NOTICES.md` by default (it does); `"files"` change then unnecessary, preserving Phase 33 D-03.
- **D-15:** REQUIREMENTS.md SDK-01 acceptance criterion will be updated with a **correction note** (not rewritten — Phase 34 documentation trail should show the correction): the phrase "Apache-2.0 or MIT confirmed compatible with CDS distribution model" becomes "license confirmed compatible with CDS distribution model (Anthropic Commercial ToS for claude-agent-sdk, documented in NOTICES.md)". Similar to the Phase 33 CONTEXT.md D-11/D-12 correction pattern.
- **D-16:** No fork, no hybrid. `@anthropic-ai/sdk` (MIT, raw API) is NOT added as parallel adapter. The full Claude Agent SDK (subagents, tools, filesystem, Managed Agents) is central to Phase A architecture — switching to raw SDK would require rebuilding agent loop + tool protocol in-house, negating the whole reason for SEED-004 / cds-core-independence-plan D-07 ("pivot to Claude Agent SDK").

### dispatchAgent API Surface (D-17 … D-21)
- **D-17:** Full signature:
  ```ts
  interface DispatchOptions {
    model: 'haiku' | 'sonnet' | 'opus' | string;   // SDK model ID or friendly alias
    prompt: string;
    system?: string;
    tools?: Tool[];                                  // SDK-native Tool type pass-through
    signal?: AbortSignal;                            // cancellation + timeout handling
    session_id?: string;                             // optional — threads with Context/CostTracker
  }
  interface DispatchResult {
    output: string;                                  // assistant's final text
    tokens: { input: number; output: number };
    cost_usd: number;
  }
  async function dispatchAgent(opts: DispatchOptions): Promise<DispatchResult>;
  ```
- **D-18:** Errors propagate via thrown exceptions (standard JS idiom, matches SDK behavior). Callers wrap in try/catch when they need "fail silent" semantics (Phase 36 Stop hook will). NO `Result<T, E>` return type — non-idiomatic for the JS ecosystem.
- **D-19:** No streaming in Phase 34. `output` is the full assistant text when the agent loop completes. If `/cds-quick` or Phase 36+ needs live streaming, a follow-up `dispatchAgentStream(opts, onEvent)` variant will be added with `onEvent: (event: AgentSDKEvent) => void` — deferred to its own phase.
- **D-20:** `tools` parameter is **SDK-native pass-through** — we import `Tool` type from `@anthropic-ai/claude-agent-sdk` and re-export it from `@cds/core`. No CDS-specific abstraction layer on top. If the SDK's Tool shape changes between versions, `@cds/core` pins the SDK version range.
- **D-21:** Model aliases: accept both friendly names (`'haiku'`, `'sonnet'`, `'opus'`) and full model IDs (`'claude-haiku-4-5-20251001'`, `'claude-sonnet-4-6'`, `'claude-opus-4-6'`). The dispatcher resolves aliases to the latest stable model ID from a constant table in `packages/cds-core/src/models.ts`. Callers who need a pinned model version pass the full ID.

### Context Class (D-22 … D-26)
- **D-22:** Public API:
  ```ts
  class Context {
    static load(sessionId: string): Context;          // factory — reads ~/.claude/cds-context-{sessionId}.json if exists
    constructor(sessionId?: string);                   // fresh context; sessionId defaults to env || uuid
    add(message: ConversationMessage): void;           // append to in-memory array
    clear(): void;                                      // reset in-memory only (file untouched until next save())
    summarize(): string;                                // returns compact text summary (first N chars of each message)
    save(): void;                                       // explicit — writes to ~/.claude/cds-context-{sessionId}.json
    get sessionId(): string;
    get messages(): readonly ConversationMessage[];    // read-only view
  }
  ```
- **D-23:** `sessionId` resolution order: (1) explicit constructor arg, (2) `process.env.CLAUDE_SESSION_ID`, (3) `crypto.randomUUID()` fallback. The constructor computes this once and freezes it.
- **D-24:** Persistence is **explicit** — `save()` MUST be called by the user for state to hit disk. Auto-save on every `add()` is rejected: N synchronous disk writes per turn is too noisy for long conversations, debounced/async auto-save adds complexity not justified for Phase 34. Documentation explicitly warns: "call save() before process exit if you want the context to persist".
- **D-25:** File format: JSON array of `{ role: 'user' | 'assistant' | 'system', content: string, timestamp: string }` plus a top-level `sessionId` and `savedAt` ISO timestamp for introspection. Schema version field `_v: 1` for future-proofing.
- **D-26:** No compaction in Phase 34. If context grows beyond model window, the SDK handles per-call truncation. A `Context.compact(maxMessages)` method is deferred to a later phase when real usage signals the need.

### CostTracker Class (D-27 … D-30)
- **D-27:** Public API:
  ```ts
  class CostTracker {
    constructor(sessionId?: string);
    record(call: { model: string; tokens: { input: number; output: number } }): void;
    total(): { calls: number; tokens: { input: number; output: number }; cost_usd: number };
    dump(): string;                                     // human-readable report
  }
  ```
- **D-28:** Pricing data source: **bundled lookup table** in `packages/cds-core/src/pricing.ts` — hardcoded prices per model (input/output USD per million tokens) as of 2026-04-16. Updates ship via `@cds/core` patch releases. At construction, `CostTracker` loads `~/.claude/anthropic-pricing.json` if it exists and merges over bundled defaults (user override for staying current or for Enterprise custom pricing).
- **D-29:** The bundled table MUST include at minimum: `claude-haiku-4-5-*`, `claude-sonnet-4-6`, `claude-opus-4-6`. Unknown models throw a typed `UnknownModelError` at `record()` time — caller can catch and fall back to rough estimate or let it bubble.
- **D-30:** `CostTracker` stays in-memory per session. No cross-session aggregation — that is Phase 36+/analytics territory. `dump()` prints a table like:
  ```
  Session: abc-123
  Calls: 14
  Input tokens:  123,456 (Haiku: 100k, Sonnet: 23k)
  Output tokens: 45,678
  Cost:          $0.87
  ```

### Integration & Threading (D-31 … D-32)
- **D-31:** `dispatchAgent`, `Context`, and `CostTracker` share `sessionId` as the threading key. Convention: caller creates one `sessionId` (or env-derived), passes it to `new Context(sessionId)` and `new CostTracker(sessionId)`, and forwards it via `dispatchAgent({ ..., session_id })`. When `dispatchAgent` receives `session_id`, it is ONLY used for optional side-effects (e.g., attaching to an existing SDK session if the SDK version supports it). The dispatcher does NOT automatically mutate the caller's `Context`/`CostTracker` — the caller explicitly calls `ctx.add(...)` and `tracker.record(...)` with the `DispatchResult`. This keeps modules independent and testable.
- **D-32:** Hello-world test (per SDK-02 acceptance) calls the **live SDK** with `model: 'haiku'`, a trivial prompt, and asserts non-zero input/output tokens. Gated behind `INTEGRATION=1` env flag so CI does not incur API costs on every run. Default test suite uses an SDK mock (a thin fake that returns canned responses) to validate the dispatcher's wrapping logic without network. Both test modes live in `packages/cds-core/src/agent-dispatcher.test.ts` with `describe.skipIf(!process.env.INTEGRATION)`.

### Claude's Discretion
- Exact shape of `ConversationMessage` type (e.g., whether to carry `tool_use_id` for tool calls — likely yes for Phase 36+ needs). Planner to decide based on SDK event types.
- Exact bundled pricing numbers as of 2026-04-16 — planner fills with then-current values; user must be able to patch after Phase 34 lands if prices drift.
- Whether `CostTracker` dump() emits plain text or JSON (likely both via `dump({ format: 'text' | 'json' })` param).
- Error class hierarchy (`DispatchError` base → `UnknownModelError`, `LicenseKeyError`, etc.) — planner shapes based on SDK error surface.
- Whether `NOTICES.md` is also auto-checked in CI for dependency-license drift (future concern).

### Folded Todos
- **SDK license verification** (from PROJECT.md open questions, session 2026-04-16 TODO list): folded into D-13/D-14/D-15 above. License verified — Anthropic Commercial ToS confirmed, not MIT. REQUIREMENTS.md update is part of Plan 01 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §SDK-01, SDK-02, CORE-01, CORE-02 — acceptance criteria (SDK-01 correction per D-15 required during Plan 01)
- `.planning/ROADMAP.md` §"Phase 34: SDK Integration & Core Primitives" — Success Criteria 1-4 + Risks (license soft-blocker surface)
- `.planning/PROJECT.md` §Constraints — single-dep constraint applies to CLI surface (`prompts` only). SDK is `@cds/core` dep, not `@cds/cli` dep — counts as internal infra, allowed.
- `.planning/phases/33-monorepo-foundation/33-CONTEXT.md` — prior phase's locked decisions (scaffold layout, @cds/* private, TS NodeNext)

### Plan & Seed Sources
- `vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md` §D-07 — rationale for Claude Agent SDK adoption over raw SDK
- `.planning/seeds/SEED-004-tiered-vault-sessions-auto-capture.md` — context on why `dispatchAgent` matters downstream (Phase 36 Stop hook)

### SDK Documentation (live)
- https://github.com/anthropics/claude-agent-sdk-typescript — SDK source (Commercial ToS in README)
- https://www.anthropic.com/legal/commercial-terms — license text for NOTICES.md
- npm registry: `@anthropic-ai/claude-agent-sdk@0.2.110` (verified 2026-04-16 — version current at phase start)

### v0.12 Known Gap — to be closed (later, not Phase 34)
- `.planning/STATE.md` §"Known Gaps" ADR-02 — Phase 36 (Auto Session Capture) closes this retroactively using the `dispatchAgent` primitive Phase 34 builds.

</canonical_refs>

<code_context>
## Existing Code Insights

### Phase 33 scaffold (consumed by Phase 34)
- `packages/cds-core/src/index.ts` — stub created in Phase 33 Plan 01; Phase 34 adds `export { dispatchAgent } from './agent-dispatcher.js'` etc. The stub export will be removed or replaced.
- `packages/cds-core/package.json` — private, TS NodeNext. Phase 34 adds `dependencies: { "@anthropic-ai/claude-agent-sdk": "^0.2.110" }`.
- `packages/cds-core/tsconfig.json` — composite, NodeNext, declaration. Phase 34 code must compile under these settings.
- `packages/cds-core/vitest.config.ts` (if exists from Phase 33 per-package config) — Phase 34 tests run via this.

### Reusable from root (not migrated, only referenced)
- `lib/adr-bridge-session.mjs` — failing implementation of the pattern Phase 34 primitive replaces. READ for reference (what data shape does it extract?), but DO NOT modify — Phase 36 is its refactor home.
- Existing `ANTHROPIC_API_KEY` env handling — verify the SDK picks it up automatically (per SDK docs); no code change in `@cds/core` needed.

### Integration Points (only)
- `packages/cds-core/src/index.ts` — add public re-exports (`dispatchAgent`, `Context`, `CostTracker`, `Tool`, error classes, model alias constants)
- Repo root — new `NOTICES.md`
- `.planning/REQUIREMENTS.md` — append correction note for SDK-01 per D-15

### Constraints to Factor Into Planning
- `@cds/core` stays `"private": true` — SDK Commercial ToS applies to the SDK alone; @cds/core can stay MIT-intent (if later made public, NOTICES.md travels with it).
- 928/931 root test baseline preserved — Phase 34 does not touch `tests/`
- Phase 34 MUST be runnable on Node 18+ (CDS baseline) — verify SDK's Node requirement (`engines.node` field in SDK's package.json)
- Hello-world test that hits live API MUST be gated (`INTEGRATION=1`) — default `pnpm test` must not require `ANTHROPIC_API_KEY`

</code_context>

<specifics>
## Specific Ideas

- The SDK license distinction is a documentation correction, not a blocker — the user explicitly chose to accept + document rather than fork. NOTICES.md is THE deliverable for this decision; planner must not silently skip it.
- `dispatchAgent`'s throw-based errors are deliberate — Phase 36 Stop hook will wrap in try/catch for fail-silent semantics, but the primitive itself stays JS-idiomatic.
- Session ID threading convention (D-31) is "just pass it along" — no magic shared-state. Keeps modules unit-testable in isolation.
- Integration test gating (`INTEGRATION=1`) keeps CI free while allowing one-command local validation before release (`INTEGRATION=1 pnpm -C packages/cds-core test`).
- Bundled pricing table is the right call: zero network dependency at runtime, user override via `~/.claude/anthropic-pricing.json` covers drift and enterprise custom pricing without complicating the primitive.

</specifics>

<deferred>
## Deferred Ideas

### For Phase 36 (Auto Session Capture)
- Refactor `lib/adr-bridge-session.mjs` to use `dispatchAgent` — this is Phase 36's `CAPTURE-05` home.
- Fail-silent wrapping of `dispatchAgent` in the Stop hook (try/catch, background detach).
- First real consumer of `Context.save()` and `CostTracker.dump()`.

### For Phase 38 (Backfill Migration)
- First real consumer of `dispatchAgent` with `tools` pass-through (Haiku entity extraction).
- Cost estimation using `CostTracker` pre-run (dry-run shows estimated dollar cost).

### For Phase 39 (/cds-quick Demo & Alpha Release)
- `dispatchAgentStream(opts, onEvent)` streaming variant — add when CLI UX needs live output.
- Bundler inlines `@cds/core` (with its SDK dep) into root `claude-dev-stack` tarball.

### For v1.1+ (not this milestone)
- `Context.compact(maxMessages)` — smart context truncation beyond SDK per-call handling.
- `CostTracker` cross-session aggregation + analytics dashboard integration.
- CI-time license drift detection (scan dependency tree, compare vs NOTICES.md).
- Multi-provider adapter (OpenAI, Gemini) via `dispatchAgent({ provider, ... })` — not on roadmap yet.

### Reviewed Todos (not folded)
- None — `todo match-phase 34` returned zero matches.

</deferred>

---

*Phase: 34-sdk-integration-core-primitives*
*Context gathered: 2026-04-16*
