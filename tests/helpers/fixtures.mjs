/**
 * tests/helpers/fixtures.mjs -- Shared test fixtures for all v0.9 phases.
 *
 * Provides:
 *   - makeTempVault()       Create a temp vault with meta/ and projects/ dirs
 *   - makeTempGitRepo()     Create a temp git repo with initial commit
 *   - makeTempMonorepo()    Create a temp dir with stack-type sentinel files
 *   - withStubBinary()      Install a bash stub on PATH, run fn, restore PATH
 *
 * All temp dirs are created in /tmp with cds-* prefix.
 * Cleanup is the caller's responsibility via the returned cleanup() function.
 */

import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// -- makeTempVault ------------------------------------------------------------

/**
 * Create a minimal vault structure in a temp directory.
 * Vault is valid if it has meta/ AND projects/ subdirectories.
 *
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function makeTempVault() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-vault-'));
  mkdirSync(join(dir, 'meta'), { recursive: true });
  mkdirSync(join(dir, 'projects'), { recursive: true });
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// -- makeTempGitRepo ----------------------------------------------------------

/**
 * Create a temp directory initialized as a git repo with one empty commit.
 * Passes GIT_AUTHOR/COMMITTER env vars so it works in CI without global git config.
 *
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function makeTempGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-git-'));
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  };
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, stdio: 'pipe', env: gitEnv });
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// -- makeTempMonorepo ---------------------------------------------------------

/**
 * Create a temp directory with sentinel files for a given monorepo stack type.
 * Used to test detectStack() with a fixture matrix.
 *
 * Supported stackType values:
 *   'pnpm-workspace'   -- pnpm-workspace.yaml with apps/ca + apps/nmp
 *   'npm-workspaces'   -- package.json with workspaces: ["apps/*"] + apps/web/
 *   'lerna'            -- lerna.json with packages: ["packages/*"] + packages/core/
 *   'nx'               -- nx.json + apps/ + packages/ dirs (heuristic)
 *   'turbo'            -- turbo.json + package.json workspaces + apps/web/
 *   'cargo-workspace'  -- Cargo.toml with [workspace] + members
 *   'go-multi-module'  -- subdirs each with go.mod
 *   'python-uv'        -- pyproject.toml with [tool.uv.workspace]
 *   'single-package'   -- empty dir (fallback)
 *
 * @param {string} stackType
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function makeTempMonorepo(stackType) {
  const dir = mkdtempSync(join(tmpdir(), 'cds-mono-'));

  switch (stackType) {
    case 'pnpm-workspace': {
      mkdirSync(join(dir, 'apps', 'ca'), { recursive: true });
      mkdirSync(join(dir, 'apps', 'nmp'), { recursive: true });
      writeFileSync(
        join(dir, 'pnpm-workspace.yaml'),
        'packages:\n  - "apps/*"\n',
        'utf8'
      );
      break;
    }

    case 'npm-workspaces': {
      mkdirSync(join(dir, 'apps', 'web'), { recursive: true });
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'root', workspaces: ['apps/*'] }, null, 2) + '\n',
        'utf8'
      );
      break;
    }

    case 'lerna': {
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      writeFileSync(
        join(dir, 'lerna.json'),
        JSON.stringify({ packages: ['packages/*'] }, null, 2) + '\n',
        'utf8'
      );
      break;
    }

    case 'nx': {
      mkdirSync(join(dir, 'apps'), { recursive: true });
      mkdirSync(join(dir, 'packages'), { recursive: true });
      writeFileSync(join(dir, 'nx.json'), JSON.stringify({ version: 3 }, null, 2) + '\n', 'utf8');
      break;
    }

    case 'turbo': {
      mkdirSync(join(dir, 'apps', 'web'), { recursive: true });
      writeFileSync(join(dir, 'turbo.json'), JSON.stringify({ pipeline: {} }, null, 2) + '\n', 'utf8');
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'root', workspaces: ['apps/*'] }, null, 2) + '\n',
        'utf8'
      );
      break;
    }

    case 'cargo-workspace': {
      mkdirSync(join(dir, 'crates', 'core'), { recursive: true });
      mkdirSync(join(dir, 'crates', 'api'), { recursive: true });
      writeFileSync(
        join(dir, 'Cargo.toml'),
        '[workspace]\nmembers = ["crates/core", "crates/api"]\n',
        'utf8'
      );
      break;
    }

    case 'go-multi-module': {
      mkdirSync(join(dir, 'server'), { recursive: true });
      mkdirSync(join(dir, 'core'), { recursive: true });
      writeFileSync(join(dir, 'server', 'go.mod'), 'module github.com/test/server\n\ngo 1.21\n', 'utf8');
      writeFileSync(join(dir, 'core', 'go.mod'), 'module github.com/test/core\n\ngo 1.21\n', 'utf8');
      break;
    }

    case 'python-uv': {
      mkdirSync(join(dir, 'packages', 'lib'), { recursive: true });
      writeFileSync(
        join(dir, 'pyproject.toml'),
        '[tool.uv.workspace]\nmembers = ["packages/*"]\n',
        'utf8'
      );
      break;
    }

    case 'single-package':
      // No sentinel files -- fallback case
      break;

    default:
      throw new Error(`Unknown stackType: ${stackType}`);
  }

  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// -- withStubBinary -----------------------------------------------------------

/**
 * Install a named bash stub binary on PATH, call fn(stubDir), then restore PATH.
 * Stub uses env vars by convention for controlled behavior.
 *
 * @param {string} name            -- binary name (e.g. 'git', 'notebooklm')
 * @param {string} scriptContent   -- shell script body (after #!/bin/sh)
 * @param {Function} fn            -- callback; called with stubDir as argument
 * @returns {*} return value of fn
 */
export function withStubBinary(name, scriptContent, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cds-stub-'));
  const bin = join(dir, name);
  writeFileSync(bin, `#!/bin/sh\n${scriptContent}`, 'utf8');
  chmodSync(bin, 0o755);
  const origPath = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${origPath}`;
  try {
    return fn(dir);
  } finally {
    process.env.PATH = origPath;
    rmSync(dir, { recursive: true, force: true });
  }
}
