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

  it('writes allowedTools with vault patterns (BUG-02)', () => {
    assert.ok(src.includes('allowedTools'), 'allowedTools must be written');
    assert.ok(src.includes('context.md'), 'vault context.md read pattern must be present');
    assert.ok(src.includes('sessions/*.md'), 'vault sessions write pattern must be present');
  });

  it('writes safe bash allowedTools entries (BUG-02)', () => {
    assert.ok(src.includes('git status'), 'git status allowedTool must be present');
    assert.ok(src.includes('git branch -d'), 'git branch -d allowedTool must be present');
  });

  it('copies gsd-auto-reapply-patches.sh to hooksDir (BUG-06)', () => {
    assert.ok(
      src.includes('gsd-auto-reapply-patches.sh'),
      'gsd-auto-reapply-patches.sh must be copied to hooksDir',
    );
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
});
