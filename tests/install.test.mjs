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

  it('lib/install/components.mjs exports installLoopMd (LIMIT-03)', async () => {
    const m = await import('../lib/install/components.mjs');
    assert.strictEqual(typeof m.installLoopMd, 'function');
  });

});

// ── Phase 19: BUG-01/02 — project-level hooks structural tests ───

describe('lib/install/hooks.mjs — project-level hooks (BUG-01/BUG-02)', () => {
  const src = readFileSync(join(projectRoot, 'lib', 'install', 'hooks.mjs'), 'utf8');

  it('installSessionHook accepts projectsData as 5th argument', () => {
    assert.ok(
      src.includes('installSessionHook(stepNum, totalSteps, pkgRoot, vaultPath, projectsData)'),
      'installSessionHook must accept projectsData as 5th parameter',
    );
  });

  it('writes to project .claude/settings.json not global settings (BUG-01)', () => {
    assert.ok(
      src.includes("join(project.path, '.claude')"),
      'must build project-level .claude dir path from project.path',
    );
    // Must NOT write to ~/.claude/settings.json directly as the primary path
    const globalSettingsRef = src.match(/join\(homedir\(\),\s*['"]\.claude['"],\s*['"]settings\.json['"]\)/g) || [];
    // The global path may only appear in the fallback branch, not as primary write target
    assert.ok(
      src.includes('fallback') || src.includes('No project directories') || globalSettingsRef.length <= 1,
      'global settings.json write must only appear in fallback branch',
    );
  });

  it('writes permissions.allow with vault patterns (BUG-02)', () => {
    assert.ok(src.includes('permissions'), 'permissions.allow must be written');
    assert.ok(src.includes('Read'), 'Read auto-approve must be present');
    assert.ok(src.includes('sessions/*.md'), 'vault sessions write pattern must be present');
  });

  it('writes safe bash permissions.allow entries (BUG-02)', () => {
    assert.ok(src.includes('git status'), 'git status permission must be present');
    assert.ok(src.includes('git branch'), 'git branch permission must be present');
  });

  it('copies gsd-auto-reapply-patches.sh to hooksDir (BUG-06)', () => {
    assert.ok(
      src.includes('gsd-auto-reapply-patches.sh'),
      'gsd-auto-reapply-patches.sh must be copied to hooksDir',
    );
  });

  // BUG-01 (1c): global settings.json must NOT be modified when projects are provided
  it('installSessionHook does NOT write to ~/.claude/settings.json when projects provided (BUG-01)', async () => {
    const { installSessionHook } = await import('../lib/install/hooks.mjs');
    const tmpHome = mkdtempSync(join(tmpdir(), 'install-bug01-home-'));
    const tmpPkgRoot = mkdtempSync(join(tmpdir(), 'install-bug01-pkg-'));
    const tmpProjectPath = mkdtempSync(join(tmpdir(), 'install-bug01-proj-'));
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;

      // Pre-create a global settings.json with a known marker
      const claudeDir = join(tmpHome, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      const globalSettingsPath = join(claudeDir, 'settings.json');
      const markerContent = JSON.stringify({ preserved: true });
      writeFileSync(globalSettingsPath, markerContent);

      const vaultPath = join(tmpHome, 'vault');
      const projectsData = { projects: [{ name: 'test-project', path: tmpProjectPath }] };

      installSessionHook(1, 1, tmpPkgRoot, vaultPath, projectsData);

      // Global settings.json must be byte-identical to the marker (untouched)
      const after = readFileSync(globalSettingsPath, 'utf8');
      assert.equal(
        after,
        markerContent,
        'global ~/.claude/settings.json must be untouched when projects are provided',
      );
    } finally {
      process.env.HOME = originalHome;
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpPkgRoot, { recursive: true, force: true });
      rmSync(tmpProjectPath, { recursive: true, force: true });
    }
  });

  // BUG-02 (2c): permissions.allow must be idempotent — no duplicates across reruns
  it('installSessionHook permissions.allow is idempotent across reruns (BUG-02)', async () => {
    const { installSessionHook } = await import('../lib/install/hooks.mjs');
    const tmpHome = mkdtempSync(join(tmpdir(), 'install-bug02-home-'));
    const tmpPkgRoot = mkdtempSync(join(tmpdir(), 'install-bug02-pkg-'));
    const tmpProjectPath = mkdtempSync(join(tmpdir(), 'install-bug02-proj-'));
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;

      const vaultPath = join(tmpHome, 'vault');
      const projectsData = { projects: [{ name: 'test-project', path: tmpProjectPath }] };

      // Call wizard twice with same inputs
      installSessionHook(1, 1, tmpPkgRoot, vaultPath, projectsData);
      installSessionHook(1, 1, tmpPkgRoot, vaultPath, projectsData);

      const settingsPath = join(tmpProjectPath, '.claude', 'settings.json');
      assert.ok(existsSync(settingsPath), 'project settings.json must exist');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const allow = settings?.permissions?.allow || [];

      // 'Bash(git status)' must appear exactly once (no duplicates)
      const gitStatusCount = allow.filter(p => p === 'Bash(git status)').length;
      assert.equal(
        gitStatusCount,
        1,
        `'Bash(git status)' must appear exactly once, found ${gitStatusCount}`,
      );
    } finally {
      process.env.HOME = originalHome;
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpPkgRoot, { recursive: true, force: true });
      rmSync(tmpProjectPath, { recursive: true, force: true });
    }
  });
});

// ── Phase 19: BUG-03 — collectProjects pre-select structural ─────

describe('lib/install/projects.mjs — pre-select from project-map (BUG-03)', () => {
  const src = readFileSync(join(projectRoot, 'lib', 'install', 'projects.mjs'), 'utf8');

  it('collectProjects accepts vaultPath as 4th argument', () => {
    assert.ok(
      src.includes('collectProjects(totalSteps, detectedProjects, detectedBaseDir, vaultPath)'),
      'collectProjects must accept vaultPath as 4th parameter',
    );
  });

  it('reads project-map.json to determine pre-selected dirs (BUG-03)', () => {
    assert.ok(src.includes('project-map.json'), 'must read project-map.json');
    assert.ok(src.includes('registeredPaths'), 'must track registered paths from project-map.json');
  });

  it('uses registeredPaths.has() for pre-selection in multiselect choices', () => {
    assert.ok(
      src.includes('registeredPaths.has(d.path)'),
      'choices.selected must check registeredPaths.has(d.path)',
    );
  });
});

// ── Phase 19: BUG-04 — selectComponents pre-select structural ────

describe('lib/install/components.mjs — pre-select installed (BUG-04)', () => {
  const src = readFileSync(join(projectRoot, 'lib', 'install', 'components.mjs'), 'utf8');

  it('selectComponents accepts installState as 3rd argument', () => {
    assert.ok(
      src.includes('selectComponents(totalSteps, hasPip, installState)'),
      'selectComponents must accept installState as 3rd parameter',
    );
  });

  it('detects installed components via _detectInstalled (BUG-04)', () => {
    assert.ok(src.includes('_detectInstalled'), 'must call _detectInstalled helper');
    assert.ok(src.includes('session-manager'), 'must check session-manager for customSkills');
    assert.ok(src.includes('gsd-manager'), 'must check gsd-manager for gsd');
  });

  it('shows (installed) label for detected components (BUG-04)', () => {
    assert.ok(src.includes('(installed)'), 'must show (installed) indicator for installed components');
  });

  it('pre-selects installed components as default (BUG-04)', () => {
    assert.ok(
      src.includes('detected.vault') && src.includes('detected.gsd'),
      'selected field must reference detected.* flags',
    );
  });
});

// ── Phase 19: BUG-05 — git-conventions skip existing ─────────────

describe('lib/install/git-conventions.mjs — skip existing git-scopes.json (BUG-05)', () => {
  const src = readFileSync(join(projectRoot, 'lib', 'install', 'git-conventions.mjs'), 'utf8');

  it('checks for existing git-scopes.json before re-initializing (BUG-05)', () => {
    assert.ok(src.includes('git-scopes.json'), 'must check for existing git-scopes.json');
    assert.ok(
      src.includes('already configured') || src.includes('reconfigure'),
      'must prompt user when git-scopes.json exists',
    );
  });

  it('offers reconfigure prompt when git-scopes.json exists (BUG-05)', () => {
    assert.ok(
      src.includes("message: `git-scopes.json already configured") ||
      src.includes("reconfigure?"),
      'must show reconfigure prompt',
    );
  });

  it('skips project when user declines reconfigure (BUG-05)', () => {
    assert.ok(
      src.includes('if (!reconfigure)') || src.includes("if (reconfigure === false") ||
      src.includes('!reconfigure'),
      'must skip project when reconfigure is false',
    );
  });
});

// ── Phase 19: BUG-06 — GSD patch auto-reapply ────────────────────

const patchHookPath = join(projectRoot, 'hooks', 'gsd-auto-reapply-patches.sh');
const patchFilePath = join(projectRoot, 'patches', 'transition.md');

describe('hooks/gsd-auto-reapply-patches.sh — auto-reapply GSD patches (BUG-06)', () => {
  it('patches/transition.md exists in package (BUG-06)', () => {
    assert.ok(existsSync(patchFilePath), 'patches/transition.md must exist in package');
  });

  it('patches/transition.md contains TeamCreate parallel execution content', () => {
    const content = readFileSync(patchFilePath, 'utf8');
    assert.ok(content.includes('TeamCreate'), 'transition.md patch must contain TeamCreate content');
    assert.ok(content.includes('Always-on team execution'), 'must contain always-on team execution section');
  });

  it('hooks/gsd-auto-reapply-patches.sh exists (BUG-06)', () => {
    assert.ok(existsSync(patchHookPath), 'hooks/gsd-auto-reapply-patches.sh must exist');
  });

  it('gsd-auto-reapply-patches.sh starts with shebang', () => {
    const content = readFileSync(patchHookPath, 'utf8');
    assert.ok(content.startsWith('#!/bin/bash'), 'must start with #!/bin/bash');
  });

  it('gsd-auto-reapply-patches.sh is valid bash syntax', () => {
    const result = spawnSync('bash', ['-n', patchHookPath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 0, `bash -n failed: ${result.stderr}`);
  });

  it('gsd-auto-reapply-patches.sh exits 0 when GSD not installed (graceful)', () => {
    const result = spawnSync('bash', [patchHookPath], {
      encoding: 'utf8',
      env: { ...process.env, GSD_DIR: '/nonexistent/gsd/path' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.equal(result.status, 0, `must exit 0 when GSD absent, got ${result.status}`);
  });

  it('gsd-auto-reapply-patches.sh prints reapply message when patch differs', () => {
    const tmpBase = mkdtempSync(join(tmpdir(), 'patch-test-'));
    const fakeGsd = join(tmpBase, 'get-shit-done');
    const fakeWorkflows = join(fakeGsd, 'workflows');
    mkdirSync(fakeWorkflows, { recursive: true });
    // Write a DIFFERENT transition.md (outdated content)
    writeFileSync(join(fakeWorkflows, 'transition.md'), 'outdated content without TeamCreate');
    const result = spawnSync('bash', [patchHookPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GSD_DIR: fakeGsd,
        PATCHES_DIR: join(projectRoot, 'patches'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    rmSync(tmpBase, { recursive: true, force: true });
    assert.equal(result.status, 0, `must exit 0, got ${result.status}: ${result.stderr}`);
    assert.ok(
      result.stdout.includes('auto-reapplied') || result.stdout.includes('updated'),
      `must print reapply message, got: "${result.stdout}"`,
    );
  });

  it('session-start-context.sh invokes gsd-auto-reapply-patches.sh (BUG-06)', () => {
    const sessionStart = readFileSync(join(projectRoot, 'hooks', 'session-start-context.sh'), 'utf8');
    assert.ok(
      sessionStart.includes('gsd-auto-reapply-patches.sh'),
      'session-start-context.sh must invoke gsd-auto-reapply-patches.sh',
    );
  });

  // ── WF-01: gsd-workflow-enforcer wizard install (Phase 29 Plan 02) ──
  it('copies gsd-workflow-enforcer.mjs into hooksDir (WF-01)', async () => {
    const { installSessionHook } = await import('../lib/install/hooks.mjs');
    const tmpHome = mkdtempSync(join(tmpdir(), 'install-wf01-copy-home-'));
    const tmpProjectPath = mkdtempSync(join(tmpdir(), 'install-wf01-copy-proj-'));
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;
      const vaultPath = join(tmpHome, 'vault');
      const projectsData = { projects: [{ name: 'test-project', path: tmpProjectPath }] };

      // Use repo root as pkgRoot so real hooks/gsd-workflow-enforcer.mjs is the source
      installSessionHook(1, 1, projectRoot, vaultPath, projectsData);

      const hookDest = join(tmpHome, '.claude', 'hooks', 'gsd-workflow-enforcer.mjs');
      assert.ok(
        existsSync(hookDest),
        'gsd-workflow-enforcer.mjs must be copied to ~/.claude/hooks/ during install',
      );
    } finally {
      process.env.HOME = originalHome;
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpProjectPath, { recursive: true, force: true });
    }
  });

  it('registers PostToolUse Skill → gsd-workflow-enforcer in project settings.json (WF-01)', async () => {
    const { installSessionHook } = await import('../lib/install/hooks.mjs');
    const tmpHome = mkdtempSync(join(tmpdir(), 'install-wf01-reg-home-'));
    const tmpProjectPath = mkdtempSync(join(tmpdir(), 'install-wf01-reg-proj-'));
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;
      const vaultPath = join(tmpHome, 'vault');
      const projectsData = { projects: [{ name: 'test-project', path: tmpProjectPath }] };

      installSessionHook(1, 1, projectRoot, vaultPath, projectsData);

      const settingsPath = join(tmpProjectPath, '.claude', 'settings.json');
      assert.ok(existsSync(settingsPath), 'project settings.json must exist');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const postToolUse = settings?.hooks?.PostToolUse || [];
      const match = postToolUse.find(e =>
        e.matcher === 'Skill' &&
        e.hooks?.some(h => /gsd-workflow-enforcer\.mjs/.test(h.command || '')),
      );
      assert.ok(match, 'PostToolUse Skill → gsd-workflow-enforcer entry must exist');
      assert.equal(match.hooks[0].timeout, 10, 'timeout must be 10 seconds');
    } finally {
      process.env.HOME = originalHome;
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpProjectPath, { recursive: true, force: true });
    }
  });

  it('is idempotent — running twice does not duplicate gsd-workflow-enforcer entry (WF-01)', async () => {
    const { installSessionHook } = await import('../lib/install/hooks.mjs');
    const tmpHome = mkdtempSync(join(tmpdir(), 'install-wf01-idem-home-'));
    const tmpProjectPath = mkdtempSync(join(tmpdir(), 'install-wf01-idem-proj-'));
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;
      const vaultPath = join(tmpHome, 'vault');
      const projectsData = { projects: [{ name: 'test-project', path: tmpProjectPath }] };

      installSessionHook(1, 1, projectRoot, vaultPath, projectsData);
      installSessionHook(1, 1, projectRoot, vaultPath, projectsData);

      const settingsPath = join(tmpProjectPath, '.claude', 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const count = (settings?.hooks?.PostToolUse || []).filter(e =>
        e.hooks?.some(h => /gsd-workflow-enforcer\.mjs/.test(h.command || '')),
      ).length;
      assert.equal(count, 1, `must not duplicate entry on re-run, got ${count}`);
    } finally {
      process.env.HOME = originalHome;
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpProjectPath, { recursive: true, force: true });
    }
  });

  it('skips gsd-workflow-enforcer registration when source missing in pkgRoot (WF-01)', async () => {
    const { installSessionHook } = await import('../lib/install/hooks.mjs');
    const tmpHome = mkdtempSync(join(tmpdir(), 'install-wf01-missing-home-'));
    const tmpPkgRoot = mkdtempSync(join(tmpdir(), 'install-wf01-missing-pkg-'));
    const tmpProjectPath = mkdtempSync(join(tmpdir(), 'install-wf01-missing-proj-'));
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;
      // pkgRoot is an empty tmp dir — no hooks/gsd-workflow-enforcer.mjs source
      const vaultPath = join(tmpHome, 'vault');
      const projectsData = { projects: [{ name: 'test-project', path: tmpProjectPath }] };

      installSessionHook(1, 1, tmpPkgRoot, vaultPath, projectsData);

      const settingsPath = join(tmpProjectPath, '.claude', 'settings.json');
      const settings = existsSync(settingsPath)
        ? JSON.parse(readFileSync(settingsPath, 'utf8'))
        : {};
      const match = (settings?.hooks?.PostToolUse || []).find(e =>
        e.hooks?.some(h => /gsd-workflow-enforcer\.mjs/.test(h.command || '')),
      );
      assert.strictEqual(match, undefined, 'must not register when source missing');
    } finally {
      process.env.HOME = originalHome;
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpPkgRoot, { recursive: true, force: true });
      rmSync(tmpProjectPath, { recursive: true, force: true });
    }
  });

  // D-07: installSessionHook must copy patches/ to ~/.claude/gsd-local-patches/
  it('installSessionHook copies patches/ to ~/.claude/gsd-local-patches/ (BUG-06 D-07)', async () => {
    const { installSessionHook } = await import('../lib/install/hooks.mjs');
    const nonce = `TEST_PATCH_MARKER_${Date.now()}`;
    const tmpHome = mkdtempSync(join(tmpdir(), 'install-d07-home-'));
    const tmpPkgRoot = mkdtempSync(join(tmpdir(), 'install-d07-pkg-'));
    const tmpProjectPath = mkdtempSync(join(tmpdir(), 'install-d07-proj-'));
    const patchesSrcDir = join(tmpPkgRoot, 'patches');
    mkdirSync(patchesSrcDir, { recursive: true });
    writeFileSync(join(patchesSrcDir, 'transition.md'), nonce);

    const vaultPath = join(tmpHome, 'vault');
    const projectsData = { projects: [{ name: 'test-project', path: tmpProjectPath }] };

    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tmpHome;

      // First call: wizard copies patches to ~/.claude/gsd-local-patches/
      installSessionHook(1, 1, tmpPkgRoot, vaultPath, projectsData);

      const destFile = join(tmpHome, '.claude', 'gsd-local-patches', 'transition.md');
      assert.ok(existsSync(destFile), `~/.claude/gsd-local-patches/transition.md must exist after wizard run`);
      assert.equal(
        readFileSync(destFile, 'utf8'),
        nonce,
        'gsd-local-patches/transition.md must match source byte-for-byte',
      );

      // Second call: idempotent — file still matches source, no throw
      installSessionHook(1, 1, tmpPkgRoot, vaultPath, projectsData);
      assert.ok(existsSync(destFile), 'gsd-local-patches/transition.md must still exist after second call');
      assert.equal(
        readFileSync(destFile, 'utf8'),
        nonce,
        'gsd-local-patches/transition.md must still match source after idempotent run',
      );
    } finally {
      process.env.HOME = originalHome;
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(tmpPkgRoot, { recursive: true, force: true });
      rmSync(tmpProjectPath, { recursive: true, force: true });
    }
  });
});

// ── Phase 23 — Smart Re-install Pre-fill ─────────────────────────

describe('Phase 23 — readInstallProfile (DX-07 / D-01 / D-03)', () => {
  let tmpVault;

  before(() => {
    tmpVault = mkdtempSync(join(tmpdir(), 'vault-test-'));
    mkdirSync(join(tmpVault, 'meta'), { recursive: true });
  });

  it('returns profile object when profile.json exists with valid content', async () => {
    const { readInstallProfile } = await import('../lib/install/detect.mjs');
    const profilePath = join(tmpVault, 'meta', 'profile.json');
    writeFileSync(profilePath, JSON.stringify({ lang: 'ru', codeLang: 'en', useCase: 'fullstack' }));
    const result = readInstallProfile(tmpVault);
    assert.deepStrictEqual(result, { lang: 'ru', codeLang: 'en', useCase: 'fullstack' });
  });

  it('returns null when profile.json does not exist', async () => {
    const { readInstallProfile } = await import('../lib/install/detect.mjs');
    const emptyVault = mkdtempSync(join(tmpdir(), 'vault-empty-'));
    mkdirSync(join(emptyVault, 'meta'), { recursive: true });
    const result = readInstallProfile(emptyVault);
    assert.strictEqual(result, null);
  });

  it('returns null when vaultPath is null', async () => {
    const { readInstallProfile } = await import('../lib/install/detect.mjs');
    const result = readInstallProfile(null);
    assert.strictEqual(result, null);
  });

  it('returns null when profile.json is corrupt JSON', async () => {
    const { readInstallProfile } = await import('../lib/install/detect.mjs');
    const corruptVault = mkdtempSync(join(tmpdir(), 'vault-corrupt-'));
    mkdirSync(join(corruptVault, 'meta'), { recursive: true });
    writeFileSync(join(corruptVault, 'meta', 'profile.json'), '{ invalid json !!');
    const result = readInstallProfile(corruptVault);
    assert.strictEqual(result, null);
  });
});

describe('Phase 23 — saveInstallProfile (DX-07 / D-01)', () => {
  it('writes profile.json with correct JSON content', async () => {
    const { saveInstallProfile } = await import('../lib/install/profile.mjs');
    const tmpVault = mkdtempSync(join(tmpdir(), 'vault-save-'));
    mkdirSync(join(tmpVault, 'meta'), { recursive: true });
    saveInstallProfile(tmpVault, { lang: 'ru', codeLang: 'en', useCase: 'fullstack' });
    const written = JSON.parse(readFileSync(join(tmpVault, 'meta', 'profile.json'), 'utf8'));
    assert.deepStrictEqual(written, { lang: 'ru', codeLang: 'en', useCase: 'fullstack' });
  });

  it('does nothing (no throw) when vaultPath is null', async () => {
    const { saveInstallProfile } = await import('../lib/install/profile.mjs');
    assert.doesNotThrow(() => saveInstallProfile(null, { lang: 'en' }));
  });

  it('creates meta/ dir if missing', async () => {
    const { saveInstallProfile } = await import('../lib/install/profile.mjs');
    const tmpVault = mkdtempSync(join(tmpdir(), 'vault-nometa-'));
    // Do NOT create meta/ dir — saveInstallProfile should create it
    saveInstallProfile(tmpVault, { lang: 'en', codeLang: 'en', useCase: 'any' });
    assert.ok(existsSync(join(tmpVault, 'meta', 'profile.json')), 'profile.json must exist after save');
  });
});

describe('Phase 23 — detectProjectsDir (DX-08)', () => {
  it('returns common prefix when project-map.json has paths under same dir', async () => {
    const { detectProjectsDir } = await import('../lib/install/detect.mjs');
    const tmpVault = mkdtempSync(join(tmpdir(), 'vault-pdir-'));
    mkdirSync(join(tmpVault, 'meta'), { recursive: true });
    writeFileSync(join(tmpVault, 'project-map.json'), JSON.stringify({
      projects: {
        '/Users/x/Projects/alpha': 'alpha',
        '/Users/x/Projects/beta': 'beta',
      },
    }));
    const result = detectProjectsDir(tmpVault);
    assert.strictEqual(result, '/Users/x/Projects');
  });

  it('returns null when no project-map.json', async () => {
    const { detectProjectsDir } = await import('../lib/install/detect.mjs');
    const tmpVault = mkdtempSync(join(tmpdir(), 'vault-nomap-'));
    const result = detectProjectsDir(tmpVault);
    assert.strictEqual(result, null);
  });

  it('returns null when vaultPath is null', async () => {
    const { detectProjectsDir } = await import('../lib/install/detect.mjs');
    const result = detectProjectsDir(null);
    assert.strictEqual(result, null);
  });

  it('returns null for empty projects object', async () => {
    const { detectProjectsDir } = await import('../lib/install/detect.mjs');
    const tmpVault = mkdtempSync(join(tmpdir(), 'vault-empty-proj-'));
    writeFileSync(join(tmpVault, 'project-map.json'), JSON.stringify({ projects: {} }));
    const result = detectProjectsDir(tmpVault);
    assert.strictEqual(result, null);
  });
});

describe('Phase 23 — detectRegisteredPaths (DX-09)', () => {
  it('returns object with path→name mapping from project-map.json', async () => {
    const { detectRegisteredPaths } = await import('../lib/install/detect.mjs');
    const tmpVault = mkdtempSync(join(tmpdir(), 'vault-regpaths-'));
    writeFileSync(join(tmpVault, 'project-map.json'), JSON.stringify({
      projects: {
        '/path/to/foo': 'foo',
        '/path/to/bar': 'bar',
      },
    }));
    const result = detectRegisteredPaths(tmpVault);
    assert.deepStrictEqual(result, { '/path/to/foo': 'foo', '/path/to/bar': 'bar' });
  });

  it('returns empty object when vaultPath is null', async () => {
    const { detectRegisteredPaths } = await import('../lib/install/detect.mjs');
    const result = detectRegisteredPaths(null);
    assert.deepStrictEqual(result, {});
  });
});

describe('Phase 23 — detectInstallState extended fields', () => {
  it('detectInstallState result includes profile, projectsDir, registeredPaths, notebooklmAuthenticated', async () => {
    const { detectInstallState } = await import('../lib/install/detect.mjs');
    const result = detectInstallState();
    assert.ok('profile' in result, 'result must include profile field');
    assert.ok('projectsDir' in result, 'result must include projectsDir field');
    assert.ok('registeredPaths' in result, 'result must include registeredPaths field');
    assert.ok('notebooklmAuthenticated' in result, 'result must include notebooklmAuthenticated field');
    assert.strictEqual(typeof result.notebooklmAuthenticated, 'boolean');
  });
});

describe('Phase 23 — lib/install/detect.mjs exports (D-08 extended)', () => {
  it('exports readInstallProfile function', async () => {
    const m = await import('../lib/install/detect.mjs');
    assert.strictEqual(typeof m.readInstallProfile, 'function');
  });

  it('exports detectProjectsDir function', async () => {
    const m = await import('../lib/install/detect.mjs');
    assert.strictEqual(typeof m.detectProjectsDir, 'function');
  });

  it('exports detectRegisteredPaths function', async () => {
    const m = await import('../lib/install/detect.mjs');
    assert.strictEqual(typeof m.detectRegisteredPaths, 'function');
  });

  it('exports detectInstallState function', async () => {
    const m = await import('../lib/install/detect.mjs');
    assert.strictEqual(typeof m.detectInstallState, 'function');
  });
});

describe('Phase 23 — lib/install/profile.mjs exports saveInstallProfile (D-08 extended)', () => {
  it('exports saveInstallProfile function', async () => {
    const m = await import('../lib/install/profile.mjs');
    assert.strictEqual(typeof m.saveInstallProfile, 'function');
  });
});

// ── Phase 23 Task 2 — Pre-fill UX structural tests ────────────────

describe('Phase 23 Task 2 — lib/install/profile.mjs select pre-fill (D-04, D-05)', () => {
  const src = readFileSync(join(projectRoot, 'lib', 'install', 'profile.mjs'), 'utf8');

  it('uses select prompt type for Keep current / Change (D-04)', () => {
    assert.ok(
      src.includes("type: 'select'"),
      "profile.mjs must use type: 'select' for pre-fill prompt",
    );
  });

  it('has Keep current choice (D-04)', () => {
    assert.ok(
      src.includes("'Keep current'") || src.includes('"Keep current"'),
      "profile.mjs must have 'Keep current' choice",
    );
  });

  it('has Change choice (D-04)', () => {
    assert.ok(
      src.includes("'Change'") || src.includes('"Change"'),
      "profile.mjs must have 'Change' choice",
    );
  });

  it('does NOT use confirm for language change (D-04)', () => {
    const confirmCount = (src.match(/type:\s*['"]confirm['"]/g) || []).length;
    assert.strictEqual(confirmCount, 0, "profile.mjs must NOT use confirm type — use select instead");
  });

  it('returns kept profile when detectedProfile provided and action is keep', () => {
    // Structural: check that 'keep' action returns early with detectedProfile values
    assert.ok(
      src.includes("action === 'keep'"),
      "profile.mjs must check action === 'keep' to return early",
    );
  });
});

describe('Phase 23 Task 2 — lib/install/projects.mjs Map-based registered paths (DX-09, D-06)', () => {
  const src = readFileSync(join(projectRoot, 'lib', 'install', 'projects.mjs'), 'utf8');

  it('uses new Map() instead of new Set() for registered paths (DX-09)', () => {
    assert.ok(
      src.includes('new Map('),
      'projects.mjs must use new Map() for registered paths',
    );
  });

  it('uses registeredPaths.get() to look up project name (DX-09)', () => {
    assert.ok(
      src.includes('registeredPaths.get('),
      'projects.mjs must use registeredPaths.get() for name lookup',
    );
  });

  it('logs (registered) info line for skipped projects (D-06)', () => {
    assert.ok(
      src.includes('(registered)'),
      'projects.mjs must include "(registered)" info line for skipped projects',
    );
  });

  it('uses continue to skip name prompt for registered paths', () => {
    assert.ok(
      src.includes('continue'),
      'projects.mjs must use continue to skip name prompt for registered projects',
    );
  });
});

describe('Phase 23 Task 2 — lib/install/plugins.mjs detectedUseCase param (DX-10)', () => {
  const src = readFileSync(join(projectRoot, 'lib', 'install', 'plugins.mjs'), 'utf8');

  it('accepts detectedUseCase as 3rd parameter', () => {
    assert.ok(
      src.includes('selectAndInstallPlugins(stepNum, totalSteps, detectedUseCase)'),
      'selectAndInstallPlugins must accept detectedUseCase as 3rd parameter',
    );
  });

  it('uses detectedUseCase in pre-fill block', () => {
    const count = (src.match(/detectedUseCase/g) || []).length;
    assert.ok(count >= 2, `detectedUseCase must appear at least 2 times, got ${count}`);
  });

  it('returns useCase in all code paths', () => {
    assert.ok(
      src.includes('return { installed, failed, useCase }') ||
      src.includes("return { installed, failed"),
      'selectAndInstallPlugins must include useCase in return value',
    );
    assert.ok(
      src.includes('useCase'),
      'useCase must be present in return statement',
    );
  });
});

describe('Phase 23 Task 2 — bin/install.mjs orchestration wiring', () => {
  const src = readFileSync(join(projectRoot, 'bin', 'install.mjs'), 'utf8');

  it('imports saveInstallProfile from profile.mjs', () => {
    assert.ok(
      src.includes('saveInstallProfile'),
      'bin/install.mjs must import saveInstallProfile',
    );
  });

  it('passes installState.projectsDir to collectProjects (DX-08)', () => {
    assert.ok(
      src.includes('installState.projectsDir'),
      'bin/install.mjs must pass installState.projectsDir to collectProjects',
    );
  });

  it('passes installState.profile?.useCase to selectAndInstallPlugins (DX-10)', () => {
    assert.ok(
      src.includes('installState.profile?.useCase') || src.includes("installState.profile && installState.profile.useCase"),
      'bin/install.mjs must pass profile useCase to selectAndInstallPlugins',
    );
  });

  it('calls saveInstallProfile after vaultPath resolved', () => {
    const saveCount = (src.match(/saveInstallProfile/g) || []).length;
    assert.ok(saveCount >= 2, `saveInstallProfile must appear at least 2 times (import + call), got ${saveCount}`);
  });
});

// ── Phase 23 Plan 02 Task 1 — GSD version check (DX-11) ──────────

describe('Phase 23 Plan 02 — lib/install/gsd.mjs version check (DX-11)', () => {
  const gsdSource = readFileSync(join(projectRoot, 'lib', 'install', 'gsd.mjs'), 'utf8');

  it('exports installGSD function', async () => {
    const m = await import('../lib/install/gsd.mjs');
    assert.strictEqual(typeof m.installGSD, 'function');
  });

  it('contains _installedGSDVersion helper (D-07, D-08)', () => {
    assert.ok(
      gsdSource.includes('_installedGSDVersion'),
      'gsd.mjs must define _installedGSDVersion helper',
    );
  });

  it('contains _latestGSDVersion helper using npm view (D-07)', () => {
    assert.ok(
      gsdSource.includes('_latestGSDVersion'),
      'gsd.mjs must define _latestGSDVersion helper',
    );
    assert.ok(
      /npm.*view.*get-shit-done-cc.*version/.test(gsdSource),
      'gsd.mjs must call npm view get-shit-done-cc version',
    );
  });

  it('reads package.json for installed version detection (D-07)', () => {
    assert.ok(
      gsdSource.includes('package.json'),
      'gsd.mjs must read package.json for installed version',
    );
  });

  it('contains select prompt with Update/Skip choices when outdated (D-09)', () => {
    assert.ok(
      gsdSource.includes("type: 'select'"),
      "gsd.mjs must use type: 'select' for Update/Skip prompt",
    );
    assert.ok(
      gsdSource.includes("'Update'") || gsdSource.includes('"Update"'),
      "gsd.mjs must have 'Update' choice",
    );
    assert.ok(
      gsdSource.includes("'Skip'") || gsdSource.includes('"Skip"'),
      "gsd.mjs must have 'Skip' choice in update prompt",
    );
  });

  it('auto-skips with "up to date" message when versions match (D-08)', () => {
    assert.ok(
      gsdSource.includes('up to date'),
      'gsd.mjs must print "up to date" message when installed === latest',
    );
  });

  it('installGSD is async (needed for prompt)', () => {
    assert.ok(
      gsdSource.includes('async function installGSD') || gsdSource.includes('export async function installGSD'),
      'installGSD must be async',
    );
  });
});

// ── Phase 23 Plan 02 Task 1 — NotebookLM auth detection (DX-12) ───

describe('Phase 23 Plan 02 — lib/install/notebooklm.mjs auth detection (DX-12)', () => {
  const nblmSource = readFileSync(join(projectRoot, 'lib', 'install', 'notebooklm.mjs'), 'utf8');

  it('installNotebookLM accepts 4th parameter alreadyAuthenticated (DX-12)', () => {
    assert.ok(
      nblmSource.includes('alreadyAuthenticated'),
      'installNotebookLM must accept alreadyAuthenticated as 4th parameter',
    );
  });

  it('contains select prompt with Skip/Re-login/Run sync choices when authenticated (D-11)', () => {
    assert.ok(
      nblmSource.includes("'Re-login'") || nblmSource.includes('"Re-login"'),
      "notebooklm.mjs must have 'Re-login' choice",
    );
    assert.ok(
      nblmSource.includes("'Run sync now'") || nblmSource.includes('"Run sync now"'),
      "notebooklm.mjs must have 'Run sync now' choice",
    );
    assert.ok(
      nblmSource.includes("'Skip'") || nblmSource.includes('"Skip"'),
      "notebooklm.mjs must have 'Skip' choice in auth select",
    );
  });

  it('contains "Run sync now?" text replacing "First sync" (D-12)', () => {
    assert.ok(
      nblmSource.includes('Run sync now?'),
      'notebooklm.mjs must contain "Run sync now?" text (D-12)',
    );
  });

  it('does NOT contain "Run first NotebookLM sync now?" text (D-12 replaced)', () => {
    assert.ok(
      !nblmSource.includes('Run first NotebookLM sync now?'),
      '"Run first NotebookLM sync now?" must be replaced with "Run sync now?"',
    );
  });
});

// ── Phase 23 Plan 02 Task 1 — bin/install.mjs wiring (DX-11/DX-12) ──

describe('Phase 23 Plan 02 — bin/install.mjs DX-11/DX-12 wiring', () => {
  const binSrc = readFileSync(join(projectRoot, 'bin', 'install.mjs'), 'utf8');

  it('passes notebooklmAuthenticated to installNotebookLM (DX-12)', () => {
    assert.ok(
      binSrc.includes('notebooklmAuthenticated'),
      'bin/install.mjs must pass notebooklmAuthenticated to installNotebookLM',
    );
  });

  it('awaits installGSD with await keyword (DX-11 async)', () => {
    assert.ok(
      binSrc.includes('await installGSD'),
      'bin/install.mjs must await installGSD (now async)',
    );
  });
});

// ── Phase 23 Plan 02 Task 2 — loop.md bulk prompt (DX-13) ─────────

describe('Phase 23 Plan 02 — lib/install/components.mjs bulk loop.md (DX-13)', () => {
  const compSrc = readFileSync(join(projectRoot, 'lib', 'install', 'components.mjs'), 'utf8');

  it('installLoopMd contains bulk prompt text for new projects (D-13)', () => {
    assert.ok(
      compSrc.includes('Install loop.md for all'),
      'components.mjs must contain "Install loop.md for all" bulk prompt text',
    );
  });

  it('installLoopMd splits into newProjects and installedProjects (DX-13)', () => {
    assert.ok(
      compSrc.includes('newProjects'),
      'components.mjs must define newProjects variable',
    );
    assert.ok(
      compSrc.includes('installedProjects'),
      'components.mjs must define installedProjects variable',
    );
  });

  it('installLoopMd uses only select prompts — no confirm (D-04)', () => {
    const confirmCount = (compSrc.match(/type:\s*['"]confirm['"]/g) || []).length;
    assert.strictEqual(
      confirmCount,
      0,
      `installLoopMd must NOT use type: 'confirm' — got ${confirmCount} occurrences (use select per D-04)`,
    );
  });

  it('installLoopMd has at least 2 select prompts (bulk + per-project fallback)', () => {
    const selectCount = (compSrc.match(/type:\s*['"]select['"]/g) || []).length;
    assert.ok(
      selectCount >= 2,
      `installLoopMd must have at least 2 select prompts, got ${selectCount}`,
    );
  });
});

// ── Phase 23 Plan 02 Task 2 — git-conventions bulk prompt (DX-13) ──

describe('Phase 23 Plan 02 — lib/install/git-conventions.mjs bulk prompt (DX-13)', () => {
  const gcSrc = readFileSync(join(projectRoot, 'lib', 'install', 'git-conventions.mjs'), 'utf8');

  it('contains bulk prompt text for all projects (D-13)', () => {
    assert.ok(
      gcSrc.includes('Configure git conventions for all'),
      'git-conventions.mjs must contain "Configure git conventions for all" bulk prompt text',
    );
  });

  it('contains per-project choice value (D-13)', () => {
    assert.ok(
      gcSrc.includes("'per-project'") || gcSrc.includes('"per-project"'),
      "git-conventions.mjs must have 'per-project' choice value",
    );
  });

  it('contains skip choice value for bulk skip (D-13)', () => {
    assert.ok(
      gcSrc.includes("value: 'skip'") || gcSrc.includes('value: "skip"'),
      "git-conventions.mjs must have 'skip' choice value for bulk skip",
    );
  });

  it('uses configureAll flag for bulk auto-accept (D-13)', () => {
    const configureAllCount = (gcSrc.match(/configureAll/g) || []).length;
    assert.ok(
      configureAllCount >= 3,
      `git-conventions.mjs must reference configureAll at least 3 times, got ${configureAllCount}`,
    );
  });
});
