import { describe, it, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { c, ok, fail, warn, info, runCmd, hasCommand, mkdirp, listDirs, SKILLS_DIR, AGENTS_DIR, CLAUDE_DIR, atomicWriteJson } from '../lib/shared.mjs';

describe('shared utilities', () => {
  describe('colors', () => {
    it('has all required color codes', () => {
      assert.ok(c.reset);
      assert.ok(c.bold);
      assert.ok(c.dim);
      assert.ok(c.red);
      assert.ok(c.green);
      assert.ok(c.yellow);
      assert.ok(c.blue);
      assert.ok(c.cyan);
      assert.ok(c.magenta);
      assert.ok(c.white);
    });
  });

  describe('runCmd', () => {
    it('runs a simple command and returns output', () => {
      const result = runCmd('echo hello');
      assert.equal(result, 'hello');
    });

    it('returns null on failure', () => {
      const result = runCmd('command_that_does_not_exist_12345');
      assert.equal(result, null);
    });

    it('trims output', () => {
      const result = runCmd('echo "  spaces  "');
      assert.equal(result, 'spaces');
    });
  });

  describe('hasCommand', () => {
    it('finds node', () => {
      assert.equal(hasCommand('node'), true);
    });

    it('finds git', () => {
      assert.equal(hasCommand('git'), true);
    });

    it('returns false for nonexistent command', () => {
      assert.equal(hasCommand('nonexistent_cmd_xyz'), false);
    });

    it('returns false for name with shell metacharacters (no shell injection)', () => {
      // Shell metacharacters must not be interpreted as shell commands
      assert.equal(hasCommand('node; echo injected'), false);
      assert.equal(hasCommand('$(echo node)'), false);
      assert.equal(hasCommand('`echo node`'), false);
    });

    it('returns boolean type', () => {
      assert.equal(typeof hasCommand('node'), 'boolean');
      assert.equal(typeof hasCommand('nonexistent_cmd_xyz'), 'boolean');
    });
  });

  describe('mkdirp', () => {
    it('creates nested directories', () => {
      const testDir = join('/tmp', `claude-test-${process.pid}`, 'a', 'b', 'c');
      mkdirp(testDir);
      assert.ok(existsSync(testDir));
      // Cleanup
      runCmd(`rm -rf /tmp/claude-test-${process.pid}`);
    });

    it('does not throw if directory exists', () => {
      mkdirp('/tmp');
    });
  });

  describe('listDirs', () => {
    it('lists directories excluding hidden and underscore', () => {
      const testBase = `/tmp/claude-listdirs-${process.pid}`;
      mkdirp(join(testBase, 'project-a'));
      mkdirp(join(testBase, 'project-b'));
      mkdirp(join(testBase, '.hidden'));
      mkdirp(join(testBase, '_template'));

      const dirs = listDirs(testBase);
      const names = dirs.map(d => d.name);

      assert.ok(names.includes('project-a'));
      assert.ok(names.includes('project-b'));
      assert.ok(!names.includes('.hidden'));
      assert.ok(!names.includes('_template'));

      runCmd(`rm -rf ${testBase}`);
    });

    it('returns empty array for nonexistent path', () => {
      const dirs = listDirs('/nonexistent/path/xyz');
      assert.deepEqual(dirs, []);
    });
  });

  describe('paths', () => {
    it('SKILLS_DIR ends with .claude/skills', () => {
      assert.ok(SKILLS_DIR.endsWith('.claude/skills'));
    });

    it('AGENTS_DIR ends with .claude/agents', () => {
      assert.ok(AGENTS_DIR.endsWith('.claude/agents'));
    });

    it('CLAUDE_DIR ends with .claude', () => {
      assert.ok(CLAUDE_DIR.endsWith('.claude'));
    });
  });

  describe('atomicWriteJson', () => {
    let tmpDir;

    afterAll(() => {
      if (tmpDir && existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('writes valid JSON with 2-space indent and trailing newline', () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cds-atomic-'));
      const filePath = join(tmpDir, 'test.json');
      const obj = { foo: 'bar', num: 42 };
      atomicWriteJson(filePath, obj);
      const content = readFileSync(filePath, 'utf8');
      assert.ok(content.endsWith('\n'), 'should end with newline');
      assert.ok(content.includes('  '), 'should use 2-space indent');
      assert.deepEqual(JSON.parse(content), obj);
    });

    it('creates parent directories if they do not exist', () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cds-atomic-'));
      const filePath = join(tmpDir, 'nested', 'deep', 'test.json');
      atomicWriteJson(filePath, { nested: true });
      assert.ok(existsSync(filePath));
    });

    it('leaves no .tmp file after successful write', () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cds-atomic-'));
      const filePath = join(tmpDir, 'clean.json');
      atomicWriteJson(filePath, { clean: true });
      assert.ok(!existsSync(filePath + '.tmp'), 'should not leave .tmp file');
    });

    it('result can be parsed back with JSON.parse and equals input object', () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cds-atomic-'));
      const filePath = join(tmpDir, 'roundtrip.json');
      const original = { a: 1, b: 'hello', c: [1, 2, 3] };
      atomicWriteJson(filePath, original);
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      assert.deepEqual(parsed, original);
    });

    it('preserves structure of nested objects', () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cds-atomic-'));
      const filePath = join(tmpDir, 'nested.json');
      const obj = { top: { middle: { bottom: 'value' } }, arr: [{ x: 1 }] };
      atomicWriteJson(filePath, obj);
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      assert.deepEqual(parsed, obj);
    });
  });
});
