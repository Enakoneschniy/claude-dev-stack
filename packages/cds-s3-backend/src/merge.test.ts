import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { mergeRemoteIntoLocal } from './merge.js';
import { S3SchemaVersionError } from './errors.js';

// Read migration SQL from cds-core
const MIGRATION_001 = readFileSync(
  join(__dirname, '../../cds-core/src/vault/internal/migrations/001-initial.sql'),
  'utf-8',
);
const MIGRATION_002 = readFileSync(
  join(__dirname, '../../cds-core/src/vault/internal/migrations/002-entity-display-name.sql'),
  'utf-8',
);

function createTestDb(dir: string, name: string): string {
  const dbPath = join(dir, name);
  const db = new Database(dbPath);
  db.exec(MIGRATION_001);
  db.exec(MIGRATION_002);
  db.pragma('user_version = 2');
  db.close();
  return dbPath;
}

function openDb(path: string): Database.Database {
  return new Database(path);
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'cds-merge-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('mergeRemoteIntoLocal', () => {
  it('merges different sessions from two devices', () => {
    const localPath = createTestDb(tempDir, 'local.db');
    const remotePath = createTestDb(tempDir, 'remote.db');

    // Device A: session aaa with 2 observations, 1 entity
    const localDb = openDb(localPath);
    localDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
      'aaa-aaa', '2026-04-17T10:00:00Z', 'test-proj',
    );
    localDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'typescript', 'TypeScript', 'concept', '2026-04-17T10:00:00Z', '2026-04-17T10:00:00Z',
    );
    localDb.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'aaa-aaa', 'decision', 'Use TypeScript', '[1]', '2026-04-17T10:01:00Z',
    );
    localDb.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'aaa-aaa', 'observation', 'TS is great', '[1]', '2026-04-17T10:02:00Z',
    );
    localDb.close();

    // Device B: session bbb with 3 observations, 2 entities (typescript shared, react new)
    const remoteDb = openDb(remotePath);
    remoteDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
      'bbb-bbb', '2026-04-17T11:00:00Z', 'test-proj',
    );
    remoteDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'typescript', 'TypeScript', 'concept', '2026-04-17T11:00:00Z', '2026-04-17T11:00:00Z',
    );
    remoteDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'react', 'React', 'concept', '2026-04-17T11:00:00Z', '2026-04-17T11:00:00Z',
    );
    remoteDb.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'bbb-bbb', 'decision', 'Use React', '[2]', '2026-04-17T11:01:00Z',
    );
    remoteDb.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'bbb-bbb', 'observation', 'React is fast', '[2]', '2026-04-17T11:02:00Z',
    );
    remoteDb.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'bbb-bbb', 'observation', 'Both TS and React', '[1,2]', '2026-04-17T11:03:00Z',
    );
    // Add relation so entity remapping is exercised
    remoteDb.prepare('INSERT INTO relations (from_entity, to_entity, relation_type, observed_in_session) VALUES (?, ?, ?, ?)').run(
      1, 2, 'uses', 'bbb-bbb',
    );
    remoteDb.close();

    const result = mergeRemoteIntoLocal(localPath, remotePath);

    expect(result.sessionsAdded).toBe(1);
    expect(result.observationsAdded).toBe(3);
    expect(result.relationsAdded).toBe(1);

    // Verify local DB has both sessions
    const db = openDb(localPath);
    const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;
    expect(sessionCount).toBe(2);

    const obsCount = (db.prepare('SELECT COUNT(*) as c FROM observations').get() as any).c;
    expect(obsCount).toBe(5);

    const entityCount = (db.prepare('SELECT COUNT(*) as c FROM entities').get() as any).c;
    expect(entityCount).toBe(2); // typescript deduplicated

    db.close();
  });

  it('handles same sessions on both devices (no-op)', () => {
    const localPath = createTestDb(tempDir, 'local.db');
    const remotePath = createTestDb(tempDir, 'remote.db');

    // Both have same session UUID
    const localDb = openDb(localPath);
    localDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
      'same-uuid', '2026-04-17T10:00:00Z', 'test-proj',
    );
    localDb.close();

    const remoteDb = openDb(remotePath);
    remoteDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
      'same-uuid', '2026-04-17T10:00:00Z', 'test-proj',
    );
    remoteDb.close();

    const result = mergeRemoteIntoLocal(localPath, remotePath);

    expect(result.sessionsAdded).toBe(0);
    expect(result.observationsAdded).toBe(0);
  });

  it('handles first sync (empty local)', () => {
    const localPath = createTestDb(tempDir, 'local.db');
    const remotePath = createTestDb(tempDir, 'remote.db');

    // Remote has 3 sessions
    const remoteDb = openDb(remotePath);
    for (let i = 1; i <= 3; i++) {
      remoteDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
        `session-${i}`, `2026-04-17T${10 + i}:00:00Z`, 'test-proj',
      );
      remoteDb.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run(
        `session-${i}`, 'observation', `Content ${i}`, '[]', `2026-04-17T${10 + i}:01:00Z`,
      );
    }
    remoteDb.close();

    const result = mergeRemoteIntoLocal(localPath, remotePath);

    expect(result.sessionsAdded).toBe(3);
    expect(result.observationsAdded).toBe(3);

    const db = openDb(localPath);
    const sessionCount = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any).c;
    expect(sessionCount).toBe(3);
    db.close();
  });

  it('throws S3SchemaVersionError when remote schema is newer', () => {
    const localPath = createTestDb(tempDir, 'local.db');
    const remotePath = createTestDb(tempDir, 'remote.db');

    // Set remote to higher version
    const remoteDb = openDb(remotePath);
    remoteDb.pragma('user_version = 99');
    remoteDb.close();

    expect(() => mergeRemoteIntoLocal(localPath, remotePath)).toThrow(S3SchemaVersionError);
  });

  it('remaps entity IDs in observations.entities JSON', () => {
    const localPath = createTestDb(tempDir, 'local.db');
    const remotePath = createTestDb(tempDir, 'remote.db');

    // Local: entity "react" has id=1
    const localDb = openDb(localPath);
    localDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'react', 'React', 'concept', '2026-04-17T10:00:00Z', '2026-04-17T10:00:00Z',
    );
    localDb.close();

    // Remote: entity "vue" id=1, dummy entities id=2-4, "react" id=5
    // Observation references entity id=5 (react on remote)
    const remoteDb = openDb(remotePath);
    remoteDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'vue', 'Vue', 'concept', '2026-04-17T11:00:00Z', '2026-04-17T11:00:00Z',
    );
    for (let i = 2; i <= 4; i++) {
      remoteDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
        `dummy-${i}`, `Dummy ${i}`, 'concept', '2026-04-17T11:00:00Z', '2026-04-17T11:00:00Z',
      );
    }
    remoteDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'react', 'React', 'concept', '2026-04-17T11:00:00Z', '2026-04-17T11:00:00Z',
    );

    remoteDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
      'remap-session', '2026-04-17T11:00:00Z', 'test-proj',
    );
    remoteDb.prepare('INSERT INTO observations (session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'remap-session', 'observation', 'Uses react', '[5]', '2026-04-17T11:01:00Z',
    );
    // Add relation from react(5) to vue(1) so entities get imported via relation query
    remoteDb.prepare('INSERT INTO relations (from_entity, to_entity, relation_type, observed_in_session) VALUES (?, ?, ?, ?)').run(
      5, 1, 'compared-to', 'remap-session',
    );
    remoteDb.close();

    mergeRemoteIntoLocal(localPath, remotePath);

    // Verify: observation's entities JSON should contain local react id (1)
    const db = openDb(localPath);
    const obs = db.prepare("SELECT entities FROM observations WHERE session_id = 'remap-session'").get() as any;
    const entityIds = JSON.parse(obs.entities) as number[];
    // react on local is id=1 (was already there before merge)
    expect(entityIds).toContain(1);
    db.close();
  });

  it('merges relations with remapped entity IDs', () => {
    const localPath = createTestDb(tempDir, 'local.db');
    const remotePath = createTestDb(tempDir, 'remote.db');

    // Local: entity "typescript" id=1
    const localDb = openDb(localPath);
    localDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'typescript', 'TypeScript', 'concept', '2026-04-17T10:00:00Z', '2026-04-17T10:00:00Z',
    );
    localDb.close();

    // Remote: entity "react" id=1, "typescript" id=2
    const remoteDb = openDb(remotePath);
    remoteDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'react', 'React', 'concept', '2026-04-17T11:00:00Z', '2026-04-17T11:00:00Z',
    );
    remoteDb.prepare('INSERT INTO entities (name, display_name, type, first_seen, last_updated) VALUES (?, ?, ?, ?, ?)').run(
      'typescript', 'TypeScript', 'concept', '2026-04-17T11:00:00Z', '2026-04-17T11:00:00Z',
    );
    remoteDb.prepare('INSERT INTO sessions (id, start_time, project) VALUES (?, ?, ?)').run(
      'rel-session', '2026-04-17T11:00:00Z', 'test-proj',
    );
    // Relation: react(1) -> typescript(2) on remote
    remoteDb.prepare('INSERT INTO relations (from_entity, to_entity, relation_type, observed_in_session) VALUES (?, ?, ?, ?)').run(
      1, 2, 'depends-on', 'rel-session',
    );
    remoteDb.close();

    mergeRemoteIntoLocal(localPath, remotePath);

    // Verify: relation uses local entity IDs
    const db = openDb(localPath);
    const rel = db.prepare("SELECT * FROM relations WHERE observed_in_session = 'rel-session'").get() as any;
    expect(rel).toBeDefined();

    // react should be id=2 on local (after typescript=1)
    const reactLocal = db.prepare("SELECT id FROM entities WHERE name = 'react'").get() as any;
    const tsLocal = db.prepare("SELECT id FROM entities WHERE name = 'typescript'").get() as any;
    expect(rel.from_entity).toBe(reactLocal.id);
    expect(rel.to_entity).toBe(tsLocal.id);
    db.close();
  });
});
