---
phase: 35-tiered-vault-tier-2-sqlite
plan: 03
type: execute
wave: 3
depends_on: ["02"]
files_modified:
  - packages/cds-core/src/vault/internal/db.ts
  - packages/cds-core/src/vault/sessions.ts
  - packages/cds-core/src/vault/index.ts
  - packages/cds-core/src/index.ts
autonomous: true
requirements:
  - VAULT-01
  - VAULT-03
user_setup: []

must_haves:
  truths:
    - "`import { openSessionsDB } from '@cds/core'` compiles and returns a SessionsDB handle"
    - "`import { openRawDb } from '@cds/core'` fails at type-check — openRawDb is NOT in the package public surface"
    - "openSessionsDB(projectPath) creates the DB directory if missing and opens a WAL-mode connection"
    - "openSessionsDB caches handles by projectPath — two calls with the same path return the same object reference"
    - "sessions.ts exposes createSession, appendObservation, upsertEntity, linkRelation, searchObservations, timeline, and close methods"
    - "All public error classes (VaultError, SchemaVersionError, MigrationError, FtsUnavailableError, DbOpenError) extend Error and are re-exported from @cds/core"
    - "openSessionsDB throws FtsUnavailableError when FTS5 is not compiled into the SQLite binary"
  artifacts:
    - path: "packages/cds-core/src/vault/internal/db.ts"
      provides: "Raw DB factory with PRAGMA + FTS5 verification"
      contains: "openRawDb"
      min_lines: 40
    - path: "packages/cds-core/src/vault/sessions.ts"
      provides: "Public session memory API + error hierarchy + types"
      contains: "openSessionsDB"
      min_lines: 150
    - path: "packages/cds-core/src/vault/index.ts"
      provides: "Public facade (re-exports sessions only; NO internal)"
      contains: "export"
    - path: "packages/cds-core/src/index.ts"
      provides: "@cds/core package barrel adds vault re-export"
      contains: "./vault/index.js"
  key_links:
    - from: "packages/cds-core/src/vault/sessions.ts"
      to: "packages/cds-core/src/vault/internal/db.ts"
      via: "Imports openRawDb + RawDatabase type"
      pattern: "./internal/db.js"
    - from: "packages/cds-core/src/vault/index.ts"
      to: "packages/cds-core/src/vault/sessions.ts"
      via: "Re-exports ONLY sessions.ts surface"
      pattern: "./sessions.js"
    - from: "packages/cds-core/src/index.ts"
      to: "packages/cds-core/src/vault/index.ts"
      via: "Barrel re-export"
      pattern: "./vault/index.js"
---

<objective>
Implement the public session memory API (`sessions.ts`), the internal DB factory (`internal/db.ts`), the vault public facade (`vault/index.ts`), and update the package barrel to re-export the vault namespace. Establishes the VAULT-03 boundary through folder convention + no re-export.

Purpose: Per CONTEXT.md D-40..D-50, this plan lands the single write API required by VAULT-01 and the type-level boundary required by VAULT-03. Every consumer (Phase 36+) reaches the DB exclusively through this surface.
Output: Four TypeScript files + an updated package barrel, all compiling under `@cds/core` tsconfig.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md
@.planning/phases/35-tiered-vault-tier-2-sqlite/35-PATTERNS.md

@.planning/phases/35-tiered-vault-tier-2-sqlite/35-02-schema-and-migration-runner-PLAN.md
@packages/cds-core/src/index.ts
@packages/cds-core/tsconfig.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement `internal/db.ts` (raw DB factory with PRAGMA + FTS5 verification)</name>
  <files>packages/cds-core/src/vault/internal/db.ts</files>
  <read_first>.planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md, packages/cds-core/src/vault/internal/migrations/runner.ts, packages/cds-core/tsconfig.json</read_first>
  <action>Create `packages/cds-core/src/vault/internal/db.ts`:

1. Default-import `Database` from `better-sqlite3`: `import Database from 'better-sqlite3';`
2. Import `mkdirSync` from `node:fs`, `dirname` from `node:path`.
3. Import `runPendingMigrations` from `./migrations/runner.js`. Import `MigrationError` from the same module ONLY if needed for rethrow (usually not).
4. Import `FtsUnavailableError` and `DbOpenError` from `'../sessions.js'` (forward reference — Plan 03 Task 2 declares them in sessions.ts).
5. Export `type RawDatabase = Database.Database;` — a type alias so sessions.ts can type-annotate without default-importing better-sqlite3 at runtime.
6. Export `function openRawDb(absoluteDbPath: string): RawDatabase`. Implementation:

   a. Call `mkdirSync(dirname(absoluteDbPath), { recursive: true });`
   b. Try to construct the DB handle:
      ```typescript
      let db: RawDatabase;
      try {
        db = new Database(absoluteDbPath);
      } catch (err) {
        throw new DbOpenError(`Failed to open ${absoluteDbPath}: ${(err as Error).message}`, { cause: err });
      }
      ```
   c. Apply PRAGMAs (call `db.pragma(...)` for each):
      - `'journal_mode = WAL'`
      - `'foreign_keys = ON'`
      - `'synchronous = NORMAL'`
      - `'busy_timeout = 5000'`
      - `'temp_store = MEMORY'`
      - `'cache_size = -10000'` (about 10 MB page cache)
   d. Verify FTS5 is compiled in:
      ```typescript
      const opts = db.prepare('PRAGMA compile_options').all() as Array<{ compile_options: string }>;
      if (!opts.some((o) => o.compile_options === 'ENABLE_FTS5')) {
        db.close();
        throw new FtsUnavailableError('SQLite build does not include FTS5 — FTS5 required for VAULT-02');
      }
      ```
   e. Run migrations: `runPendingMigrations(db);`
   f. Return `db`.

7. The file MUST NOT be exported from `vault/index.ts` or `src/index.ts` (boundary enforcement — see Task 3 + 4).</action>
  <verify>Run: `pnpm --filter @cds/core run build` — must exit 0. Run: `grep -c "export function openRawDb" packages/cds-core/src/vault/internal/db.ts` — expect 1. Run: `grep -c "export type RawDatabase" packages/cds-core/src/vault/internal/db.ts` — expect 1. Run: `grep -c "journal_mode = WAL" packages/cds-core/src/vault/internal/db.ts` — expect 1. Run: `grep -c "ENABLE_FTS5" packages/cds-core/src/vault/internal/db.ts` — expect 1.</verify>
  <acceptance_criteria>
    - db.ts default-imports `Database` from `better-sqlite3`
    - db.ts exports `openRawDb(absoluteDbPath: string): RawDatabase`
    - db.ts exports `type RawDatabase`
    - db.ts calls `db.pragma(...)` for exactly the 6 PRAGMAs listed (WAL, foreign_keys, synchronous, busy_timeout, temp_store, cache_size)
    - db.ts verifies `ENABLE_FTS5` via `PRAGMA compile_options` and throws `FtsUnavailableError` if absent
    - db.ts calls `runPendingMigrations(db)` after PRAGMAs + FTS5 check
    - db.ts uses `.js` suffix in runtime relative imports (e.g., `'./migrations/runner.js'`, `'../sessions.js'`)
  </acceptance_criteria>
  <done>openRawDb factory landed; compiles with strict NodeNext; ready for sessions.ts to consume.</done>
</task>

<task type="auto">
  <name>Task 2: Implement `sessions.ts` (public API + error hierarchy + types + cache)</name>
  <files>packages/cds-core/src/vault/sessions.ts</files>
  <read_first>packages/cds-core/src/vault/internal/db.ts, .planning/phases/35-tiered-vault-tier-2-sqlite/35-RESEARCH.md, .planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md</read_first>
  <action>Create `packages/cds-core/src/vault/sessions.ts`. This is the single public writer per VAULT-03. Implementation:

**Error classes** (exported):
- `VaultError extends Error` — base, sets `this.name = 'VaultError'`, accepts `(message: string, opts?: ErrorOptions)`.
- `SchemaVersionError extends VaultError`
- `FtsUnavailableError extends VaultError`
- `DbOpenError extends VaultError`
- Re-export `MigrationError` from `./internal/migrations/runner.js` so it surfaces through the public barrel: `export { MigrationError } from './internal/migrations/runner.js';`

**Types** (exported):
```typescript
export interface Session {
  id: string;
  start_time: string;   // ISO 8601
  end_time: string | null;
  project: string;
  summary: string | null;
}
export interface Observation {
  id: number;
  session_id: string;
  type: string;
  content: string;
  entities: number[];   // parsed from JSON TEXT column
  created_at: string;   // ISO 8601
}
export interface Entity {
  id: number;
  name: string;
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
export interface SearchHit {
  observation: Observation;
  rank: number;
  sessionSummary: string | null;
}
export interface SessionsDB {
  createSession(input: { project: string; summary?: string | null }): Session;
  appendObservation(input: { sessionId: string; type: string; content: string; entities?: number[] }): Observation;
  upsertEntity(input: { name: string; type: string }): Entity;
  linkRelation(input: { fromEntity: number; toEntity: number; relationType: string; sessionId: string }): Relation;
  searchObservations(query: string, options?: { limit?: number; sessionId?: string; type?: string }): SearchHit[];
  timeline(anchorObservationId: number, window?: number): Observation[];
  close(): void;
}
```

**Constant** (exported): `export const CANONICAL_ENTITY_TYPES: readonly string[] = ['person','project','concept','decision','file','commit','skill','api'];`

**Module-level cache** (per D-49):
```typescript
const CACHE = new Map<string, SessionsDB>();
```

**Public factory** `openSessionsDB(projectPath: string): SessionsDB`:
1. `const cached = CACHE.get(projectPath); if (cached) return cached;`
2. Compute path per D-48: `const dbPath = join(homedir(), 'vault', 'projects', basename(projectPath), 'sessions.db');`
3. Call `const raw = openRawDb(dbPath);` (imported from `./internal/db.js`)
4. Build the handle via `buildSessionsHandle(raw, basename(projectPath))` (private helper — Task 2 continues)
5. `CACHE.set(projectPath, handle); return handle;`

**Public helper** `closeSessionsDB(projectPath: string): void`:
```typescript
const h = CACHE.get(projectPath);
if (h) { h.close(); CACHE.delete(projectPath); }
```

**Private** `buildSessionsHandle(db: RawDatabase, project: string): SessionsDB`:
- Prepare statements ONCE inside this function (Pitfall 4 — after migrations have run):
  - `createSessionStmt = db.prepare('INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)')`
  - `appendObsStmt = db.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)')`
  - `upsertEntityStmt = db.prepare("INSERT INTO entities (name, type, first_seen, last_updated) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET type=excluded.type, last_updated=excluded.last_updated RETURNING id, name, type, first_seen, last_updated")`
  - `linkRelationStmt = db.prepare('INSERT OR IGNORE INTO relations (from_entity, to_entity, relation_type, observed_in_session) VALUES (?, ?, ?, ?)')`
  - `selectRelationStmt = db.prepare('SELECT from_entity, to_entity, relation_type, observed_in_session FROM relations WHERE from_entity=? AND to_entity=? AND relation_type=? AND observed_in_session=?')`
  - `searchStmt = db.prepare("SELECT o.id, o.session_id, o.type, o.content, o.entities, o.created_at, s.summary AS session_summary, bm25(observations_fts) AS rank FROM observations_fts JOIN observations o ON o.id = observations_fts.rowid LEFT JOIN sessions s ON s.id = o.session_id WHERE observations_fts MATCH ? ORDER BY rank LIMIT ?")`
  - `timelineStmt = db.prepare('SELECT id, session_id, type, content, entities, created_at FROM observations WHERE session_id = (SELECT session_id FROM observations WHERE id=?) AND id BETWEEN ? AND ? ORDER BY id ASC')`

- Method implementations:

  - `createSession({ project: p, summary = null })`:
    - `const id = randomUUID();` (import from `node:crypto`)
    - `const start = new Date().toISOString();`
    - `createSessionStmt.run(id, start, p, summary);`
    - `return { id, start_time: start, end_time: null, project: p, summary };`

  - `appendObservation({ sessionId, type, content, entities = [] })`:
    - Validate `entities`: throw `new VaultError('observations.entities must be an array of integers')` if `!Array.isArray(entities) || !entities.every(Number.isInteger)`.
    - `const created = new Date().toISOString();`
    - `const info = appendObsStmt.run(sessionId, type, content, JSON.stringify(entities), created);`
    - `return { id: Number(info.lastInsertRowid), session_id: sessionId, type, content, entities, created_at: created };`

  - `upsertEntity({ name, type })`:
    - `const now = new Date().toISOString();`
    - `const row = upsertEntityStmt.get(name, type, now, now) as Entity;`
    - `return row;`

  - `linkRelation({ fromEntity, toEntity, relationType, sessionId })`:
    - `linkRelationStmt.run(fromEntity, toEntity, relationType, sessionId);`
    - Return current row: `const row = selectRelationStmt.get(fromEntity, toEntity, relationType, sessionId) as Relation;`
    - `return row;`

  - `searchObservations(query, options = {})`:
    - `const limit = Math.max(1, Math.min(options.limit ?? 20, 500));`
    - Raw FTS5 query: `const rows = searchStmt.all(query, limit) as Array<{ id: number; session_id: string; type: string; content: string; entities: string; created_at: string; session_summary: string | null; rank: number }>;`
    - Apply optional `sessionId` / `type` filters IN MEMORY (avoids complicating FTS5 MATCH grammar — acceptable at 500-row cap).
    - Parse each row's `entities` JSON back to `number[]` via `JSON.parse`.
    - Return `SearchHit[]`.

  - `timeline(anchorObservationId, window = 5)`:
    - `const anchorRow = db.prepare('SELECT session_id, id FROM observations WHERE id = ?').get(anchorObservationId) as { session_id: string; id: number } | undefined;`
    - If absent: return `[]`.
    - Use `timelineStmt` with bounds `[anchorRow.id - window, anchorRow.id + window]`.
    - Parse `entities` JSON; return `Observation[]`.

  - `close()`: call `db.close();`

- Return a frozen object with the method bag.

**Input hardening notes:**
- `projectPath` is passed through `path.basename` inside `openSessionsDB` — no path traversal risk.
- All SQL is parameterized through prepared statements. No string interpolation of user input into SQL.
- FTS5 `MATCH` query is parameterized; malformed queries throw better-sqlite3 errors that should be caught and rethrown as `VaultError` at the call site OR propagated unchanged (document this choice in SUMMARY — planner picks propagation to surface syntax errors to callers).

The file MUST compile under `@cds/core` tsconfig; confirm with `pnpm --filter @cds/core run build`.</action>
  <verify>Run: `pnpm --filter @cds/core run build` — must exit 0. Run: `grep -c "^export class VaultError" packages/cds-core/src/vault/sessions.ts` — expect 1. Run: `grep -c "^export function openSessionsDB" packages/cds-core/src/vault/sessions.ts` — expect 1. Run: `grep -c "CACHE.set" packages/cds-core/src/vault/sessions.ts` — expect 1. Run: `grep -c "randomUUID" packages/cds-core/src/vault/sessions.ts` — expect at least 1. Run: `grep -c "bm25(observations_fts)" packages/cds-core/src/vault/sessions.ts` — expect 1.</verify>
  <acceptance_criteria>
    - sessions.ts exports `openSessionsDB`, `closeSessionsDB`, `CANONICAL_ENTITY_TYPES`, `VaultError`, `SchemaVersionError`, `FtsUnavailableError`, `DbOpenError`
    - sessions.ts re-exports `MigrationError` from `./internal/migrations/runner.js`
    - sessions.ts exports interface types `Session`, `Observation`, `Entity`, `Relation`, `SearchHit`, `SessionsDB`
    - sessions.ts uses `randomUUID()` from `node:crypto` for session IDs
    - sessions.ts uses `homedir() + basename(projectPath)` for path resolution (never absolute-path-traversal-safe)
    - sessions.ts uses prepared statements only — no template-string SQL
    - sessions.ts validates `entities` argument is an array of integers
    - sessions.ts caches handles in a module-level `Map<string, SessionsDB>`
    - sessions.ts file length >= 150 lines
    - `pnpm --filter @cds/core run build` exits 0
  </acceptance_criteria>
  <done>Public session API landed with full CRUD + search + timeline + cache; compiles cleanly.</done>
</task>

<task type="auto">
  <name>Task 3: Create `vault/index.ts` (public facade — re-export sessions only, NEVER internal/*)</name>
  <files>packages/cds-core/src/vault/index.ts</files>
  <read_first>packages/cds-core/src/vault/sessions.ts, .planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md</read_first>
  <action>Create `packages/cds-core/src/vault/index.ts` as a re-export barrel that exposes ONLY the `sessions.ts` public surface. Content:

```typescript
// packages/cds-core/src/vault/index.ts
// Public facade. Re-exports ONLY the sessions API.
// NEVER re-export from './internal/*' — the boundary is enforced by this file.
export {
  openSessionsDB,
  closeSessionsDB,
  CANONICAL_ENTITY_TYPES,
  VaultError,
  SchemaVersionError,
  MigrationError,
  FtsUnavailableError,
  DbOpenError,
} from './sessions.js';
export type {
  Session,
  Observation,
  Entity,
  Relation,
  SearchHit,
  SessionsDB,
} from './sessions.js';
```

Do NOT add any other export. Do NOT add a re-export of `RawDatabase` or `openRawDb` from `./internal/db.js`. This file IS the boundary; deviations here defeat VAULT-03.</action>
  <verify>Run: `pnpm --filter @cds/core run build` — must exit 0. Run: `grep -c "from './internal" packages/cds-core/src/vault/index.ts` — expect 0. Run: `grep -c "from './sessions.js'" packages/cds-core/src/vault/index.ts` — expect 2 (one for value exports, one for type exports). Run: `grep -c "openRawDb\\|RawDatabase" packages/cds-core/src/vault/index.ts` — expect 0.</verify>
  <acceptance_criteria>
    - vault/index.ts exports exactly the symbols listed above (9 values + 6 types)
    - vault/index.ts has ZERO imports from `./internal/*`
    - vault/index.ts does NOT mention `openRawDb` or `RawDatabase`
    - `pnpm --filter @cds/core run build` exits 0
  </acceptance_criteria>
  <done>Public facade landed; boundary enforced at the re-export layer.</done>
</task>

<task type="auto">
  <name>Task 4: Update `packages/cds-core/src/index.ts` to re-export the vault public surface</name>
  <files>packages/cds-core/src/index.ts</files>
  <read_first>packages/cds-core/src/index.ts, packages/cds-core/src/vault/index.ts</read_first>
  <action>Edit `packages/cds-core/src/index.ts`. Preserve the existing `CDS_CORE_VERSION` export (do NOT delete it — `CLAUDE.md` forbids deletion without explicit request). Append a single line re-exporting the vault barrel:

```typescript
export * from './vault/index.js';
```

Place this export AFTER the existing `CDS_CORE_VERSION` line so future merges that touch the top of the file don't collide.

Full expected content (verify by reading the file after edit):
```typescript
/**
 * @cds/core — Core primitives for claude-dev-stack.
 *
 * Phase 33 stub. Real implementation in Phase 34+:
 * - agent-dispatcher (SDK-02)
 * - Context (CORE-01)
 * - CostTracker (CORE-02)
 */
export const CDS_CORE_VERSION = '0.0.0-stub';
export * from './vault/index.js';
```

(If Phase 34 has already added additional exports between the comment block and the new line, do not touch them — just append the vault re-export at the end.)</action>
  <verify>Run: `pnpm --filter @cds/core run build` — must exit 0. Run: `grep -c "CDS_CORE_VERSION" packages/cds-core/src/index.ts` — expect 1 (preserved). Run: `grep -c "./vault/index.js" packages/cds-core/src/index.ts` — expect 1 (new line). Run: `node -e "import('./packages/cds-core/dist/index.js').then(m => console.log(Object.keys(m).sort()))"` — expected output includes `CDS_CORE_VERSION, CANONICAL_ENTITY_TYPES, DbOpenError, FtsUnavailableError, MigrationError, SchemaVersionError, VaultError, closeSessionsDB, openSessionsDB` and does NOT include `openRawDb`.</verify>
  <acceptance_criteria>
    - packages/cds-core/src/index.ts still exports `CDS_CORE_VERSION`
    - packages/cds-core/src/index.ts now also exports everything from `./vault/index.js`
    - Dynamic import at runtime of `@cds/core` surface does NOT include `openRawDb` or `RawDatabase`
    - `pnpm --filter @cds/core run build` exits 0
  </acceptance_criteria>
  <done>@cds/core barrel updated; vault symbols reachable from `@cds/core`; internal symbols still hidden.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `pnpm --filter @cds/core run build` exits 0
- [ ] `node -e "import('@cds/core').then(m => console.log(typeof m.openSessionsDB, typeof m.openRawDb))"` prints `function undefined`
- [ ] All existing Phase 33/34 tests still pass (plan-level regression check)
</verification>

<success_criteria>
- All 4 tasks completed
- `internal/db.ts`, `sessions.ts`, `vault/index.ts`, and `src/index.ts` all compile under `@cds/core` tsconfig
- Public surface exposes sessions API; internal surface hidden
- Module-level cache honors D-49
- All PRAGMAs + FTS5 verification on every open
</success_criteria>

<output>
After completion, create `.planning/phases/35-tiered-vault-tier-2-sqlite/35-03-SUMMARY.md` documenting: line counts per file, PRAGMA list chosen, error class count, whether MigrationError is owned by runner.ts or sessions.ts (should be runner.ts, re-exported through sessions.ts).
</output>
