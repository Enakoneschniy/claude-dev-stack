// Integration tests for the public sessions API (VAULT-01 + VAULT-02).
//
// Isolation strategy:
//   `openSessionsDB` resolves under `homedir() + /vault/projects/{basename}`,
//   which would pollute the real ~/vault on the test machine. We redirect
//   `process.env.HOME` to a per-test tmpdir before each test and restore it
//   in afterEach. This is POSIX-specific (Node's os.homedir() reads HOME on
//   POSIX). On Windows CI, also set `USERPROFILE`.

import { test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  openSessionsDB,
  closeSessionsDB,
  CANONICAL_ENTITY_TYPES,
  VaultError,
  type SessionsDB,
} from './sessions.js';

let originalHome: string | undefined;
let tempHome: string;
let projectPath: string;

function dbPath(): string {
  return join(tempHome, 'vault', 'projects', basename(projectPath), 'sessions.db');
}

beforeEach(() => {
  originalHome = process.env['HOME'];
  tempHome = mkdtempSync(join(tmpdir(), 'cds-vault-test-home-'));
  process.env['HOME'] = tempHome;
  // On Windows the equivalent is USERPROFILE; harmless to also set it.
  process.env['USERPROFILE'] = tempHome;
  projectPath = mkdtempSync(join(tmpdir(), 'cds-vault-test-proj-'));
});

afterEach(() => {
  try {
    closeSessionsDB(projectPath);
  } catch {
    /* ignore */
  }
  if (originalHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = originalHome;
  delete process.env['USERPROFILE'];
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(projectPath, { recursive: true, force: true });
});

test('opens new DB at ~/vault/projects/{basename}/sessions.db with WAL mode', () => {
  const db: SessionsDB = openSessionsDB(projectPath);
  expect(existsSync(dbPath())).toBe(true);

  db.createSession({ project: 'test' });
  expect(existsSync(dbPath() + '-wal')).toBe(true);
  expect(existsSync(dbPath() + '-shm')).toBe(true);
});

test('schema contains sessions, observations, entities, relations, observations_fts, schema_version', () => {
  const db = openSessionsDB(projectPath);
  db.createSession({ project: 'test' });

  const raw = new Database(dbPath(), { readonly: true });
  try {
    const tables = raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type IN ('table','virtual') ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'sessions',
        'observations',
        'entities',
        'relations',
        'observations_fts',
        'schema_version',
      ]),
    );
  } finally {
    raw.close();
  }
});

test('createSession + appendObservation + searchObservations round-trip', () => {
  const db = openSessionsDB(projectPath);
  const s = db.createSession({
    project: 'proj',
    summary: 'init summary about foo bar baz',
  });
  const obs = db.appendObservation({
    sessionId: s.id,
    type: 'note',
    content: 'quick brown fox jumped over the lazy dog',
    entities: [],
  });

  const hits = db.searchObservations('fox');
  expect(hits.length).toBeGreaterThanOrEqual(1);
  expect(hits[0]!.observation.id).toBe(obs.id);
  expect(hits[0]!.sessionSummary).toContain('init summary');
});

test('upsertEntity is idempotent on name conflict', () => {
  const db = openSessionsDB(projectPath);
  const e1 = db.upsertEntity({ name: 'alice', type: 'person' });
  const e2 = db.upsertEntity({ name: 'alice', type: 'person' });
  expect(e1.id).toBe(e2.id);
});

// ---------------------------------------------------------------------------
// Phase 38 — upsertEntity normalization + display_name preservation (D-103/D-105)
// ---------------------------------------------------------------------------

test('Phase 38 — upsertEntity normalizes name to lowercase and preserves display_name on first insert', () => {
  const db = openSessionsDB(projectPath);
  const row = db.upsertEntity({ name: 'Claude Code', type: 'agent' });
  expect(row.name).toBe('claude code');
  expect(row.display_name).toBe('Claude Code');
});

test('Phase 38 — upsertEntity returns the same id on second call with different casing (first-seen display_name wins)', () => {
  const db = openSessionsDB(projectPath);
  const first = db.upsertEntity({ name: 'Claude Code', type: 'agent' });
  const second = db.upsertEntity({ name: 'CLAUDE CODE', type: 'agent' });
  expect(first.id).toBe(second.id);

  // display_name MUST remain the first-seen trimmed casing.
  const raw = new Database(dbPath(), { readonly: true });
  try {
    const stored = raw
      .prepare('SELECT name, display_name FROM entities WHERE id = ?')
      .get(first.id) as { name: string; display_name: string };
    expect(stored.name).toBe('claude code');
    expect(stored.display_name).toBe('Claude Code');
  } finally {
    raw.close();
  }
});

test('Phase 38 — upsertEntity trims leading/trailing whitespace before normalizing', () => {
  const db = openSessionsDB(projectPath);
  const row = db.upsertEntity({ name: '  Foo Bar  ', type: 'tool' });
  expect(row.name).toBe('foo bar');
  expect(row.display_name).toBe('Foo Bar');
});

test('Phase 38 — upsertEntity throws VaultError when name is empty or whitespace-only', () => {
  const db = openSessionsDB(projectPath);
  expect(() => db.upsertEntity({ name: '   ', type: 'agent' })).toThrow(
    /cannot be empty/,
  );
  expect(() => db.upsertEntity({ name: '', type: 'agent' })).toThrow(
    /cannot be empty/,
  );
});

test('Phase 38 — upsertEntity preserves Cyrillic display_name and lowercases name', () => {
  const db = openSessionsDB(projectPath);
  const row = db.upsertEntity({ name: 'Павел', type: 'person' });
  expect(row.name).toBe('павел');
  expect(row.display_name).toBe('Павел');
});

test('Phase 38 — upsertEntity COALESCE preserves existing non-null type on conflict', () => {
  const db = openSessionsDB(projectPath);
  // First upsert establishes type='agent'.
  const first = db.upsertEntity({ name: 'manual', type: 'agent' });
  // Second upsert with a different type must NOT overwrite the existing one
  // per the COALESCE path in the ON CONFLICT clause (D-105).
  const second = db.upsertEntity({ name: 'manual', type: 'person' });
  expect(second.id).toBe(first.id);

  const raw = new Database(dbPath(), { readonly: true });
  try {
    const stored = raw
      .prepare('SELECT type FROM entities WHERE id = ?')
      .get(first.id) as { type: string };
    expect(stored.type).toBe('agent');
  } finally {
    raw.close();
  }
});

test('appendObservation rejects non-integer entities', () => {
  const db = openSessionsDB(projectPath);
  const s = db.createSession({ project: 'proj' });
  expect(() =>
    db.appendObservation({
      sessionId: s.id,
      type: 'x',
      content: 'y',
      // deliberate: cast through unknown to bypass TS for the test assertion
      entities: [1, 'oops' as unknown as number],
    }),
  ).toThrow(VaultError);
});

test('module cache returns same handle for same projectPath', () => {
  const a = openSessionsDB(projectPath);
  const b = openSessionsDB(projectPath);
  expect(a).toBe(b);
});

test('closeSessionsDB clears cache and subsequent open returns new handle', () => {
  const a = openSessionsDB(projectPath);
  closeSessionsDB(projectPath);
  const b = openSessionsDB(projectPath);
  expect(a).not.toBe(b);
});

test('session summary update re-denormalizes FTS5 rows', () => {
  const db = openSessionsDB(projectPath);
  const s = db.createSession({ project: 'proj', summary: 'initial topic' });
  db.appendObservation({
    sessionId: s.id,
    type: 'note',
    content: 'detail about xyzzy',
  });

  // Verify initial state: searching 'initial' returns our row with the summary.
  const initialHits = db.searchObservations('initial');
  expect(initialHits.length).toBeGreaterThanOrEqual(1);
  expect(initialHits[0]!.sessionSummary).toContain('initial topic');

  // Mutate summary via a second write handle (sessions.ts does not expose a
  // summary-update helper in Phase 35 — Phase 36 will). Close the public
  // handle first so the UPDATE is visible on re-open.
  closeSessionsDB(projectPath);
  const raw = new Database(dbPath());
  try {
    raw
      .prepare('UPDATE sessions SET summary = ? WHERE id = ?')
      .run('revised topic', s.id);
  } finally {
    raw.close();
  }

  const db2 = openSessionsDB(projectPath);
  const revised = db2.searchObservations('revised');
  expect(revised.length).toBeGreaterThanOrEqual(1);
  expect(revised[0]!.sessionSummary).toContain('revised topic');

  const stale = db2.searchObservations('initial');
  expect(stale.length).toBe(0);
});

test('timeline returns anchor plus adjacent observations', () => {
  const db = openSessionsDB(projectPath);
  const s = db.createSession({ project: 'proj' });
  const ids: number[] = [];
  for (let i = 0; i < 7; i++) {
    const o = db.appendObservation({
      sessionId: s.id,
      type: 'note',
      content: `content ${i}`,
    });
    ids.push(o.id);
  }

  // Window size 2 around ids[3] => ids[1..5] = 5 observations.
  const window = db.timeline(ids[3]!, 2);
  expect(window.length).toBeGreaterThanOrEqual(5);
  for (const row of window) {
    expect(row.session_id).toBe(s.id);
  }
});

test('CANONICAL_ENTITY_TYPES is a readonly array of known strings', () => {
  expect(Array.isArray(CANONICAL_ENTITY_TYPES)).toBe(true);
  expect(CANONICAL_ENTITY_TYPES).toContain('person');
  expect(CANONICAL_ENTITY_TYPES).toContain('project');
  expect(CANONICAL_ENTITY_TYPES).toContain('decision');
});
