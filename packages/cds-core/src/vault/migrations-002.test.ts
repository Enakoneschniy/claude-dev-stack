// Phase 38 Plan 01 Task 38-01-05 — Schema migration 002-entity-display-name test.
//
// Verifies the Phase 35 forward-only migration runner correctly applies
// `002-entity-display-name.sql` on top of a 001-migrated DB and is idempotent
// on re-run. Uses a tmp file DB because better-sqlite3 keeps the SQL parser
// state per-connection — :memory: also works but a named temp file mirrors
// the same path as real deployments.

import { test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPendingMigrations } from './internal/migrations/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'internal', 'migrations');

let tempDir: string;
let db: Database.Database;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'cds-migration-002-'));
  db = new Database(join(tempDir, 'test.db'));
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

test('migration 002 — adds entities.display_name and sessions.source_hash columns', () => {
  runPendingMigrations(db);

  // PRAGMA table_info returns one row per column; verify the new columns exist.
  type ColInfo = { cid: number; name: string; type: string };
  const entityCols = (
    db.prepare('PRAGMA table_info(entities)').all() as ColInfo[]
  ).map((c) => c.name);
  expect(entityCols).toContain('display_name');

  const sessionCols = (
    db.prepare('PRAGMA table_info(sessions)').all() as ColInfo[]
  ).map((c) => c.name);
  expect(sessionCols).toContain('source_hash');
});

test('migration 002 — backfills display_name for entities created before the migration', () => {
  // Simulate a DB that pre-dates Phase 38: apply ONLY 001 (by running the SQL
  // directly via better-sqlite3) and record version=1 manually. This bypasses
  // the runner's forward-only sweep so the UPDATE inside 002 runs on a pre-
  // existing row. Tests the v1 → v2 upgrade path explicitly.
  const initSql = readFileSync(join(MIGRATIONS_DIR, '001-initial.sql'), 'utf-8');
  const createVersionTableSql =
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)';
  db.exec(createVersionTableSql);
  db.exec(initSql);
  db.prepare(
    'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)',
  ).run(1, new Date().toISOString());

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO entities (name, type, first_seen, last_updated) VALUES (?, ?, ?, ?)',
  ).run('Manual', 'agent', now, now);

  // Now the runner should see version 1 applied and run only 002.
  runPendingMigrations(db);

  const stored = db
    .prepare('SELECT display_name FROM entities WHERE name = ?')
    .get('Manual') as { display_name: string };
  expect(stored.display_name).toBe('Manual');
});

test('migration 002 — records version 2 in schema_version and is idempotent on re-run', () => {
  runPendingMigrations(db);
  const initialVersions = (
    db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as Array<{ version: number }>
  ).map((r) => r.version);
  expect(initialVersions).toEqual([1, 2]);

  // Second call must be a no-op — no new schema_version rows, no SQL errors.
  runPendingMigrations(db);
  const again = (
    db
      .prepare('SELECT version FROM schema_version ORDER BY version')
      .all() as Array<{ version: number }>
  ).map((r) => r.version);
  expect(again).toEqual([1, 2]);
});

test('migration 002 — sessions.source_hash column starts NULL for new rows', () => {
  runPendingMigrations(db);

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO sessions (id, start_time, project, summary) VALUES (?, ?, ?, ?)',
  ).run('s1', now, 'proj', 'summary');

  const row = db
    .prepare('SELECT source_hash FROM sessions WHERE id = ?')
    .get('s1') as { source_hash: string | null };
  expect(row.source_hash).toBeNull();
});
