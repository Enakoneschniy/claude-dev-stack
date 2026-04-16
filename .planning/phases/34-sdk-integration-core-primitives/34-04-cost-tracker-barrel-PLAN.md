---
plan_id: 34-04-cost-tracker-barrel
phase: 34
plan: 04
type: execute
wave: 2
depends_on:
  - 34-01-sdk-dependency-notices
  - 34-02-dispatch-agent
  - 34-03-context-class
files_modified:
  - packages/cds-core/src/pricing.ts
  - packages/cds-core/src/cost-tracker.ts
  - packages/cds-core/src/cost-tracker.test.ts
  - packages/cds-core/src/errors.ts
  - packages/cds-core/src/index.ts
  - packages/cds-core/src/index.test.ts
autonomous: true
requirements:
  - CORE-02
  - SDK-01
  - SDK-02
  - CORE-01
user_setup: []
must_haves:
  truths:
    - "CostTracker.record({ model, tokens }) aggregates per-session (ROADMAP SC#4 / D-27)"
    - "CostTracker.total() returns { calls, tokens: { input, output }, cost_usd } (D-27)"
    - "CostTracker.dump() renders a human-readable multi-line report (D-27/D-30)"
    - "Bundled pricing table in pricing.ts covers claude-haiku-4-5-*, claude-sonnet-4-6, claude-opus-4-6 (D-29)"
    - "~/.claude/anthropic-pricing.json user override merges atop bundled defaults at construction (D-28)"
    - "Unknown models throw UnknownModelError at record() time (D-29)"
    - "UnknownModelError is appended to existing errors.ts (extends DispatchError) — NOT a new file"
    - "packages/cds-core/src/index.ts re-exports dispatchAgent, Context, CostTracker, Tool (SDK type), error classes, MODEL_ALIASES"
    - "packages/cds-core/src/index.test.ts smoke-tests the public surface (all exports present + types)"
  artifacts:
    - path: "packages/cds-core/src/pricing.ts"
      provides: "Bundled PRICING_TABLE + loadPricingSync() with user-override merge"
      contains: "PRICING_TABLE"
    - path: "packages/cds-core/src/cost-tracker.ts"
      provides: "CostTracker class + per-session aggregation + dump report"
      contains: "export class CostTracker"
    - path: "packages/cds-core/src/cost-tracker.test.ts"
      provides: "Unit tests with tmp-HOME override verification"
      contains: "anthropic-pricing.json"
    - path: "packages/cds-core/src/errors.ts"
      provides: "UnknownModelError appended to existing hierarchy"
      contains: "class UnknownModelError"
    - path: "packages/cds-core/src/index.ts"
      provides: "Public barrel — all Phase 34 exports"
      contains: "export { dispatchAgent }"
    - path: "packages/cds-core/src/index.test.ts"
      provides: "Public surface smoke test"
      contains: "import * as cdsCore"
  key_links:
    - from: "CostTracker.record({ model, tokens })"
      to: "in-memory Call[] array; total() recomputes from pricing table"
      via: "resolvePricing(model) pattern-match"
      pattern: 'resolvePricing'
    - from: "~/.claude/anthropic-pricing.json"
      to: "merged atop PRICING_TABLE at CostTracker construction"
      via: "loadPricingSync()"
      pattern: 'anthropic-pricing.json'
    - from: "dispatchAgent DispatchResult.tokens"
      to: "CostTracker.record(...) call-site convention (caller-owned per D-31)"
      via: "caller explicitly forwards — NOT a dispatchAgent side-effect"
      pattern: 'record(call: { model'
---

<objective>
Implement `CostTracker` — CDS's per-session USD cost aggregation primitive (CONTEXT.md D-27..D-30). Ship the bundled pricing table (`pricing.ts`), the tracker class (`cost-tracker.ts`), the `UnknownModelError` subtype appended to the existing `errors.ts`, and — crucially as the final Plan of Phase 34 — the public barrel at `packages/cds-core/src/index.ts` that re-exports all three Phase 34 primitives + supporting types.

Purpose: satisfy CORE-02 ("`CostTracker` aggregates per-session token + USD totals across multiple `dispatchAgent` calls and returns them via `total()` / `dump()`") AND close Phase 34 by landing the public API surface that Phase 36/38/39 consumers will import.

Plan 04 is Wave 2 because the index.ts barrel depends on Plans 02 and 03's output. Tasks 1–3 (pricing, CostTracker, UnknownModelError) can run in parallel with Plan 02/03 in Wave 1; Tasks 4–5 (index barrel + smoke test) must wait until all three primitives exist.

Output: 3 new files (`pricing.ts`, `cost-tracker.ts`, `cost-tracker.test.ts`), 1 modified file (`errors.ts` — append), 2 modified files (`index.ts` — replace Phase 33 stub; `index.test.ts` — replace stub smoke test). One `feat(34-04)` commit plus the closing Phase 34 summary context.
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
@./packages/cds-core/src/errors.ts
@./packages/cds-core/src/agent-dispatcher.ts
@./packages/cds-core/src/context.ts
@./packages/cds-core/src/models.ts

<interfaces>
<!-- CostTracker public API (CONTEXT.md D-27). -->
```ts
export interface PricingEntry {
  input_usd_per_million: number;
  output_usd_per_million: number;
}

export class CostTracker {
  readonly sessionId: string;
  constructor(sessionId?: string, pricing?: Record<string, PricingEntry>);  // pricing param is DI for tests
  record(call: { model: string; tokens: { input: number; output: number } }): void;  // throws UnknownModelError
  total(): { calls: number; tokens: { input: number; output: number }; cost_usd: number };
  dump(): string;                                 // human-readable multi-line report
}
```

<!-- Caller wiring (D-31 threading convention — for JSDoc + documentation): -->
```ts
import { dispatchAgent, Context, CostTracker } from '@cds/core';
const sessionId = process.env.CLAUDE_SESSION_ID ?? crypto.randomUUID();
const ctx = new Context(sessionId);
const tracker = new CostTracker(sessionId);
const result = await dispatchAgent({ model: 'haiku', prompt: 'hi', session_id: sessionId });
ctx.add({ role: 'user', content: 'hi', timestamp: new Date().toISOString() });
ctx.add({ role: 'assistant', content: result.output, timestamp: new Date().toISOString() });
tracker.record({ model: 'haiku', tokens: result.tokens });
await ctx.save();
console.log(tracker.dump());
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create packages/cds-core/src/pricing.ts with bundled table + override loader</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"CostTracker Class" (D-28, D-29)
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Pattern 4: CostTracker pricing override", §"Open Questions" #1 (fetch current pricing), §"Assumptions Log" A3 (pricing values flagged ASSUMED)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/pricing.ts"
  </read_first>
  <files>
    - packages/cds-core/src/pricing.ts (new)
  </files>
  <action>
  Create `packages/cds-core/src/pricing.ts` with the bundled default table and a synchronous loader that merges `~/.claude/anthropic-pricing.json` atop defaults. This is the only place Phase 34 hardcodes USD-per-token values — any future price drift updates land here (patch release) OR user override (runtime).

  **Note on pricing values:** RESEARCH.md Assumption A3 flags exact dollar values as `[ASSUMED]`. Use the values below, but annotate them with the retrieval date comment so future maintainers can spot-check against anthropic.com/pricing.

  **File: `packages/cds-core/src/pricing.ts`** — paste verbatim:

  ```typescript
  /**
   * Bundled pricing table for CostTracker.
   *
   * Values in USD per million tokens, per Anthropic's public pricing page.
   * Retrieved: 2026-04-16 — re-verify against https://www.anthropic.com/pricing
   * when bumping @anthropic-ai/claude-agent-sdk or publishing @cds/core releases.
   *
   * Users override by writing `~/.claude/anthropic-pricing.json` with the same schema.
   * Override is merged atop defaults at CostTracker construction (D-28).
   *
   * Unknown models (not matching any key or pattern) cause CostTracker.record()
   * to throw UnknownModelError (D-29) — silent zero-cost is NOT acceptable.
   */

  import { readFileSync, existsSync } from 'node:fs';
  import { homedir } from 'node:os';
  import { join } from 'node:path';

  export interface PricingEntry {
    input_usd_per_million: number;
    output_usd_per_million: number;
  }

  /**
   * Bundled default pricing.
   *
   * Key patterns ending in '*' match any model ID starting with the prefix
   * (e.g. 'claude-haiku-4-5-*' matches 'claude-haiku-4-5-20260301').
   * Exact keys (no trailing '*') match only exact model IDs.
   */
  export const PRICING_TABLE: Record<string, PricingEntry> = {
    // Haiku 4.5 family — sharp price reduction vs Haiku 3.5 (was $1/$5 per M)
    'claude-haiku-4-5':   { input_usd_per_million: 0.25, output_usd_per_million: 1.25 },
    'claude-haiku-4-5-*': { input_usd_per_million: 0.25, output_usd_per_million: 1.25 },
    // Sonnet 4.6 — mid-tier reasoning model
    'claude-sonnet-4-6':   { input_usd_per_million: 3.00, output_usd_per_million: 15.00 },
    'claude-sonnet-4-6-*': { input_usd_per_million: 3.00, output_usd_per_million: 15.00 },
    // Opus 4.6 — frontier model
    'claude-opus-4-6':   { input_usd_per_million: 15.00, output_usd_per_million: 75.00 },
    'claude-opus-4-6-*': { input_usd_per_million: 15.00, output_usd_per_million: 75.00 },
  };

  /** Path to the optional user override file (~/.claude/anthropic-pricing.json). */
  export function pricingOverridePath(): string {
    return join(homedir(), '.claude', 'anthropic-pricing.json');
  }

  /**
   * Load bundled PRICING_TABLE merged with optional user override.
   *
   * Reads `~/.claude/anthropic-pricing.json` synchronously if present and merges
   * entries atop the bundled defaults. Unknown keys in the override are kept
   * (extends the bundled table). Malformed JSON falls back to bundled with a
   * warning on stderr (non-fatal per D-28 "best effort" semantics).
   *
   * Synchronous read is acceptable here: called once per CostTracker construction;
   * file is small (<10 KB); blocking the event loop briefly at setup time is fine.
   */
  export function loadPricingSync(): Record<string, PricingEntry> {
    const overridePath = pricingOverridePath();
    if (!existsSync(overridePath)) return { ...PRICING_TABLE };
    try {
      const raw = readFileSync(overridePath, 'utf8');
      const override = JSON.parse(raw) as Record<string, PricingEntry>;
      // Minimal shape validation — every entry must have both USD fields
      for (const [key, entry] of Object.entries(override)) {
        if (
          typeof entry?.input_usd_per_million !== 'number' ||
          typeof entry?.output_usd_per_million !== 'number'
        ) {
          throw new Error(
            `Invalid pricing entry for "${key}": expected { input_usd_per_million: number, output_usd_per_million: number }`,
          );
        }
      }
      return { ...PRICING_TABLE, ...override };
    } catch (err) {
      // Non-fatal: warn on stderr and fall back to bundled values
      // eslint-disable-next-line no-console
      console.warn(
        `[@cds/core] Failed to load pricing override from ${overridePath}: ${(err as Error).message}. Using bundled defaults.`,
      );
      return { ...PRICING_TABLE };
    }
  }
  ```
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/pricing.ts && grep -q 'export const PRICING_TABLE' packages/cds-core/src/pricing.ts && grep -q 'export interface PricingEntry' packages/cds-core/src/pricing.ts && grep -q 'export function loadPricingSync' packages/cds-core/src/pricing.ts && grep -q 'export function pricingOverridePath' packages/cds-core/src/pricing.ts && grep -q "claude-haiku-4-5" packages/cds-core/src/pricing.ts && grep -q "claude-sonnet-4-6" packages/cds-core/src/pricing.ts && grep -q "claude-opus-4-6" packages/cds-core/src/pricing.ts && grep -q 'anthropic-pricing.json' packages/cds-core/src/pricing.ts && grep -q 'Retrieved: 2026-04-16' packages/cds-core/src/pricing.ts && node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/pricing.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022", strict: true } })'</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/pricing.ts` exits 0
    - `grep -c 'export const PRICING_TABLE' packages/cds-core/src/pricing.ts` returns `1`
    - `grep -c 'export interface PricingEntry' packages/cds-core/src/pricing.ts` returns `1`
    - `grep -c 'export function loadPricingSync' packages/cds-core/src/pricing.ts` returns `1`
    - `grep -c 'export function pricingOverridePath' packages/cds-core/src/pricing.ts` returns `1`
    - `grep -cE "claude-haiku-4-5" packages/cds-core/src/pricing.ts` returns ≥ 2 (exact + pattern)
    - `grep -cE "claude-sonnet-4-6" packages/cds-core/src/pricing.ts` returns ≥ 2
    - `grep -cE "claude-opus-4-6" packages/cds-core/src/pricing.ts` returns ≥ 2
    - `grep -c '0.25' packages/cds-core/src/pricing.ts` returns ≥ 2 (Haiku input)
    - `grep -c '1.25' packages/cds-core/src/pricing.ts` returns ≥ 2 (Haiku output)
    - `grep -c '15.00' packages/cds-core/src/pricing.ts` returns ≥ 4 (Sonnet output + Opus input)
    - `grep -c '75.00' packages/cds-core/src/pricing.ts` returns ≥ 2 (Opus output)
    - `grep -c 'Retrieved: 2026-04-16' packages/cds-core/src/pricing.ts` returns `1` (Assumption A3 retrieval date)
    - `grep -c 'anthropic-pricing.json' packages/cds-core/src/pricing.ts` returns ≥ 2
    - `grep -c 'Invalid pricing entry' packages/cds-core/src/pricing.ts` returns `1` (shape validation)
    - TS transpile with `strict: true` succeeds
  </acceptance_criteria>
  <done>
  pricing.ts exists with bundled defaults for Haiku 4.5 / Sonnet 4.6 / Opus 4.6 (exact + pattern-match keys), override loader with shape validation + non-fatal fallback, retrieval date comment.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create packages/cds-core/src/cost-tracker.ts with CostTracker class</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"CostTracker Class" (D-27..D-30), §"Integration & Threading" (D-31)
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Pattern 4: CostTracker pricing override", §"Common Pitfalls" (Pitfall 4, Pitfall 5)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/cost-tracker.ts"
    - ./packages/cds-core/src/pricing.ts (Task 1 output — PricingEntry type + loadPricingSync)
    - ./packages/cds-core/src/errors.ts (UnknownModelError appended in Task 3 — but reference for imports)
  </read_first>
  <files>
    - packages/cds-core/src/cost-tracker.ts (new)
  </files>
  <action>
  Create `packages/cds-core/src/cost-tracker.ts` with the `CostTracker` class per RESEARCH.md §Pattern 4.

  **Ordering note:** This task creates `cost-tracker.ts` which imports `UnknownModelError` from `./errors.js`. Task 3 adds `UnknownModelError` to `errors.ts`. Because tasks in a plan execute sequentially, write this file with the import expecting Task 3 to land the export — and execute Task 3 before running any compile check. The acceptance criterion here is file-structural only; TS transpilation happens after Task 3.

  **File: `packages/cds-core/src/cost-tracker.ts`** — paste verbatim:

  ```typescript
  /**
   * CostTracker — in-memory per-session token + USD aggregation.
   *
   * CONTEXT.md D-27..D-30 contract:
   *   - record({ model, tokens }) append to calls; throw UnknownModelError for unpriced
   *   - total() recomputes from bundled+override pricing table
   *   - dump() returns human-readable multi-line report (D-30 format)
   *   - Per-session only; no cross-session aggregation (D-30 defers)
   *   - Bundled pricing + ~/.claude/anthropic-pricing.json override (D-28)
   */

  import { loadPricingSync, type PricingEntry } from './pricing.js';
  import { UnknownModelError } from './errors.js';

  interface Call {
    model: string;
    tokens: { input: number; output: number };
  }

  interface Totals {
    calls: number;
    tokens: { input: number; output: number };
    cost_usd: number;
  }

  export class CostTracker {
    readonly sessionId: string;
    private readonly _calls: Call[] = [];
    private readonly _pricing: Record<string, PricingEntry>;

    /**
     * @param sessionId - optional threading ID (D-31); defaults to env > '' if unset
     * @param pricing - DI for tests; production path uses loadPricingSync() (bundled + override)
     */
    constructor(sessionId?: string, pricing?: Record<string, PricingEntry>) {
      this.sessionId = sessionId ?? process.env.CLAUDE_SESSION_ID ?? '';
      this._pricing = pricing ?? loadPricingSync();
    }

    /**
     * Record a dispatchAgent call's usage. Throws UnknownModelError (D-29) if
     * the model is not in the bundled+override pricing table — silent zero-cost
     * is unacceptable; callers should update their pricing override or catch
     * the error and fall back to an estimate.
     */
    record(call: Call): void {
      if (!this.resolvePricing(call.model)) {
        throw new UnknownModelError(call.model);
      }
      this._calls.push({
        model: call.model,
        tokens: { input: call.tokens.input, output: call.tokens.output },
      });
    }

    /** Aggregate totals across all recorded calls. */
    total(): Totals {
      const tokens = this._calls.reduce(
        (acc, c) => ({ input: acc.input + c.tokens.input, output: acc.output + c.tokens.output }),
        { input: 0, output: 0 },
      );
      const cost_usd = this._calls.reduce((acc, c) => {
        const entry = this.resolvePricing(c.model);
        if (!entry) return acc;              // already validated at record(); defensive
        return acc
          + (c.tokens.input / 1_000_000) * entry.input_usd_per_million
          + (c.tokens.output / 1_000_000) * entry.output_usd_per_million;
      }, 0);
      return { calls: this._calls.length, tokens, cost_usd };
    }

    /**
     * Human-readable summary report. Format matches CONTEXT.md D-30 example:
     *   Session: abc-123
     *   Calls: 14
     *   Input tokens:  123,456
     *   Output tokens: 45,678
     *   Cost:          $0.87
     */
    dump(): string {
      const t = this.total();
      return [
        `Session: ${this.sessionId || '(no session id)'}`,
        `Calls: ${t.calls}`,
        `Input tokens:  ${t.tokens.input.toLocaleString('en-US')}`,
        `Output tokens: ${t.tokens.output.toLocaleString('en-US')}`,
        `Cost:          $${t.cost_usd.toFixed(2)}`,
      ].join('\n');
    }

    /**
     * Resolve a model ID to a pricing entry. Tries exact match first, then any
     * pattern key ending in '*' whose prefix matches the model ID.
     */
    private resolvePricing(model: string): PricingEntry | undefined {
      const exact = this._pricing[model];
      if (exact) return exact;
      for (const [key, entry] of Object.entries(this._pricing)) {
        if (key.endsWith('-*') && model.startsWith(key.slice(0, -1))) {
          return entry;
        }
        // Also allow bare '*' suffix without '-' separator if user writes that in override
        if (key.endsWith('*') && !key.endsWith('-*') && model.startsWith(key.slice(0, -1))) {
          return entry;
        }
      }
      return undefined;
    }
  }
  ```
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/cost-tracker.ts && grep -q 'export class CostTracker' packages/cds-core/src/cost-tracker.ts && grep -q 'readonly sessionId: string' packages/cds-core/src/cost-tracker.ts && grep -q 'record(call' packages/cds-core/src/cost-tracker.ts && grep -q 'total()' packages/cds-core/src/cost-tracker.ts && grep -q 'dump()' packages/cds-core/src/cost-tracker.ts && grep -q 'UnknownModelError' packages/cds-core/src/cost-tracker.ts && grep -q 'loadPricingSync' packages/cds-core/src/cost-tracker.ts && grep -q 'resolvePricing' packages/cds-core/src/cost-tracker.ts && grep -q '1_000_000' packages/cds-core/src/cost-tracker.ts && grep -q "Input tokens:" packages/cds-core/src/cost-tracker.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/cost-tracker.ts` exits 0
    - `grep -c 'export class CostTracker' packages/cds-core/src/cost-tracker.ts` returns `1`
    - `grep -c 'readonly sessionId: string' packages/cds-core/src/cost-tracker.ts` returns `1`
    - `grep -c 'record(call' packages/cds-core/src/cost-tracker.ts` returns `1`
    - `grep -c '^\s*total()\s*:' packages/cds-core/src/cost-tracker.ts` returns `1`
    - `grep -c '^\s*dump()\s*:' packages/cds-core/src/cost-tracker.ts` returns `1`
    - `grep -c 'UnknownModelError' packages/cds-core/src/cost-tracker.ts` returns ≥ 2 (import + throw)
    - `grep -c 'loadPricingSync' packages/cds-core/src/cost-tracker.ts` returns `1`
    - `grep -c 'resolvePricing' packages/cds-core/src/cost-tracker.ts` returns ≥ 3 (declaration + 2 call sites)
    - `grep -c '1_000_000' packages/cds-core/src/cost-tracker.ts` returns ≥ 2 (input + output USD calc)
    - `grep -c "Input tokens:" packages/cds-core/src/cost-tracker.ts` returns `1`
    - `grep -c "Cost:" packages/cds-core/src/cost-tracker.ts` returns `1`
    - TS transpile is DEFERRED to after Task 3 (UnknownModelError not yet exported)
  </acceptance_criteria>
  <done>
  cost-tracker.ts exists with full class. Imports UnknownModelError from errors.js — compile check deferred until Task 3 adds the export. `resolvePricing` handles exact match + pattern-suffix match.
  </done>
</task>

<task type="auto">
  <name>Task 3: Append UnknownModelError to packages/cds-core/src/errors.ts</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/errors.ts" (Plan 04 appends UnknownModelError)
    - ./packages/cds-core/src/errors.ts (current state — Plan 01 output with placeholder comment)
  </read_first>
  <files>
    - packages/cds-core/src/errors.ts (modified — append UnknownModelError subclass at placeholder)
  </files>
  <action>
  Append `UnknownModelError` to the existing `packages/cds-core/src/errors.ts`. Plan 01 Task 4 placed a placeholder comment (`// UnknownModelError is added by Plan 04 Task 3 — do NOT add here.`) marking the insertion point.

  **Steps:**

  1. Use the `Edit` tool on `packages/cds-core/src/errors.ts`. Replace the placeholder comment block with the `UnknownModelError` class definition.

  2. Replace this exact text:
  ```typescript
  // UnknownModelError is added by Plan 04 Task 3 — do NOT add here.
  // Plan 04 appends the subclass below this comment; keep this placeholder in place.
  ```

  with this:
  ```typescript
  /**
   * Thrown by CostTracker.record() when the model is not present in the
   * bundled+override pricing table (D-29). Callers can catch and fall back
   * to a zero-cost estimate, or let it bubble to expose pricing drift.
   */
  export class UnknownModelError extends DispatchError {
    constructor(public readonly model: string) {
      super(
        `No pricing entry for model "${model}". Add a pattern to ~/.claude/anthropic-pricing.json or update @cds/core's bundled pricing table.`,
      );
      this.name = 'UnknownModelError';
    }
  }
  ```

  3. After the append, verify that all three error classes (`DispatchError`, `LicenseKeyError`, `UnknownModelError`) are exported and form a proper hierarchy. Run a TypeScript transpile smoke check:
  ```bash
  node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/errors.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022", strict: true } })'
  ```

  4. Now that `UnknownModelError` exists, compile-check `cost-tracker.ts` (Task 2 output) too:
  ```bash
  # Minimal check — syntax + type-graph:
  node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/cost-tracker.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022", strict: true } })'
  ```

  Note: single-file transpile doesn't do cross-file type-checking. The real type-check happens at `pnpm --filter @cds/core tsc --noEmit` in Task 6 verification.
  </action>
  <verify>
    <automated>grep -q 'export class UnknownModelError extends DispatchError' packages/cds-core/src/errors.ts && grep -q 'No pricing entry for model' packages/cds-core/src/errors.ts && grep -q "this\.name = 'UnknownModelError'" packages/cds-core/src/errors.ts && ! grep -q 'do NOT add here' packages/cds-core/src/errors.ts && grep -c 'export class' packages/cds-core/src/errors.ts | grep -qE '^3$' && node -e 'require("typescript").transpileModule(require("fs").readFileSync("packages/cds-core/src/errors.ts", "utf8"), { compilerOptions: { module: "NodeNext", target: "ES2022", strict: true } })'</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'export class DispatchError' packages/cds-core/src/errors.ts` returns `1` (original preserved)
    - `grep -c 'export class LicenseKeyError' packages/cds-core/src/errors.ts` returns `1` (original preserved)
    - `grep -c 'export class UnknownModelError extends DispatchError' packages/cds-core/src/errors.ts` returns `1` (newly appended)
    - `grep -c 'do NOT add here' packages/cds-core/src/errors.ts` returns `0` (placeholder removed)
    - `grep -c 'No pricing entry for model' packages/cds-core/src/errors.ts` returns `1`
    - `grep -c 'public readonly model' packages/cds-core/src/errors.ts` returns `1` (UnknownModelError has model property)
    - `grep -c "^export class" packages/cds-core/src/errors.ts` returns `3` (three classes total)
    - TS transpile of errors.ts succeeds with `strict: true`
    - TS transpile of cost-tracker.ts succeeds (now that UnknownModelError exists — single-file transpile)
  </acceptance_criteria>
  <done>
  UnknownModelError appended to errors.ts as subclass of DispatchError. Placeholder comment removed. Three-class hierarchy intact. cost-tracker.ts now compiles (its UnknownModelError import resolves).
  </done>
</task>

<task type="auto">
  <name>Task 4: Create packages/cds-core/src/cost-tracker.test.ts with tmp-HOME override tests</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md §"Per-Task Verification Map" rows 34-04-*
    - .planning/phases/34-sdk-integration-core-primitives/34-RESEARCH.md §"Common Pitfalls" (Pitfall 4, Pitfall 5)
    - ./packages/cds-core/src/cost-tracker.ts (Task 2)
    - ./packages/cds-core/src/pricing.ts (Task 1)
    - ./packages/cds-core/src/errors.ts (Task 3)
  </read_first>
  <files>
    - packages/cds-core/src/cost-tracker.test.ts (new)
  </files>
  <action>
  Create the CostTracker test file. Tests cover:
  1. Aggregation (sum across record calls)
  2. Bundled pricing resolution (haiku/sonnet/opus)
  3. `~/.claude/anthropic-pricing.json` override (via tmp-HOME redirect pattern)
  4. `UnknownModelError` throw for unknown model
  5. `dump()` format
  6. DI path (construct with explicit pricing for deterministic tests)
  7. Pattern-suffix matching (`'claude-haiku-4-5-*'` matches `'claude-haiku-4-5-20260301'`)

  **File: `packages/cds-core/src/cost-tracker.test.ts`** — paste verbatim:

  ```typescript
  /**
   * cost-tracker.test.ts — Unit tests for CostTracker (CORE-02).
   *
   * Most tests use the DI constructor (pass pricing table directly) for determinism.
   * The override-file tests use a tmp-HOME redirect to verify loadPricingSync()
   * picks up ~/.claude/anthropic-pricing.json without touching the real home dir.
   */

  import { afterEach, beforeEach, describe, expect, it } from 'vitest';
  import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';

  import { CostTracker } from './cost-tracker.js';
  import { UnknownModelError, DispatchError } from './errors.js';
  import { PRICING_TABLE, pricingOverridePath, type PricingEntry } from './pricing.js';

  const HOME_BACKUP = process.env.HOME;
  const SESSION_BACKUP = process.env.CLAUDE_SESSION_ID;

  describe('CostTracker — bundled pricing + aggregation (D-27, D-29)', () => {
    beforeEach(() => {
      delete process.env.CLAUDE_SESSION_ID;
    });
    afterEach(() => {
      if (SESSION_BACKUP !== undefined) process.env.CLAUDE_SESSION_ID = SESSION_BACKUP;
      else delete process.env.CLAUDE_SESSION_ID;
    });

    it('record() + total() aggregates tokens across calls', () => {
      const tracker = new CostTracker('test-agg', PRICING_TABLE);
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 100, output: 50 } });
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 200, output: 100 } });
      tracker.record({ model: 'claude-sonnet-4-6', tokens: { input: 500, output: 250 } });

      const t = tracker.total();
      expect(t.calls).toBe(3);
      expect(t.tokens).toEqual({ input: 800, output: 400 });
      // Haiku: (300/M * $0.25) + (150/M * $1.25) = 0.000075 + 0.0001875 = 0.0002625
      // Sonnet: (500/M * $3.00) + (250/M * $15.00) = 0.0015 + 0.00375 = 0.00525
      // Total: ~0.0055125
      expect(t.cost_usd).toBeGreaterThan(0.005);
      expect(t.cost_usd).toBeLessThan(0.006);
    });

    it('resolves haiku pattern to 4.5 pricing (exact match)', () => {
      const tracker = new CostTracker('test-haiku', PRICING_TABLE);
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
      expect(tracker.total().cost_usd).toBeCloseTo(0.25, 4);
    });

    it('resolves dated haiku IDs via pattern-suffix match', () => {
      const tracker = new CostTracker('test-dated', PRICING_TABLE);
      tracker.record({ model: 'claude-haiku-4-5-20260301', tokens: { input: 1_000_000, output: 0 } });
      expect(tracker.total().cost_usd).toBeCloseTo(0.25, 4);
    });

    it('resolves sonnet and opus correctly', () => {
      const tracker = new CostTracker('test-so', PRICING_TABLE);
      tracker.record({ model: 'claude-sonnet-4-6', tokens: { input: 1_000_000, output: 0 } });
      tracker.record({ model: 'claude-opus-4-6', tokens: { input: 0, output: 1_000_000 } });
      const t = tracker.total();
      // Sonnet input 1M * $3 + Opus output 1M * $75
      expect(t.cost_usd).toBeCloseTo(3.00 + 75.00, 2);
    });

    it('throws UnknownModelError at record() for unknown model', () => {
      const tracker = new CostTracker('test-unknown', PRICING_TABLE);
      expect(() =>
        tracker.record({ model: 'gpt-5-turbo', tokens: { input: 100, output: 50 } }),
      ).toThrow(UnknownModelError);
    });

    it('UnknownModelError extends DispatchError (single catch surface)', () => {
      const tracker = new CostTracker('test-hierarchy', PRICING_TABLE);
      try {
        tracker.record({ model: 'unknown-model', tokens: { input: 1, output: 1 } });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(UnknownModelError);
        expect(err).toBeInstanceOf(DispatchError);
        expect((err as UnknownModelError).model).toBe('unknown-model');
      }
    });

    it('UnknownModelError message surfaces the offending model name', () => {
      const tracker = new CostTracker('test-msg', PRICING_TABLE);
      expect(() => tracker.record({ model: 'nonsense', tokens: { input: 1, output: 1 } })).toThrow(
        /nonsense/,
      );
      expect(() => tracker.record({ model: 'nonsense', tokens: { input: 1, output: 1 } })).toThrow(
        /anthropic-pricing\.json/,
      );
    });

    it('sessionId resolution: explicit arg > env > empty string', () => {
      // explicit arg wins
      expect(new CostTracker('explicit', PRICING_TABLE).sessionId).toBe('explicit');

      // env fallback
      process.env.CLAUDE_SESSION_ID = 'from-env';
      expect(new CostTracker(undefined, PRICING_TABLE).sessionId).toBe('from-env');
      delete process.env.CLAUDE_SESSION_ID;

      // empty fallback (CostTracker is more permissive than Context — sessionId is
      // a label here, not a primary key)
      expect(new CostTracker(undefined, PRICING_TABLE).sessionId).toBe('');
    });
  });

  describe('CostTracker — dump() format (D-27, D-30)', () => {
    it('renders human-readable multi-line report', () => {
      const tracker = new CostTracker('my-session', PRICING_TABLE);
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 123_456, output: 45_678 } });
      const output = tracker.dump();
      expect(output).toContain('Session: my-session');
      expect(output).toContain('Calls: 1');
      expect(output).toContain('Input tokens:  123,456');
      expect(output).toContain('Output tokens: 45,678');
      expect(output).toMatch(/Cost:\s+\$[0-9]+\.[0-9]{2}/);
    });

    it('dump() handles empty tracker', () => {
      const tracker = new CostTracker('empty', PRICING_TABLE);
      const output = tracker.dump();
      expect(output).toContain('Session: empty');
      expect(output).toContain('Calls: 0');
      expect(output).toContain('Input tokens:  0');
      expect(output).toContain('$0.00');
    });

    it('dump() labels missing sessionId gracefully', () => {
      const tracker = new CostTracker('', PRICING_TABLE);
      const output = tracker.dump();
      expect(output).toContain('Session: (no session id)');
    });
  });

  describe('CostTracker — ~/.claude/anthropic-pricing.json override (D-28)', () => {
    let tmpHome: string;

    beforeEach(async () => {
      tmpHome = await mkdtemp(join(tmpdir(), 'cds-cost-'));
      process.env.HOME = tmpHome;
      await mkdir(join(tmpHome, '.claude'), { recursive: true });
    });
    afterEach(async () => {
      await rm(tmpHome, { recursive: true, force: true });
      if (HOME_BACKUP !== undefined) process.env.HOME = HOME_BACKUP;
    });

    it('override file merges atop bundled defaults', async () => {
      const override: Record<string, PricingEntry> = {
        'claude-haiku-4-5': { input_usd_per_million: 0.50, output_usd_per_million: 2.50 }, // 2x the bundled
      };
      await writeFile(pricingOverridePath(), JSON.stringify(override), 'utf8');

      const tracker = new CostTracker('test-override');  // loadPricingSync from disk
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
      expect(tracker.total().cost_usd).toBeCloseTo(0.50, 2);
    });

    it('override can add entirely new models', async () => {
      const override: Record<string, PricingEntry> = {
        'gpt-5-turbo': { input_usd_per_million: 1.00, output_usd_per_million: 4.00 },
      };
      await writeFile(pricingOverridePath(), JSON.stringify(override), 'utf8');

      const tracker = new CostTracker('test-newmodel');
      tracker.record({ model: 'gpt-5-turbo', tokens: { input: 1_000_000, output: 1_000_000 } });
      expect(tracker.total().cost_usd).toBeCloseTo(5.00, 2);  // 1 + 4
    });

    it('malformed JSON falls back to bundled (non-fatal)', async () => {
      await writeFile(pricingOverridePath(), '{not valid json', 'utf8');

      // Should NOT throw at construction
      const tracker = new CostTracker('test-malformed');
      // Bundled table still works
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
      expect(tracker.total().cost_usd).toBeCloseTo(0.25, 4);
    });

    it('invalid override entry shape throws (via loadPricingSync warn+fallback)', async () => {
      // Missing required field
      await writeFile(
        pricingOverridePath(),
        JSON.stringify({ 'test-bad': { input_usd_per_million: 1 } }),  // missing output_usd_per_million
        'utf8',
      );

      // CostTracker should still construct (loadPricingSync warn+fallback to bundled);
      // bundled Haiku still priced correctly
      const tracker = new CostTracker('test-bad-override');
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1_000_000, output: 0 } });
      expect(tracker.total().cost_usd).toBeCloseTo(0.25, 4);
    });
  });
  ```
  </action>
  <verify>
    <automated>test -f packages/cds-core/src/cost-tracker.test.ts && grep -q 'UnknownModelError' packages/cds-core/src/cost-tracker.test.ts && grep -q 'describe.*bundled pricing' packages/cds-core/src/cost-tracker.test.ts && grep -q 'describe.*anthropic-pricing.json override' packages/cds-core/src/cost-tracker.test.ts && grep -q 'describe.*dump' packages/cds-core/src/cost-tracker.test.ts && grep -q 'claude-haiku-4-5-20260301' packages/cds-core/src/cost-tracker.test.ts && grep -q '123,456' packages/cds-core/src/cost-tracker.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `test -f packages/cds-core/src/cost-tracker.test.ts` exits 0
    - `grep -c "^describe\('CostTracker" packages/cds-core/src/cost-tracker.test.ts` returns `3` (3 describe groups)
    - Test count: `grep -cE "^    it\('" packages/cds-core/src/cost-tracker.test.ts` (indented `it`) returns ≥ 12
    - `grep -c 'UnknownModelError' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 3 (import + 2+ assertions)
    - `grep -c 'DispatchError' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 2 (hierarchy test)
    - `grep -c 'PRICING_TABLE' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 4 (DI used in all tests of first block)
    - `grep -c 'pricingOverridePath' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 1
    - `grep -c 'claude-haiku-4-5-20260301' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 1 (pattern-match test)
    - `grep -c '123,456' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 1 (dump format test)
    - `grep -c 'not valid json' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 1 (malformed fallback test)
    - `grep -c 'cds-cost-' packages/cds-core/src/cost-tracker.test.ts` returns ≥ 1 (tmp-HOME prefix)
    - TS transpile succeeds
  </acceptance_criteria>
  <done>
  cost-tracker.test.ts covers all 5 CORE-02 validation rows (aggregation, bundled pricing, override, unknown throw, dump format) plus hierarchy (extends DispatchError), sessionId resolution, malformed/invalid override fallback, and pattern-suffix matching.
  </done>
</task>

<task type="auto">
  <name>Task 5: Replace packages/cds-core/src/index.ts with full Phase 34 public barrel</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md §"code_context" ("Integration Points" — index.ts re-exports)
    - .planning/phases/34-sdk-integration-core-primitives/34-PATTERNS.md §"packages/cds-core/src/index.ts"
    - ./packages/cds-core/src/index.ts (current state — Phase 33 stub with CDS_CORE_VERSION = '0.0.0-stub')
    - All Plan 34 sources: agent-dispatcher.ts, context.ts, cost-tracker.ts, errors.ts, models.ts, pricing.ts
  </read_first>
  <files>
    - packages/cds-core/src/index.ts (modified — replace stub with full barrel)
    - packages/cds-core/src/index.test.ts (modified — replace Phase 33 sanity test with public-surface smoke)
  </files>
  <action>
  Replace `packages/cds-core/src/index.ts` with the public barrel that re-exports every symbol Phase 36/38/39 consumers will need. Also update `index.test.ts` with a smoke test that imports every public symbol.

  **File: `packages/cds-core/src/index.ts`** — paste verbatim (replaces Phase 33 stub):

  ```typescript
  /**
   * @cds/core — public surface for Phase 34.
   *
   * Primitives:
   *   - dispatchAgent (SDK-02) — thin wrapper around @anthropic-ai/claude-agent-sdk's query()
   *   - Context (CORE-01) — in-memory conversation state with explicit persistence
   *   - CostTracker (CORE-02) — per-session token + USD aggregation
   *
   * Supporting types:
   *   - DispatchOptions / DispatchResult
   *   - ConversationMessage
   *   - PricingEntry
   *   - Tool (SDK-native pass-through per D-20)
   *
   * Errors (all extend DispatchError):
   *   - DispatchError (base)
   *   - LicenseKeyError (missing ANTHROPIC_API_KEY)
   *   - UnknownModelError (CostTracker hits unpriced model)
   *
   * Utilities:
   *   - MODEL_ALIASES / resolveModel
   *   - PRICING_TABLE / loadPricingSync / pricingOverridePath
   *   - contextFilePath
   */

  // Primitive: dispatchAgent
  export { dispatchAgent } from './agent-dispatcher.js';
  export type { DispatchOptions, DispatchResult } from './agent-dispatcher.js';

  // Primitive: Context
  export { Context, contextFilePath } from './context.js';
  export type { ConversationMessage } from './context.js';

  // Primitive: CostTracker
  export { CostTracker } from './cost-tracker.js';

  // Pricing helpers
  export { PRICING_TABLE, loadPricingSync, pricingOverridePath } from './pricing.js';
  export type { PricingEntry } from './pricing.js';

  // Error hierarchy (D-18 JS-idiomatic throws)
  export { DispatchError, LicenseKeyError, UnknownModelError } from './errors.js';

  // Model alias helpers (D-21)
  export { MODEL_ALIASES, resolveModel } from './models.js';

  // SDK type re-export (D-20 — SDK-native Tool pass-through)
  export type { Tool } from '@anthropic-ai/claude-agent-sdk';

  // Version constant — useful for diagnostic output (replaces Phase 33 stub).
  export const CDS_CORE_VERSION = '0.1.0-phase34';
  ```

  **File: `packages/cds-core/src/index.test.ts`** — paste verbatim (replaces Phase 33 sanity test):

  ```typescript
  /**
   * index.test.ts — Public surface smoke test.
   *
   * Verifies every Phase 34 primitive, type, error class, and utility is exported
   * from @cds/core's main barrel. Does NOT exercise runtime behavior — that's
   * covered by each primitive's own *.test.ts.
   */

  import { describe, it, expect } from 'vitest';
  import * as cdsCore from './index.js';

  describe('@cds/core public surface (Phase 34)', () => {
    it('exports the three primitives', () => {
      expect(typeof cdsCore.dispatchAgent).toBe('function');
      expect(typeof cdsCore.Context).toBe('function');       // class constructor
      expect(typeof cdsCore.CostTracker).toBe('function');   // class constructor
    });

    it('exports the error hierarchy', () => {
      expect(typeof cdsCore.DispatchError).toBe('function');
      expect(typeof cdsCore.LicenseKeyError).toBe('function');
      expect(typeof cdsCore.UnknownModelError).toBe('function');

      // Hierarchy check — LicenseKeyError and UnknownModelError extend DispatchError
      const le = new cdsCore.LicenseKeyError();
      expect(le).toBeInstanceOf(cdsCore.DispatchError);
      const ume = new cdsCore.UnknownModelError('test');
      expect(ume).toBeInstanceOf(cdsCore.DispatchError);
    });

    it('exports the model alias table and resolver', () => {
      expect(typeof cdsCore.MODEL_ALIASES).toBe('object');
      expect(cdsCore.MODEL_ALIASES.haiku).toBe('claude-haiku-4-5');
      expect(cdsCore.MODEL_ALIASES.sonnet).toBe('claude-sonnet-4-6');
      expect(cdsCore.MODEL_ALIASES.opus).toBe('claude-opus-4-6');
      expect(typeof cdsCore.resolveModel).toBe('function');
      expect(cdsCore.resolveModel('haiku')).toBe('claude-haiku-4-5');
      expect(cdsCore.resolveModel('unknown-passthrough')).toBe('unknown-passthrough');
    });

    it('exports the pricing helpers', () => {
      expect(typeof cdsCore.PRICING_TABLE).toBe('object');
      expect(cdsCore.PRICING_TABLE['claude-haiku-4-5']).toBeDefined();
      expect(typeof cdsCore.loadPricingSync).toBe('function');
      expect(typeof cdsCore.pricingOverridePath).toBe('function');
      expect(cdsCore.pricingOverridePath()).toContain('.claude');
      expect(cdsCore.pricingOverridePath()).toContain('anthropic-pricing.json');
    });

    it('exports the context-file path helper', () => {
      expect(typeof cdsCore.contextFilePath).toBe('function');
      expect(cdsCore.contextFilePath('abc-123')).toContain('cds-context-abc-123.json');
    });

    it('exports the CDS_CORE_VERSION constant (non-stub value)', () => {
      expect(typeof cdsCore.CDS_CORE_VERSION).toBe('string');
      expect(cdsCore.CDS_CORE_VERSION).not.toBe('0.0.0-stub');        // Phase 33 stub replaced
      expect(cdsCore.CDS_CORE_VERSION).toMatch(/phase34/);            // Phase 34 marker
    });

    it('a minimal Context construction works (smoke)', () => {
      const ctx = new cdsCore.Context('smoke-sid');
      expect(ctx.sessionId).toBe('smoke-sid');
      expect(ctx.messages).toHaveLength(0);
    });

    it('a minimal CostTracker construction works (smoke, bundled pricing)', () => {
      const tracker = new cdsCore.CostTracker('smoke-sid', cdsCore.PRICING_TABLE);
      tracker.record({ model: 'claude-haiku-4-5', tokens: { input: 1, output: 1 } });
      expect(tracker.total().calls).toBe(1);
    });
  });
  ```

  Use the `Edit` tool with `replace_all: false` on both files (they exist with Phase 33 stub content; the edit replaces the full content). Alternatively, use the `Write` tool since both are being fully rewritten.

  **Pragmatic choice:** use the `Write` tool. Phase 33's stub was minimal (`export const CDS_CORE_VERSION = '0.0.0-stub';` — 2 lines); rewriting is simpler than targeted `Edit`.
  </action>
  <verify>
    <automated>grep -q "export { dispatchAgent } from './agent-dispatcher.js'" packages/cds-core/src/index.ts && grep -q "export { Context" packages/cds-core/src/index.ts && grep -q "export { CostTracker }" packages/cds-core/src/index.ts && grep -q "export { DispatchError, LicenseKeyError, UnknownModelError }" packages/cds-core/src/index.ts && grep -q "export { MODEL_ALIASES, resolveModel }" packages/cds-core/src/index.ts && grep -q "export type { Tool } from '@anthropic-ai/claude-agent-sdk'" packages/cds-core/src/index.ts && grep -q "0.1.0-phase34" packages/cds-core/src/index.ts && ! grep -q "0.0.0-stub" packages/cds-core/src/index.ts && test -f packages/cds-core/src/index.test.ts && grep -q "import \* as cdsCore" packages/cds-core/src/index.test.ts && grep -q "cdsCore.dispatchAgent" packages/cds-core/src/index.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export { dispatchAgent }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export type { DispatchOptions, DispatchResult }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export { Context, contextFilePath }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export type { ConversationMessage }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export { CostTracker }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export { PRICING_TABLE, loadPricingSync, pricingOverridePath }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export type { PricingEntry }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export { DispatchError, LicenseKeyError, UnknownModelError }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export { MODEL_ALIASES, resolveModel }" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "export type { Tool } from '@anthropic-ai/claude-agent-sdk'" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "0.1.0-phase34" packages/cds-core/src/index.ts` returns `1`
    - `grep -c "0.0.0-stub" packages/cds-core/src/index.ts` returns `0` (Phase 33 stub removed)
    - `test -f packages/cds-core/src/index.test.ts` exits 0
    - `grep -c "import \\* as cdsCore from './index.js'" packages/cds-core/src/index.test.ts` returns `1`
    - Test count: `grep -cE "^  it\('" packages/cds-core/src/index.test.ts` returns ≥ 7
    - TS transpile of index.ts succeeds
  </acceptance_criteria>
  <done>
  index.ts exports full Phase 34 public surface: 3 primitives + 3 error classes + 5 utilities + 2 SDK-native types. Phase 33 stub constant replaced with phase34 marker. index.test.ts smoke-tests every export via `import * as cdsCore`.
  </done>
</task>

<task type="auto">
  <name>Task 6: Run full package suite + root suite to verify Phase 34 closure</name>
  <read_first>
    - .planning/phases/34-sdk-integration-core-primitives/34-VALIDATION.md §"Per-Task Verification Map" rows 34-04-* (all)
  </read_first>
  <files>
    - (no files modified)
  </files>
  <action>
  Verify that Plan 04 tests pass, all Phase 34 primitives compile + run cleanly together, AND Phase 33's baseline (928 root tests) is preserved.

  **Steps:**

  1. Run package tests with ANTHROPIC_API_KEY unset:
  ```bash
  env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run
  ```
  Expected: all Plan 02/03/04 tests + index.test.ts smoke pass; one integration-block test skipped.

  2. Run TypeScript compile to verify the full package builds:
  ```bash
  pnpm --filter @cds/core tsc --build
  test -f packages/cds-core/dist/index.js && test -f packages/cds-core/dist/index.d.ts
  ```
  Expected: dist/ contains index.js + index.d.ts + all primitives' .js + .d.ts.

  3. Run the full root suite to preserve Phase 33 baseline:
  ```bash
  pnpm test 2>&1 | tee /tmp/full-phase34.log
  grep -qE '928 passed|pass' /tmp/full-phase34.log
  ```
  (Accept either strict 928 or any "passed" indicator — the strict 928-only assertion is Phase 33's job; Phase 34 MUST NOT regress but may add tests.)

  4. Verify final wall-clock timing stays under the VALIDATION.md budget:
  ```bash
  time env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run 2>&1 | tail -5
  ```
  Expected: total time < 30 seconds.
  </action>
  <verify>
    <automated>env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run && pnpm --filter @cds/core tsc --build && test -f packages/cds-core/dist/index.js && test -f packages/cds-core/dist/index.d.ts && grep -q 'dispatchAgent' packages/cds-core/dist/index.d.ts && grep -q 'CostTracker' packages/cds-core/dist/index.d.ts && grep -q 'Context' packages/cds-core/dist/index.d.ts</automated>
  </verify>
  <acceptance_criteria>
    - `env -u ANTHROPIC_API_KEY pnpm --filter @cds/core vitest run` exits 0
    - Total `@cds/core` test count ≥ 30 (Plan 02: ≥7 + Plan 03: ≥15 + Plan 04: ≥12 + index smoke: ≥7 = ≥41)
    - `pnpm --filter @cds/core tsc --build` exits 0
    - `test -f packages/cds-core/dist/index.js` exits 0
    - `test -f packages/cds-core/dist/index.d.ts` exits 0
    - `grep -q 'dispatchAgent' packages/cds-core/dist/index.d.ts` exits 0 (public type surface shipped)
    - `grep -q 'Context' packages/cds-core/dist/index.d.ts` exits 0
    - `grep -q 'CostTracker' packages/cds-core/dist/index.d.ts` exits 0
    - `grep -q 'DispatchOptions' packages/cds-core/dist/index.d.ts` exits 0
    - `pnpm test` (full-suite) exits 0 — Phase 33 baseline preserved (no new failures in `tests/**`)
    - Wall-clock for package suite: < 30 seconds
  </acceptance_criteria>
  <done>
  Full Phase 34 test matrix green: Plan 01 structural (NOTICES/license) + Plan 02 (dispatcher) + Plan 03 (Context) + Plan 04 (CostTracker + barrel). TypeScript build emits `.d.ts` declarations for all public types. Phase 33 baseline unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 7: Commit Plan 04 deliverables and write 34-04-SUMMARY.md + phase-closing notes</name>
  <read_first>
    - ./CLAUDE.md §"Rules" (conventional commits; no Co-Authored-By)
    - .planning/phases/34-sdk-integration-core-primitives/34-01-SUMMARY.md
    - .planning/phases/34-sdk-integration-core-primitives/34-02-SUMMARY.md
    - .planning/phases/34-sdk-integration-core-primitives/34-03-SUMMARY.md
    - $HOME/.claude/get-shit-done/templates/summary.md
  </read_first>
  <files>
    - .planning/phases/34-sdk-integration-core-primitives/34-04-SUMMARY.md (new)
  </files>
  <action>
  Stage and commit Plan 04's deliverables plus the Phase 34 closing SUMMARY notes.

  **Staged files:**
  - `packages/cds-core/src/pricing.ts` (new)
  - `packages/cds-core/src/cost-tracker.ts` (new)
  - `packages/cds-core/src/cost-tracker.test.ts` (new)
  - `packages/cds-core/src/errors.ts` (modified — UnknownModelError appended)
  - `packages/cds-core/src/index.ts` (modified — full public barrel)
  - `packages/cds-core/src/index.test.ts` (modified — public-surface smoke)
  - `.planning/phases/34-sdk-integration-core-primitives/34-04-SUMMARY.md` (new)

  **Commit message:**
  ```
  feat(34-04): CostTracker + pricing table + @cds/core public barrel

  Implements CORE-02 Phase 34 primitive — CostTracker aggregating
  per-session token + USD totals across dispatchAgent calls — and
  CLOSES Phase 34 by exposing dispatchAgent, Context, CostTracker,
  and supporting types from the @cds/core public barrel.

  - packages/cds-core/src/pricing.ts: bundled PRICING_TABLE for
    claude-haiku-4-5-*, claude-sonnet-4-6, claude-opus-4-6 (D-29)
    + loadPricingSync() merging ~/.claude/anthropic-pricing.json
    override atop defaults (D-28).
  - packages/cds-core/src/cost-tracker.ts: CostTracker class with
    record/total/dump. Throws UnknownModelError for unpriced models.
  - packages/cds-core/src/errors.ts: append UnknownModelError (Plan 01
    placeholder replaced; 3-class hierarchy complete).
  - packages/cds-core/src/index.ts: public barrel re-exports
    dispatchAgent/Context/CostTracker + types + error classes +
    MODEL_ALIASES + PRICING_TABLE + SDK Tool type (D-20). Replaces
    Phase 33 stub with CDS_CORE_VERSION = '0.1.0-phase34'.
  - packages/cds-core/src/index.test.ts: public-surface smoke test
    replacing Phase 33 sanity test.
  - packages/cds-core/src/cost-tracker.test.ts: 12+ tests across 3
    describe groups (aggregation, dump format, override file).

  Closes Phase 34 (SDK-01 + SDK-02 + CORE-01 + CORE-02). Plans 02/03
  sources already shipped; this commit adds the pricing + cost tracker
  + barrel. Phase 33 baseline of 928 root tests preserved.
  ```

  **Write `34-04-SUMMARY.md`:**

  ```markdown
  # Plan 34-04 — CostTracker + Barrel — Summary + Phase 34 Close

  **Completed:** 2026-04-16 (TBD)
  **Requirements:** CORE-02 (primary); also completes SDK-01 / SDK-02 / CORE-01 exposure via barrel
  **Commit:** {hash-fragment TBD}

  ## What shipped (Plan 04 only)

  - `packages/cds-core/src/pricing.ts` — Bundled USD-per-million-token table for
    Haiku 4.5 ($0.25 / $1.25), Sonnet 4.6 ($3.00 / $15.00), Opus 4.6
    ($15.00 / $75.00) as of 2026-04-16 + `loadPricingSync()` with user-override
    merge + `pricingOverridePath()` helper + shape validation.
  - `packages/cds-core/src/cost-tracker.ts` — `CostTracker` class. record() /
    total() / dump(). Pattern-suffix pricing match (`'claude-haiku-4-5-*'`
    matches `'claude-haiku-4-5-20260301'`). DI constructor for tests.
  - `packages/cds-core/src/cost-tracker.test.ts` — 12+ tests: aggregation across
    multiple calls, bundled model resolution, pattern-suffix match,
    UnknownModelError throw + hierarchy check (extends DispatchError),
    dump format (three-line header + $X.XX cost),
    `~/.claude/anthropic-pricing.json` override (merge + add-new + malformed
    fallback + invalid-shape fallback).
  - `packages/cds-core/src/errors.ts` — `UnknownModelError extends DispatchError`
    appended at Plan 01 placeholder. Hierarchy now: `DispatchError` (base) →
    `LicenseKeyError`, `UnknownModelError`.
  - `packages/cds-core/src/index.ts` — Public barrel. Re-exports:
    - Functions: `dispatchAgent`, `resolveModel`, `loadPricingSync`,
      `pricingOverridePath`, `contextFilePath`
    - Classes: `Context`, `CostTracker`, `DispatchError`, `LicenseKeyError`,
      `UnknownModelError`
    - Constants: `MODEL_ALIASES`, `PRICING_TABLE`, `CDS_CORE_VERSION`
    - Types: `DispatchOptions`, `DispatchResult`, `ConversationMessage`,
      `PricingEntry`, `Tool` (SDK-native pass-through per D-20)
  - `packages/cds-core/src/index.test.ts` — Public-surface smoke: every export
    is present, error hierarchy is correct, aliases resolve, a trivial Context
    + CostTracker construction works end-to-end.

  ## Decisions honored (Plan 04)

  - D-27: `CostTracker` API surface — constructor / record / total / dump
  - D-28: bundled + override merge via `loadPricingSync()`
  - D-29: unknown model throws — silent zero-cost prohibited
  - D-30: per-session only, no cross-session aggregation; `dump()` matches
    CONTEXT.md format sketch

  ## Phase 34 — Close

  **Requirements satisfied:**
  - SDK-01 — Plan 01 (NOTICES.md + license disclosure + REQUIREMENTS.md D-15 correction)
  - SDK-02 — Plan 02 (dispatchAgent + mock + INTEGRATION=1 live test)
  - CORE-01 — Plan 03 (Context class + persistence)
  - CORE-02 — Plan 04 (CostTracker + pricing table + override)

  **ROADMAP Success Criteria — status:**
  1. ✅ `NOTICES.md` lists SDK with Anthropic Commercial ToS (Plan 01).
  2. ✅ `dispatchAgent({ model: 'haiku' })` returns `{ output, tokens, cost_usd }`
     with non-zero tokens from live SDK (Plan 02 integration test).
  3. ✅ `Context` accumulates messages via `add()` and persists to
     `~/.claude/cds-context-{session_id}.json` (Plan 03).
  4. ✅ `CostTracker` aggregates per-session token + USD via `total()` / `dump()`
     (Plan 04).

  **Test matrix:**
  - Plan 02: ≥ 7 mock tests + 1 INTEGRATION=1 live test
  - Plan 03: ≥ 15 tests across 4 describe groups (uses tmp-HOME redirect)
  - Plan 04: ≥ 12 tests across 3 describe groups (uses tmp-HOME + PRICING_TABLE DI)
  - index.test.ts: ≥ 7 smoke tests
  - Phase 33 baseline: 928 root tests preserved

  **Assumptions log (from RESEARCH.md) — closure:**
  - A1 (SDK result shape): ✅ confirmed via mock + live tests in Plan 02
  - A2 (SDK accepts `abortController`): ✅ confirmed via mock test in Plan 02
  - A3 (2026-04-16 pricing values): ⚠️ sourced from memory; re-verify at next
    `@anthropic-ai/claude-agent-sdk` bump. Retrieval date is comment-preserved in
    `pricing.ts`. User override path (`~/.claude/anthropic-pricing.json`)
    documented as the runtime-correctness mechanism.
  - A4 (NOTICES.md auto-in-pack): ✅ confirmed in Plan 01 Task 3.
  - A5 (SDK `engines.node >= 18`): ✅ asserted in Plan 01 Task 1.
  - A6 (`pnpm licenses list` detects copyleft): ✅ exercised in Plan 01 Task 3.

  **Open items deferred to later phases (per CONTEXT.md `<deferred>`):**
  - Refactoring `lib/adr-bridge-session.mjs` to use `dispatchAgent` → Phase 36.
  - Streaming variant `dispatchAgentStream()` → Phase 39 or later.
  - `Context.compact()` → v1.1+.
  - Cross-session cost aggregation → v1.1+ / analytics.
  - CI-time license drift detection → v1.1+.

  ## Ready for Phase 35

  `@cds/core` public surface is stable. Phase 35 (Tiered Vault — Tier 2 SQLite)
  can now assume `dispatchAgent` / `Context` / `CostTracker` are importable.
  Phase 36 (Auto Session Capture) is the first real consumer of
  `dispatchAgent`, unblocking the failing v0.12 ADR-02 subprocess pattern.
  ```
  </action>
  <verify>
    <automated>git log -1 --pretty=%B | grep -q 'feat(34-04)' && git log -1 --pretty=%B | grep -q 'CostTracker' && git log -1 --pretty=%B | grep -qvi 'co-authored-by' && test -f .planning/phases/34-sdk-integration-core-primitives/34-04-SUMMARY.md && git show --stat HEAD | grep -q 'packages/cds-core/src/cost-tracker.ts' && git show --stat HEAD | grep -q 'packages/cds-core/src/pricing.ts' && git show --stat HEAD | grep -q 'packages/cds-core/src/index.ts'</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --pretty=%B` starts with `feat(34-04):`
    - `git log -1 --pretty=%B | grep -q 'Co-Authored-By'` returns non-zero (no Co-Authored-By)
    - `git log -1 --pretty=%B | grep -q 'CORE-02'` returns 0
    - `git log -1 --pretty=%B | grep -q 'CLOSES Phase 34'` returns 0
    - `git show --stat HEAD` lists all 7 files: `pricing.ts`, `cost-tracker.ts`, `cost-tracker.test.ts`, `errors.ts`, `index.ts`, `index.test.ts`, `34-04-SUMMARY.md`
    - `test -f .planning/phases/34-sdk-integration-core-primitives/34-04-SUMMARY.md` exits 0
    - `grep -c '## Phase 34 — Close' .planning/phases/34-sdk-integration-core-primitives/34-04-SUMMARY.md` returns `1`
    - `grep -c 'ROADMAP Success Criteria' .planning/phases/34-sdk-integration-core-primitives/34-04-SUMMARY.md` returns `1`
    - Working tree clean post-commit
    - Current branch is `gsd/phase-34-sdk-integration-core-primitives`
    - Branch has ≥ 4 commits ahead of its base (one per plan: 34-01, 34-02, 34-03, 34-04)
  </acceptance_criteria>
  <done>
  Plan 04 committed in one `feat(34-04)` commit. SUMMARY.md closes Phase 34: lists all 4 requirements satisfied, all 4 ROADMAP SCs green, full test matrix, assumption-log closure, and deferred items pointer to Phase 35/36+. Branch has 4 plan-commits ready for PR.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `~/.claude/anthropic-pricing.json` (user-writable) → `loadPricingSync()` in-memory | User-controlled file; malformed/malicious content falls through to bundled with warn (non-fatal). |
| `PRICING_TABLE` → dollar-amount rendering in logs/dump | Pricing drift misleads users on cost; mitigated by override path + retrieval date comment. |
| `@cds/core` public barrel → Phase 36+ consumers | API shape is semver contract; breaking changes require major version bump. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-34-S3 | Spoofing | User override file contents misrepresent cost | accept | User's own file on user's own machine; worst case is user fooling themselves. loadPricingSync validates shape (number for both fields); malformed falls back to bundled. |
| T-34-S4 | Tampering | Pricing drift between SDK release and @cds/core publish (Pitfall 4) | mitigate | User override path is the documented runtime-correctness mechanism. Retrieval date in `pricing.ts` comment + CostTracker test for exact model prices surface drift during test. |
| T-34-D2 | Denial of Service | Infinite tracker.record() in a loop exhausts memory | accept | Same position as Context D-26: unbounded in-memory is acceptable for Phase 34 scope. Real callers (Phase 36 Stop hook) invoke once per dispatchAgent call; single session has <100 calls typically. |
| T-34-I4 | Information Disclosure | `dump()` output includes session IDs and token counts | accept | These are CDS-internal metrics; not secrets. User opts in by calling `dump()`. No PII or API keys in output. |
| T-34-R2 | Repudiation | sessionId in dump vs actual session | accept | sessionId is a caller-provided label; integrity is caller's responsibility. |
| T-34-API | Tampering / API Contract | public barrel shape changes break Phase 36+ consumers | mitigate | index.test.ts smoke-tests every public export. Any regression (removed export, renamed symbol, broken instanceof chain) fails the smoke test immediately. Phase 34 commits form a stable public surface for Phase 35's baseline. |
</threat_model>

<verification>
Phase-level checks for Plan 04 contribution + Phase 34 closure:

1. `packages/cds-core/src/pricing.ts` exists with PRICING_TABLE + loadPricingSync + pricingOverridePath.
2. `packages/cds-core/src/cost-tracker.ts` exists with CostTracker class (record/total/dump/resolvePricing).
3. `packages/cds-core/src/cost-tracker.test.ts` ≥ 12 tests across 3 describe groups.
4. `packages/cds-core/src/errors.ts` exports `UnknownModelError extends DispatchError` (three-class hierarchy complete).
5. `packages/cds-core/src/index.ts` re-exports every Phase 34 public symbol (named + type exports).
6. `packages/cds-core/src/index.test.ts` smoke-tests every export.
7. `pnpm --filter @cds/core tsc --build` emits `dist/*.js` + `dist/*.d.ts`.
8. `pnpm --filter @cds/core vitest run` (with ANTHROPIC_API_KEY unset) passes all ≥ 41 tests.
9. `pnpm test` (full root) preserves Phase 33 baseline of 928 root tests.
10. One atomic `feat(34-04)` commit on the phase branch. Branch has 4 plan commits total.
</verification>

<success_criteria>
CORE-02 satisfied: "`CostTracker` aggregates per-session token + USD totals across multiple `dispatchAgent` calls and returns them via `total()` / `dump()`." Plan 04 closes Phase 34 as the final Wave 2 plan: all four Phase 34 requirements (SDK-01, SDK-02, CORE-01, CORE-02) map to the four plans (01, 02, 03, 04) and all four ROADMAP Success Criteria have concrete verification. `@cds/core` public barrel is the stable contract for Phase 36/38/39 consumers.
</success_criteria>

<output>
After completion, `34-04-SUMMARY.md` documents:
- Plan 04 deliverables (pricing, cost-tracker, UnknownModelError append, index barrel, index.test smoke)
- Decisions honored (D-27 through D-30)
- Phase 34 close summary: all 4 requirements + ROADMAP SC status + test-matrix count
- Assumption log closure (A1–A6)
- Deferred items handed to Phase 35+/v1.1+
- Green-light for Phase 35 to consume the `@cds/core` public surface
</output>
