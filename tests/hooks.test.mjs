import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
});
