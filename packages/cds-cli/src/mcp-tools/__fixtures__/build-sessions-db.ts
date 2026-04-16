// Phase 37 Plan 02 Task 37-02-01 — shared fixture DB builder.
//
// Creates an isolated SQLite DB in tmpdir that mirrors the Phase 35 schema
// (sessions + observations + observations_fts). Used by the session-tool
// tests (sessions.search/timeline/get_observations).
//
// Tech debt note: the schema is duplicated here verbatim from
// `packages/cds-core/src/vault/internal/migrations/001-initial.sql`. Replace
// this duplication with the core migration runner once Phase 35 exposes it
// for test reuse.

import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface FixtureSession {
  id: string;
  start_time: string;
  end_time: string | null;
  project: string;
  summary: string | null;
}

export interface FixtureObservation {
  id: number;
  session_id: string;
  type: string;
  content: string;
  /** JSON TEXT of a number[] (entity IDs per Phase 35 D-45). */
  entities: string;
  created_at: string;
}

export interface FixtureSeed {
  sessions: FixtureSession[];
  observations: FixtureObservation[];
}

export interface FixtureHandle {
  dbPath: string;
  db: Database.Database;
  cleanup: () => void;
}

const CREATE_SCHEMA_SQL = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT,
    project TEXT NOT NULL,
    summary TEXT
  );

  CREATE TABLE observations (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    entities TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE INDEX idx_observations_session ON observations(session_id);
  CREATE INDEX idx_observations_created_at ON observations(created_at);

  CREATE VIRTUAL TABLE observations_fts USING fts5(
    content,
    session_summary,
    content=observations,
    content_rowid=id,
    tokenize='porter unicode61'
  );

  CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, content, session_summary)
    VALUES (
      new.id,
      new.content,
      (SELECT summary FROM sessions WHERE id = new.session_id)
    );
  END;

  CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, content, session_summary)
      VALUES('delete', old.id, old.content,
             (SELECT summary FROM sessions WHERE id = old.session_id));
    INSERT INTO observations_fts(rowid, content, session_summary)
      VALUES (new.id, new.content,
              (SELECT summary FROM sessions WHERE id = new.session_id));
  END;

  CREATE TRIGGER observations_ad AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, content, session_summary)
      VALUES('delete', old.id, old.content,
             (SELECT summary FROM sessions WHERE id = old.session_id));
  END;
`;

export function buildFixtureSessionsDB(seed: FixtureSeed): FixtureHandle {
  const dir = mkdtempSync(join(tmpdir(), 'cds-mcp-fixture-'));
  const dbPath = join(dir, 'sessions.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(CREATE_SCHEMA_SQL);

  const insertSession = db.prepare(
    'INSERT INTO sessions (id, start_time, end_time, project, summary) VALUES (?, ?, ?, ?, ?)',
  );
  const insertObservation = db.prepare(
    'INSERT INTO observations (id, session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const populate = db.transaction(() => {
    for (const s of seed.sessions) {
      insertSession.run(s.id, s.start_time, s.end_time, s.project, s.summary);
    }
    for (const o of seed.observations) {
      insertObservation.run(
        o.id,
        o.session_id,
        o.type,
        o.content,
        o.entities,
        o.created_at,
      );
    }
  });
  populate();

  return {
    dbPath,
    db,
    cleanup: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
