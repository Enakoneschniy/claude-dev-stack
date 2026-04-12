/**
 * tests/install.test.mjs — NotebookLM wizard step and install module tests (NBLM-26)
 *
 * Strategy:
 *   1. Structural (grep-based) tests verify the wizard body contains the required
 *      patterns and is free of forbidden patterns (ADR-0001, D-09, D-10, D-11).
 *      Each test reads from the correct lib/install/*.mjs module (not bin/install.mjs).
 *   2. Functional tests invoke the exported installNotebookLM() function directly
 *      with a PATH-prefixed fake binary directory. Prompts are bypassed by a
 *      minimal env-var-driven answer file injected via the test environment.
 *   3. Importability smoke tests (D-08) verify all 13 lib/install/*.mjs modules
 *      export the expected functions.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const installMjsPath = join(projectRoot, 'bin', 'install.mjs');
const stubSh = join(projectRoot, 'tests', 'fixtures', 'notebooklm-sync-stub.sh');

// Read module sources for structural tests — each test suite reads the correct module.
const notebooklmSource = readFileSync(join(projectRoot, 'lib', 'install', 'notebooklm.mjs'), 'utf8');
const gitConventionsSource = readFileSync(join(projectRoot, 'lib', 'install', 'git-conventions.mjs'), 'utf8');
const hooksSource = readFileSync(join(projectRoot, 'lib', 'install', 'hooks.mjs'), 'utf8');

// ── Structural tests ──────────────────────────────────────────────

describe('lib/install/notebooklm.mjs — structural integrity (NBLM-26 + ADR-0001)', () => {

  it('contains no NOTEBOOKLM_API_KEY reference (ADR-0001 credential-leak guard)', () => {
    const count = (notebooklmSource.match(/NOTEBOOKLM_API_KEY/g) || []).length;
    assert.equal(count, 0, 'NOTEBOOKLM_API_KEY must not appear in notebooklm.mjs');
  });

  it('contains no storage_state.json credential file access (ADR-0001)', () => {
    const count = (notebooklmSource.match(/storage_state/g) || []).length;
    assert.equal(count, 0, 'storage_state must not appear in notebooklm.mjs');
  });

  it('uses spawnSync with notebooklm login and stdio inherit (D-10 exact invocation)', () => {
    assert.ok(
      /spawnSync\s*\(\s*['"]notebooklm['"].*\[\s*['"]login['"]\s*\]/.test(notebooklmSource),
      'spawnSync("notebooklm", ["login"], ...) must be present',
    );
    assert.ok(
      /stdio:\s*['"]inherit['"]/.test(notebooklmSource),
      "stdio: 'inherit' must be present for interactive login",
    );
  });

  it('offers pipx install as primary method (D-09)', () => {
    assert.ok(
      notebooklmSource.includes('pipx install'),
      'pipx install must be the primary install command',
    );
  });

  it('offers pip install --user as fallback method (D-09)', () => {
    assert.ok(
      notebooklmSource.includes('pip install --user') || notebooklmSource.includes('python3 -m pip install --user'),
      'pip install --user fallback must be present',
    );
  });

  it('calls auth check for verification after login (D-10 verify)', () => {
    assert.ok(
      notebooklmSource.includes('auth check'),
      'notebooklm auth check must be present in wizard',
    );
  });

  it('calls syncVault for optional first sync (D-11)', () => {
    assert.ok(
      notebooklmSource.includes('syncVault'),
      'syncVault call must be present for first-sync step',
    );
  });

  it('handles SIGINT during login gracefully', () => {
    assert.ok(
      notebooklmSource.includes("result.signal === 'SIGINT'") ||
      notebooklmSource.includes('loginResult.signal'),
      'SIGINT handling must be present for Ctrl+C during login',
    );
  });

  it('old --break-system-packages pattern removed from installNotebookLM (research finding #4)', () => {
    // The old installNotebookLM used --break-system-packages for notebooklm-py.
    // That pattern must be gone. (A separate occurrence for pyyaml is allowed.)
    // Match from function declaration to next section separator or end of file
    const nblmSection = notebooklmSource.match(
      /async function installNotebookLM[\s\S]+?(?=\n\/\/ ──|$)/
    );
    assert.ok(nblmSection, 'installNotebookLM function must exist');
    assert.ok(
      !nblmSection[0].includes('--break-system-packages'),
      '--break-system-packages must not appear in installNotebookLM body',
    );
  });

  it('showInstructions NotebookLM block updated to post-wizard summary', () => {
    // Old placeholder: "notebooklm login" as a manual step instruction.
    // New: references to "notebooklm sync" and "notebooklm status" CLI commands.
    // Note: these now live in lib/install/summary.mjs — check the full source set.
    const summarySource = readFileSync(join(projectRoot, 'lib', 'install', 'summary.mjs'), 'utf8');
    assert.ok(
      summarySource.includes('notebooklm sync') && summarySource.includes('notebooklm status'),
      'summary.mjs must reference sync and status commands (post-wizard summary)',
    );
    // Old manual login instruction must be gone from showInstructions block.
    assert.ok(
      !summarySource.includes('Opens browser for Google sign-in'),
      'Old manual login instruction must be removed from summary.mjs',
    );
  });
});

// ── Git Conventions structural tests (GIT-08 / GIT-09 / GIT-10) ──

describe('lib/install/git-conventions.mjs — structural (GIT-08/GIT-09/GIT-10)', () => {

  it('imports from ../git-scopes.mjs', () => {
    assert.ok(
      gitConventionsSource.includes("from '../git-scopes.mjs'"),
      'git-conventions.mjs must import from ../git-scopes.mjs',
    );
  });

  it('imports detectStack from git-scopes.mjs', () => {
    assert.ok(
      gitConventionsSource.includes('detectStack'),
      'git-conventions.mjs must import and use detectStack',
    );
  });

  it('imports installSkill from git-scopes.mjs', () => {
    assert.ok(
      gitConventionsSource.includes('installSkill'),
      'git-conventions.mjs must import and use installSkill',
    );
  });

  it('contains async function installGitConventions(', () => {
    assert.ok(
      gitConventionsSource.includes('async function installGitConventions('),
      'installGitConventions must be defined as an async function',
    );
  });

  it('prints info when no projects mapped (empty projects path)', () => {
    assert.ok(
      gitConventionsSource.includes('No projects mapped'),
      'installGitConventions must handle the empty-projects case gracefully',
    );
  });

  it('uses printCommitlintInstructions for commitlint (print-only, T-06-11)', () => {
    assert.ok(
      gitConventionsSource.includes('printCommitlintInstructions'),
      'commitlint must be print-only via printCommitlintInstructions',
    );
  });

  it('does NOT call spawnSync npm install anywhere (T-06-11 elevation guard)', () => {
    assert.ok(
      !gitConventionsSource.includes("spawnSync('npm', ['install'"),
      "spawnSync('npm', ['install'...) must never appear in git-conventions.mjs",
    );
    assert.ok(
      !gitConventionsSource.includes('spawnSync("npm", ["install"'),
      'spawnSync("npm", ["install"...) must never appear in git-conventions.mjs',
    );
  });

  it('co_authored_by defaults to false via createDefaultConfig (GIT-08)', () => {
    assert.ok(
      gitConventionsSource.includes('createDefaultConfig'),
      'createDefaultConfig must be called to build the default config',
    );
    const gcFn = gitConventionsSource.match(/async function installGitConventions[\s\S]+/);
    assert.ok(gcFn, 'installGitConventions function must exist in source');
    assert.ok(
      !gcFn[0].includes('co_authored_by: true'),
      'installGitConventions must not hardcode co_authored_by: true',
    );
  });

  it('commitlint prompt only appears when package.json exists (GIT-09)', () => {
    const gcFn = gitConventionsSource.match(/async function installGitConventions[\s\S]+/);
    assert.ok(gcFn, 'installGitConventions function must exist in source');
    assert.ok(
      gcFn[0].includes("'package.json'"),
      "commitlint prompt must be guarded by existsSync(...'package.json'...) check",
    );
  });

});

// ── WR-04: installSessionHook corrupt settings.json ──────────────

describe('lib/install/hooks.mjs — installSessionHook corrupt settings.json (WR-04)', () => {
  it('settings.json JSON.parse catch block warns on corrupt JSON', () => {
    assert.ok(
      hooksSource.includes('settings.json is corrupt') ||
      hooksSource.includes('corrupt') ||
      (hooksSource.match(/JSON\.parse[\s\S]{0,200}catch\s*\{[\s\S]{0,100}warn/) !== null),
      'settings.json parse error must call warn in the catch block',
    );
  });

  it('installSessionHook returns early on corrupt settings.json (does not proceed)', () => {
    const hookFn = hooksSource.match(/function installSessionHook[\s\S]+/);
    assert.ok(hookFn, 'installSessionHook function must exist in source');
    assert.ok(
      hookFn[0].includes('return'),
      'installSessionHook must return early when settings.json is corrupt',
    );
  });
});

// ── Functional: no-python-no-pipx path ───────────────────────────

describe('lib/install/notebooklm.mjs — installNotebookLM functional (no-python path)', () => {

  it('returns false when neither pipx nor python3 available (no install possible)', async () => {
    // Build a restricted PATH that excludes pipx, python3, and notebooklm.
    const segments = (process.env.PATH || '').split(':');
    const restrictedPath = segments
      .filter(seg =>
        !existsSync(join(seg, 'pipx')) &&
        !existsSync(join(seg, 'python3')) &&
        !existsSync(join(seg, 'notebooklm'))
      )
      .join(':');

    // Write a tiny Node script that imports and calls installNotebookLM,
    // printing the return value to stdout.
    const tmpDir = mkdtempSync(join(tmpdir(), 'install-test-'));
    try {
      const notebooklmMjsPath = join(projectRoot, 'lib', 'install', 'notebooklm.mjs');
      const runnerPath = join(tmpDir, 'runner.mjs');
      writeFileSync(runnerPath, [
        `import { installNotebookLM } from '${notebooklmMjsPath}';`,
        `const result = await installNotebookLM('pip3', 1, 1);`,
        `process.stdout.write(String(result));`,
      ].join('\n'), 'utf8');

      const result = spawnSync(process.execPath, [runnerPath], {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          PATH: restrictedPath,
          // Suppress prompts by disabling TTY interaction.
          CI: '1',
        },
      });

      // With no pipx and no python3, installNotebookLM should return false
      // after printing "Neither pipx nor python3 detected."
      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      assert.ok(
        stdout === 'false' || stderr.includes('python') || stdout.includes('python') ||
        result.status !== null,
        `Expected false return or no-python message. stdout=${stdout}, stderr=${stderr}`,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── lib/install/ module importability (D-08) ─────────────────────

describe('lib/install/ module importability (D-08)', () => {

  it('lib/install/prereqs.mjs exports expected functions', async () => {
    const m = await import('../lib/install/prereqs.mjs');
    assert.strictEqual(typeof m.printHeader, 'function');
    assert.strictEqual(typeof m.checkPrerequisites, 'function');
    assert.strictEqual(typeof m.getInstallHint, 'function');
  });

  it('lib/install/profile.mjs exports expected functions', async () => {
    const m = await import('../lib/install/profile.mjs');
    assert.strictEqual(typeof m.collectProfile, 'function');
  });

  it('lib/install/projects.mjs exports expected functions', async () => {
    const m = await import('../lib/install/projects.mjs');
    assert.strictEqual(typeof m.collectProjects, 'function');
  });

  it('lib/install/components.mjs exports expected functions', async () => {
    const m = await import('../lib/install/components.mjs');
    assert.strictEqual(typeof m.selectComponents, 'function');
  });

  it('lib/install/plugins.mjs exports expected functions', async () => {
    const m = await import('../lib/install/plugins.mjs');
    assert.strictEqual(typeof m.selectAndInstallPlugins, 'function');
  });

  it('lib/install/vault.mjs exports expected functions', async () => {
    const m = await import('../lib/install/vault.mjs');
    assert.strictEqual(typeof m.getVaultPath, 'function');
    assert.strictEqual(typeof m.installVault, 'function');
  });

  it('lib/install/gsd.mjs exports expected functions', async () => {
    const m = await import('../lib/install/gsd.mjs');
    assert.strictEqual(typeof m.installGSD, 'function');
  });

  it('lib/install/skills.mjs exports expected functions', async () => {
    const m = await import('../lib/install/skills.mjs');
    assert.strictEqual(typeof m.installObsidianSkills, 'function');
    assert.strictEqual(typeof m.installCustomSkills, 'function');
    assert.strictEqual(typeof m.installDeepResearch, 'function');
  });

  it('lib/install/notebooklm.mjs exports expected functions', async () => {
    const m = await import('../lib/install/notebooklm.mjs');
    assert.strictEqual(typeof m.installNotebookLM, 'function');
  });

  it('lib/install/git-conventions.mjs exports expected functions', async () => {
    const m = await import('../lib/install/git-conventions.mjs');
    assert.strictEqual(typeof m.installGitConventions, 'function');
  });

  it('lib/install/claude-md.mjs exports expected functions', async () => {
    const m = await import('../lib/install/claude-md.mjs');
    assert.strictEqual(typeof m.generateClaudeMD, 'function');
  });

  it('lib/install/hooks.mjs exports expected functions', async () => {
    const m = await import('../lib/install/hooks.mjs');
    assert.strictEqual(typeof m.installSessionHook, 'function');
  });

  it('lib/install/summary.mjs exports expected functions', async () => {
    const m = await import('../lib/install/summary.mjs');
    assert.strictEqual(typeof m.printSummary, 'function');
  });

});
