# Phase 45: Cross-Project Search + Graph + MCP Tools - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 8 (4 new + 4 modified)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/cds-cli/src/mcp-tools/sessions-search-all.ts` | MCP tool module | request-response | `packages/cds-cli/src/mcp-tools/sessions-search.ts` | exact |
| `packages/cds-cli/src/mcp-tools/sessions-search-all.test.ts` | test | unit | `packages/cds-cli/src/mcp-tools/sessions-search.test.ts` | exact |
| `packages/cds-cli/src/mcp-tools/memory-graph.ts` | MCP tool module | request-response | `packages/cds-cli/src/mcp-tools/sessions-get-observations.ts` | role-match |
| `packages/cds-cli/src/mcp-tools/memory-graph.test.ts` | test | unit | `packages/cds-cli/src/mcp-tools/sessions-get-observations.test.ts` | role-match |
| `packages/cds-cli/src/search.ts` | CLI command (MODIFY) | command | `packages/cds-cli/src/search.ts` (itself — extend) | exact |
| `packages/cds-cli/src/search.test.ts` | test (MODIFY) | unit | `packages/cds-cli/src/search.test.ts` (itself — extend) | exact |
| `packages/cds-cli/src/memory.ts` | CLI command (MODIFY) | command | `packages/cds-cli/src/memory.ts` (itself — extend) | exact |
| `packages/cds-cli/src/mcp-server.ts` | MCP server (MODIFY) | dispatch | `packages/cds-cli/src/mcp-server.ts` (itself — extend) | exact |

---

## Pattern Assignments

### `packages/cds-cli/src/mcp-tools/sessions-search-all.ts` (MCP tool, new)

**Analog:** `packages/cds-cli/src/mcp-tools/sessions-search.ts`

**Module structure pattern** (sessions-search.ts):
```typescript
// Every MCP tool module exports:
// 1. Args interface — typed input
// 2. Result interface — typed output
// 3. Deps type — dependency injection for testability
// 4. Async function — the tool implementation

export interface SessionsSearchArgs {
  query: string;
  filters?: SessionsSearchFilters;
}

export interface SessionsSearchResult {
  hits: SessionsSearchHit[];
  total_matched: number;
  query_time_ms: number;
}

export type SessionsSearchDeps =
  | { dbPath: string; db?: undefined }
  | { db: Database.Database; dbPath?: undefined };

export async function sessionsSearch(
  args: SessionsSearchArgs,
  deps: SessionsSearchDeps,
): Promise<SessionsSearchResult> { ... }
```

**sessions-search-all.ts equivalent:**
```typescript
export interface SearchAllArgs {
  query: string;
  limit?: number;
}

export interface SearchAllResult {
  hits: CrossSearchHit[];
  total_matched: number;
  query_time_ms: number;
}

// No Deps needed — searchAllProjects() resolves vault path internally
export async function sessionsSearchAll(
  args: SearchAllArgs,
): Promise<SearchAllResult> { ... }
```

**Error handling pattern** (sessions-search.ts lines 134-221):
```typescript
// Validate args at top of function, throw InvalidFilterError for bad input
if (typeof args.query !== 'string' || args.query.trim().length === 0) {
  throw new InvalidFilterError('query must be a non-empty string');
}
// Import from shared.ts for consistent error types
import { InvalidFilterError } from './shared.js';
```

**Performance timing pattern** (sessions-search.ts lines 163-195):
```typescript
const started = performance.now();
// ... run query ...
const query_time_ms = Math.round((performance.now() - started) * 1000) / 1000;
```

---

### `packages/cds-cli/src/mcp-tools/memory-graph.ts` (MCP tool, new)

**Analog:** `packages/cds-cli/src/mcp-tools/sessions-get-observations.ts`

**Module structure** — same pattern as above (Args, Result, async function).

**Path validation pattern** (shared.ts assertValidScopeBasename):
```typescript
// MUST apply to `project` param to prevent path traversal
import { assertValidScopeBasename } from './shared.js';

if (args.project) {
  assertValidScopeBasename(args.project);
}
```

**memory-graph.ts equivalent:**
```typescript
export interface MemoryGraphArgs {
  project?: string;
}

export interface MemoryGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
}

export async function memoryGraph(
  args: MemoryGraphArgs,
): Promise<MemoryGraphResult> { ... }
```

---

### `packages/cds-cli/src/mcp-server.ts` (MCP server, MODIFY)

**Tool definition pattern** (mcp-server.ts TOOL_DEFINITIONS array):
```typescript
// Each tool definition follows this shape:
{
  name: 'sessions.search',
  description: 'Full-text search over session observations...',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { ... },
    required: ['query'],
  },
}
// Add new tools to the end of the array.
```

**Tool dispatch pattern** (mcp-server.ts switch-case):
```typescript
// Each tool gets a case in the switch:
case 'sessions.search': {
  const result = await sessionsSearch(args as unknown as SessionsSearchArgs, {
    dbPath: resolveSessionsDBPath(),
  });
  return textEnvelope(result);
}
// Add new cases for sessions.searchAll and memory.graph.
```

**Import pattern** (mcp-server.ts top):
```typescript
// Each tool module imported with named function + Args type:
import {
  sessionsSearch,
  type SessionsSearchArgs,
} from './mcp-tools/sessions-search.js';
// Add:
import {
  sessionsSearchAll,
  type SearchAllArgs,
} from './mcp-tools/sessions-search-all.js';
import {
  memoryGraph,
  type MemoryGraphArgs,
} from './mcp-tools/memory-graph.js';
```

---

### `packages/cds-cli/src/search.ts` (CLI, MODIFY)

**Current structure** (search.ts lines 26-48):
```typescript
export async function main(args: string[]): Promise<void> {
  const query = args[0];
  if (!query) {
    process.stderr.write('Usage: claude-dev-stack search "<query>"\n');
    process.exit(1);
  }
  try {
    const dbPath = resolveDbPath(process.cwd());
    const result = await sessionsSearch({ query }, { dbPath });
    // ... format and output
  } catch (err) { ... }
}
```

**Extension pattern — add `--global` flag:**
```typescript
export async function main(args: string[]): Promise<void> {
  const globalFlag = args.includes('--global');
  const query = args.find(a => a !== '--global');
  // ...
  if (globalFlag) {
    // Call searchAllProjects from @cds/core
    const hits = searchAllProjects(query);
    // Format with project name
  } else {
    // Existing single-project path
  }
}
```

---

### `packages/cds-cli/src/memory.ts` (CLI, MODIFY)

**Current structure** (memory.ts lines 11-38):
```typescript
export function formatMemorySummary(options: MemoryOptions): string {
  const db = openSessionsDB(options.projectPath);
  try {
    const sessions = db.listSessions({ limit: options.sessionCount ?? 3 });
    // ... format recent sessions
    return lines.join('\n');
  } finally {
    closeSessionsDB(options.projectPath);
  }
}
```

**Extension — add fuzzy auto-surface after recent sessions listing:**
```typescript
// After the recent sessions block, add:
// 1. Load recent observations (last 100-200)
// 2. Build MiniSearch index
// 3. Derive implicit query from cwd basename / recent activity
// 4. Search and append "Relevant past observations:" section
```

---

## Shared Patterns

### Error hierarchy for MCP tools
**Source:** `packages/cds-cli/src/mcp-tools/shared.ts`
**Apply to:** `sessions-search-all.ts`, `memory-graph.ts`
```typescript
import { InvalidFilterError, VaultNotFoundError } from './shared.js';
// InvalidFilterError for bad user input
// VaultNotFoundError for missing sessions.db
```

### Test isolation via CDS_TEST_VAULT
**Source:** `packages/cds-cli/src/mcp-server.ts` line 214
**Apply to:** MCP tool tests
```typescript
// mcp-server.ts resolves sessions.db via CDS_TEST_VAULT env override:
const base = process.env['CDS_TEST_VAULT'] ?? join(homedir(), 'vault', 'projects', basename(process.cwd()));
```

### textEnvelope helper
**Source:** `packages/cds-cli/src/mcp-server.ts` lines 222-225
**Apply to:** All tool results in the switch-case
```typescript
function textEnvelope(value: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}
```

---

## No Analog Found

All new files have close analogs. No cases without match.

---

## Metadata

**Analog search scope:** `packages/cds-cli/src/` (all files), `packages/cds-cli/src/mcp-tools/`
**Files scanned:** mcp-server.ts, search.ts, memory.ts, mcp-tools/sessions-search.ts, mcp-tools/sessions-get-observations.ts, mcp-tools/shared.ts
**Pattern extraction date:** 2026-04-17
