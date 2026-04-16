// Migration runner tests (VAULT-02). Exercises runPendingMigrations against
// a fresh better-sqlite3 handle on a tmpdir path, without going through
// openSessionsDB. This isolates runner semantics from the public API.

import { test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runPendingMigrations,
  MigrationError,
} from './internal/migrations/runner.js';

let tempDir: string;
let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'cds-migration-test-'));
  dbPath = join(tempDir, 'test.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  rmSync(tempDir, { recursive: true, force: true });
});

test('fresh DB: runPendingMigrations creates schema_version + all tables + FTS5', () => {
  runPendingMigrations(db);

  const names = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name",
      )
      .all() as Array<{ name: string }>
  ).map((r) => r.name);

  for (const expected of [
    'sessions',
    'observations',
    'entities',
    'relations',
    'observations_fts',
    'schema_version',
  ]) {
    expect(names).toContain(expected);
  }

  const count = db
    .prepare('SELECT COUNT(*) AS c FROM schema_version')
    .get() as { c: number };
  // Phase 38: migration 002-entity-display-name.sql now lands alongside
  // 001-initial.sql, so a fresh DB records two versions.
  expect(count.c).toBe(2);

  const versions = (
    db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as Array<{ version: number }>
  ).map((r) => r.version);
  expect(versions).toEqual([1, 2]);
});

test('second call is idempotent — no new schema_version rows', () => {
  runPendingMigrations(db);
  runPendingMigrations(db);
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM schema_version')
    .get() as { c: number };
  // Phase 38: two migrations ship now; idempotent re-run keeps exactly 2 rows.
  expect(count.c).toBe(2);
});

test('triggers: inserting into observations populates observations_fts', () => {
  runPendingMigrations(db);

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)',
  ).run('s1', now, 'p', 'test summary');
  db.prepare(
    'INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run('s1', 'note', 'hello world', '[]', now);

  // External-content FTS5 tables don't allow SELECT of content/session_summary
  // columns directly — the data is stored in the source table. Join back to
  // observations + sessions to fetch the denormalized values.
  const row = db
    .prepare(
      'SELECT observations_fts.rowid AS rowid, o.content AS content, s.summary AS session_summary ' +
        'FROM observations_fts ' +
        'JOIN observations o ON o.id = observations_fts.rowid ' +
        'LEFT JOIN sessions s ON s.id = o.session_id ' +
        "WHERE observations_fts MATCH 'hello'",
    )
    .get() as
    | { rowid: number; content: string; session_summary: string | null }
    | undefined;

  expect(row).toBeTruthy();
  expect(row!.content).toContain('hello');
  expect(row!.session_summary).toBe('test summary');
});

test('FTS5 session_summary trigger re-denormalizes after UPDATE of sessions.summary', () => {
  runPendingMigrations(db);

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)',
  ).run('s1', now, 'p', 'old topic');
  db.prepare(
    'INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run('s1', 'note', 'alpha beta', '[]', now);

  // External-content FTS5 forbids SELECTing the text columns, so probe via
  // column-scoped MATCH instead ('old' should match the session_summary
  // column before the update, not after; 'new' only after).
  const matchOld = (): number | undefined =>
    (
      db
        .prepare(
          "SELECT rowid FROM observations_fts WHERE session_summary MATCH 'old'",
        )
        .get() as { rowid: number } | undefined
    )?.rowid;
  const matchNew = (): number | undefined =>
    (
      db
        .prepare(
          "SELECT rowid FROM observations_fts WHERE session_summary MATCH 'new'",
        )
        .get() as { rowid: number } | undefined
    )?.rowid;

  expect(matchOld()).toBe(1);
  expect(matchNew()).toBeUndefined();

  db.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(
    'new topic',
    's1',
  );

  expect(matchOld()).toBeUndefined();
  expect(matchNew()).toBe(1);
});

test('MigrationError is exported as a real Error subclass', () => {
  const e = new MigrationError('boom');
  expect(e).toBeInstanceOf(Error);
  expect(e).toBeInstanceOf(MigrationError);
  expect(e.name).toBe('MigrationError');
  expect(e.message).toBe('boom');
});

// The runner reads SQL files from a hard-coded on-disk directory, so we cannot
// cheaply inject a corrupt migration without amending runner.ts to accept an
// injectable migration list. Capturing the intent here; a future minor phase
// will revisit this once the API surface is stable.
test.todo(
  'rollback on bad migration — deferred until runner exposes an injectable helper (Phase 35.x)',
);
