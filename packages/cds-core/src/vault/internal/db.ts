// Phase 35 — Raw DB factory.
// Internal module — NOT re-exported from vault/index.ts or src/index.ts.
// Consumers must use `openSessionsDB(projectPath)` from ../sessions.ts.
//
// This module owns connection lifecycle + PRAGMA tuning + FTS5 availability
// check + migration bootstrap.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { runPendingMigrations } from './migrations/runner.js';
import { DbOpenError, FtsUnavailableError } from '../sessions.js';

/** Raw better-sqlite3 handle. Exposed ONLY to sessions.ts. */
export type RawDatabase = Database.Database;

interface CompileOptionRow {
  compile_options: string;
}

/**
 * Open (or create) a SQLite database at `absoluteDbPath`, apply CDS PRAGMAs,
 * verify FTS5 is compiled into the binary, and run any pending migrations.
 *
 * Throws {@link DbOpenError} if the file cannot be opened.
 * Throws {@link FtsUnavailableError} if the linked SQLite lacks FTS5 support.
 */
export function openRawDb(absoluteDbPath: string): RawDatabase {
  mkdirSync(dirname(absoluteDbPath), { recursive: true });

  let db: RawDatabase;
  try {
    db = new Database(absoluteDbPath);
  } catch (err) {
    throw new DbOpenError(
      `Failed to open ${absoluteDbPath}: ${(err as Error).message}`,
      { cause: err },
    );
  }

  // Tuning: WAL mode for concurrent reads, synchronous=NORMAL for performance,
  // a 5s busy timeout to weather brief write contention, 10MB page cache.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -10000');

  // FTS5 is compiled into the prebuilt better-sqlite3 binaries, but hand-built
  // installs may omit it. Fail fast so the user sees a clear error instead of
  // a cryptic "no such module: fts5" at first INSERT time.
  const opts = db
    .prepare('PRAGMA compile_options')
    .all() as CompileOptionRow[];
  if (!opts.some((o) => o.compile_options === 'ENABLE_FTS5')) {
    db.close();
    throw new FtsUnavailableError(
      'SQLite build does not include FTS5 — FTS5 required for VAULT-02',
    );
  }

  runPendingMigrations(db);

  return db;
}
