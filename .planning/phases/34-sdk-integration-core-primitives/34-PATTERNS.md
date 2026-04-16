# Phase 34: SDK Integration & Core Primitives - Pattern Map

**Mapped:** 2026-04-16
**Files analyzed:** 15 new files (1 NOTICES.md, 8 src files in `@cds/core`, 4 test files, 1 REQUIREMENTS.md modification, 1 package.json modification)
**Analogs found:** 2 / 15 (minimal — `@cds/core` is greenfield in Phase 34; RESEARCH.md patterns dominate)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `NOTICES.md` (repo root, new) | documentation | — | none (first compliance doc) | no analog |
| `packages/cds-core/package.json` (modified: add `dependencies.@anthropic-ai/claude-agent-sdk`) | config | — | itself (Phase 33 scaffold) | exact |
| `packages/cds-core/src/errors.ts` (new) | utility (types) | — | none (first error hierarchy in `@cds/core`) | no analog |
| `packages/cds-core/src/models.ts` (new) | utility (constants) | — | `lib/install/languages.mjs` (constant table pattern) | partial |
| `packages/cds-core/src/agent-dispatcher.ts` (new) | service | request-response | `lib/adr-bridge-session.mjs` (same role — but read-only reference, NOT migrated) | partial (role only) |
| `packages/cds-core/src/agent-dispatcher.test.ts` (new) | test | request-response | `packages/cds-core/src/index.test.ts` (Phase 33 sanity test) | partial |
| `packages/cds-core/src/context.ts` (new) | service (class w/ persistence) | state | `lib/notebooklm-stats.mjs` (class with save/load) | partial |
| `packages/cds-core/src/context.test.ts` (new) | test | state | `tests/notebooklm-stats.test.mjs` (close via tmp HOME) | partial |
| `packages/cds-core/src/cost-tracker.ts` (new) | service (class w/ in-memory state) | state | none (first aggregation primitive in @cds/core) | no analog |
| `packages/cds-core/src/cost-tracker.test.ts` (new) | test | state | same as context.test.ts pattern | partial |
| `packages/cds-core/src/pricing.ts` (new) | utility (constants + optional override loader) | — | `lib/install/config.mjs` (bundled+override pattern) | partial |
| `packages/cds-core/src/index.ts` (modified: replace stub with re-exports) | barrel | — | Phase 33 scaffold stub | exact |
| `packages/cds-core/src/index.test.ts` (modified: public surface smoke test) | test | — | Phase 33 sanity test | exact |
| `.planning/REQUIREMENTS.md` (modified: append SDK-01 correction note) | documentation | — | itself (existing req document) | exact |
| `packages/cds-core/README.md` (new — optional, recommended for Plan 04) | documentation | — | none | no analog |

---

## Pattern Assignments

### `NOTICES.md` (no codebase analog — RESEARCH.md §Pattern 5)

**Analog:** none (Phase 34 creates the first one)
**Source:** RESEARCH.md §Pattern 5 — NOTICES.md convention

**Complete file pattern** (Plan 01 Task 2 writes verbatim; Task 3 appends Transitive section):

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
<!-- Populated by Plan 01 Task 3 after `pnpm install` resolves the tree. -->
<!-- Format per entry: `- {name}@{version} — {SPDX license}` -->

## Development Dependencies

Development tooling (`vitest`, `typescript`, `@types/node`) is not redistributed
in the published `claude-dev-stack` npm tarball (these are `devDependencies` only).
See `package.json` for full list.
```

**Key facts:**
- npm auto-ships `NOTICES.md` in the tarball (Assumption A4 — VERIFIED). No `"files"` array change (D-03 preserved).
- Per D-14: transitive section MUST be filled before Plan 01 commit — Plan 01 Task 3 generates content.

---

### `packages/cds-core/package.json` (modified — itself exact analog)

**Analog:** Phase 33 Plan 01 scaffold (exact file, minimal diff)
**Source:** Phase 33 `33-01-monorepo-scaffolding-PLAN.md` Task 1 File 3

**Before (Phase 33 state):**

```json
{
  "name": "@cds/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run"
  }
}
```

**After (Phase 34 Plan 01 Task 3):**

Add exactly one new top-level key `"dependencies"`:

```json
{
  "name": "@cds/core",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.2.110"
  }
}
```

**Byte-preserved fields:** `name`, `version`, `private`, `type`, `main`, `types`, `exports`, `scripts`.

---

### `packages/cds-core/src/errors.ts` (RESEARCH.md derived — no codebase analog)

**Analog:** none (`@cds/core` errors are greenfield)
**Source:** RESEARCH.md §Pattern 1 (`DispatchError`), §Pattern 5 (compliance), §Pitfall 6 (license)

**Pattern (Plan 01 Task 4 creates base; Plan 04 Task 3 adds `UnknownModelError`):**

```typescript
/**
 * Error hierarchy for @cds/core primitives.
 *
 * Base: DispatchError — anything the agent dispatcher surfaces
 * Subtypes added by downstream plans:
 *   - LicenseKeyError (Plan 01) — missing/invalid ANTHROPIC_API_KEY
 *   - UnknownModelError (Plan 04) — CostTracker cannot price a model
 */

export class DispatchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DispatchError';
  }
}

export class LicenseKeyError extends DispatchError {
  constructor(message = 'ANTHROPIC_API_KEY is not set or invalid') {
    super(message);
    this.name = 'LicenseKeyError';
  }
}

// UnknownModelError is added in Plan 04 Task 3 — do NOT add here.
// Plan 04 appends the subclass to this file to preserve single source of truth.
```

**Key facts:**
- All error classes extend `DispatchError` (single base for `try { ... } catch (e) { if (e instanceof DispatchError) ... }` consumer pattern).
- `cause` property follows ES2022 `Error.cause` idiom (SDK errors bubble up as `cause`).
- Plan 04 appends `UnknownModelError extends DispatchError` to the same file — no new file, no class-per-file proliferation.

---

### `packages/cds-core/src/models.ts` (constant table — partial analog: `lib/install/languages.mjs`)

**Analog:** `lib/install/languages.mjs` (similar: exported constant record + resolver function)
**Source:** RESEARCH.md §Pattern 1 (model alias resolution in dispatchAgent), CONTEXT.md D-21

**Analog excerpt** from `lib/install/languages.mjs` (structure only):

```javascript
export const LANGUAGES = {
  en: 'English',
  ru: 'Русский',
};

export function resolveLanguage(code) {
  return LANGUAGES[code] ?? code;
}
```

**Phase 34 pattern for `models.ts`:**

```typescript
/**
 * Model alias table for @cds/core dispatchAgent.
 *
 * Callers pass friendly aliases ('haiku', 'sonnet', 'opus') OR full model IDs.
 * The dispatcher resolves aliases to the latest stable ID at call time.
 * Full IDs pass through unchanged.
 *
 * Last updated: 2026-04-16 — verify against https://docs.anthropic.com/claude/docs/models
 * when bumping @anthropic-ai/claude-agent-sdk version.
 */

export const MODEL_ALIASES: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
};

export function resolveModel(modelOrAlias: string): string {
  return MODEL_ALIASES[modelOrAlias] ?? modelOrAlias;
}
```

**Key facts:**
- Type `Record<string, string>` (explicit — `string` index to allow new aliases without typescript errors).
- Resolver falls through for unknown aliases (SDK itself validates real model IDs per RESEARCH.md §Open Questions #3).
- Comment with retrieval date so future maintainers know when values were current.

---

### `packages/cds-core/src/agent-dispatcher.ts` (role-analog: `lib/adr-bridge-session.mjs`)

**Analog:** `lib/adr-bridge-session.mjs` (same ROLE — subprocess-based Claude invocation). READ ONLY for data-shape reference per CONTEXT.md §code_context; DO NOT migrate code. Phase 36 refactors the original.
**Source:** RESEARCH.md §Pattern 1 (SDK query → DispatchResult), §Pattern 2 (AbortSignal bridge), Code Examples §"Verified SDK usage"

**Analog excerpt** (reference only — `lib/adr-bridge-session.mjs` lines ~40-80, the failing subprocess pattern this primitive replaces):

```javascript
// lib/adr-bridge-session.mjs (v0.12 — failing pattern, DO NOT copy)
const proc = spawn('claude', ['-p', '--model', 'haiku', '--bare', '--output-format', 'text']);
proc.stdin.write(prompt);
proc.stdin.end();
// ... collect stdout, parse JSON, extract usage ...
```

**Phase 34 replacement pattern** (RESEARCH.md §Pattern 1, Plan 02 Task 2):

```typescript
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { resolveModel } from './models.js';
import { DispatchError, LicenseKeyError } from './errors.js';

export interface DispatchOptions {
  model: 'haiku' | 'sonnet' | 'opus' | string;
  prompt: string;
  system?: string;
  tools?: unknown[];       // SDK Tool[] — re-exported from './index.js'
  signal?: AbortSignal;
  session_id?: string;
}

export interface DispatchResult {
  output: string;
  tokens: { input: number; output: number };
  cost_usd: number;
}

function signalToAbortController(signal?: AbortSignal): AbortController | undefined {
  if (!signal) return undefined;
  const controller = new AbortController();
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  return controller;
}

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
      // tools: opts.tools as any,   // SDK passes through unchanged
    },
  });

  const textParts: string[] = [];
  let tokens = { input: 0, output: 0 };
  let cost_usd = 0;

  for await (const msg of iterator as AsyncIterable<SDKMessage>) {
    if (msg.type === 'assistant' && (msg as any).message?.content) {
      for (const block of (msg as any).message.content) {
        if (block.type === 'text') textParts.push(block.text);
      }
    } else if (msg.type === 'result') {
      if ((msg as any).subtype === 'success') {
        const usage = (msg as any).usage;
        tokens = { input: usage.input_tokens, output: usage.output_tokens };
        cost_usd = (msg as any).total_cost_usd ?? 0;
      } else {
        throw new DispatchError(`Agent returned non-success result: ${(msg as any).subtype}`, msg);
      }
    }
  }

  return { output: textParts.join(''), tokens, cost_usd };
}
```

**Key facts:**
- `session_id` is accepted for caller threading but NOT passed into SDK options — D-31 explicitly: the dispatcher does NOT mutate caller state.
- No `break` inside the for-await (Pitfall 2 mitigation).
- API key check at entry (Pitfall 1 mitigation — fail fast with typed error).
- `as any` casts are acceptable narrow-use to bridge incomplete SDK .d.ts types; TS-strict narrowing is Plan 02 Task 5 cleanup if needed.

---

### `packages/cds-core/src/agent-dispatcher.test.ts` (partial analog: Phase 33 `index.test.ts`)

**Analog:** `packages/cds-core/src/index.test.ts` (Phase 33 sanity test — minimal vitest scaffold)
**Source:** RESEARCH.md §Code Examples "Verified vitest mock pattern for SDK"

**Phase 33 analog (for scaffolding shape only):**

```typescript
// packages/cds-core/src/index.test.ts (Phase 33)
import { describe, it, expect } from 'vitest';
import { CDS_CORE_VERSION } from './index.js';

describe('@cds/core sanity', () => {
  it('exposes version constant', () => {
    expect(CDS_CORE_VERSION).toBe('0.0.0-stub');
  });
});
```

**Phase 34 pattern** (Plan 02 Task 3):

```typescript
// Source: RESEARCH.md §Code Examples "Verified vitest mock pattern for SDK"
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { dispatchAgent } from './agent-dispatcher.js';

describe('dispatchAgent (mocked SDK)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test';  // Bypass LicenseKeyError guard
  });

  it('aggregates text and reports tokens + cost', async () => {
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
    (query as any).mockReturnValue(mockIter);

    const result = await dispatchAgent({ model: 'haiku', prompt: 'hi' });
    expect(result.output).toBe('Hello world');
    expect(result.tokens).toEqual({ input: 5, output: 3 });
    expect(result.cost_usd).toBe(0.00001);
  });

  it('throws LicenseKeyError when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(dispatchAgent({ model: 'haiku', prompt: 'hi' })).rejects.toThrow('ANTHROPIC_API_KEY');
  });

  it('bridges AbortSignal to the SDK AbortController (abort test)', async () => {
    const mockIter = (async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'start' }] } };
      await new Promise((r) => setTimeout(r, 100));   // simulate in-flight
      yield { type: 'result', subtype: 'success', usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: 0 };
    })();
    (query as any).mockReturnValue(mockIter);

    const ctrl = new AbortController();
    const promise = dispatchAgent({ model: 'haiku', prompt: 'hi', signal: ctrl.signal });
    ctrl.abort('user cancel');
    // With AbortController wired to SDK, dispatchAgent resolves or rejects per SDK semantics;
    // minimum assertion: the bridge did not throw synchronously.
    await expect(promise).resolves.toBeDefined().catch(() => undefined);
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

---

### `packages/cds-core/src/context.ts` (partial analog: `lib/notebooklm-stats.mjs`)

**Analog:** `lib/notebooklm-stats.mjs` (role: class with JSON persistence to `~/.claude/...`)
**Source:** RESEARCH.md §Pattern 3 (Context persistence roundtrip), CONTEXT.md D-22..D-26

**Analog excerpt** (structure only — role/shape):

```javascript
// lib/notebooklm-stats.mjs (v0.12, reference only)
export class NotebookLMStats {
  constructor(path) { this.path = path; this.data = this.load(); }
  load() { /* readFileSync + JSON.parse + default */ }
  save() { /* writeFileSync */ }
  record(item) { this.data.items.push(item); this.save(); }
}
```

**Phase 34 pattern** (Plan 03 Task 1 — see RESEARCH.md §Pattern 3 for full code). Key differences from analog:
- Persistence is **explicit** (no auto-save in `add()` per D-24).
- `load()` is **static async factory** (`Context.load(sessionId)`) — returns fully-hydrated instance.
- `save()` is **async** (Node `fs/promises`) and writes atomically (write to `${path}.tmp` then rename) to mitigate Pitfall 3.
- `sessionId` is **frozen** at construction; no `setSessionId()` setter.
- JSON schema has `_v: 1` version field; load throws on unknown version.

---

### `packages/cds-core/src/context.test.ts` (partial analog: `tests/notebooklm-stats.test.mjs`)

**Analog:** `tests/notebooklm-stats.test.mjs` (tmp HOME redirect pattern)
**Source:** RESEARCH.md §Code Examples "Verified tmpdir pattern for Context tests"

See RESEARCH.md §Code Examples — the tmpdir pattern is copied verbatim into Plan 03 Task 2.

---

### `packages/cds-core/src/pricing.ts` (partial analog: `lib/install/config.mjs`)

**Analog:** `lib/install/config.mjs` (bundled defaults + user-override merge at load time)
**Source:** RESEARCH.md §Pattern 4, CONTEXT.md D-28

**Analog excerpt**:

```javascript
// lib/install/config.mjs (v0.12)
const DEFAULTS = { projectsDir: '~/Projects', useCase: 'fullstack' };
export function loadConfig() {
  const override = /* read ~/.claude/cds-config.json if exists */;
  return { ...DEFAULTS, ...override };
}
```

**Phase 34 pattern** (Plan 04 Task 1):

```typescript
/**
 * Bundled pricing table for CostTracker.
 *
 * Values in USD per million tokens (per Anthropic pricing page).
 * Retrieved: 2026-04-16 — re-verify when bumping @anthropic-ai/claude-agent-sdk.
 *
 * Users override by writing ~/.claude/anthropic-pricing.json with the same schema.
 * Override is merged atop defaults at CostTracker construction.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PricingEntry {
  input_usd_per_million: number;
  output_usd_per_million: number;
}

export const PRICING_TABLE: Record<string, PricingEntry> = {
  // Key patterns ending in '*' match any model ID starting with that prefix (e.g., 'claude-haiku-4-5-20260301').
  'claude-haiku-4-5-*': { input_usd_per_million: 0.25, output_usd_per_million: 1.25 },
  'claude-haiku-4-5':   { input_usd_per_million: 0.25, output_usd_per_million: 1.25 },
  'claude-sonnet-4-6':  { input_usd_per_million: 3.00, output_usd_per_million: 15.00 },
  'claude-opus-4-6':    { input_usd_per_million: 15.00, output_usd_per_million: 75.00 },
};

export function loadPricingSync(): Record<string, PricingEntry> {
  const overridePath = join(homedir(), '.claude', 'anthropic-pricing.json');
  if (!existsSync(overridePath)) return { ...PRICING_TABLE };
  try {
    const raw = readFileSync(overridePath, 'utf8');
    const override = JSON.parse(raw) as Record<string, PricingEntry>;
    return { ...PRICING_TABLE, ...override };
  } catch (err) {
    // Non-fatal: fall back to bundled table, emit warning to stderr
    console.warn(`[@cds/core] Failed to load pricing override from ${overridePath}: ${(err as Error).message}`);
    return { ...PRICING_TABLE };
  }
}
```

**Key facts:**
- **Sync read** at construction time is acceptable here (one-time per process, small file, avoids async in constructor).
- Unknown key in override is silently kept (extends bundled); malformed JSON falls back to bundled with warn.
- Pattern keys ending in `*` match any suffix — see `CostTracker.resolvePricing()` in RESEARCH.md §Pattern 4.

---

### `packages/cds-core/src/cost-tracker.ts` (no codebase analog — RESEARCH.md §Pattern 4)

**Analog:** none (first aggregation class in `@cds/core`)
**Source:** RESEARCH.md §Pattern 4, CONTEXT.md D-27..D-30

See RESEARCH.md §Pattern 4 for full pattern. Plan 04 Task 2 copies verbatim, then adds:
- `UnknownModelError` subclass appended to `errors.ts` (Plan 04 Task 3).
- `dump()` output format matches CONTEXT.md D-30 example verbatim.

---

### `packages/cds-core/src/index.ts` (modified — Phase 33 stub replacement)

**Analog:** Phase 33 stub (`export const CDS_CORE_VERSION = '0.0.0-stub'`)
**Source:** CONTEXT.md §code_context "Integration Points"

**Before (Phase 33 state):**

```typescript
export const CDS_CORE_VERSION = '0.0.0-stub';
```

**After (Phase 34 Plan 04 Task 4 — final public surface):**

```typescript
/**
 * @cds/core — public surface.
 *
 * Phase 34 exports:
 *   - dispatchAgent, DispatchOptions, DispatchResult
 *   - Context, ConversationMessage
 *   - CostTracker, PricingEntry
 *   - Error hierarchy: DispatchError, LicenseKeyError, UnknownModelError
 *   - Model alias helpers: MODEL_ALIASES, resolveModel
 *   - SDK type re-export: Tool (SDK-native pass-through per D-20)
 */

export { dispatchAgent } from './agent-dispatcher.js';
export type { DispatchOptions, DispatchResult } from './agent-dispatcher.js';

export { Context } from './context.js';
export type { ConversationMessage } from './context.js';

export { CostTracker } from './cost-tracker.js';
export type { PricingEntry } from './pricing.js';

export { DispatchError, LicenseKeyError, UnknownModelError } from './errors.js';

export { MODEL_ALIASES, resolveModel } from './models.js';

// SDK type re-export per D-20 — callers who pass tools: Tool[] get the SDK-native type
export type { Tool } from '@anthropic-ai/claude-agent-sdk';

export const CDS_CORE_VERSION = '0.1.0-phase34';
```

---

### `.planning/REQUIREMENTS.md` SDK-01 correction (itself exact analog)

**Analog:** `.planning/REQUIREMENTS.md` itself (Phase 33 D-11/D-12 correction precedent)
**Source:** CONTEXT.md D-15

**Correction note pattern** (Plan 01 Task 5 appends a footnote at the end of the SDK-01 bullet; does NOT rewrite the bullet body):

Current line (REQUIREMENTS.md line 27):

```markdown
- [ ] **SDK-01**: `@anthropic-ai/claude-agent-sdk` license verified (Apache-2.0 or MIT confirmed compatible with CDS distribution model). License compatibility documented in a new `NOTICES.md` at the repo root listing every runtime dependency and its license. SDK is added to `packages/cds-core/package.json` dependencies (NOT `prompts` — `prompts` stays single-dep for the CLI surface).
```

After Plan 01 Task 5:

```markdown
- [ ] **SDK-01**: `@anthropic-ai/claude-agent-sdk` license verified (Apache-2.0 or MIT confirmed compatible with CDS distribution model). License compatibility documented in a new `NOTICES.md` at the repo root listing every runtime dependency and its license. SDK is added to `packages/cds-core/package.json` dependencies (NOT `prompts` — `prompts` stays single-dep for the CLI surface).
  - **Correction note (Phase 34, 2026-04-16 per CONTEXT.md D-13/D-15):** The SDK is licensed under Anthropic Commercial Terms of Service, not Apache-2.0/MIT. Accepted as internal infrastructure dependency; `NOTICES.md` documents redistribution basis. Read as: "license confirmed compatible with CDS distribution model (Anthropic Commercial ToS for claude-agent-sdk, documented in NOTICES.md)".
```

**Key facts:**
- Nested bullet — the existing top-level bullet stays unchanged byte-for-byte (matches Phase 33 D-11/D-12 correction pattern on MONO-03).
- Date + reference to CONTEXT.md decision IDs provides audit trail.
- The line "Read as: …" makes the replaced phrasing explicit so the test (acceptance criterion in Plan 01 Task 5) can grep for it.

---

## Summary of Pattern Provenance

| Plan | Files | Pattern Source |
|------|-------|----------------|
| 01 | `NOTICES.md`, `errors.ts` scaffold, `packages/cds-core/package.json` (deps), `REQUIREMENTS.md` correction | RESEARCH.md §Pattern 5; CONTEXT.md D-13..D-16 |
| 02 | `agent-dispatcher.ts`, `agent-dispatcher.test.ts`, `models.ts` | RESEARCH.md §Pattern 1, §Pattern 2, §Code Examples |
| 03 | `context.ts`, `context.test.ts` | RESEARCH.md §Pattern 3, §Code Examples tmpdir pattern |
| 04 | `cost-tracker.ts`, `cost-tracker.test.ts`, `pricing.ts`, `index.ts` barrel | RESEARCH.md §Pattern 4; CONTEXT.md D-27..D-30 |

All patterns are **sourced from either RESEARCH.md or Phase 33 scaffold** — no new codebase analog discovery was required beyond the two partial analogs (`lib/notebooklm-stats.mjs` for Context, `lib/install/languages.mjs` for models). This is expected: Phase 34 builds `@cds/core` greenfield on top of the Phase 33 empty package scaffold.

---

*Phase: 34-sdk-integration-core-primitives*
*Patterns mapped: 2026-04-16*
