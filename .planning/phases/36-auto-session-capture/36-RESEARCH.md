# Phase 36: Auto Session Capture - Research

**Researched:** 2026-04-16
**Domain:** Claude Code Stop-hook integration with Claude Agent SDK tool_use extraction, POSIX double-fork detach, SQLite Tier 2 writes
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (NON-NEGOTIABLE)
- **D-51** — Single consolidated Node hook `hooks/session-end-capture.mjs`; no chained `.sh` scripts.
- **D-52** — Legacy `hooks/session-end-check.sh` is **removed** by wizard, not kept alongside.
- **D-53** — `hooks/notebooklm-sync-trigger.mjs` is **imported** (invoked as subprocess), not duplicated.
- **D-54** — `hooks/update-context.mjs` / `lib/session-context.mjs::updateContextHistory` **imported** (not inlined) — substantive logic.
- **D-55** — Haiku extraction via SDK `tool_use` with typed JSON schema (`emit_observations`), NOT XML/regex.
- **D-56** — 6 canonical observation types initial set; schema open-ended at DB level.
- **D-57** — Model alias `'haiku'` (not pinned), resolved via Phase 34 D-21 alias table.
- **D-58** — $0.02/session soft cap via `CostTracker`; pre-flight truncate, post-flight log.
- **D-59** — Prompts live in `packages/cds-core/src/capture/prompts.ts` (versioned, isolated from hook).
- **D-60** — Transcript source `~/.claude/projects/{slug}/{session_id}.jsonl`; silent exit if env missing.
- **D-61** — Include user msgs + assistant text + tool summaries (Read/Grep/Bash truncated 200 chars; Edit/Write full). Tier-2 head+tail truncation (20 first + 30 last, 40k token cap).
- **D-62** — Parser in `packages/cds-core/src/capture/transcript.ts`; unit-testable.
- **D-63** — Read jsonl as-is at Stop time; late appends missed (accepted).
- **D-64** — POSIX double-fork wrapper `hooks/session-end-capture.sh` runs Node detached, returns <10ms.
- **D-65** — 60s `AbortController` timeout, signal passed to dispatchAgent + DB writes.
- **D-66** — 3-tier error handling: silent (no key / missing transcript / rate limit / DB busy / opted-out) | log+continue (schema drift, malformed output, rollback) | log+exit 1 (unexpected crash).
- **D-67** — No retries.
- **D-68** — Wizard `lib/install/hooks.mjs` replaces `session-end-check.sh` entries with `session-end-capture.sh`. Both wrapper + .mjs copied to `~/.claude/hooks/`.
- **D-69** — Idempotent wizard; warn on custom Stop hooks, do not touch, add alongside.
- **D-70** — `skills/session-manager/SKILL.md` description narrowed to "fallback only". File stays.
- **D-71** — Hook imports `dispatchAgent`, `CostTracker` from `@cds/core`. Stateless per invocation. `Context` class not persisted.
- **D-72** — `openSessionsDB(projectPath)` where `projectPath = process.env.CLAUDE_PROJECT_DIR || process.cwd()`. Auto-migrate per Phase 35 D-37.

### Claude's Discretion
- Exact `emit_observations` `input_schema` JSON Schema draft (draft-07 recommended).
- Retry count on malformed tool_use: **1 retry** (cost-conservative default).
- `cds-capture.log` rotation: rotate at 1 MB, keep last 3 (planner default).
- `CDS_CAPTURE_DEBUG=1` env flag: exposed (turns silent errors to stderr for local dev).
- Session pointer format in context.md: `## Recent Sessions\n- {YYYY-MM-DD} — [{sessionId.slice(0,8)}] {summary}`.
- `session-manager` SKILL.md description wording (planner drafts).

### Deferred Ideas (OUT OF SCOPE)
- Phase 37: `sessions.search` / `sessions.timeline` MCP tools.
- Phase 38: Backfill markdown → SQLite.
- Phase 39: `/cds-quick` demo, migration guide.
- v1.1+: retry queue daemon, per-observation dedupe, user prompt override, metrics CLI.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stop hook trigger | Claude Code runtime | — | Claude Code fires `Stop` event + env vars |
| POSIX detach wrapper | Shell (`sh`) | — | Cross-platform double-fork idiom for orphaning |
| Transcript parsing | Node runtime (`@cds/core`) | — | JSONL parsing, message shaping |
| LLM extraction | Claude Agent SDK | Anthropic API | tool_use with input_schema validation |
| Cost accounting | `@cds/core::CostTracker` | — | Phase 34 primitive |
| SQLite persistence | `@cds/core::vault::sessions` | better-sqlite3 | Phase 35 API; WAL + transactions |
| context.md pointer | `lib/session-context.mjs` | node:fs | Existing module, imported directly |
| NotebookLM sync | `hooks/notebooklm-sync-trigger.mjs` | `notebooklm` CLI | Invoked as subprocess via `child_process.spawn` |
| Vault git push | `git` via `child_process.spawn` (NOT exec) | — | Retained from legacy — spawn with argv array, no shell interpolation |
| Wizard registration | `lib/install/hooks.mjs` | fs/JSON | Project-scoped `.claude/settings.json` |

Single-runtime hook process: after wrapper detaches, all capture work runs in one Node process.
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 36 replaces the v0.12 bash Stop-hook pipeline (which used a broken `claude -p --bare` subprocess for ADR extraction) with a consolidated Node-based Stop hook that leverages Phase 34's `dispatchAgent` and Phase 35's `sessions.ts` API. The critical win is moving from 4 loosely-chained Stop-hook scripts (log-check, context.md update, NotebookLM sync, vault push) to a single typed hook that performs all four responsibilities plus SQLite-backed structured observation capture.

The Claude Agent SDK's tool_use mechanism with `input_schema` validation is the enabling primitive: Haiku is prompted to emit a single `emit_observations` tool call with a typed JSON payload. The SDK enforces the schema boundary — malformed output either forces one internal retry or surfaces as a typed error. This replaces ad-hoc XML/regex parsing that was the source of ADR-02 flakiness.

POSIX double-fork detach (`(node script.mjs >/dev/null 2>&1 &) &` + `disown`) is the battle-tested pattern used by the existing `notebooklm-sync-trigger.mjs` — the wrapper exits in ~10 ms, the Node process orphans into background, Claude Code's Stop event unblocks instantly.

**Primary recommendation:** Ship the wrapper + .mjs pair. Put all domain logic (transcript parsing, prompt, observation types) in `@cds/core/src/capture/`. Keep the hook script thin (~200 lines) — it's an orchestrator, not a library. Use `child_process.spawn` with argv arrays for all subprocess calls (git, notebooklm trigger); NEVER use `execSync` with interpolated strings (shell-injection risk).
</research_summary>

<standard_stack>
## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | via `@cds/core` (Phase 34 pin) | Agent loop + tool_use | Phase 34 D-17 wraps it; Phase 36 doesn't import SDK directly — uses `dispatchAgent` |
| `better-sqlite3` | via `@cds/core` (Phase 35 pin) | SQLite writes | Phase 35 D-34 sync API chosen for transaction ergonomics |
| `@cds/core` | `workspace:*` | Primitives (dispatch, cost, vault) | Internal consolidation layer — Phase 36 is first real consumer of all three |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node stdlib `fs/promises` | Node 20+ | jsonl read + log writes | All I/O inside Node hook |
| Node stdlib `node:path` | Node 20+ | Path resolution | projectPath + slug derivation |
| Node stdlib `node:os` | Node 20+ | `homedir()` for `~/.claude/` + `~/vault/` paths | Portable home resolution |
| Node stdlib `AbortController` | Node 20+ | 60s timeout | Signal passed to every async call |
| Node stdlib `child_process.spawn` | Node 20+ | git + notebooklm-sync subprocess | NEVER `execSync` with string interpolation — use argv arrays |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SDK `tool_use` | Prompt Haiku for XML/JSON in text | No schema enforcement; ADR-02 failure mode repeats |
| POSIX double-fork | `systemd --user` / launchd | Platform-specific; user has no systemd service to run |
| `dispatchAgent` | `fetch` against Messages API directly | Re-implements token accounting + model aliasing; violates D-71 |
| `openSessionsDB` caching (Phase 35 D-49) | Open DB per invocation | Redundant migrations + file-handle churn |
| `execSync('git ...')` | `spawn('git', [args...])` | spawn avoids shell interpolation; safer on user paths |

### Installation
No new dependencies — everything is supplied by Phase 34 (dispatchAgent) and Phase 35 (sessions.ts).

```bash
# No-op — pnpm install at repo root already resolves @cds/core workspace link.
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code session ends (user presses Enter on "done")     │
└───────────────────────┬─────────────────────────────────────┘
                        │ Stop event, env: CLAUDE_SESSION_ID, CLAUDE_PROJECT_DIR
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ .claude/settings.json Stop hook list                        │
│  → bash ~/.claude/hooks/session-end-capture.sh              │
└───────────────────────┬─────────────────────────────────────┘
                        │ ~10 ms: wrapper double-forks Node, returns exit 0
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Background Node process: session-end-capture.mjs            │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 1. Early-exit guards (D-66 silent tier):           │     │
│  │    - CLAUDE_SESSION_ID set? → else exit 0          │     │
│  │    - Transcript file exists? → else exit 0         │     │
│  │    - cds-capture-config.json enabled? → else 0     │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 2. Parse transcript (@cds/core/capture/transcript) │     │
│  │    - Read jsonl → filter → shape messages          │     │
│  │    - Pre-flight token estimate                     │     │
│  │    - If > budget: apply tier-2 head+tail truncate  │     │
│  │    - Return { systemPrompt, userPrompt }           │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 3. dispatchAgent (Phase 34 D-17)                   │     │
│  │    - model: 'haiku', tools: [emitObservations]     │     │
│  │    - signal: AbortController (60s)                 │     │
│  │    - session_id: CLAUDE_SESSION_ID                 │     │
│  │    - returns { output, tokens, cost_usd }          │     │
│  │    - on throw → tier-2/3 error handler             │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 4. Parse tool_use payload (schema-validated)       │     │
│  │    → { session_summary, observations[],            │     │
│  │        entities[], relations[] }                   │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 5. openSessionsDB(projectPath) (Phase 35 D-48/49)  │     │
│  │    → cached handle, auto-migrated                  │     │
│  │    Transaction:                                    │     │
│  │      - createSession(id, summary, cost, tokens)    │     │
│  │      - for each entity: upsertEntity → get entityId│     │
│  │      - for each obs: appendObservation(entityIds)  │     │
│  │      - for each rel: linkRelation(fromId, toId)    │     │
│  │    On partial failure → rollback (Phase 35 D-37)   │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 6. context.md update (D-54)                        │     │
│  │    → updateContextHistory(vaultPath, projectName,  │     │
│  │       sessionLogFilename, sessionSummary)          │     │
│  │    Writes session pointer to Tier 3 context.md     │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 7. NotebookLM trigger (D-53)                       │     │
│  │    → spawn notebooklm-sync-trigger.mjs detached    │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 8. Vault git push (spawn, not exec)                │     │
│  │    → spawn('git', ['add', '-A'], { cwd: vault })   │     │
│  │    → spawn('git', ['commit', '-m', msg, '--quiet'])│     │
│  │    → spawn('git', ['push', '--quiet'])             │     │
│  └────────────────────────────────────────────────────┘     │
│                        ▼                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 9. CostTracker.dump() → ~/.claude/cds-capture.log  │     │
│  │    exit 0                                          │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
hooks/
├── session-end-capture.sh          # NEW — POSIX wrapper (double-fork)
├── session-end-capture.mjs         # NEW — main orchestrator (~200 lines)
├── session-end-check.sh            # OLD — removed from settings.json by wizard,
│                                   #       file removed by wizard on re-run
├── update-context.mjs              # unchanged, imported by new hook
├── notebooklm-sync-trigger.mjs     # unchanged, invoked by new hook
└── vault-auto-push.sh              # unchanged; Stop-side git push kept for
                                    #       parity until Phase 37+ review

packages/cds-core/src/capture/
├── index.ts                        # re-exports: transcript, prompts, types
├── transcript.ts                   # parser + token estimator + truncator
├── prompts.ts                      # SYSTEM_PROMPT + observation types
├── types.ts                        # ObservationType union, EmitObservationsInput
├── transcript.test.ts              # unit (fixture jsonls)
├── prompts.test.ts                 # snapshot tests of prompt output
└── fixtures/
    ├── small-session.jsonl         # 20 messages, typical session
    ├── large-session.jsonl         # 200+ messages, exercises truncation
    └── edge-session.jsonl          # empty, tool-only, etc.

packages/cds-core/src/index.ts       # add: export * as capture from './capture/index.js';

lib/install/hooks.mjs                # MODIFIED — replace session-end-check entry

skills/session-manager/SKILL.md      # MODIFIED — description narrowed to fallback

tests/hooks/session-end-capture.test.mjs  # integration (INTEGRATION=1 gated)
```

### Pattern 1: SDK tool_use with input_schema (D-55)

**What:** Haiku is passed a single tool definition; the SDK's agent loop forces tool_use emission with schema validation.

**When to use:** Any time structured output is required from an LLM and schema enforcement matters.

**Example:**
```typescript
// packages/cds-core/src/capture/prompts.ts
import type { Tool } from '@cds/core';

export const OBSERVATION_TYPES = [
  'decision', 'blocker', 'todo', 'file-touch', 'user-intent', 'pattern-learned',
] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

export interface EmitObservationsInput {
  session_summary: string;
  observations: Array<{
    type: ObservationType;
    content: string;
    entities: string[];
  }>;
  entities: Array<{ name: string; type: string }>;
  relations: Array<{ from: string; to: string; type: string }>;
}

export const emitObservationsTool: Tool = {
  name: 'emit_observations',
  description:
    'Record structured observations from this session. Call exactly once. ' +
    'session_summary is 1-3 sentences. observations are concrete facts, not opinions.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['session_summary', 'observations', 'entities', 'relations'],
    properties: {
      session_summary: { type: 'string', minLength: 1, maxLength: 1000 },
      observations: {
        type: 'array',
        maxItems: 40,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'content', 'entities'],
          properties: {
            type: { type: 'string', enum: OBSERVATION_TYPES as unknown as string[] },
            content: { type: 'string', minLength: 1, maxLength: 500 },
            entities: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      entities: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'type'],
          properties: {
            name: { type: 'string', minLength: 1 },
            type: { type: 'string', minLength: 1 },
          },
        },
      },
      relations: {
        type: 'array',
        maxItems: 40,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to', 'type'],
          properties: {
            from: { type: 'string', minLength: 1 },
            to: { type: 'string', minLength: 1 },
            type: { type: 'string', minLength: 1 },
          },
        },
      },
    },
  },
};
```

### Pattern 2: POSIX double-fork wrapper (D-64)

**What:** Shell script spawns Node in a subshell with `&`, disowns, exits. Node process orphans into the background.

**When to use:** Any Stop hook where the work must not block Claude Code's session exit.

**Example:**
```sh
#!/bin/sh
# hooks/session-end-capture.sh
# Double-fork wrapper — launches Node detached, returns in ~10ms.
# Mirrors pattern used by hooks/notebooklm-sync-trigger.mjs (proven stable).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Inner subshell detaches; outer background + disown orphans from Claude's
# job table. stdin closed; stdout+stderr discarded (logs go to cds-capture.log).
(node "$SCRIPT_DIR/session-end-capture.mjs" >/dev/null 2>&1 &) &
disown 2>/dev/null || true

exit 0
```

**Note:** The `child_process.spawn({ detached: true, stdio: 'ignore' })` pattern used by `notebooklm-sync-trigger.mjs` is equivalent — planner may choose either (POSIX shell for universality, Node-side spawn for debuggability). The shell variant is recommended for parity with the Claude Code hook entry syntax (`bash ~/.claude/hooks/X.sh`).

### Pattern 3: AbortController + explicit signal propagation (D-65)

**What:** A single `AbortController` with 60-second timeout whose signal is threaded through every async call.

**When to use:** Long-running background work that must be bounded even on successful paths.

**Example:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(new Error('capture-timeout-60s')), 60_000);

try {
  const { output, tokens, cost_usd } = await dispatchAgent({
    model: 'haiku',
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    tools: [emitObservationsTool],
    signal: controller.signal,         // SDK-level cancellation
    session_id: sessionId,
  });
  costTracker.record({ model: 'claude-haiku-4-5-*', tokens });
  // DB writes use .transaction() — no async boundary, rollback on throw
  const db = openSessionsDB(projectPath);
  db.transaction(() => {
    if (controller.signal.aborted) throw controller.signal.reason;
    // ... createSession, appendObservation, etc.
  })();
} finally {
  clearTimeout(timeoutId);
}
```

### Pattern 4: 3-tier error handling (D-66)

**What:** Every throw is categorized at the top-level handler into one of three behaviors.

**When to use:** Fail-silent systems where user experience must not degrade on transient or expected errors.

**Example:**
```typescript
// hooks/session-end-capture.mjs — top-level error funnel
try {
  await runCapture();
  process.exit(0);
} catch (err) {
  const tier = classifyError(err);
  if (tier === 'silent') {
    process.exit(0);
  }
  if (tier === 'log') {
    await appendToCaptureLog({ level: 'warn', err: serializeError(err) });
    process.exit(0);
  }
  // tier === 'crash'
  await appendToCaptureLog({ level: 'error', err: serializeError(err) });
  process.exit(1);
}

function classifyError(err) {
  if (err && typeof err === 'object') {
    const msg = 'message' in err ? String(err.message) : '';
    const code = 'code' in err ? String(err.code) : '';
    // silent tier
    if (msg.includes('ANTHROPIC_API_KEY')) return 'silent';
    if (code === 'ENOENT' && msg.includes('.jsonl')) return 'silent';
    if (msg.includes('capture-timeout-60s')) return 'log';
    if (err.status === 429) return 'silent';
    if (code === 'SQLITE_BUSY') return 'silent';
    // log tier
    if (/schema|version|migration/i.test(msg)) return 'log';
    if (/tool_use|input_schema|malformed/i.test(msg)) return 'log';
    if (msg.includes('transaction rollback')) return 'log';
  }
  return 'crash';
}
```

### Pattern 5: Safe subprocess invocation via spawn (not exec)

**What:** `child_process.spawn('git', ['add', '-A'], { cwd })` instead of `execSync('git add -A', { cwd })`.

**When to use:** Every time — no exceptions. Shell-string interpolation with user-controlled paths (vault path, project name) is a well-known injection vector.

**Example:**
```javascript
import { spawn } from 'node:child_process';

function gitAsync(args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, stdio: 'pipe' });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => stdout += d.toString());
    proc.stderr.on('data', (d) => stderr += d.toString());
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', () => resolve({ code: -1, stdout, stderr: 'spawn-failed' }));
  });
}

// Usage:
const vaultPath = process.env.VAULT_PATH || join(homedir(), 'vault');
const { code: remoteCode, stdout: remotes } = await gitAsync(['remote'], vaultPath);
if (remoteCode === 0 && remotes.trim()) {
  await gitAsync(['add', '-A'], vaultPath);
  await gitAsync(['commit', '-m', `Session: ${projectName} ${date}`, '--quiet'], vaultPath);
  await gitAsync(['push', '--quiet'], vaultPath);
}
```

### Anti-Patterns to Avoid

- **`execSync` with string interpolation.** `execSync('git commit -m "' + msg + '"')` is shell-injectable. ALWAYS use `spawn('git', ['commit', '-m', msg])` with argv array.
- **Synchronous I/O in wrapper.** The `.sh` wrapper must exit in <10 ms. No `cat`, `grep`, or `test -f` on large inputs inside the wrapper. Logic moves to Node.
- **Blocking on dispatchAgent without signal.** A 60 s+ API hang would leak the Node process indefinitely. Always pass `signal`.
- **Per-invocation `openSessionsDB`.** Phase 35 D-49 caches by projectPath; re-opening triggers redundant migration scans.
- **Unconditional retries on malformed tool_use.** Budget implications — 1 retry only (Claude's Discretion, planner default).
- **Hard-coding full model ID.** Use `'haiku'` alias (D-57) so v1.0 → v1.1 Haiku version bumps auto-apply.
- **Throwing non-Error objects.** Error classifier in D-66 relies on `.message`/`.code` — always `throw new Error(...)` or subclass.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Prompt for XML/JSON in text + regex parse | SDK `tool_use` with `input_schema` | v0.12 ADR-02 failed exactly this way; schema validation is free |
| Background process orphaning | PID files, `nohup`, custom daemon | POSIX double-fork + `disown` (or Node `spawn({detached:true})`) | Existing proven pattern in `notebooklm-sync-trigger.mjs` |
| SQLite transactions | Manual `BEGIN`/`COMMIT` strings | `db.transaction(() => ...)` from better-sqlite3 | Auto-rollback on throw; Phase 35 API already wraps |
| Agent cost estimation | Look up pricing + multiply tokens | `CostTracker.record()` + `total()` | Phase 34 D-27 primitive; pricing table updates via `@cds/core` patch |
| Model alias resolution | If/else chain in hook | `dispatchAgent({ model: 'haiku' })` | Phase 34 D-21 resolves aliases centrally |
| Project-path → SQLite-file resolution | `~/vault/projects/{basename}/sessions.db` manually | `openSessionsDB(projectPath)` | Phase 35 D-48 handles creation + caching |
| Migration logic | Runtime `CREATE TABLE IF NOT EXISTS` sprinkled | Auto-migrate inside `openSessionsDB` | Phase 35 D-37 runs on open inside single txn |
| jsonl parsing | Manual line split + JSON.parse | Same — but in `@cds/core/capture/transcript.ts` and unit-tested | Keep hook script thin; parsers have edge cases (empty lines, partial rows) |
| context.md Session History update | Inline fs.readFile + regex | `updateContextHistory()` from `lib/session-context.mjs` | Existing tested module; D-54 mandates import |
| NotebookLM sync invocation | Re-implement `which notebooklm` + spawn | Invoke `hooks/notebooklm-sync-trigger.mjs` via spawn | D-53 mandates; already has detach + fail-silent |
| Subprocess with user paths | `execSync('cmd ' + userPath)` | `spawn('cmd', [userPath])` | Shell-injection risk with exec; spawn argv is literal |

**Key insight:** Phase 36 is 90% orchestration, 10% new logic. The new logic is: (a) the transcript parser, (b) the extraction prompt, (c) the error classifier. Everything else (dispatch, cost, sessions, context.md, NBLM, wrapper) already exists in Phase 34/35 or legacy hooks.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: `CLAUDE_SESSION_ID` present but jsonl still open for append (D-63)
**What goes wrong:** Reading the file at Stop time misses messages appended after the read begins.
**Why it happens:** Claude Code writes to jsonl asynchronously; Stop fires when the agent loop returns, not when I/O flushes.
**How to avoid:** Accept the tradeoff per D-63. Do not `fs.watch` or poll — introduces race hazards for negligible fidelity gain.
**Warning signs:** Last user message missing from captured summary. Test with a fixture that includes a trailing message written after a `sleep`.

### Pitfall 2: `dispatchAgent` throws `UnknownModelError` for `'haiku'` alias
**What goes wrong:** Capture fails because the alias table in `packages/cds-core/src/models.ts` (Phase 34 D-21) lacks the alias.
**Why it happens:** If Phase 34 execution skipped the alias table or a future Haiku version isn't yet added, alias resolution fails.
**How to avoid:** Unit test that `models.ts` includes `'haiku'` → `'claude-haiku-4-5-*'`. Reference this in PLAN.md verification.
**Warning signs:** `cds-capture.log` contains `UnknownModelError` entries.

### Pitfall 3: Malformed tool_use causes an uncaught SDK exception
**What goes wrong:** Haiku emits invalid JSON for `emit_observations` and `dispatchAgent` throws; hook misclassifies as `crash`.
**Why it happens:** SDK errors are not typed beyond `Error`; matching on `.message` text is brittle.
**How to avoid:** Wrap `dispatchAgent` specifically and convert SDK errors to typed `MalformedToolUseError` before the classifier sees them. Classifier checks instance type first, message regex second.
**Warning signs:** Exit code 1 on what should be tier-2 recoverable errors. `cds-capture.log` shows `error` entries where `warn` was expected.

### Pitfall 4: SQLite `SQLITE_BUSY` during concurrent captures
**What goes wrong:** Two Claude Code sessions in the same project end within the same second; second capture silently drops.
**Why it happens:** WAL mode allows one writer; second blocks briefly (<1 s typically), but on slow disks can exceed Phase 35's busy_timeout default.
**How to avoid:** Classifier treats `SQLITE_BUSY` as `silent` (D-66). Planner confirms Phase 35 sets `busy_timeout` (≥5000 ms recommended). No hook-level retries — drop and move on.
**Warning signs:** Phase 35 SUMMARY.md's PRAGMA settings should include `busy_timeout`; if absent, flag as risk.

### Pitfall 5: Wrapper left non-executable after `cpSync`
**What goes wrong:** Wizard copies `session-end-capture.sh` but doesn't `chmod 0o755`; Claude Code can't execute it; Stop hook silently no-ops every session.
**Why it happens:** `cpSync` preserves mode from the source file, but git-checked-out files can drop execute bit on Windows/some filesystems.
**How to avoid:** `lib/install/hooks.mjs` already has `chmodSync(dest, 0o755)` pattern (line 59) — extend the existing loop's name list to include `session-end-capture.sh`. Add an assertion in the wizard summary that `-x` bit is set.
**Warning signs:** `ls -l ~/.claude/hooks/session-end-capture.sh` shows `-rw-r--r--` instead of `-rwxr-xr-x`.

### Pitfall 6: `.claude/settings.json` Stop list has both old and new entries
**What goes wrong:** Non-idempotent migration leaves `session-end-check.sh` AND `session-end-capture.sh` in Stop list; both fire, causing duplicate context.md writes and a race on vault git push.
**Why it happens:** Wizard adds new entry without removing old one.
**How to avoid:** In `lib/install/hooks.mjs`, detect existing `session-end-check` entries, remove them BEFORE adding `session-end-capture`. Idempotency check (D-69) already keyed on both filenames.
**Warning signs:** Integration test: after running wizard, grep settings.json for `session-end-check` — must return 0 matches.

### Pitfall 7: Transcript token estimator drifts from actual Haiku tokenizer
**What goes wrong:** Pre-flight "$0.02 budget" check passes, but actual call costs $0.04 because estimator used ASCII-byte heuristic instead of a real tokenizer.
**Why it happens:** Real tokenizer is `@anthropic-ai/tokenizer` (extra dep) or API roundtrip (cost).
**How to avoid:** Accept estimation error; use `chars / 3.5` heuristic (close enough for English prose). Post-flight log flags actual overage. Don't block on estimate error in v1.0 alpha.
**Warning signs:** `cds-capture.log` shows frequent `actual > estimated` ratios > 1.5×. Plan to tighten in v1.1.

### Pitfall 8: Vault git push fires inside hook but user's vault has unresolved merge conflicts
**What goes wrong:** `git commit` fails with merge marker error; hook exits 0 silently but vault state is corrupted.
**Why it happens:** Legacy behavior — vault push just runs `git add -A && commit && push` with `--quiet` and ignores exit code.
**How to avoid:** Preserve existing behavior (D-51 consolidates, does not improve). Any vault-git hardening is out of scope for Phase 36. Document as known limitation in SUMMARY.md.
**Warning signs:** User reports "vault unsynced" or "diverged branches" after running new hook.

### Pitfall 9: `execSync` shell injection via CLAUDE_PROJECT_DIR
**What goes wrong:** `execSync('git -C ' + projectPath + ' ...')` — if `projectPath` contains `;` or backticks, attacker executes arbitrary commands.
**Why it happens:** Developer reflexively uses `execSync` with string concatenation.
**How to avoid:** MANDATORY — every subprocess call uses `spawn('cmd', [args...], { cwd })` with argv array. NEVER concatenate into the command string.
**Warning signs:** Code review flags any `execSync(` or `exec(` call with backticks/`+` in the command argument.
</common_pitfalls>

<code_examples>
## Code Examples

### Transcript parser with inclusion filter + truncation (D-61/D-62)

```typescript
// packages/cds-core/src/capture/transcript.ts
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SYSTEM_PROMPT } from './prompts.js';

export interface ParsedMessage {
  role: 'user' | 'assistant' | 'tool_summary';
  content: string;
}

const TOOL_TRUNCATE_CAP = 200;
const TOKEN_ESTIMATE_DIVISOR = 3.5; // chars → tokens
const TIER_2_HEAD = 20;
const TIER_2_TAIL = 30;
const TIER_2_MAX_TOKENS = 40_000;

export async function loadTranscript(
  sessionId: string,
  projectSlug: string,
): Promise<ParsedMessage[]> {
  const path = join(homedir(), '.claude', 'projects', projectSlug, `${sessionId}.jsonl`);
  const raw = await readFile(path, 'utf8');
  const messages: ParsedMessage[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let row: unknown;
    try { row = JSON.parse(line); } catch { continue; }
    if (!row || typeof row !== 'object') continue;
    const r = row as { type?: string; message?: { content?: unknown } };
    if (r.type === 'user' && typeof r.message?.content === 'string') {
      messages.push({ role: 'user', content: r.message.content });
    } else if (r.type === 'assistant' && Array.isArray(r.message?.content)) {
      for (const block of r.message.content as Array<{ type: string; text?: string; name?: string; input?: unknown }>) {
        if (block.type === 'text' && block.text) {
          messages.push({ role: 'assistant', content: block.text });
        } else if (block.type === 'tool_use' && block.name) {
          messages.push({ role: 'tool_summary', content: summarizeToolCall(block.name, block.input) });
        }
      }
    } else if (r.type === 'user' && Array.isArray(r.message?.content)) {
      for (const block of r.message.content as Array<{ type: string; content?: unknown; tool_use_id?: string }>) {
        if (block.type === 'tool_result') {
          const truncated = truncateToolResult(block.content, 'Tool');
          if (truncated) messages.push({ role: 'tool_summary', content: truncated });
        }
      }
    }
  }
  return messages;
}

function summarizeToolCall(name: string, input: unknown): string {
  const firstArg = typeof input === 'object' && input ?
    Object.values(input as Record<string, unknown>)[0] : String(input);
  const head = String(firstArg ?? '').slice(0, 80);
  return `[${name}] ${head}`;
}

function truncateToolResult(content: unknown, toolName: string): string | null {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? (content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === 'text')
          .map((b) => b.text ?? '')
          .join('')
      : '';
  if (!text) return null;
  const fullKeep = new Set(['Edit', 'Write', 'MultiEdit']);
  if (fullKeep.has(toolName)) return `[${toolName} result] ${text}`;
  const snippet = text.slice(0, TOOL_TRUNCATE_CAP);
  return `[${toolName} result] ${snippet}${text.length > TOOL_TRUNCATE_CAP ? '…' : ''}`;
}

export function buildExtractionPrompt(
  messages: ParsedMessage[],
): { systemPrompt: string; userPrompt: string; estimatedTokens: number } {
  let userPrompt = messages
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join('\n\n');

  // Tier-2 truncation (D-61)
  let estimatedTokens = Math.ceil((SYSTEM_PROMPT.length + userPrompt.length) / TOKEN_ESTIMATE_DIVISOR);
  if (estimatedTokens > TIER_2_MAX_TOKENS && messages.length > TIER_2_HEAD + TIER_2_TAIL) {
    const head = messages.slice(0, TIER_2_HEAD);
    const tail = messages.slice(-TIER_2_TAIL);
    const elided = messages.length - head.length - tail.length;
    userPrompt = [
      ...head.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`),
      `\n... [${elided} messages elided for cost] ...\n`,
      ...tail.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`),
    ].join('\n\n');
    estimatedTokens = Math.ceil((SYSTEM_PROMPT.length + userPrompt.length) / TOKEN_ESTIMATE_DIVISOR);
  }

  return { systemPrompt: SYSTEM_PROMPT, userPrompt, estimatedTokens };
}
```

### Minimal main orchestrator shape (hooks/session-end-capture.mjs)

```javascript
#!/usr/bin/env node
// hooks/session-end-capture.mjs
// Consolidated Stop hook — runs detached via wrapper. See D-51..D-72.
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

// Hook imports from installed @cds/core (after pnpm install resolves workspace link
// during dev; bundled output during release per Phase 33 D-08 deferred).
import { dispatchAgent, CostTracker, openSessionsDB } from '@cds/core';
import {
  loadTranscript, buildExtractionPrompt,
  emitObservationsTool,
} from '@cds/core/capture';
import { updateContextHistory } from '../lib/session-context.mjs';

const CAPTURE_LOG = join(homedir(), '.claude', 'cds-capture.log');
const CONFIG_PATH = join(homedir(), '.claude', 'cds-capture-config.json');
const TIMEOUT_MS = 60_000;

const DEBUG = process.env.CDS_CAPTURE_DEBUG === '1';

// spawn wrapper — safe, no shell interpolation
function spawnAsync(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { ...options, stdio: options.stdio ?? 'pipe' });
    let stdout = '', stderr = '';
    proc.stdout?.on('data', (d) => stdout += d.toString());
    proc.stderr?.on('data', (d) => stderr += d.toString());
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }));
  });
}

async function runCapture() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  const projectPath = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!sessionId) throw Object.assign(new Error('CLAUDE_SESSION_ID missing'), { silent: true });

  // opt-out check (D-66 silent)
  if (existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
      if (cfg.enabled === false) {
        throw Object.assign(new Error('cds-capture disabled via config'), { silent: true });
      }
    } catch (err) {
      if (err.silent) throw err;
      // malformed config → log, continue
    }
  }

  const slug = projectPath.replace(/\//g, '-').replace(/^-/, '');
  const messages = await loadTranscript(sessionId, slug);
  if (messages.length === 0) {
    throw Object.assign(new Error('transcript empty'), { silent: true });
  }

  const { systemPrompt, userPrompt } = buildExtractionPrompt(messages);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('capture-timeout-60s')), TIMEOUT_MS);

  const costTracker = new CostTracker(sessionId);
  let payload;
  try {
    const result = await dispatchAgent({
      model: 'haiku',
      system: systemPrompt,
      prompt: userPrompt,
      tools: [emitObservationsTool],
      signal: controller.signal,
      session_id: sessionId,
    });
    costTracker.record({ model: 'claude-haiku-4-5-*', tokens: result.tokens });
    payload = extractToolUsePayload(result);
    if (!payload) throw new Error('malformed tool_use payload');
  } finally {
    clearTimeout(timer);
  }

  const db = openSessionsDB(projectPath);
  db.transaction(() => {
    const session = db.createSession({
      id: sessionId,
      summary: payload.session_summary,
      cost_usd: costTracker.total().cost_usd,
      tokens: costTracker.total().tokens,
    });
    const entityIds = new Map();
    for (const e of payload.entities) {
      entityIds.set(e.name, db.upsertEntity({ name: e.name, type: e.type }));
    }
    for (const o of payload.observations) {
      db.appendObservation({
        session_id: session.id,
        type: o.type,
        content: o.content,
        entities: o.entities.map((n) => entityIds.get(n)).filter(Boolean),
      });
    }
    for (const r of payload.relations) {
      const fromId = entityIds.get(r.from);
      const toId = entityIds.get(r.to);
      if (fromId && toId) db.linkRelation({ from: fromId, to: toId, type: r.type });
    }
  })();

  // context.md pointer (D-54)
  const projectName = basename(projectPath);
  const date = new Date().toISOString().slice(0, 10);
  const sessionLogFilename = `${date}-${sessionId.slice(0, 8)}.md`;
  try {
    updateContextHistory({
      vaultPath: process.env.VAULT_PATH || join(homedir(), 'vault'),
      projectName,
      sessionLogFilename,
      sessionTitle: payload.session_summary.slice(0, 80),
    });
  } catch (err) {
    if (DEBUG) process.stderr.write(`context.md update failed: ${err.message}\n`);
    // Tier "log" upstream
  }

  // NotebookLM trigger (D-53) — spawn detached
  const nblmTrigger = join(homedir(), '.claude', 'hooks', 'notebooklm-sync-trigger.mjs');
  if (existsSync(nblmTrigger)) {
    const child = spawn(process.execPath, [nblmTrigger], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, VAULT_PATH: process.env.VAULT_PATH || join(homedir(), 'vault') },
    });
    child.unref();
  }

  // Vault git push — spawn, NOT exec (safe with user paths)
  const vaultPath = process.env.VAULT_PATH || join(homedir(), 'vault');
  if (existsSync(join(vaultPath, '.git'))) {
    const { code: remoteCode, stdout: remotes } = await spawnAsync('git', ['remote'], { cwd: vaultPath });
    if (remoteCode === 0 && remotes.trim()) {
      await spawnAsync('git', ['add', '-A'], { cwd: vaultPath });
      await spawnAsync('git', ['commit', '-m', `Session: ${projectName} ${date}`, '--quiet'], { cwd: vaultPath });
      await spawnAsync('git', ['push', '--quiet'], { cwd: vaultPath });
    }
  }

  await appendCaptureLog(costTracker.dump());
}

// ... classifyError, appendCaptureLog, extractToolUsePayload helpers ...

runCapture().then(() => process.exit(0)).catch(async (err) => {
  const tier = err?.silent ? 'silent' : classifyError(err);
  try {
    await mkdir(join(homedir(), '.claude'), { recursive: true });
    if (tier !== 'silent') {
      await appendFile(CAPTURE_LOG, JSON.stringify({
        ts: new Date().toISOString(), tier,
        err: { message: err.message, code: err.code, stack: DEBUG ? err.stack : undefined },
      }) + '\n');
    }
  } catch { /* even log failure stays silent */ }
  process.exit(tier === 'crash' ? 1 : 0);
});
```

### Wizard migration (D-68/D-69)

```javascript
// lib/install/hooks.mjs — excerpt showing idempotent replacement.

// BEFORE (current code):
//   const hasEnd = settings.hooks.Stop.some(entry =>
//     entry.hooks?.some(h => h.command?.includes('session-end-check'))
//   );
//   if (!hasEnd) {
//     settings.hooks.Stop.push({
//       hooks: [{ type: 'command', command: `bash ${endDest}`, timeout: 5 }],
//     });
//     changed = true;
//   }

// AFTER (Phase 36):
const endCaptureDest = join(hooksDir, 'session-end-capture.sh');
if (!settings.hooks.Stop) settings.hooks.Stop = [];

const captureAlready = settings.hooks.Stop.some((entry) =>
  entry.hooks?.some((h) => h.command?.includes('session-end-capture.sh'))
);

if (!captureAlready) {
  // Remove old session-end-check entries (D-68)
  const beforeCount = settings.hooks.Stop.length;
  settings.hooks.Stop = settings.hooks.Stop.filter((entry) =>
    !entry.hooks?.some((h) => h.command?.includes('session-end-check'))
  );
  const removed = beforeCount - settings.hooks.Stop.length;
  if (removed > 0) changed = true;

  // Detect custom Stop hooks (not CDS-authored) — warn but preserve (D-69)
  const customStop = settings.hooks.Stop.filter((entry) =>
    entry.hooks?.every((h) =>
      !h.command?.includes('session-end-capture') &&
      !h.command?.includes('session-end-check')
    )
  );
  if (customStop.length > 0) {
    warn(`Custom Stop hooks detected in ${settingsPath.replace(homedir(), '~')} — ` +
         `auto-capture added alongside. Review for conflicts.`);
  }

  settings.hooks.Stop.push({
    hooks: [{ type: 'command', command: `bash ${endCaptureDest}`, timeout: 5 }],
  });
  changed = true;
  info('auto-capture enabled, /end no longer required for routine sessions');
}
```
</code_examples>

<sota_updates>
## State of the Art (2024-2026)

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `claude -p --bare` subprocess | SDK `dispatchAgent` with `tool_use` | 2026 Q1 (Phase 34) | Schema validation eliminates ADR-02 failure mode |
| Markdown-only Tier 1 sessions | SQLite Tier 2 via `sessions.ts` | 2026 Q1 (Phase 35) | Structured queries, FTS5, entity/relation graph |
| Manual `/end` skill invocation | Auto Stop-hook capture | 2026 Q2 (Phase 36 — this phase) | Zero user friction; retry queue deferred to v1.1 |
| Chained 4-script Stop hook | Single consolidated Node hook | 2026 Q2 (Phase 36) | Single error-handling boundary, easier tests |
| `execSync` with string interpolation | `spawn` with argv array | Always | Shell-injection safety; enforced by project security reminder |

**New tools/patterns to consider:**
- **`AbortSignal.timeout(ms)`** (Node 18.16+): one-liner replacement for `setTimeout + controller.abort()`. Matches D-65 semantics. Planner may choose either.
- **`better-sqlite3.Database.transaction()`**: auto-rollback on thrown exception inside the callback — replaces manual `BEGIN`/`ROLLBACK` strings.

**Deprecated/outdated:**
- **`claude -p --bare` CLI extraction** (v0.12 ADR-02 pathway): superseded by `dispatchAgent`. Legacy `lib/adr-bridge-session.mjs` stays in repo but is no longer invoked by the new Stop-hook list.
- **`hooks/session-end-check.sh`**: removed from settings.json by wizard; file kept on disk for manual fallback only until cleanup phase (post-v1.0).
</sota_updates>

<open_questions>
## Open Questions

1. **Exact shape of `dispatchAgent` return when a tool is emitted.**
   - What we know: D-17 returns `{ output, tokens, cost_usd }`; `output` is "assistant's final text".
   - What's unclear: Is the tool_use payload embedded in `output`, returned separately, or accessible via an SDK callback?
   - Recommendation: PLAN 02 reads `packages/cds-core/src/agent-dispatcher.ts` (to be produced by Phase 34 execution) and adjusts the `extractToolUsePayload` helper. If the SDK emits tool_use as a structured block before the final text, `dispatchAgent` may need a typed union return in Phase 34 — surface as Phase 34 execution risk via NOTICES.md or a coordination note.

2. **Does `hooks/update-context.mjs` / `updateContextHistory` tolerate a missing session log file?**
   - What we know: Current signature accepts optional `sessionTitle` (argv[3]).
   - What's unclear: Does `updateContextHistory` require the markdown file to already exist, or does it just append a bullet to context.md?
   - Recommendation: PLAN 02 reads `lib/session-context.mjs` before writing; if the function requires an existing file, write a minimal markdown stub at `vault/projects/{name}/sessions/{date}-{id}.md` first. Default plan: write the stub, then call updateContextHistory unchanged.

3. **Should the Stop hook also write a Tier 1 markdown session log, or is SQLite the sole destination?**
   - What we know: CAPTURE-05 says "updates `vault/projects/{name}/context.md` (Tier 3) with session pointer." Phase 38 (backfill) implies markdown is still canonical input.
   - What's unclear: Do new sessions still get a markdown log?
   - Recommendation: Write a minimal markdown stub (summary + date + session_id + top observations) alongside the SQLite write. Preserves backfill compatibility and keeps Tier 1 as human-readable source of truth. Phase 38 deduplicates if needed.

4. **Do we need a live API integration test?**
   - What we know: Phase 34 D-32 gates live tests behind `INTEGRATION=1`.
   - What's unclear: CI coverage for live path.
   - Recommendation: Add `tests/hooks/session-end-capture.live.test.mjs` gated on `INTEGRATION=1` + `ANTHROPIC_API_KEY`. Skipped by default. Run manually before phase sign-off + before alpha release (Phase 39).
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- `.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md` (read via sibling worktree) — dispatchAgent signature D-17, CostTracker API D-27, model aliases D-21, fail-silent boundary D-32.
- `.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md` (read via sibling worktree) — openSessionsDB D-48, auto-migrate D-37, caching D-49, transaction API D-34, concurrent access D-50.
- `hooks/notebooklm-sync-trigger.mjs` (repo) — proven POSIX detach pattern (R5 comment), fail-silent idioms.
- `hooks/session-end-check.sh` (repo) — current 4-behavior chain to be consolidated.
- `hooks/update-context.mjs` + `lib/session-context.mjs` (repo) — wrapper signature, VAULT_PATH/CDS_PROJECT_NAME env contract.
- `lib/install/hooks.mjs` (repo) — existing wizard pattern (chmodSync 0o755, project-scoped settings.json mutation, idempotency by command-substring match).
- `.planning/REQUIREMENTS.md` §CAPTURE-05, CAPTURE-06 — acceptance contracts.
- `.planning/ROADMAP.md` §Phase 36 — Success Criteria 1-4.
- `.planning/phases/36-auto-session-capture/36-CONTEXT.md` — all locked D-51..D-72.

### Secondary (MEDIUM confidence)
- Anthropic Agent SDK docs (public) — `tool_use` + `input_schema` JSON Schema draft-07 semantics. Verified against CONTEXT.md D-55 example; planner should confirm draft version against installed SDK.
- POSIX `disown` / double-fork — standard on bash/zsh/dash/ash. `notebooklm-sync-trigger.mjs` comment claims "R5 exact pattern" — treat as authoritative for our codebase.

### Tertiary (LOW confidence — validate during execution)
- Exact field name of tool_use extraction from `dispatchAgent` return (PLAN must confirm by reading Phase 34's `agent-dispatcher.ts` once produced).
- Whether `updateContextHistory` tolerates a missing session log file (PLAN must confirm by reading `lib/session-context.mjs`).
</sources>

## Validation Architecture

Phase 36 uses **vitest** (per Phase 33 D-05 migration) for all unit tests under `packages/cds-core/src/capture/`. Root integration tests under `tests/hooks/` may use vitest or `node:test` — planner picks to match existing root test framework (check `package.json` scripts).

### Test Tiers

**Tier 1 — Unit tests (PLAN 01 `type: execute`):**
- `packages/cds-core/src/capture/transcript.test.ts`
  - `loadTranscript` with fixture jsonls (small, large, edge, empty).
  - Token estimator sanity: `estimatedTokens(SYSTEM_PROMPT) ≈ SYSTEM_PROMPT.length / 3.5`.
  - Tier-2 truncation: large fixture → elided marker present, final tokens ≤ 40_000.
  - Tool summary truncation: Read/Grep/Bash capped at 200 chars; Edit/Write kept in full.
- `packages/cds-core/src/capture/prompts.test.ts`
  - `emitObservationsTool.input_schema` validates a canonical good payload.
  - Malformed payloads (missing required, wrong enum, too-long strings) rejected by JSON Schema validator.
  - Snapshot: SYSTEM_PROMPT string shape (guard against accidental rewording).

**Tier 2 — Hook integration with mocks (PLAN 02 `type: execute`):**
- `tests/hooks/session-end-capture.test.mjs`
  - Mock `dispatchAgent` returning a canned tool_use payload.
  - Mock `openSessionsDB` in-memory DB.
  - Assert exit code 0 on happy path.
  - Assert exit code 0 + log entry on forced `dispatchAgent` throw.
  - Assert transaction rollback on partial write failure (mock `appendObservation` throws mid-batch).
  - Assert no stdout/stderr leaks (captured via pipe — the wrapper runs detached; this simulates that invariant).

**Tier 3 — Live API gated test (PLAN 04 `type: execute`):**
- `tests/hooks/session-end-capture.live.test.mjs` — only runs when `INTEGRATION=1` AND `ANTHROPIC_API_KEY` set.
  - Uses real small fixture jsonl (~10 messages).
  - Invokes the hook end-to-end against real Haiku.
  - Asserts: SQLite row count > 0, cost < $0.05, cds-capture.log has one success entry.
  - Default `pnpm test` skips this tier.

**Tier 4 — Wizard integration (PLAN 03 `type: execute`):**
- `tests/install/hooks-migration.test.mjs`
  - Synthesize a project dir with legacy `.claude/settings.json` containing `session-end-check.sh` entry.
  - Run `installSessionHook` wizard function.
  - Assert: `session-end-check.sh` removed from Stop list, `session-end-capture.sh` added, no duplicates, `chmod 0o755` applied.
  - Idempotency: second run → no changes.
  - Custom-hook preservation: settings with user-added Stop entry → wizard warns + adds alongside, does NOT delete user entry.

### Sampling Rate
- After every task commit: `pnpm -w vitest run --project cds-core` (capture subfolder scope).
- After every wave: `pnpm test` full suite.
- Before verification: Manual `INTEGRATION=1 pnpm test tests/hooks/session-end-capture.live.test.mjs`.

### Maximum feedback latency
- Unit tier: <10 s.
- Mock integration tier: <30 s.
- Live tier: ~15 s per run.

<metadata>
## Metadata

**Research scope:**
- Core technology: Claude Agent SDK tool_use, Node Stop hooks, SQLite transactions
- Ecosystem: `@cds/core` (Phase 34/35), `lib/session-context.mjs`, existing POSIX detach patterns
- Patterns: Tool_use extraction, double-fork detach, 3-tier error funnel, idempotent wizard migration
- Pitfalls: Transcript race, alias resolution, SQLite busy, wizard non-idempotency, executable bit, shell injection

**Confidence breakdown:**
- Standard stack: HIGH — all three primitives are internal (Phase 34/35) with CONTEXT.md-level specs.
- Architecture: HIGH — verified against existing `notebooklm-sync-trigger.mjs` (proven pattern) + Phase 35 D-34/49 (transaction + caching).
- Pitfalls: MEDIUM-HIGH — some (wrapper executable bit, SQLite busy) are empirically observed in similar hooks; others (Haiku alias, tokenizer drift) are anticipated but unconfirmed.
- Code examples: MEDIUM — example code illustrative; exact `extractToolUsePayload` signature depends on Phase 34 execution output.

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days — stable internal APIs, no SDK major versions expected in window)

---

*Phase: 36-auto-session-capture*
*Research completed: 2026-04-16*
*Ready for planning: yes*

## RESEARCH COMPLETE
