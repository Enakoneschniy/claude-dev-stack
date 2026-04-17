# Phase 43: Core Vault Primitives — Research

**Researched:** 2026-04-17
**Domain:** `@cds/core` vault module — TypeScript interface design, SQLite ATTACH batching, entity graph aggregation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** VaultBackend defines `pull()` and `push()` methods that sync the **entire `sessions.db` file** (whole-file sync). No row-level or record-level sync — atomic file transfer is the abstraction unit.
- **D-02:** VaultBackend interface defines a `ConflictStrategy` enum (at minimum: `merge-by-uuid`, `last-write-wins`). Backends implement the chosen strategy. This keeps conflict handling consistent across all backends rather than being implementation-specific.
- **D-03:** `FsBackend` implements VaultBackend as a no-op — `pull()` and `push()` return immediately since the file is already local. This preserves zero-regression on existing behavior.
- **D-04:** `getEntityGraph()` returns **generic, framework-agnostic types**: `GraphNode { id, name, type, displayName }` and `GraphEdge { from, to, relationType, weight }`. NOT cytoscape-native JSON. Dashboard (Phase 48) is responsible for adapting to cytoscape format.
- **D-05:** Graph data is computed from the existing `entities` and `relations` tables in `sessions.db`. No new tables needed — it's a read-only aggregation.
- **D-06:** `searchAllProjects()` discovers project databases via **filesystem scan**: `~/vault/projects/*/sessions.db`. No registry lookup. Vault path comes from env var `VAULT_PATH` or default discovery chain (same as existing vault discovery).
- **D-07:** Uses SQLite `ATTACH` with batching in groups of 9 (per SQLite's per-connection ATTACH limit). Each batch is a separate query; results are merged and re-ranked in TypeScript.
- **D-08:** New APIs go in **separate files**: `vault/graph.ts` (getEntityGraph) and `vault/multi-search.ts` (searchAllProjects). `sessions.ts` stays focused on single-project operations — no modifications needed.
- **D-09:** New files are re-exported through `vault/index.ts` (the existing public facade) and then through `src/index.ts` for consumer access.
- **D-10:** VaultBackend interface goes in a new `vault/backend.ts` file with `FsBackend` implementation alongside. S3Backend (Phase 44) will import the interface from here.

### Claude's Discretion

- Graph edge `weight` computation method (frequency-based, recency-based, or combined)
- Exact TypeScript generic signatures for VaultBackend methods
- Whether `searchAllProjects()` returns a combined `SearchHit[]` or a project-keyed `Map<string, SearchHit[]>`
- Test strategy (unit tests for graph/multi-search, integration test for ATTACH batching)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | VaultBackend interface defined in @cds/core with `pull()`/`push()` methods | D-01, D-02, D-10: `vault/backend.ts` file, async methods, ConflictStrategy enum |
| INFRA-02 | FsBackend implements VaultBackend as no-op default (current behavior preserved) | D-03, D-10: co-located in `vault/backend.ts`, zero-regression |
| INFRA-03 | S3Backend implements VaultBackend in @cds/s3-backend package (Phase 44 — stub must be importable interface) | D-10: `vault/backend.ts` is the contract; `cds-s3-backend/src/index.ts` imports `VaultBackend` from `@cds/core` |
| MEM-02 | Cross-project search uses SQLite ATTACH with batching (groups of 9) for correctness | D-06, D-07: `vault/multi-search.ts`, ATTACH limit verified = 10, batch size = 9 |
| MEM-04 | Entity relationship graph computed via `getEntityGraph()` in @cds/core | D-04, D-05: `vault/graph.ts`, reads existing `entities` + `relations` tables |

</phase_requirements>

---

## Summary

Phase 43 adds three entirely new files to `packages/cds-core/src/vault/` — `backend.ts`, `graph.ts`, and `multi-search.ts` — and updates the vault barrel export. No existing files require modification; `sessions.ts` and `internal/db.ts` are read-only in this phase. `src/index.ts` also requires no change because it already does `export * from "./vault/index.js"`.

The `VaultBackend` interface is a two-method async contract (`pull`/`push`) with a companion `ConflictStrategy` enum. `FsBackend` is the no-op default that preserves current behavior. Both live in `vault/backend.ts`. Phase 44 (`@cds/s3-backend`) imports the interface from `@cds/core` — so the type contract must be correct and stable before Phase 44 begins.

`getEntityGraph()` is a pure SQL read across `entities` and `relations` tables with no new schema requirements. `searchAllProjects()` uses SQLite `ATTACH` with a batch size of 9, which is empirically verified against the `better-sqlite3 12.9.0` ATTACH limit of 10 per connection. Both functions are synchronous (matching `better-sqlite3`'s sync API) and can be imported independently.

**Primary recommendation:** Implement all three new files as synchronous functions (matching the existing `better-sqlite3` API convention in `sessions.ts`) with the `VaultBackend`/`FsBackend` being the only async surface (as async is required for S3 compatibility in Phase 44).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| VaultBackend interface | `@cds/core` (library) | — | Interface must live in core so both CLI and s3-backend can reference it without circular deps |
| FsBackend (no-op) | `@cds/core` (library) | — | Default implementation, zero external deps, same package as interface |
| S3Backend (stub) | `@cds/s3-backend` (library) | — | AWS SDK isolation; Phase 44 concern, not Phase 43 |
| getEntityGraph() | `@cds/core` / vault tier | — | Pure DB read, no CLI or HTTP layer needed |
| searchAllProjects() | `@cds/core` / vault tier | — | SQLite ATTACH operation, data primitive — CLI surface is Phase 45 |
| Vault path discovery | `@cds/core` (utility) | env var `VAULT_PATH` | Consistent with existing test infrastructure pattern |

---

## Standard Stack

### Core (no new packages required for Phase 43)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | `^12.9.0` [VERIFIED: cds-core package.json] | SQLite driver — ATTACH, prepared statements, sync API | Already in `@cds/core` dependencies; ATTACH verified working |
| `node:fs` | Node builtin | Filesystem scan for `~/vault/projects/*/sessions.db` | Standard — no glob library needed for single-level scan |
| `node:os` | Node builtin | `homedir()` for vault root default | Already used in `sessions.ts` |
| `node:path` | Node builtin | Path joining and basename | Already used in `sessions.ts` |

**No new npm packages are required for Phase 43.** [VERIFIED: all capabilities implemented with existing dependencies]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:fs readdirSync` | `glob` or `fast-glob` | glob adds a dep; single-level `~/vault/projects/*/sessions.db` is solved with `readdirSync` + existence check — no recursion needed |
| ATTACH batching in TypeScript | Single `UNION ALL` query across all | Single query hits ATTACH limit at 11 projects; batching is required for correctness at scale |
| Synchronous `getEntityGraph` | Async with connection pool | `better-sqlite3` is synchronous by design; async here adds complexity with no benefit |

---

## Architecture Patterns

### System Architecture Diagram

```
Consumer (Phase 44 S3Backend, Phase 45 CLI, Phase 48 Dashboard)
    │
    │  import VaultBackend from '@cds/core'
    │  import { getEntityGraph, searchAllProjects } from '@cds/core'
    ▼
packages/cds-core/src/vault/
    ├── backend.ts          ← NEW: VaultBackend interface + ConflictStrategy enum + FsBackend class
    │                              pull(projectPath): Promise<void>   (async for S3 compat)
    │                              push(projectPath): Promise<void>
    │
    ├── graph.ts            ← NEW: getEntityGraph(projectPath) → { nodes: GraphNode[], edges: GraphEdge[] }
    │                              Opens sessions.db via openRawDb (direct, bypasses CACHE)
    │                              OR accepts an open RawDatabase (for testing)
    │                              SQL: SELECT * FROM entities; SELECT * FROM relations
    │                              Maps to generic GraphNode / GraphEdge types
    │
    ├── multi-search.ts     ← NEW: searchAllProjects(query, vaultPath?) → CrossSearchHit[]
    │                              Discovers ~/vault/projects/*/sessions.db via readdirSync
    │                              Batches paths in groups of 9
    │                              Per batch: new Database(batch[0]), ATTACH batch[1..8]
    │                              UNION FTS5 MATCH query, annotates with { project: string }
    │                              Merges + re-ranks by BM25 rank across batches
    │                              Closes each batch connection in finally block
    │
    ├── index.ts            ← MODIFIED: re-export new types + functions
    └── sessions.ts         ← UNCHANGED
```

### Recommended Project Structure

```
packages/cds-core/src/vault/
├── backend.ts           # NEW — VaultBackend, ConflictStrategy, FsBackend
├── graph.ts             # NEW — GraphNode, GraphEdge, EntityGraph, getEntityGraph()
├── multi-search.ts      # NEW — CrossSearchHit, searchAllProjects()
├── index.ts             # MODIFIED — add re-exports for new public symbols
├── sessions.ts          # UNCHANGED
└── internal/
    ├── db.ts            # UNCHANGED
    └── migrations/      # UNCHANGED
```

### Pattern 1: VaultBackend Interface + ConflictStrategy Enum

**What:** A TypeScript interface with two async methods and a co-located string enum. `FsBackend` is a class that implements the interface as no-ops.

**When to use:** Every backend (FsBackend now, S3Backend in Phase 44) implements this interface. CLI commands that need to sync accept a `VaultBackend` instance.

**Example:**
```typescript
// vault/backend.ts
// Source: CONTEXT.md D-01, D-02, D-03

export enum ConflictStrategy {
  MergeByUuid = 'merge-by-uuid',
  LastWriteWins = 'last-write-wins',
}

export interface VaultBackend {
  readonly conflictStrategy: ConflictStrategy;
  pull(projectPath: string): Promise<void>;
  push(projectPath: string): Promise<void>;
}

export class FsBackend implements VaultBackend {
  readonly conflictStrategy = ConflictStrategy.MergeByUuid;

  async pull(_projectPath: string): Promise<void> {
    // no-op: file is already local
  }

  async push(_projectPath: string): Promise<void> {
    // no-op: file is already local
  }
}
```

### Pattern 2: getEntityGraph() — Direct SQL Aggregation

**What:** Open sessions.db for the given `projectPath`, query `entities` and `relations` tables, map to generic graph types. No caching — called on demand.

**When to use:** Phase 45 MCP tool `memory.graph`, Phase 48 dashboard `/api/graph` endpoint.

**Example:**
```typescript
// vault/graph.ts
// Source: CONTEXT.md D-04, D-05 + existing Entity/Relation types in sessions.ts

export interface GraphNode {
  id: number;
  name: string;
  type: string;
  displayName: string | null;
}

export interface GraphEdge {
  from: number;
  to: number;
  relationType: string;
  weight: number;  // frequency-based: count of sessions sharing this relation
}

export interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function getEntityGraph(projectPath: string): EntityGraph {
  // Opens via openRawDb (does NOT go through openSessionsDB CACHE to
  // avoid holding a write-capable handle for a read-only aggregation).
  // Uses a temporary read-only connection.
  const db = openRawDb(resolveDbPath(projectPath));
  try {
    const nodes = db.prepare('SELECT id, name, type, display_name FROM entities ORDER BY id ASC').all() as ...;
    // weight = count of times this (from, to, relationType) triple appears
    // across different sessions — frequency-based per Claude's Discretion
    const edges = db.prepare(
      'SELECT from_entity AS "from", to_entity AS "to", relation_type AS relationType, COUNT(*) AS weight ' +
      'FROM relations GROUP BY from_entity, to_entity, relation_type'
    ).all() as ...;
    return { nodes: nodes.map(mapNode), edges: edges.map(mapEdge) };
  } finally {
    db.close();
  }
}
```

**Important:** `getEntityGraph` must NOT use the `openSessionsDB` CACHE — it opens a short-lived read connection, reads, and closes. This avoids contaminating the session cache with a read-only handle.

### Pattern 3: searchAllProjects() — ATTACH Batching

**What:** Discover all `sessions.db` files under vault, batch them in groups of 9, run a UNION FTS5 MATCH query per batch, merge results in TypeScript.

**When to use:** Phase 45 `cds search --global` CLI flag and `sessions.searchAll` MCP tool.

**ATTACH limit verified:** `better-sqlite3 12.9.0` + this SQLite build supports MAX 10 ATTACHed databases per connection (empirically confirmed: attaching 11 throws "too many attached databases - max 10"). With a primary on-disk DB, batch size must be ≤ 9. [VERIFIED: empirical test on this machine]

**Example:**
```typescript
// vault/multi-search.ts
// Source: ARCHITECTURE.md Pattern 2 + empirical ATTACH limit verification

export interface CrossSearchHit extends SearchHit {
  project: string;  // basename of project directory
}

export function searchAllProjects(
  query: string,
  options?: { vaultPath?: string; limit?: number }
): CrossSearchHit[] {
  const vault = options?.vaultPath ?? process.env['VAULT_PATH'] ?? join(homedir(), 'vault');
  const projectsDir = join(vault, 'projects');
  const dbPaths = discoverProjectDbs(projectsDir);  // readdirSync + exists check

  const perProjectLimit = options?.limit ?? 20;
  const allHits: CrossSearchHit[] = [];

  for (let i = 0; i < dbPaths.length; i += 9) {
    const batch = dbPaths.slice(i, i + 9);
    const db = new Database(batch[0].path);
    db.pragma('query_only = ON');  // safety: read-only mode
    try {
      batch.slice(1).forEach((p, j) => {
        db.prepare(`ATTACH ? AS p${j}`).run(p.path);
      });
      allHits.push(...runBatchQuery(db, query, batch, perProjectLimit));
    } finally {
      db.close();  // ALWAYS closes — prevents FD leak
    }
  }

  // Re-rank merged results by BM25 rank (lower = better in FTS5)
  return allHits.sort((a, b) => a.rank - b.rank).slice(0, options?.limit ?? 100);
}
```

**Key detail:** `query_only = ON` pragma on each batch connection ensures no accidental writes to any attached DB. [ASSUMED — safety best practice, not a hard requirement from CONTEXT.md]

### Anti-Patterns to Avoid

- **Opening sessionDB via CACHE for graph/multi-search:** `openSessionsDB` returns a `SessionsDB` interface that doesn't expose raw SQL. Use `openRawDb` or `new Database()` directly for graph/multi-search reads.
- **Leaving DB connections open after ATTACH batch:** Always use `try/finally` to close the batch connection. A thrown exception inside the batch loop must not leave handles open.
- **Putting `ConflictStrategy` inside `VaultBackend` interface as a method:** It belongs as a `readonly` property so backends declare their strategy at compile time.
- **Re-exporting `VaultBackend` from `src/index.ts` directly:** It flows through `vault/index.ts` first per D-09. Do not add a direct export to `src/index.ts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filesystem glob for `sessions.db` paths | Custom recursive walker | `readdirSync` + existence check (single level) | Vault structure is flat: `~/vault/projects/{name}/sessions.db`. One level of `readdirSync` is sufficient and has zero deps. |
| FTS5 full-text ranking across multiple DBs | Custom BM25 implementation | SQLite FTS5 built-in `bm25()` + TypeScript sort for merge | FTS5 BM25 is already set up (`searchObservations` in sessions.ts). Use the same pattern per DB, merge in TS. |
| Graph weight calculation | Manual observation-count queries | Single SQL `COUNT(*) GROUP BY` on relations table | One query per `getEntityGraph()` call; no caching layer needed at this scale. |

**Key insight:** Phase 43 is pure data primitives — all heavy lifting (FTS5 ranking, graph algorithms) is deferred to Phase 45 consumers. Phase 43 should stay thin.

---

## Common Pitfalls

### Pitfall 1: Using openSessionsDB CACHE for read-only operations

**What goes wrong:** `openSessionsDB()` returns a cached handle intended for write operations. Using it in `getEntityGraph()` or `searchAllProjects()` holds a cached connection that never gets released, and the `SessionsDB` interface doesn't expose raw `db.prepare()` access anyway.

**Why it happens:** `openSessionsDB` is the established pattern. It feels natural to reuse it.

**How to avoid:** Import `openRawDb` from `vault/internal/db.ts` inside `graph.ts` and use `new Database(path)` directly in `multi-search.ts` (since multi-search opens temporary batch connections, not project-scoped permanent handles). Close all connections in `finally` blocks.

**Warning signs:** DB handle count grows with repeated graph/search calls; tests see cross-call interference.

### Pitfall 2: Wrong ATTACH batch size

**What goes wrong:** Batch size of 10 (instead of 9) causes ATTACH to fail when a DB already has a primary file open. The error is "too many attached databases - max 10."

**Why it happens:** The ATTACH limit is 10 total connections, but the primary DB counts as 1, leaving only 9 slots.

**How to avoid:** Always use `batch.slice(i, i + 9)`. The primary DB in each batch is `batch[0]` (opened as the main connection); `batch[1..8]` are ATTACHed. [VERIFIED: empirical test confirms failure at 11th ATTACH]

**Warning signs:** Tests with 10+ synthetic project DBs throw "too many attached databases."

### Pitfall 3: ConflictStrategy placed wrong

**What goes wrong:** Implementors put `conflictStrategy` as an argument to `pull()`/`push()` instead of a property of the backend. This means callers must know the strategy, breaking the abstraction.

**Why it happens:** It seems natural to pass the strategy at call time.

**How to avoid:** Per D-02, backends implement the chosen strategy — the interface has `readonly conflictStrategy: ConflictStrategy` as a property. Callers can read it for logging but don't pass it.

### Pitfall 4: FTS5 UNION query syntax across ATTACHed DBs

**What goes wrong:** Trying `SELECT ... FROM p0.observations_fts MATCH ?` — SQLite FTS5 does not support schema-qualified FTS table references in the `MATCH` operator this way. The query compiles but returns wrong results or throws.

**Why it happens:** FTS5 MATCH is special syntax; schema-qualified FTS queries require care.

**How to avoid:** Query each ATTACHed schema separately and UNION in SQL, or run a query per attached DB and merge in TypeScript. The ARCHITECTURE.md pattern runs `runUnionQuery(db, query, batch)` where the union is constructed programmatically per batch. [ASSUMED — FTS5 schema qualification behavior; recommend writing a test to confirm before shipping]

**Warning signs:** Cross-DB FTS query returns 0 rows even when rows exist.

### Pitfall 5: Not exporting ConflictStrategy as a value (only as a type)

**What goes wrong:** TypeScript `const enum` gets erased at runtime; consumers can't compare against `ConflictStrategy.MergeByUuid` values.

**Why it happens:** Using `const enum` is a common TypeScript optimization.

**How to avoid:** Use a regular `enum` or `as const` object — not `const enum`. This ensures the enum values are present at runtime for consumers who do `if (backend.conflictStrategy === ConflictStrategy.LastWriteWins)`.

---

## Code Examples

Verified patterns from existing codebase:

### Existing vault path resolution pattern (from sessions.ts)
```typescript
// Source: packages/cds-core/src/vault/sessions.ts:185 [VERIFIED]
const project = basename(projectPath);
const dbPath = join(homedir(), 'vault', 'projects', project, 'sessions.db');
```

### Multi-search vault root discovery
```typescript
// Source: CONTEXT.md D-06 + test infrastructure (project-setup.test.mjs:92) [VERIFIED]
const vaultRoot = process.env['VAULT_PATH'] ?? join(homedir(), 'vault');
const projectsDir = join(vaultRoot, 'projects');
// Then: readdirSync(projectsDir).filter(e => existsSync(join(projectsDir, e, 'sessions.db')))
```

### Existing entity/relation types (ready for reuse in graph.ts)
```typescript
// Source: packages/cds-core/src/vault/sessions.ts:77-97 [VERIFIED]
export interface Entity {
  id: number;
  name: string;         // normalized (trim().toLowerCase())
  display_name: string | null;  // first-seen original casing
  type: string;
  first_seen: string;
  last_updated: string;
}

export interface Relation {
  from_entity: number;
  to_entity: number;
  relation_type: string;
  observed_in_session: string;
}
```

### Test isolation pattern (HOME redirect) — for new test files
```typescript
// Source: packages/cds-core/src/vault/sessions.test.ts:35-54 [VERIFIED]
beforeEach(() => {
  originalHome = process.env['HOME'];
  tempHome = mkdtempSync(join(tmpdir(), 'cds-vault-test-home-'));
  process.env['HOME'] = tempHome;
  process.env['USERPROFILE'] = tempHome;
});
afterEach(() => {
  if (originalHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = originalHome;
  rmSync(tempHome, { recursive: true, force: true });
});
```

### ATTACH confirmed working (empirical)
```typescript
// Source: empirical test on this machine, better-sqlite3 12.9.0 [VERIFIED]
const db = new Database(primaryPath);
db.prepare('ATTACH ? AS p0').run(otherPath);  // works for up to 9 attachments
// 10th attachment throws: "too many attached databases - max 10"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom vault path hardcoded | `VAULT_PATH` env override for testability | Already in test infra (confirmed) | Multi-search must honor `VAULT_PATH` env |
| Single project DB operations | Multi-DB ATTACH for cross-project search | Phase 43 (new) | Batch size = 9 is the correct constraint |
| No backend abstraction | VaultBackend interface | Phase 43 (new) | Unblocks S3Backend in Phase 44 |

**No deprecated patterns in this phase.** Phase 43 adds new code only — no existing code is modified.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `query_only = ON` PRAGMA prevents accidental writes to ATTACHed DBs in batch connections | Pattern 3, Common Pitfalls | Low — worst case is accidental write during search; add to test verification |
| A2 | FTS5 MATCH across schema-qualified tables (e.g., `p0.observations_fts`) requires per-alias queries rather than a single UNION — SQLite FTS5 schema qualification behavior | Pitfall 4 | Medium — if wrong, UNION query is simpler; write an empirical test to confirm |
| A3 | `getEntityGraph` should NOT use `openSessionsDB` CACHE and instead uses a direct raw DB connection | Pattern 2 | Low — verified by inspecting `SessionsDB` interface (no raw SQL access) |

---

## Open Questions

1. **Return type for searchAllProjects: flat array vs. project-keyed Map**
   - What we know: CONTEXT.md marks this as Claude's discretion
   - What's unclear: Phase 45 consumers (CLI + MCP tool) may prefer flat sorted array for immediate display; Dashboard may prefer grouped by project
   - Recommendation: Return `CrossSearchHit[]` (flat, re-ranked) as the primary signature. A helper `groupByProject(hits)` can be in the same file for consumers that need keyed access. Flat array is simpler to type and sort.

2. **FTS5 UNION query per batch — in-SQL vs. per-attached-DB TypeScript merge**
   - What we know: ATTACH limit = 9 per batch is confirmed; FTS5 schema-qualified MATCH behavior is ASSUMED
   - Recommendation: Write an empirical test in Wave 0 that ATTACHes two DBs and runs a UNION FTS5 query to verify the SQL pattern before implementing `runBatchQuery`.

3. **getEntityGraph — use openRawDb or new Database() directly?**
   - What we know: `openRawDb` runs migrations which is unnecessary for a read-only operation
   - Recommendation: Use `new Database(path, { readonly: true })` directly in `graph.ts` to avoid migration overhead on a read-only aggregation. Export the DB path resolution logic as a shared util in `vault/utils.ts`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 43 is code-only changes within `@cds/core`. No external services, CLI tools, or runtimes beyond the existing Node.js + `better-sqlite3` stack.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (no explicit version in devDeps — inherited from workspace) |
| Config file | `packages/cds-core/vitest.config.ts` |
| Quick run command | `pnpm --filter @cds/core test` |
| Full suite command | `pnpm -r run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | `VaultBackend` interface importable from `@cds/core` | unit | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/backend.test.ts` |
| INFRA-02 | `FsBackend.pull()` and `FsBackend.push()` resolve immediately (no-op) | unit | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/backend.test.ts` |
| INFRA-03 | `VaultBackend` type can be implemented by an external class (structural typing check) | unit | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/backend.test.ts` |
| MEM-04 | `getEntityGraph(projectPath)` returns `{ nodes, edges }` with correct counts | integration | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/graph.test.ts` |
| MEM-04 | `getEntityGraph` returns empty arrays when no entities/relations exist | integration | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/graph.test.ts` |
| MEM-02 | `searchAllProjects` finds hits across 2 projects in a temp vault | integration | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/multi-search.test.ts` |
| MEM-02 | `searchAllProjects` batches correctly when >9 project DBs exist | integration | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/multi-search.test.ts` |
| MEM-02 | All DB connections closed after `searchAllProjects` completes (no FD leak) | integration | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/multi-search.test.ts` |
| All | New exports visible from `@cds/core` barrel (`vault/index.ts` + `src/index.ts`) | unit | `pnpm --filter @cds/core test` | ❌ Wave 0: `vault/vault.boundary.test.ts` (extend existing) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @cds/core test`
- **Per wave merge:** `pnpm -r run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/cds-core/src/vault/backend.test.ts` — covers INFRA-01, INFRA-02, INFRA-03
- [ ] `packages/cds-core/src/vault/graph.test.ts` — covers MEM-04 (uses HOME redirect pattern from sessions.test.ts)
- [ ] `packages/cds-core/src/vault/multi-search.test.ts` — covers MEM-02 (empirical ATTACH test, batch boundary test, FD leak verification)

Existing test `vault.boundary.test.ts` must be extended to cover new exports from `vault/index.ts`.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | FTS5 query passed as prepared statement parameter — no string interpolation in SQL |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via FTS5 MATCH query | Tampering | All queries use `db.prepare(sql).all(param)` — parameterized; FTS5 MATCH operators are not expanded from user input [VERIFIED: existing pattern in sessions.ts searchStmt] |
| Path traversal via crafted projectPath | Tampering | `searchAllProjects` discovers paths via filesystem scan (not user input); `getEntityGraph` uses existing `openSessionsDB`-style resolution |

---

## Project Constraints (from CLAUDE.md)

- Commits in conventional commits format (`feat:`, `fix:`, `chore:`)
- Code and comments in English
- Do NOT delete code without explicit request
- GSD branching strategy: `phase` — branch `gsd/phase-43-core-vault-primitives`, PR-only to main

---

## Sources

### Primary (HIGH confidence)
- `packages/cds-core/src/vault/sessions.ts` — Entity/Relation types, openSessionsDB factory, CACHE pattern, error hierarchy [VERIFIED: read in this session]
- `packages/cds-core/src/vault/index.ts` — Barrel export structure [VERIFIED: read in this session]
- `packages/cds-core/src/vault/internal/db.ts` — openRawDb, PRAGMA tuning [VERIFIED: read in this session]
- `packages/cds-core/package.json` — `better-sqlite3: ^12.9.0`, vitest test runner [VERIFIED: read in this session]
- `.planning/phases/43-core-vault-primitives/43-CONTEXT.md` — all locked decisions D-01 through D-10 [VERIFIED: read in this session]
- Empirical ATTACH limit test — `better-sqlite3 12.9.0` MAX_ATTACHED=10 confirmed [VERIFIED: ran node test in this session]
- `VAULT_PATH` env var — used in test infrastructure `tests/project-setup.test.mjs:92` and `tests/notebooklm-cli.test.mjs` [VERIFIED: grep in this session]

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — VaultBackend design, ATTACH pattern, component responsibilities [CITED: codebase research doc, 2026-04-17]
- `.planning/research/STACK.md` — No new packages for Phase 43 confirmed [CITED: codebase research doc, 2026-04-17]
- `.planning/research/PITFALLS.md` — Pitfall 6 (cross-project FD exhaustion), Pitfall 1 (WAL checkpoint) [CITED: codebase research doc, 2026-04-17]

### Tertiary (LOW confidence)
- FTS5 schema-qualified MATCH behavior (A2 in Assumptions Log) — flagged for empirical verification in Wave 0

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all dependencies already in `@cds/core`
- Architecture: HIGH — directly derived from locked decisions D-01..D-10 and verified codebase
- ATTACH limit: HIGH — empirically verified with `better-sqlite3 12.9.0` on this machine
- FTS5 UNION across ATTACHed DBs: MEDIUM (ASSUMED; Wave 0 test required)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable domain — SQLite ATTACH behavior, TypeScript interfaces, no fast-moving deps)
