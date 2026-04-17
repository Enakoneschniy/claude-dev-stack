# Phase 46: SDK Dispatch + DEMO-01 Fix — Research

**Researched:** 2026-04-17
**Phase goal:** `/cds-quick` dispatches through CLI `quick.ts` and displays cost, closing the v1.0 DEMO-01 partial; credential resolver supports three auth fallback paths.

---

## 1. Current State Analysis

### 1a. `/cds-quick` Skill (DEMO-01 Partial)

**File:** `skills/cds-quick/SKILL.md`

**Current behavior:** The skill dispatches via `Agent({ model: "haiku", prompt: ... })` — a Claude Code built-in subagent call. This bypasses:
- `packages/cds-cli/src/quick.ts` entirely
- The `dispatchAgent()` function in `@cds/core`
- `CostTracker` — so no `cost_usd` is surfaced

**Expected behavior (HARD-04):** `/cds-quick` must dispatch through `packages/cds-cli/src/quick.ts` which calls `dispatchAgent()` from `@cds/core`, then prints `cost_usd` in the response.

**Test expectations (already in place):** `tests/skill-cds-quick.test.mjs` currently asserts the skill uses `Agent tool with haiku model`. These tests must be updated after the skill is rewritten.

### 1b. CLI Entry Point

**File:** `bin/cli.mjs`

The `case 'quick':` path already correctly imports from `resolveDistPath('cli/quick.js')` and calls `quick.main(args.slice(1))`. The CLI dispatch pipeline works:

```
bin/cli.mjs → packages/cds-cli/dist/quick.js → dispatchAgent() (@cds/core)
```

### 1c. quick.ts Cost Display

**File:** `packages/cds-cli/src/quick.ts`

`quick.ts` already displays cost in both modes:
- JSON: `{ output, cost, sessionId }` where `cost` comes from `tracker.total()`
- Text: `── cost: $X.XXXX · session: {id}`

However, `quick.ts` currently uses a **parallel CostTracker** instead of the `cost_usd` returned directly by `dispatchAgent()`. The `DispatchResult` already has `cost_usd` as a field (from `agent-dispatcher.ts` line 64). The tracker duplicates this calculation using the pricing table. For DEMO-01, both paths produce equivalent results. The current approach works but is redundant.

### 1d. Credential Resolution

**File:** `packages/cds-core/src/agent-dispatcher.ts`

**Current auth chain (2 steps):**
1. Check `process.env.ANTHROPIC_API_KEY` → use SDK `query()` directly
2. If missing, check `isInsideClaudeCode()` → fall back to `claude -p` subprocess

**Missing (HARD-05):** Three-step fallback chain:
1. OAuth token (from Claude Code session / stored OAuth credentials)
2. API key (from `ANTHROPIC_API_KEY` env var)
3. `ANTHROPIC_API_KEY` env var (same as #2 — the requirement description implies a third path)

Re-reading HARD-05: "Credential resolver tries OAuth token first, then API key, then `ANTHROPIC_API_KEY` env var." This suggests:
1. **OAuth token** — extracted from Claude Code's stored OAuth session
2. **API key** — a project-local or vault-stored API key (not env var)
3. **`ANTHROPIC_API_KEY` env var** — the environment variable

The distinction between #2 and #3: API key could be stored in a config file (e.g., `~/.claude/credentials.json` or vault), while #3 is the plain env var.

### 1e. Cross-Platform OAuth Bridge (Success Criterion 3)

The success criteria require OAuth→API key bridge to work on Linux (not just macOS Keychain). Currently, `isInsideClaudeCode()` checks if `claude --version` succeeds — this is a Claude Code CLI availability check, not OAuth extraction.

For Linux compatibility, the credential resolver should NOT depend on macOS Keychain but instead:
- Read OAuth tokens from Claude Code's known filesystem paths (e.g., `~/.claude/` config files)
- Use platform-agnostic credential storage

---

## 2. Implementation Approach

### 2a. Skill Rewrite Strategy

The `/cds-quick` skill must switch from `Agent()` to Bash CLI invocation:

```bash
Bash("claude-dev-stack quick \"$ARGUMENTS\"")
```

This routes through `bin/cli.mjs` → `quick.ts` → `dispatchAgent()` → cost display.

**Key considerations:**
- The skill runs inside Claude Code, so `bin/cli.mjs` may need `CDS_DEV=1` for development mode
- Or use `npx claude-dev-stack quick` for the installed npm package path
- The Bash approach gives real terminal output including cost line

### 2b. Credential Resolver Architecture

Create a new `credential-resolver.ts` module in `@cds/core`:

```typescript
interface ResolvedCredential {
  type: 'oauth' | 'api-key-stored' | 'api-key-env';
  apiKey: string;
  source: string; // human-readable provenance for logging
}

async function resolveCredential(): Promise<ResolvedCredential>
```

**Fallback chain:**
1. **OAuth token:** Check `~/.claude/` for stored OAuth credentials. On macOS, could also check Keychain. On Linux, filesystem only.
2. **Stored API key:** Check `~/.claude-dev-stack/credentials.json` or vault config for a stored API key.
3. **Environment variable:** `process.env.ANTHROPIC_API_KEY`

If all three fail, throw a `CredentialError` with a clear message listing all attempted sources.

### 2c. Integration into agent-dispatcher.ts

Replace the current two-step check with:

```typescript
const cred = await resolveCredential();
// Use cred.apiKey to set up SDK query() options
```

The `ANTHROPIC_API_KEY` environment variable must still be set for the SDK's `query()` function to work — so the resolver sets `process.env.ANTHROPIC_API_KEY` temporarily if it resolves from OAuth or stored key.

### 2d. Linux OAuth Extraction

Claude Code stores session data in `~/.claude/`. Potential paths:
- `~/.claude/oauth_token` (if exists)
- `~/.claude/config.json` with OAuth credentials
- `~/.claude/credentials` file

The exact path must be discovered by examining Claude Code's storage format. If no direct token file exists, the resolver can use `claude auth status` as a probe and extract the API key from Claude Code's auth context.

**Docker UAT note:** The Docker environment must have Claude Code installed or mock the credential files for testing.

---

## 3. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/cds-core/src/credential-resolver.ts` | Create | Three-step credential fallback chain |
| `packages/cds-core/src/credential-resolver.test.ts` | Create | Unit tests for each fallback path |
| `packages/cds-core/src/agent-dispatcher.ts` | Modify | Use `resolveCredential()` instead of inline `ANTHROPIC_API_KEY` check |
| `packages/cds-core/src/index.ts` | Modify | Export `resolveCredential` |
| `packages/cds-core/src/errors.ts` | Modify | Add `CredentialError` class |
| `skills/cds-quick/SKILL.md` | Modify | Rewrite to dispatch through CLI |
| `tests/skill-cds-quick.test.mjs` | Modify | Update assertions for CLI dispatch |
| `packages/cds-cli/src/quick.ts` | Modify | Use `result.cost_usd` directly instead of parallel CostTracker |

---

## 4. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Claude Code OAuth token storage format undocumented | Can't extract OAuth token on Linux | Probe with `claude auth status` subprocess; fall through to API key paths |
| `claude-dev-stack quick` not on PATH in skill context | Skill invocation fails | Use relative path or `npx` for installed package |
| SDK `query()` requires `ANTHROPIC_API_KEY` env var | Can't pass credential from resolver directly | Temporarily set `process.env.ANTHROPIC_API_KEY` before SDK call |
| Docker UAT environment may not have Claude Code | Can't test OAuth path in Docker | Mock OAuth credentials in test; test Linux filesystem path |

---

## 5. Validation Architecture

### Unit Tests
- Credential resolver: mock each source (OAuth file, stored key file, env var), verify fallback order
- Credential resolver: all sources fail → CredentialError with descriptive message
- agent-dispatcher: uses resolveCredential() output

### Integration Tests
- `/cds-quick "hello"` returns output with cost_usd > 0 (requires API key)
- JSON mode returns `{ output, cost, sessionId }` with cost object containing cost_usd

### UAT
- Docker environment with only env var → works
- Docker environment with stored credential file → works
- Docker environment with no credentials → clear error message

---

## RESEARCH COMPLETE
