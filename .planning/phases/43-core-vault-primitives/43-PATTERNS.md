# Phase 43: Core Vault Primitives - Pattern Map

**Mapped:** 2026-04-17
**Files analyzed:** 7 (4 new + 3 modified/extended)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/cds-core/src/vault/backend.ts` | interface + class | request-response (async) | `packages/cds-core/src/vault/sessions.ts` (interface pattern) | role-match |
| `packages/cds-core/src/vault/graph.ts` | service/utility | CRUD (read-only) | `packages/cds-core/src/vault/sessions.ts` (db-open + query pattern) | role-match |
| `packages/cds-core/src/vault/multi-search.ts` | service/utility | batch + CRUD (read-only) | `packages/cds-core/src/vault/sessions.ts` (searchObservations + openRawDb pattern) | role-match |
| `packages/cds-core/src/vault/index.ts` | config/barrel | — | `packages/cds-core/src/vault/index.ts` (itself — extend only) | exact |
| `packages/cds-core/src/vault/backend.test.ts` | test | request-response | `packages/cds-core/src/vault/sessions.test.ts` | exact |
| `packages/cds-core/src/vault/graph.test.ts` | test | CRUD | `packages/cds-core/src/vault/sessions.test.ts` | exact |
| `packages/cds-core/src/vault/multi-search.test.ts` | test | batch | `packages/cds-core/src/vault/sessions.test.ts` | exact |

---

## Pattern Assignments

### `packages/cds-core/src/vault/backend.ts` (interface + class, async)

**Analog:** `packages/cds-core/src/vault/sessions.ts`

**Imports pattern** (lines 1-9 of sessions.ts — adapt for backend.ts):
```typescript
// backend.ts has NO external imports — ConflictStrategy and FsBackend
// are pure TypeScript with no Node or DB dependencies.
// sessions.ts shows the module-level comment style:
// "Phase 35 — Public session memory API (VAULT-01 / VAULT-03)."
```

**Interface declaration pattern** (sessions.ts lines 105-145):
```typescript
// sessions.ts defines SessionsDB as an interface with typed methods.
// backend.ts follows the same shape — interface with typed async methods,
// a companion enum, and one concrete implementing class.
export interface SessionsDB {
  createSession(input: { id?: string; project: string; summary?: string | null }): Session;
  // ... typed methods
  close(): void;
}
```

**Class implementing interface pattern** — from sessions.ts `buildSessionsHandle` returning `Object.freeze(handle)`:
```typescript
// sessions.ts lines 232-431: function builds an object literal that satisfies
// the SessionsDB interface. For backend.ts, use a real class instead (class
// syntax is cleaner for the VaultBackend pattern and enables `instanceof` checks).
// The "Object.freeze" pattern is optional but shows the immutability intent.
const handle: SessionsDB = { ... };
return Object.freeze(handle);
```

**Error hierarchy pattern** (sessions.ts lines 24-53):
```typescript
// All errors extend VaultError. backend.ts errors (if any) follow this pattern:
export class VaultError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VaultError';
  }
}
// New errors: extend VaultError, set this.name in constructor.
```

**Enum pattern** — no exact analog in vault module. Use regular `enum` (NOT `const enum` — see RESEARCH.md Pitfall 5):
```typescript
// Regular enum ensures runtime values are present for consumers doing:
// if (backend.conflictStrategy === ConflictStrategy.LastWriteWins)
export enum ConflictStrategy {
  MergeByUuid = 'merge-by-uuid',
  LastWriteWins = 'last-write-wins',
}
```

---

### `packages/cds-core/src/vault/graph.ts` (service/utility, read-only CRUD)

**Analog:** `packages/cds-core/src/vault/sessions.ts` + `packages/cds-core/src/vault/internal/db.ts`

**Imports pattern** (sessions.ts lines 1-9, db.ts lines 8-13):
```typescript
// sessions.ts import block — shows the Node builtin + internal import style:
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { openRawDb, type RawDatabase } from './internal/db.js';

// graph.ts will NOT use openRawDb (runs migrations — unnecessary for read-only).
// Use new Database(path, { readonly: true }) directly.
// db.ts shows the Database import:
import Database from 'better-sqlite3';
```

**DB open + close in finally pattern** (sessions.test.ts lines 70-91):
```typescript
// sessions.test.ts shows the raw Database open + try/finally close pattern
// used for read-only inspection. graph.ts applies the same for production use:
const raw = new Database(dbPath(), { readonly: true });
try {
  const tables = raw.prepare("SELECT name FROM sqlite_master ...").all() as Array<{ name: string }>;
  // ... use tables
} finally {
  raw.close();
}
```

**Prepared statement + typed cast pattern** (sessions.ts lines 234-310):
```typescript
// sessions.ts prepares all statements once via db.prepare().
// graph.ts creates statements inside the function (no caching needed — short-lived conn):
const rows = db.prepare('SELECT id, name, type, content FROM observations WHERE ...').all() as ObservationRow[];
// graph.ts equivalent:
const nodeRows = db.prepare('SELECT id, name, type, display_name FROM entities ORDER BY id ASC').all() as EntityRow[];
```

**Row mapper function pattern** (sessions.ts lines 220-229):
```typescript
// sessions.ts extracts a parseObservation() helper to map raw DB rows to typed objects.
// graph.ts follows the same: private mapNode() and mapEdge() helpers.
function parseObservation(row: ObservationRow): Observation {
  return {
    id: row.id,
    session_id: row.session_id,
    type: row.type,
    content: row.content,
    entities: JSON.parse(row.entities) as number[],
    created_at: row.created_at,
  };
}
```

**Path resolution pattern** (sessions.ts lines 184-185):
```typescript
// sessions.ts resolves dbPath from projectPath using homedir():
const project = basename(projectPath);
const dbPath = join(homedir(), 'vault', 'projects', project, 'sessions.db');
// graph.ts uses the same resolution (no openSessionsDB cache — direct new Database()).
```

---

### `packages/cds-core/src/vault/multi-search.ts` (service/utility, batch + read-only)

**Analog:** `packages/cds-core/src/vault/sessions.ts` (searchObservations method, lines 371-383) + `packages/cds-core/src/vault/internal/db.ts` (Database import)

**Imports pattern** (db.ts lines 8-13, sessions.ts lines 1-9):
```typescript
// multi-search.ts needs: node:fs (readdirSync, existsSync), node:os (homedir),
// node:path (join, basename), better-sqlite3 (Database direct — no openRawDb).
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
// db.ts line 10 shows the better-sqlite3 import style:
import Database from 'better-sqlite3';
```

**FTS5 search query pattern** (sessions.ts lines 263-276):
```typescript
// The existing FTS5 MATCH query in sessions.ts is the exact SQL pattern to replicate per-batch:
const searchStmt = db.prepare(
  'SELECT o.id, o.session_id, o.type, o.content, o.entities, o.created_at, ' +
    's.summary AS session_summary, bm25(observations_fts) AS rank ' +
    'FROM observations_fts ' +
    'JOIN observations o ON o.id = observations_fts.rowid ' +
    'LEFT JOIN sessions s ON s.id = o.session_id ' +
    'WHERE observations_fts MATCH ? ' +
    '  AND (? IS NULL OR o.session_id = ?) ' +
    '  AND (? IS NULL OR o.type = ?) ' +
    'ORDER BY rank LIMIT ?',
);
// multi-search.ts uses the same SELECT shape per batch, prefixed with schema alias
// (e.g., p0.observations_fts for ATTACHed DBs — verify with empirical test per RESEARCH.md A2).
```

**searchObservations result mapping pattern** (sessions.ts lines 371-383):
```typescript
// sessions.ts maps SearchRow to SearchHit. multi-search.ts extends SearchHit
// with a `project` field (CrossSearchHit) and maps the same row shape:
searchObservations(query, options = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 500));
  const rows = searchStmt.all(query, ...) as SearchRow[];
  return rows.map((r) => ({
    observation: parseObservation(r),
    rank: r.rank,
    sessionSummary: r.session_summary,
  }));
},
```

**try/finally connection close pattern** (sessions.test.ts lines 70-91, db.ts lines 31-39):
```typescript
// db.ts shows the try/catch on Database open, throwing DbOpenError.
// sessions.test.ts shows try/finally for read-only raw connections.
// multi-search.ts applies try/finally on EACH batch connection:
let db: Database.Database;
try {
  db = new Database(batch[0]);
  // ... ATTACH and query
} finally {
  db.close();  // ALWAYS closes even if query throws
}
```

**VAULT_PATH env var pattern** (referenced in RESEARCH.md Code Examples):
```typescript
// From test infrastructure pattern (sessions.test.ts HOME redirect, line 37):
// process.env['VAULT_PATH'] is the override; homedir() is the fallback.
const vaultRoot = process.env['VAULT_PATH'] ?? join(homedir(), 'vault');
const projectsDir = join(vaultRoot, 'projects');
```

---

### `packages/cds-core/src/vault/index.ts` — MODIFIED (barrel, extend only)

**Analog:** `packages/cds-core/src/vault/index.ts` (itself)

**Current barrel structure** (index.ts lines 1-22):
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
  runPendingMigrations,
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

**Extension pattern** — add new blocks after the existing `sessions.js` exports:
```typescript
// Add after existing sessions.js exports, following same value/type split:
export { FsBackend, ConflictStrategy } from './backend.js';
export type { VaultBackend } from './backend.js';

export { getEntityGraph } from './graph.js';
export type { GraphNode, GraphEdge, EntityGraph } from './graph.js';

export { searchAllProjects } from './multi-search.ts';
export type { CrossSearchHit } from './multi-search.ts';
// Note: SearchHit already exported from sessions.js above
```

---

### `packages/cds-core/src/vault/backend.test.ts` (test, unit)

**Analog:** `packages/cds-core/src/vault/sessions.test.ts`

**Test file header + imports pattern** (sessions.test.ts lines 1-29):
```typescript
// sessions.test.ts shows the standard test file header and imports:
import { test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  openSessionsDB,
  closeSessionsDB,
  // ...
} from './sessions.js';
// backend.test.ts: import { FsBackend, ConflictStrategy, VaultBackend } from './backend.js'
```

**Test describe pattern** — sessions.test.ts uses flat `test()` calls (no describe blocks). backend.test.ts follows the same convention.

**Unit test for no-op behavior** (no exact analog — FsBackend is unique):
```typescript
// Pattern: test that async methods resolve without side effects.
// Closest analog is sessions.test.ts simple operation tests (lines 57-63):
test('opens new DB at ~/vault/projects/{basename}/sessions.db with WAL mode', () => {
  const db: SessionsDB = openSessionsDB(projectPath);
  expect(existsSync(dbPath())).toBe(true);
  // ...
});
// backend.test.ts equivalent:
test('FsBackend.pull resolves immediately without error', async () => {
  const backend = new FsBackend();
  await expect(backend.pull('/some/path')).resolves.toBeUndefined();
});
```

---

### `packages/cds-core/src/vault/graph.test.ts` (test, integration)

**Analog:** `packages/cds-core/src/vault/sessions.test.ts`

**HOME redirect isolation pattern** (sessions.test.ts lines 26-55):
```typescript
// CRITICAL: must redirect HOME to a tempdir before each test.
// sessions.test.ts lines 35-54 — exact pattern to copy:
let originalHome: string | undefined;
let tempHome: string;

beforeEach(() => {
  originalHome = process.env['HOME'];
  tempHome = mkdtempSync(join(tmpdir(), 'cds-vault-test-home-'));
  process.env['HOME'] = tempHome;
  process.env['USERPROFILE'] = tempHome;
  projectPath = mkdtempSync(join(tmpdir(), 'cds-vault-test-proj-'));
});

afterEach(() => {
  try {
    closeSessionsDB(projectPath);
  } catch {
    /* ignore */
  }
  if (originalHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = originalHome;
  delete process.env['USERPROFILE'];
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(projectPath, { recursive: true, force: true });
});
```

**DB seed via openSessionsDB pattern** (sessions.test.ts lines 93-130):
```typescript
// graph.test.ts seeds entities/relations via the existing openSessionsDB API,
// then calls getEntityGraph() on the same projectPath.
// sessions.test.ts shows the seed pattern:
const db = openSessionsDB(projectPath);
const s = db.createSession({ project: 'proj', summary: 'init' });
const obs = db.appendObservation({ sessionId: s.id, type: 'note', content: 'hello' });
// graph.test.ts: also call db.upsertEntity() + db.linkRelation() to seed graph data.
```

---

### `packages/cds-core/src/vault/multi-search.test.ts` (test, integration)

**Analog:** `packages/cds-core/src/vault/sessions.test.ts`

**VAULT_PATH isolation pattern** (referenced in RESEARCH.md; sessions.test.ts uses HOME redirect):
```typescript
// multi-search.test.ts uses VAULT_PATH env override (not HOME redirect) because
// searchAllProjects() uses VAULT_PATH first.
let originalVaultPath: string | undefined;
let tempVaultRoot: string;

beforeEach(() => {
  originalVaultPath = process.env['VAULT_PATH'];
  tempVaultRoot = mkdtempSync(join(tmpdir(), 'cds-multi-search-test-'));
  process.env['VAULT_PATH'] = tempVaultRoot;
});

afterEach(() => {
  if (originalVaultPath === undefined) delete process.env['VAULT_PATH'];
  else process.env['VAULT_PATH'] = originalVaultPath;
  rmSync(tempVaultRoot, { recursive: true, force: true });
});
```

**Raw DB creation for test fixtures** (sessions.test.ts lines 70-91):
```typescript
// sessions.test.ts opens a raw Database for schema inspection:
const raw = new Database(dbPath(), { readonly: true });
try {
  // ... assertions
} finally {
  raw.close();
}
// multi-search.test.ts creates raw test fixture DBs using openSessionsDB on
// per-project paths under tempVaultRoot to seed searchable content.
```

---

## Shared Patterns

### Error hierarchy
**Source:** `packages/cds-core/src/vault/sessions.ts` lines 23-53
**Apply to:** `backend.ts`, `graph.ts`, `multi-search.ts`
```typescript
export class VaultError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VaultError';
  }
}
// New error classes: extend VaultError, set this.name = 'XxxError'
// backend.ts / graph.ts / multi-search.ts throw VaultError (or subclass)
// for expected failure conditions (e.g., DbOpenError already exists in sessions.ts).
```

### Raw DB open with try/finally close
**Source:** `packages/cds-core/src/vault/sessions.test.ts` lines 70-91 and `packages/cds-core/src/vault/internal/db.ts` lines 31-39
**Apply to:** `graph.ts` (one connection per call), `multi-search.ts` (one connection per batch)
```typescript
// Read-only raw connection — do NOT use openRawDb (runs migrations):
const db = new Database(absolutePath, { readonly: true });
try {
  // ... prepare + query
} finally {
  db.close();
}
```

### Parameterized SQL (never string interpolation)
**Source:** `packages/cds-core/src/vault/sessions.ts` lines 263-276
**Apply to:** `graph.ts`, `multi-search.ts`
```typescript
// ALL SQL parameters via ? positional or @name named placeholders.
// Never: `WHERE name = '${input}'`
// Always: db.prepare('WHERE name = ?').all(input)
// or: db.prepare('WHERE name = @name').all({ name: input })
```

### Barrel export split (value vs. type)
**Source:** `packages/cds-core/src/vault/index.ts` lines 4-22
**Apply to:** `vault/index.ts` additions
```typescript
// Values (classes, functions, constants) go in plain export {}
// Types (interfaces, type aliases) go in export type {}
// This prevents consumers from accidentally importing type-only symbols as values.
export { FsBackend, ConflictStrategy } from './backend.js';
export type { VaultBackend } from './backend.js';
```

### VAULT_PATH env var resolution
**Source:** Verified in test infra (`tests/project-setup.test.mjs:92`) — referenced in RESEARCH.md
**Apply to:** `multi-search.ts`
```typescript
const vaultRoot = process.env['VAULT_PATH'] ?? join(homedir(), 'vault');
```

### Test isolation via environment redirect
**Source:** `packages/cds-core/src/vault/sessions.test.ts` lines 35-55
**Apply to:** `backend.test.ts`, `graph.test.ts`, `multi-search.test.ts`
```typescript
// graph.test.ts: redirect HOME (openSessionsDB resolves under homedir())
// multi-search.test.ts: redirect VAULT_PATH (searchAllProjects resolves vault root)
// Both patterns: save original → set temp → restore in afterEach → rmSync temp
```

---

## No Analog Found

All new files have close analogs in the codebase. No cases without match.

---

## vault.boundary.test.ts Extension Note

`packages/cds-core/src/vault/vault.boundary.test.ts` (lines 68-86) must be extended.
The test at lines 68-86 asserts the exact list of expected public symbols from `@cds/core`:
```typescript
const expected = [
  'openSessionsDB',
  'closeSessionsDB',
  'CANONICAL_ENTITY_TYPES',
  'VaultError',
  'SchemaVersionError',
  'MigrationError',
  'FtsUnavailableError',
  'DbOpenError',
];
```
New symbols from Phase 43 (`FsBackend`, `ConflictStrategy`, `getEntityGraph`, `searchAllProjects`) must be added to `expected` in that test.

**Source for extension pattern:** `vault.boundary.test.ts` lines 68-86 — extend the `expected` array only, do not modify the assertion logic.

---

## Metadata

**Analog search scope:** `packages/cds-core/src/vault/` (all files), `packages/cds-s3-backend/src/`
**Files scanned:** sessions.ts, index.ts, internal/db.ts, sessions.test.ts, vault.boundary.test.ts, src/index.ts, cds-s3-backend/src/index.ts
**Pattern extraction date:** 2026-04-17
