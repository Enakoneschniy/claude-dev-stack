# Phase 46: SDK Dispatch + DEMO-01 Fix - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix `/cds-quick` to dispatch through CLI `quick.ts` instead of calling `Agent(haiku)` directly (closing DEMO-01 partial from v1.0). Implement a credential resolver with three-path fallback (OAuth → API key → env var) that works cross-platform. Display cost_usd in the response footer.

</domain>

<decisions>
## Implementation Decisions

### Credential Resolver
- **D-01:** Three-path fallback chain, first hit wins:
  1. **OAuth token:** macOS → `security find-generic-password` from Keychain. Linux → `secret-tool lookup` from GNOME keyring. Windows → deferred to v1.2.
  2. **API key file:** Read from `~/.anthropic/api_key` (plain text file, one line).
  3. **Environment variable:** `ANTHROPIC_API_KEY` env var.
- **D-02:** Credential resolver is a standalone module in `@cds/core` (e.g., `src/credentials.ts`). Not in `@cds/cli` — other packages may need it.
- **D-03:** Resolver caches the resolved key for the process lifetime (no re-reading on every dispatch). Cache invalidation is process restart.

### Cost Display
- **D-04:** Cost shown as a footer line after the task result: `└ Cost: $0.0042 (1.2K input + 0.8K output tokens)`. Uses CostTracker formatting already built in Phase 34.
- **D-05:** If cost is $0.00 (e.g., cached response), still show the line with "$0.00" — transparency matters.

### Error Handling
- **D-06:** When all 3 credential paths fail, show an actionable guide listing which paths were tried and how to fix each:
  ```
  ✗ No API key found. Checked:
    1. OAuth (macOS Keychain) — not found
    2. ~/.anthropic/api_key — file not found
    3. ANTHROPIC_API_KEY env — not set

  Fix: Set ANTHROPIC_API_KEY=sk-ant-... or run `claude setup-token` for OAuth.
  ```
- **D-07:** Each failed path shows the specific reason (not found, permission denied, invalid format) — not just "not found".

### /cds-quick Routing
- **D-08:** The `/cds-quick` skill routes through `packages/cds-cli/src/quick.ts` which uses `dispatchAgent()` from `@cds/core`. The skill no longer calls `Agent(haiku)` directly.
- **D-09:** `quick.ts` uses the credential resolver to obtain the API key, creates a CostTracker, dispatches the agent, then prints the result + cost footer.

### Claude's Discretion
- Exact Keychain service name and account for OAuth token lookup
- Whether `secret-tool` is the right Linux keyring CLI (vs `pass` or `kwallet`)
- Error message formatting details beyond the template above
- Test strategy for credential resolver (mock filesystem + env vars)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Primitives
- `packages/cds-core/src/agent-dispatcher.ts` — dispatchAgent() that quick.ts will call
- `packages/cds-core/src/cost-tracker.ts` — CostTracker for cost_usd display
- `packages/cds-core/src/errors.ts` — LicenseKeyError for missing credentials

### CLI
- `packages/cds-cli/src/quick.ts` — Current /cds-quick implementation (needs rewrite)
- `bin/cli.mjs` — CLI router

### Research
- `.planning/research/PITFALLS.md` — OAuth→API key bridge has 3 documented upstream failure modes
- `.planning/research/FEATURES.md` — DEMO-01 closure details

### v1.0 Tech Debt
- `.planning/PROJECT.md` § "Known tech debt" — DEMO-01 partial description

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dispatchAgent()` in agent-dispatcher.ts — Phase 34 primitive. quick.ts wraps this.
- `CostTracker` — already formats cost_usd. Footer line reuses its output.
- `LicenseKeyError` — existing error for missing API key.

### Established Patterns
- `@cds/core` exports through `src/index.ts` barrel.
- Error classes extend base errors with `this.name` set in constructor.
- Tests use vitest with mocked dependencies.

### Integration Points
- `/cds-quick` skill file — needs to call `quick.ts` instead of `Agent(haiku)`
- `@cds/core/src/index.ts` — export credential resolver

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard credential resolution pattern.

</specifics>

<deferred>
## Deferred Ideas

- **Windows credential resolver** — deferred to v1.2 (needs `wincred` or `dpapi`)
- **Credential rotation / refresh** — process-lifetime cache is sufficient for v1.1

</deferred>

---

*Phase: 46-sdk-dispatch-demo-01-fix*
*Context gathered: 2026-04-17*
