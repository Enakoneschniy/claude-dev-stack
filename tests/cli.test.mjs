import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'bin', 'cli.mjs');

function run(args = []) {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (err) {
    return err.stdout || err.message;
  }
}

describe('CLI', () => {
  describe('help', () => {
    it('shows help text', () => {
      const output = run(['help']);
      assert.ok(output.includes('Claude Dev Stack'));
      assert.ok(output.includes('Setup'));
      assert.ok(output.includes('Projects'));
      assert.ok(output.includes('Skills'));
      assert.ok(output.includes('Plugins'));
      assert.ok(output.includes('MCP Servers'));
      assert.ok(output.includes('Templates'));
      assert.ok(output.includes('Import & Export'));
      assert.ok(output.includes('Maintenance'));
      assert.ok(output.includes('Documents'));
      assert.ok(output.includes('Analytics'));
    });
  });

  describe('version', () => {
    it('prints version number', () => {
      const output = run(['version']);
      assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
    });
  });

  describe('skills', () => {
    it('lists skills without error', () => {
      const output = run(['skills']);
      assert.ok(output.includes('Installed skills') || output.includes('No skills'));
    });
  });

  describe('docs', () => {
    it('shows docs help for unknown subcommand', () => {
      const output = run(['docs', 'xyz']);
      assert.ok(output.includes('Document management'));
    });
  });

  describe('skills subcommand help', () => {
    it('shows skills help for unknown subcommand', () => {
      const output = run(['skills', 'xyz']);
      assert.ok(output.includes('Skills management'));
    });
  });

  describe('plugins subcommand help', () => {
    it('shows plugins help for unknown subcommand', () => {
      const output = run(['plugins', 'xyz']);
      assert.ok(output.includes('Plugin management'));
    });
  });

  describe('mcp subcommand help', () => {
    it('shows mcp help for unknown subcommand', () => {
      const output = run(['mcp', 'xyz']);
      assert.ok(output.includes('MCP server management'));
    });
  });
});
