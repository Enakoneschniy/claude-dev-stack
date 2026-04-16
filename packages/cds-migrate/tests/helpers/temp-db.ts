// Phase 38 Plan 02 Task 38-02-00 — tmp SQLite DB helper for migrator tests.
//
// Phase 35 exposes `openSessionsDB(projectPath)` which returns a SessionsDB
// handle (frozen object with createSession/appendObservation/upsertEntity/...
// methods). For Phase 38's migrator we also need raw better-sqlite3 access
// (for PRAGMA, source_hash lookup, per-file transaction) — `openSessionsDB`
// internally uses `openRawDb` which runs migrations. This helper opens the
// handle AND provides a separate raw better-sqlite3 connection against the
// same file so migrator tests can introspect the DB directly.

import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { closeSessionsDB, openSessionsDB, type SessionsDB } from '@cds/core';

export interface TestDB {
  /** Raw better-sqlite3 handle pointed at the same file openSessionsDB uses. */
  db: Database.Database;
  /** The Phase 35 public handle (wired via the migrator's openSessionsDB). */
  sessionsDb: SessionsDB;
  /** The projectPath passed to openSessionsDB. */
  projectPath: string;
  cleanup: () => void;
}

/**
 * Open a test SQLite DB with the Phase 35 schema applied (via the public
 * `openSessionsDB` factory). Redirects HOME to a tmp dir so the resolved
 * vault path is isolated from the real ~/vault. Returns the raw handle for
 * direct SQL introspection and the SessionsDB wrapper for API testing.
 */
export function createTestDB(): TestDB {
  const tempHome = mkdtempSync(join(tmpdir(), 'cds-migrate-home-'));
  const prevHome = process.env['HOME'];
  const prevUserProfile = process.env['USERPROFILE'];
  process.env['HOME'] = tempHome;
  process.env['USERPROFILE'] = tempHome;

  const projectPath = mkdtempSync(join(tmpdir(), 'cds-migrate-proj-'));
  mkdirSync(projectPath, { recursive: true });

  // openSessionsDB resolves ~/vault/projects/{basename(projectPath)}/sessions.db
  // under the redirected HOME; calling it runs Phase 35 + Phase 38 migrations.
  const sessionsDb = openSessionsDB(projectPath);

  const dbFile = join(
    tempHome,
    'vault',
    'projects',
    basename(projectPath),
    'sessions.db',
  );
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return {
    db,
    sessionsDb,
    projectPath,
    cleanup: () => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      try {
        closeSessionsDB(projectPath);
      } catch {
        /* ignore */
      }
      rmSync(projectPath, { recursive: true, force: true });
      rmSync(tempHome, { recursive: true, force: true });
      if (prevHome === undefined) delete process.env['HOME'];
      else process.env['HOME'] = prevHome;
      if (prevUserProfile === undefined) delete process.env['USERPROFILE'];
      else process.env['USERPROFILE'] = prevUserProfile;
    },
  };
}
