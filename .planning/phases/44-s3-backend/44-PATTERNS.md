# Phase 44: S3 Backend — Pattern Map

**Generated:** 2026-04-17

---

## Files to Create/Modify

### 1. `packages/cds-s3-backend/src/index.ts` (REPLACE)
**Role:** S3Backend class implementing VaultBackend interface
**Data flow:** CLI command -> S3Backend.pull()/push() -> @aws-sdk/client-s3 -> S3
**Closest analog:** `packages/cds-core/src/vault/backend.ts` (FsBackend — same interface, no-op impl)

```typescript
// From backend.ts — FsBackend pattern to follow:
export class FsBackend implements VaultBackend {
  readonly conflictStrategy = ConflictStrategy.MergeByUuid;
  async pull(_projectPath: string): Promise<void> { /* no-op */ }
  async push(_projectPath: string): Promise<void> { /* no-op */ }
}
```

S3Backend must implement identical interface with real S3 logic.

### 2. `packages/cds-s3-backend/src/s3-client.ts` (NEW)
**Role:** S3 client wrapper with config-based initialization
**Data flow:** S3Backend constructor -> createS3Client(config) -> S3Client instance
**Closest analog:** `packages/cds-core/src/vault/internal/db.ts` (factory pattern for DB connections)

```typescript
// From db.ts — factory pattern:
export function openRawDb(absoluteDbPath: string): RawDatabase {
  mkdirSync(dirname(absoluteDbPath), { recursive: true });
  let db: RawDatabase;
  try { db = new Database(absoluteDbPath); }
  catch (err) { throw new DbOpenError(...); }
  // configure and return
  return db;
}
```

### 3. `packages/cds-s3-backend/src/merge.ts` (NEW)
**Role:** Merge-on-download logic — ATTACH remote DB, INSERT OR IGNORE into local
**Data flow:** S3Backend.pull() -> downloadToTemp() -> mergeRemoteIntoLocal(localPath, tempPath)
**Closest analog:** `packages/cds-core/src/vault/multi-search.ts` (ATTACH pattern)

```typescript
// From multi-search.ts — ATTACH pattern:
export function searchAllProjects(query: string, vaultRoot: string, options = {}): CrossSearchHit[] {
  // ...
  const db = openRawDb(batchDbs[0]);
  try {
    for (let j = 1; j < batchDbs.length; j++) {
      db.prepare('ATTACH DATABASE ? AS ?').run(batchDbs[j], `p${j}`);
    }
    // query across attached DBs
    // ...
    for (let j = 1; j < batchDbs.length; j++) {
      db.prepare('DETACH DATABASE ?').run(`p${j}`);
    }
  } finally {
    db.close();
  }
}
```

### 4. `packages/cds-s3-backend/src/errors.ts` (NEW)
**Role:** S3-specific error classes extending VaultError
**Closest analog:** `packages/cds-core/src/vault/sessions.ts` (error hierarchy)

```typescript
// From sessions.ts — error pattern:
export class VaultError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VaultError';
  }
}
export class SchemaVersionError extends VaultError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SchemaVersionError';
  }
}
```

### 5. `packages/cds-s3-backend/src/config.ts` (NEW)
**Role:** S3 backend configuration types and reader
**Data flow:** CLI reads config file -> S3Config -> passed to S3Backend constructor
**Closest analog:** None direct — CDS config is ad-hoc currently

### 6. `packages/cds-s3-backend/src/index.test.ts` (REPLACE)
**Role:** Unit tests for S3Backend
**Closest analog:** `packages/cds-core/src/vault/backend.test.ts` (VaultBackend tests)

```typescript
// From backend.test.ts — test pattern:
test('FsBackend.pull resolves immediately without error', async () => {
  const backend = new FsBackend();
  await expect(backend.pull('/any/path')).resolves.toBeUndefined();
});
```

### 7. `packages/cds-s3-backend/package.json` (MODIFY)
**Role:** Add AWS SDK dependencies
**Current state:** Only `@cds/core` workspace dependency

### 8. `docs/adr/NNN-s3-merge-strategy.md` (NEW)
**Role:** ADR documenting merge-on-download conflict strategy (D-02)
**Closest analog:** Any existing ADR in docs/adr/ (if exists) or .planning/ decisions

---

## Key Patterns to Follow

### Error Handling Pattern
All functions that can fail use try/catch with typed error classes extending VaultError. The `cause` option chains original errors.

### Resource Cleanup Pattern
```typescript
// From graph.ts and multi-search.ts:
const db = openRawDb(dbPath);
try {
  // ... work
} finally {
  db.close();
}
```
S3Backend must follow this for both SQLite handles and temp files.

### Test Pattern
- vitest with `describe`/`it`/`test` and `expect`
- No test fixtures directory — inline test data
- Mock external dependencies (S3Client via aws-sdk-client-mock)

### Export Pattern
- Named exports only (no default exports)
- Types exported separately with `export type`
- Re-export through barrel `index.ts`

---
*Pattern map for: Phase 44 — S3 Backend*
*Generated: 2026-04-17*
