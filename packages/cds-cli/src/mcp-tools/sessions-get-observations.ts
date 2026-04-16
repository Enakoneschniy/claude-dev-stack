// Phase 37 Plan 02 Task 37-02-06 — sessions.get_observations tool.
//
// Bulk-fetch observations by ID list; raw or 140-char summary format per D-79.

import Database from 'better-sqlite3';

import { InvalidFilterError, VaultNotFoundError } from './shared.js';

export interface GetObservationsArgs {
  ids: number[];
  format?: 'raw' | 'summary';
}

export interface RawObservation {
  id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string[];
  created_at: string;
}

export interface SummaryObservation {
  id: number;
  type: string;
  content: string; // first 140 chars
  entities: string[];
}

export interface GetObservationsResult {
  observations: RawObservation[] | SummaryObservation[];
}

export type GetObservationsDeps =
  | { dbPath: string; db?: undefined }
  | { db: Database.Database; dbPath?: undefined };

interface Prepared {
  byIds: Database.Statement;
}

const STMT_CACHE = new WeakMap<Database.Database, Prepared>();

const SELECT_SQL = `
  SELECT id, session_id, type, content, entities, created_at
    FROM observations
    WHERE id IN (SELECT value FROM json_each(?))
    ORDER BY id ASC
`;

const MAX_IDS = 50;
const SUMMARY_CHAR_LIMIT = 140;

interface RawRow {
  id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string;
  created_at: string;
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

function openDb(deps: GetObservationsDeps): {
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
    throw new VaultNotFoundError(
      `Sessions DB missing or unreadable at ${deps.dbPath}: ${msg}`,
    );
  }
}

function prepare(db: Database.Database): Prepared {
  const cached = STMT_CACHE.get(db);
  if (cached) return cached;
  const prepared: Prepared = { byIds: db.prepare(SELECT_SQL) };
  STMT_CACHE.set(db, prepared);
  return prepared;
}

export async function sessionsGetObservations(
  args: GetObservationsArgs,
  deps: GetObservationsDeps,
): Promise<GetObservationsResult> {
  if (!Array.isArray(args.ids)) {
    throw new InvalidFilterError('ids must be an array of positive integers');
  }
  if (args.ids.length === 0) {
    throw new InvalidFilterError('ids must not be empty');
  }
  for (const id of args.ids) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new InvalidFilterError(`ids must contain only positive integers (got ${id})`);
    }
  }
  if (args.format !== undefined && args.format !== 'raw' && args.format !== 'summary') {
    throw new InvalidFilterError(`format must be 'raw' or 'summary' (got '${args.format}')`);
  }
  const format = args.format ?? 'raw';

  // Clamp to MAX_IDS (first N).
  const ids = args.ids.slice(0, MAX_IDS);

  const { db, ownsHandle } = openDb(deps);
  try {
    const { byIds } = prepare(db);
    const rows = byIds.all(JSON.stringify(ids)) as RawRow[];

    if (format === 'raw') {
      const observations: RawObservation[] = rows.map((r) => ({
        id: r.id,
        session_id: r.session_id,
        type: r.type,
        content: r.content,
        entities: parseEntities(r.entities),
        created_at: r.created_at,
      }));
      return { observations };
    }

    const observations: SummaryObservation[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      content: r.content.slice(0, SUMMARY_CHAR_LIMIT),
      entities: parseEntities(r.entities),
    }));
    return { observations };
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
