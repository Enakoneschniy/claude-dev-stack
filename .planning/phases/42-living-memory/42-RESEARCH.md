# Phase 42: Living Memory — Research

**Researched:** 2026-04-17
**Domain:** SQLite session memory surfacing — CLI subcommands, SessionStart hook extension, skills, CLAUDE.md template
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-140:** Extend `hooks/session-start-context.sh` to call `claude-dev-stack memory` CLI subcommand that queries `sessions.timeline` for the last 3 sessions and prints a condensed summary of key observations. Format is a fixed-width text block (not JSON). The `memory` command reads `sessions.db` directly — no MCP round-trip.

**D-141:** Update the CLAUDE.md template in `lib/install/claude-md.mjs` to include a "Memory" section instructing Claude to call `sessions.search`, `docs.search`, and `planning.status` MCP tools automatically. Placement: after "Session Protocol" section.

**D-142:** `/cds-search` skill wraps `sessions.search` MCP tool (`mcp__cds__sessions.search`). Falls back to `claude-dev-stack search "query"` via Bash if MCP unavailable.

**D-143:** `/cds-stats` skill calls `mcp__cds__planning.status` + `sessions.timeline` counts. Outputs session count, observation count by type, top entities, last activity.

**D-144:** `claude-dev-stack search "query"` CLI subcommand. Imports from `@cds/core` or reads `sessions.db` directly. Outputs to stdout. Works outside Claude Code.

**D-145:** `claude-dev-stack stats` CLI subcommand. Reads `sessions.db` directly, prints dashboard: project name, session count, observation counts by type, entity count, last activity.

**D-146:** `claude-dev-stack memory` CLI subcommand. Internal — called by SessionStart hook. Reads last N sessions from `sessions.db`, prints condensed summary to stdout. No help entry.

### Claude's Discretion

- Exact session count for "last N sessions" in `memory` command (D-140 says 3)
- Which observation types to highlight in condensed summary
- Whether `stats` reuses the existing `analytics` case or overrides it
- How `/cds-stats` formats entity counts without FTS (direct SQL COUNT)
- TypeScript file naming and module structure for new CLI commands
- Where in `tsup.config.ts` to add new entrypoints

### Deferred Ideas (OUT OF SCOPE)

- Real-time observation capture during session (not just at Stop hook)
- Entity relationship graph visualization
- Cross-project memory search
- Auto-suggestion of relevant past observations during coding
</user_constraints>

---

## Summary

Phase 42 connects the existing Phase 37 SQLite memory layer to the surfaces where it is actually used: the SessionStart hook, the CLI, skills, and CLAUDE.md instructions. The memory infrastructure (better-sqlite3, FTS5, `openSessionsDB`, MCP tools) is fully built and tested. This phase is entirely about plumbing — wiring callers to existing APIs.

The most important discovery: the `SessionsDB` interface (sessions.ts) does NOT expose a `listSessions` or `getRecentSessions` method. The `memory` (D-146) and `stats` (D-145) commands need to query `sessions` and `observations` tables directly. Two implementation paths exist: (a) add a `listSessions` method to `SessionsDB` API, or (b) open a read-only `better-sqlite3` connection in the new CLI modules and query directly (bypassing the `openSessionsDB` factory). Path (a) is cleaner and consistent with VAULT-03 boundary rules; path (b) violates the "no direct SQL outside sessions.ts" principle.

The `stats` CLI case name conflicts with the existing `analytics/stats/status` alias in `bin/cli.mjs`. The current `stats` routes to `lib/analytics.mjs` which reads markdown vault — the new Phase 42 `stats` should route to a TypeScript module that reads SQLite. Decision: the planner must pick a routing strategy (new `case 'db-stats'` vs override `stats` to delegate to both old + new).

**Primary recommendation:** Add `listSessions(options?: { limit?: number; project?: string })` and `countObservationsByType()` methods to the `SessionsDB` interface + implementation in `sessions.ts` first (Wave 1 Task 0). All other commands build on those methods.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SessionStart context injection (D-140, D-146) | Hook (shell) | CLI (Node) | Hook is POSIX shell; delegates to `claude-dev-stack memory` subprocess |
| `claude-dev-stack memory` output formatting | CLI (TypeScript) | — | Runs at session start, must be synchronous and fast |
| `claude-dev-stack search` | CLI (TypeScript) | SQLite (better-sqlite3 FTS5) | Thin wrapper over existing `sessionsSearch` function |
| `claude-dev-stack stats` | CLI (TypeScript) | SQLite (better-sqlite3) | Reads sessions.db via `openSessionsDB` or direct SQL |
| `/cds-search` skill | Claude Code skill | MCP server (primary) / CLI (fallback) | Skill dispatches MCP tool; falls back to Bash CLI |
| `/cds-stats` skill | Claude Code skill | MCP server | Skill dispatches MCP tools for counts |
| CLAUDE.md Memory section | Template generator (lib/install/claude-md.mjs) | — | Inserted at `managedBody` build time |

---

## Standard Stack

### Core (all already installed — verified in codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.9.0 | Direct SQLite reads in CLI commands | [VERIFIED: packages/cds-cli/package.json] — already the project's SQLite driver |
| @cds/core | workspace:* | Re-export of `openSessionsDB`, session types | [VERIFIED: codebase] — the vault public API |
| @cds/cli mcp-tools | internal | `sessionsSearch`, `sessionsTimeline` functions | [VERIFIED: codebase] — Phase 37 implementations |

No new npm dependencies needed for this phase. All required packages are already installed.

**Installation:** None required.

---

## Architecture Patterns

### System Architecture Diagram

```
SessionStart hook (bash)
        |
        v
claude-dev-stack memory  ──────────────────────────────────────────────────────────
        |                                                                          |
        v                                                                          |
 new: memory.ts          reads sessions.db via openSessionsDB                     |
        |                                                                          |
        v                                                                          |
stdout block injected into Claude's context                                        |
                                                                                   |
User types /cds-search "query"                                                     |
        |                                                                          |
        v                                                                          v
 skill: cds-search/SKILL.md ──> mcp__cds__sessions.search ──> MCP server ──> sessions.db
        |  (MCP unavailable)
        v
 Bash: claude-dev-stack search "query"
        |
        v
 new: search.ts ──> sessionsSearch() (existing Phase 37 function) ──> sessions.db

User types /cds-stats
        |
        v
 skill: cds-stats/SKILL.md ──> mcp__cds__planning.status + sessions.timeline
        |
        v
 formatted stats output

claude-dev-stack stats (terminal)
        |
        v
 new: stats.ts ──> openSessionsDB ──> direct SQL COUNT queries ──> sessions.db

claude-dev-stack wizard
        |
        v
lib/install/claude-md.mjs ──> managedBody += Memory section ──> CLAUDE.md
```

### Recommended Project Structure

New files to add:

```
packages/cds-cli/src/
├── memory.ts          # D-146: SessionStart helper — list recent sessions + observations
├── search.ts          # D-144: CLI search subcommand wrapping sessionsSearch()
├── stats.ts           # D-145: CLI stats dashboard reading sessions.db
├── memory.test.ts     # unit tests for memory.ts
├── search.test.ts     # unit tests for search.ts
└── stats.test.ts      # unit tests for stats.ts

skills/
├── cds-search/
│   └── SKILL.md       # D-142: /cds-search skill
└── cds-stats/
    └── SKILL.md       # D-143: /cds-stats skill
```

The `memory` command is internal — it does NOT get a new `tsup.config.ts` entrypoint if bundled as part of `cli/index`. However, because `bin/cli.mjs` uses dynamic `import(resolveDistPath(...))` for each command, it is cleanest to add entrypoints for `search`, `stats`, and `memory` to `tsup.config.ts`. [ASSUMED: exact entrypoint strategy — planner should verify]

### Pattern 1: Extending SessionsDB for list + count (required)

The `SessionsDB` interface in `packages/cds-core/src/vault/sessions.ts` needs two new methods before any consumer code can be written. This is a prerequisite for Plans 01 and 02.

```typescript
// Source: packages/cds-core/src/vault/sessions.ts (existing interface to extend)

// New method: list sessions ordered by start_time DESC
listSessions(options?: { limit?: number; project?: string }): Session[];

// New method: count observations grouped by type
countObservationsByType(): Array<{ type: string; count: number }>;
```

Add prepared statements in `buildSessionsHandle()`:

```typescript
// Source: [ASSUMED — pattern from existing code in sessions.ts]
const listSessionsStmt = db.prepare(
  'SELECT id, start_time, end_time, project, summary FROM sessions ' +
  'WHERE (@project IS NULL OR project = @project) ' +
  'ORDER BY start_time DESC LIMIT @limit'
);

const countByTypeStmt = db.prepare(
  'SELECT type, COUNT(*) AS count FROM observations GROUP BY type ORDER BY count DESC'
);
```

**Why not bypass via direct SQL in CLI modules:** VAULT-03 principle locks all SQLite reads/writes to the `sessions.ts` API. The `vault.boundary.test.ts` file enforces this with a static scan. Bypassing causes test failures.

### Pattern 2: `memory.ts` — fast synchronous read

```typescript
// Source: [ASSUMED — pattern based on sessionsSearch and existing sessions.ts]
// packages/cds-cli/src/memory.ts

import { openSessionsDB, closeSessionsDB } from '@cds/core';

export interface MemoryOptions {
  projectPath: string;
  sessionCount?: number;  // default 3
}

export function formatMemorySummary(options: MemoryOptions): string {
  const db = openSessionsDB(options.projectPath);
  try {
    const sessions = db.listSessions({ limit: options.sessionCount ?? 3 });
    // format each session as one line with observation count + topic snippets
    // ...
  } finally {
    closeSessionsDB(options.projectPath);
  }
}

export async function main(args: string[]): Promise<void> {
  const output = formatMemorySummary({ projectPath: process.cwd() });
  process.stdout.write(output + '\n');
}
```

The hook calls it via:
```bash
MEMORY_OUT=$(node "$HOOKS_DIR/../bin/cli.mjs" memory 2>/dev/null)
if [ -n "$MEMORY_OUT" ]; then
  echo ""
  echo "$MEMORY_OUT"
fi
```

### Pattern 3: `search.ts` — reuse sessionsSearch from mcp-tools

```typescript
// Source: packages/cds-cli/src/mcp-tools/sessions-search.ts (existing)
import { sessionsSearch } from './mcp-tools/sessions-search.js';

export async function main(args: string[]): Promise<void> {
  const query = args[0];
  const dbPath = resolveDbPath(process.cwd());
  const result = await sessionsSearch({ query }, { dbPath });
  // format hits as readable list
}
```

`sessionsSearch` already accepts `{ dbPath }` as deps — no extra wrapping needed.

### Pattern 4: Skill SKILL.md structure (follows cds-quick pattern)

```markdown
---
name: cds-search
description: |
  Search past session observations using MCP tool sessions.search.
  Falls back to CLI if MCP server is not available.
trigger_phrases:
  - /cds-search
  - cds-search
---

# /cds-search — Search session memory

...
```

[VERIFIED: skills/cds-quick/SKILL.md] — existing skill uses this frontmatter format.

### Pattern 5: CLAUDE.md managed section update

The `managedBody` string in `lib/install/claude-md.mjs` is built with template literal concatenation. Add a `## Memory` section between `## Session Protocol` and `## Code Style`:

```javascript
// Source: lib/install/claude-md.mjs (existing structure)
const managedBody = `## Language
...

## Session Protocol
...

## Memory
When the user asks about past decisions, work done, bugs found, or patterns established:
- Call \`mcp__cds__sessions.search\` with the topic as query
- Never say "I don't have access to past sessions" — always try the MCP tool first
When the user asks about project documentation:
- Call \`mcp__cds__docs.search\` with the query
When the user asks about project progress:
- Call \`mcp__cds__planning.status\` (no args needed)

## Code Style
...`;
```

[VERIFIED: lib/install/claude-md.mjs lines 68-109] — template uses exact backtick string format shown.

### Anti-Patterns to Avoid

- **Direct SQLite in CLI modules bypassing sessions.ts:** vault.boundary.test.ts scans for imports of `better-sqlite3` outside `packages/cds-core/src/vault/`. Adding direct DB access in `packages/cds-cli/src/memory.ts` will fail this test. All access must go through `openSessionsDB`.
- **Synchronous `process.exit` in library functions:** `quick.ts` shows the pattern — `main()` calls `process.exit` only at the top level. Pure functions (`formatMemorySummary`, etc.) must not call `process.exit`.
- **Adding `stats` as a new case when it already exists:** `bin/cli.mjs` already has `case 'stats': case 'status':` routing to `lib/analytics.mjs`. Adding another `case 'stats'` is a syntax error. The planner must either (a) modify the existing case to delegate based on a flag, or (b) use a different case name like `case 'mem-stats'`.
- **Forgetting tsup entrypoints:** New TypeScript modules under `packages/cds-cli/src/` that `bin/cli.mjs` imports via `resolveDistPath` must have entries in `tsup.config.ts`. Missing entry = `Cannot find module` at runtime.
- **Hook stdout pollution:** Any `console.error` or debug output to stderr is fine; anything to stdout appears in Claude's context. New CLI commands should write errors to `process.stderr`, data to `process.stdout`.
- **Skill MCP tool name format:** The MCP server registers tools as `sessions.search`, `sessions.timeline`, etc. Claude Code MCP tool call syntax uses double underscore prefix: `mcp__cds__sessions.search`. Skills must use this exact naming.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FTS5 search over observations | Custom search algorithm | `sessionsSearch()` from `mcp-tools/sessions-search.ts` | Already handles BM25 ranking, filter push-down, FTS5 error handling |
| Session listing with pagination | Custom SQL in memory.ts | `SessionsDB.listSessions()` (new method, extends existing API) | Consistent with VAULT-03 boundary; avoids test failures |
| MCP tool dispatch from skill | Bash subprocess | `mcp__cds__sessions.search` call in SKILL.md | Skills can call MCP tools directly — no subprocess needed |
| DB path resolution | Custom path logic | `openSessionsDB(process.cwd())` | Factory handles `~/vault/projects/{basename}/sessions.db` resolution |

---

## Runtime State Inventory

> Not a rename/refactor phase — this section is OMITTED per instructions.

---

## Common Pitfalls

### Pitfall 1: `stats` case collision in bin/cli.mjs

**What goes wrong:** Adding `case 'stats':` will cause a duplicate case error or silently override the existing analytics route.
**Why it happens:** `bin/cli.mjs` already has `case 'analytics': case 'stats': case 'status':` routing to `lib/analytics.mjs`.
**How to avoid:** Either modify the existing stats case to call a new `cli/db-stats.js` module, or add a separate case name. Recommended: modify the existing `case 'stats'` to check for a `--sqlite` flag, or rename the new command to `mem-stats`.
**Warning signs:** `lib/analytics.mjs` no longer runs when `claude-dev-stack stats` is called.

### Pitfall 2: VAULT-03 boundary violation in new CLI modules

**What goes wrong:** `vault.boundary.test.ts` scans all `packages/cds-cli/src/*.ts` for `import.*better-sqlite3`. If `memory.ts` or `search.ts` import `better-sqlite3` directly, the test fails.
**Why it happens:** VAULT-03 enforces that only `packages/cds-core/src/vault/sessions.ts` touches SQLite. The test enforces this at the file level.
**How to avoid:** All new CLI modules must import via `@cds/core` (`openSessionsDB`) or call existing `mcp-tools/sessions-search.ts` function. Never `import Database from 'better-sqlite3'` outside vault/.
**Warning signs:** `vault.boundary.test.ts` test failure.

### Pitfall 3: Missing tsup entrypoints

**What goes wrong:** `bin/cli.mjs` does `import(resolveDistPath('cli/memory.js'))` but dist/cli/memory.js doesn't exist → `Error [ERR_MODULE_NOT_FOUND]` at runtime.
**Why it happens:** `tsup.config.ts` entry map must explicitly list each new file.
**How to avoid:** Add entrypoints for `cli/memory`, `cli/search`, `cli/stats` to `tsup.config.ts` entry object. Run `pnpm tsup` after.
**Warning signs:** Works in dev (`CDS_DEV=1`) but not in production build.

### Pitfall 4: SessionsDB has no listSessions method yet

**What goes wrong:** `memory.ts` calls `db.listSessions()` → TypeScript compile error + runtime error.
**Why it happens:** Phase 37 only implemented `searchObservations` and `timeline`. `listSessions` and `countObservationsByType` do not exist.
**How to avoid:** Plan 01 Wave 1 must add these methods to `SessionsDB` interface + `buildSessionsHandle()` before writing `memory.ts`. This is a hard prerequisite.
**Warning signs:** TS error "Property 'listSessions' does not exist on type 'SessionsDB'".

### Pitfall 5: SessionStart hook reads ALL stdout from `memory` command

**What goes wrong:** If `memory.ts` imports modules that print debug/startup output, that output gets injected into Claude's context as memory.
**Why it happens:** The hook runs `MEMORY_OUT=$(node ... memory)` and captures all stdout.
**How to avoid:** `memory.ts` main() must write ONLY the formatted summary to stdout. All error/debug paths write to stderr.
**Warning signs:** Claude's context contains unexpected text at session start.

### Pitfall 6: Skill MCP fallback via Bash — path resolution

**What goes wrong:** `/cds-search` Bash fallback calls `claude-dev-stack search` but the binary is not on PATH in some environments.
**Why it happens:** If `claude-dev-stack` is installed locally (`node_modules/.bin/`) rather than globally, the Bash subcommand may fail.
**How to avoid:** In skill SKILL.md, use `npx claude-dev-stack search` as fallback, or detect CDS installation path.
**Warning signs:** Fallback silently returns empty output.

---

## Code Examples

### Extending SessionsDB with listSessions

```typescript
// Source: packages/cds-core/src/vault/sessions.ts (to be extended)

// In interface SessionsDB:
listSessions(options?: { limit?: number; project?: string }): Session[];
countObservationsByType(): Array<{ type: string; count: number }>;

// In buildSessionsHandle():
const listSessionsStmt = db.prepare(
  'SELECT id, start_time, end_time, project, summary FROM sessions ' +
  'WHERE (@project IS NULL OR project = @project) ' +
  'ORDER BY start_time DESC LIMIT @limit'
);
const countByTypeStmt = db.prepare(
  'SELECT type, COUNT(*) as count FROM observations GROUP BY type ORDER BY count DESC'
);

// In handle object:
listSessions({ limit = 20, project } = {}) {
  return listSessionsStmt.all({ project: project ?? null, limit }) as Session[];
},

countObservationsByType() {
  return countByTypeStmt.all() as Array<{ type: string; count: number }>;
},
```

### Hook extension (session-start-context.sh)

```bash
# Source: hooks/session-start-context.sh (to be extended, after budget check block)

# D-140: SQLite memory injection
MEMORY_OUT=$(node "$HOOKS_DIR/../bin/cli.mjs" memory 2>/dev/null)
if [ -n "$MEMORY_OUT" ]; then
  echo ""
  echo "$MEMORY_OUT"
fi
```

### memory command output format (D-140)

```
Recent memory (from SQLite):
Session 2026-04-17: [3 observations] -- Phase 41 UAT, Docker devcontainer, /cds-quick rewrite
Session 2026-04-16: [5 observations] -- Phase 39 execute, Phase 40 plan+execute
Session 2026-04-15: [2 observations] -- Phase 38 backfill migration

Use sessions.search MCP tool for deeper queries.
```

Note: D-140 uses emoji in the spec (`📋`). Omit emojis per project style unless the user explicitly used them. [ASSUMED — planner should confirm emoji preference]

### stats command output (D-145)

```
Project: claude-dev-stack
Sessions: 42 (7 this week)
Observations: 156 (decisions: 34, bugs: 12, patterns: 28, other: 82)
Entities: 89 (top: SQLite, dispatchAgent, Phase 39, Claude Code, tsup)
Last activity: 2026-04-17
```

This requires: session count, week-filtered count, observation counts by type (`countObservationsByType()`), entity count (`SELECT COUNT(*) FROM entities`), last activity from `MAX(start_time)`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `/end` → write markdown session logs | Auto Stop hook → write SQLite observations | Phase 36 | Session data is in SQLite, not just markdown |
| CLAUDE.md loads `context.md` only | CLAUDE.md + SQLite summary injection via hook | Phase 42 (this phase) | Claude starts sessions with memory of last 3 sessions |
| MCP tools exist but unused (nobody calls them) | CLAUDE.md template instructs Claude to call MCP tools | Phase 42 (this phase) | sessions.search becomes default behavior |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `memory.ts` should use a tsup entrypoint rather than be bundled into `cli/index` | Standard Stack / Pitfall 3 | If bundled into index, the entrypoint strategy in cli.mjs needs to change |
| A2 | The `stats` case conflict should be resolved by modifying the existing case, not adding a new one | Pitfall 1 | Could use a separate case name instead — planner should verify |
| A3 | Emoji in `memory` output format should be omitted per style (D-140 spec shows 📋) | Code Examples | User may want emoji retained from D-140 spec |
| A4 | `countObservationsByType` is the right helper for stats — no existing utility | Code Examples | May need verification that no such method already exists |

---

## Open Questions (RESOLVED)

1. **stats case name collision** — RESOLVED: Use `case 'mem-stats':` to avoid collision with existing `case 'stats':` routing to `lib/analytics.mjs`.

2. **`listSessions` return for observations summary in `memory` command** — RESOLVED: Add `listSessions(limit)` to SessionsDB returning recent sessions with summary. Use two queries (listSessions + countObservationsByType per session) for clarity.

3. **`sessions.timeline` vs `listSessions` for D-146** — RESOLVED: Interpret D-140/D-146 "queries sessions.timeline" as "query recent sessions chronologically" using new `listSessions` method. The word "timeline" refers to chronological order, not the specific MCP tool.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| better-sqlite3 | All new CLI commands (via @cds/core) | ✓ | ^12.9.0 | — |
| Node.js | CLI execution | ✓ | (project requirement) | — |
| sessions.db | memory/search/stats at runtime | depends on user setup | — | Fail-silent with empty output |

**Missing dependencies with no fallback:**
- `sessions.db` must exist at `~/vault/projects/{project}/sessions.db` — if it doesn't exist (no Phase 36 auto-capture yet, no Phase 38 migration run), all new commands must fail gracefully with a helpful message rather than crashing.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (workspace-aware) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `pnpm test --filter @cds/cli` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `memory.ts` formats summary from in-memory DB | unit | `pnpm test --filter @cds/cli -- memory` | Wave 0 |
| `search.ts` passes query to sessionsSearch | unit | `pnpm test --filter @cds/cli -- search` | Wave 0 |
| `stats.ts` prints dashboard with correct counts | unit | `pnpm test --filter @cds/cli -- stats` | Wave 0 |
| `listSessions` returns sessions DESC | unit | `pnpm test --filter @cds/core -- sessions` | Extend existing |
| `countObservationsByType` returns counts | unit | `pnpm test --filter @cds/core -- sessions` | Extend existing |
| vault.boundary: no direct sqlite3 in new CLI files | static scan | `pnpm test --filter @cds/core -- vault.boundary` | Already exists |
| SKILL.md files valid YAML frontmatter | manual | — | Wave 0 |
| Hook extension: memory output appears in stdout | integration | manual (hook) | manual-only |

### Sampling Rate

- **Per task commit:** `pnpm test --filter @cds/cli`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/cds-cli/src/memory.test.ts` — covers memory formatting with stub DB
- [ ] `packages/cds-cli/src/search.test.ts` — covers search query forwarding
- [ ] `packages/cds-cli/src/stats.test.ts` — covers stats output formatting
- [ ] Extend `packages/cds-core/src/vault/sessions.test.ts` — `listSessions` + `countObservationsByType`

---

## Security Domain

> No network endpoints, no auth tokens, no user input passed to external services. The only user-controlled input is the search query string passed to FTS5.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | FTS5 already validated in sessionsSearch — `InvalidFilterError` on malformed query |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| FTS5 MATCH injection | Tampering | Handled by sessionsSearch — InvalidFilterError on SQLITE_ERROR |
| Path traversal in projectPath | Tampering | `basename(projectPath)` in `openSessionsDB` limits to project name only |

---

## Sources

### Primary (HIGH confidence)

- `packages/cds-core/src/vault/sessions.ts` — confirmed interface: `createSession`, `appendObservation`, `searchObservations`, `timeline`, `upsertEntity`, `linkRelation`, `close`. No `listSessions` or `countObservationsByType`.
- `packages/cds-core/src/vault/internal/migrations/001-initial.sql` — confirmed schema: sessions, observations (with type column), entities, relations, observations_fts (FTS5)
- `packages/cds-cli/src/mcp-tools/sessions-search.ts` — confirmed `sessionsSearch({ query }, { dbPath })` function signature and deps injection pattern
- `hooks/session-start-context.sh` — confirmed injection pattern: append text to stdout, fail-silent via `2>/dev/null || true`
- `bin/cli.mjs` — confirmed: `case 'stats': case 'status':` already exists routing to `lib/analytics.mjs`; `case 'memory':` does not exist; `case 'search':` does not exist
- `tsup.config.ts` — confirmed: entry map is exhaustive; new modules require explicit entries
- `lib/install/claude-md.mjs` — confirmed: `managedBody` template literal structure, placement of sections
- `skills/cds-quick/SKILL.md` — confirmed: YAML frontmatter format for skills
- `.planning/config.json` — confirmed: `nyquist_validation: true`

### Secondary (MEDIUM confidence)

- `.planning/phases/42-living-memory/42-CONTEXT.md` — decision spec (user decisions, plan structure)

---

## Project Constraints (from CLAUDE.md)

- All code and commits in English
- Conventional commits: `feat:`, `fix:`, `chore:`
- Do NOT delete code without explicit request
- On new dependency: explain in session log
- `.planning/` exists — project uses GSD; respect its state
- Branching strategy: `phase` → `gsd/phase-{phase}-{slug}`, PR-only to main

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries verified in codebase
- Architecture: HIGH — all integration points verified by reading actual source files
- Pitfalls: HIGH — vault boundary test, tsup config, and case collision all verified by reading source

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable codebase — no external deps changing)
