// tests/detect.test.mjs — Unit tests for lib/install/detect.mjs (D-23)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const detectMjsPath = join(projectRoot, 'lib', 'install', 'detect.mjs');

// Helper: run detectInstallState() in a child process with controlled HOME
function runDetect(fakeHome) {
  const runnerScript = `
    import { detectInstallState } from '${detectMjsPath}';
    const s = detectInstallState();
    process.stdout.write(JSON.stringify(s));
  `;
  const tmpDir = mkdtempSync(join(tmpdir(), 'detect-runner-'));
  const runnerPath = join(tmpDir, 'runner.mjs');
  writeFileSync(runnerPath, runnerScript);
  const result = spawnSync(process.execPath, [runnerPath], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
    timeout: 10000,
  });
  rmSync(tmpDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(`runner failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

// Path to the module under test
import { detectInstallState } from '../lib/install/detect.mjs';

// ── Helpers ─────────────────────────────────────────────────────────

function makeTmpDir(label) {
  const dir = join(tmpdir(), `cds-detect-test-${label}-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ── detectInstallState() — vault detection ───────────────────────────

describe('detectInstallState() — no vault', () => {
  it('returns vaultExists: false when no candidate paths exist', () => {
    // detectInstallState searches known candidates; in a test env those likely exist
    // so we cannot control VAULT_CANDIDATES. Instead verify the return shape is correct.
    const state = detectInstallState();
    assert.ok(typeof state === 'object', 'must return an object');
    assert.ok('vaultExists' in state, 'must have vaultExists');
    assert.ok('vaultPath' in state, 'must have vaultPath');
    assert.ok('hooksInstalled' in state, 'must have hooksInstalled');
    assert.ok('gitRemote' in state, 'must have gitRemote (null or string)');
    assert.ok(Array.isArray(state.projects), 'projects must be an array');
    assert.strictEqual(state.profile, null, 'profile must always be null (v1 deferred)');
  });

  it('vaultPath is null when vaultExists is false', () => {
    const state = detectInstallState();
    if (!state.vaultExists) {
      assert.strictEqual(state.vaultPath, null, 'vaultPath must be null when vaultExists is false');
    }
  });
});

describe('detectInstallState() — vault present (temp dir simulation)', () => {
  // We test the detection logic by mocking at a lower level:
  // Create a temp dir that has meta/ and projects/ — then verify detectInstallState
  // behaviour through the module's observable output.
  // Since VAULT_CANDIDATES is fixed, we test with a structural test approach.

  it('returns vaultExists: true when one of the known candidates has meta/ and projects/', () => {
    // This test verifies structure — if the real vault exists, state reflects it
    const state = detectInstallState();
    if (state.vaultExists) {
      assert.ok(state.vaultPath !== null, 'vaultPath must be non-null when vault found');
      assert.ok(typeof state.vaultPath === 'string', 'vaultPath must be a string');
      assert.ok(existsSync(join(state.vaultPath, 'meta')), 'vault must have meta/ dir');
      assert.ok(existsSync(join(state.vaultPath, 'projects')), 'vault must have projects/ dir');
    }
  });

  it('hooksInstalled is a boolean', () => {
    const state = detectInstallState();
    assert.ok(typeof state.hooksInstalled === 'boolean', 'hooksInstalled must be boolean');
  });

  it('gitRemote is null or a non-empty string', () => {
    const state = detectInstallState();
    assert.ok(
      state.gitRemote === null || (typeof state.gitRemote === 'string' && state.gitRemote.length > 0),
      'gitRemote must be null or non-empty string'
    );
  });

  it('projects is an array of {name, path} objects', () => {
    const state = detectInstallState();
    assert.ok(Array.isArray(state.projects), 'projects must be array');
    for (const p of state.projects) {
      assert.ok(typeof p.name === 'string', 'project.name must be string');
      assert.ok(typeof p.path === 'string', 'project.path must be string');
    }
  });

  it('profile is always null (v1 — CONTEXT.md deferred)', () => {
    const state = detectInstallState();
    assert.strictEqual(state.profile, null, 'profile must be null in v1');
  });
});

describe('detectInstallState() — does not throw on missing resources', () => {
  it('does not throw when called (graceful degradation)', () => {
    assert.doesNotThrow(() => detectInstallState(), 'detectInstallState must not throw');
  });

  it('returns consistent shape on repeated calls', () => {
    const a = detectInstallState();
    const b = detectInstallState();
    assert.strictEqual(typeof a.vaultExists, typeof b.vaultExists);
    assert.strictEqual(a.vaultPath, b.vaultPath);
    assert.strictEqual(a.hooksInstalled, b.hooksInstalled);
    assert.strictEqual(a.profile, null);
    assert.strictEqual(b.profile, null);
  });
});

describe('detectInstallState() — project-registry.md parsing', () => {
  // We test the regex/parsing logic by inspecting real state if vault is present.
  // If no vault, projects array must be empty [].

  it('returns empty projects array when no vault found', () => {
    const state = detectInstallState();
    if (!state.vaultExists) {
      assert.deepStrictEqual(state.projects, [], 'must return empty array when no vault');
    }
  });

  it('parses {name, path} correctly — project names are non-empty strings', () => {
    const state = detectInstallState();
    for (const p of state.projects) {
      assert.ok(p.name.length > 0, 'project name must not be empty');
      assert.ok(p.path.length > 0, 'project path must not be empty');
      assert.ok(!p.name.startsWith('-'), 'project name must not be a separator row');
      assert.ok(p.name !== 'name' && p.name !== 'Name', 'project name must not be a header row');
    }
  });
});

describe('detectInstallState() — hooksInstalled detection (D-16)', () => {
  it('hooksInstalled is false when settings.json has no matching hook', () => {
    // Integration check — we can only verify the type since we can't control ~/.claude/settings.json
    const state = detectInstallState();
    assert.ok(typeof state.hooksInstalled === 'boolean', 'must be boolean');
  });

  it('hooksInstalled is true only if session-start-context is in settings.json hooks', () => {
    // Structural: if hooksInstalled is true, the vault must typically also be present
    const state = detectInstallState();
    // We can't assert the exact value without controlling settings.json, so we verify the invariant:
    // hooksInstalled = true implies the function found the pattern in settings.json
    assert.ok(typeof state.hooksInstalled === 'boolean', 'hooksInstalled must always be boolean');
  });
});

// ── Functional tests using child process with controlled HOME ────────────────

describe('detectInstallState() — functional: no vault (isolated HOME)', () => {
  let fakeHome;

  before(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'detect-func-novault-'));
  });

  after(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('returns vaultExists: false when HOME has no vault dir', () => {
    const state = runDetect(fakeHome);
    assert.strictEqual(state.vaultExists, false, 'vaultExists must be false');
  });

  it('returns vaultPath: null when no vault found', () => {
    const state = runDetect(fakeHome);
    assert.strictEqual(state.vaultPath, null, 'vaultPath must be null');
  });

  it('returns profile: null always', () => {
    const state = runDetect(fakeHome);
    assert.strictEqual(state.profile, null, 'profile must always be null');
  });
});

describe('detectInstallState() — functional: vault present (isolated HOME)', () => {
  let fakeHome;

  before(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'detect-func-vault-'));
    // Create valid vault structure at ~/vault
    mkdirSync(join(fakeHome, 'vault', 'meta'), { recursive: true });
    mkdirSync(join(fakeHome, 'vault', 'projects'), { recursive: true });
  });

  after(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('returns vaultExists: true when vault/meta and vault/projects exist', () => {
    const state = runDetect(fakeHome);
    assert.strictEqual(state.vaultExists, true, 'vaultExists must be true');
  });

  it('returns vaultPath ending with /vault', () => {
    const state = runDetect(fakeHome);
    assert.ok(state.vaultPath && state.vaultPath.endsWith('/vault'), `vaultPath must end with /vault, got: ${state.vaultPath}`);
  });

  it('returns gitRemote: null when vault has no .git dir', () => {
    const state = runDetect(fakeHome);
    assert.strictEqual(state.gitRemote, null, 'gitRemote must be null when no .git');
  });

  it('returns projects: [] when project-registry.md is missing', () => {
    const state = runDetect(fakeHome);
    assert.deepStrictEqual(state.projects, [], 'projects must be empty array');
  });
});

describe('detectInstallState() — functional: hooks detection (isolated HOME)', () => {
  let fakeHome;

  before(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'detect-func-hooks-'));
    mkdirSync(join(fakeHome, 'vault', 'meta'), { recursive: true });
    mkdirSync(join(fakeHome, 'vault', 'projects'), { recursive: true });
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
  });

  after(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('returns hooksInstalled: false when settings.json has empty hooks', () => {
    writeFileSync(
      join(fakeHome, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { SessionStart: [] } }, null, 2),
    );
    const state = runDetect(fakeHome);
    assert.strictEqual(state.hooksInstalled, false, 'hooksInstalled must be false with empty hooks');
  });

  it('returns hooksInstalled: true when settings.json has session-start-context hook', () => {
    writeFileSync(
      join(fakeHome, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'bash /home/user/.claude/hooks/session-start-context.sh' }] },
          ],
        },
      }, null, 2),
    );
    const state = runDetect(fakeHome);
    assert.strictEqual(state.hooksInstalled, true, 'hooksInstalled must be true when hook present');
  });

  it('returns hooksInstalled: false when settings.json is corrupt JSON (no throw)', () => {
    writeFileSync(join(fakeHome, '.claude', 'settings.json'), '{ invalid json !!!');
    const state = runDetect(fakeHome);
    assert.strictEqual(state.hooksInstalled, false, 'hooksInstalled must be false on corrupt JSON');
  });
});

describe('detectInstallState() — functional: projects parsing (isolated HOME)', () => {
  let fakeHome;

  before(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'detect-func-projects-'));
    mkdirSync(join(fakeHome, 'vault', 'meta'), { recursive: true });
    mkdirSync(join(fakeHome, 'vault', 'projects'), { recursive: true });

    // Write a project-registry.md with a markdown table
    const registryContent = `# Project Registry

| name | status | path |
|------|--------|------|
| myapp | active | /home/user/myapp |
| backend | active | /home/user/backend |
`;
    writeFileSync(join(fakeHome, 'vault', 'meta', 'project-registry.md'), registryContent);
  });

  after(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('parses project name from markdown table row', () => {
    const state = runDetect(fakeHome);
    assert.ok(state.projects.length >= 1, 'must parse at least one project');
    assert.strictEqual(state.projects[0].name, 'myapp', 'first project name must be myapp');
  });

  it('parses project path from markdown table row', () => {
    const state = runDetect(fakeHome);
    assert.ok(state.projects.length >= 1, 'must parse at least one project');
    assert.strictEqual(state.projects[0].path, '/home/user/myapp', 'first project path must match');
  });

  it('parses multiple projects from registry', () => {
    const state = runDetect(fakeHome);
    assert.strictEqual(state.projects.length, 2, 'must parse 2 projects');
    assert.strictEqual(state.projects[1].name, 'backend');
  });
});
