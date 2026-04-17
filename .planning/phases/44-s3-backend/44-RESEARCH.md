# Phase 44: S3 Backend — Research

**Domain:** Implementing S3Backend in `@cds/s3-backend`, WAL checkpoint, merge-on-download, CLI commands
**Researched:** 2026-04-17
**Confidence:** HIGH (codebase inspected, AWS SDK v3 docs verified, SQLite WAL behavior confirmed)

---

## 1. AWS SDK v3 — S3 Client Usage

### Dependencies Required

```json
{
  "@aws-sdk/client-s3": "^3.700.0",
  "@aws-sdk/lib-storage": "^3.700.0"
}
```

Both added to `packages/cds-s3-backend/package.json` only (D-09). Never in `@cds/core` or `@cds/cli`.

### S3Client Initialization

```typescript
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: config.region,
  ...(config.profile ? { credentials: fromSSO({ profile: config.profile }) } : {}),
});
```

Credentials resolved automatically via AWS credential chain: env vars, ~/.aws/credentials, IAM role, SSO.

### GetObject — Download sessions.db

```typescript
const response = await client.send(new GetObjectCommand({
  Bucket: config.bucket,
  Key: `${config.prefix ?? ''}${project}/sessions.db`,
}));
const chunks: Uint8Array[] = [];
for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
  chunks.push(chunk);
}
const buffer = Buffer.concat(chunks);
```

### PutObject — Upload sessions.db

```typescript
import { readFileSync } from 'node:fs';

const dbBuffer = readFileSync(localDbPath);
await client.send(new PutObjectCommand({
  Bucket: config.bucket,
  Key: `${config.prefix ?? ''}${project}/sessions.db`,
  Body: dbBuffer,
  ContentType: 'application/x-sqlite3',
}));
```

### HeadObject — Check if remote exists

```typescript
try {
  await client.send(new HeadObjectCommand({
    Bucket: config.bucket,
    Key: `${config.prefix ?? ''}${project}/sessions.db`,
  }));
} catch (err) {
  if ((err as any).name === 'NotFound' || (err as any).$metadata?.httpStatusCode === 404) {
    // first sync — no remote yet
  } else {
    throw err;
  }
}
```

### Upload for Large DBs — @aws-sdk/lib-storage

For sessions.db files exceeding 100MB:

```typescript
import { Upload } from '@aws-sdk/lib-storage';

const upload = new Upload({
  client,
  params: {
    Bucket: config.bucket,
    Key: `${prefix}${project}/sessions.db`,
    Body: readFileSync(localDbPath),
    ContentType: 'application/x-sqlite3',
  },
  queueSize: 4,
  partSize: 5 * 1024 * 1024,
});
await upload.done();
```

### Error Handling

Common S3 errors to handle:
- `NoSuchBucket` — bucket doesn't exist or wrong region
- `AccessDenied` — insufficient IAM permissions
- `NoSuchKey` / `NotFound` — first sync, no remote DB yet
- `SlowDown` — request rate throttling (SDK handles retry)
- Network errors — timeout, DNS resolution failure

All should extend `VaultError` from `@cds/core`:

```typescript
export class S3SyncError extends VaultError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'S3SyncError';
  }
}
```

---

## 2. WAL Checkpoint Before Upload

### The Problem

`better-sqlite3` uses WAL mode (set in `internal/db.ts`). The WAL file (`sessions.db-wal`) may contain uncommitted changes. Uploading only `sessions.db` without checkpointing means the remote copy is missing recent writes.

### The Solution

```typescript
const db = new Database(localDbPath, { readonly: false });
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
```

`PRAGMA wal_checkpoint(TRUNCATE)` does:
1. Writes all WAL content back to the main DB file
2. Resets the WAL file to zero bytes
3. Returns synchronously (better-sqlite3 is synchronous)

### Verification

After checkpoint, verify:
- `sessions.db-wal` file size is 0 bytes or file doesn't exist
- `sessions.db` can be opened independently without a WAL file

### Test Strategy

```typescript
it('checkpoints WAL before push', async () => {
  // 1. Open DB, write a row (creates WAL)
  // 2. Close handle (WAL may still exist)
  // 3. Call s3Backend.push(projectPath) with mocked S3
  // 4. Assert: the buffer sent to PutObject can be opened as a valid SQLite DB
  // 5. Assert: that DB contains the written row
  // 6. Assert: sessions.db-wal is 0 bytes or absent
});
```

---

## 3. Merge-on-Download Conflict Resolution

### Flow (D-01)

```
pull(projectPath):
  1. Download remote sessions.db from S3 to temp file
  2. Open local sessions.db (read-write)
  3. Schema version check (D-03):
     - If remote.schema_version > local.schema_version: abort with error
     - If local >= remote: proceed
  4. ATTACH remote temp file
  5. For each table: INSERT OR IGNORE from remote into local
  6. DETACH remote, delete temp file
  7. Local DB now has union of both row sets

push(projectPath):
  1. PRAGMA wal_checkpoint(TRUNCATE) on local DB
  2. Upload local sessions.db to S3
```

### Merge Implementation Using ATTACH

```typescript
async pull(projectPath: string): Promise<void> {
  const localDbPath = getDbPath(projectPath);
  const tempPath = `${localDbPath}.remote-${Date.now()}`;

  // Download remote
  try {
    await this.downloadToFile(projectPath, tempPath);
  } catch (err) {
    if (isNotFound(err)) return; // First sync
    throw err;
  }

  const db = new Database(localDbPath);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');

    // Schema version check
    const remoteDb = new Database(tempPath, { readonly: true });
    const localVersion = db.pragma('schema_version', { simple: true });
    const remoteVersion = remoteDb.pragma('schema_version', { simple: true });
    remoteDb.close();

    if (remoteVersion > localVersion) {
      throw new S3SyncError(
        `Remote schema version (${remoteVersion}) is newer than local (${localVersion}). ` +
        'Update your local installation before syncing.'
      );
    }

    db.prepare("ATTACH DATABASE ? AS remote").run(tempPath);

    db.prepare("INSERT OR IGNORE INTO sessions SELECT * FROM remote.sessions").run();
    db.prepare("INSERT OR IGNORE INTO observations SELECT * FROM remote.observations").run();
    db.prepare("INSERT OR IGNORE INTO entities SELECT * FROM remote.entities").run();
    db.prepare("INSERT OR IGNORE INTO relations SELECT * FROM remote.relations").run();

    db.prepare("DETACH DATABASE remote").run();
  } finally {
    db.close();
    unlinkSync(tempPath);
  }
}
```

### Key Design Decisions

- **INSERT OR IGNORE**: Sessions have UUID PKs, entities have unique `name`. Relations have composite key with INSERT OR IGNORE already. This preserves existing rows and adds only new ones.
- **No UPDATE**: Rows are immutable once created. No overwrite conflicts.
- **Entities dedup**: Entity `name` is UNIQUE (normalized lowercase per D-105). `INSERT OR IGNORE` naturally deduplicates.

### Critical Edge Case: Observation ID Conflicts

Current schema uses integer auto-increment `id` as PK for observations. Two devices may generate observations with the same integer ID but different content. `INSERT OR IGNORE` would silently drop the second device's observation.

**Mitigation options:**
1. **Offset-based merge**: When merging remote observations, find max local ID, offset all remote IDs by that amount. Requires updating entity references in the `entities` JSON column.
2. **UUID observation IDs**: Add a UUID column to observations via migration. Use UUID as the merge key instead of integer ID. More robust but requires a schema migration.
3. **Session-scoped merge**: Since session IDs are UUIDs, and observations belong to sessions, merge at the session level. If a session doesn't exist locally, import ALL its observations with new auto-generated IDs. If it does exist locally, skip (session is immutable once ended).

**Recommendation:** Option 3 (session-scoped merge) is simplest and correct for the use case. A device creates sessions locally. Sessions are never created on two devices simultaneously (same session ID). So merging sessions + their observations as a unit avoids ID conflicts entirely. The merge becomes:
1. Find sessions in remote that don't exist in local (by session UUID)
2. For each missing session: copy session row + all its observations + linked entities + relations

---

## 4. S3 Object Key Structure

```
{prefix}{project}/sessions.db
```

- `prefix` = user-configured `vault.s3.prefix` (default: `vault/projects/`)
- `project` = `basename(projectPath)` (matches local vault structure)

Full example: `vault/projects/claude-dev-stack/sessions.db`

---

## 5. CLI Commands

### `cds vault setup --backend s3` (D-06)

Interactive wizard prompts:
1. S3 bucket name (required)
2. AWS region (required, default: us-east-1)
3. AWS profile name (optional, default: "default")
4. Key prefix (optional, default: "vault/projects/")

After collecting inputs:
- Test access: PutObject a small test file, GetObject it, DeleteObject cleanup
- If test passes: write config to CDS config file
- If test fails: show error with actionable message

Config shape:
```json
{
  "vault": {
    "backend": "s3",
    "s3": {
      "bucket": "my-vault-bucket",
      "region": "us-east-1",
      "prefix": "vault/projects/",
      "profile": "default"
    }
  }
}
```

### `cds vault sync` (D-07, D-08)

```
cds vault sync [--project <name>]
```

Flow:
1. Read vault config
2. If backend !== "s3": error with setup instructions
3. Determine project (from `--project` flag or CWD detection)
4. Run `pull()` (download + merge)
5. Run `push()` (checkpoint + upload)
6. Display summary

---

## 6. Package Isolation Verification

To verify `@aws-sdk/*` never leaks into `@cds/core` or `@cds/cli`:

```bash
pnpm ls --filter @cds/core --depth Infinity 2>/dev/null | grep -c "@aws-sdk"
pnpm ls --filter @cds/cli --depth Infinity 2>/dev/null | grep -c "@aws-sdk"
```

Both should return 0.

The isolation works because:
- `@cds/s3-backend` depends on `@cds/core` (workspace:*) — one direction only
- `@cds/cli` does NOT depend on `@cds/s3-backend` in package.json
- CLI commands that need S3 use dynamic import: `const { S3Backend } = await import('@cds/s3-backend')`
- If `@cds/s3-backend` is not installed, the dynamic import fails gracefully

---

## 7. Test Strategy

### Unit Tests (mocked S3)

Use `aws-sdk-client-mock` (standard AWS SDK v3 test utility) as a dev dependency of `@cds/s3-backend`:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});
```

### Integration Tests

- Two-device simulation: create two local DBs with different sessions, merge via S3 mock, verify all rows present
- Schema version mismatch: remote has higher version, error thrown
- First sync: no remote object, pull is no-op, push creates
- WAL checkpoint: verify sessions.db-wal is 0 bytes after push

---

## 8. Validation Architecture

### Dimension 1: Functional Correctness
- S3Backend implements VaultBackend interface (pull/push methods)
- Merge preserves all rows from both devices (no data loss)
- WAL checkpoint runs before every upload

### Dimension 2: Error Handling
- S3 errors produce clear VaultError subclass messages
- Schema version mismatch aborts with actionable error
- Network failure during download doesn't corrupt local DB

### Dimension 3: Integration
- `@cds/s3-backend` depends on `@cds/core` only
- `@cds/core` and `@cds/cli` have zero `@aws-sdk/*` in their dependency trees
- CLI `cds vault sync` command correctly wires S3Backend

### Dimension 4: Performance
- Single PutObject/GetObject per sync
- WAL checkpoint is synchronous and fast (<100ms for typical DB sizes)

### Dimension 5: Security
- AWS credentials never stored in CDS config files (D-04)
- Only bucket, region, prefix, profile stored in config

---

## Sources

- AWS SDK v3 S3 Client: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html
- @aws-sdk/lib-storage: https://www.npmjs.com/package/@aws-sdk/lib-storage
- SQLite WAL checkpoint: https://sqlite.org/pragma.html#pragma_wal_checkpoint
- better-sqlite3 WAL: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
- aws-sdk-client-mock: https://www.npmjs.com/package/aws-sdk-client-mock
- Codebase: `packages/cds-core/src/vault/backend.ts`
- Codebase: `packages/cds-core/src/vault/sessions.ts`
- Codebase: `packages/cds-core/src/vault/internal/db.ts`
- Codebase: `packages/cds-s3-backend/src/index.ts`
- Project: `.planning/research/PITFALLS.md` (Pitfalls 1-3)
- Project: `.planning/research/ARCHITECTURE.md` (S3Backend architecture)

---
*Phase-specific research for: Phase 44 — S3 Backend*
*Researched: 2026-04-17*
