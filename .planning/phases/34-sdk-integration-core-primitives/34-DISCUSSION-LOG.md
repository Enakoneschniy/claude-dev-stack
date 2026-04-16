# Phase 34: SDK Integration & Core Primitives - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 34-sdk-integration-core-primitives
**Areas discussed:** SDK license policy, dispatchAgent API surface, Context persistence model, CostTracker pricing source

---

## Pre-Discussion Investigation

During scout_codebase step, verified the SDK license via `npm view @anthropic-ai/claude-agent-sdk` + GitHub README. Result: **NOT MIT/Apache-2.0** as REQ-SDK-01 assumed. License = **Anthropic Commercial Terms of Service** (https://www.anthropic.com/legal/commercial-terms). This reframed the license discussion as policy-critical, not a rubber-stamp check.

---

## Gray Area Selection

**Question:** Какие gray areas обсудим для Phase 34?

| Option | Description | Selected |
|--------|-------------|----------|
| SDK license policy (ОБЯЗАТЕЛЬНО) | SDK is Commercial ToS, not MIT/Apache as SDK-01 assumed — decide policy | ✓ |
| dispatchAgent API surface | Streaming, abort, error typing, tool pass-through decisions | ✓ |
| Context persistence model | Auto-save vs explicit, session_id origin, file format | ✓ |
| CostTracker pricing source | No public API — bundled table vs SDK metadata vs scrape | ✓ |

**User's choice:** All four.

---

## SDK License Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Accept Commercial ToS + NOTICES.md (Recommended) | Internal infra dep, documented distinction, update SDK-01 wording | ✓ |
| MIT-only: switch to `@anthropic-ai/sdk` | Loses agent loop, subagents, tools — breaks Phase A architecture | |
| Hybrid: dual adapter | `dispatchAgent` (agent SDK) + `dispatchRaw` (MIT SDK) | |

**User's choice:** Accept Commercial ToS + NOTICES.md.
**Notes:** CDS already invokes Claude under the same ToS via `claude -p`. NOTICES.md at repo root documents the distinction. SDK-01 acceptance criterion updated via correction note, mirroring Phase 33 D-11/D-12 pattern. No fork of the SDK idea; full agent SDK capability is non-negotiable for Phase A architecture.

---

## dispatchAgent API Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Minimum + AbortSignal (Recommended) | `{model, prompt, system?, tools?, signal?, session_id?} → {output, tokens, cost_usd}` | ✓ |
| + streaming callback | Add `onChunk` callback — defer to Phase 39 | |
| + Result type (no throw) | Non-idiomatic for JS/TS, SDK throws anyway | |

**User's choice:** Minimum + AbortSignal.
**Notes:** AbortSignal is critical for Phase 36 Stop hook (session exit never blocks). session_id threads with Context/CostTracker. Tools = SDK-native pass-through (no CDS abstraction). Errors propagate via throw — callers wrap for fail-silent. Streaming variant deferred.

---

## Context Persistence Model

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit save() + env session_id (Recommended) | Predictable I/O, user-controlled persistence | ✓ |
| Auto-save on add() | N writes per turn, sync I/O blocks event loop | |
| In-memory only in Phase 34 | Defer persistence — but REQ CORE-01 explicit | |

**User's choice:** Explicit save() + env session_id.
**Notes:** `sessionId` resolution: explicit arg → `CLAUDE_SESSION_ID` env → `randomUUID()`. File format: JSON array with schema version. No compaction in Phase 34 — SDK handles per-call truncation.

---

## CostTracker Pricing Source

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled table + optional override (Recommended) | Hardcoded prices + `~/.claude/anthropic-pricing.json` override | ✓ |
| SDK-provided cost (skip file) | Depends on SDK emitting cost in response — not guaranteed | |
| Scrape docs.anthropic.com/pricing | Fragile HTML parsing, network dependency | |

**User's choice:** Bundled table + optional override.
**Notes:** Offline, deterministic, user-overridable. Patch releases of `@cds/core` refresh bundled table. `UnknownModelError` for unlisted models.

---

## Claude's Discretion

- `ConversationMessage` exact type shape (likely includes `tool_use_id` for Phase 36+)
- Exact bundled pricing numbers as of 2026-04-16 (planner fills with live values)
- `CostTracker.dump()` format — text vs JSON vs both via param
- Error class hierarchy (`DispatchError` base + specific subclasses)
- CI license drift detection (deferred to v1.1+)

## Deferred Ideas

- **Phase 36:** `lib/adr-bridge-session.mjs` refactor to use `dispatchAgent` (CAPTURE-05)
- **Phase 38:** Tools pass-through for Haiku entity extraction during backfill
- **Phase 39:** `dispatchAgentStream` variant for `/cds-quick` live UX
- **v1.1+:** `Context.compact()`, multi-provider adapter, license drift CI

---

*Generated: 2026-04-16*
