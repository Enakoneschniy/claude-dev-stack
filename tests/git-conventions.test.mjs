/**
 * tests/git-conventions.test.mjs -- Tests for lib/git-conventions.mjs
 *
 * CLI dispatch tests for the scopes subcommand.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gitConventionsSource = readFileSync(join(__dirname, '..', 'lib', 'git-conventions.mjs'), 'utf8');

import { main } from '../lib/git-conventions.mjs';
import { makeTempGitRepo } from './helpers/fixtures.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeTestConfig(dir, overrides = {}) {
  const config = {
    version: 1,
    project: 'test-project',
    scopes: ['core', 'api', 'ui'],
    types: ['feat', 'fix', 'chore'],
    ticket_prefix: '',
    ticket_regex: '',
    main_branch: 'main',
    branch_format: '{ticket}-{description}',
    commit_format: 'type(scope): subject',
    co_authored_by: false,
    commitlint_enforced: false,
    auto_detect: { enabled: true, sources: ['fallback'] },
    ...overrides,
  };
  const claudeDir = join(dir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'git-scopes.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  return config;
}

// ── printHelp tests ───────────────────────────────────────────────────────────

describe('main() help', () => {
  it('main([]) calls printHelp (outputs scopes usage)', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await main([]);
    } finally {
      console.log = origLog;
    }
    const output = logs.join('\n');
    assert.ok(output.includes('scopes'), 'help output should mention scopes');
  });

  it('main(["help"]) calls printHelp', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await main(['help']);
    } finally {
      console.log = origLog;
    }
    const output = logs.join('\n');
    assert.ok(output.includes('scopes'), 'help output should mention scopes');
  });
});

// ── cmdList tests ─────────────────────────────────────────────────────────────

describe('main(["list"])', () => {
  let origCwd;
  before(() => {
    origCwd = process.cwd();
  });
  after(() => {
    process.chdir(origCwd);
  });

  it('prints failure when no config exists', async () => {
    const { dir, cleanup } = makeTempGitRepo();
    try {
      process.chdir(dir);
      const logs = [];
      const origLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));
      try {
        await main(['list']);
      } finally {
        console.log = origLog;
      }
      const output = logs.join('\n');
      assert.ok(output.length > 0, 'should print something when config missing');
    } finally {
      process.chdir(origCwd);
      cleanup();
    }
  });

  it('prints scopes when valid config exists', async () => {
    const { dir, cleanup } = makeTempGitRepo();
    try {
      writeTestConfig(dir);
      process.chdir(dir);
      const logs = [];
      const origLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));
      try {
        await main(['list']);
      } finally {
        console.log = origLog;
      }
      const output = logs.join('\n');
      assert.ok(output.includes('core') || output.includes('api'), 'list should show scopes');
    } finally {
      process.chdir(origCwd);
      cleanup();
    }
  });
});

// ── cmdAdd tests ──────────────────────────────────────────────────────────────

describe('main(["add", scopeName])', () => {
  let origCwd;
  before(() => {
    origCwd = process.cwd();
  });
  after(() => {
    process.chdir(origCwd);
  });

  it('adds a new scope to the config file', async () => {
    const { dir, cleanup } = makeTempGitRepo();
    try {
      writeTestConfig(dir);
      process.chdir(dir);
      await main(['add', 'new-scope']);
      const raw = readFileSync(join(dir, '.claude', 'git-scopes.json'), 'utf8');
      const config = JSON.parse(raw);
      assert.ok(config.scopes.includes('new-scope'), 'new-scope should be in scopes after add');
    } finally {
      process.chdir(origCwd);
      cleanup();
    }
  });
});

// ── cmdRemove tests ───────────────────────────────────────────────────────────

describe('main(["remove", scopeName])', () => {
  let origCwd;
  before(() => {
    origCwd = process.cwd();
  });
  after(() => {
    process.chdir(origCwd);
  });

  it('removes a scope from the config file', async () => {
    const { dir, cleanup } = makeTempGitRepo();
    try {
      writeTestConfig(dir, { scopes: ['core', 'api', 'ui'] });
      process.chdir(dir);
      await main(['remove', 'core']);
      const raw = readFileSync(join(dir, '.claude', 'git-scopes.json'), 'utf8');
      const config = JSON.parse(raw);
      assert.ok(!config.scopes.includes('core'), 'core should be removed');
      assert.ok(config.scopes.includes('api'), 'api should still exist');
    } finally {
      process.chdir(origCwd);
      cleanup();
    }
  });
});

// ── unknown subcommand ────────────────────────────────────────────────────────

describe('main(["unknown"])', () => {
  it('prints error message for unknown subcommand', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await main(['unknown-subcommand-xyz']);
    } finally {
      console.log = origLog;
    }
    const output = logs.join('\n');
    assert.ok(output.includes('unknown') || output.includes('Unknown'), 'should mention unknown subcommand');
  });
});

// ── WR-02: --full mode structural integrity ───────────────────────────────────

describe('cmdInit --full structural (WR-02)', () => {
  it('prompts 1-4 are NOT wrapped in a useQuick conditional (always run)', () => {
    // The old bug: const useQuick = quick || !full; if (useQuick) { prompts 1-4 }
    // Fix: prompts 1-4 run unconditionally
    assert.ok(
      !gitConventionsSource.includes('useQuick'),
      'useQuick variable must be removed — prompts 1-4 always run',
    );
  });

  it('prompts 5-7 remain inside if (full) block', () => {
    // Prompts 5-7 (ticket prefix, branch format, co-authored-by) are full-only
    const fullBlock = gitConventionsSource.match(/if \(full\)\s*\{([\s\S]+?)\n  \}/);
    assert.ok(fullBlock, 'if (full) block must exist for prompts 5-7');
    assert.ok(
      fullBlock[1].includes('ticketPrefix') || fullBlock[1].includes('ticket'),
      'ticket prefix prompt must be inside if (full) block',
    );
    assert.ok(
      fullBlock[1].includes('branchFormat') || fullBlock[1].includes('branch_format'),
      'branch format prompt must be inside if (full) block',
    );
    assert.ok(
      fullBlock[1].includes('coAuthoredBy') || fullBlock[1].includes('co_authored_by'),
      'co-authored-by prompt must be inside if (full) block',
    );
  });

  it('main branch prompt appears exactly once in cmdInit source', () => {
    // Extract cmdInit function body to check for duplicated main branch prompt
    const cmdInitFn = gitConventionsSource.match(/async function cmdInit[\s\S]+?(?=\n\/\/ ──|\nasync function )/);
    assert.ok(cmdInitFn, 'cmdInit function must exist');
    const matches = (cmdInitFn[0].match(/acceptBranch/g) || []).length;
    assert.equal(matches, 2, `acceptBranch should appear exactly twice (prompt + check), found ${matches}`);
  });
});
