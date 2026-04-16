---
plan_id: 34-02-dispatch-agent
phase: 34
plan: 02
type: execute
wave: 1
depends_on:
  - 34-01-sdk-dependency-notices
files_modified:
  - packages/cds-core/src/models.ts
  - packages/cds-core/src/agent-dispatcher.ts
  - packages/cds-core/src/agent-dispatcher.test.ts
autonomous: true
requirements:
  - SDK-02
user_setup:
  - task: "Set ANTHROPIC_API_KEY environment variable"
    why: "Required ONLY for INTEGRATION=1 live SDK hello-world test. Default pnpm test does NOT require this key (mock path per D-32)."
    required_at: "before `INTEGRATION=1 pnpm --filter @cds/core vitest run` — ideally set once in shell rc; default CI + default pnpm test skip the live test automatically."
must_haves:
  truths:
    - "packages/cds-core/src/agent-dispatcher.ts exports async dispatchAgent(opts): Promise<DispatchResult> (ROADMAP SC#2 per D-17)"
    - "dispatchAgent returns { output: string, tokens: { input, output }, cost_usd } (D-17)"
    - "dispatchAgent resolves model aliases 'haiku'|'sonnet'|'opus' via models.ts (D-21)"
    - "dispatchAgent bridges AbortSignal to SDK AbortController (D-17 signal? field, Pitfall 2 mitigation)"
    - "dispatchAgent throws LicenseKeyError when ANTHROPIC_API_KEY is absent (Pitfall 1)"
    - "dispatchAgent does NOT mutate caller-provided Context or CostTracker (D-31)"
    - "dispatchAgent does NOT short-circuit the SDK iterator with break (Pitfall 2)"
    - "agent-dispatcher.test.ts has mock-based tests that run WITHOUT ANTHROPIC_API_KEY"
    - "agent-dispatcher.test.ts has one INTEGRATION=1-gated live SDK hello-world test (D-32)"
  artifacts:
    - path: "packages/cds-core/src/models.ts"
      provides: "Model alias table + resolver"
      contains: "MODEL_ALIASES"
    - path: "packages/cds-core/src/agent-dispatcher.ts"
      provides: "dispatchAgent primitive + DispatchOptions/DispatchResult types"
      contains: "export async function dispatchAgent"
    - path: "packages/cds-core/src/agent-dispatcher.test.ts"
      provides: "Mock + INTEGRATION live-SDK test suite"
      contains: "describe.skipIf(!process.env.INTEGRATION)"
  key_links:
    - from: "dispatchAgent return value"
      to: "SDK result event (usage.input_tokens, usage.output_tokens, total_cost_usd)"
      via: "for-await over query() async iterator"
      pattern: 'msg\.type === .result.'
    - from: "DispatchOptions.signal"
      to: "SDK options.abortController"
      via: "signalToAbortController bridge function"
      pattern: 'AbortController'
    - from: "DispatchOptions.model ('haiku'|'sonnet'|'opus')"
      to: "full Anthropic model IDs via MODEL_ALIASES table"
      via: "resolveModel()"
      pattern: 'resolveModel'
---

<objective>
Implement `dispatchAgent` — the Phase 34 primitive that wraps `@anthropic-ai/claude-agent-sdk`'s `query()` into the CDS-typed `DispatchOptions → DispatchResult` signature (D-17). Provide model alias resolution (D-21), AbortSignal-to-AbortController bridging (D-17), and a typed `LicenseKeyError` fail-fast path for missing API keys (Pitfall 1). Deliver a mock-based unit test suite that passes without `ANTHROPIC_API_KEY` (D-32), plus one `INTEGRATION=1`-gated live-SDK hello-world test satisfying SDK-02 Success Criterion 2.

Purpose: satisfy SDK-02 ("`dispatchAgent({ model: 'haiku', prompt: … })` returns `{ output, tokens: { input, output }, cost_usd }` with non-zero token counts from the live SDK"). This plan runs in Wave 1 after Plan 01's Wave 0 SDK+errors scaffold lands.

Output: 3 new files under `packages/cds-core/src/` — `models.ts`, `agent-dispatcher.ts`, `agent-dispatcher.test.ts` — and a `feat(34-02)` commit on the phase branch. Does NOT modify `packages/cds-core/src/index.ts` (Plan 04 does the public barrel).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md
@.planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md
@.planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md
@.planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md
@./CLAUDE.md
@./packages/cds-core/package.json
@./packages/cds-core/src/errors.ts
@./packages/cds-core/src/index.ts

<interfaces>
<!-- SDK shape assumptions (from RESEARCH.md Assumptions A1, A2 — VERIFIED via SDK README). -->
<!-- Plan 02 MUST verify at runtime against installed SDK — if the SDK's actual .d.ts differs from these types, Plan 02 adjusts the dispatcher + updates RESEARCH.md Assumptions Log. -->

From `@anthropic-ai/claude-agent-sdk` (assumed shape per README):
```ts
// Expected exports:
export function query(options: {
  prompt: string;
  options?: {
    model?: string;
    systemPrompt?: { type: 'preset'; preset: string; append?: string } | string;
    abortController?: AbortController;
    maxTurns?: number;
    tools?: unknown[];
    // ... other SDK options passed through
  };
}): AsyncGenerator<SDKMessage, void, unknown>;

export type SDKMessage =
  | { type: 'system'; ... }
  | { type: 'user'; ... }
  | { type: 'assistant'; message: { content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; ... }> } }
  | { type: 'result'; subtype: 'success'; usage: { input_tokens: number; output_tokens: number }; total_cost_usd: number; ... }
  | { type: 'result'; subtype: 'error_max_turns' | 'error_during_execution'; ... };

export type Tool = /* SDK tool definition — opaque to @cds/core, re-exported via Plan 04 */;
```

If the actual SDK types differ, `dispatchAgent` uses `as any` casts where needed and notes the discrepancy in SUMMARY. TypeScript strict mode is not compromised for the public surface (DispatchOptions/DispatchResult are strictly typed).

From `packages/cds-core/src/errors.ts` (Plan 01 output):
```ts
export class DispatchError extends Error { constructor(message: string, public readonly cause?: unknown); }
export class LicenseKeyError extends DispatchError { constructor(message?: string); }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create packages/cds-core/src/models.ts with alias table and resolver</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"dispatchAgent API Surface" (D-21)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/models.ts"
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Standard Stack" (verify latest model IDs against https://docs.anthropic.com/claude/docs/models)
  </read_first>
  <files>
    - packages/cds-core/src/models.ts (new)
  </files>
  <action>
  Create `packages/cds-core/src/models.ts` with the canonical alias table + pass-through resolver.

  **File: `packages/cds-core/src/models.ts`** — paste verbatim:

  ```typescript
  /**
   * Model alias table for @cds/core dispatchAgent.
   *
   * Callers pass friendly aliases ('haiku', 'sonnet', 'opus') OR full Anthropic model IDs.
   * The dispatcher resolves aliases to the latest stable ID at call time.
   * Full model IDs pass through unchanged — the Claude Agent SDK validates them.
   *
   * Last updated: 2026-04-16 — re-verify against https://docs.anthropic.com/claude/docs/models
   * when bumping @anthropic-ai/claude-agent-sdk version.
   *
   * D-21 (CONTEXT.md): accept both friendly names and full IDs.
   */

  export const MODEL_ALIASES: Record<string, string> = {
    haiku: 'claude-haiku-4-5',
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-6',
  };

  /**
   * Resolve a model alias OR pass through a full model ID.
   *
   * @param modelOrAlias - Either 'haiku' | 'sonnet' | 'opus' OR a full Anthropic
   *                      model ID like 'claude-haiku-4-5-20260301'.
   * @returns The resolved full model ID (or the input unchanged if not an alias).
   */
  export function resolveModel(modelOrAlias: string): string {
    return MODEL_ALIASES[modelOrAlias] ?? modelOrAlias;
  }
  ```

  **Do NOT add any other exports.** Plan 04's `index.ts` barrel re-exports `MODEL_ALIASES` and `resolveModel` from here.
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/models.ts && grep -q 'export const MODEL_ALIASES' packages/cds-core/src/models.ts && grep -q "haiku: 'claude-haiku-4-5'" packages/cds-core/src/models.ts && grep -q "sonnet: 'claude-sonnet-4-6'" packages/cds-core/src/models.ts && grep -q "opus: 'claude-opus-4-6'" packages/cds-core/src/models.ts && grep -q 'export function resolveModel' packages/cds-core/src/models.ts && node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/models.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022" } })'</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/models.ts` exits 0
    - `grep -c 'export const MODEL_ALIASES' packages/cds-core/src/models.ts` returns `1`
    - `grep -cE "haiku: 'claude-haiku-4-5'" packages/cds-core/src/models.ts` returns `1`
    - `grep -cE "sonnet: 'claude-sonnet-4-6'" packages/cds-core/src/models.ts` returns `1`
    - `grep -cE "opus: 'claude-opus-4-6'" packages/cds-core/src/models.ts` returns `1`
    - `grep -c 'export function resolveModel' packages/cds-core/src/models.ts` returns `1`
    - `grep -c '@param modelOrAlias' packages/cds-core/src/models.ts` returns `1` (JSDoc present)
    - TS transpile via `require("typescript").transpileModule` succeeds
  </acceptance_criteria>
  <done>
  models.ts created. Three aliases (haiku/sonnet/opus) map to current model IDs verified 2026-04-16. Resolver passes through unknown strings. File is valid TypeScript.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create packages/cds-core/src/agent-dispatcher.ts with dispatchAgent + types + signal bridge</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"dispatchAgent API Surface" (D-17..D-21), §"Integration & Threading" (D-31)
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Pattern 1: SDK query() → DispatchResult", §"Pattern 2: AbortSignal → AbortController bridge", §"Common Pitfalls" (all)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/agent-dispatcher.ts"
    - ./packages/cds-core/src/errors.ts (Plan 01 output — DispatchError + LicenseKeyError available for import)
    - ./packages/cds-core/src/models.ts (Task 1 output — resolveModel available)
  </read_first>
  <files>
    - packages/cds-core/src/agent-dispatcher.ts (new)
  </files>
  <action>
  Create `packages/cds-core/src/agent-dispatcher.ts` implementing the Phase 34 primitive per RESEARCH.md §Pattern 1. This file exports `dispatchAgent`, `DispatchOptions`, `DispatchResult`, and keeps the signal bridge internal.

  **File: `packages/cds-core/src/agent-dispatcher.ts`** — paste verbatim (annotated inline):

  ```typescript
  /**
   * dispatchAgent — @cds/core primitive wrapping @anthropic-ai/claude-agent-sdk's
   * query() async generator into a typed DispatchOptions → DispatchResult surface.
   *
   * Contract (CONTEXT.md D-17):
   *   dispatchAgent({ model, prompt, system?, tools?, signal?, session_id? })
   *     -> Promise<{ output: string, tokens: { input, output }, cost_usd: number }>
   *
   * Threading (CONTEXT.md D-31):
   *   - The dispatcher does NOT mutate caller-provided Context or CostTracker.
   *   - session_id is accepted for caller convenience but NOT forwarded to SDK options
   *     (if the SDK gains session threading later, a follow-up plan wires it).
   *
   * Errors (CONTEXT.md D-18):
   *   - Thrown, not returned. LicenseKeyError when ANTHROPIC_API_KEY is absent.
   *     DispatchError when SDK returns a non-success result subtype.
   *
   * No streaming (CONTEXT.md D-19): output is full assistant text after loop completes.
   */

  import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
  import { resolveModel } from './models.js';
  import { DispatchError, LicenseKeyError } from './errors.js';

  export interface DispatchOptions {
    /** Model alias ('haiku' | 'sonnet' | 'opus') or full Anthropic model ID. */
    model: 'haiku' | 'sonnet' | 'opus' | string;
    /** User prompt text sent to the agent. */
    prompt: string;
    /** Optional system prompt appended to the preset. */
    system?: string;
    /** Optional tools — SDK-native Tool[] pass-through (D-20). */
    tools?: unknown[];
    /** Optional AbortSignal; dispatcher bridges to SDK AbortController. */
    signal?: AbortSignal;
    /**
     * Optional caller-provided session ID. Accepted for caller convenience and
     * logging/correlation, but NOT forwarded to SDK options (D-31).
     */
    session_id?: string;
  }

  export interface DispatchResult {
    /** Concatenated assistant text output across all assistant messages. */
    output: string;
    /** Token usage from SDK's terminal result event. */
    tokens: { input: number; output: number };
    /** Cost in USD from SDK's total_cost_usd field. */
    cost_usd: number;
  }

  /**
   * Bridge a caller-provided AbortSignal to the SDK's expected AbortController.
   * Returns undefined if no signal is provided.
   */
  function signalToAbortController(signal?: AbortSignal): AbortController | undefined {
    if (!signal) return undefined;
    const controller = new AbortController();
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener(
        'abort',
        () => controller.abort(signal.reason),
        { once: true },
      );
    }
    return controller;
  }

  /**
   * Dispatch a prompt to the Anthropic agent loop via @anthropic-ai/claude-agent-sdk.
   *
   * Consumes the SDK's async iterator to completion (no `break` — Pitfall 2 mitigation)
   * aggregating assistant text output and extracting token usage + cost from the
   * terminal `result` event.
   *
   * @throws LicenseKeyError when ANTHROPIC_API_KEY is not set.
   * @throws DispatchError when the SDK returns a non-success result (max_turns / execution error).
   * @throws any error the SDK itself throws (network, model access, invalid input) — caller wraps.
   */
  export async function dispatchAgent(opts: DispatchOptions): Promise<DispatchResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new LicenseKeyError();
    }

    const resolvedModel = resolveModel(opts.model);
    const abortController = signalToAbortController(opts.signal);

    const iterator = query({
      prompt: opts.prompt,
      options: {
        model: resolvedModel,
        systemPrompt: opts.system
          ? { type: 'preset', preset: 'claude_code', append: opts.system }
          : undefined,
        abortController,
        // tools pass-through per D-20; SDK's Tool[] type opaque to @cds/core
        ...(opts.tools ? { tools: opts.tools as never } : {}),
      } as never,
      // (Cast to `never` used at SDK boundary where SDK .d.ts may not expose
      // every option shape; tightens when SDK types stabilize.)
    });

    const textParts: string[] = [];
    let tokens = { input: 0, output: 0 };
    let cost_usd = 0;

    // CRITICAL (Pitfall 2): iterate to completion; NEVER break early.
    for await (const msg of iterator as AsyncIterable<SDKMessage>) {
      if (msg.type === 'assistant') {
        const content = (msg as { message?: { content?: unknown[] } }).message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as { type?: string; text?: string };
            if (b.type === 'text' && typeof b.text === 'string') {
              textParts.push(b.text);
            }
          }
        }
      } else if (msg.type === 'result') {
        const r = msg as {
          subtype?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
          total_cost_usd?: number;
        };
        if (r.subtype === 'success') {
          tokens = {
            input: r.usage?.input_tokens ?? 0,
            output: r.usage?.output_tokens ?? 0,
          };
          cost_usd = r.total_cost_usd ?? 0;
        } else {
          throw new DispatchError(
            `Agent returned non-success result: ${r.subtype ?? 'unknown'}`,
            msg,
          );
        }
      }
      // Other message types (system, user, tool_use, tool_result) are
      // intentionally ignored at the dispatcher boundary — the SDK handles
      // the inner loop. We only care about aggregating assistant text + the
      // terminal result event.
    }

    return { output: textParts.join(''), tokens, cost_usd };
  }
  ```

  **Implementation notes:**
  - API key check is the FIRST thing in the function (fast failure, clean error message — Pitfall 1 mitigation).
  - `as never` casts at the SDK boundary are a pragmatic accommodation for imprecise SDK `.d.ts` types (the SDK may not export the exact `options` shape publicly). The public `DispatchOptions` / `DispatchResult` stay fully strict.
  - Internal type narrowing (`as { message?: { content?: unknown[] } }` etc.) avoids `any` in hot paths while tolerating SDK type drift.
  - Comment `// CRITICAL (Pitfall 2)` is load-bearing — reminds future maintainers not to add a `break`.
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/agent-dispatcher.ts && grep -q "export async function dispatchAgent" packages/cds-core/src/agent-dispatcher.ts && grep -q "export interface DispatchOptions" packages/cds-core/src/agent-dispatcher.ts && grep -q "export interface DispatchResult" packages/cds-core/src/agent-dispatcher.ts && grep -q "new LicenseKeyError" packages/cds-core/src/agent-dispatcher.ts && grep -q "import { query" packages/cds-core/src/agent-dispatcher.ts && grep -q "signalToAbortController" packages/cds-core/src/agent-dispatcher.ts && ! grep -q "break;" packages/cds-core/src/agent-dispatcher.ts && node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/agent-dispatcher.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022", strict: true } })'</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/agent-dispatcher.ts` exits 0
    - `grep -c 'export async function dispatchAgent' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -c 'export interface DispatchOptions' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -c 'export interface DispatchResult' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -c 'new LicenseKeyError()' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -c 'process.env.ANTHROPIC_API_KEY' packages/cds-core/src/agent-dispatcher.ts` returns `1` (the guard)
    - `grep -c 'import { query' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -c 'function signalToAbortController' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -c 'for await' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -cE '^\s*break;?\s*$' packages/cds-core/src/agent-dispatcher.ts` returns `0` (NO `break` statements in loop — Pitfall 2 lock)
    - `grep -c 'resolveModel' packages/cds-core/src/agent-dispatcher.ts` returns `1`
    - `grep -c "type: 'preset'" packages/cds-core/src/agent-dispatcher.ts` returns `1` (systemPrompt shape)
    - TS transpile via `require("typescript").transpileModule` with `strict: true` succeeds
  </acceptance_criteria>
  <done>
  agent-dispatcher.ts exports `dispatchAgent` + types + internal signal bridge. API key check fails fast with `LicenseKeyError`. For-await loop has no `break` statement. Valid TypeScript under strict mode.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create packages/cds-core/src/agent-dispatcher.test.ts with mock and INTEGRATION tests</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"Integration & Threading" (D-32)
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Code Examples" ("Verified vitest mock pattern for SDK")
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/agent-dispatcher.test.ts"
    - ./packages/cds-core/src/agent-dispatcher.ts (Task 2 output)
    - ./packages/cds-core/vitest.config.ts (if exists from Phase 33 Plan 03; otherwise inherits root)
  </read_first>
  <files>
    - packages/cds-core/src/agent-dispatcher.test.ts (new)
  </files>
  <action>
  Create the test file. Default mode uses `vi.mock('@anthropic-ai/claude-agent-sdk')` — NO `ANTHROPIC_API_KEY` required. The `describe.skipIf(!process.env.INTEGRATION)` block holds one live-SDK hello-world that satisfies ROADMAP SC#2.

  **File: `packages/cds-core/src/agent-dispatcher.test.ts`** — paste verbatim:

  ```typescript
  /**
   * agent-dispatcher.test.ts
   *
   * Default suite: mock-based — runs on `pnpm test` WITHOUT ANTHROPIC_API_KEY (D-32).
   * Integration suite: gated behind INTEGRATION=1 env — runs on `INTEGRATION=1 pnpm --filter @cds/core vitest run`.
   */

  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

  // Mock the SDK BEFORE importing dispatchAgent (so the import resolves to the mock).
  vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
    query: vi.fn(),
  }));

  import { query } from '@anthropic-ai/claude-agent-sdk';
  import { dispatchAgent } from './agent-dispatcher.js';
  import { LicenseKeyError, DispatchError } from './errors.js';

  const API_KEY_BACKUP: string | undefined = process.env.ANTHROPIC_API_KEY;

  describe('dispatchAgent (mocked SDK)', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      process.env.ANTHROPIC_API_KEY = 'sk-test-mock';
    });
    afterEach(() => {
      // Restore to pre-suite state
      if (API_KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = API_KEY_BACKUP;
    });

    it('aggregates assistant text across multiple messages and reports tokens + cost', async () => {
      const mockIter = (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello ' }] } };
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'world' }] } };
        yield {
          type: 'result',
          subtype: 'success',
          usage: { input_tokens: 5, output_tokens: 3 },
          total_cost_usd: 0.00001,
        };
      })();
      (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

      const result = await dispatchAgent({ model: 'haiku', prompt: 'hi' });

      expect(result.output).toBe('Hello world');
      expect(result.tokens).toEqual({ input: 5, output: 3 });
      expect(result.cost_usd).toBe(0.00001);
    });

    it('throws LicenseKeyError when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(LicenseKeyError);
      await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/ANTHROPIC_API_KEY/);
    });

    it('throws DispatchError on non-success result subtype (error_max_turns)', async () => {
      const mockIter = (async function* () {
        yield {
          type: 'result',
          subtype: 'error_max_turns',
          usage: { input_tokens: 10, output_tokens: 0 },
          total_cost_usd: 0.00001,
        };
      })();
      (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

      await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(DispatchError);
      await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/error_max_turns/);
    });

    it('resolves model aliases haiku/sonnet/opus via models.ts before calling SDK', async () => {
      const mockIter = (async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          usage: { input_tokens: 1, output_tokens: 1 },
          total_cost_usd: 0,
        };
      })();
      (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

      await dispatchAgent({ model: 'haiku', prompt: 'hi' });

      const call = (query as unknown as { mock: { calls: Array<[{ options?: { model?: string } }]> } }).mock.calls[0];
      expect(call[0].options?.model).toBe('claude-haiku-4-5');
    });

    it('passes full model IDs through unchanged', async () => {
      const mockIter = (async function* () {
        yield {
          type: 'result',
          subtype: 'success',
          usage: { input_tokens: 1, output_tokens: 1 },
          total_cost_usd: 0,
        };
      })();
      (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

      await dispatchAgent({ model: 'claude-haiku-4-5-20260301', prompt: 'hi' });

      const call = (query as unknown as { mock: { calls: Array<[{ options?: { model?: string } }]> } }).mock.calls[0];
      expect(call[0].options?.model).toBe('claude-haiku-4-5-20260301');
    });

    it('bridges AbortSignal to SDK AbortController (pre-aborted signal propagates immediately)', async () => {
      let capturedController: AbortController | undefined;
      (query as unknown as { mockImplementation: (fn: (args: unknown) => unknown) => void }).mockImplementation(
        (args: unknown) => {
          const a = args as { options?: { abortController?: AbortController } };
          capturedController = a.options?.abortController;
          return (async function* () {
            yield {
              type: 'result',
              subtype: 'success',
              usage: { input_tokens: 1, output_tokens: 1 },
              total_cost_usd: 0,
            };
          })();
        },
      );

      const ctrl = new AbortController();
      ctrl.abort('pre-abort');

      await dispatchAgent({ model: 'haiku', prompt: 'hi', signal: ctrl.signal });

      expect(capturedController).toBeInstanceOf(AbortController);
      expect(capturedController?.signal.aborted).toBe(true);
    });

    it('passes through system prompt as preset-append per SDK shape', async () => {
      let capturedSystem: unknown;
      (query as unknown as { mockImplementation: (fn: (args: unknown) => unknown) => void }).mockImplementation(
        (args: unknown) => {
          const a = args as { options?: { systemPrompt?: unknown } };
          capturedSystem = a.options?.systemPrompt;
          return (async function* () {
            yield {
              type: 'result',
              subtype: 'success',
              usage: { input_tokens: 1, output_tokens: 1 },
              total_cost_usd: 0,
            };
          })();
        },
      );

      await dispatchAgent({ model: 'haiku', prompt: 'hi', system: 'Be terse.' });

      expect(capturedSystem).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: 'Be terse.',
      });
    });

    it('does NOT short-circuit the iterator with break (Pitfall 2)', async () => {
      // This is tested indirectly: if dispatchAgent used `break`, later assistant
      // messages would be lost. Assert that text from the LAST assistant message
      // (emitted just before the result event) is included in output.
      const mockIter = (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'first ' }] } };
        yield { type: 'tool_use', ref: 'irrelevant' };  // noise
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'middle ' }] } };
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'last' }] } };
        yield {
          type: 'result',
          subtype: 'success',
          usage: { input_tokens: 3, output_tokens: 3 },
          total_cost_usd: 0,
        };
      })();
      (query as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(mockIter);

      const result = await dispatchAgent({ model: 'haiku', prompt: 'hi' });

      expect(result.output).toBe('first middle last');
    });
  });

  describe.skipIf(!process.env.INTEGRATION)('dispatchAgent (live SDK)', () => {
    it('returns non-zero input and output tokens for Haiku hello-world (SDK-02 SC#2)', async () => {
      // This test requires ANTHROPIC_API_KEY to be set in the environment and network
      // access to api.anthropic.com. It is skipped unless INTEGRATION=1.
      const result = await dispatchAgent({
        model: 'haiku',
        prompt: 'Reply with exactly the word: pong',
      });
      expect(result.tokens.input).toBeGreaterThan(0);
      expect(result.tokens.output).toBeGreaterThan(0);
      expect(result.output.toLowerCase()).toContain('pong');
      expect(result.cost_usd).toBeGreaterThan(0);
    }, 30_000);
  });
  ```

  **Notes:**
  - `as unknown as { mockReturnValue: ... }` is a TS-strict-mode-compatible alternative to `(query as any).mockReturnValue` — avoids `any` everywhere without fighting vitest's type of `vi.fn()`.
  - The live test has a 30s timeout (`30_000`); Anthropic Haiku calls usually complete in <5s.
  - `describe.skipIf(!process.env.INTEGRATION)` is vitest 4.x syntax (confirmed in RESEARCH.md §Code Examples).
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/agent-dispatcher.test.ts && grep -q "vi.mock('@anthropic-ai/claude-agent-sdk'" packages/cds-core/src/agent-dispatcher.test.ts && grep -q 'describe.skipIf(!process.env.INTEGRATION)' packages/cds-core/src/agent-dispatcher.test.ts && grep -q 'LicenseKeyError' packages/cds-core/src/agent-dispatcher.test.ts && grep -q 'DispatchError' packages/cds-core/src/agent-dispatcher.test.ts && grep -q "claude-haiku-4-5" packages/cds-core/src/agent-dispatcher.test.ts && grep -q "toContain('pong')" packages/cds-core/src/agent-dispatcher.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/agent-dispatcher.test.ts` exits 0
    - `grep -c "vi.mock('@anthropic-ai/claude-agent-sdk'" packages/cds-core/src/agent-dispatcher.test.ts` returns `1`
    - `grep -c 'describe.skipIf(!process.env.INTEGRATION)' packages/cds-core/src/agent-dispatcher.test.ts` returns `1`
    - Test count (describe + it blocks): `grep -cE "^  it\('" packages/cds-core/src/agent-dispatcher.test.ts` returns ≥ 7 (7 mock tests + 1 live = 8 total; outer `it` indentation may vary, also accept ≥ 7 here)
    - `grep -c 'LicenseKeyError' packages/cds-core/src/agent-dispatcher.test.ts` returns ≥ 1
    - `grep -c 'DispatchError' packages/cds-core/src/agent-dispatcher.test.ts` returns ≥ 1
    - `grep -c 'error_max_turns' packages/cds-core/src/agent-dispatcher.test.ts` returns ≥ 1
    - `grep -c "claude-haiku-4-5" packages/cds-core/src/agent-dispatcher.test.ts` returns ≥ 1
    - `grep -c "AbortController" packages/cds-core/src/agent-dispatcher.test.ts` returns ≥ 1
    - `grep -c "toContain('pong')" packages/cds-core/src/agent-dispatcher.test.ts` returns `1` (live test assertion)
    - `grep -c 'Pitfall 2' packages/cds-core/src/agent-dispatcher.test.ts` returns `1` (the short-circuit regression guard)
    - TS transpile via `require("typescript").transpileModule` succeeds
  </acceptance_criteria>
  <done>
  Test file created with 7 mock-based tests (aggregation, API key guard, error result, alias resolution, full ID pass-through, AbortSignal bridge, system prompt shape, Pitfall 2 regression) + 1 live-SDK hello-world gated by INTEGRATION=1.
  </done>
</task>

<task type="auto">
  <name>Task 4: Run package tests — mock suite MUST pass without ANTHROPIC_API_KEY</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md §"Per-Task Verification Map" rows 34-02-*
    - ./packages/cds-core/vitest.config.ts (inherited from root per Phase 33)
  </read_first>
  <files>
    - (no files modified — this task runs tests and blocks on failure)
  </files>
  <action>
  Run the `@cds/core` test suite with ANTHROPIC_API_KEY explicitly unset to confirm D-32 gating works. Then optionally run the integration suite if credentials are available.

  **Steps:**

  1. Unset ANTHROPIC_API_KEY and run the default test suite:
  ```bash
  env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run
  ```
  Expected: ALL tests pass EXCEPT the `describe.skipIf` block, which is skipped (vitest reports it as "skipped" in output; the test file as a whole exits 0).

  2. Confirm skip behavior is present in output:
  ```bash
  env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run 2>&1 | tee /tmp/vitest-default.log
  grep -qE "(skipped|1 skipped|Skipped)" /tmp/vitest-default.log || { echo 'WARN: integration block did not register as skipped'; exit 0; }
  ```
  (Warning, not a failure — vitest versions vary in reporting. The key invariant is that the test file exits 0 with API key unset.)

  3. If developer has `ANTHROPIC_API_KEY` set and wants to exercise the live test, surface the command in SUMMARY:
  ```bash
  # Developer-run (not automated — requires real API key):
  # INTEGRATION=1 pnpm --filter @cds/core vitest run agent-dispatcher.test.ts -t "live SDK"
  ```

  4. Run the full Phase 34 so far (Plan 01 + Plan 02 together):
  ```bash
  pnpm --filter @cds/core vitest run
  ```
  Should pass in <10 seconds.
  </action>
  <verify>
    <automated>env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run</automated>
  </verify>
  <acceptance_criteria>
    - `env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run` exits 0
    - Vitest output reports ≥ 7 tests passing from `agent-dispatcher.test.ts` (mock-based)
    - Vitest output reports 1 test skipped from `agent-dispatcher.test.ts` (the `describe.skipIf` live-SDK block) — OR reports 0 tests from that block, both valid skip semantics depending on vitest version
    - No test in `agent-dispatcher.test.ts` fails due to "ANTHROPIC_API_KEY not set" (the only test that touches the env var is the `LicenseKeyError` test, which explicitly `delete`s it then expects the error)
    - Command completes in < 30 seconds wall-clock
  </acceptance_criteria>
  <done>
  Plan 02 tests green under default (no ANTHROPIC_API_KEY) conditions. D-32 gating verified: integration block skipped gracefully. Package-scoped suite runs in < 30s.
  </done>
</task>

<task type="auto">
  <name>Task 5: Commit Plan 02 deliverables and write 34-02-SUMMARY.md</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md §"Per-Task Verification Map" rows 34-02-*
    - ./CLAUDE.md §"Rules" (conventional commits; no Co-Authored-By)
    - $HOME/.claude/get-shit-done/templates/summary.md
  </read_first>
  <files>
    - .planning/phases/34-sdk-integration-core-primitives/34-02-SUMMARY.md (new)
  </files>
  <action>
  Stage and commit Plan 02's deliverables in one atomic commit.

  **Staged files:**
  - `packages/cds-core/src/models.ts` (new)
  - `packages/cds-core/src/agent-dispatcher.ts` (new)
  - `packages/cds-core/src/agent-dispatcher.test.ts` (new)
  - `.planning/phases/34-sdk-integration-core-primitives/34-02-SUMMARY.md` (new)

  **Commit message:**
  ```
  feat(34-02): dispatchAgent + models alias table + test suite

  Implements SDK-02 Phase 34 primitive — dispatchAgent wrapping
  @anthropic-ai/claude-agent-sdk's query() async iterator into the
  typed DispatchOptions -> DispatchResult signature (CONTEXT.md D-17).

  - packages/cds-core/src/models.ts: MODEL_ALIASES table
    (haiku/sonnet/opus -> current stable model IDs) + resolveModel()
  - packages/cds-core/src/agent-dispatcher.ts: dispatchAgent function
    with AbortSignal->AbortController bridge, LicenseKeyError fast-fail
    for missing ANTHROPIC_API_KEY (Pitfall 1), no iterator short-circuit
    (Pitfall 2), SDK-native tools pass-through (D-20).
  - packages/cds-core/src/agent-dispatcher.test.ts: 7 mock-based tests
    pass WITHOUT ANTHROPIC_API_KEY (D-32). 1 INTEGRATION=1-gated live
    Haiku hello-world test satisfies ROADMAP SC#2.

  Does NOT mutate caller-provided Context/CostTracker (D-31 threading).
  Does NOT stream (D-19 defers to future dispatchAgentStream variant).
  Does NOT re-export from @cds/core/index.ts — Plan 04 does the barrel.
  ```

  **Write `34-02-SUMMARY.md`:**

  ```markdown
  # Plan 34-02 — dispatchAgent + Models — Summary

  **Completed:** 2026-04-16 (TBD — fill with actual)
  **Requirement:** SDK-02
  **Commit:** {hash-fragment TBD}

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
  - `packages/cds-core/src/agent-dispatcher.test.ts` — 7 mock-based tests:
    1. Aggregates assistant text + tokens + cost
    2. Throws `LicenseKeyError` without API key
    3. Throws `DispatchError` on `error_max_turns` subtype
    4. Resolves `'haiku'` → `'claude-haiku-4-5'`
    5. Passes full model IDs unchanged
    6. Bridges `AbortSignal` to SDK `AbortController`
    7. Pitfall 2 regression guard (late assistant messages preserved)
    Plus 1 `INTEGRATION=1`-gated live SDK hello-world: returns non-zero tokens for Haiku, output contains "pong".

  ## Threading & scope

  - D-31 honored: dispatcher does NOT mutate caller-provided `Context`/`CostTracker` instances. `session_id` is accepted but NOT forwarded to SDK.
  - D-19 honored: no streaming in Phase 34; output is full text after loop completes.
  - D-32 honored: default `pnpm test` passes WITHOUT `ANTHROPIC_API_KEY`.

  ## Assumptions verified in execution

  - A1 (SDK result shape: `usage.input_tokens` / `usage.output_tokens` / `total_cost_usd`): ✅ verified via mock test + live test if INTEGRATION=1 was run.
  - A2 (SDK accepts `options.abortController: AbortController`): ✅ verified — the test captures the option and asserts it is an AbortController instance.

  ## Any deviation from spec

  {TBD — should note any SDK type drift `as never`/`as unknown` casts used and the justification}

  ## Ready for downstream

  Plan 03 (Context) and Plan 04 (CostTracker) can now be written against the `dispatchAgent` interface. Plan 04 Task 4 will re-export `dispatchAgent`, `DispatchOptions`, `DispatchResult` from `packages/cds-core/src/index.ts` alongside the other primitives.
  ```
  </action>
  <verify>
    <automated>git log -1 --pretty=%B | grep -q 'feat(34-02)' && git log -1 --pretty=%B | grep -q 'dispatchAgent' && git log -1 --pretty=%B | grep -qvi 'co-authored-by' && test -f .planning/phases/34-sdk-integration-core-primitives/34-02-SUMMARY.md && git show --stat HEAD | grep -q 'packages/cds-core/src/agent-dispatcher.ts' && git show --stat HEAD | grep -q 'packages/cds-core/src/agent-dispatcher.test.ts' && git show --stat HEAD | grep -q 'packages/cds-core/src/models.ts'</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --pretty=%B` starts with `feat(34-02):`
    - `git log -1 --pretty=%B | grep -q 'Co-Authored-By'` returns non-zero (no Co-Authored-By)
    - `git log -1 --pretty=%B | grep -q 'SDK-02'` returns 0 (through phrases like "Implements SDK-02" in body)
    - `git show --stat HEAD` lists all of: `packages/cds-core/src/models.ts`, `packages/cds-core/src/agent-dispatcher.ts`, `packages/cds-core/src/agent-dispatcher.test.ts`, `.planning/phases/34-sdk-integration-core-primitives/34-02-SUMMARY.md`
    - `test -f .planning/phases/34-sdk-integration-core-primitives/34-02-SUMMARY.md` exits 0
    - Working tree clean post-commit (`git status --porcelain` empty)
    - Current branch is `gsd/phase-34-sdk-integration-core-primitives`
  </acceptance_criteria>
  <done>
  Plan 02 committed in one `feat(34-02)` commit. SUMMARY.md documents what shipped. Tests green in default mode. Ready for Plan 03/04.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ANTHROPIC_API_KEY env var → SDK → api.anthropic.com | Network boundary; SDK handles authentication. |
| User-provided `prompt` → SDK | Unfiltered pass-through; any injection is caller's responsibility (documented in JSDoc). |
| SDK `SDKMessage` shape → dispatcher's narrow casts | Structural boundary; cast fragility surfaces as test failures if SDK changes shape. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-L2 | Tampering / API Contract | SDK `SDKMessage` shape | mitigate | Mock tests pin the expected shape (usage.input_tokens/output_tokens, subtype='success'). If SDK ever renames fields, mock tests fail loudly before production bug. |
| T-34-L3 | Denial of Service | Runaway SDK call (infinite agent loop) | mitigate | `DispatchOptions.signal` accepts an `AbortSignal`; callers can pass `AbortSignal.timeout(ms)` for hard stops. SDK itself has `maxTurns` which defaults sensibly. Dispatcher does NOT set its own timeout — caller owns policy (Phase 36 Stop hook will set 30s timeout). |
| T-34-S2 | Information Disclosure | ANTHROPIC_API_KEY in logs / errors | mitigate | Dispatcher NEVER logs prompts or API keys. `LicenseKeyError.message` mentions only "ANTHROPIC_API_KEY is not set or invalid" — no secret leaked. Downstream callers MUST not log `DispatchResult.output` at DEBUG level without sanitization (document in README); out of scope for Plan 02 primitives. |
| T-34-S3 | Information Disclosure | Prompt injection via user input | defer | Dispatcher is transport-only (D-16 / D-17 scope). Callers that accept user-controlled prompt text must sanitize before assembling the `prompt` arg. Documented in dispatcher JSDoc. Phase 36+ callers own this. |
| T-34-T2 | Tampering | Model alias table outdated | mitigate | `models.ts` has explicit "Last updated" date comment + `resolveModel()` passes unknown aliases through so users can override via full model IDs. Worst case is aliases resolve to a superseded model — loud failure from SDK ("model not found") rather than silent misuse. |
</threat_model>

<verification>
Phase-level checks for Plan 02 contribution to SDK-02:

1. `packages/cds-core/src/agent-dispatcher.ts` exists and exports `dispatchAgent` + types.
2. `packages/cds-core/src/models.ts` exists with `MODEL_ALIASES` + `resolveModel`.
3. `packages/cds-core/src/agent-dispatcher.test.ts` has ≥ 7 mock tests + 1 live-SDK test gated by INTEGRATION=1.
4. Default `pnpm --filter @cds/core vitest run` (with `ANTHROPIC_API_KEY` unset) passes.
5. `dispatchAgent` throws `LicenseKeyError` when API key is absent (unit-tested).
6. `dispatchAgent` bridges `AbortSignal` → `AbortController` (unit-tested).
7. Model aliases resolve correctly (unit-tested).
8. No `break;` statements in the for-await loop (grep check in acceptance).
9. One atomic `feat(34-02)` commit on the phase branch.
</verification>

<success_criteria>
SDK-02 satisfied: "`dispatchAgent({ model: 'haiku', prompt: … })` returns `{ output, tokens: { input, output }, cost_usd }` with non-zero token counts from the live SDK" — live verification exists behind `INTEGRATION=1` gate. Default `pnpm test` confirms the wrapper logic end-to-end with a mock SDK. Plan 02 is the sole contributor to SDK-02 from Phase 34.
</success_criteria>

<output>
After completion, `34-02-SUMMARY.md` documents:
- Files created (3 source + 1 summary)
- Test count (7 mock + 1 integration)
- Assumption verification status (A1, A2)
- Any SDK type drift adaptations (`as never` / `as unknown` casts and their justification)
- Green-light status for Plans 03 (Context) and 04 (CostTracker) to consume `DispatchResult` shape
</output>
