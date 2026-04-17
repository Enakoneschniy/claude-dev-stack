import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { S3Backend, S3SyncError } from './index.js';
import { ConflictStrategy } from '@cds/core';

// Read migration SQL from cds-core for creating test DBs
const MIGRATION_001 = readFileSync(
  join(__dirname, '../../cds-core/src/vault/internal/migrations/001-initial.sql'),
  'utf-8',
);
const MIGRATION_002 = readFileSync(
  join(__dirname, '../../cds-core/src/vault/internal/migrations/002-entity-display-name.sql'),
  'utf-8',
);

// Mock the s3-client module
vi.mock('./s3-client.js', () => ({
  createS3Client: vi.fn(() => ({})),
  downloadObject: vi.fn(),
  uploadObject: vi.fn(),
  checkObjectExists: vi.fn(),
  deleteObject: vi.fn(),
}));

import { downloadObject, uploadObject } from './s3-client.js';

function createTestDb(dir: string, name: string): string {
  const dbPath = join(dir, name);
  const db = new Database(dbPath);
  db.exec(MIGRATION_001);
  db.exec(MIGRATION_002);
  db.pragma('user_version = 2');
  db.close();
  return dbPath;
}

let tempDir: string;
let originalHomedir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'cds-s3-test-'));
  // Override homedir so S3Backend uses our temp dir
  originalHomedir = process.env.HOME!;
  process.env.HOME = tempDir;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.HOME = originalHomedir;
  rmSync(tempDir, { recursive: true, force: true });
});

const testConfig = {
  bucket: 'test-bucket',
  region: 'us-east-1',
  prefix: 'vault/projects/',
};

describe('S3Backend', () => {
  it('implements VaultBackend with MergeByUuid strategy', () => {
    const backend = new S3Backend(testConfig);
    expect(backend.conflictStrategy).toBe(ConflictStrategy.MergeByUuid);
  });

  it('has pull() and push() methods', () => {
    const backend = new S3Backend(testConfig);
    expect(typeof backend.pull).toBe('function');
    expect(typeof backend.push).toBe('function');
  });

  describe('pull()', () => {
    it('handles first sync (no remote) gracefully', async () => {
      vi.mocked(downloadObject).mockResolvedValue(false);

      const backend = new S3Backend(testConfig);
      await backend.pull('/some/project/path');

      const result = backend.getLastMergeResult();
      expect(result).toEqual({
        sessionsAdded: 0,
        observationsAdded: 0,
        entitiesAdded: 0,
        relationsAdded: 0,
      });
    });

    it('downloads and merges remote sessions', async () => {
      const projectName = 'test-project';
      const vaultDir = join(tempDir, 'vault', 'projects', projectName);
      mkdirSync(vaultDir, { recursive: true });
      const localDbPath = createTestDb(vaultDir, 'sessions.db');

      // Add a local session
      const localDb = new Database(localDbPath);
      localDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
        'local-session', '2026-04-17T10:00:00Z', projectName,
      );
      localDb.close();

      // Mock downloadObject to create a remote DB with a different session
      vi.mocked(downloadObject).mockImplementation(async (_client, _config, _project, destPath) => {
        const remoteDb = new Database(destPath);
        remoteDb.exec(MIGRATION_001);
        remoteDb.exec(MIGRATION_002);
        remoteDb.pragma('user_version = 2');
        remoteDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
          'remote-session', '2026-04-17T11:00:00Z', projectName,
        );
        remoteDb.close();
        return true;
      });

      const backend = new S3Backend(testConfig);
      await backend.pull(`/path/to/${projectName}`);

      const result = backend.getLastMergeResult();
      expect(result!.sessionsAdded).toBe(1);

      // Verify local DB has both sessions
      const db = new Database(localDbPath);
      const count = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;
      expect(count).toBe(2);
      db.close();
    });
  });

  describe('push()', () => {
    it('runs WAL checkpoint and clears WAL file', async () => {
      const projectName = 'wal-test';
      const vaultDir = join(tempDir, 'vault', 'projects', projectName);
      mkdirSync(vaultDir, { recursive: true });
      const dbPath = createTestDb(vaultDir, 'sessions.db');

      // Write some data in WAL mode to create a WAL file
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
        'wal-session', '2026-04-17T10:00:00Z', projectName,
      );
      db.close();

      vi.mocked(uploadObject).mockResolvedValue(undefined);

      const backend = new S3Backend(testConfig);
      await backend.push(`/path/to/${projectName}`);

      // Verify WAL file is 0 bytes or absent after push
      const walPath = `${dbPath}-wal`;
      if (existsSync(walPath)) {
        expect(statSync(walPath).size).toBe(0);
      }
      // If WAL file doesn't exist, that's also fine

      // Verify uploadObject was called
      expect(uploadObject).toHaveBeenCalled();
    });

    it('throws S3SyncError if local DB does not exist', async () => {
      const backend = new S3Backend(testConfig);
      await expect(backend.push('/path/to/nonexistent-project')).rejects.toThrow(S3SyncError);
    });
  });
});
