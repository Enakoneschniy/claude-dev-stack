---
phase: 44
plan: 1
status: complete
started: 2026-04-17
completed: 2026-04-17
---

# Summary: ADR + S3Backend core (errors, config, S3 client wrapper)

## What Was Built

1. **ADR-004** (`docs/adr/004-s3-merge-strategy.md`) — Architectural decision record documenting the merge-on-download conflict strategy with 7 enumerated scenarios (first sync, same sessions, different sessions, schema mismatch, entity collisions, observation IDs, relations).

2. **AWS SDK dependencies** added to `@cds/s3-backend` package.json: `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `better-sqlite3` as dependencies; `aws-sdk-client-mock`, `@types/better-sqlite3` as devDependencies. AWS SDK remains isolated — not present in `@cds/core` or `@cds/cli`.

3. **Error classes** (`packages/cds-s3-backend/src/errors.ts`) — S3SyncError, S3AccessDeniedError, S3BucketNotFoundError, S3SchemaVersionError. All extend VaultError from `@cds/core`.

4. **Config types** (`packages/cds-s3-backend/src/config.ts`) — S3BackendConfig interface (bucket, region, prefix, profile), DEFAULT_PREFIX constant, buildObjectKey helper function.

5. **S3 client wrapper** (`packages/cds-s3-backend/src/s3-client.ts`) — createS3Client factory, downloadObject (returns false on 404), uploadObject, checkObjectExists, deleteObject. Error wrapping maps AWS errors to typed S3 error classes.

## Commits

| Hash | Description |
|------|-------------|
| f4aa6dd | docs(44-01): add ADR-004 for S3 merge-on-download conflict strategy |
| 8e97542 | chore(44-01): add AWS SDK and better-sqlite3 deps to @cds/s3-backend |
| 7a13aad | feat(44-01): add S3 error classes extending VaultError |
| d60d211 | feat(44-01): add S3BackendConfig interface and buildObjectKey helper |
| 9a7fbf7 | feat(44-01): add S3 client wrapper with error mapping |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] `docs/adr/004-s3-merge-strategy.md` exists with 7 conflict scenarios
- [x] `packages/cds-s3-backend/package.json` has correct dependencies
- [x] `packages/cds-s3-backend/src/errors.ts` exports 4 error classes extending VaultError
- [x] `packages/cds-s3-backend/src/config.ts` exports S3BackendConfig and buildObjectKey
- [x] `packages/cds-s3-backend/src/s3-client.ts` exports S3 client wrapper functions
- [x] `pnpm -r run build` succeeds
- [x] No `@aws-sdk/*` in `@cds/core` or `@cds/cli`
