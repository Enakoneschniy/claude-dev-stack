-- Phase 35 — Migration 001: initial schema
-- Creates the canonical session memory tables, FTS5 index, and sync triggers.
-- Per CONTEXT.md D-43..D-47. Runner (runner.ts) wraps this file in a transaction
-- and records version=1 into schema_version after successful execution.

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time TEXT,
  project TEXT NOT NULL,
  summary TEXT
);

CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  entities TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE TABLE relations (
  from_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  observed_in_session TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (from_entity, to_entity, relation_type, observed_in_session)
);

-- ---------------------------------------------------------------------------
-- Indexes (help timeline ordering + per-session lookup)
-- ---------------------------------------------------------------------------

CREATE INDEX idx_observations_session ON observations(session_id);
CREATE INDEX idx_observations_created_at ON observations(created_at);

-- ---------------------------------------------------------------------------
-- FTS5 external-content virtual table (D-46)
--   content=observations   → FTS rowid maps to observations.id
--   content_rowid=id       → required so delete commands find the right row
--   tokenize='porter unicode61' → stem English + normalize Unicode
-- ---------------------------------------------------------------------------

CREATE VIRTUAL TABLE observations_fts USING fts5(
  content,
  session_summary,
  content=observations,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- ---------------------------------------------------------------------------
-- Sync triggers (D-47). External-content FTS5 does NOT auto-index; we issue
-- the delete/insert commands documented at sqlite.org/fts5.html §4.4.2.
-- ---------------------------------------------------------------------------

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

-- Session summary re-denormalize trigger: when sessions.summary is UPDATEd,
-- re-issue delete+insert for every observation in that session so the FTS
-- session_summary column stays in sync.
CREATE TRIGGER sessions_summary_au AFTER UPDATE OF summary ON sessions BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, content, session_summary)
    SELECT 'delete', id, content, old.summary
      FROM observations WHERE session_id = new.id;
  INSERT INTO observations_fts(rowid, content, session_summary)
    SELECT id, content, new.summary
      FROM observations WHERE session_id = new.id;
END;
