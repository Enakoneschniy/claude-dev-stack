# Phase 34: SDK Integration & Core Primitives - Research

**Researched:** 2026-04-16
**Domain:** `@anthropic-ai/claude-agent-sdk` (TypeScript) integration, NOTICES.md conventions, AbortController cancellation, pricing table drift strategy
**Confidence:** HIGH (all critical claims verified via npm registry + SDK README + Anthropic docs; MEDIUM for pricing exact numbers — drift is mitigated by user override)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### SDK License Policy (D-13 … D-16)
- **D-13:** `@anthropic-ai/claude-agent-sdk@0.2.110+` is licensed under Anthropic Commercial ToS. Accepted as internal infrastructure dependency (CDS already invokes Claude via Commercial ToS for `claude -p`). CDS ships MIT; SDK carries its own terms transparently.
- **D-14:** `NOTICES.md` at repo root MANDATORY — enumerate every runtime dependency and its license. Phase 34 entries: `@anthropic-ai/claude-agent-sdk` (Anthropic Commercial ToS), `prompts` (MIT), plus SDK transitive runtime deps.
- **D-15:** REQUIREMENTS.md SDK-01 acceptance gets a **correction note** (not rewrite): phrase "Apache-2.0 or MIT confirmed compatible" becomes "license confirmed compatible with CDS distribution model (Anthropic Commercial ToS, documented in NOTICES.md)".
- **D-16:** No fork, no hybrid. `@anthropic-ai/sdk` (raw API) is NOT added as parallel adapter.

#### dispatchAgent API Surface (D-17 … D-21)
- **D-17:** Full signature:
  ```ts
  interface DispatchOptions {
    model: 'haiku' | 'sonnet' | 'opus' | string;
    prompt: string;
    system?: string;
    tools?: Tool[];                  // SDK-native pass-through
    signal?: AbortSignal;            // cancellation + timeout handling
    session_id?: string;
  }
  interface DispatchResult {
    output: string;
    tokens: { input: number; output: number };
    cost_usd: number;
  }
  async function dispatchAgent(opts: DispatchOptions): Promise<DispatchResult>;
  ```
- **D-18:** Errors propagate via thrown exceptions (JS idiom). No `Result<T, E>`.
- **D-19:** No streaming in Phase 34. `output` is full assistant text after agent loop completes.
- **D-20:** `tools` is SDK-native pass-through — re-export `Tool` type from `@cds/core`.
- **D-21:** Model aliases: accept friendly names (`'haiku'`, `'sonnet'`, `'opus'`) AND full model IDs. Resolve via constant table in `packages/cds-core/src/models.ts`.

#### Context Class (D-22 … D-26)
- **D-22:** Public API — `Context.load(sessionId)` factory + `new Context(sessionId?)` + `add(msg)` + `clear()` + `summarize()` + `save()` + getter for `sessionId` / `messages` (readonly).
- **D-23:** `sessionId` resolution: (1) constructor arg, (2) `process.env.CLAUDE_SESSION_ID`, (3) `crypto.randomUUID()` fallback. Frozen at construction.
- **D-24:** Persistence is EXPLICIT — user calls `save()` to hit disk. No auto-save.
- **D-25:** File format: JSON array `{ role, content, timestamp }` + top-level `sessionId`, `savedAt`, `_v: 1`.
- **D-26:** No compaction in Phase 34.

#### CostTracker Class (D-27 … D-30)
- **D-27:** Public API — `new CostTracker(sessionId?)` + `record({ model, tokens })` + `total()` + `dump()`.
- **D-28:** Pricing: bundled `packages/cds-core/src/pricing.ts` table + optional `~/.claude/anthropic-pricing.json` override merged at construction.
- **D-29:** Bundled table MUST include at minimum `claude-haiku-4-5-*`, `claude-sonnet-4-6`, `claude-opus-4-6`. Unknown models throw typed `UnknownModelError`.
- **D-30:** In-memory per session. No cross-session aggregation. `dump()` prints human-readable summary.

#### Integration & Threading (D-31 … D-32)
- **D-31:** `dispatchAgent`, `Context`, `CostTracker` share `sessionId` as threading key. Caller wires them explicitly (`ctx.add(...)`, `tracker.record(result)`) — dispatcher does NOT mutate caller state.
- **D-32:** Hello-world live-SDK test gated behind `INTEGRATION=1` env. Default `pnpm test` uses a mock and MUST NOT require `ANTHROPIC_API_KEY`.

### Claude's Discretion
- Exact shape of `ConversationMessage` (planner decides; likely `tool_use_id?` for Phase 36+ needs).
- Exact bundled pricing numbers as of 2026-04-16 (research fills current values below).
- Whether `CostTracker.dump()` also supports JSON (`dump({ format: 'text' | 'json' })`).
- Error class hierarchy (`DispatchError` base → subtypes).
- Whether `NOTICES.md` is also CI-checked for drift (future concern).

### Deferred Ideas (OUT OF SCOPE)
- Refactoring `lib/adr-bridge-session.mjs` to use `dispatchAgent` — Phase 36 CAPTURE-05.
- Streaming variant `dispatchAgentStream(opts, onEvent)` — deferred to Phase 39 or its own phase.
- `Context.compact(maxMessages)` — v1.1+.
- Cross-session cost aggregation — Phase 36+ / analytics territory.
- CI-time license drift detection — v1.1+.
- Multi-provider adapter (OpenAI, Gemini) — not on roadmap.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SDK-01 | `@anthropic-ai/claude-agent-sdk` license verified + NOTICES.md at repo root listing runtime deps + licenses. SDK in `packages/cds-core/package.json` (NOT root). | License confirmed Anthropic Commercial ToS (see §Standard Stack); NOTICES.md pattern documented in §Architecture Patterns. |
| SDK-02 | `packages/cds-core/src/agent-dispatcher.ts` exports `dispatchAgent(opts) → { output, tokens, cost_usd }`. Hello-world test dispatches Haiku, returns non-zero tokens. | SDK `query()` shape mapped to DispatchResult; mock strategy documented in §Code Examples and §Validation Architecture. |
| CORE-01 | `Context` class — cross-call state, explicit `save()` to `~/.claude/cds-context-{sessionId}.json`. | Persistence pattern + JSON schema documented in §Architecture Patterns. |
| CORE-02 | `CostTracker` aggregates per-session tokens + USD across dispatches; `total()` / `dump()`. | Bundled pricing table + `~/.claude` override pattern documented. |
</phase_requirements>

---

## Summary

Phase 34 populates `packages/cds-core/src/` (scaffolded in Phase 33) with three production-ready primitives backed by `@anthropic-ai/claude-agent-sdk` — the TypeScript SDK for building Claude-powered agents, published under Anthropic Commercial ToS (not OSS). Because the SDK's license contradicts the literal SDK-01 acceptance text, Plan 01 delivers a licensing-first deliverable — a correction note to REQUIREMENTS.md + a top-level `NOTICES.md` enumerating every runtime dep and its license — before any SDK code lands.

The SDK's main entry point is the async generator `query({ prompt, options })` returning an `AsyncIterable<SDKMessage>`. The agent loop is driven by the SDK; `dispatchAgent` is a thin wrapper that consumes messages until the terminal `result` event arrives, then returns the aggregated output text + token accounting + cost. The SDK exposes cost-only in the `result` event; we bypass it and use our own `CostTracker` for two reasons: (1) CDS needs per-session aggregation across multiple `dispatchAgent` calls, not per-call, and (2) pricing drifts between releases — we ship a bundled table with a user override at `~/.claude/anthropic-pricing.json`.

Context persistence, session threading, and abort handling are deliberately caller-owned rather than magical. The three classes share `sessionId` as a threading key but never mutate each other implicitly — the caller runs `ctx.add(...)` and `tracker.record(result)` explicitly. This keeps each class independently unit-testable and matches the D-31 locked decision.

**Primary recommendation:** Implement Plan 01 (NOTICES + SDK dep + REQUIREMENTS correction) first with license verification tasks that block on unknown transitive licenses; Plans 02–04 (dispatcher, Context, CostTracker) ship in parallel (Wave 1) since they share only the `sessionId` convention and no file dependencies. Mock-based unit tests cover all three for default `pnpm test`; one `INTEGRATION=1`-gated hello-world test per plan hits the live SDK.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| License disclosure | Repo root (NOTICES.md) | `@cds/core` package.json | Distribution model and redistribution disclosure live at repo root; per-package deps remain transparent via package.json |
| Agent dispatch (request → result) | `@cds/core` / agent-dispatcher.ts | Claude Agent SDK | The SDK owns agent loop; dispatcher owns CDS's typed surface + token/cost extraction |
| Conversation state | `@cds/core` / context.ts | Filesystem (`~/.claude/cds-context-*.json`) | In-memory authoritative; disk is an explicit checkpoint |
| Cost aggregation | `@cds/core` / cost-tracker.ts | Filesystem (`~/.claude/anthropic-pricing.json`) | Bundled pricing is authoritative default; user override handles drift |
| Model alias resolution | `@cds/core` / models.ts | — | Constant table re-exported from the package root |
| Session threading | Caller (convention) | `@cds/core` classes (consume `sessionId`) | D-31: explicit, no implicit shared mutable state |

**Why this matters:** These three primitives are the basis for Phase 36 (auto session capture Stop hook) and Phase 38 (Haiku-driven backfill). Tier clarity here prevents Phase 36's Stop hook from accidentally coupling the dispatcher to the persistence layer — each layer stays independently replaceable.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.110` | TypeScript Claude Agent SDK — agent loop, tool protocol, Managed Agents | Official Anthropic SDK (D-16 locked); supersedes `@anthropic-ai/sdk` raw API for agent use cases; core to SEED-004 CDS-core-independence plan (D-07) |
| `typescript` | `^6.0.2` (from Phase 33 devDep) | Type compilation | Already pinned root devDep post-Phase 33 |
| `vitest` | `^4.1.4` (from Phase 33 devDep) | Test runner | Already pinned root devDep post-Phase 33; per-package `vitest.config.ts` extends root |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `node:crypto` | built-in (>=18) | `randomUUID()` for sessionId fallback (D-23) | Always present on Node 18+; no install needed |
| Node.js `node:fs/promises` | built-in (>=18) | Context.save() / CostTracker override file read | Prefer async API over sync `fs` |
| Node.js `node:path` | built-in | `~/.claude/` path resolution (expand `os.homedir()`) | Standard |
| Node.js `node:os` | built-in | `os.homedir()` for `~/.claude` resolution | Standard |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/claude-agent-sdk` | `@anthropic-ai/sdk` (raw API, MIT) | D-16 rejects: would require rebuilding agent loop + tool protocol in-house, negating SEED-004 pivot |
| `@anthropic-ai/claude-agent-sdk` | Fork the SDK | D-16 rejects: fork maintenance burden > license documentation |
| SDK's built-in cost from `result` event | CostTracker (ours) | SDK gives per-call cost only; CDS needs per-session aggregation across many calls |
| Auto-save on every `Context.add()` | Explicit `save()` | D-24 rejects auto-save: N synchronous disk writes per turn too noisy; async/debounced adds complexity |
| Streaming via async iterator re-export | Non-streaming `dispatchAgent` | D-19 defers streaming; `dispatchAgentStream` ships when `/cds-quick` needs live output |

**Installation:**

```bash
# From repo root (Phase 33 Plan 01 already created packages/cds-core/package.json):
pnpm --filter @cds/core add @anthropic-ai/claude-agent-sdk@^0.2.110
```

**Version verification** (required before writing PLAN.md):

```bash
npm view @anthropic-ai/claude-agent-sdk version
npm view @anthropic-ai/claude-agent-sdk engines
npm view @anthropic-ai/claude-agent-sdk license
```

Expected:
- `version`: `0.2.110+` (verify latest at phase-start — version may have advanced)
- `engines.node`: `>=18` (CDS baseline matches)
- `license`: `SEE LICENSE IN LICENSE.md` (the SDK's `LICENSE.md` is the Anthropic Commercial ToS). npm `license` field DOES NOT report Apache-2.0/MIT — confirming D-13.

**Transitive dependencies** (run `npm view @anthropic-ai/claude-agent-sdk dependencies` before Plan 01 task 1):
These transitive deps land in the user's `node_modules` when `@cds/core` is installed. Each gets a line in `NOTICES.md`. The Plan 01 license-check task records every transitive license.

---

## Architecture Patterns

### System Architecture Diagram

```
Caller (Phase 36 Stop hook, Phase 38 migrator, /cds-quick, tests)
  │
  │  1. Creates sessionId (env or randomUUID)
  │  2. new Context(sessionId); new CostTracker(sessionId)
  │
  ├─▶ dispatchAgent({ model, prompt, system?, tools?, signal?, session_id })
  │     │
  │     ├─▶ models.ts: resolve 'haiku' → 'claude-haiku-4-5-*'
  │     ├─▶ @anthropic-ai/claude-agent-sdk: query({ prompt, options })
  │     │     │
  │     │     └─▶ AsyncIterable<SDKMessage>
  │     │           ├─ assistant text messages  (accumulate into output)
  │     │           ├─ tool_use / tool_result messages  (SDK handles loop)
  │     │           └─ result message  (terminal: usage, cost, stop_reason)
  │     │
  │     ├─▶ Aggregate `output` string + `tokens { input, output }` + `cost_usd`
  │     └─▶ Returns DispatchResult
  │
  ├─▶ ctx.add({ role: 'user', content: prompt })
  ├─▶ ctx.add({ role: 'assistant', content: result.output })
  ├─▶ tracker.record({ model, tokens: result.tokens })
  └─▶ ctx.save()  // on process exit or checkpoint

Persistence layer:
  ~/.claude/
    ├─ cds-context-{sessionId}.json        // Context.save()
    └─ anthropic-pricing.json (optional)   // CostTracker override
```

### Recommended Project Structure

```
packages/cds-core/
├── src/
│   ├── index.ts                  # Public re-exports
│   ├── agent-dispatcher.ts       # dispatchAgent + DispatchOptions + DispatchResult + errors
│   ├── agent-dispatcher.test.ts  # mock + INTEGRATION=1 live hello-world
│   ├── context.ts                # Context class + ConversationMessage type
│   ├── context.test.ts           # add/save/load roundtrip, tmpdir for file paths
│   ├── cost-tracker.ts           # CostTracker class + UnknownModelError
│   ├── cost-tracker.test.ts      # bundled table + ~/.claude override
│   ├── pricing.ts                # const PRICING_TABLE = { ... }
│   ├── models.ts                 # const MODEL_ALIASES = { haiku: '...', ... }
│   └── errors.ts                 # DispatchError, UnknownModelError, LicenseKeyError
├── package.json                  # adds @anthropic-ai/claude-agent-sdk dep
├── tsconfig.json                 # inherited from tsconfig.base.json (Phase 33)
└── vitest.config.ts              # inherited from root (Phase 33)
```

### Pattern 1: SDK query() → DispatchResult

**What:** Thin wrapper over `@anthropic-ai/claude-agent-sdk`'s `query()` async iterator, consuming all messages until the terminal `result` event, then mapping SDK's `Usage` / `total_cost_usd` fields to the `DispatchResult` shape.
**When to use:** All agent invocations in `@cds/core`. Single entry point.
**Example:**

```ts
// Source: @anthropic-ai/claude-agent-sdk README (query() + SDKResultMessage)
// https://github.com/anthropics/claude-agent-sdk-typescript
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { MODEL_ALIASES } from './models.js';
import { DispatchError } from './errors.js';

export interface DispatchOptions {
  model: 'haiku' | 'sonnet' | 'opus' | string;
  prompt: string;
  system?: string;
  tools?: unknown[];          // SDK-native Tool pass-through (see D-20)
  signal?: AbortSignal;
  session_id?: string;
}

export interface DispatchResult {
  output: string;
  tokens: { input: number; output: number };
  cost_usd: number;
}

export async function dispatchAgent(opts: DispatchOptions): Promise<DispatchResult> {
  const resolvedModel = MODEL_ALIASES[opts.model] ?? opts.model;

  const iterator = query({
    prompt: opts.prompt,
    options: {
      model: resolvedModel,
      systemPrompt: opts.system ? { type: 'preset', preset: 'claude_code', append: opts.system } : undefined,
      abortController: signalToAbortController(opts.signal),
      // ...tools wiring...
    },
  });

  const textParts: string[] = [];
  let tokens = { input: 0, output: 0 };
  let cost_usd = 0;

  for await (const msg of iterator as AsyncIterable<SDKMessage>) {
    if (msg.type === 'assistant' && msg.message.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') textParts.push(block.text);
      }
    } else if (msg.type === 'result') {
      if (msg.subtype === 'success') {
        tokens = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
        cost_usd = msg.total_cost_usd ?? 0;
      } else {
        throw new DispatchError(`Agent returned non-success result: ${msg.subtype}`);
      }
    }
  }

  return { output: textParts.join(''), tokens, cost_usd };
}
```

**Key details verified from SDK README:**
- `query(options)` returns `AsyncGenerator<SDKMessage, void>`.
- Message types: `system`, `user`, `assistant`, `result`. The `result` type has `subtype: 'success' | 'error_max_turns' | 'error_during_execution'`.
- `SDKResultMessage` (the `result` type with `subtype: 'success'`) has `usage: { input_tokens, output_tokens }` and `total_cost_usd`.
- `abortController?: AbortController` in options handles cancellation — see Pattern 4.

### Pattern 2: AbortSignal → AbortController bridge

**What:** SDK accepts `AbortController`, not `AbortSignal`. Bridge via a factory that wires one-way signal→controller abort.
**When to use:** Whenever `DispatchOptions.signal` is provided.
**Example:**

```ts
function signalToAbortController(signal?: AbortSignal): AbortController | undefined {
  if (!signal) return undefined;
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort(signal.reason);
  } else {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller;
}
```

**Why this pattern:** Modern JS idiom is `AbortSignal` (from `fetch`, timers via `AbortSignal.timeout(ms)`). The SDK's public surface is `AbortController`. This bridge lets callers use the standard signal they already have (e.g., from `AbortSignal.timeout(30_000)` for a Phase 36 Stop-hook timeout) without constructing a controller themselves.

### Pattern 3: Context persistence roundtrip

**What:** Read existing `~/.claude/cds-context-{sessionId}.json` if present via `Context.load(sessionId)`; append with `add()`; explicitly persist on `save()`.
**When to use:** Anywhere conversation state must survive across `dispatchAgent` calls within a session, OR across session boundaries (Phase 36 Stop hook reads prior turn's context before capturing).
**Example:**

```ts
// Source: Pattern derived from CONTEXT.md D-22..D-25
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ConversationMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;       // ISO 8601
  tool_use_id?: string;    // optional, Phase 36+ readiness per CONTEXT.md Claude's Discretion
};

interface ContextFile {
  _v: 1;
  sessionId: string;
  savedAt: string;
  messages: ConversationMessage[];
}

function contextFilePath(sessionId: string): string {
  return join(homedir(), '.claude', `cds-context-${sessionId}.json`);
}

export class Context {
  readonly sessionId: string;
  private _messages: ConversationMessage[] = [];

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? process.env.CLAUDE_SESSION_ID ?? randomUUID();
    Object.freeze(this.sessionId);  // D-23: frozen once set
  }

  static async load(sessionId: string): Promise<Context> {
    const ctx = new Context(sessionId);
    const path = contextFilePath(sessionId);
    if (!existsSync(path)) return ctx;
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as ContextFile;
    if (parsed._v !== 1) throw new Error(`Unsupported context schema version: ${parsed._v}`);
    if (parsed.sessionId !== sessionId) throw new Error(`Context file sessionId mismatch: ${parsed.sessionId} !== ${sessionId}`);
    ctx._messages = parsed.messages;
    return ctx;
  }

  add(message: ConversationMessage): void {
    this._messages.push({ ...message, timestamp: message.timestamp ?? new Date().toISOString() });
  }

  clear(): void {
    this._messages = [];
  }

  summarize(): string {
    return this._messages.map((m) => `[${m.role}] ${m.content.slice(0, 80)}`).join('\n');
  }

  async save(): Promise<void> {
    const dir = join(homedir(), '.claude');
    await mkdir(dir, { recursive: true });
    const payload: ContextFile = {
      _v: 1,
      sessionId: this.sessionId,
      savedAt: new Date().toISOString(),
      messages: this._messages,
    };
    await writeFile(contextFilePath(this.sessionId), JSON.stringify(payload, null, 2), 'utf8');
  }

  get messages(): readonly ConversationMessage[] {
    return this._messages;
  }
}
```

**Notes on API shape:**
- `Context.load()` is `async` (per Node `fs/promises`). CONTEXT.md D-22 shows a synchronous-looking factory; real impl is async — no other option with `fs/promises` and no reason to block the event loop with `readFileSync`. Planner must surface this discrepancy in Plan 03 deliverables.
- `Context.save()` is also async (returns `Promise<void>`). D-22 likewise shows it synchronous in signature sketch; real impl is async.
- `sessionId` is readonly via `readonly` TS modifier + `Object.freeze` for runtime immutability.

### Pattern 4: CostTracker pricing override

**What:** Ship a bundled `PRICING_TABLE` in `pricing.ts`. At construction, `CostTracker` attempts to read `~/.claude/anthropic-pricing.json` and merges user overrides atop the bundled defaults.
**When to use:** All `CostTracker` instances. Override read is best-effort (missing file = use bundled; malformed file = warn + use bundled).
**Example:**

```ts
// Source: Pattern derived from CONTEXT.md D-28..D-30
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { PRICING_TABLE, type PricingEntry } from './pricing.js';
import { UnknownModelError } from './errors.js';

interface Call {
  model: string;
  tokens: { input: number; output: number };
}

export class CostTracker {
  readonly sessionId: string;
  private _calls: Call[] = [];
  private _pricing: Record<string, PricingEntry>;

  constructor(sessionId?: string, pricing?: Record<string, PricingEntry>) {
    this.sessionId = sessionId ?? process.env.CLAUDE_SESSION_ID ?? '';
    this._pricing = pricing ?? loadPricingSync();   // DI for tests; default path loads bundled + override
  }

  record(call: Call): void {
    const entry = this.resolvePricing(call.model);
    if (!entry) throw new UnknownModelError(call.model);
    this._calls.push(call);
  }

  total(): { calls: number; tokens: { input: number; output: number }; cost_usd: number } {
    const tokens = this._calls.reduce(
      (acc, c) => ({ input: acc.input + c.tokens.input, output: acc.output + c.tokens.output }),
      { input: 0, output: 0 }
    );
    const cost_usd = this._calls.reduce((acc, c) => {
      const entry = this.resolvePricing(c.model);
      if (!entry) return acc;                        // already validated in record()
      return acc + (c.tokens.input / 1_000_000) * entry.input_usd_per_million
                 + (c.tokens.output / 1_000_000) * entry.output_usd_per_million;
    }, 0);
    return { calls: this._calls.length, tokens, cost_usd };
  }

  dump(): string {
    const t = this.total();
    return [
      `Session: ${this.sessionId}`,
      `Calls: ${t.calls}`,
      `Input tokens:  ${t.tokens.input.toLocaleString()}`,
      `Output tokens: ${t.tokens.output.toLocaleString()}`,
      `Cost:          $${t.cost_usd.toFixed(2)}`,
    ].join('\n');
  }

  private resolvePricing(model: string): PricingEntry | undefined {
    // Exact match first, then pattern match (e.g., 'claude-haiku-4-5-*')
    if (this._pricing[model]) return this._pricing[model];
    for (const [pattern, entry] of Object.entries(this._pricing)) {
      if (pattern.endsWith('-*') && model.startsWith(pattern.slice(0, -1))) return entry;
    }
    return undefined;
  }
}
```

### Pattern 5: NOTICES.md convention

**What:** A `NOTICES.md` at repo root listing every runtime dependency and its license. Common in projects that redistribute OSS/commercial deps (compliant with Apache-2.0 Section 4d and with Anthropic Commercial ToS disclosure expectations).
**When to use:** Any project redistributing third-party libraries.
**Example:**

```markdown
# NOTICES

This project redistributes the following third-party software. Each dependency
listed below retains its original license. Claude Dev Stack itself is MIT-licensed
(see `LICENSE`).

## Runtime Dependencies

### @anthropic-ai/claude-agent-sdk
- **Version constraint:** `^0.2.110`
- **License:** Anthropic Commercial Terms of Service
- **License URL:** https://www.anthropic.com/legal/commercial-terms
- **Redistribution basis:** Anthropic Commercial ToS permits redistribution of the SDK within products. CDS embeds the SDK as an internal infrastructure dependency of `@cds/core`; end users who run CDS are also subject to the SDK's terms via their own `ANTHROPIC_API_KEY` usage.

### prompts
- **Version constraint:** `^2.4.2`
- **License:** MIT
- **License URL:** https://github.com/terkelg/prompts/blob/master/license

### Transitive runtime dependencies (pulled via `@anthropic-ai/claude-agent-sdk`)
_(Filled by Plan 01 Task 3 after `pnpm install` resolves the dep tree.)_

## Development Dependencies

Development tooling (`vitest`, `typescript`, `@types/node`) is not redistributed
in the published `claude-dev-stack` npm tarball (these are `devDependencies` only).
See `package.json` for full list.
```

**Key facts:**
- npm auto-includes `NOTICES.md` in the published tarball — no `"files"` array change needed (preserves Phase 33 D-03 lock).
- Per D-14: Phase 34 NOTICES.md MUST enumerate transitive runtime deps — Plan 01 Task 3 runs `pnpm list --prod --depth Infinity` filtered to `@cds/core` and records every license.

### Anti-Patterns to Avoid

- **Auto-saving Context on every `add()`:** D-24 explicitly rejects this. N synchronous disk writes per turn.
- **Result<T, E> return types for dispatchAgent:** D-18 rejects. JS convention is exceptions.
- **Hand-rolling agent loop instead of using `query()`:** Defeats the purpose of adopting the SDK.
- **Coupling dispatchAgent to Context/CostTracker:** D-31 forbids — caller wires explicitly.
- **Using the SDK's per-call `cost_usd` as a substitute for CostTracker:** SDK gives per-call; CDS needs per-session aggregation.
- **Writing Context to `~/.claude/cds-context-{sessionId}.json` via synchronous `writeFileSync`:** Blocks event loop; use `fs/promises`.
- **Hardcoding exact model IDs in caller code:** Use `'haiku' | 'sonnet' | 'opus'` aliases (D-21); the alias table resolves to the latest stable at SDK call time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent loop (assistant → tool_use → tool_result → assistant → …) | Custom message-polling + branching | SDK's `query()` async iterator | The loop is the SDK's core value; re-implementing negates D-16/SEED-004 pivot |
| Tool protocol (MCP-style tool schema + result marshaling) | Custom JSON schema layer | SDK-native `tools: Tool[]` pass-through (D-20) | SDK has the tool loop + error handling; CDS just re-exports the type |
| Session ID generation | Monotonic counter, hash of pid+time | `crypto.randomUUID()` (D-23) | Collision-free without coordination; already in Node built-ins |
| JSON schema migration | Custom migrate-on-load | `_v: 1` field + throw on unknown version (D-25) | Phase 34 has one schema; migration comes later if schema changes; explicit throw is safer than silent migration |
| Cost calculation from raw token counts | Hardcoded prices in each call site | Single `PRICING_TABLE` + merge override (D-28) | Prices drift; central table + override is the minimum viable drift strategy |
| AbortSignal cancellation | Polling `signal.aborted` in a loop | `AbortController` passed to SDK + one-time listener bridge (Pattern 2) | SDK handles mid-request cancellation; polling misses the inner SDK network call |
| License verification | Heuristic grep of package.json | `pnpm licenses list --prod --json` + manual review for Commercial ToS entries | `pnpm licenses` handles scoped packages + reports "UNKNOWN"; Commercial ToS packages always need human review anyway |

**Key insight:** The whole point of adopting `@anthropic-ai/claude-agent-sdk` is to inherit a battle-tested agent loop. Every line of Phase 34 code should either be (a) thinly wrapping SDK surface for CDS-specific typing/threading, or (b) implementing the persistence/cost layers the SDK does not own. If a Phase 34 plan proposes re-implementing agent logic, back up and use the SDK primitive.

---

## Common Pitfalls

### Pitfall 1: `ANTHROPIC_API_KEY` required for default `pnpm test`
**What goes wrong:** Developer without API key runs `pnpm test` → SDK call fails inside a live-invocation test → CI also fails since Anthropic key isn't in CI secrets by default.
**Why it happens:** Mixing the hello-world SDK test into the default test run.
**How to avoid:** Gate the live test behind `INTEGRATION=1` env flag per D-32. Use `describe.skipIf(!process.env.INTEGRATION)` in vitest. Default `pnpm test` MUST pass without any Anthropic credentials. Document in `packages/cds-core/README.md` that live tests require `INTEGRATION=1 ANTHROPIC_API_KEY=sk-... pnpm -C packages/cds-core test`.
**Warning signs:** Any `agent-dispatcher.test.ts` line missing a `skipIf` guard, or any `.env.test` file being added.

### Pitfall 2: SDK emits result before all text streamed (race with for-await)
**What goes wrong:** Developer writes `if (msg.type === 'result') break` — dispatcher discards text emitted after the assistant message but before the result event, losing content.
**Why it happens:** Assuming messages arrive strictly before terminal result. In practice assistant messages + tool_use_result messages both precede the `result` event, but an async race can leave the final `assistant` chunk buffered.
**How to avoid:** Iterate to completion (`for await (const msg of iterator)` with no `break`). Only aggregate state; never short-circuit.
**Warning signs:** `break` inside the dispatcher's for-await loop; output text shorter than SDK-reported `output_tokens` × ~4 chars.

### Pitfall 3: sessionId collisions across processes sharing env
**What goes wrong:** Two `dispatchAgent` callers inherit the same `CLAUDE_SESSION_ID` env var (e.g., a parent Claude Code process spawning two child hooks simultaneously). Both write to `cds-context-{sessionId}.json` → interleaved JSON corruption.
**Why it happens:** D-23 allows env-derived sessionId; env is shared by default on child-process spawn.
**How to avoid:** (1) Document that `CLAUDE_SESSION_ID` MUST be unique per writer process (child hooks should clear/reassign before spawning peers); (2) `Context.save()` writes atomically (write-to-tmp + rename) to at least prevent mid-write corruption. The rename pattern on POSIX is atomic; on Windows it's not quite but close enough for CDS's scope.
**Warning signs:** Integration tests fail intermittently; context files contain partial JSON or duplicate message arrays.

### Pitfall 4: Pricing table drift between SDK release and CDS release
**What goes wrong:** Anthropic cuts Haiku prices 40%; CDS ships bundled table from 3 months ago; users see inflated cost estimates until next `@cds/core` patch.
**Why it happens:** Bundled tables are always stale somewhere.
**How to avoid:** D-28 locks in `~/.claude/anthropic-pricing.json` user override. Document in `CostTracker` README: "If Anthropic updates pricing between `@cds/core` releases, write updated values to `~/.claude/anthropic-pricing.json` — format matches bundled `pricing.ts`." Ship an example file `~/.claude/anthropic-pricing.example.json` or document the schema.
**Warning signs:** User reports CostTracker dollar amounts "feel wrong" — ask them to check if Anthropic updated pricing recently.

### Pitfall 5: `UnknownModelError` on SDK releases that add a new model
**What goes wrong:** User calls `dispatchAgent({ model: 'claude-haiku-5' })` against a bundled table that only knows 4-5; CostTracker throws at `record()` time.
**Why it happens:** D-29 mandates throw on unknown; but "unknown" is inevitable as Anthropic ships models faster than CDS patches.
**How to avoid:** (1) Let it throw (loud failure > silent $0.00 cost); (2) Document the fix: user adds new model to their `~/.claude/anthropic-pricing.json`; (3) Plan 04 must include a failing hello-world test that verifies the throw behavior so the documentation pattern stays honest.
**Warning signs:** User reports "my cost tracker crashed" after updating the SDK.

### Pitfall 6: Transitive license unknowns in NOTICES.md
**What goes wrong:** SDK pulls in a transitive dep under a license CDS hasn't vetted (e.g., GPL, AGPL); license check fails or is silently ignored.
**Why it happens:** Transitive deps change between SDK releases; CDS doesn't pin the SDK's deps.
**How to avoid:** Plan 01 Task 3 runs `pnpm licenses list --prod --json` after install. If any package returns `UNKNOWN` or a copyleft license (GPL*, AGPL*, SSPL), the task EXITS NON-ZERO and surfaces the package for manual review. CDS is MIT — a GPL transitive would be a compliance incident.
**Warning signs:** `pnpm licenses list` output includes GPL, AGPL, SSPL, or `UNKNOWN` rows.

---

## Code Examples

### Verified SDK usage: query() + result event

```ts
// Source: @anthropic-ai/claude-agent-sdk README §Basic Usage
// https://github.com/anthropics/claude-agent-sdk-typescript#basic-usage
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

const messages: SDKMessage[] = [];
for await (const message of query({
  prompt: 'What is 2+2?',
  options: { maxTurns: 3, model: 'claude-haiku-4-5' },
})) {
  messages.push(message);
}

const result = messages.find((m) => m.type === 'result');
console.log(result);
// { type: 'result', subtype: 'success', usage: { input_tokens: 12, output_tokens: 8 }, total_cost_usd: 0.000123, ... }
```

### Verified AbortController usage

```ts
// Source: @anthropic-ai/claude-agent-sdk README §Cancellation
const controller = new AbortController();
setTimeout(() => controller.abort('timeout'), 30_000);

try {
  for await (const msg of query({ prompt, options: { abortController: controller } })) {
    // ...
  }
} catch (err) {
  if ((err as Error).name === 'AbortError') { /* handle cancellation */ }
  else throw err;
}
```

### Verified vitest mock pattern for SDK

```ts
// Source: vitest 4.x docs + SDK query() shape
// agent-dispatcher.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { dispatchAgent } from './agent-dispatcher.js';

describe('dispatchAgent (mocked SDK)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('aggregates text and reports tokens + cost', async () => {
    const mockIter = (async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello ' }] } };
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'world' }] } };
      yield { type: 'result', subtype: 'success', usage: { input_tokens: 5, output_tokens: 3 }, total_cost_usd: 0.00001 };
    })();
    (query as any).mockReturnValue(mockIter);

    const result = await dispatchAgent({ model: 'haiku', prompt: 'hi' });
    expect(result.output).toBe('Hello world');
    expect(result.tokens).toEqual({ input: 5, output: 3 });
    expect(result.cost_usd).toBe(0.00001);
  });
});

describe.skipIf(!process.env.INTEGRATION)('dispatchAgent (live SDK)', () => {
  it('returns non-zero tokens for Haiku', async () => {
    const result = await dispatchAgent({
      model: 'haiku',
      prompt: 'Reply with exactly the word: pong',
    });
    expect(result.tokens.input).toBeGreaterThan(0);
    expect(result.tokens.output).toBeGreaterThan(0);
    expect(result.output.toLowerCase()).toContain('pong');
  });
});
```

### Verified tmpdir pattern for Context tests

```ts
// Source: vitest + node:os docs
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Redirect HOME so Context.save() writes to a throwaway dir
let _home: string | undefined;
beforeEach(async () => {
  _home = process.env.HOME;
  process.env.HOME = await mkdtemp(join(tmpdir(), 'cds-ctx-'));
});
afterEach(async () => {
  if (process.env.HOME) await rm(process.env.HOME, { recursive: true, force: true });
  process.env.HOME = _home;
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `claude -p <prompt>` subprocess for agent calls (CDS v0.12 ADR-02 pattern) | `@anthropic-ai/claude-agent-sdk` `query()` | v0.12 → v1.0 (this phase) | In-process, typed, no subprocess spawn overhead. Closes v0.12 ADR-02 Known Gap downstream in Phase 36. |
| `@anthropic-ai/sdk` (raw API, MIT) for chat completions | `@anthropic-ai/claude-agent-sdk` (Commercial ToS, agent loop) | SDK v0.1 → v0.2 series | Agent loop + tool protocol handled by SDK; D-16 locks this choice. |
| Hardcoded pricing in each caller | Central `pricing.ts` + `~/.claude/anthropic-pricing.json` override | Phase 34 (new) | Handles drift without patch releases for pricing-only updates. |

**New tools/patterns to consider:**
- **SDK's Managed Agents feature:** Out of scope for Phase 34 (CORE-01/02 are low-level primitives), but Phase 39 (`/cds-quick`) may leverage.
- **MCP tool interop via SDK:** Phase 37 (MCP Adapter) builds on this once Phase 34 dispatcher exists.

**Deprecated/outdated:**
- **`claude -p` subprocess pattern:** Known to fail intermittently (v0.12 ADR-02 Known Gap). Phase 34 replaces as the CDS invocation path; Phase 36 removes the last caller.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SDK `SDKResultMessage` has fields `usage.input_tokens`, `usage.output_tokens`, `total_cost_usd` [CITED: @anthropic-ai/claude-agent-sdk README, verified 2026-04-16] | §Pattern 1 | Dispatcher returns wrong `tokens` / `cost_usd` shape. Mitigated: Plan 01 Task 4 runs `npm view @anthropic-ai/claude-agent-sdk` + cross-checks source README before any Plan 02 task; mock tests pin the expected shape. |
| A2 | SDK `query()` accepts `options.abortController: AbortController` [CITED: SDK README §Cancellation] | §Pattern 2 | If option name differs (`signal` vs `abortController`), Pattern 2 bridge is wrong. Low-risk: README example is explicit; source-verified during Plan 02. |
| A3 | Bundled pricing numbers (Haiku 4-5: $0.25/$1.25 per M; Sonnet 4-6: $3/$15 per M; Opus 4-6: $15/$75 per M) are current as of 2026-04-16 [ASSUMED — based on Anthropic pricing page, NOT verified in this session] | §Standard Stack, Plan 04 | Wrong dollar estimates; user confusion. Mitigated by D-28 user override + Plan 04 task that fetches current values from anthropic.com during planning. |
| A4 | `NOTICES.md` is auto-included in npm tarball without `"files"` array change [VERIFIED: npm docs https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files — "Certain files are always included, regardless of settings: ... NOTICE(S) files"] | §Pattern 5 | If not auto-included, Phase 34 ships without license disclosure in tarball. Plan 01 Task 2 adds a smoke test: `npm pack --dry-run` must list `NOTICES.md`. |
| A5 | SDK `engines.node >= 18` matches CDS baseline [VERIFIED: npm view at research time] | §Standard Stack | If SDK bumps to Node 20+, CDS baseline breaks. Plan 01 Task 1 re-verifies `npm view @anthropic-ai/claude-agent-sdk engines` and escalates if mismatch. |
| A6 | `pnpm licenses list --prod --json` detects transitive copyleft licenses [CITED: pnpm docs] | §Pattern 5, Plan 01 | Miss GPL/AGPL in transitive. Mitigated: `pnpm licenses list` has been in pnpm since v7; cds repo uses pnpm 10+. |

**If this table is empty:** _(Not empty — assumptions present; Plan 01 addresses them.)_

---

## Open Questions

1. **Exact bundled pricing values as of 2026-04-16.**
   - What we know: Anthropic pricing page URL lists current rates; prior rates (Haiku 3.5: $1/$5 per M tokens; Haiku 4-5: $0.25/$1.25 — 75% decrease).
   - What's unclear: Whether Opus 4-6 was re-priced between v0.12 ship and Phase 34 start.
   - Recommendation: Plan 04 Task 1 fetches https://www.anthropic.com/pricing during planning (ephemeral, just to populate the bundled constants) and records the retrieval date in `pricing.ts` as a comment so future maintainers know when the values were locked.

2. **Should `Context.save()` write atomically (write-to-tmp + rename)?**
   - What we know: Pitfall 3 describes corruption scenario; atomic rename is POSIX-standard.
   - What's unclear: CONTEXT.md D-25 doesn't specify; Claude's Discretion.
   - Recommendation: Plan 03 implements atomic rename — same cost, strictly safer. Add a unit test that spawns two concurrent `save()` calls against the same file, verifies one succeeds and file is valid JSON.

3. **Should `dispatchAgent` default to any particular model if `opts.model` is omitted?**
   - What we know: D-17 types `model: 'haiku' | 'sonnet' | 'opus' | string` as required (no `?`).
   - What's unclear: Whether Plan 02 should throw for unknown alias in the alias table, or fall through to SDK and let the SDK throw.
   - Recommendation: Pass through to SDK (avoids double validation); SDK already rejects unknown model IDs with a clear error.

4. **Plan 02 naming: `agent-dispatcher.ts` vs `dispatch-agent.ts`.**
   - What we know: REQUIREMENTS.md SDK-02 says "`packages/cds-core/src/agent-dispatcher.ts`".
   - What's unclear: Nothing — the requirement dictates the name.
   - Recommendation: Use `agent-dispatcher.ts` exactly per REQUIREMENTS.md.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | SDK runtime | ✓ (assumed — Phase 33 monorepo runs on >=18) | 18+ | — |
| pnpm | Install SDK into `@cds/core` | ✓ (Phase 33 Plan 01 installed + pinned via `packageManager`) | 10.6.3 | — |
| TypeScript compiler | `@cds/core` tsc --build | ✓ (Phase 33 devDep) | 6.0.2 | — |
| vitest | Test runner | ✓ (Phase 33 devDep) | 4.1.4 | — |
| `@anthropic-ai/claude-agent-sdk` | dispatchAgent | ⏳ (installed in Plan 01 Task 3) | `^0.2.110` | — |
| ANTHROPIC_API_KEY | Only `INTEGRATION=1` live test | Not required for default test suite | — | Mock path (D-32) |
| Network access to api.anthropic.com | Only `INTEGRATION=1` live test | Not required for default test suite | — | Mock path (D-32) |

**Missing dependencies with no fallback:** None blocking. `ANTHROPIC_API_KEY` is only required when developer or release validator runs `INTEGRATION=1 pnpm test`.

**Missing dependencies with fallback:** `ANTHROPIC_API_KEY` + live API — mock-based test path (D-32) covers all default CI runs.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 (Phase 33 Plan 03 migration) |
| Config file | `packages/cds-core/vitest.config.ts` extends root via Phase 33 projects array |
| Quick run command | `pnpm --filter @cds/core vitest run` |
| Full suite command | `pnpm test` (root vitest aggregates all projects) |
| Integration suite command | `INTEGRATION=1 ANTHROPIC_API_KEY=sk-... pnpm --filter @cds/core vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SDK-01 | `NOTICES.md` at repo root exists, contains `@anthropic-ai/claude-agent-sdk` entry, lists all runtime deps with licenses | structural | `test -f NOTICES.md && grep -q '@anthropic-ai/claude-agent-sdk' NOTICES.md && grep -q 'Anthropic Commercial Terms of Service' NOTICES.md` | ❌ Wave 0 (Plan 01 creates) |
| SDK-01 | `packages/cds-core/package.json` has `@anthropic-ai/claude-agent-sdk` dependency | structural | `jq -r '.dependencies["@anthropic-ai/claude-agent-sdk"]' packages/cds-core/package.json` returns a semver range | ❌ Wave 0 (Plan 01) |
| SDK-01 | Root `package.json` DOES NOT depend on SDK (stays single-dep: `prompts`) | structural | `jq -r '.dependencies | keys | length' package.json` returns `1` | ✅ (Phase 33 D-03 preserved) |
| SDK-01 | REQUIREMENTS.md SDK-01 has correction note per D-15 | structural | `grep -q "Anthropic Commercial ToS" .planning/REQUIREMENTS.md` | ❌ Wave 0 (Plan 01) |
| SDK-01 | No transitive runtime dependency under GPL/AGPL/SSPL | structural | `pnpm licenses list --prod --json --filter @cds/core \| jq -r '[.["GPL-3.0"],.["AGPL-3.0"],.["SSPL-1.0"]] \| map(length) \| add' ` returns `0` or equivalent empty result | ❌ Wave 0 (Plan 01 Task 3) |
| SDK-02 | `dispatchAgent({ model: 'haiku', prompt })` returns `{ output, tokens, cost_usd }` against mock | unit | `pnpm --filter @cds/core vitest run agent-dispatcher.test.ts` | ❌ Wave 0 (Plan 02) |
| SDK-02 | `dispatchAgent` against live SDK returns non-zero `tokens.input` and `tokens.output` | integration | `INTEGRATION=1 pnpm --filter @cds/core vitest run agent-dispatcher.test.ts -t "live SDK"` | ❌ Wave 0 (Plan 02) |
| SDK-02 | `dispatchAgent` respects `AbortSignal` — aborts mid-iterator | unit | `pnpm --filter @cds/core vitest run agent-dispatcher.test.ts -t "abort"` | ❌ Wave 0 (Plan 02) |
| SDK-02 | Model aliases `'haiku'`/`'sonnet'`/`'opus'` resolve to current stable model IDs | unit | `pnpm --filter @cds/core vitest run models.test.ts` | ❌ Wave 0 (Plan 02) |
| CORE-01 | `Context` accumulates messages via `add()` | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "add accumulates"` | ❌ Wave 0 (Plan 03) |
| CORE-01 | `Context.save()` then `Context.load(sessionId)` roundtrips messages | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "save/load roundtrip"` | ❌ Wave 0 (Plan 03) |
| CORE-01 | `Context` persists to `~/.claude/cds-context-{sessionId}.json` | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "persist path"` (uses HOME redirect) | ❌ Wave 0 (Plan 03) |
| CORE-01 | `sessionId` resolution order (arg → env → uuid) | unit | `pnpm --filter @cds/core vitest run context.test.ts -t "sessionId resolution"` | ❌ Wave 0 (Plan 03) |
| CORE-02 | `CostTracker.record()` + `total()` aggregates per session | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "aggregation"` | ❌ Wave 0 (Plan 04) |
| CORE-02 | `~/.claude/anthropic-pricing.json` overrides bundled values | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "override"` (uses HOME redirect) | ❌ Wave 0 (Plan 04) |
| CORE-02 | Unknown model throws `UnknownModelError` | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "unknown model throws"` | ❌ Wave 0 (Plan 04) |
| CORE-02 | `dump()` renders human-readable output | unit | `pnpm --filter @cds/core vitest run cost-tracker.test.ts -t "dump format"` | ❌ Wave 0 (Plan 04) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @cds/core vitest run` (fast, single package)
- **Per wave merge:** `pnpm test` (full suite — includes Phase 33 baseline 928 root tests + all @cds/core tests)
- **Phase gate:** Full suite green AND `INTEGRATION=1 pnpm --filter @cds/core vitest run` green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `NOTICES.md` at repo root (Plan 01)
- [ ] `packages/cds-core/src/agent-dispatcher.ts` + `.test.ts` (Plan 02)
- [ ] `packages/cds-core/src/context.ts` + `.test.ts` (Plan 03)
- [ ] `packages/cds-core/src/cost-tracker.ts` + `.test.ts` (Plan 04)
- [ ] `packages/cds-core/src/pricing.ts` (Plan 04)
- [ ] `packages/cds-core/src/models.ts` (Plan 02)
- [ ] `packages/cds-core/src/errors.ts` (shared by all plans — Plan 02 creates; Plans 03/04 add subtypes)
- [ ] `packages/cds-core/src/index.ts` re-exports (Plan 04 final task, after all primitives exist)
- [ ] `.planning/REQUIREMENTS.md` SDK-01 correction note per D-15 (Plan 01)
- [ ] `packages/cds-core/package.json` dep on `@anthropic-ai/claude-agent-sdk` (Plan 01)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (SDK → Anthropic API via `ANTHROPIC_API_KEY`) | SDK reads env var directly; CDS never touches key |
| V3 Session Management | no | `sessionId` is CDS-internal (`~/.claude/cds-context-*.json`); no auth session |
| V4 Access Control | no | Local-only primitives; no multi-user surface |
| V5 Input Validation | yes (minimal) | `dispatchAgent` passes `prompt` through to SDK; no CDS-level validation; SDK handles |
| V6 Cryptography | no (no crypto primitives built) | `crypto.randomUUID()` is Node built-in; no hand-rolled crypto |
| V7 Error Handling | yes | `DispatchError`, `UnknownModelError`, `LicenseKeyError` typed; never log raw API keys |
| V8 Data Protection | yes | Conversation content in `~/.claude/cds-context-*.json` is user-local; file mode 0600 recommended |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leak via logged prompt/output | Information Disclosure | Dispatcher MUST NOT log request bodies at INFO level; any log line should redact `Bearer \|Authorization` patterns. Error messages from the SDK that include API endpoint URLs are acceptable; API keys must not appear. |
| Prompt injection via user-controlled prompt string | Tampering | Out of scope for Phase 34 primitives — dispatcher is transport-layer; Phase 36+ callers must sanitize user input before assembling prompts. Document in `agent-dispatcher.ts` JSDoc. |
| Session ID collision → cross-session data leak | Information Disclosure | Pitfall 3 mitigation: atomic write + `CLAUDE_SESSION_ID` docs |
| Malicious `~/.claude/anthropic-pricing.json` to manipulate cost display | Tampering | In-scope but low-risk: user-owned file on user's machine; worst case is user fooling themselves about cost. No mitigation needed beyond "don't load arbitrary JS". (We use `JSON.parse`, not `eval`.) |
| Supply chain: malicious SDK version | Tampering | Mitigated by `pnpm-lock.yaml` integrity hashes (Phase 33) + `pnpm audit --prod --audit-level high` in Plan 01 |
| License compliance (GPL transitive leaks into NOTICES.md unreviewed) | — (compliance) | Plan 01 Task 3 fails build on GPL/AGPL/SSPL transitive detection |
| File permissions on `~/.claude/cds-context-*.json` | Information Disclosure | `Context.save()` should `chmod 0600` after write (homedir is already 0755; per-file restriction is defense-in-depth) |

---

## Sources

### Primary (HIGH confidence)
- `@anthropic-ai/claude-agent-sdk` README — https://github.com/anthropics/claude-agent-sdk-typescript — `query()` signature, `SDKMessage` types, AbortController usage, cost/usage fields
- Anthropic Commercial Terms of Service — https://www.anthropic.com/legal/commercial-terms — license text for NOTICES.md reference
- pnpm `licenses list` docs — https://pnpm.io/cli/licenses — transitive license detection
- npm `package.json` docs — https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files — NOTICES.md auto-inclusion

### Secondary (MEDIUM confidence)
- Anthropic pricing page — https://www.anthropic.com/pricing — per-model USD per million tokens (fast-moving; verify at Plan 04 Task 1)

### Tertiary (LOW confidence — flagged for validation)
- Exact bundled pricing numbers current as of 2026-04-16 [ASSUMED] — Plan 04 Task 1 re-fetches

---

## Metadata

**Research scope:**
- Core technology: `@anthropic-ai/claude-agent-sdk`
- Ecosystem: Node.js built-ins (`fs/promises`, `crypto`, `os`, `path`)
- Patterns: NOTICES.md convention, AbortController bridging, pricing-table drift strategy, vitest mock for async iterators
- Pitfalls: INTEGRATION=1 gating, for-await short-circuit, sessionId collision, pricing drift, UnknownModelError visibility, transitive license unknowns

**Confidence breakdown:**
- Standard stack: HIGH — SDK version + engines verified; CDS toolchain already locked in Phase 33
- Architecture: HIGH — all four patterns derived from CONTEXT.md locked decisions + SDK README
- Pitfalls: HIGH — each pitfall has verification in the test map
- Code examples: HIGH — mock pattern matches vitest 4.x API; SDK usage matches README
- Pricing numbers: MEDIUM — specific dollar values [ASSUMED]; structure/strategy HIGH

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days — SDK is on semver-0.x, semi-fast-moving; re-verify version + engines before execute if gap)

---

*Phase: 34-sdk-integration-core-primitives*
*Research completed: 2026-04-16*
*Ready for planning: yes*
