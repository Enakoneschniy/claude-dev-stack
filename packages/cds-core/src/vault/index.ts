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
