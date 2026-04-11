import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, '..', 'hooks');
const fixturesDir = join(__dirname, 'fixtures');

describe('hooks', () => {
  const hookFiles = ['session-start-context.sh', 'session-end-check.sh'];

  for (const file of hookFiles) {
    describe(file, () => {
      const hookPath = join(hooksDir, file);

      it('file exists', () => {
        assert.ok(existsSync(hookPath));
      });

      it('starts with shebang', () => {
        const content = readFileSync(hookPath, 'utf8');
        assert.ok(content.startsWith('#!/bin/bash'));
      });

      it('is valid bash syntax', () => {
        const result = execFileSync('bash', ['-n', hookPath], {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        // bash -n returns empty on success
      });

      it('uses VAULT_PATH env var with fallback', () => {
        const content = readFileSync(hookPath, 'utf8');
        assert.ok(content.includes('VAULT_PATH'), 'should reference VAULT_PATH');
        assert.ok(content.includes('$HOME/vault'), 'should have fallback to ~/vault');
      });
    });
  }

  describe('session-end-check.sh', () => {
    it('exits silently when no vault project exists', () => {
      const hookPath = join(hooksDir, 'session-end-check.sh');
      // Run with a non-existent vault path
      const result = execFileSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: '/nonexistent/vault/path', HOME: '/nonexistent' },
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: '/tmp',
      });
      assert.equal(result, '');
    });
  });

  // ── notebooklm-sync-trigger.mjs tests ──────────────────────────────────────
  describe('notebooklm-sync-trigger', () => {
    const triggerPath = join(hooksDir, 'notebooklm-sync-trigger.mjs');
    const stubDir = join(tmpdir(), `cds-trigger-stub-${process.pid}`);
    const stubBinPath = join(stubDir, 'notebooklm');
    let tmpVault;

    before(() => {
      tmpVault = join(tmpdir(), `cds-trigger-vault-${process.pid}`);
      mkdirSync(tmpVault, { recursive: true });
      mkdirSync(stubDir, { recursive: true });
      // Create a stub notebooklm binary
      writeFileSync(stubBinPath, '#!/bin/bash\nsleep 10\n');
      chmodSync(stubBinPath, 0o755);
    });

    after(() => {
      if (existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true });
      if (existsSync(stubDir)) rmSync(stubDir, { recursive: true, force: true });
    });

    it('trigger file exists', () => {
      assert.ok(existsSync(triggerPath), 'hooks/notebooklm-sync-trigger.mjs must exist');
    });

    it('exits 0 with notebooklm NOT in PATH (binary absent)', () => {
      const start = Date.now();
      const result = spawnSync(process.execPath, [triggerPath], {
        encoding: 'utf8',
        env: { ...process.env, PATH: '/nonexistent', VAULT_PATH: tmpVault },
      });
      const elapsed = Date.now() - start;
      assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
      assert.ok(elapsed < 1000, `must exit within 1000ms, took ${elapsed}ms`);
    });

    it('exits 0 with stub notebooklm in PATH, wall-clock < 1000ms (non-blocking)', () => {
      const start = Date.now();
      const result = spawnSync(process.execPath, [triggerPath], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, VAULT_PATH: tmpVault },
      });
      const elapsed = Date.now() - start;
      assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
      assert.ok(elapsed < 1000, `must exit within 1000ms even with slow stub runner, took ${elapsed}ms`);
    });

    it('exits 0 when VAULT_PATH does not exist (graceful skip)', () => {
      const result = spawnSync(process.execPath, [triggerPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: '/nonexistent/vault/path/that/does/not/exist' },
      });
      assert.equal(result.status, 0, `exit code must be 0, got ${result.status}`);
    });
  });

  describe('session-end-check.sh integration (updates context.md)', () => {
    const tmpBase = join(tmpdir(), `claude-test-hook-integration-${process.pid}`);
    const vaultPath = join(tmpBase, 'vault');
    const projectName = 'hook-demo';
    const projectDir = join(vaultPath, 'projects', projectName);
    const sessionsDir = join(projectDir, 'sessions');
    const contextPath = join(projectDir, 'context.md');

    before(() => {
      if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
      mkdirSync(sessionsDir, { recursive: true });

      // Seed context.md with a template-like layout
      writeFileSync(
        contextPath,
        '# Project: hook-demo\n\n## Overview\n\nTest.\n\n---\n*Last updated: 2026-04-10*\n'
      );

      // Seed a session log dated today so the hook takes the "session logged" branch
      const today = new Date().toISOString().slice(0, 10);
      const sessionFilename = `${today}-integration-run.md`;
      writeFileSync(
        join(sessionsDir, sessionFilename),
        `# Session: ${today} — Integration run\n\n## Notes\nrun via hook test\n`
      );

      // Create a fake project-map.json so the hook resolves the project name correctly
      writeFileSync(
        join(vaultPath, 'project-map.json'),
        JSON.stringify({ projects: { [projectDir]: projectName } })
      );
    });

    after(() => {
      if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true, force: true });
    });

    it('updates context.md with a Session History entry linking today\'s log', () => {
      const hookPath = join(hooksDir, 'session-end-check.sh');

      // Run the hook with our fixture vault and project dir as cwd
      execFileSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: vaultPath, HOME: tmpBase },
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Assert context.md was mutated: both markers present, one linked entry
      const updated = readFileSync(contextPath, 'utf8');
      assert.ok(
        updated.includes('<!-- @claude-dev-stack:session-history:start -->'),
        'start marker must be present after hook run'
      );
      assert.ok(
        updated.includes('<!-- @claude-dev-stack:session-history:end -->'),
        'end marker must be present after hook run'
      );

      const today = new Date().toISOString().slice(0, 10);
      const expectedLink = `(sessions/${today}-integration-run.md)`;
      assert.ok(
        updated.includes(expectedLink),
        `context.md must link to the session log: expected substring "${expectedLink}"`
      );
      assert.ok(
        updated.includes(`${today} — Integration run`),
        'context.md entry must carry the title extracted from the session log heading'
      );
    });

    it('is silent on stdout (hook produces no output on success)', () => {
      const hookPath = join(hooksDir, 'session-end-check.sh');
      const result = execFileSync('bash', [hookPath], {
        encoding: 'utf8',
        env: { ...process.env, VAULT_PATH: vaultPath, HOME: tmpBase },
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // On the "session logged" branch the hook prints nothing to stdout
      assert.equal(result, '');
    });
  });
});
