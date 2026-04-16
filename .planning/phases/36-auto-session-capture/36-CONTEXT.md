# Phase 36: Auto Session Capture - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace manual `/end` flow with an automatic Stop-hook pipeline that captures structured observations from Claude Code session transcripts into SQLite Tier 2. **Consolidates** the existing `session-end-check.sh` Stop hook's 4 behaviors (log-check, context.md update, NotebookLM sync trigger, vault auto-push) into a single TypeScript-authored Node hook. Closes the v0.12 ADR-02 Known Gap retroactively by replacing the failing `claude -p --bare` subprocess pattern with `dispatchAgent` from `@cds/core`.

**Deliverables:**
1. **`hooks/session-end-capture.mjs`** — new consolidated Stop hook (Node, ESM). Runs detached on session exit. 4 responsibilities:
   - **SQLite capture** (new, primary): read Claude Code transcript → Haiku extracts structured observations → write to `sessions.db` via `vault/sessions.ts` API
   - **context.md update** (migrated from legacy): write `## Recent Sessions` pointer (SQLite session ID + summary excerpt) into Tier 3 `vault/projects/{name}/context.md`
   - **NotebookLM sync trigger** (migrated from legacy `notebooklm-sync-trigger.mjs`): fire-and-forget background sync
   - **Vault auto-push** (migrated from legacy): `git add/commit/push` if `~/vault/.git` has a remote
2. **Wrapper script** (`hooks/session-end-capture.sh` or inline Node shebang) that spawns the main Node process detached and returns immediately to unblock Claude Code session exit.
3. **Wizard registration updates** — `lib/install/hooks.mjs` (current) replaces `session-end-check.sh` registration with `session-end-capture.mjs` in each project's `.claude/settings.json` Stop hook list. Idempotent — re-running wizard on a configured project updates the entry without duplicating.
4. **`/end` skill deprecation** — `skills/session-manager/SKILL.md` description updated to "fallback only (manual capture when auto-capture is disabled or failed)". Skill file stays for graceful fallback; wizard prints `auto-capture enabled, /end no longer required for routine sessions`.

**Explicitly NOT in scope for Phase 36:**
- MCP tools exposing SQLite queries (Phase 37)
- Backfill of existing markdown sessions (Phase 38)
- `/cds-quick` demo command (Phase 39)
- Any modification to root `lib/adr-bridge-session.mjs` — Phase 36 writes a NEW hook; the legacy ADR bridge code stays untouched until a future cleanup phase (it is called by a DIFFERENT Stop-hook pathway that Phase 36 also replaces).

</domain>

<decisions>
## Implementation Decisions

### Hook Consolidation Strategy (D-51 … D-54)
- **D-51:** **Single consolidated Node hook** — `hooks/session-end-capture.mjs` performs all 4 Stop-time responsibilities in one process. No chained `.sh` scripts, no duplicated project-name resolution logic across bash/JS. Single source of truth, single error-handling strategy, easier to test.
- **D-52:** Legacy `hooks/session-end-check.sh` is **removed** (not kept alongside) during the wizard migration in Plan 02. Any user who has manually added custom lines to this script gets a migration note in the v1.0 alpha release notes and in the wizard output when it detects non-standard Stop hook registrations.
- **D-53:** `hooks/notebooklm-sync-trigger.mjs` (existing, separate file) is **imported and called** by the new capture hook — not duplicated. Keeps NotebookLM integration unchanged; only the invocation site moves.
- **D-54:** `hooks/update-context.mjs` (existing) is either imported and called by the new capture hook, OR its logic is merged into the new hook if the API surface is trivial. Planner decides based on update-context.mjs size — keep imported if it has substantive logic, inline if it's a ~20-line file.

### Haiku Extraction Prompt Design (D-55 … D-59)
- **D-55:** Extraction uses **Claude Agent SDK tool_use** — system prompt tells Haiku to emit a single `emit_observations` tool call with a JSON schema:
  ```ts
  interface EmitObservationsInput {
    session_summary: string;              // 1-3 sentences, user-facing
    observations: Array<{
      type: 'decision' | 'blocker' | 'todo' | 'file-touch' | 'user-intent' | 'pattern-learned';
      content: string;                    // 1-2 sentences
      entities: string[];                 // names; mapped to entity IDs at write time
    }>;
    entities: Array<{ name: string; type: string }>;
    relations: Array<{ from: string; to: string; type: string }>;
  }
  ```
  SDK enforces the schema at the tool_use boundary — malformed output forces Haiku retry.
- **D-56:** Canonical observation types (D-55 enum) are the initial set; the schema accepts the 6 listed values as a union. Future types require schema update in `@cds/core/src/observations/types.ts` + a schema migration in the `sessions.db` only if the DB constrains `observations.type` (per Phase 35 D-43, it does not — `observations.type` is TEXT, open string). So new types just require prompt update, no DB migration.
- **D-57:** Model: `'haiku'` alias (resolved to `claude-haiku-4-5-*` latest per Phase 34 D-21 model-aliases table). Pinned version NOT used — we want capture quality to improve automatically as Haiku releases. If extraction quality regresses, a bundled `~/.claude/cds-capture-config.json` can pin to a specific version (not a Phase 36 deliverable).
- **D-58:** **Cost budget per session: $0.02 soft cap.** Computed via `CostTracker` (Phase 34 primitive). Enforcement:
  - Pre-flight estimate: transcript token count × Haiku input price. If estimate > $0.02, apply truncation tier-2 (see D-61).
  - Post-flight log: `CostTracker.dump()` written to `~/.claude/cds-capture.log`. If actual > $0.02, log warning but do NOT retroactively fail — the observations are already captured.
- **D-59:** System prompt + full observation extraction prompt live in `packages/cds-core/src/capture/prompts.ts` — versioned, testable, isolated from the hook script. Hook imports the prompt string. This lets the prompt be iterated without touching hook logic.

### Transcript Parsing Strategy (D-60 … D-63)
- **D-60:** Transcript source: `~/.claude/projects/{slug}/{session_id}.jsonl` where `slug` = Claude Code's project slug (derived from absolute project path, dashes-for-slashes). `session_id` comes from `process.env.CLAUDE_SESSION_ID` (passed by Claude Code to Stop hooks). If either is missing, the hook exits silently (not an error — just means non-Claude-Code context).
- **D-61:** **Inclusion filter** when building the Haiku prompt input:
  - **Include:** every `user` message (full content), every `assistant` text response (full content), tool-use summaries (tool name + first-line of result). Tool-result truncation: `Read`/`Grep`/`Bash` results capped at 200 chars; `Edit`/`Write` operations kept in full (most signal-rich).
  - **Exclude:** verbose tool outputs, `<system-reminder>` blocks, empty assistant thinking, intermediate tool_use/tool_result JSON wrapping.
  - **Tier-2 truncation (applies when pre-flight estimate > $0.02):** keep first 20 + last 30 messages with `... [M messages elided for cost] ...` marker between. Cap total input at 40k tokens (leaves headroom for system prompt + Haiku output budget within the 200k context window).
- **D-62:** Parser lives in `packages/cds-core/src/capture/transcript.ts` — exports `loadTranscript(sessionId, projectSlug): ParsedMessage[]` + `buildExtractionPrompt(messages): { systemPrompt, userPrompt }`. Unit-testable with fixture jsonl files.
- **D-63:** Session boundary heuristic: the Stop hook fires at the END of a session, but Claude Code may leave the jsonl open (appending). The hook reads the file as-is at Stop time. If new content appears after the read, it is missed — accepted tradeoff (capture is fire-and-forget, NOT transactional with the session itself).

### Fail-Silent + Detached Execution (D-64 … D-67)
- **D-64:** **Wrapper + detached child-process:**
  ```sh
  #!/bin/sh
  # hooks/session-end-capture.sh
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  # Launch Node process fully detached; returns to Claude immediately (~10ms)
  (node "$SCRIPT_DIR/session-end-capture.mjs" >/dev/null 2>&1 &) &
  disown 2>/dev/null || true
  exit 0
  ```
  The inner `(... &)` double-fork orphans the Node process from the shell's job table on all POSIX shells, matching the pattern in existing CDS hooks.
- **D-65:** **Inside the Node script:** a top-level `AbortController` with `setTimeout(() => controller.abort(), 60_000)`. The abort signal is passed to every `dispatchAgent` call and every async I/O (DB writes wrapped, fs reads wrapped). On abort, partial work is rolled back (sessions.ts exposes a transactional API per Phase 35 D-37).
- **D-66:** **Error categories:**
  - **Silent (no log, exit 0):** missing `ANTHROPIC_API_KEY` env, missing transcript file, `CLAUDE_SESSION_ID` unset, API rate-limit (429), SQLite busy/locked (transient, next session will capture), user explicitly opted-out via `~/.claude/cds-capture-config.json { enabled: false }`.
  - **Log + continue (append to `~/.claude/cds-capture.log`, exit 0):** schema version mismatch in sessions.db (triggers auto-migrate failure), unexpected Haiku response shape (tool_use absent after 1 retry), partial write rollback.
  - **Log + exit 1:** only for truly unexpected crashes (uncaught exceptions in the hook itself). This is for local debugging — the detached wrapper discards stderr anyway, so exit code is only visible if a user invokes the Node script manually.
- **D-67:** **No retries.** A single Haiku call per Stop hook. If it fails, the session is not captured in SQLite — next session runs fresh. The alternative (retry queue) is deferred to v1.1+ as a background daemon, not worth the complexity in v1.0 alpha.

### Wizard Migration (D-68 … D-70)
- **D-68:** `lib/install/hooks.mjs` replaces every project's `.claude/settings.json` Stop hook list:
  - Remove: `"command": "~/.claude/hooks/session-end-check.sh"` entry (and any parent `hooks.Stop` entries matching that filename)
  - Add: `"command": "~/.claude/hooks/session-end-capture.sh"` entry
  - Both `.sh` (wrapper) and `.mjs` (logic) are copied to `~/.claude/hooks/` — wrapper is registered, Node script is invoked by wrapper.
- **D-69:** Idempotent behavior: wizard scans existing Stop hook entries for `session-end-check.sh` OR `session-end-capture.sh` OR `session-end-capture.mjs`. If capture.sh already registered, no change. If check.sh still registered, replace. If any custom entries exist (user-added), the wizard prints a **warning + manual-migration note**, does NOT touch user entries, and proceeds to add capture.sh alongside. User sees output `⚠ Custom Stop hooks detected in {project}/.claude/settings.json — auto-capture added alongside. Review for conflicts.`
- **D-70:** `skills/session-manager/SKILL.md` description updated with fallback note. SKILL.md `description` field is what drives skill auto-invocation — keeping it slightly narrower ("session management fallback + manual handoffs") reduces auto-invocation while preserving `/end` as a user-invocable command. The skill itself stays installed to `~/.claude/skills/`.

### Integration with Phase 34 + Phase 35 Primitives (D-71 … D-72)
- **D-71:** Hook imports `dispatchAgent`, `Context`, `CostTracker` from `@cds/core`. The `Context` class is NOT persisted by this hook — the hook is stateless per invocation. Observations flow: transcript → Haiku → SQLite. Context.md is a separate concern (session pointer update, D-51/D-54).
- **D-72:** Hook calls `openSessionsDB(projectPath)` from `@cds/core/vault/sessions.ts`. `projectPath` is resolved from `process.env.CLAUDE_PROJECT_DIR` (passed by Claude Code) or fallback to `process.cwd()`. The per-project SQLite file (`~/vault/projects/{basename(projectPath)}/sessions.db`) is auto-migrated on open per Phase 35 D-37 — hook does not do its own migration logic.

### Claude's Discretion
- Exact shape of the `emit_observations` tool definition in SDK JSON schema (`input_schema` field)
- How many Haiku-retry attempts on malformed tool_use (planner decides: 1 default, 2 if appetite for cost)
- Exact file-path pattern for the `cds-capture.log` rotation (e.g., rotate at 1MB, keep last 3)
- Whether to expose a `CDS_CAPTURE_DEBUG=1` env var that turns silent errors into stderr logs (useful for development)
- The `SKILL.md` description rewording for `session-manager` — planner drafts, user can nudge during execution
- Format of the session pointer in context.md (e.g., `## Recent Sessions\n- {date} — [{sessionId}] {summary}` vs richer)

### Folded Todos
- **Phase 26 auto-ADR `/end` round-trip** (from session TODO list): closed retroactively — Phase 36's dispatchAgent replaces the failing `claude -p --model haiku --bare` subprocess; the ADR bridge pathway that was broken is obsoleted by this Phase's auto-capture.
- **v0.12 ADR-02 UAT deferred**: closed retroactively per STATE.md Known Gaps — Phase 36 is the official closure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §CAPTURE-05, CAPTURE-06 — acceptance criteria (hook file location, wizard integration, fail-silent, SQLite write target)
- `.planning/ROADMAP.md` §"Phase 36: Auto Session Capture" — Success Criteria 1-4 (capture detached, context.md pointer, transaction rollback on dispatchAgent throw, wizard replaces old hook)
- `.planning/PROJECT.md` §Constraints — single-dep on CLI surface (SDK is @cds/core internal), ESM-only, no secrets storage (ANTHROPIC_API_KEY already handled by SDK)

### Prior Phase Contexts (carry-forward) — MANDATORY reads
- `.planning/phases/34-sdk-integration-core-primitives/34-CONTEXT.md` — `dispatchAgent` signature (D-17), fail-silent contract (D-32), session_id threading (D-31), no streaming (D-19). NOTICES.md exists.
- `.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md` — `openSessionsDB(projectPath)` API (D-48), schema (D-43..D-47), observations.entities = JSON array of IDs (D-44), entity types = open strings (D-45), auto-migrate (D-37). Node 20+ baseline (D-33).
- `.planning/phases/33-monorepo-foundation/33-CONTEXT.md` — @cds/core is private scoped package, hooks live at repo root `hooks/` (same location as existing CDS hooks, not inside a workspace package).

### v0.12 Context (closed by Phase 36)
- `.planning/STATE.md` §"Known Gaps from v0.12" — ADR-02 UAT deferred, Phase 36 closes retroactively. Phase 36 SUMMARY.md must reference this closure.
- Existing `lib/adr-bridge-session.mjs` — READ for reference (what observations were extracted via `claude -p --bare`). Phase 36 does NOT modify this file; its behavior is superseded by the new capture flow.

### Existing Hooks (Phase 36 replaces / imports)
- `hooks/session-end-check.sh` — REPLACED by Phase 36
- `hooks/update-context.mjs` — IMPORTED by Phase 36 OR inlined (planner decides)
- `hooks/notebooklm-sync-trigger.mjs` — IMPORTED by Phase 36 (not modified)
- `hooks/session-start-context.sh` — UNTOUCHED in Phase 36 (SessionStart hook, separate lifecycle)

### External / Live Docs (for research phase)
- Claude Code session transcript schema — `~/.claude/projects/{slug}/{session_id}.jsonl`
- Anthropic SDK tool_use API + input_schema validation — https://docs.anthropic.com/api/tool-use
- Claude Code Stop hook contract — env vars passed (CLAUDE_SESSION_ID, CLAUDE_PROJECT_DIR), timeout behavior

</canonical_refs>

<code_context>
## Existing Code Insights

### Primitives consumed (Phase 34 + Phase 35)
- `@cds/core/src/agent-dispatcher.ts` → `dispatchAgent({ model: 'haiku', prompt, system, tools: [emitObservationsTool], signal, session_id })` (Phase 34)
- `@cds/core/src/cost-tracker.ts` → `new CostTracker(sessionId)`, `record()`, `total()`, `dump()` (Phase 34)
- `@cds/core/src/vault/sessions.ts` → `openSessionsDB(projectPath)`, `createSession()`, `appendObservation()`, `upsertEntity()`, `linkRelation()` (Phase 35)

### Legacy code (imported or replaced)
- `hooks/session-end-check.sh` — legacy Stop hook. REPLACED entirely by Phase 36 (D-52).
- `hooks/update-context.mjs` — context.md updater. Planner decides import-vs-inline (D-54).
- `hooks/notebooklm-sync-trigger.mjs` — sync trigger, fire-and-forget. IMPORTED by new hook.
- `lib/install/hooks.mjs` — wizard's hook-registration module. MODIFIED to replace `session-end-check.sh` registration with `session-end-capture.sh` (D-68).
- `skills/session-manager/SKILL.md` — description rewording for deprecation (D-70).

### New files (Phase 36)
- `hooks/session-end-capture.sh` — detached-wrapper (POSIX sh, double-fork pattern, <10ms runtime)
- `hooks/session-end-capture.mjs` — main logic (Node ESM, imports from `@cds/core`)
- `packages/cds-core/src/capture/transcript.ts` — transcript parser + prompt builder
- `packages/cds-core/src/capture/prompts.ts` — extraction system prompt + observation types
- `packages/cds-core/src/capture/index.ts` — re-exports for hook consumption
- `packages/cds-core/src/capture/*.test.ts` — unit tests with fixture jsonls

### Integration Points
- Root `hooks/` directory — two new files
- `packages/cds-core/src/capture/` — new directory under @cds/core
- `packages/cds-core/src/index.ts` — add `export * as capture from './capture/index.js'`
- `lib/install/hooks.mjs` — surgical update to hook-registration logic (add removal of old entry + add new entry)
- `skills/session-manager/SKILL.md` — description field update

### Constraints to Factor Into Planning
- Hook MUST run detached in <100ms total (wrapper exec + double-fork + Node script launch). Capture work happens in background Node process, not synchronously.
- `pnpm test` default must NOT hit live API (mock `dispatchAgent` in capture tests — Phase 34 D-32 INTEGRATION=1 gate applies).
- The hook is at repo root `hooks/`, NOT inside `packages/*/` — it's a runtime artifact shipped with the npm package (in the `"files"` array). BUT it imports from `@cds/core` — at runtime, after `pnpm install`, the hook resolves to `packages/cds-core/dist/` via workspace symlinks. When the tarball is bundled in Phase 39, the bundler inlines `@cds/core` into the root package, and the hook resolves to bundled output. Phase 36 does not need to change root `"files"` array — `hooks/` is already listed.
- The 928/931 root test baseline preservation is unaffected — Phase 36 adds NEW tests under `packages/cds-core/src/capture/` and root `tests/hooks/session-end-capture.test.mjs` (optional — integration-level, mockable).

</code_context>

<specifics>
## Specific Ideas

- Hook consolidation (D-51) is a deliberate simplification — maintaining 2-4 Stop hooks with cross-dependencies was the v0.12 complexity that caused ADR-02 bugs in the first place.
- The `$0.02 per session` cost cap (D-58) is a soft guardrail derived from Haiku 4.5 pricing × typical session transcript size. Not a hard block — observations are captured even on overage, just with a log entry. Real-world usage may reveal this is too low; adjust in v1.1+.
- `emit_observations` tool (D-55) uses SDK-native tool_use because it gives us schema validation for free. Alternative (parsing XML in-text) works but provides no enforcement — Haiku could emit malformed output and we'd be left with ad-hoc retries.
- Fail-silent boundary (D-66) is carefully tiered: silence the things that will self-heal (rate limits, busy DBs), log the things that suggest bugs, crash only on truly unexpected state. User-visible impact of any failure should be "no session captured this time", never "CLI broken".
- Wrapper + detached Node (D-64) follows the existing CDS NotebookLM sync pattern — known-good POSIX shell trick for orphaning background work from Claude Code's hook subprocess.

</specifics>

<deferred>
## Deferred Ideas

### For Phase 37 (MCP Adapter)
- `sessions.search` and `sessions.timeline` MCP tools — first real CONSUMER of captured data.

### For Phase 38 (Backfill Migration)
- Same extraction pipeline applied to historical markdown sessions. The `emit_observations` prompt and schema are reused.
- Idempotency: Phase 38 adds `sessions.id` derivation from filename slug to skip already-captured sessions.

### For Phase 39 (Alpha Release)
- `/cds-quick` command runs a one-shot agent and validates the full pipeline (dispatch → capture → SQLite → visible). Phase 39 adds a success-message showing "captured N observations, cost $X, sessionId Y" — Phase 36 exposes all that data.
- Migration guide entry: "v1.0 auto-capture replaces /end — your session logs now live in SQLite, original markdown untouched". Phase 39 writes this.

### For v1.1+ (not this milestone)
- Retry queue (daemon-based) for failed captures
- Live streaming mode for `/cds-quick` (requires `dispatchAgentStream` from Phase 34 deferred)
- Per-observation dedupe via content hash (avoid Haiku re-extracting same decision twice across sessions)
- User-controllable prompt (`~/.claude/cds-capture-config.json { systemPromptOverride: "..." }`)
- Metrics export (how many observations / sessions / $ over time) — probably via new `claude-dev-stack capture stats` CLI subcommand

### Reviewed Todos (not folded)
- None — `todo match-phase 36` returned zero matches.

</deferred>

---

*Phase: 36-auto-session-capture*
*Context gathered: 2026-04-16*
