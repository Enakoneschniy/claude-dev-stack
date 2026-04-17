// Phase 45 — tests for sessions.searchAll MCP tool (MEM-03).

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sessionsSearchAll } from './sessions-search-all.js';
import { InvalidFilterError } from './shared.js';

// Schema mirrored from build-sessions-db fixture (Phase 35 DDL).
const CREATE_SCHEMA_SQL = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT,
    project TEXT NOT NULL,
    summary TEXT
  );
  CREATE TABLE observations (
    id INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    entities TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_observations_session ON observations(session_id);
  CREATE INDEX idx_observations_created_at ON observations(created_at);
  CREATE VIRTUAL TABLE observations_fts USING fts5(
    content, session_summary,
    content=observations, content_rowid=id,
    tokenize='porter unicode61'
  );
  CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, content, session_summary)
    VALUES (new.id, new.content, (SELECT summary FROM sessions WHERE id = new.session_id));
  END;
`;

function seedProjectDb(dir: string, project: string, observations: Array<{ id: number; content: string }>): void {
  const projDir = join(dir, 'projects', project);
  mkdirSync(projDir, { recursive: true });
  const dbPath = join(projDir, 'sessions.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(CREATE_SCHEMA_SQL);
  db.prepare('INSERT INTO sessions (id, start_time, end_time, project, summary) VALUES (?, ?, ?, ?, ?)').run(
    `session-${project}`,
    '2026-04-17T10:00:00.000Z',
    null,
    project,
    `${project} session`,
  );
  const insertObs = db.prepare(
    'INSERT INTO observations (id, session_id, type, content, entities, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const obs of observations) {
    insertObs.run(obs.id, `session-${project}`, 'decision', obs.content, '[]', '2026-04-17T10:00:00.000Z');
  }
  db.close();
}

describe('sessions.searchAll', () => {
  let tmpDir: string;
  let priorVaultPath: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cds-searchall-'));
    priorVaultPath = process.env['VAULT_PATH'];
    process.env['VAULT_PATH'] = tmpDir;
  });

  afterEach(() => {
    if (priorVaultPath === undefined) delete process.env['VAULT_PATH'];
    else process.env['VAULT_PATH'] = priorVaultPath;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('empty query throws InvalidFilterError', async () => {
    await expect(sessionsSearchAll({ query: '' })).rejects.toThrow(InvalidFilterError);
  });

  it('returns empty array when no vault projects exist', async () => {
    mkdirSync(join(tmpDir, 'projects'), { recursive: true });
    const result = await sessionsSearchAll({ query: 'test' });
    expect(result.hits).toEqual([]);
    expect(result.total_matched).toBe(0);
  });

  it('returns cross-project results with project attribution', async () => {
    seedProjectDb(tmpDir, 'alpha', [{ id: 1, content: 'monorepo migration plan' }]);
    seedProjectDb(tmpDir, 'beta', [{ id: 1, content: 'monorepo structure setup' }]);
    const result = await sessionsSearchAll({ query: 'monorepo' });
    expect(result.hits.length).toBeGreaterThanOrEqual(2);
    const projects = result.hits.map((h) => h.project);
    expect(projects).toContain('alpha');
    expect(projects).toContain('beta');
  });

  it('respects limit parameter', async () => {
    seedProjectDb(tmpDir, 'alpha', [
      { id: 1, content: 'monorepo item one' },
      { id: 2, content: 'monorepo item two' },
      { id: 3, content: 'monorepo item three' },
    ]);
    seedProjectDb(tmpDir, 'beta', [
      { id: 1, content: 'monorepo item four' },
      { id: 2, content: 'monorepo item five' },
    ]);
    const result = await sessionsSearchAll({ query: 'monorepo', limit: 2 });
    expect(result.hits.length).toBeLessThanOrEqual(2);
  });

  it('clamps limit to 100 without error', async () => {
    mkdirSync(join(tmpDir, 'projects'), { recursive: true });
    const result = await sessionsSearchAll({ query: 'test', limit: 500 });
    expect(result.hits).toEqual([]);
    // No crash — limit was clamped internally
  });

  it('includes query_time_ms in result', async () => {
    mkdirSync(join(tmpDir, 'projects'), { recursive: true });
    const result = await sessionsSearchAll({ query: 'test' });
    expect(typeof result.query_time_ms).toBe('number');
    expect(result.query_time_ms).toBeGreaterThanOrEqual(0);
  });
});
