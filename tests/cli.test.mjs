import { describe, it } from 'vitest';
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

// ── notebooklm routing tests (Plan 05-01 Task 2, NBLM-24 + NBLM-25) ─────────
// Validation rows: 5-01-02 (NBLM-24 routing + collision guard + NBLM-25 help text)

/**
 * Run CLI and return { stdout, stderr, exitCode }.
 * Never throws — captures both success and failure paths.
 */
function runRaw(args = []) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: 'pipe',
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status ?? 1,
    };
  }
}

describe('CLI: notebooklm routing (NBLM-24)', () => {
  it('notebooklm (no args) → exit 0, stdout contains help text', () => {
    const { stdout, exitCode } = runRaw(['notebooklm']);
    assert.equal(exitCode, 0, `Expected exit 0, got ${exitCode}`);
    assert.ok(stdout.includes('notebooklm sync'), `Expected "notebooklm sync" in stdout:\n${stdout}`);
    assert.ok(stdout.includes('notebooklm status'), `Expected "notebooklm status" in stdout:\n${stdout}`);
  });

  it('notebooklm help → exit 0, stdout contains help text', () => {
    const { stdout, exitCode } = runRaw(['notebooklm', 'help']);
    assert.equal(exitCode, 0, `Expected exit 0, got ${exitCode}`);
    assert.ok(stdout.includes('NotebookLM Sync'), `Expected "NotebookLM Sync" in stdout:\n${stdout}`);
  });

  it('notebooklm --help → exit 0, stdout contains help text', () => {
    const { stdout, exitCode } = runRaw(['notebooklm', '--help']);
    assert.equal(exitCode, 0, `Expected exit 0, got ${exitCode}`);
    assert.ok(stdout.includes('notebooklm sync'));
  });

  it('notebooklm bogus → exit non-zero, output contains "Unknown notebooklm subcommand"', () => {
    const { stdout, stderr, exitCode } = runRaw(['notebooklm', 'bogus']);
    assert.notEqual(exitCode, 0, `Expected non-zero exit for unknown subcommand`);
    const combined = stdout + stderr;
    assert.ok(
      combined.includes('Unknown notebooklm subcommand') || combined.includes('Error'),
      `Expected error message in output:\n${combined}`
    );
  });

  // Research finding #6: COLLISION GUARD — `claude-dev-stack status` must still route
  // to lib/analytics.mjs, NOT to lib/notebooklm-cli.mjs. The `case 'status':` at
  // bin/cli.mjs line 158 must remain untouched.
  it('top-level "status" still routes to analytics (collision guard — research finding #6)', () => {
    const { stdout, stderr } = runRaw(['status']);
    const combined = stdout + stderr;
    // analytics output should NOT contain NotebookLM-specific markers
    assert.ok(
      !combined.includes('NotebookLM Sync Status'),
      `"status" should route to analytics, not notebooklm. Got:\n${combined}`
    );
    // analytics output should NOT reference notebooklm-cli.mjs in any error
    assert.ok(
      !combined.includes('notebooklm-cli.mjs'),
      `"status" should not invoke notebooklm-cli. Got:\n${combined}`
    );
  });
});

describe('CLI: help includes NotebookLM section (NBLM-25)', () => {
  it('claude-dev-stack help → stdout includes "NotebookLM Sync" section header', () => {
    const { stdout } = runRaw(['help']);
    assert.ok(stdout.includes('NotebookLM Sync'), `Expected "NotebookLM Sync" section in help:\n${stdout}`);
  });

  it('claude-dev-stack help → stdout includes "notebooklm sync" entry', () => {
    const { stdout } = runRaw(['help']);
    assert.ok(stdout.includes('notebooklm sync'), `Expected "notebooklm sync" in help:\n${stdout}`);
  });

  it('claude-dev-stack help → stdout includes "notebooklm status" entry', () => {
    const { stdout } = runRaw(['help']);
    assert.ok(stdout.includes('notebooklm status'), `Expected "notebooklm status" in help:\n${stdout}`);
  });
});
