// Phase 37 Plan 02 Task 37-02-02 — sessions.search tool.
//
// FTS5 MATCH query over observations_fts with filter push-down and BM25
// ranking. Per D-77 / RESEARCH §2.2.

import Database from 'better-sqlite3';
import { performance } from 'node:perf_hooks';

import { InvalidFilterError, VaultNotFoundError } from './shared.js';

export interface SessionsSearchFilters {
  date_from?: string;
  date_to?: string;
  project?: string; // reserved — single-DB search for now
  type?: string[];
  session_id?: string;
  limit?: number;
}

export interface SessionsSearchArgs {
  query: string;
  filters?: SessionsSearchFilters;
}

export interface SessionsSearchHit {
  observation_id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string[];
  created_at: string;
  rank: number;
}

export interface SessionsSearchResult {
  hits: SessionsSearchHit[];
  total_matched: number;
  query_time_ms: number;
}

export type SessionsSearchDeps =
  | { dbPath: string; db?: undefined }
  | { db: Database.Database; dbPath?: undefined };

interface PreparedForSearch {
  search: Database.Statement;
}

const STMT_CACHE = new WeakMap<Database.Database, PreparedForSearch>();

const SEARCH_SQL = `
  SELECT
    o.id             AS observation_id,
    o.session_id     AS session_id,
    o.type           AS type,
    o.content        AS content,
    o.entities       AS entities,
    o.created_at     AS created_at,
    bm25(observations_fts) AS rank
  FROM observations_fts
  JOIN observations o ON o.id = observations_fts.rowid
  WHERE observations_fts MATCH @match
    AND (@date_from IS NULL OR o.created_at >= @date_from)
    AND (@date_to   IS NULL OR o.created_at <= @date_to)
    AND (@session_id IS NULL OR o.session_id = @session_id)
    AND (@types_json IS NULL OR o.type IN (SELECT value FROM json_each(@types_json)))
  ORDER BY rank
  LIMIT @limit
`;

interface RawRow {
  observation_id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string;
  created_at: string;
  rank: number;
}

function clampLimit(n: number | undefined): number {
  const raw = typeof n === 'number' && Number.isFinite(n) ? n : 20;
  return Math.min(Math.max(1, Math.floor(raw)), 100);
}

function assertIsoDate(field: string, value: string | undefined): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    throw new InvalidFilterError(`${field} must be an ISO 8601 string`);
  }
  const d = new Date(value);
  if (Number.isNaN(+d)) {
    throw new InvalidFilterError(`${field} is not a valid ISO 8601 date: ${value}`);
  }
}

function parseEntities(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((e) => String(e));
    }
    return [];
  } catch {
    return [];
  }
}

function openDb(deps: SessionsSearchDeps): {
  db: Database.Database;
  ownsHandle: boolean;
} {
  if (deps.db) return { db: deps.db, ownsHandle: false };
  try {
    return {
      db: new Database(deps.dbPath, { readonly: true, fileMustExist: true }),
      ownsHandle: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new VaultNotFoundError(`Sessions DB missing or unreadable at ${deps.dbPath}: ${msg}`);
  }
}

function prepare(db: Database.Database): PreparedForSearch {
  const cached = STMT_CACHE.get(db);
  if (cached) return cached;
  const prepared: PreparedForSearch = { search: db.prepare(SEARCH_SQL) };
  STMT_CACHE.set(db, prepared);
  return prepared;
}

export async function sessionsSearch(
  args: SessionsSearchArgs,
  deps: SessionsSearchDeps,
): Promise<SessionsSearchResult> {
  if (typeof args.query !== 'string' || args.query.trim().length === 0) {
    throw new InvalidFilterError('query must be a non-empty string');
  }
  const filters = args.filters ?? {};
  if (filters.type !== undefined) {
    if (!Array.isArray(filters.type)) {
      throw new InvalidFilterError('filters.type must be an array of strings');
    }
    for (const t of filters.type) {
      if (typeof t !== 'string' || t.length === 0) {
        throw new InvalidFilterError('filters.type entries must be non-empty strings');
      }
    }
  }
  if (filters.session_id !== undefined && typeof filters.session_id !== 'string') {
    throw new InvalidFilterError('filters.session_id must be a string');
  }
  assertIsoDate('filters.date_from', filters.date_from);
  assertIsoDate('filters.date_to', filters.date_to);

  const limit = clampLimit(filters.limit);
  const { db, ownsHandle } = openDb(deps);
  try {
    const { search } = prepare(db);
    const bindings = {
      match: args.query,
      date_from: filters.date_from ?? null,
      date_to: filters.date_to ?? null,
      session_id: filters.session_id ?? null,
      types_json:
        filters.type && filters.type.length > 0 ? JSON.stringify(filters.type) : null,
      limit,
    };

    const started = performance.now();
    let rows: RawRow[];
    try {
      rows = search.all(bindings) as RawRow[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string } | undefined)?.code;
      if (code === 'SQLITE_NOTADB') {
        throw new VaultNotFoundError(`Sessions DB is not a valid SQLite file: ${msg}`);
      }
      // SQLITE_ERROR bubbles up for malformed FTS5 MATCH expressions
      // ("fts5: syntax error near …", "unterminated string", etc). Treat every
      // SQLITE_ERROR raised by the MATCH query as an InvalidFilterError since
      // the only user-controlled input to this statement is the MATCH string.
      if (
        code === 'SQLITE_ERROR' ||
        msg.toLowerCase().includes('fts5') ||
        msg.toLowerCase().includes('syntax')
      ) {
        throw new InvalidFilterError(`FTS5 syntax error: ${msg}`);
      }
      throw err;
    }
    const query_time_ms = Math.round((performance.now() - started) * 1000) / 1000;

    const hits: SessionsSearchHit[] = rows.map((r) => ({
      observation_id: r.observation_id,
      session_id: r.session_id,
      type: r.type,
      content: r.content,
      entities: parseEntities(r.entities),
      created_at: r.created_at,
      rank: r.rank,
    }));

    return {
      hits,
      total_matched: hits.length,
      query_time_ms,
    };
  } finally {
    if (ownsHandle) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}
