// Phase 35 — Migration runner.
// Applies any unseen .sql files under this directory to a better-sqlite3 DB.
// Forward-only; single-transaction per batch; ESM-safe directory resolution.
//
// See CONTEXT.md D-36..D-39 for behavioral spec.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE_RE = /^(\d{3})-.+\.sql$/;

/** Error raised when a migration fails to apply. Wraps the underlying cause. */
export class MigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

interface PendingMigration {
  version: number;
  filename: string;
  sql: string;
}

function scanMigrations(): PendingMigration[] {
  const entries = readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_FILE_RE.test(f))
    .sort();

  return entries.map((filename) => {
    const match = MIGRATION_FILE_RE.exec(filename);
    // Non-null: regex already matched above.
    const version = parseInt(match![1]!, 10);
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
    return { version, filename, sql };
  });
}

/**
 * Apply any migration files whose version is greater than the current
 * `MAX(version)` in `schema_version`. The whole batch runs inside a single
 * `db.transaction(...)` — any failure rolls back and rethrows as
 * {@link MigrationError}. Running twice against the same DB is a no-op.
 */
export function runPendingMigrations(db: Database.Database): void {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );

  const row = db
    .prepare('SELECT MAX(version) AS v FROM schema_version')
    .get() as { v: number | null };
  const current = row.v ?? 0;

  const pending = scanMigrations().filter((m) => m.version > current);
  if (pending.length === 0) return;

  const insertVersion = db.prepare(
    'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)',
  );

  const applyAll = db.transaction((migrations: PendingMigration[]) => {
    for (const m of migrations) {
      try {
        db.exec(m.sql);
      } catch (err) {
        throw new MigrationError(
          `Failed to apply migration ${m.filename} (version ${m.version})`,
          { cause: err },
        );
      }
      insertVersion.run(m.version, new Date().toISOString());
    }
  });

  applyAll(pending);
}
