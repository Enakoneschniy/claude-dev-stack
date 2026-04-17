// Phase 45 — tests for memory.graph MCP tool (MEM-05).

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSessionsDB, closeSessionsDB } from '@cds/core';

import { memoryGraph } from './memory-graph.js';
import { InvalidFilterError } from './shared.js';

const PROJECT_NAME = 'test-proj';

describe('memory.graph', () => {
  let originalHome: string | undefined;
  let tempHome: string;
  /** The path openSessionsDB resolves to (~/vault/projects/test-proj) */
  let projectPath: string;

  beforeEach(() => {
    originalHome = process.env['HOME'];
    tempHome = mkdtempSync(join(tmpdir(), 'cds-memgraph-test-home-'));
    process.env['HOME'] = tempHome;
    process.env['USERPROFILE'] = tempHome;

    // Create the vault project directory that getEntityGraph will discover
    projectPath = join(tempHome, 'vault', 'projects', PROJECT_NAME);
    mkdirSync(projectPath, { recursive: true });
  });

  afterEach(() => {
    try {
      closeSessionsDB(PROJECT_NAME);
    } catch {
      /* ignore */
    }
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    delete process.env['USERPROFILE'];
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('returns empty graph when no entities exist', async () => {
    // openSessionsDB creates the DB with full schema at the vault path
    const db = openSessionsDB(PROJECT_NAME);
    db.createSession({ project: PROJECT_NAME });
    closeSessionsDB(PROJECT_NAME);

    const result = await memoryGraph({ project: PROJECT_NAME });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.node_count).toBe(0);
    expect(result.edge_count).toBe(0);
  });

  it('returns nodes and edges for seeded data', async () => {
    const db = openSessionsDB(PROJECT_NAME);
    const e1 = db.upsertEntity({ name: 'react', type: 'project' });
    const e2 = db.upsertEntity({ name: 'vitest', type: 'tool' });
    const s = db.createSession({ project: PROJECT_NAME });
    db.linkRelation({
      fromEntity: e1.id,
      toEntity: e2.id,
      relationType: 'uses',
      sessionId: s.id,
    });
    closeSessionsDB(PROJECT_NAME);

    const result = await memoryGraph({ project: PROJECT_NAME });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].name).toBe('react');
    expect(result.nodes[0].type).toBe('project');
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].relationType).toBe('uses');
    expect(result.edges[0].weight).toBe(1);
  });

  it('path traversal blocked — parent dir reference', async () => {
    await expect(memoryGraph({ project: '../..' })).rejects.toThrow(InvalidFilterError);
  });

  it('path traversal blocked — dot prefix', async () => {
    await expect(memoryGraph({ project: '.hidden' })).rejects.toThrow(InvalidFilterError);
  });

  it('includes node_count and edge_count', async () => {
    const db = openSessionsDB(PROJECT_NAME);
    const e1 = db.upsertEntity({ name: 'a', type: 'project' });
    const e2 = db.upsertEntity({ name: 'b', type: 'tool' });
    const e3 = db.upsertEntity({ name: 'c', type: 'component' });
    const s = db.createSession({ project: PROJECT_NAME });
    db.linkRelation({ fromEntity: e1.id, toEntity: e2.id, relationType: 'uses', sessionId: s.id });
    db.linkRelation({ fromEntity: e2.id, toEntity: e3.id, relationType: 'depends-on', sessionId: s.id });
    closeSessionsDB(PROJECT_NAME);

    const result = await memoryGraph({ project: PROJECT_NAME });
    expect(result.node_count).toBe(3);
    expect(result.edge_count).toBe(2);
  });
});
