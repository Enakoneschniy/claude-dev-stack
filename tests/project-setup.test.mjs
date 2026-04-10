import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { setupAllProjects } from '../lib/project-setup.mjs';

describe('setupAllProjects', () => {
  const tmpBase = join(tmpdir(), `claude-test-setup-${process.pid}`);
  const vaultPath = join(tmpBase, 'vault');
  const existingProject = join(tmpBase, 'real-project');
  const missingProject = join(tmpBase, 'ghost-project');

  before(() => {
    // Fresh sandbox
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    mkdirSync(vaultPath, { recursive: true });
    mkdirSync(existingProject, { recursive: true });
    // Note: missingProject is intentionally NOT created — that's the whole point

    const map = {
      projects: {
        [existingProject]: 'real-project',
        [missingProject]: 'ghost-project',
      },
    };
    writeFileSync(join(vaultPath, 'project-map.json'), JSON.stringify(map, null, 2));
  });

  after(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
  });

  it('returns missing array for entries with non-existent directories', () => {
    const result = setupAllProjects(vaultPath);

    // Shape check — all three fields must exist
    assert.ok(Array.isArray(result.results));
    assert.ok(Array.isArray(result.missing));
    assert.equal(typeof result.projects, 'number');

    // Exactly one existing project processed
    assert.equal(result.projects, 1);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].project, 'real-project');
    assert.equal(result.results[0].path, existingProject);

    // Exactly one missing project reported
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].project, 'ghost-project');
    assert.equal(result.missing[0].path, missingProject);
  });

  it('returns empty missing array when all projects exist', () => {
    // Smoke test: write a map with only the existing project
    const cleanMap = { projects: { [existingProject]: 'real-project' } };
    writeFileSync(join(vaultPath, 'project-map.json'), JSON.stringify(cleanMap));

    const result = setupAllProjects(vaultPath);
    assert.ok(Array.isArray(result.missing));
    assert.equal(result.missing.length, 0);
  });
});
