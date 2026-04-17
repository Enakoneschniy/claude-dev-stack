// Integration tests for getEntityGraph() — entity relationship graph primitive.
//
// Isolation: HOME redirect pattern (same as sessions.test.ts) so
// getEntityGraph() resolves under a temp vault directory.

import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSessionsDB, closeSessionsDB } from './sessions.js';
import { getEntityGraph } from './graph.js';

let originalHome: string | undefined;
let tempHome: string;
let projectPath: string;

beforeEach(() => {
  originalHome = process.env['HOME'];
  tempHome = mkdtempSync(join(tmpdir(), 'cds-graph-test-home-'));
  process.env['HOME'] = tempHome;
  process.env['USERPROFILE'] = tempHome;
  projectPath = mkdtempSync(join(tmpdir(), 'cds-graph-test-proj-'));
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

test('getEntityGraph returns empty arrays when no entities exist', () => {
  // Open DB to create schema, then close before graph reads
  const db = openSessionsDB(projectPath);
  db.createSession({ project: 'test' });
  closeSessionsDB(projectPath);

  const graph = getEntityGraph(projectPath);
  expect(graph.nodes).toEqual([]);
  expect(graph.edges).toEqual([]);
});

test('getEntityGraph returns nodes from entities table', () => {
  const db = openSessionsDB(projectPath);
  db.upsertEntity({ name: 'react', type: 'project' });
  db.upsertEntity({ name: 'vitest', type: 'project' });
  closeSessionsDB(projectPath);

  const graph = getEntityGraph(projectPath);
  expect(graph.nodes).toHaveLength(2);
  expect(graph.nodes[0].name).toBe('react');
  expect(graph.nodes[0].type).toBe('project');
  expect(graph.nodes[1].name).toBe('vitest');
});

test('getEntityGraph returns edges with frequency-based weight', () => {
  const db = openSessionsDB(projectPath);
  const e1 = db.upsertEntity({ name: 'react', type: 'project' });
  const e2 = db.upsertEntity({ name: 'vitest', type: 'tool' });
  const s1 = db.createSession({ project: 'test', summary: 'session 1' });
  const s2 = db.createSession({ project: 'test', summary: 'session 2' });
  db.linkRelation({
    fromEntity: e1.id,
    toEntity: e2.id,
    relationType: 'uses',
    sessionId: s1.id,
  });
  db.linkRelation({
    fromEntity: e1.id,
    toEntity: e2.id,
    relationType: 'uses',
    sessionId: s2.id,
  });
  closeSessionsDB(projectPath);

  const graph = getEntityGraph(projectPath);
  expect(graph.edges).toHaveLength(1);
  expect(graph.edges[0].weight).toBe(2);
});

test('getEntityGraph returns edges with correct relationType', () => {
  const db = openSessionsDB(projectPath);
  const e1 = db.upsertEntity({ name: 'app', type: 'project' });
  const e2 = db.upsertEntity({ name: 'database', type: 'component' });
  const s = db.createSession({ project: 'test' });
  db.linkRelation({
    fromEntity: e1.id,
    toEntity: e2.id,
    relationType: 'depends-on',
    sessionId: s.id,
  });
  closeSessionsDB(projectPath);

  const graph = getEntityGraph(projectPath);
  expect(graph.edges).toHaveLength(1);
  expect(graph.edges[0].relationType).toBe('depends-on');
  expect(graph.edges[0].from).toBe(e1.id);
  expect(graph.edges[0].to).toBe(e2.id);
});

test('getEntityGraph maps display_name to displayName', () => {
  const db = openSessionsDB(projectPath);
  // upsertEntity normalizes name but preserves display_name as first-seen casing
  const entity = db.upsertEntity({ name: 'React', type: 'project' });
  closeSessionsDB(projectPath);

  const graph = getEntityGraph(projectPath);
  expect(graph.nodes).toHaveLength(1);
  // display_name is set to the original casing by upsertEntity
  expect(graph.nodes[0].displayName).toBe(entity.display_name);
});
