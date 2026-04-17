// Phase 43 — VaultBackend abstraction (INFRA-01 / INFRA-02).

/**
 * Conflict resolution strategy for vault sync operations.
 *
 * Backends declare their strategy as a readonly property so callers
 * can inspect it for logging, but do not need to pass it at call time.
 */
export enum ConflictStrategy {
  MergeByUuid = 'merge-by-uuid',
  LastWriteWins = 'last-write-wins',
}

/**
 * Abstraction for vault storage backends.
 *
 * Each backend syncs the entire `sessions.db` file atomically (whole-file
 * sync). There is no row-level or record-level sync — the file is the
 * transfer unit.
 *
 * Implementations:
 * - `FsBackend` (this file) — no-op, file is already local.
 * - `S3Backend` (@cds/s3-backend, Phase 44) — uploads/downloads via S3.
 */
export interface VaultBackend {
  /** The conflict resolution strategy this backend uses on push/pull. */
  readonly conflictStrategy: ConflictStrategy;

  /**
   * Download remote state to local.
   * For FsBackend this is a no-op since the file is already on disk.
   */
  pull(projectPath: string): Promise<void>;

  /**
   * Upload local state to remote.
   * For FsBackend this is a no-op since the file is already on disk.
   */
  push(projectPath: string): Promise<void>;
}

/**
 * Filesystem backend — no-op implementation of VaultBackend.
 *
 * Since the sessions.db file is already local, pull() and push() resolve
 * immediately without performing any I/O. This preserves zero-regression
 * on existing behavior.
 */
export class FsBackend implements VaultBackend {
  readonly conflictStrategy = ConflictStrategy.MergeByUuid;

  async pull(_projectPath: string): Promise<void> {
    // no-op: file is already local
  }

  async push(_projectPath: string): Promise<void> {
    // no-op: file is already local
  }
}
