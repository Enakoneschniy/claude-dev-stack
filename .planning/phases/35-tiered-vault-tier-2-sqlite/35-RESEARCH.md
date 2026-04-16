# Phase 35: Tiered Vault — Tier 2 SQLite - Research

**Researched:** 2026-04-16
**Domain:** Embedded SQLite for per-project session memory (better-sqlite3, WAL, FTS5)
**Confidence:** HIGH (stack + architecture), MEDIUM (FTS5 trigger wiring corner cases)

## Summary

Phase 35 populates the `packages/cds-core/src/vault/` folder with a SQLite-backed session memory layer. The driver (`better-sqlite3@^12.9.0`) is locked by CONTEXT.md D-34 and REQUIREMENTS VAULT-01 — research does not re-evaluate drivers. The hard work is: (a) getting WAL + FTS5 verification right on `openRawDb`, (b) a minimal-but-correct auto-migration runner wired to a numbered `migrations/*.sql` directory, and (c) a regression test that demonstrates VAULT-03 boundary enforcement (no consumer can reach the raw `Database` handle).

Phase 35 also requires a small surgical amend to Phase 33 artifacts: drop Node 18 from `.github/workflows/ci.yml` matrix, bump root `package.json` engines to `>=20`, and add an entry to `NOTICES.md` for `better-sqlite3` (MIT). These are grouped into Plan 01 (baseline bump) — separated from the vault code so Plan 01 can land first and unblock the remaining plans on a Node 20 CI.

**Primary recommendation:** Four plans — (01) Node baseline bump + better-sqlite3 install + CI matrix amend + NOTICES.md; (02) schema + numbered SQL migrations + migration runner; (03) `sessions.ts` public API + error classes + folder structure for boundary enforcement; (04) integration tests + VAULT-03 boundary regression test. Plan 01 runs first (Wave 1). Plans 02/03 can run in the same Wave 2 (different files, but 03 imports from 02 — so 03 depends_on 02). Plan 04 runs in Wave 3 (tests depend on all production code).

## User Constraints

**Verbatim from `.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md`. Planner MUST honor.**

### Locked Decisions

- **D-33:** CDS baseline = Node 20+ for v1.0. Breaking change. Justified by Node 18 EOL + better-sqlite3@12 engines + alpha tag shielding v0.12.x users.
- **D-34:** `better-sqlite3@^12.9.0` (MIT). Engines: `node: 20.x || 22.x || 23.x || 24.x || 25.x`. Prebuilds via `prebuild-install` for common arch — satisfies "no post-install compilation" constraint for common platforms.
- **D-35:** Migration guide for Node 18 users is Phase 39 scope (not Phase 35).
- **D-36:** Migrations = numbered SQL files `001-initial.sql`, `002-*.sql` in `packages/cds-core/src/vault/migrations/`. Zero-padded 3-digit integer prefix. Pure SQL (DDL + optional DML).
- **D-37:** Auto-migrate on `openSessionsDB(projectPath)`. Flow inside single transaction: ensure `schema_version` table; read `MAX(version)`; scan files; apply pending in order; insert `(version, ISO timestamp)` rows; commit (or rollback on any error).
- **D-38:** No rollback / down migrations. Forward-only. Bad migration → corrective forward migration.
- **D-39:** Migration runner reads `.sql` at runtime via `fs.readFileSync` relative to compiled `dist/vault/migrations/`. Ship via existing `"files": ["dist"]` in `packages/cds-core/package.json` (no bundler step needed).
- **D-40:** Boundary = folder convention + no re-export. Structure:
  ```
  packages/cds-core/src/vault/
    internal/
      db.ts
      migrations/
        runner.ts
        001-initial.sql
    sessions.ts
    index.ts
  ```
- **D-41:** `cds-core/src/index.ts` re-exports `./vault/index.js` — exposes ONLY sessions API (`openSessionsDB`, types, error classes). Raw `Database` never public.
- **D-42:** Regression test `vault.boundary.test.ts`: verifies `openRawDb` is `undefined` on `@cds/core` import; scans consumer packages for `@cds/core/vault/internal/*` imports (fails if any).
- **D-43:** Canonical tables — `sessions(id PK TEXT, start_time, end_time, project, summary)`; `observations(id PK INTEGER AUTOINCREMENT, session_id FK, type, content, entities JSON, created_at)`; `entities(id PK INTEGER AUTOINCREMENT, name TEXT UNIQUE, type, first_seen, last_updated)`; `relations(from_entity FK INT, to_entity FK INT, relation_type, observed_in_session FK TEXT)`.
- **D-44:** `observations.entities` JSON = array of integer entity IDs `[1, 5, 42]`. NOT inline copies.
- **D-45:** `entities.type` + `relations.relation_type` = open strings, not TS enums. Export `CANONICAL_ENTITY_TYPES` as autocomplete hint only.
- **D-46:** FTS5 external-content virtual table: `observations_fts USING fts5(content, session_summary, content=observations, content_rowid=id)`. Denormalizes `sessions.summary` into the FTS row to avoid query-time JOIN.
- **D-47:** Triggers on `observations` INSERT/UPDATE/DELETE keep `observations_fts` in sync. Trigger on `sessions.summary` UPDATE re-denormalizes into matching FTS rows.
- **D-48:** Path resolution = `path.join(os.homedir(), 'vault', 'projects', path.basename(projectPath), 'sessions.db')`. Create parent dir with `recursive: true`. NO `reverseProjectMap()` coupling in Phase 35.
- **D-49:** `openSessionsDB` caches opened handles in a module-level `Map<string, SessionsDB>` keyed by `projectPath`. Provide `closeSessionsDB(projectPath)` for explicit close. No auto-close-on-exit handler.
- **D-50:** Concurrent access — WAL allows multi-reader + one writer. No explicit lock API.

### Claude's Discretion (planner + executor freedom)

- Exact PRAGMA set beyond WAL: `synchronous=NORMAL`, `foreign_keys=ON`, `cache_size=-10000`, `busy_timeout=5000`, `temp_store=MEMORY` — all standard better-sqlite3 guidance, pick reasonable defaults.
- `CANONICAL_ENTITY_TYPES` shape — `readonly string[]` recommended for simplicity (no branded types).
- TS interface shape for `Session`, `Observation`, `Entity`, `Relation` — mirror SQL schema; expose ISO strings (SQLite returns TEXT), not parsed `Date`.
- Error class hierarchy — `VaultError` base with subclasses `SchemaVersionError`, `MigrationError`, `FtsUnavailableError`, `DbOpenError`. All extend `Error`.
- `sessions.search(query, options?)` filters: `limit` (default 20), `sessionId?`, `type?`. Returns `Array<{ observation: Observation, rank: number, sessionSummary: string | null }>`.
- `sessions.timeline(anchorId, window?)` default `window = 5` → returns `anchorId` ± 5 chronologically adjacent observations in the same session.

### Deferred — OUT OF SCOPE

- No dispatchAgent / Haiku / markdown extraction (Phase 36).
- No MCP tool exposure (Phase 37).
- No markdown → SQLite backfill (Phase 38).
- No `reverseProjectMap()` integration — basename-only path resolution per D-48.

### Project Constraints (from ./CLAUDE.md)

- **Language:** Code and commits English. Communication Russian (does not affect artifact contents).
- **Commits:** Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **On new dependency:** Explain in session log. `better-sqlite3` entry MUST be added to `NOTICES.md` (Phase 34 artifact) and documented in Phase 35 session log.
- **Do NOT delete code without explicit request.** Applies to all Plan 01 surgical edits.
- **Skills:** `.claude/skills/` present. No skill directly governs DB plans — read SKILL.md on-demand if the planner/executor needs project-specific guidance (none anticipated for vault code).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw DB connection + PRAGMA setup | `vault/internal/db.ts` | — | Internal factory; not exported from package |
| Schema creation + migration loop | `vault/internal/migrations/runner.ts` + numbered `*.sql` files | — | Data directory authoritative; runner stateless |
| Public session memory API | `vault/sessions.ts` | — | Single write surface per VAULT-03 |
| Public facade | `vault/index.ts` | — | Re-export only — enforces boundary |
| Error hierarchy | `vault/sessions.ts` (or `vault/errors.ts`) | — | Co-located with writer or separate; planner choice |
| FTS5 indexing | DB-internal (triggers + external-content vtab) | `vault/internal/db.ts` verifies FTS5 available | Triggers keep it automatic; runtime just verifies extension |
| Path resolution | `vault/sessions.ts` (calls `openRawDb(sessionsDbPath)`) | — | Path math lives with public API; raw layer takes absolute DB path only |
| Module-level handle cache | `vault/sessions.ts` | — | Cache exposed through `openSessionsDB`, never raw |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | `^12.9.0` | Synchronous SQLite driver for Node.js | Locked per D-34; battle-tested, synchronous API simpler than `node:sqlite` async surface; prebuilds cover Darwin/Linux/Win32 x x64/arm64 [CITED: better-sqlite3 README] |
| `@types/better-sqlite3` | `^7.x` | TypeScript types | Maintained by DefinitelyTyped; types track runtime closely [ASSUMED — planner verifies exact version at install time] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:fs` (stdlib) | n/a | `mkdirSync({recursive: true})`, `readFileSync` for migrations, `readdirSync` for migration scan | Standard — no dep |
| `node:os` (stdlib) | n/a | `os.homedir()` for path resolution | Standard — no dep |
| `node:path` (stdlib) | n/a | `path.join`, `path.basename`, `path.resolve` | Standard — no dep |
| `node:url` (stdlib) | n/a | `fileURLToPath(import.meta.url)` to locate shipped `migrations/` dir | Required because ESM `__dirname` is not defined; see Pitfall 3 |
| `vitest` | existing (`^3.2.4`) | Test runner (Phase 33 scaffold) | Already in monorepo |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `better-sqlite3` | `node:sqlite` (Node 22+ experimental) | Async API, still experimental in Node 22, stabilizing in 24; we can migrate later (D-48 folded todo) |
| `better-sqlite3` | `bun:sqlite` | Rejected — not on Bun runtime (REQUIREMENTS Out of Scope) |
| Numbered SQL files | `db-migrate` / `sqlx migrate` / `Knex` | Overkill for 1-file schema; introduces dep; D-36 locks file-based approach |
| External-content FTS5 | Contentless FTS5 | Can't return `content` on match, forces second query; external-content is the right choice [CITED: sqlite.org/fts5.html Section 4.4.2] |
| External-content FTS5 | Standalone FTS5 table | Duplicates content; storage doubles; triggers still needed |

**Installation (added in Plan 01):**
```bash
pnpm --filter @cds/core add better-sqlite3@^12.9.0
pnpm --filter @cds/core add -D @types/better-sqlite3
```

**Version verification:** Planner / executor runs `npm view better-sqlite3 version` at install time to confirm latest `^12.x` resolves correctly. CONTEXT.md D-34 states `12.9.0` as of 2026-04-16. Minor version drift within `^12.x` is acceptable; major version bump requires re-planning.

## Architecture Patterns

### System Architecture Diagram

```
 Phase 36+ callers                     CLI / consumers                Tests
   (dispatchAgent)                     (cds-core importers)
        |                                   |                           |
        | openSessionsDB(projectPath)       | import from '@cds/core'   | import from
        |                                   |   -> only sessions API    |   '@cds/core' or
        v                                   v                           v   test helpers
   +---------------------------------------------------------------------+
   |  packages/cds-core/src/vault/index.ts       (PUBLIC FACADE)         |
   |  re-exports sessions API + types + error classes                    |
   |  does NOT re-export internal/*                                      |
   +-----------+---------------------------------------------------+-----+
               |                                                   |
               v reads/writes via handle                           |
   +-----------------------------------------------+               |
   |  packages/cds-core/src/vault/sessions.ts      |               |
   |  - module Map<projectPath, SessionsDB>        |               |
   |  - openSessionsDB() -> cache hit OR openRawDb |               |
   |  - createSession, appendObservation,          |               |
   |    upsertEntity, linkRelation, searchObs,     |               |
   |    timeline, closeSessionsDB                  |               |
   |  - Error hierarchy                            |               |
   +-----------+-----------------------------------+               |
               |                                                   |
               v calls openRawDb(absoluteDbPath)                   |
   +-----------------------------------------------+               |
   |  packages/cds-core/src/vault/internal/db.ts   |               |
   |  (INTERNAL — not re-exported by index.ts)     |               |
   |  - openRawDb(dbPath):                         |               |
   |    * new Database(dbPath)                     |               |
   |    * PRAGMA journal_mode=WAL                  |               |
   |    * PRAGMA foreign_keys=ON                   |               |
   |    * PRAGMA synchronous=NORMAL                |               |
   |    * verify fts5 available (throws            |               |
   |      FtsUnavailableError if missing)          |               |
   |    * runPendingMigrations(db)                 |               |
   |  - type SessionsDB wraps Database handle      |               |
   +-----------+-----------------------------------+               |
               |                                                   |
               v                                                   |
   +-----------------------------------------------+               |
   |  vault/internal/migrations/runner.ts          |               |
   |  - reads schema_version table                 |               |
   |  - scans dist/vault/internal/migrations/*.sql |               |
   |  - applies pending in a single transaction    |               |
   +-----------+-----------------------------------+               |
               |                                                   |
               v                                                   |
     ~/vault/projects/{name}/sessions.db  <----------------------------
                (better-sqlite3, WAL mode, FTS5 enabled)
```

Entry point: any caller in `cds-core` scope (Phase 36 Stop hook, Phase 37 MCP server, Phase 38 backfill migrator, Plan 04 integration tests). Data flow is unidirectional — public facade -> `sessions.ts` -> `internal/db.ts` -> SQLite file. No component reaches across layers (e.g., `index.ts` never imports `internal/*`).

### Recommended Project Structure

```
packages/cds-core/
  src/
    index.ts                             # add: export * from './vault/index.js'
    vault/
      index.ts                           # public facade — exports sessions.ts only
      sessions.ts                        # public API + error classes + types
      internal/
        db.ts                            # openRawDb, PRAGMA, FTS5 verify
        migrations/
          runner.ts                      # auto-migrate loop
          001-initial.sql                # first schema (D-43..D-47 tables + FTS5 + triggers)
      vault.boundary.test.ts             # VAULT-03 regression test (Plan 04)
      sessions.test.ts                   # integration tests (Plan 04)
  package.json                           # add better-sqlite3 dep + @types
  tsconfig.json                          # already OK (NodeNext composite)
  vitest.config.ts                       # already OK (test include glob matches)
```

### Pattern 1: Synchronous Database Init with Transactional Migration

**What:** All DB mutations happen in synchronous calls wrapped in `db.transaction(...)`. `better-sqlite3` is synchronous by design — no `await` anywhere.

**When to use:** Every migration batch + every multi-statement writer call.

**Example (per better-sqlite3 README — transaction pattern):**
```typescript
import Database from 'better-sqlite3';

const db = new Database(absolutePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Verify FTS5 compiled-in via PRAGMA compile_options
const opts = db.prepare("PRAGMA compile_options").all() as Array<{ compile_options: string }>;
if (!opts.some(o => o.compile_options === 'ENABLE_FTS5')) {
  throw new FtsUnavailableError('SQLite build does not include FTS5');
}

// Transactional migration batch — db.transaction wrapper rolls back on throw
const applyMigrations = db.transaction((migrations: Array<{ version: number; sql: string }>) => {
  for (const m of migrations) {
    db.exec(m.sql);
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
      .run(m.version, new Date().toISOString());
  }
});
applyMigrations(pendingMigrations);
```

### Pattern 2: External-Content FTS5 with Triggers (D-46/D-47)

**What:** FTS5 virtual table references `observations` as its content source. Triggers on the source keep the FTS index in sync.

**When to use:** Every `observations` INSERT/UPDATE/DELETE; every `sessions.summary` UPDATE re-denormalizes.

**Example (goes in `001-initial.sql`):**
```sql
-- External-content FTS5 virtual table
CREATE VIRTUAL TABLE observations_fts USING fts5(
  content,
  session_summary,
  content=observations,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Sync triggers. Note: observations_fts._content is NOT stored (external content);
-- we MUST call delete/insert commands to keep the FTS index up to date.
CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, content, session_summary)
  VALUES (
    new.id,
    new.content,
    (SELECT summary FROM sessions WHERE id = new.session_id)
  );
END;

CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, content, session_summary)
    VALUES('delete', old.id, old.content,
           (SELECT summary FROM sessions WHERE id = old.session_id));
  INSERT INTO observations_fts(rowid, content, session_summary)
    VALUES (new.id, new.content,
            (SELECT summary FROM sessions WHERE id = new.session_id));
END;

CREATE TRIGGER observations_ad AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, content, session_summary)
    VALUES('delete', old.id, old.content,
           (SELECT summary FROM sessions WHERE id = old.session_id));
END;

-- Session summary re-denormalize trigger
CREATE TRIGGER sessions_summary_au AFTER UPDATE OF summary ON sessions BEGIN
  -- Delete+reinsert matching FTS rows with new session_summary
  INSERT INTO observations_fts(observations_fts, rowid, content, session_summary)
    SELECT 'delete', id, content, old.summary
      FROM observations WHERE session_id = new.id;
  INSERT INTO observations_fts(rowid, content, session_summary)
    SELECT id, content, new.summary
      FROM observations WHERE session_id = new.id;
END;
```

[CITED: sqlite.org/fts5.html Section 4.4.2 "External Content Tables" — the `INSERT INTO fts_table(fts_table, ...) VALUES('delete', ...)` syntax is the documented "delete command" for external-content FTS5 indexes.]

### Pattern 3: ESM-Safe Migration Directory Resolution

**What:** `__dirname` is undefined in ESM. Resolve migrations dir via `fileURLToPath(import.meta.url)`.

**Why this matters:** Migrations ship in `dist/vault/internal/migrations/`. The runner lives at `dist/vault/internal/migrations/runner.js`. We need an absolute path.

**Example:**
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));  // .../dist/vault/internal/migrations

export function scanMigrations(): Array<{ version: number; sql: string }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}-.+\.sql$/.test(f))
    .sort();  // alphabetical = numerical because zero-padded
  return files.map(f => ({
    version: parseInt(f.slice(0, 3), 10),
    sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'),
  }));
}
```

### Pattern 4: Prepared Statement Caching + Transaction Wrappers

**What:** Prepare statements once when the SessionsDB wrapper is built; wrap multi-row writes in transactions.

**Example:**
```typescript
// Inside sessions.ts, after opening the SessionsDB handle
const stmts = {
  createSession: db.prepare('INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)'),
  appendObservation: db.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)'),
  upsertEntity: db.prepare(`
    INSERT INTO entities (name, type, first_seen, last_updated)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET type=excluded.type, last_updated=excluded.last_updated
    RETURNING id
  `),
  searchObs: db.prepare(`
    SELECT o.id, o.session_id, o.type, o.content, o.entities, o.created_at,
           obs_fts.session_summary, bm25(observations_fts) AS rank
      FROM observations_fts
      JOIN observations o ON o.id = observations_fts.rowid
      WHERE observations_fts MATCH ?
      ORDER BY rank
      LIMIT ?
  `),
};
```

### Anti-Patterns to Avoid

- **Opening `better-sqlite3` in async/await context:** The API is 100% synchronous. Wrapping in `async` adds no value and confuses callers. Use plain functions.
- **Skipping `journal_mode = WAL` on first open:** Without WAL, concurrent readers block writers. Always run the PRAGMA on every `openRawDb`.
- **Querying FTS5 via JOIN instead of external-content vtab:** FTS5 `content=observations` pattern is documented and supported; JOINing at query time works but loses ranking signal.
- **Forgetting `content_rowid=id`:** Without it, FTS5 uses an implicit rowid that won't match `observations.id` — index gets out of sync silently.
- **Storing `Date` objects in SQLite:** SQLite has no Date type. Use ISO 8601 strings (`toISOString()`).
- **Dropping Node 18 from engines without amending CI matrix:** Would cause stale CI to test an unsupported Node. Plan 01 MUST do both in one wave.
- **Shipping `.sql` files only in `src/`:** Won't land in `dist/` -> runtime `readFileSync` fails. Add a post-build copy step (see Pitfall 5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration file discovery | Custom glob pattern + version parse | `readdirSync` + `/^\d{3}-.+\.sql$/` regex | Directory is small, deterministic; zero-padded sort is free |
| Transaction wrapper | Manual BEGIN/COMMIT/ROLLBACK with try/catch | `db.transaction(fn)` from better-sqlite3 | Rolls back automatically on throw; handles nesting [CITED: better-sqlite3 api.md Database#transaction] |
| Entity name uniqueness | Sentinel SELECT -> conditional INSERT | `INSERT ... ON CONFLICT(name) DO UPDATE ... RETURNING id` | Atomic, single round-trip, idempotent |
| FTS5 ranking | Manual TF-IDF scoring | `bm25(observations_fts)` aux function | SQLite builtin; the only correct ranker for FTS5 [CITED: sqlite.org/fts5.html Section 7] |
| Identifier generation | Custom counter | `crypto.randomUUID()` for sessions, `INTEGER PRIMARY KEY AUTOINCREMENT` for observations/entities | Collision-resistant, zero code |

**Key insight:** SQLite + better-sqlite3 ship every primitive we need. Reach for them first; write TS only to compose them.

## Common Pitfalls

### Pitfall 1: FTS5 Not Compiled Into Binary
**What goes wrong:** `CREATE VIRTUAL TABLE ... USING fts5(...)` fails with `no such module: fts5`.
**Why it happens:** Very rare custom SQLite builds omit FTS5. better-sqlite3's shipped prebuilds include FTS5, but a `node-gyp rebuild` on an exotic system using a system SQLite without FTS5 may not.
**How to avoid:** In `openRawDb`, run `PRAGMA compile_options` and assert `ENABLE_FTS5` is present. Throw `FtsUnavailableError` with actionable message.
**Warning signs:** First-open of the DB throws in the migration transaction — rolled back, no `sessions.db` created.

### Pitfall 2: `entities` JSON Not Validated at Write Time
**What goes wrong:** A consumer stores `[{"id": 1, "name": "x"}]` (objects) instead of `[1]` (IDs), silently breaking any future query that casts to `int[]`.
**Why it happens:** SQLite's JSON column is untyped.
**How to avoid:** `sessions.ts` validates the shape on write: `Array.isArray(ids) && ids.every(Number.isInteger)` -> throw `VaultError('observations.entities must be integer[]')`.
**Warning signs:** Search returns observations with unparseable `entities` strings.

### Pitfall 3: `__dirname` Undefined in ESM
**What goes wrong:** Migration runner throws `ReferenceError: __dirname is not defined` at runtime.
**Why it happens:** `cds-core` is ESM (`"type": "module"`), `__dirname` is CommonJS-only.
**How to avoid:** `const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))`. See Pattern 3.
**Warning signs:** Integration test passes in dev (ts-node) but fails after `tsc` build.

### Pitfall 4: Prepared Statement Created Before Migrations Run
**What goes wrong:** Statements reference tables that don't exist yet -> `SqliteError: no such table: sessions`.
**Why it happens:** Module-top-level `db.prepare(...)` runs before `runPendingMigrations(db)`.
**How to avoid:** Prepare statements INSIDE the function that first uses them OR memoize behind a getter that runs after migrations. Canonical flow: `openRawDb -> migrate -> then create the SessionsDB wrapper with prepared statements`.

### Pitfall 5: `.sql` Files Not Copied to `dist/`
**What goes wrong:** `tsc --build` compiles TS but IGNORES `.sql` files -> `dist/vault/internal/migrations/` has only `runner.js`, no `001-initial.sql` -> `readdirSync` returns empty -> no migrations applied -> tables don't exist.
**Why it happens:** `tsc` only copies its own output.
**How to avoid:** Add a post-build copy step in `packages/cds-core/package.json`:
```json
{
  "scripts": {
    "build": "tsc --build && node scripts/copy-migrations.mjs"
  }
}
```
Where `scripts/copy-migrations.mjs` calls `fs.cpSync('src/vault/internal/migrations', 'dist/vault/internal/migrations', { recursive: true, filter: (src) => src.endsWith('.sql') || !src.includes('.') })`. Plan 02 task spec handles this.
**Warning signs:** Tests pass on first run (files in `src/`), fail after `pnpm -r build`.

### Pitfall 6: WAL Side-Car Files Orphaned in Tests
**What goes wrong:** WAL mode creates `sessions.db-shm` and `sessions.db-wal` side-car files. Tests using `tmpdir()` may leave stragglers; cleanup checks only `.db`.
**How to avoid:** Test teardown removes the entire tmpdir (use `mkdtempSync` + `rmSync({recursive: true})`) OR explicitly `db.close()` + remove all three files. Vitest's `beforeEach` / `afterEach` with per-test tmpdir is simplest.

### Pitfall 7: `busy_timeout` Unset -> Tests Flake Under Parallel Access
**What goes wrong:** Vitest parallel mode opens multiple DBs concurrently. WAL tolerates this, but brief writer contention can throw `SQLITE_BUSY` instead of waiting.
**How to avoid:** `db.pragma('busy_timeout = 5000')` on every open.

## Runtime State Inventory

Not applicable — Phase 35 is a greenfield add; no state rename/refactor. `lib/projects.mjs` and existing markdown writers are untouched by Phase 35 code (they only get blocked at type-check time by Plan 04's regression test).

## Code Examples

Verified patterns from project analogs + documented SQLite/better-sqlite3 APIs.

### Opening the DB with PRAGMAs + FTS5 verification

```typescript
// packages/cds-core/src/vault/internal/db.ts  (Plan 02/03)
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { runPendingMigrations } from './migrations/runner.js';
import { FtsUnavailableError, DbOpenError } from '../sessions.js';

export type RawDatabase = Database.Database;

export function openRawDb(absoluteDbPath: string): RawDatabase {
  mkdirSync(dirname(absoluteDbPath), { recursive: true });

  let db: RawDatabase;
  try {
    db = new Database(absoluteDbPath);
  } catch (err) {
    throw new DbOpenError(`Failed to open ${absoluteDbPath}: ${(err as Error).message}`, { cause: err });
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -10000'); // ~10 MB page cache

  // Verify FTS5 available before running migrations
  const opts = db.prepare('PRAGMA compile_options').all() as Array<{ compile_options: string }>;
  if (!opts.some(o => o.compile_options === 'ENABLE_FTS5')) {
    db.close();
    throw new FtsUnavailableError('SQLite build does not include FTS5 — FTS5 required for VAULT-02');
  }

  runPendingMigrations(db);
  return db;
}
```

### Migration Runner

```typescript
// packages/cds-core/src/vault/internal/migrations/runner.ts
import type Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MigrationError } from '../../sessions.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

export function runPendingMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const currentRow = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  const current = currentRow.v ?? 0;

  const pending = scanMigrations().filter(m => m.version > current);
  if (pending.length === 0) return;

  const apply = db.transaction((migrations: Array<{ version: number; sql: string }>) => {
    for (const m of migrations) {
      try {
        db.exec(m.sql);
      } catch (err) {
        throw new MigrationError(`Migration ${m.version} failed: ${(err as Error).message}`, { cause: err });
      }
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(m.version, new Date().toISOString());
    }
  });
  apply(pending);
}

function scanMigrations(): Array<{ version: number; sql: string }> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{3}-.+\.sql$/.test(f))
    .sort();
  return files.map(f => ({
    version: parseInt(f.slice(0, 3), 10),
    sql: readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'),
  }));
}
```

### `sessions.ts` public writer (sketch)

```typescript
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { openRawDb, type RawDatabase } from './internal/db.js';

export class VaultError extends Error { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = 'VaultError'; } }
export class SchemaVersionError extends VaultError { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = 'SchemaVersionError'; } }
export class MigrationError extends VaultError { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = 'MigrationError'; } }
export class FtsUnavailableError extends VaultError { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = 'FtsUnavailableError'; } }
export class DbOpenError extends VaultError { constructor(m: string, opts?: ErrorOptions) { super(m, opts); this.name = 'DbOpenError'; } }

export interface Session { id: string; start_time: string; end_time: string | null; project: string; summary: string | null; }
export interface Observation { id: number; session_id: string; type: string; content: string; entities: number[]; created_at: string; }
export interface Entity { id: number; name: string; type: string; first_seen: string; last_updated: string; }
export interface Relation { from_entity: number; to_entity: number; relation_type: string; observed_in_session: string; }

export const CANONICAL_ENTITY_TYPES: readonly string[] = ['person', 'project', 'concept', 'decision', 'file', 'commit', 'skill', 'api'];

export interface SessionsDB {
  createSession(input: { project: string; summary?: string }): Session;
  appendObservation(input: { sessionId: string; type: string; content: string; entities?: number[] }): Observation;
  upsertEntity(input: { name: string; type: string }): Entity;
  linkRelation(input: { fromEntity: number; toEntity: number; relationType: string; sessionId: string }): Relation;
  searchObservations(query: string, options?: { limit?: number; sessionId?: string; type?: string }): Array<{ observation: Observation; rank: number; sessionSummary: string | null }>;
  timeline(anchorId: number, window?: number): Observation[];
  close(): void;
}

const CACHE = new Map<string, SessionsDB>();

export function openSessionsDB(projectPath: string): SessionsDB {
  const cached = CACHE.get(projectPath);
  if (cached) return cached;

  const dbPath = join(homedir(), 'vault', 'projects', basename(projectPath), 'sessions.db');
  const raw = openRawDb(dbPath);
  const handle = buildSessionsHandle(raw, projectPath);
  CACHE.set(projectPath, handle);
  return handle;
}

export function closeSessionsDB(projectPath: string): void {
  const h = CACHE.get(projectPath);
  if (h) { h.close(); CACHE.delete(projectPath); }
}
```

### `vault/index.ts` public facade

```typescript
// packages/cds-core/src/vault/index.ts
// Re-exports ONLY sessions API — does NOT re-export ./internal/*
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
export type { Session, Observation, Entity, Relation, SessionsDB } from './sessions.js';
```

### `vault.boundary.test.ts` regression test

```typescript
// packages/cds-core/src/vault/vault.boundary.test.ts
import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as cdsCore from '../index.js';

test('cds-core index does NOT expose openRawDb', () => {
  expect((cdsCore as any).openRawDb).toBeUndefined();
});

test('cds-core index does NOT expose RawDatabase type', () => {
  const exposedKeys = Object.keys(cdsCore);
  expect(exposedKeys).not.toContain('openRawDb');
  expect(exposedKeys).not.toContain('RawDatabase');
});

test('no consumer package imports from @cds/core/vault/internal/*', () => {
  const roots = ['packages/cds-cli/src', 'packages/cds-migrate/src', 'packages/cds-s3-backend/src', 'lib'];
  const offenders: string[] = [];
  for (const root of roots) {
    walkAllFiles(root, (file) => {
      if (!/\.(ts|mts|mjs|js)$/.test(file)) return;
      const src = readFileSync(file, 'utf-8');
      if (/@cds\/core\/vault\/internal/.test(src)) offenders.push(file);
    });
  }
  expect(offenders).toEqual([]);
});

function walkAllFiles(dir: string, cb: (f: string) => void) {
  try {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walkAllFiles(p, cb);
      else cb(p);
    }
  } catch { /* root doesn't exist yet -> pass */ }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sqlite3` npm package (async callbacks) | `better-sqlite3` synchronous API | ~2018 | Dramatically simpler code; no promise soup |
| Manual `CREATE TABLE IF NOT EXISTS` scatter | Numbered migration files + `schema_version` table | Standard since ~2015 | Versioning, forward compat |
| Contentless FTS5 + manual reinsert | External-content FTS5 + triggers | SQLite 3.9+ (2015) | Free index maintenance; single source of truth |
| CommonJS + `__dirname` | ESM + `import.meta.url` + `fileURLToPath` | Node 16+ stable ESM | Requires Pattern 3 |
| `node-sqlite3` + `node-gyp` from source | better-sqlite3 prebuilds | since better-sqlite3 ~v6 | `npm install` works without toolchain on common arch |

**Deprecated/outdated:**
- Node 18 in CDS baseline — dropped per D-33.
- `db.close()` via process handler — not needed, Node exits clean up (D-49).
- TypeScript enum for entity types — D-45 supersedes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@types/better-sqlite3` latest is in the `^7.x` range | Standard Stack | Planner MAY install a different `@types` major — acceptable; types track runtime closely but may have 1-2 signature drift points flagged at first `tsc` run |
| A2 | Prebuilt binaries land cleanly for darwin-arm64 / darwin-x64 / linux-x64 / linux-arm64 / win32-x64 on Node 20/22/24 | Pattern 1 + Plan 01 CI | Exotic CI runner (e.g., linux-arm on musl) may fall back to `node-gyp rebuild` — CI still passes if C++ toolchain present in image; `ubuntu-latest` images include it by default [CITED: github/actions/runner-images README] |
| A3 | `tsc --build` does NOT copy `.sql` files | Pitfall 5 | Verified behavior of `tsc` — `.sql` files are not in `include` glob patterns and are ignored. Planner's Plan 02 task adds an explicit copy step. |
| A4 | `db.transaction(fn)` rolls back on throw and re-throws | Pattern 1 | Documented better-sqlite3 behavior; used widely. Verify with a test in Plan 04 (invalid migration -> rollback -> no partial state). |
| A5 | Multiple `openSessionsDB(sameProject)` calls should share a handle | D-49 | Locked by CONTEXT.md. No risk — verified by integration test in Plan 04. |
| A6 | `basename(projectPath)` is a stable slug | D-48 | Locked by CONTEXT.md. Risk: two projects with the same basename collide — acceptable for alpha, documented in deferred ideas. |

## Open Questions

1. **Should `sessions.search` also index `entities.name` text?**
   - What we know: D-46 only indexes `observations.content` + `session_summary`. Entity names are accessible via JSON array of IDs + separate lookup.
   - What's unclear: Phase 36 Haiku extraction may want "find observations about entity X" without knowing the ID.
   - Recommendation: **Defer to Phase 36.** Phase 35 ships the canonical D-46 schema. If Phase 36 needs entity-name search, it adds migration `002-*.sql` that extends the FTS virtual table.

2. **Error handling for corrupt DB files (e.g., partial write from crashed prior session)?**
   - What we know: `better-sqlite3` throws on open of corrupt files; WAL mode does recovery on open, which handles 99% of partial-write cases.
   - What's unclear: What if recovery itself fails?
   - Recommendation: Planner's `DbOpenError` wraps the underlying error; caller decides policy. Phase 35 does NOT implement auto-heal / re-create. Document in Plan 03 that corrupt DB = thrown `DbOpenError`, user must manually delete.

3. **Should `closeSessionsDB` be a required part of the API contract or purely advisory?**
   - What we know: D-49 says "no automatic close-on-process-exit handler". Node's default GC closes SQLite handles on process exit.
   - What's unclear: Long-running daemons (future) that want to free fd before exit.
   - Recommendation: Provide `closeSessionsDB(projectPath)` and document it as optional but available. No auto-handler in Phase 35.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 20+ | D-33 / D-34 | yes (locally verified on dev machine) | 20/22/24 | None — Plan 01 enforces in engines field |
| pnpm 10.x | Monorepo workspace resolution | yes (`packageManager: pnpm@10.6.3` in root package.json) | 10.6.3 | None |
| C++ toolchain (fallback only) | `better-sqlite3` source compile if prebuild missing | yes on `ubuntu-latest` / `macos-latest` runner images | n/a | None on `windows-latest` by default — Phase 35 CI uses ubuntu + macos; Windows is a v1.1+ concern |
| SQLite 3.9+ with FTS5 | Runtime | Bundled inside `better-sqlite3` prebuild | 3.48.x (ships with better-sqlite3@12) | None — `FtsUnavailableError` surfaces if absent |

**Missing dependencies with no fallback:** None for common developer / CI environments.

**Missing dependencies with fallback:** Exotic arch without prebuild -> `node-gyp rebuild`. Acceptable; documented in Phase 39 migration guide.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@^3.2.4` (from Phase 33 scaffold) |
| Config file | `packages/cds-core/vitest.config.ts` (already exists, covers `src/**/*.test.ts`) |
| Quick run command | `pnpm --filter @cds/core test` |
| Full suite command | `pnpm -r run test` (monorepo full run, includes root tests) |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VAULT-01 | `openSessionsDB` creates DB with WAL + FTS5 | integration | `pnpm --filter @cds/core test src/vault/sessions.test.ts` | missing (Wave 0 in Plan 04) |
| VAULT-01 | WAL side-car files (`.db-wal`, `.db-shm`) created on first write | integration | same file | missing (Wave 0 in Plan 04) |
| VAULT-01 | `FtsUnavailableError` thrown when FTS5 absent | unit | same file (simulated via test double on compile_options query) | missing (Wave 0 in Plan 04) |
| VAULT-02 | Fresh DB has `sessions`, `observations`, `entities`, `relations`, `observations_fts`, `schema_version=1` | integration | same file | missing (Wave 0 in Plan 04) |
| VAULT-02 | Adding new `002-*.sql` runs forward-only; `schema_version` row appears | integration | `packages/cds-core/src/vault/migration.test.ts` | missing (Wave 0 in Plan 04) |
| VAULT-02 | `appendObservation` -> FTS5 trigger fires; search finds row | integration | `sessions.test.ts` | missing (Wave 0 in Plan 04) |
| VAULT-02 | `UPDATE sessions SET summary=...` -> trigger re-denormalizes FTS | integration | `sessions.test.ts` | missing (Wave 0 in Plan 04) |
| VAULT-03 | `@cds/core` import does not expose `openRawDb` | unit | `packages/cds-core/src/vault/vault.boundary.test.ts` | missing (Wave 0 in Plan 04) |
| VAULT-03 | No consumer file imports from `@cds/core/vault/internal/*` | filesystem scan | same file | missing (Wave 0 in Plan 04) |
| VAULT-03 | TS type-check of `import { openRawDb } from '@cds/core'` fails | tsc integration | `pnpm --filter @cds/core run build` against a fixture file | Optional — redundant with runtime check |

### Sampling Rate

- **Per task commit (Plan 02/03/04 tasks):** `pnpm --filter @cds/core test` (expected ~2-5s).
- **Per wave merge:** `pnpm -r run test` (full monorepo, includes root test suite).
- **Phase gate:** Full suite green on Node 20 + 22 (CI matrix) before `/gsd-verify-work`.

### Wave 0 Gaps

- `packages/cds-core/src/vault/sessions.test.ts` — integration tests for VAULT-01/02 (created by Plan 04)
- `packages/cds-core/src/vault/migration.test.ts` — migration runner tests (created by Plan 04)
- `packages/cds-core/src/vault/vault.boundary.test.ts` — VAULT-03 regression test (created by Plan 04)
- No framework install needed — vitest present from Phase 33

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface — local embedded DB, no network |
| V3 Session Management | no | "Session" here = session-memory record, not user auth session |
| V4 Access Control | no | File-system perms inherit from user home dir |
| V5 Input Validation | yes | Validate `observations.entities` JSON shape (array of integers) before write; parameterize ALL SQL with `better-sqlite3.prepare` (never string-interpolate); reject non-string `query` to `sessions.search` |
| V6 Cryptography | no | No secrets at rest in Phase 35; D-48 notes encryption-at-rest as v1.1+ |
| V7 Error Handling | yes | `VaultError` hierarchy; never leak absolute paths of another project; never surface raw SQLite error messages in the error object sent to external callers (log internally, surface sanitized message) |
| V8 Data Protection | partial | Sensitive data lives in observations; file perms rely on `~/vault/` being user-owned. Doc in Plan 03 that `~/vault/projects/{name}/` SHOULD be `0700`-safe — but Phase 35 does NOT enforce (OS default on macOS/Linux is usually fine) |

### Known Threat Patterns for Node.js + SQLite embedded

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via `sessions.search(query)` FTS5 MATCH | Tampering | FTS5 `MATCH` argument passes through `db.prepare(...).all(query)` — bound parameter, NOT interpolated. FTS5 has its own query grammar that may throw on malformed input; catch and rethrow as `VaultError`. |
| Arbitrary path via `projectPath` (directory traversal) | Tampering | `projectPath` is used with `path.basename` — inherently immune to `../` traversal. MKDIR is scoped to `~/vault/projects/{basename}/`. No user-controlled path segment reaches the filesystem raw. |
| DoS via massive observation content | DoS | Phase 35 scope does NOT include size caps (deferred to Phase 36 Stop hook). Document expected sizes (~KB) in Plan 03. |
| Malicious SQL in migration file | Tampering | Migrations are source-controlled `.sql` in the package — a compromise of the package is a compromise of everything. No additional mitigation needed. |
| Corrupt/malformed DB file on open | Tampering / DoS | `DbOpenError` thrown; caller decides recovery. No auto-heal. |
| Log injection via observation content in error messages | Tampering | Never echo `content` into error messages — use IDs only. |

No threats graded HIGH or above; no `<threat_model>` block required in plan frontmatter beyond normal input validation tasks.

## Sources

### Primary (HIGH confidence)

- better-sqlite3 README — github.com/WiseLibs/better-sqlite3 — WAL, prepared statements, transactions, engines
- better-sqlite3 API docs — github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md — `Database#pragma`, `Database#transaction`, `Statement#run/get/all`
- SQLite FTS5 official reference — sqlite.org/fts5.html — external-content tables, triggers, bm25 ranking, delete commands
- SQLite WAL docs — sqlite.org/wal.html — semantics, busy_timeout
- Node.js ESM docs — nodejs.org/api/esm.html#importmetaurl — `fileURLToPath(import.meta.url)`
- Phase 33 `33-SUMMARY.md` files + `tsconfig.base.json` + `vitest.config.ts` — NodeNext ESM, composite, project glob

### Secondary (MEDIUM confidence)

- `.planning/phases/35-tiered-vault-tier-2-sqlite/35-CONTEXT.md` — all D-33..D-50 locked decisions
- `.planning/REQUIREMENTS.md` — VAULT-01..03 acceptance criteria
- `.planning/ROADMAP.md` — Phase 35 Success Criteria 1-4
- `.planning/STATE.md` — "better-sqlite3 locked per SEED-004 — do NOT re-open"
- `vault/projects/claude-dev-stack/docs/cds-core-independence-plan.md` — architecture rationale

### Tertiary (LOW confidence)

- `@types/better-sqlite3` current major — `^7.x` [ASSUMED, A1] — planner verifies at install time via `npm view @types/better-sqlite3 version`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — locked by CONTEXT.md + REQUIREMENTS + verified via better-sqlite3 README
- Architecture: HIGH — CONTEXT.md fully specifies folder structure, schema, boundary enforcement
- FTS5 trigger wiring: MEDIUM — documented pattern but corner cases around `sessions.summary` update require test coverage (Plan 04)
- Pitfalls: HIGH — all 7 pitfalls cross-referenced to official docs + project context

**Research date:** 2026-04-16

## RESEARCH COMPLETE
