import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

import { makeTempVault, makeTempGitRepo, makeTempMonorepo, withStubBinary } from './fixtures.mjs';

describe('makeTempVault', () => {
  it('creates dir with meta/ and projects/ subdirectories', () => {
    const { dir, cleanup } = makeTempVault();
    assert.ok(existsSync(dir), 'temp dir should exist');
    assert.ok(existsSync(dir + '/meta'), 'meta/ should exist');
    assert.ok(existsSync(dir + '/projects'), 'projects/ should exist');
    cleanup();
  });

  it('cleanup removes the directory entirely', () => {
    const { dir, cleanup } = makeTempVault();
    assert.ok(existsSync(dir));
    cleanup();
    assert.ok(!existsSync(dir), 'dir should be removed after cleanup');
  });
});

describe('makeTempGitRepo', () => {
  it('creates dir with .git/ and at least one commit', () => {
    const { dir, cleanup } = makeTempGitRepo();
    assert.ok(existsSync(dir + '/.git'), '.git/ should exist');
    const log = execSync('git log --oneline', { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
    assert.ok(log.trim().length > 0, 'should have at least one commit');
    cleanup();
  });

  it('works without global git config (CI-safe via GIT_AUTHOR_NAME env)', () => {
    const { dir, cleanup } = makeTempGitRepo();
    assert.ok(existsSync(dir + '/.git'));
    cleanup();
  });

  it('cleanup removes the directory', () => {
    const { dir, cleanup } = makeTempGitRepo();
    assert.ok(existsSync(dir));
    cleanup();
    assert.ok(!existsSync(dir), 'dir should be removed after cleanup');
  });
});

describe('makeTempMonorepo', () => {
  it('pnpm-workspace creates pnpm-workspace.yaml and apps/ dirs', () => {
    const { dir, cleanup } = makeTempMonorepo('pnpm-workspace');
    assert.ok(existsSync(dir + '/pnpm-workspace.yaml'));
    assert.ok(existsSync(dir + '/apps/web'));
    assert.ok(existsSync(dir + '/apps/api'));
    assert.ok(existsSync(dir + '/packages/ui'));
    cleanup();
  });

  it('npm-workspaces creates package.json with workspaces field and dirs', () => {
    const { dir, cleanup } = makeTempMonorepo('npm-workspaces');
    assert.ok(existsSync(dir + '/package.json'));
    const pkg = JSON.parse(readFileSync(dir + '/package.json', 'utf8'));
    assert.ok(Array.isArray(pkg.workspaces), 'should have workspaces array');
    assert.ok(existsSync(dir + '/apps/web'));
    assert.ok(existsSync(dir + '/packages/core'));
    cleanup();
  });

  it('cargo-workspace creates Cargo.toml with [workspace] and crates/ dir', () => {
    const { dir, cleanup } = makeTempMonorepo('cargo-workspace');
    assert.ok(existsSync(dir + '/Cargo.toml'));
    const content = readFileSync(dir + '/Cargo.toml', 'utf8');
    assert.ok(content.includes('[workspace]'));
    assert.ok(existsSync(dir + '/crates/core'));
    cleanup();
  });

  it('single-package creates dir with no sentinel files', () => {
    const { dir, cleanup } = makeTempMonorepo('single-package');
    assert.ok(existsSync(dir));
    assert.ok(!existsSync(dir + '/pnpm-workspace.yaml'));
    assert.ok(!existsSync(dir + '/package.json'));
    assert.ok(!existsSync(dir + '/Cargo.toml'));
    cleanup();
  });
});

describe('withStubBinary', () => {
  it('makes which mycmd resolve inside fn', () => {
    withStubBinary('mycmd', 'echo hello', (_stubDir) => {
      const result = execSync('which mycmd', { stdio: 'pipe', encoding: 'utf8' }).trim();
      assert.ok(result.includes('mycmd'), 'mycmd should be on PATH');
    });
  });

  it('restores original PATH after fn completes', () => {
    const before = process.env.PATH;
    withStubBinary('testcmd', 'echo test', () => {});
    assert.equal(process.env.PATH, before, 'PATH should be restored');
  });

  it('restores PATH even if fn throws', () => {
    const before = process.env.PATH;
    try {
      withStubBinary('failcmd', 'echo fail', () => { throw new Error('intentional'); });
    } catch { /* expected */ }
    assert.equal(process.env.PATH, before, 'PATH should be restored after throw');
  });

  it('cleans up stub directory in /tmp', () => {
    let capturedStubDir;
    withStubBinary('cleancmd', 'echo clean', (d) => { capturedStubDir = d; });
    assert.ok(!existsSync(capturedStubDir), 'stub dir should be removed after withStubBinary');
  });
});
