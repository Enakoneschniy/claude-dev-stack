# Phase 36: Auto Session Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-16
**Phase:** 36-auto-session-capture
**Areas discussed:** Hook consolidation strategy, Haiku extraction prompt design, Transcript parsing strategy, Fail-silent + detached execution

---

## Pre-Discussion Investigation

Read `hooks/session-end-check.sh` — discovered it does 4 things, not 1: log-check, context.md update via update-context.mjs, NotebookLM sync trigger, vault auto-push. Any replacement must preserve all 4 or accept regression.

---

## Gray Area Selection

**User selected all 4:** Hook consolidation, Haiku extraction, Transcript parsing, Fail-silent execution.

---

## Hook Consolidation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Consolidate in one Node hook (Recommended) | All 4 Stop behaviors in session-end-capture.mjs | ✓ |
| Chain: new capture + keep legacy | 2 hooks parallel; race conditions on context.md | |
| Pure replace — lose legacy behaviors | NotebookLM sync + vault push break for users | |

**User's choice:** Consolidate in one Node hook.
**Notes:** Single TS-authored hook performs SQLite capture, context.md update, NotebookLM sync, vault push. Legacy .sh removed. update-context.mjs and notebooklm-sync-trigger.mjs imported, not duplicated.

---

## Haiku Extraction Prompt Design

| Option | Description | Selected |
|--------|-------------|----------|
| Rich observations + tool_use JSON (Recommended) | SDK-native tool call with JSON schema, type-safe | ✓ |
| Simple summary + entities list | Plain text regex-parsed, unreliable | |
| XML structured output | No runtime schema validation | |

**User's choice:** Rich observations + tool_use JSON.
**Notes:** `emit_observations` tool accepts summary + typed observations (6 types) + entities + relations. Cost budget $0.02/session soft cap. Model = 'haiku' alias (latest). Prompts in `@cds/core/src/capture/prompts.ts`.

---

## Transcript Parsing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| User msgs + assistant final text, smart truncate (Recommended) | Balanced signal/cost, tier-2 truncation for large sessions | ✓ |
| Chunked Haiku-summarize then combine | 3-5x cost, complex prompt chain | |
| User messages only (cheap) | Skips actual decisions — useless | |

**User's choice:** User msgs + assistant final text, smart truncate.
**Notes:** Include user messages, assistant text, tool summaries (name + first-line result). Edit/Write kept full, Read/Grep/Bash truncated at 200 chars. Head+tail truncation at 40k tokens when over budget. Parser in `@cds/core/src/capture/transcript.ts`.

---

## Fail-Silent + Detached Execution

| Option | Description | Selected |
|--------|-------------|----------|
| child_process.spawn detached + budget 60s (Recommended) | POSIX double-fork wrapper + AbortController timeout | ✓ |
| systemd/launchd-style background worker | Over-engineered daemon for v1.0 | |
| Blocking Stop hook + short budget 15s | Violates REQ "never block exit" | |

**User's choice:** child_process.spawn detached + budget 60s.
**Notes:** `.sh` wrapper double-forks Node. 60s AbortController budget. 3-tier error handling: silent (rate limit, no key, DB locked, missing transcript), log + continue (schema drift, malformed output, partial rollback), log + exit 1 (unexpected crash). No retries.

---

## Claude's Discretion

- SDK tool input_schema exact shape
- Number of Haiku-retry attempts on malformed tool_use (planner chooses 1 or 2)
- `cds-capture.log` rotation strategy
- `CDS_CAPTURE_DEBUG=1` debug flag (optional)
- `session-manager` SKILL.md description wording
- context.md session pointer format

## Deferred Ideas

- **Phase 37:** `sessions.search`, `sessions.timeline` MCP tools consuming captured data
- **Phase 38:** Reuse extraction pipeline for backfill, idempotency via filename slug
- **Phase 39:** Migration guide entry, `/cds-quick` shows capture stats
- **v1.1+:** Retry queue daemon, per-observation dedupe, user prompt override, metrics CLI

---

*Generated: 2026-04-16*
