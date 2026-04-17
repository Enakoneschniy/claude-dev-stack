# Phase 46: SDK Dispatch + DEMO-01 Fix — Pattern Map

**Generated:** 2026-04-17

---

## Files to Create

### `packages/cds-core/src/credential-resolver.ts` (NEW)

**Role:** Authentication layer — resolves API credentials from multiple sources with fallback chain.
**Data flow:** Called by `agent-dispatcher.ts` before SDK `query()`. Returns resolved API key string.
**Closest analog:** `packages/cds-core/src/agent-dispatcher.ts` lines 192-203 (`isInsideClaudeCode()`) — similar probe-and-fallback pattern.

**Pattern excerpt from analog:**
```typescript
// packages/cds-core/src/agent-dispatcher.ts
function isInsideClaudeCode(): boolean {
  try {
    const r = execFileSync('claude', ['--version'], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000,
    });
    return r.length > 0;
  } catch {
    return false;
  }
}
```

### `packages/cds-core/src/credential-resolver.test.ts` (NEW)

**Role:** Unit tests for credential resolver.
**Closest analog:** `packages/cds-core/src/agent-dispatcher.test.ts` — uses vitest, mocks env vars.

---

## Files to Modify

### `packages/cds-core/src/agent-dispatcher.ts`

**Role:** SDK dispatch wrapper. Currently has inline ANTHROPIC_API_KEY check + isInsideClaudeCode fallback.
**Change:** Replace lines 102-109 (inline auth check) with call to `resolveCredential()`.

**Current pattern (to replace):**
```typescript
export async function dispatchAgent(opts: DispatchOptions): Promise<DispatchResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (isInsideClaudeCode()) {
      return dispatchViaClaude(opts);
    }
    throw new LicenseKeyError();
  }
  // ... SDK query() call
}
```

### `packages/cds-core/src/errors.ts`

**Role:** Error hierarchy for @cds/core.
**Change:** Add `CredentialError` class extending `CdsCoreError`.

**Existing pattern:**
```typescript
export class LicenseKeyError extends DispatchError {
  constructor(message = 'ANTHROPIC_API_KEY is missing or invalid') {
    super(message);
  }
}
```

### `packages/cds-core/src/index.ts`

**Role:** Public barrel export.
**Change:** Add `resolveCredential` and `CredentialError` exports.

**Existing pattern:**
```typescript
export { DispatchError, LicenseKeyError, UnknownModelError } from './errors.js';
```

### `skills/cds-quick/SKILL.md`

**Role:** Claude Code skill definition for `/cds-quick`.
**Change:** Replace `Agent()` dispatch with Bash CLI dispatch through `claude-dev-stack quick`.

**Current content:**
```markdown
Agent({
  description: "cds-quick one-shot task",
  model: "haiku",
  prompt: "..."
})
```

### `tests/skill-cds-quick.test.mjs`

**Role:** Structural tests for `/cds-quick` skill.
**Change:** Update assertions from "uses Agent tool" to "uses Bash CLI dispatch".

**Current assertion pattern:**
```javascript
it('body uses Agent tool with haiku model', () => {
  // ... checks for Agent() in skill body
});
```

### `packages/cds-cli/src/quick.ts`

**Role:** CLI body for one-shot agent dispatch.
**Change:** Minor — use `result.cost_usd` from `dispatchAgent()` directly instead of running parallel `CostTracker`. Simplifies cost reporting path.

**Current pattern:**
```typescript
let result: { output: string; tokens: { input: number; output: number } };
// ... dispatches ...
tracker.record({ model: resolveModel(opts.model), tokens: result.tokens });
const cost = tracker.total();
```

**Target pattern:**
```typescript
let result: DispatchResult; // includes cost_usd directly
// ... dispatches ...
// Use result.cost_usd directly
```

---

## PATTERN MAPPING COMPLETE
