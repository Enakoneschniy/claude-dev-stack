# Phase 44: S3 Backend - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement `S3Backend` in `@cds/s3-backend` package, replacing the current stub. Add WAL checkpoint before upload, merge-on-download conflict resolution, `cds vault setup --backend s3` wizard command, and `cds vault sync` manual sync command. AWS SDK stays isolated to this package — never enters `@cds/core` or `@cds/cli` dependency trees.

</domain>

<decisions>
## Implementation Decisions

### Merge Strategy
- **D-01:** Merge flow is download → merge → upload:
  - `pull()`: Download remote `sessions.db` from S3 → open both local and remote as separate SQLite connections → `INSERT OR IGNORE` local rows (sessions, observations, entities, relations) into remote DB using UUID matching → replace local DB with merged result → close connections.
  - `push()`: Run `PRAGMA wal_checkpoint(TRUNCATE)` → upload local `sessions.db` to S3.
- **D-02:** ADR documenting the merge strategy is the FIRST deliverable of this phase — written before any implementation code.
- **D-03:** Schema version check: before merge, compare `schema_version` PRAGMA between local and remote. If remote is newer, abort merge with clear error. If local is newer, merge proceeds (backward-compatible).

### S3 Credentials
- **D-04:** Delegate entirely to AWS SDK credential chain (`~/.aws/credentials`, env vars `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, IAM roles, SSO). CDS never stores AWS keys.
- **D-05:** CDS config stores only: `vault.backend` ("fs" | "s3"), `vault.s3.bucket`, `vault.s3.region`, `vault.s3.prefix` (optional key prefix), `vault.s3.profile` (optional AWS profile name).
- **D-06:** `cds vault setup --backend s3` wizard prompts for bucket, region, profile (defaults to "default"), and runs a test PutObject/GetObject to verify access before saving config.

### Sync Triggers
- **D-07:** Sync is **manual only** for v1.1: user runs `cds vault sync` explicitly. No automatic sync on session start/end. No background jobs or hooks.
- **D-08:** `cds vault sync` runs pull() first (download + merge), then push() (checkpoint + upload). Always both directions in one command.

### AWS SDK Packaging
- **D-09:** `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` are regular dependencies of `@cds/s3-backend` package.json. Not peer deps, not dynamic imports.
- **D-10:** The single-dep constraint (only `prompts` in `@cds/cli`) is preserved because `@cds/s3-backend` is a separate workspace package that users opt into.

### Claude's Discretion
- S3 object key structure within the bucket (e.g., `{prefix}/{project}/sessions.db`)
- Multipart upload threshold (use `@aws-sdk/lib-storage` for large DBs)
- Whether `cds vault sync` shows a progress indicator or is silent
- Test strategy (mocked S3 client vs. localstack)
- Error message formatting for common S3 failures (NoSuchBucket, AccessDenied, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### VaultBackend Interface (Phase 43)
- `packages/cds-core/src/vault/backend.ts` — VaultBackend interface, ConflictStrategy enum, FsBackend (created in Phase 43)
- `packages/cds-core/src/vault/sessions.ts` — SessionsDB interface, Entity/Relation types, openSessionsDB factory

### S3 Backend Package
- `packages/cds-s3-backend/src/index.ts` — Current stub to replace
- `packages/cds-s3-backend/package.json` — Package config, add AWS SDK deps here

### Research
- `.planning/research/STACK.md` — @aws-sdk/client-s3 ^3.1031.0, @aws-sdk/lib-storage
- `.planning/research/PITFALLS.md` — WAL checkpoint, merge-on-download, AWS SDK isolation
- `.planning/research/ARCHITECTURE.md` — S3Backend architecture, ETag-based conflict detection

### Seeds
- `.planning/seeds/SEED-003-vault-s3-storage-option.md` — Original S3 vault design, VaultBackend concept, tradeoffs, migration strategy

### DB Internals
- `packages/cds-core/src/vault/internal/db.ts` — WAL mode PRAGMAs, openRawDb factory
- `packages/cds-core/src/vault/internal/migrations/runner.ts` — Migration runner (for schema version check)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `openRawDb()` in `internal/db.ts` — Opens DB with WAL mode + PRAGMAs. S3Backend can reuse for the merged DB.
- `SessionsDB` interface — Provides all the type signatures for sessions, observations, entities, relations.
- `VaultBackend` interface (Phase 43) — S3Backend implements this directly.
- `@cds/s3-backend` package — Already exists as a stub with correct tsconfig, vitest config, and workspace wiring.

### Established Patterns
- `try/finally db.close()` — Used in graph.ts and multi-search.ts for read-only operations. S3Backend uses same for temporary merge connections.
- Error hierarchy extending `VaultError` — S3-specific errors (e.g., `S3AccessDeniedError`) should extend `VaultError`.
- Package isolation — `@cds/s3-backend` depends on `@cds/core` (workspace:*) but `@cds/core` never depends on S3 backend.

### Integration Points
- `@cds/cli` — Will need to wire `cds vault setup` and `cds vault sync` commands to `@cds/s3-backend`. Import is conditional (only when backend = "s3").
- CDS config (`~/.config/cds/config.json` or similar) — New `vault.backend` and `vault.s3.*` fields.

</code_context>

<specifics>
## Specific Ideas

- SEED-003 recommends cost sanity check in wizard: "10 MB vault × $0.023/GB/mo = $0.0002/mo storage. Even 10k PUT/mo = $0.05/mo. Trivial for individual use."
- S3 object versioning on the bucket is recommended but NOT required — the merge-by-uuid approach handles conflicts at the row level.

</specifics>

<deferred>
## Deferred Ideas

- **Automatic sync on session start/end** — manual only for v1.1; revisit based on user feedback
- **S3-compatible alternatives (R2, B2)** — same AWS SDK works if credentials are configured; document in v1.2
- **Encryption via KMS** — default SSE-S3 is sufficient; KMS deferred to v1.2

</deferred>

---

*Phase: 44-s3-backend*
*Context gathered: 2026-04-17*
