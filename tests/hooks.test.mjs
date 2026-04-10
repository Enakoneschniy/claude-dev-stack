import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(__dirname, '..', 'hooks');

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
