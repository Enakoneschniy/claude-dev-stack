# Phase 46: SDK Dispatch + DEMO-01 Fix - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-17
**Phase:** 46-sdk-dispatch-demo-01-fix
**Areas discussed:** Credential resolver, Cost display, Error handling

---

## Credential Resolver

| Option | Description | Selected |
|--------|-------------|----------|
| Standard chain (Recommended) | OAuth (Keychain/keyring) → API key file → env var. First hit wins. | ✓ |
| Simpler: env + file only | Skip OAuth. ANTHROPIC_API_KEY → ~/.anthropic/api_key. | |
| You decide | Claude picks. | |

**User's choice:** Standard chain (Recommended)

## Cost Display

| Option | Description | Selected |
|--------|-------------|----------|
| Footer line (Recommended) | After result: `└ Cost: $0.0042 (1.2K input + 0.8K output tokens)` | ✓ |
| Inline with result | Embed cost in response body. | |
| You decide | Claude picks. | |

**User's choice:** Footer line (Recommended)

## Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Actionable guide (Recommended) | Show tried paths + fix instructions. Platform-specific hints. | ✓ |
| Generic error | Simple one-liner. | |
| You decide | Claude picks. | |

**User's choice:** Actionable guide (Recommended)

## Deferred Ideas

- Windows credential resolver — v1.2
- Credential rotation/refresh — v1.2
