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

// Phase 43: VaultBackend abstraction (INFRA-01, INFRA-02)
export { FsBackend, ConflictStrategy } from './backend.js';
export type { VaultBackend } from './backend.js';

// Phase 43: Entity graph data primitive (MEM-04)
export { getEntityGraph } from './graph.js';
export type { GraphNode, GraphEdge, EntityGraph } from './graph.js';

// Phase 43: Cross-project search (MEM-02)
export { searchAllProjects } from './multi-search.js';
export type { CrossSearchHit } from './multi-search.js';
