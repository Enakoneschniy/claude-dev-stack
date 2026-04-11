import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { setupAllProjects, updateProjectClaudeMd } from '../lib/project-setup.mjs';

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

// ── TEST-02: notebooklm status on fresh vault (smoke) ───────────────────────
// Requirement: NBLM-20 + TEST-02 — `claude-dev-stack notebooklm status` exits 0
// on a fresh vault with no manifest and prints "Last sync: never" (or equivalent).
// Critical: VAULT_PATH override ensures the test never touches the real user vault.

const __filename = fileURLToPath(import.meta.url);
const __dirname_test = dirname(__filename);

describe('TEST-02: notebooklm status on fresh vault (smoke)', () => {
  let freshVault;

  before(() => {
    freshVault = mkdtempSync(join(tmpdir(), 'nb-status-fresh-'));
    mkdirSync(join(freshVault, 'projects'), { recursive: true });
    mkdirSync(join(freshVault, 'meta'), { recursive: true });
  });

  after(() => {
    try { rmSync(freshVault, { recursive: true, force: true }); } catch {}
  });

  it('notebooklm status on fresh vault exits 0 with "no sync yet" message', () => {
    const cliPath = join(__dirname_test, '..', 'bin', 'cli.mjs');
    const result = execFileSync(process.execPath, [cliPath, 'notebooklm', 'status'], {
      env: { ...process.env, VAULT_PATH: freshVault },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    // execFileSync throws on non-zero exit — reaching here means exit 0
    assert.match(result, /Last sync: never|no sync yet|Files tracked: 0/);
  });

  it('notebooklm status on fresh vault does not create manifest file (read-only)', () => {
    const manifestPath = join(freshVault, '.notebooklm-sync.json');
    assert.equal(existsSync(manifestPath), false, 'runStatus must not create a manifest file');
  });
});

// ── 260411-u3g: CLAUDE.md template Output Style Override section ───────────

describe('updateProjectClaudeMd — Output Style Override section (260411-u3g)', () => {
  const tmpProj = join(tmpdir(), `claude-test-csmd-${process.pid}-${Date.now()}`);

  before(() => {
    if (existsSync(tmpProj)) rmSync(tmpProj, { recursive: true, force: true });
    mkdirSync(tmpProj, { recursive: true });
  });

  after(() => {
    if (existsSync(tmpProj)) rmSync(tmpProj, { recursive: true, force: true });
  });

  it('emits the Output Style Override section into a fresh CLAUDE.md', () => {
    const status = updateProjectClaudeMd(tmpProj);
    assert.equal(status, 'created');

    const content = readFileSync(join(tmpProj, 'CLAUDE.md'), 'utf8');
    assert.match(content, /## Output Style Override/);
    assert.match(content, /IGNORE THEM/);
    assert.match(content, /TODO\(human\)/);
    assert.match(content, /learning-output-style@claude-plugins-official/);
    assert.match(content, /explanatory-output-style@claude-plugins-official/);
  });

  it('keeps the Output Style Override section after idempotent re-update', () => {
    const status = updateProjectClaudeMd(tmpProj);
    assert.equal(status, 'unchanged');

    const content = readFileSync(join(tmpProj, 'CLAUDE.md'), 'utf8');
    assert.match(content, /## Output Style Override/);
    // Section must appear exactly once, not duplicated by re-runs.
    const matches = content.match(/## Output Style Override/g) ?? [];
    assert.equal(matches.length, 1);
  });
});
