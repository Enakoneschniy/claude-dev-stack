# Phase 42: Living Memory - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 11 new/modified files
**Analogs found:** 10 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/cds-core/src/vault/sessions.ts` (extend) | service/model | CRUD | self (add methods) | exact |
| `packages/cds-cli/src/memory.ts` | utility/CLI command | request-response | `packages/cds-cli/src/quick.ts` | role-match |
| `packages/cds-cli/src/search.ts` | utility/CLI command | request-response | `packages/cds-cli/src/quick.ts` | role-match |
| `packages/cds-cli/src/stats.ts` | utility/CLI command | request-response | `packages/cds-cli/src/quick.ts` | role-match |
| `packages/cds-cli/src/memory.test.ts` | test | — | `packages/cds-cli/src/quick.test.ts` | exact |
| `packages/cds-cli/src/search.test.ts` | test | — | `packages/cds-cli/src/mcp-tools/sessions-search.test.ts` | role-match |
| `packages/cds-cli/src/stats.test.ts` | test | — | `packages/cds-cli/src/quick.test.ts` | role-match |
| `hooks/session-start-context.sh` (extend) | hook/shell | event-driven | self (extend pattern) | exact |
| `tsup.config.ts` (extend) | config | — | self (extend entry map) | exact |
| `bin/cli.mjs` (extend) | router | request-response | self (add cases) | exact |
| `skills/cds-search/SKILL.md` | skill | — | `skills/cds-quick/SKILL.md` | exact |
| `skills/cds-stats/SKILL.md` | skill | — | `skills/cds-quick/SKILL.md` | exact |
| `lib/install/claude-md.mjs` (extend) | config/template | — | self (extend managedBody) | exact |

---

## Pattern Assignments

### `packages/cds-core/src/vault/sessions.ts` — extend with new methods

**Analog:** self — `packages/cds-core/src/vault/sessions.ts`

**Interface extension pattern** (after line 132, inside `SessionsDB` interface):
```typescript
listSessions(options?: { limit?: number; project?: string }): Session[];
countObservationsByType(): Array<{ type: string; count: number }>;
```

**Prepared statement pattern** (lines 222-262 — how existing statements are defined):
```typescript
// Pattern: define prepared statement at top of buildSessionsHandle, run or all() to execute
const createSessionStmt = db.prepare(
  'INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)',
);
// Named bindings use @param style:
const searchStmt = db.prepare(
  'SELECT ... WHERE observations_fts MATCH ? ORDER BY rank LIMIT ?',
);
```

**New prepared statements to add** (after `timelineStmt` at line 261):
```typescript
const listSessionsStmt = db.prepare(
  'SELECT id, start_time, end_time, project, summary FROM sessions ' +
  'WHERE (@project IS NULL OR project = @project) ' +
  'ORDER BY start_time DESC LIMIT @limit'
);
const countByTypeStmt = db.prepare(
  'SELECT type, COUNT(*) AS count FROM observations GROUP BY type ORDER BY count DESC'
);
```

**Handle method pattern** (lines 264-358 — how handle object methods are written):
```typescript
// Pattern: method on handle object, uses prepared stmt .all() or .run()
timeline(anchorObservationId, window = 5) {
  const anchor = anchorStmt.get(anchorObservationId) as
    | { session_id: string; id: number }
    | undefined;
  if (!anchor) return [];
  const rows = timelineStmt.all(
    anchor.session_id,
    anchor.id - window,
    anchor.id + window,
  ) as ObservationRow[];
  return rows.map(parseObservation);
},
```

**New methods to add** (after `timeline`, before `close`):
```typescript
listSessions({ limit = 20, project } = {}) {
  return listSessionsStmt.all({ project: project ?? null, limit }) as Session[];
},

countObservationsByType() {
  return countByTypeStmt.all() as Array<{ type: string; count: number }>;
},
```

---

### `packages/cds-cli/src/memory.ts` (utility, request-response)

**Analog:** `packages/cds-cli/src/quick.ts`

**Imports pattern** (quick.ts lines 1-6 — minimal @cds/core imports + node builtins):
```typescript
import { openSessionsDB, closeSessionsDB } from '@cds/core';
```

**No direct better-sqlite3 import** — VAULT-03 enforces that only `packages/cds-core/src/vault/sessions.ts` imports `better-sqlite3`. Any `import Database from 'better-sqlite3'` in new CLI modules causes `vault.boundary.test.ts` to fail.

**Core function structure pattern** (quick.ts lines 43-92 — pure functions + main entry):
```typescript
// Pattern: export named pure function + export async main(args)
export interface MemoryOptions {
  projectPath: string;
  sessionCount?: number;
}

export function formatMemorySummary(options: MemoryOptions): string {
  const db = openSessionsDB(options.projectPath);
  try {
    const sessions = db.listSessions({ limit: options.sessionCount ?? 3 });
    // format each session line: date, count, topic excerpt
    return lines.join('\n');
  } finally {
    closeSessionsDB(options.projectPath);
  }
}

export async function main(_args: string[]): Promise<void> {
  try {
    const output = formatMemorySummary({ projectPath: process.cwd() });
    process.stdout.write(output + '\n');
  } catch {
    // fail-silent: hook captures all stdout; any crash must not pollute context
    process.stderr.write('cds memory: failed to load SQLite summary\n');
  }
}
```

**Error handling pattern** (quick.ts lines 64-69 — errors to stderr, process.exit only in main):
```typescript
// Errors write to process.stderr, NOT console.error (avoids stdout pollution)
// process.exit() only in main(), never in pure functions
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`cds memory: ${msg}\n`);
}
```

**Output format** (D-140 spec — no emojis per project style):
```
Recent memory (from SQLite):
Session 2026-04-17: [3 observations] -- Phase 41 UAT, Docker devcontainer, /cds-quick rewrite
Session 2026-04-16: [5 observations] -- Phase 39 execute, Phase 40 plan+execute
Session 2026-04-15: [2 observations] -- Phase 38 backfill migration

Use sessions.search MCP tool for deeper queries.
```

---

### `packages/cds-cli/src/search.ts` (utility, request-response)

**Analog:** `packages/cds-cli/src/quick.ts` + `packages/cds-cli/src/mcp-tools/sessions-search.ts`

**Imports pattern** — reuse existing sessionsSearch function:
```typescript
import { sessionsSearch } from './mcp-tools/sessions-search.js';
```

**DB path resolution pattern** — sessionsSearch accepts `{ dbPath }` deps injection (sessions-search.ts lines 41-43):
```typescript
export type SessionsSearchDeps =
  | { dbPath: string; db?: undefined }
  | { db: Database.Database; dbPath?: undefined };
```

So `search.ts` resolves the DB path with `homedir() + /vault/projects/ + basename(cwd()) + /sessions.db` and passes it as `deps: { dbPath }`.

**Core pattern:**
```typescript
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { sessionsSearch } from './mcp-tools/sessions-search.js';

function resolveDbPath(projectPath: string): string {
  return join(homedir(), 'vault', 'projects', basename(projectPath), 'sessions.db');
}

export async function main(args: string[]): Promise<void> {
  const query = args[0];
  if (!query) {
    process.stderr.write('Usage: claude-dev-stack search "<query>"\n');
    process.exit(1);
  }
  try {
    const result = await sessionsSearch({ query }, { dbPath: resolveDbPath(process.cwd()) });
    if (result.hits.length === 0) {
      process.stdout.write('No results found.\n');
      return;
    }
    for (const hit of result.hits) {
      process.stdout.write(`[${hit.type}] ${hit.content.slice(0, 120)}\n`);
      process.stdout.write(`  session: ${hit.session_id} | ${hit.created_at}\n\n`);
    }
    process.stdout.write(`${result.total_matched} result(s) in ${result.query_time_ms}ms\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`search error: ${msg}\n`);
    process.exit(1);
  }
}
```

---

### `packages/cds-cli/src/stats.ts` (utility, request-response)

**Analog:** `packages/cds-cli/src/quick.ts`

**Imports pattern** — uses `openSessionsDB` from `@cds/core`:
```typescript
import { openSessionsDB, closeSessionsDB } from '@cds/core';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
```

**Core pattern** — reads sessions.db via openSessionsDB, calls new methods:
```typescript
export async function main(_args: string[]): Promise<void> {
  const projectPath = process.cwd();
  const projectName = basename(projectPath);
  let db;
  try {
    db = openSessionsDB(projectPath);
    const sessions = db.listSessions();
    const countsByType = db.countObservationsByType();
    // compute week count, total observations, entity count via direct method or extra SQL
    // print dashboard to stdout
    const total = countsByType.reduce((s, r) => s + r.count, 0);
    const lines = [
      `Project: ${projectName}`,
      `Sessions: ${sessions.length}`,
      `Observations: ${total} (${countsByType.map(r => `${r.type}: ${r.count}`).join(', ')})`,
      `Last activity: ${sessions[0]?.start_time?.slice(0, 10) ?? 'none'}`,
    ];
    process.stdout.write(lines.join('\n') + '\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`stats error: ${msg}\n`);
    process.exit(1);
  } finally {
    if (db) closeSessionsDB(projectPath);
  }
}
```

**Note on `case 'stats'` collision in bin/cli.mjs** (bin/cli.mjs lines 267-273): The existing `case 'analytics': case 'stats': case 'status':` routes to `lib/analytics.mjs`. The planner must choose: (a) modify existing case to check `--sqlite` flag and delegate, or (b) use a new case alias like `case 'mem-stats':`. Recommended: use `case 'mem-stats':` for now to avoid breaking existing analytics route.

---

### `packages/cds-cli/src/memory.test.ts` (test)

**Analog:** `packages/cds-cli/src/quick.test.ts`

**Test structure pattern** (quick.test.ts lines 1-50 — vi.mock, hoisted mocks, describe/it):
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock openSessionsDB from @cds/core
const { mockDbHandle } = vi.hoisted(() => ({
  mockDbHandle: {
    listSessions: vi.fn(() => []),
    close: vi.fn(),
  },
}));

vi.mock('@cds/core', () => ({
  openSessionsDB: vi.fn(() => mockDbHandle),
  closeSessionsDB: vi.fn(),
}));

import { formatMemorySummary, main } from './memory.js';

describe('memory.ts formatMemorySummary', () => {
  beforeEach(() => {
    mockDbHandle.listSessions.mockClear();
  });

  it('returns empty message when no sessions', () => {
    mockDbHandle.listSessions.mockReturnValue([]);
    const out = formatMemorySummary({ projectPath: '/fake/path' });
    expect(out).toContain('Use sessions.search');
  });
});
```

**process.exit spy pattern** (quick.test.ts lines 84-97):
```typescript
exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`exit:${code}`);
});
// In afterEach: exitSpy.mockRestore();
```

---

### `packages/cds-cli/src/search.test.ts` (test)

**Analog:** `packages/cds-cli/src/mcp-tools/sessions-search.test.ts`

**Fixture pattern** (sessions-search.test.ts lines 1-14 — import buildFixtureSessionsDB):
```typescript
import { buildFixtureSessionsDB, type FixtureHandle } from './__fixtures__/build-sessions-db.js';
// Provides an in-memory better-sqlite3 DB with pre-seeded sessions + observations
// Pass as deps: { db: fixture.db } to sessionsSearch
```

**Alternative mock pattern** (quick.test.ts style — vi.mock the dependency):
```typescript
vi.mock('./mcp-tools/sessions-search.js', () => ({
  sessionsSearch: vi.fn(async () => ({ hits: [], total_matched: 0, query_time_ms: 0 })),
}));
```

---

### `packages/cds-cli/src/stats.test.ts` (test)

**Analog:** `packages/cds-cli/src/quick.test.ts`

Same pattern as `memory.test.ts`: mock `@cds/core` openSessionsDB/closeSessionsDB, mock `listSessions` and `countObservationsByType` return values, spy on `process.stdout.write` to verify output format.

---

### `hooks/session-start-context.sh` — extend

**Analog:** self — `hooks/session-start-context.sh`

**Extension point** — append after the budget check block (lines 81-85):
```bash
# Source: hooks/session-start-context.sh lines 81-85 (existing budget check pattern)
BUDGET_OUT=$(node "$HOOKS_DIR/budget-check-status.mjs" 2>/dev/null)
if [ -n "$BUDGET_OUT" ]; then
  echo ""
  echo "$BUDGET_OUT"
fi
```

**New block to add after budget check** (D-140):
```bash
# D-140: SQLite memory injection
MEMORY_OUT=$(node "$HOOKS_DIR/../bin/cli.mjs" memory 2>/dev/null)
if [ -n "$MEMORY_OUT" ]; then
  echo ""
  echo "$MEMORY_OUT"
fi
```

Key behaviors to match: `2>/dev/null` suppresses errors (fail-silent), `-n` guard prevents blank output block, `echo ""` adds blank line separator before block.

---

### `tsup.config.ts` — extend entry map

**Analog:** self — `tsup.config.ts`

**Existing entry map pattern** (tsup.config.ts lines 16-23):
```typescript
entry: {
  'core/index': 'packages/cds-core/src/index.ts',
  'cli/index':  'packages/cds-cli/src/index.ts',
  'cli/quick':  'packages/cds-cli/src/quick.ts',
  'cli/mcp-server': 'packages/cds-cli/src/mcp-server.ts',
  'migrate/index': 'packages/cds-migrate/src/index.ts',
  'migrate/cli':   'packages/cds-migrate/src/cli.ts',
},
```

**New entries to add:**
```typescript
'cli/memory': 'packages/cds-cli/src/memory.ts',
'cli/search': 'packages/cds-cli/src/search.ts',
'cli/stats':  'packages/cds-cli/src/stats.ts',
```

---

### `bin/cli.mjs` — extend with new cases

**Analog:** self — `bin/cli.mjs`

**Existing case pattern for resolveDistPath** (bin/cli.mjs lines 195-199):
```javascript
case 'quick': {
  const quick = await import(resolveDistPath('cli/quick.js'));
  await quick.main(args.slice(1));
  break;
}
```

**New cases to add** (after the `quick` case, before `migrate`):
```javascript
// ── Memory (internal: called by SessionStart hook) ──
case 'memory': {
  const mod = await import(resolveDistPath('cli/memory.js'));
  await mod.main(args.slice(1));
  break;
}

// ── Search ──
case 'search': {
  const mod = await import(resolveDistPath('cli/search.js'));
  await mod.main(args.slice(1));
  break;
}

// ── SQLite Stats dashboard ──
case 'mem-stats': {
  const mod = await import(resolveDistPath('cli/stats.js'));
  await mod.main(args.slice(1));
  break;
}
```

Note: `memory` is internal — do NOT add it to `printHelp()`. Add `search` and `mem-stats` to `printHelp()` under the Analytics section.

---

### `skills/cds-search/SKILL.md` (skill)

**Analog:** `skills/cds-quick/SKILL.md`

**YAML frontmatter + body pattern** (cds-quick/SKILL.md lines 1-10):
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
```

**MCP tool call pattern** (D-142 — uses double-underscore MCP naming):
```
mcp__cds__sessions.search({ query: "$ARGUMENTS" })
```

**Bash fallback pattern** (skill body):
```
If mcp__cds__sessions.search is unavailable, fall back to:
Bash("npx claude-dev-stack search \"$ARGUMENTS\"")
```

---

### `skills/cds-stats/SKILL.md` (skill)

**Analog:** `skills/cds-quick/SKILL.md`

**Pattern** — same frontmatter as cds-search. Calls two MCP tools:
```
mcp__cds__planning.status (no args)
mcp__cds__sessions.timeline (as proxy for session count)
```

For counts, use `sessions.search` with count aggregation or `sessions.timeline` — or fall back to `Bash("npx claude-dev-stack mem-stats")`.

---

### `lib/install/claude-md.mjs` — extend managedBody

**Analog:** self — `lib/install/claude-md.mjs`

**Template literal structure** (claude-md.mjs lines 68-109):
```javascript
const managedBody = `## Language
${langLine}

## Auto-Routing (IMPORTANT)
...

## Session Protocol
...

## Code Style
...`;
```

**New Memory section to insert** between `## Session Protocol` and `## Code Style` (lines 89-92):
```javascript
## Memory
When the user asks about past decisions, work done, bugs found, or patterns established:
- Call \`mcp__cds__sessions.search\` with the topic as query
- Never say "I don't have access to past sessions" -- always try the MCP tool first
When the user asks about project documentation:
- Call \`mcp__cds__docs.search\` with the query
When the user asks about project progress:
- Call \`mcp__cds__planning.status\` (no args needed)

```

Note: backtick-escaped with `\`` inside template literal. Double-dash `--` preferred over em-dash per project style.

---

## Shared Patterns

### openSessionsDB + closeSessionsDB (VAULT-03)
**Source:** `packages/cds-core/src/vault/sessions.ts` lines 168-188
**Apply to:** `memory.ts`, `stats.ts`
```typescript
// Always open via factory, always close in finally block
const db = openSessionsDB(projectPath);
try {
  // ... use db
} finally {
  closeSessionsDB(projectPath);
}
```

### Fail-silent subprocess / hook pattern
**Source:** `hooks/session-start-context.sh` lines 81-85
**Apply to:** hook extension block for `memory`, `captureStandalone` in quick.ts
```bash
SOME_OUT=$(node "$HOOKS_DIR/..." 2>/dev/null)
if [ -n "$SOME_OUT" ]; then
  echo ""
  echo "$SOME_OUT"
fi
```

### stdout-only output in CLI commands invoked by hooks
**Source:** `packages/cds-cli/src/quick.ts` lines 88-91
**Apply to:** `memory.ts` — only formatted output to stdout; all errors/debug to stderr
```typescript
// stdout: data only
process.stdout.write(output + '\n');
// stderr: errors only (never reaches hook's captured stdout)
process.stderr.write(`error: ${msg}\n`);
```

### resolveDistPath import pattern in bin/cli.mjs
**Source:** `bin/cli.mjs` lines 19-26 + 195-199
**Apply to:** all three new CLI cases (memory, search, mem-stats)
```javascript
const mod = await import(resolveDistPath('cli/memory.js'));
await mod.main(args.slice(1));
```

### vi.hoisted mock pattern for tests
**Source:** `packages/cds-cli/src/quick.test.ts` lines 10-16
**Apply to:** `memory.test.ts`, `search.test.ts`, `stats.test.ts`
```typescript
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn(async () => ({})),
}));
vi.mock('@cds/core', () => ({ openSessionsDB: vi.fn(() => mockDbHandle), ... }));
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All files have analogs in the codebase |

---

## Metadata

**Analog search scope:** `packages/cds-cli/src/`, `packages/cds-core/src/vault/`, `hooks/`, `skills/`, `lib/install/`, `bin/`, root `tsup.config.ts`
**Files scanned:** 13 source files read directly
**Pattern extraction date:** 2026-04-17
