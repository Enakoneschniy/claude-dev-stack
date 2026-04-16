// Phase 38 Plan 02 Task 38-02-04 — public type surface for @cds/migrate.
//
// These types cross the library/CLI boundary. Plan 03's CLI consumes the
// MigrationReport / MigrationFileResult shapes directly for dry-run tables
// and streaming progress output.

import type Database from 'better-sqlite3';

/**
 * Structural type of the @cds/core dispatchAgent return value — mirrored
 * here so this module does not drag the SDK types in. The migrator reads
 * `toolUses[0].input` for structured extraction output.
 */
export interface DispatchResultLike {
  output: string;
  tokens: { input: number; output: number };
  cost_usd: number;
  toolUses: Array<{ id: string; name: string; input: unknown }>;
}

export type DispatchAgentFn = (opts: {
  model: string;
  prompt: string;
  system?: string;
  tools?: unknown[];
  signal?: AbortSignal;
  session_id?: string;
}) => Promise<DispatchResultLike>;

export interface MigrateOptions {
  /** Absolute path to the vault root (e.g., `~/vault`). */
  vaultPath: string;
  /**
   * Project name — resolves to
   *   `{vaultPath}/projects/{projectName}/sessions/*.md`
   * for source markdown and `{vaultPath}/projects/{projectName}/sessions.db`
   * for the target SQLite (when `db` is not injected).
   */
  projectName: string;
  /** If true: preview without writing to DB. Defaults to true — callers must opt into apply. */
  dryRun?: boolean;
  /** If true: re-extract files whose stored source_hash differs from current file hash. */
  forceRefresh?: boolean;
  /** Confirmation threshold for the CLI (not consumed by the library). Default $0.30. */
  maxCost?: number;
  /**
   * Injectable dispatchAgent — defaults to `@cds/core/dispatchAgent` at call time.
   * Tests pass a mock; production callers never need to override.
   */
  dispatchAgent?: DispatchAgentFn;
  /**
   * Injectable raw better-sqlite3 handle — defaults to opening
   * `{vaultPath}/projects/{projectName}/sessions.db` at call time (the Phase 35
   * openSessionsDB also runs migrations against this file).
   * Tests inject a test DB via the `temp-db.ts` helper.
   */
  db?: Database.Database;
  /** Callback fired after each file's status is determined. Used by CLI for streaming. */
  onFileResult?: (result: MigrationFileResult) => void;
}

export type MigrationFileStatus =
  | 'will-migrate' // dry-run: file would be migrated fresh
  | 'unchanged' // already migrated, hash matches — skip
  | 'hash-changed' // already migrated, hash differs, not force-refreshed — warn + skip
  | 'migrated' // apply: successfully inserted
  | 'refreshed' // apply: force-refresh deleted + re-inserted
  | 'failed'; // apply: dispatch or SQL error

export interface MigrationFileResult {
  filename: string;
  /** `backfill-<stem>` (D-94). */
  sessionId: string;
  status: MigrationFileStatus;
  sizeBytes: number;
  estimatedTokens: number;
  estimatedCost: number;
  /** Only set on `'migrated'` / `'refreshed'`. */
  actualCost?: number;
  /** Only set on success — number of observations inserted. */
  observationCount?: number;
  /** Only set on success — number of distinct entities created / upserted. */
  entityCount?: number;
  /** Only set on `'failed'` / `'hash-changed'`. Human-readable explanation. */
  reason?: string;
}

export interface MigrationReport {
  vaultPath: string;
  projectName: string;
  dryRun: boolean;
  forceRefresh: boolean;
  files: MigrationFileResult[];
  total: {
    fileCount: number;
    succeeded: number;
    failed: number;
    /** `unchanged` + `hash-changed` (non-refreshed). */
    skipped: number;
    estimatedCost: number;
    /** Sum of `actualCost` across `migrated` + `refreshed` files. */
    actualCost: number;
  };
}

export interface FileInput {
  path: string;
  filename: string;
  sessionId: string;
  sizeBytes: number;
  content: string;
  hash: string;
}
