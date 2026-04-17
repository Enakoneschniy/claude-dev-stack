import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, unlinkSync, statSync } from 'node:fs';
import Database from 'better-sqlite3';
import { ConflictStrategy } from '@cds/core';
import type { VaultBackend } from '@cds/core';
import type { S3BackendConfig } from './config.js';
import { createS3Client, downloadObject, uploadObject } from './s3-client.js';
import { mergeRemoteIntoLocal } from './merge.js';
import type { MergeResult } from './merge.js';
import { S3SyncError } from './errors.js';
import type { S3Client } from '@aws-sdk/client-s3';

export { S3SyncError, S3AccessDeniedError, S3BucketNotFoundError, S3SchemaVersionError } from './errors.js';
export type { S3BackendConfig } from './config.js';
export { DEFAULT_PREFIX, buildObjectKey } from './config.js';
export type { MergeResult } from './merge.js';

export class S3Backend implements VaultBackend {
  readonly conflictStrategy = ConflictStrategy.MergeByUuid;
  private readonly client: S3Client;
  private readonly config: S3BackendConfig;
  private lastMergeResult: MergeResult | null = null;

  constructor(config: S3BackendConfig) {
    this.config = config;
    this.client = createS3Client(config);
  }

  /** Get the result of the last pull() merge, or null if pull() hasn't been called. */
  getLastMergeResult(): MergeResult | null {
    return this.lastMergeResult;
  }

  async pull(projectPath: string): Promise<void> {
    const project = basename(projectPath);
    const dbPath = this.getDbPath(project);
    const tempPath = `${dbPath}.remote-${Date.now()}`;

    try {
      const downloaded = await downloadObject(this.client, this.config, project, tempPath);
      if (!downloaded) {
        // First sync — no remote DB yet. Nothing to pull.
        this.lastMergeResult = { sessionsAdded: 0, observationsAdded: 0, entitiesAdded: 0, relationsAdded: 0 };
        return;
      }

      // Merge remote into local
      this.lastMergeResult = mergeRemoteIntoLocal(dbPath, tempPath);
    } finally {
      // Clean up temp file
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    }
  }

  async push(projectPath: string): Promise<void> {
    const project = basename(projectPath);
    const dbPath = this.getDbPath(project);

    if (!existsSync(dbPath)) {
      throw new S3SyncError(`Local database not found: ${dbPath}`);
    }

    // WAL checkpoint before upload (HARD-03, Pitfall 1)
    const db = new Database(dbPath);
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      db.close();
    }

    // Verify WAL is cleared
    const walPath = `${dbPath}-wal`;
    if (existsSync(walPath)) {
      const walSize = statSync(walPath).size;
      if (walSize > 0) {
        throw new S3SyncError(
          `WAL file still has ${walSize} bytes after checkpoint. Cannot upload safely.`
        );
      }
    }

    // Upload
    await uploadObject(this.client, this.config, project, dbPath);
  }

  private getDbPath(project: string): string {
    return join(homedir(), 'vault', 'projects', project, 'sessions.db');
  }
}
