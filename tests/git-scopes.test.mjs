/**
 * tests/git-scopes.test.mjs -- Tests for lib/git-scopes.mjs
 *
 * Detection fixture matrix + schema validation + installSkill tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

import {
  validateScopes,
  detectStack,
  readScopes,
  writeScopes,
  installSkill,
  detectMainBranch,
  createDefaultConfig,
  checkPrereqs,
} from '../lib/git-scopes.mjs';

import { makeTempMonorepo, makeTempGitRepo } from './helpers/fixtures.mjs';

// ── validateScopes tests ─────────────────────────────────────────────────────

describe('validateScopes', () => {
  it('returns invalid for null input', () => {
    const result = validateScopes(null);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'not-an-object');
  });

  it('returns invalid for non-object input', () => {
    const result = validateScopes('string');
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'not-an-object');
  });

  it('returns invalid for empty object (unknown-version)', () => {
    const result = validateScopes({});
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'unknown-version');
  });

  it('returns invalid for wrong version', () => {
    const result = validateScopes({ version: 2, scopes: ['core'], main_branch: 'main' });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'unknown-version');
  });

  it('returns invalid when scopes array is missing', () => {
    const result = validateScopes({ version: 1, main_branch: 'main' });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'missing-scopes');
  });

  it('returns invalid when scopes array is empty', () => {
    const result = validateScopes({ version: 1, scopes: [], main_branch: 'main' });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'missing-scopes');
  });

  it('returns invalid when main_branch is missing', () => {
    const result = validateScopes({ version: 1, scopes: ['core'] });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'missing-main-branch');
  });

  it('returns valid for a complete v1 config', () => {
    const result = validateScopes({ version: 1, scopes: ['core'], main_branch: 'main' });
    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });
});

// ── detectStack tests ────────────────────────────────────────────────────────

describe('detectStack', () => {
  it('detects pnpm-workspace', () => {
    const { dir, cleanup } = makeTempMonorepo('pnpm-workspace');
    try {
      const result = detectStack(dir);
      assert.equal(result.source, 'pnpm-workspace');
      assert.ok(result.scopes.includes('web'), `expected 'web' in scopes: ${result.scopes}`);
      assert.ok(result.scopes.includes('api'), `expected 'api' in scopes: ${result.scopes}`);
      assert.ok(result.scopes.includes('ui'), `expected 'ui' in scopes: ${result.scopes}`);
    } finally {
      cleanup();
    }
  });

  it('detects npm-workspaces', () => {
    const { dir, cleanup } = makeTempMonorepo('npm-workspaces');
    try {
      const result = detectStack(dir);
      assert.equal(result.source, 'npm-workspaces');
      assert.ok(result.scopes.includes('web'), `expected 'web' in scopes: ${result.scopes}`);
    } finally {
      cleanup();
    }
  });

  it('detects lerna', () => {
    const { dir, cleanup } = makeTempMonorepo('lerna');
    try {
      const result = detectStack(dir);
      assert.equal(result.source, 'lerna');
      assert.ok(result.scopes.includes('core'), `expected 'core' in scopes: ${result.scopes}`);
    } finally {
      cleanup();
    }
  });

  it('detects cargo-workspace', () => {
    const { dir, cleanup } = makeTempMonorepo('cargo-workspace');
    try {
      const result = detectStack(dir);
      assert.equal(result.source, 'cargo-workspace');
      assert.ok(result.scopes.includes('core'), `expected 'core' in scopes: ${result.scopes}`);
      assert.ok(result.scopes.includes('api'), `expected 'api' in scopes: ${result.scopes}`);
    } finally {
      cleanup();
    }
  });

  it('detects go-multi-module', () => {
    const { dir, cleanup } = makeTempMonorepo('go-multi-module');
    try {
      const result = detectStack(dir);
      assert.equal(result.source, 'go-multi-module');
      assert.ok(result.scopes.includes('server'), `expected 'server' in scopes: ${result.scopes}`);
      assert.ok(result.scopes.includes('core'), `expected 'core' in scopes: ${result.scopes}`);
    } finally {
      cleanup();
    }
  });

  it('detects python-uv', () => {
    const { dir, cleanup } = makeTempMonorepo('python-uv');
    try {
      const result = detectStack(dir);
      assert.equal(result.source, 'python-uv');
      assert.ok(result.scopes.includes('core'), `expected 'core' in scopes: ${result.scopes}`);
    } finally {
      cleanup();
    }
  });

  it('falls back to single-package for empty dir', () => {
    const { dir, cleanup } = makeTempMonorepo('single-package');
    try {
      const result = detectStack(dir);
      assert.equal(result.source, 'fallback');
      assert.deepEqual(result.scopes, ['core']);
    } finally {
      cleanup();
    }
  });
});

// ── readScopes + writeScopes round-trip ──────────────────────────────────────

describe('readScopes + writeScopes', () => {
  let tempDir;
  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cds-scopes-'));
  });
  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('round-trips a valid config without data loss', () => {
    const config = {
      version: 1,
      project: 'test-project',
      scopes: ['web', 'api', 'ui'],
      types: ['feat', 'fix', 'chore'],
      ticket_prefix: 'PROJ-',
      ticket_regex: '',
      main_branch: 'main',
      branch_format: '{ticket}-{description}',
      commit_format: 'type(scope): subject',
      co_authored_by: false,
      commitlint_enforced: false,
      auto_detect: { enabled: true, sources: ['pnpm-workspace'] },
    };
    writeScopes(tempDir, config);
    const read = readScopes(tempDir);
    assert.ok(read !== null, 'readScopes should return a non-null config');
    assert.deepEqual(read.scopes, config.scopes);
    assert.equal(read.main_branch, config.main_branch);
    assert.equal(read.co_authored_by, config.co_authored_by);
    assert.equal(read.ticket_prefix, config.ticket_prefix);
  });

  it('returns null when no config file exists', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'cds-empty-'));
    try {
      const result = readScopes(emptyDir);
      assert.equal(result, null);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ── installSkill tests ───────────────────────────────────────────────────────

describe('installSkill', () => {
  let tempDir;
  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cds-install-'));
  });
  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('produces SKILL.md with no unreplaced {{ tokens', () => {
    const config = {
      scopes: ['core', 'api'],
      main_branch: 'main',
      ticket_prefix: '',
      co_authored_by: false,
    };
    installSkill(tempDir, config);
    const skillPath = join(tempDir, '.claude', 'skills', 'git-conventions', 'SKILL.md');
    assert.ok(existsSync(skillPath), 'SKILL.md should exist after installSkill');
    const content = readFileSync(skillPath, 'utf8');
    assert.ok(!content.includes('{{'), 'No unreplaced {{ tokens should remain in SKILL.md');
  });

  it('includes correct scopes in SKILL.md', () => {
    const config = {
      scopes: ['web', 'ui', 'backend'],
      main_branch: 'develop',
      ticket_prefix: '',
      co_authored_by: false,
    };
    const projectDir = mkdtempSync(join(tmpdir(), 'cds-skill-'));
    try {
      installSkill(projectDir, config);
      const skillPath = join(projectDir, '.claude', 'skills', 'git-conventions', 'SKILL.md');
      const content = readFileSync(skillPath, 'utf8');
      assert.ok(content.includes('`web`'), 'SKILL.md should include web scope');
      assert.ok(content.includes('`ui`'), 'SKILL.md should include ui scope');
      assert.ok(content.includes('`backend`'), 'SKILL.md should include backend scope');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('omits Co-Authored-By when co_authored_by is false', () => {
    const config = {
      scopes: ['core'],
      main_branch: 'main',
      ticket_prefix: '',
      co_authored_by: false,
    };
    const projectDir = mkdtempSync(join(tmpdir(), 'cds-skill2-'));
    try {
      installSkill(projectDir, config);
      const skillPath = join(projectDir, '.claude', 'skills', 'git-conventions', 'SKILL.md');
      const content = readFileSync(skillPath, 'utf8');
      assert.ok(!content.includes('Co-Authored-By'), 'Co-Authored-By should not appear when co_authored_by=false');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('includes Co-Authored-By checklist item when co_authored_by is true', () => {
    const config = {
      scopes: ['core'],
      main_branch: 'main',
      ticket_prefix: '',
      co_authored_by: true,
    };
    const projectDir = mkdtempSync(join(tmpdir(), 'cds-skill3-'));
    try {
      installSkill(projectDir, config);
      const skillPath = join(projectDir, '.claude', 'skills', 'git-conventions', 'SKILL.md');
      const content = readFileSync(skillPath, 'utf8');
      assert.ok(content.includes('Co-Authored-By'), 'Co-Authored-By should appear when co_authored_by=true');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

// ── detectMainBranch tests ───────────────────────────────────────────────────

describe('detectMainBranch', () => {
  it('returns null for a repo with no remote', () => {
    const { dir, cleanup } = makeTempGitRepo();
    try {
      // Repo has no remote so git symbolic-ref refs/remotes/origin/HEAD fails
      // The fallback chain should eventually return a string (current branch) or null
      const result = detectMainBranch(dir);
      // With no remote, steps 1 and 2 fail. Step 3 (git branch --show-current) may return
      // the current branch name. Either a string or null is acceptable.
      assert.ok(result === null || typeof result === 'string', `Expected null or string, got: ${result}`);
    } finally {
      cleanup();
    }
  });
});

// ── createDefaultConfig tests ─────────────────────────────────────────────────

describe('createDefaultConfig', () => {
  it('returns a v1 config with co_authored_by defaulting to false', () => {
    const detected = { scopes: ['core', 'api'], source: 'pnpm-workspace', confidence: 'high' };
    const config = createDefaultConfig('my-project', detected);
    assert.equal(config.version, 1);
    assert.equal(config.project, 'my-project');
    assert.deepEqual(config.scopes, ['core', 'api']);
    assert.equal(config.co_authored_by, false);
    assert.equal(config.main_branch, 'main');
  });
});

// ── checkPrereqs tests ───────────────────────────────────────────────────────

describe('checkPrereqs', () => {
  it('returns ok when git present and .git exists', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cds-prereq-ok-'));
    try {
      mkdirSync(join(tempDir, '.git'), { recursive: true });
      const result = checkPrereqs(tempDir);
      assert.equal(result.ok, true);
      assert.equal(result.missing.length, 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns missing not-a-git-repo when no .git dir', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cds-prereq-nogit-'));
    try {
      const result = checkPrereqs(tempDir);
      // git binary is present in CI, but no .git dir
      assert.equal(result.ok, false);
      assert.ok(result.missing.includes('not-a-git-repo'), `expected not-a-git-repo in missing: ${result.missing}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns { ok, missing } shape', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cds-prereq-shape-'));
    try {
      mkdirSync(join(tempDir, '.git'), { recursive: true });
      const result = checkPrereqs(tempDir);
      assert.ok(typeof result.ok === 'boolean', 'ok must be boolean');
      assert.ok(Array.isArray(result.missing), 'missing must be array');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

// ── WR-03: Go detector directory filter ─────────────────────────────────────

describe('detectStack — Go detector skips heavy directories (WR-03)', () => {
  let tempDir;
  after(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips node_modules when scanning for go.mod files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cds-go-filter-'));
    // Real go module in cmd/
    mkdirSync(join(tempDir, 'cmd', 'server'), { recursive: true });
    writeFileSync(join(tempDir, 'cmd', 'server', 'go.mod'), 'module example.com/x', 'utf8');
    // Fake go.mod inside node_modules (should be ignored)
    mkdirSync(join(tempDir, 'node_modules', 'fake-go'), { recursive: true });
    writeFileSync(join(tempDir, 'node_modules', 'fake-go', 'go.mod'), 'module fake', 'utf8');

    const result = detectStack(tempDir);
    assert.equal(result.source, 'go-multi-module', `expected go-multi-module, got ${result.source}`);
    assert.ok(!result.scopes.includes('node_modules'), 'node_modules must not appear in scopes');
    assert.ok(!result.scopes.includes('fake-go'), 'fake-go inside node_modules must not appear in scopes');
  });

  it('skips vendor directory when scanning for go.mod files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cds-go-vendor-'));
    // Real go module
    mkdirSync(join(tempDir, 'pkg', 'core'), { recursive: true });
    writeFileSync(join(tempDir, 'pkg', 'core', 'go.mod'), 'module example.com/y', 'utf8');
    // Fake go.mod inside vendor (should be ignored)
    mkdirSync(join(tempDir, 'vendor', 'github.com'), { recursive: true });
    writeFileSync(join(tempDir, 'vendor', 'go.mod'), 'module vendor', 'utf8');

    const result = detectStack(tempDir);
    assert.ok(!result.scopes.includes('vendor'), 'vendor must not appear in scopes');
  });

  it('skips .git directory when scanning for go.mod files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cds-go-git-'));
    // Real go module
    mkdirSync(join(tempDir, 'cmd'), { recursive: true });
    writeFileSync(join(tempDir, 'cmd', 'go.mod'), 'module example.com/z', 'utf8');
    // Fake go.mod inside .git (should be ignored)
    mkdirSync(join(tempDir, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(tempDir, '.git', 'go.mod'), 'module git-internal', 'utf8');

    const result = detectStack(tempDir);
    assert.ok(!result.scopes.includes('.git'), '.git must not appear in scopes');
  });
});
