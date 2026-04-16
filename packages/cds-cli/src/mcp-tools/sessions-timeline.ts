// Phase 37 Plan 02 Task 37-02-04 — sessions.timeline tool.
//
// Chronological window around an anchor observation (same session only).
// Per D-78 and tie-break rule from RESEARCH §7 (created_at ASC, id ASC).

import Database from 'better-sqlite3';

import {
  InvalidFilterError,
  SessionNotFoundError,
  VaultNotFoundError,
} from './shared.js';

export interface SessionsTimelineArgs {
  anchor_observation_id: number;
  window_before?: number;
  window_after?: number;
}

export interface TimelineObservation {
  id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string[];
  created_at: string;
  offset: number;
}

export interface SessionsTimelineResult {
  observations: TimelineObservation[];
  anchor_id: number;
}

export type SessionsTimelineDeps =
  | { dbPath: string; db?: undefined }
  | { db: Database.Database; dbPath?: undefined };

interface PreparedForTimeline {
  anchor: Database.Statement;
  before: Database.Statement;
  after: Database.Statement;
}

const STMT_CACHE = new WeakMap<Database.Database, PreparedForTimeline>();

const ANCHOR_SQL = `
  SELECT id, session_id, type, content, entities, created_at
    FROM observations
    WHERE id = ?
`;

const BEFORE_SQL = `
  SELECT id, session_id, type, content, entities, created_at
    FROM observations
    WHERE session_id = ?
      AND (created_at < ? OR (created_at = ? AND id < ?))
    ORDER BY created_at DESC, id DESC
    LIMIT ?
`;

const AFTER_SQL = `
  SELECT id, session_id, type, content, entities, created_at
    FROM observations
    WHERE session_id = ?
      AND (created_at > ? OR (created_at = ? AND id > ?))
    ORDER BY created_at ASC, id ASC
    LIMIT ?
`;

interface RawRow {
  id: number;
  session_id: string;
  type: string;
  content: string;
  entities: string;
  created_at: string;
}

function clampWindow(n: number | undefined): number {
  const raw = typeof n === 'number' && Number.isFinite(n) ? n : 5;
  return Math.min(Math.max(0, Math.floor(raw)), 20);
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

function openDb(deps: SessionsTimelineDeps): {
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

function prepare(db: Database.Database): PreparedForTimeline {
  const cached = STMT_CACHE.get(db);
  if (cached) return cached;
  const prepared: PreparedForTimeline = {
    anchor: db.prepare(ANCHOR_SQL),
    before: db.prepare(BEFORE_SQL),
    after: db.prepare(AFTER_SQL),
  };
  STMT_CACHE.set(db, prepared);
  return prepared;
}

function toObservation(row: RawRow, offset: number): TimelineObservation {
  return {
    id: row.id,
    session_id: row.session_id,
    type: row.type,
    content: row.content,
    entities: parseEntities(row.entities),
    created_at: row.created_at,
    offset,
  };
}

export async function sessionsTimeline(
  args: SessionsTimelineArgs,
  deps: SessionsTimelineDeps,
): Promise<SessionsTimelineResult> {
  if (
    typeof args.anchor_observation_id !== 'number' ||
    !Number.isInteger(args.anchor_observation_id) ||
    args.anchor_observation_id <= 0
  ) {
    throw new InvalidFilterError('anchor_observation_id must be a positive integer');
  }

  const window_before = clampWindow(args.window_before);
  const window_after = clampWindow(args.window_after);

  const { db, ownsHandle } = openDb(deps);
  try {
    const stmts = prepare(db);
    const anchor = stmts.anchor.get(args.anchor_observation_id) as
      | RawRow
      | undefined;
    if (!anchor) {
      throw new SessionNotFoundError(
        `No observation with id ${args.anchor_observation_id}`,
      );
    }

    const beforeRows = (
      stmts.before.all(
        anchor.session_id,
        anchor.created_at,
        anchor.created_at,
        anchor.id,
        window_before,
      ) as RawRow[]
    ).reverse();

    const afterRows = stmts.after.all(
      anchor.session_id,
      anchor.created_at,
      anchor.created_at,
      anchor.id,
      window_after,
    ) as RawRow[];

    const observations: TimelineObservation[] = [];
    const beforeStart = -beforeRows.length;
    beforeRows.forEach((row, i) => {
      observations.push(toObservation(row, beforeStart + i));
    });
    observations.push(toObservation(anchor, 0));
    afterRows.forEach((row, i) => {
      observations.push(toObservation(row, i + 1));
    });

    return { observations, anchor_id: anchor.id };
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
