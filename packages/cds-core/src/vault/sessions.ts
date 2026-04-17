// Phase 35 — Public session memory API (VAULT-01 / VAULT-03).
// This is the ONLY module allowed to call raw-write methods on the underlying
// better-sqlite3 handle. All consumers (Phase 36+) go through this surface.

import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { openRawDb, type RawDatabase } from './internal/db.js';

// Re-export MigrationError (owned by the runner) through the public barrel so
// callers can `catch (e if e instanceof MigrationError)` at the public surface
// without dipping into the internal/ namespace.
export {
  MigrationError,
  runPendingMigrations,
} from './internal/migrations/runner.js';

// ---------------------------------------------------------------------------
// Error hierarchy
// ---------------------------------------------------------------------------

/** Base class for every vault runtime error. */
export class VaultError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VaultError';
  }
}

/** Raised when schema_version indicates an unsupported / future schema. */
export class SchemaVersionError extends VaultError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SchemaVersionError';
  }
}

/** Raised when the linked SQLite build lacks FTS5 support. */
export class FtsUnavailableError extends VaultError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FtsUnavailableError';
  }
}

/** Raised when the DB file cannot be opened (permission, corruption, …). */
export class DbOpenError extends VaultError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DbOpenError';
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  start_time: string;
  end_time: string | null;
  project: string;
  summary: string | null;
}

export interface Observation {
  id: number;
  session_id: string;
  type: string;
  content: string;
  /** Parsed from the JSON TEXT column. */
  entities: number[];
  created_at: string;
}

export interface Entity {
  id: number;
  /** Normalized (trim().toLowerCase()) UNIQUE key — Phase 38 D-103/D-105. */
  name: string;
  /**
   * Phase 38: first-seen original casing (trimmed but not lowercased). Stable
   * display string — NOT updated on subsequent upserts of the same entity.
   * Nullable on rows created before migration 002 but backfilled to `name`.
   */
  display_name: string | null;
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
  /**
   * Insert a new session row. If `id` is provided (Phase 36 Stop hook passes
   * the Claude Code CLAUDE_SESSION_ID so row joins stay stable across
   * backfill/repair), that value is used; otherwise a random UUID is
   * generated. Throws on UNIQUE constraint conflict — callers that need
   * idempotency should catch and skip.
   */
  createSession(input: { id?: string; project: string; summary?: string | null }): Session;
  appendObservation(input: {
    sessionId: string;
    type: string;
    content: string;
    entities?: number[];
  }): Observation;
  upsertEntity(input: { name: string; type: string }): Entity;
  linkRelation(input: {
    fromEntity: number;
    toEntity: number;
    relationType: string;
    sessionId: string;
  }): Relation;
  searchObservations(
    query: string,
    options?: { limit?: number; sessionId?: string; type?: string },
  ): SearchHit[];
  timeline(anchorObservationId: number, window?: number): Observation[];
  listSessions(options?: { limit?: number; project?: string }): Session[];
  countObservationsByType(): Array<{ type: string; count: number }>;
  countEntities(): number;
  topEntities(limit?: number): Array<{ name: string; count: number }>;
  getSessionObservationCount(sessionId: string): number;
  close(): void;
}

/**
 * Suggested entity types produced by the Phase 36 Haiku extractor. The SQL
 * column accepts ANY string — this list is only a hint for autocomplete and
 * UI filters (per CONTEXT.md D-45).
 */
export const CANONICAL_ENTITY_TYPES: readonly string[] = [
  'person',
  'project',
  'concept',
  'decision',
  'file',
  'commit',
  'skill',
  'api',
];

// ---------------------------------------------------------------------------
// Module-level cache (per CONTEXT.md D-49)
// ---------------------------------------------------------------------------

const CACHE = new Map<string, SessionsDB>();

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Open (or retrieve the cached) SessionsDB for a given `projectPath`. The DB
 * lives at `~/vault/projects/{basename(projectPath)}/sessions.db` per D-48.
 *
 * Repeated calls with the same `projectPath` return the same handle
 * reference. Use {@link closeSessionsDB} to drop the cached handle.
 */
export function openSessionsDB(projectPath: string): SessionsDB {
  const cached = CACHE.get(projectPath);
  if (cached) return cached;

  const project = basename(projectPath);
  const dbPath = join(homedir(), 'vault', 'projects', project, 'sessions.db');
  const raw = openRawDb(dbPath);

  const handle = buildSessionsHandle(raw, project);
  CACHE.set(projectPath, handle);
  return handle;
}

/** Close the cached SessionsDB handle for `projectPath` (if any). */
export function closeSessionsDB(projectPath: string): void {
  const h = CACHE.get(projectPath);
  if (h) {
    h.close();
    CACHE.delete(projectPath);
  }
}

// ---------------------------------------------------------------------------
// Private: prepared-statement cache + method implementations
// ---------------------------------------------------------------------------

interface ObservationRow {
  id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string;
  created_at: string;
}

interface SearchRow extends ObservationRow {
  session_summary: string | null;
  rank: number;
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildSessionsHandle(db: RawDatabase, _project: string): SessionsDB {
  // Prepare statements once after migrations have run (Pitfall 4).
  const createSessionStmt = db.prepare(
    'INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)',
  );
  const appendObsStmt = db.prepare(
    'INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  // Phase 38 D-105: `name` stores the normalized (trim().toLowerCase()) UNIQUE
  // key; `display_name` stores the first-seen original (trimmed) casing. On
  // conflict we UPDATE last_updated + COALESCE type (preserves an existing
  // non-null type if the caller passes a new one), but we DO NOT overwrite
  // display_name — first-seen casing wins per D-104.
  const upsertEntityStmt = db.prepare(
    'INSERT INTO entities (name, display_name, type, first_seen, last_updated) ' +
      'VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(name) DO UPDATE SET ' +
      'type = COALESCE(entities.type, excluded.type), ' +
      'last_updated = excluded.last_updated ' +
      'RETURNING id, name, display_name, type, first_seen, last_updated',
  );
  const linkRelationStmt = db.prepare(
    'INSERT OR IGNORE INTO relations (from_entity, to_entity, relation_type, observed_in_session) VALUES (?, ?, ?, ?)',
  );
  const selectRelationStmt = db.prepare(
    'SELECT from_entity, to_entity, relation_type, observed_in_session FROM relations ' +
      'WHERE from_entity=? AND to_entity=? AND relation_type=? AND observed_in_session=?',
  );
  const searchStmt = db.prepare(
    'SELECT o.id, o.session_id, o.type, o.content, o.entities, o.created_at, ' +
      's.summary AS session_summary, bm25(observations_fts) AS rank ' +
      'FROM observations_fts ' +
      'JOIN observations o ON o.id = observations_fts.rowid ' +
      'LEFT JOIN sessions s ON s.id = o.session_id ' +
      'WHERE observations_fts MATCH ? ORDER BY rank LIMIT ?',
  );
  const anchorStmt = db.prepare(
    'SELECT session_id, id FROM observations WHERE id = ?',
  );
  const timelineStmt = db.prepare(
    'SELECT id, session_id, type, content, entities, created_at FROM observations ' +
      'WHERE session_id = ? AND id BETWEEN ? AND ? ORDER BY id ASC',
  );
  const listSessionsStmt = db.prepare(
    'SELECT id, start_time, end_time, project, summary FROM sessions ' +
      'WHERE (@project IS NULL OR project = @project) ' +
      'ORDER BY start_time DESC LIMIT @limit',
  );
  const countByTypeStmt = db.prepare(
    'SELECT type, COUNT(*) AS count FROM observations GROUP BY type ORDER BY count DESC',
  );
  const countEntitiesStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM entities',
  );
  const topEntitiesStmt = db.prepare(
    'SELECT name, COUNT(*) AS count FROM entities GROUP BY name ORDER BY count DESC LIMIT @limit',
  );
  const sessionObsCountStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM observations WHERE session_id = ?',
  );

  const handle: SessionsDB = {
    createSession({ id: providedId, project: p, summary = null }) {
      const id = providedId ?? randomUUID();
      const start = new Date().toISOString();
      createSessionStmt.run(id, start, p, summary);
      return { id, start_time: start, end_time: null, project: p, summary };
    },

    appendObservation({ sessionId, type, content, entities = [] }) {
      if (
        !Array.isArray(entities) ||
        !entities.every((n) => Number.isInteger(n))
      ) {
        throw new VaultError(
          'observations.entities must be an array of integers',
        );
      }
      const created = new Date().toISOString();
      const info = appendObsStmt.run(
        sessionId,
        type,
        content,
        JSON.stringify(entities),
        created,
      );
      return {
        id: Number(info.lastInsertRowid),
        session_id: sessionId,
        type,
        content,
        entities,
        created_at: created,
      };
    },

    upsertEntity({ name, type }) {
      // Phase 38 D-103/D-105: normalize raw input for the UNIQUE key while
      // preserving the original casing in display_name (first-seen wins).
      const trimmed = name.trim();
      if (trimmed === '') {
        throw new VaultError('upsertEntity: name cannot be empty after trim');
      }
      const normalized = trimmed.toLowerCase();
      const now = new Date().toISOString();
      return upsertEntityStmt.get(normalized, trimmed, type, now, now) as Entity;
    },

    linkRelation({ fromEntity, toEntity, relationType, sessionId }) {
      linkRelationStmt.run(fromEntity, toEntity, relationType, sessionId);
      return selectRelationStmt.get(
        fromEntity,
        toEntity,
        relationType,
        sessionId,
      ) as Relation;
    },

    searchObservations(query, options = {}) {
      const limit = Math.max(1, Math.min(options.limit ?? 20, 500));
      const rows = searchStmt.all(query, limit) as SearchRow[];

      const sessionFilter = options.sessionId;
      const typeFilter = options.type;
      const filtered = rows.filter((r) => {
        if (sessionFilter && r.session_id !== sessionFilter) return false;
        if (typeFilter && r.type !== typeFilter) return false;
        return true;
      });

      return filtered.map((r) => ({
        observation: parseObservation(r),
        rank: r.rank,
        sessionSummary: r.session_summary,
      }));
    },

    timeline(anchorObservationId, window = 5) {
      const anchor = anchorStmt.get(anchorObservationId) as
        | { session_id: string; id: number }
        | undefined;
      if (!anchor) return [];
      const rows = timelineStmt.all(
        anchor.session_id,
        anchor.id - window,
        anchor.id + window,
      ) as ObservationRow[];
      return rows.map(parseObservation);
    },

    listSessions({ limit = 20, project } = {}) {
      return listSessionsStmt.all({ project: project ?? null, limit }) as Session[];
    },

    countObservationsByType() {
      return countByTypeStmt.all() as Array<{ type: string; count: number }>;
    },

    countEntities() {
      const row = countEntitiesStmt.get() as { count: number } | undefined;
      return row?.count ?? 0;
    },

    topEntities(limit = 5) {
      return topEntitiesStmt.all({ limit }) as Array<{ name: string; count: number }>;
    },

    getSessionObservationCount(sessionId: string) {
      const row = sessionObsCountStmt.get(sessionId) as { count: number } | undefined;
      return row?.count ?? 0;
    },

    close() {
      db.close();
    },
  };

  return Object.freeze(handle);
}
