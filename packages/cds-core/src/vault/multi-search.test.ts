// Integration tests for searchAllProjects() — cross-project FTS5 search.
//
// Isolation: VAULT_PATH env override (searchAllProjects checks VAULT_PATH
// before falling back to ~/vault). HOME redirect is also used because
// openSessionsDB resolves under homedir().

import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSessionsDB, closeSessionsDB } from './sessions.js';
import { searchAllProjects } from './multi-search.js';

let originalHome: string | undefined;
let originalVaultPath: string | undefined;
let tempHome: string;
let tempVaultRoot: string;

beforeEach(() => {
  // Redirect HOME so openSessionsDB resolves under temp dir
  originalHome = process.env['HOME'];
  tempHome = mkdtempSync(join(tmpdir(), 'cds-msearch-test-home-'));
  process.env['HOME'] = tempHome;
  process.env['USERPROFILE'] = tempHome;

  // Set VAULT_PATH to same location so searchAllProjects finds the DBs
  originalVaultPath = process.env['VAULT_PATH'];
  tempVaultRoot = join(tempHome, 'vault');
  mkdirSync(join(tempVaultRoot, 'projects'), { recursive: true });
  process.env['VAULT_PATH'] = tempVaultRoot;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env['HOME'];
  else process.env['HOME'] = originalHome;
  delete process.env['USERPROFILE'];

  if (originalVaultPath === undefined) delete process.env['VAULT_PATH'];
  else process.env['VAULT_PATH'] = originalVaultPath;

  rmSync(tempHome, { recursive: true, force: true });
});

/**
 * Seed a project with observations for testing.
 * Creates the project directory under vault/projects/ and seeds observations.
 */
function seedProject(
  vaultRoot: string,
  projectName: string,
  observations: string[],
): void {
  const projectDir = join(vaultRoot, 'projects', projectName);
  mkdirSync(projectDir, { recursive: true });

  const db = openSessionsDB(projectDir);
  const session = db.createSession({ project: projectName, summary: `${projectName} session` });
  for (const content of observations) {
    db.appendObservation({ sessionId: session.id, type: 'note', content });
  }
  closeSessionsDB(projectDir);
}

test('searchAllProjects returns empty array when no project DBs exist', () => {
  const results = searchAllProjects('anything');
  expect(results).toEqual([]);
});

test('searchAllProjects finds hits across 2 projects', () => {
  seedProject(tempVaultRoot, 'project-a', ['typescript compiler optimization techniques']);
  seedProject(tempVaultRoot, 'project-b', ['typescript runtime performance improvements']);

  const results = searchAllProjects('typescript');
  expect(results.length).toBeGreaterThanOrEqual(2);

  const projects = results.map((r) => r.project);
  expect(projects).toContain('project-a');
  expect(projects).toContain('project-b');
});

test('searchAllProjects returns results sorted by BM25 rank', () => {
  seedProject(tempVaultRoot, 'proj-x', ['the quick brown fox typescript']);
  seedProject(tempVaultRoot, 'proj-y', ['typescript typescript typescript patterns']);

  const results = searchAllProjects('typescript');
  expect(results.length).toBeGreaterThanOrEqual(2);

  // BM25 ranks should be in ascending order (lower = better match)
  for (let i = 1; i < results.length; i++) {
    expect(results[i].rank).toBeGreaterThanOrEqual(results[i - 1].rank);
  }
});

test('searchAllProjects respects limit option', () => {
  seedProject(tempVaultRoot, 'limit-a', [
    'database query optimization for production',
    'database indexing strategies detailed',
    'database migration best practices',
  ]);
  seedProject(tempVaultRoot, 'limit-b', [
    'database connection pooling patterns',
    'database replication setup guide',
  ]);

  const results = searchAllProjects('database', { limit: 3 });
  expect(results.length).toBeLessThanOrEqual(3);
});

test('searchAllProjects batches correctly with >9 project DBs', () => {
  // Create 11 projects — this requires at least 2 ATTACH batches
  for (let i = 0; i < 11; i++) {
    const name = `batch-project-${String(i).padStart(2, '0')}`;
    seedProject(tempVaultRoot, name, [`batchtest unique content from project ${i}`]);
  }

  const results = searchAllProjects('batchtest');

  // Should find hits from all 11 projects
  const uniqueProjects = new Set(results.map((r) => r.project));
  expect(uniqueProjects.size).toBe(11);
});

test('searchAllProjects uses VAULT_PATH env var', () => {
  // VAULT_PATH is already set to tempVaultRoot in beforeEach
  seedProject(tempVaultRoot, 'env-test', ['environment variable test content']);

  // Call without explicit vaultPath — should use VAULT_PATH env
  const results = searchAllProjects('environment');
  expect(results.length).toBeGreaterThanOrEqual(1);
  expect(results[0].project).toBe('env-test');
});

test('searchAllProjects closes all DB connections (no FD leak)', () => {
  seedProject(tempVaultRoot, 'fd-test-a', ['file descriptor leak test alpha']);
  seedProject(tempVaultRoot, 'fd-test-b', ['file descriptor leak test beta']);

  searchAllProjects('descriptor');

  // If connections were left open, rmSync would fail with EBUSY on some OSes.
  // We verify the vault dir can be fully deleted without errors.
  expect(() => {
    rmSync(tempVaultRoot, { recursive: true, force: true });
  }).not.toThrow();

  // Recreate for afterEach cleanup
  mkdirSync(join(tempVaultRoot, 'projects'), { recursive: true });
});
