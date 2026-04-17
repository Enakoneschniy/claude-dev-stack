# ADR-004: S3 Merge-on-Download Conflict Strategy

**Status:** Accepted
**Date:** 2026-04-17
**Phase:** 44 (S3 Backend)

## Context

Two devices can independently create sessions in their local `sessions.db`. When syncing via S3, we need to merge without data loss. The session database contains four related tables: `sessions`, `observations`, `entities`, and `relations`. Each session has a UUID primary key, observations use auto-incremented integer IDs, entities use auto-incremented IDs with a UNIQUE name constraint, and relations have a composite primary key `(from_entity, to_entity, relation_type, observed_in_session)`.

## Decision

Use **merge-on-download** with session-scoped row import:

### pull() — Download and Merge

1. Download remote `sessions.db` from S3 to a temporary file.
2. `ATTACH` the remote database.
3. For sessions not in the local DB (matched by UUID):
   - Copy the session row.
   - Upsert entities referenced by the session's relations (`INSERT OR IGNORE` by unique `name`).
   - Build an entity ID mapping: remote entity ID → local entity ID (after upsert, query local ID by name).
   - Copy observations with new auto-generated IDs (omit `id` column in INSERT, let AUTOINCREMENT assign). Remap entity ID references in the `entities` JSON column using the entity ID mapping.
   - Copy relations with remapped entity IDs (`INSERT OR IGNORE` on composite PK).
4. `DETACH` the remote database.

### push() — Checkpoint and Upload

1. Run `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL to the main database file.
2. Verify the WAL file is 0 bytes or absent.
3. `PutObject` the `sessions.db` file to S3.

## Key Scenarios

### 1. First sync (no remote database)

`pull()` is a no-op — no remote file exists on S3. `push()` creates the remote file for the first time.

### 2. Same sessions on both devices

Session UUIDs match, so the `NOT IN (SELECT id FROM main.sessions)` filter returns zero rows. No new data is imported. The merge is a no-op.

### 3. Different sessions on each device

Session UUIDs differ between devices, so all remote sessions pass the filter. All rows (sessions, observations, entities, relations) merge cleanly. Both devices end up with the union of all sessions.

### 4. Schema version mismatch

Before merging, compare `PRAGMA user_version` between local and remote:
- **Remote newer than local:** Abort with `S3SchemaVersionError`. The user must update their local installation before syncing.
- **Local newer than remote:** Merge proceeds. The local schema is backward-compatible with older data (new columns have defaults or are nullable).

### 5. Entity name collisions

Entities are matched by their unique `name` column. `INSERT OR IGNORE` preserves the existing entity — the first-seen `display_name` wins, consistent with the existing upsert behavior in `sessions.ts`. No entity data is lost; the only difference is which `display_name` is preserved (the one from whichever device created the entity first).

### 6. Observation ID conflicts

Avoided entirely by inserting observations from remote sessions with new auto-generated IDs. The `id` column is omitted from the INSERT statement, and AUTOINCREMENT assigns fresh local IDs. Entity references in the `observations.entities` JSON column are remapped from remote entity IDs to local entity IDs using the entity ID mapping built during entity upsert.

### 7. Relation conflicts

Relations have a composite primary key `(from_entity, to_entity, relation_type, observed_in_session)`. After entity ID remapping, `INSERT OR IGNORE` handles any duplicates — if the exact same relation already exists locally, it is silently skipped.

## Consequences

- **No data loss** on multi-device sync. Every session, observation, entity, and relation from both devices is preserved.
- **Slightly more complex merge** than raw `INSERT OR IGNORE` across all tables. Entity ID remapping adds ~20 lines of merge code but prevents broken foreign key references in observations and relations.
- **WAL checkpoint before upload** ensures the uploaded file contains all committed data and can be opened by any SQLite reader without the WAL file.
- **No concurrent write protection** — if two devices push simultaneously, the last writer wins at the S3 object level. However, the next pull from either device will merge the other's sessions, so no data is permanently lost (it just requires an extra sync cycle).
- **FTS5 triggers** fire automatically on observation INSERT (defined in migration 001), so the full-text search index stays consistent after merge without explicit FTS maintenance.
