/**
 * Shared test helpers for Phase 6+ test suites.
 * Provides reusable temp dir factories and stub binary setup.
 */

import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { join, delimiter } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// ── makeTempVault ────────────────────────────────────────────────
export function makeTempVault() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-vault-'));
  mkdirSync(join(dir, 'meta'), { recursive: true });
  mkdirSync(join(dir, 'projects'), { recursive: true });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── makeTempGitRepo ──────────────────────────────────────────────
export function makeTempGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cds-git-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  };
  execSync('git init', { cwd: dir, stdio: 'pipe', env });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, stdio: 'pipe', env });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── makeTempMonorepo ─────────────────────────────────────────────
export function makeTempMonorepo(stackType) {
  const dir = mkdtempSync(join(tmpdir(), `cds-mono-${stackType}-`));

  switch (stackType) {
    case 'pnpm-workspace':
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n', 'utf8');
      mkdirSync(join(dir, 'apps', 'web'), { recursive: true });
      mkdirSync(join(dir, 'apps', 'api'), { recursive: true });
      mkdirSync(join(dir, 'packages', 'ui'), { recursive: true });
      break;

    case 'npm-workspaces':
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ workspaces: ['apps/*', 'packages/*'] }), 'utf8');
      mkdirSync(join(dir, 'apps', 'web'), { recursive: true });
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      break;

    case 'lerna':
      writeFileSync(join(dir, 'lerna.json'), JSON.stringify({ packages: ['packages/*'] }), 'utf8');
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      break;

    case 'nx':
      writeFileSync(join(dir, 'nx.json'), '{}', 'utf8');
      mkdirSync(join(dir, 'apps', 'web'), { recursive: true });
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      break;

    case 'turborepo':
      writeFileSync(join(dir, 'turbo.json'), '{}', 'utf8');
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ workspaces: ['apps/*', 'packages/*'] }), 'utf8');
      mkdirSync(join(dir, 'apps', 'web'), { recursive: true });
      mkdirSync(join(dir, 'packages', 'ui'), { recursive: true });
      break;

    case 'cargo-workspace':
      writeFileSync(join(dir, 'Cargo.toml'), '[workspace]\nmembers = ["crates/core", "crates/api"]', 'utf8');
      mkdirSync(join(dir, 'crates', 'core'), { recursive: true });
      mkdirSync(join(dir, 'crates', 'api'), { recursive: true });
      break;

    case 'go-multi-module':
      mkdirSync(join(dir, 'cmd', 'server'), { recursive: true });
      mkdirSync(join(dir, 'pkg', 'core'), { recursive: true });
      writeFileSync(join(dir, 'cmd', 'server', 'go.mod'), 'module example.com/x', 'utf8');
      writeFileSync(join(dir, 'pkg', 'core', 'go.mod'), 'module example.com/x', 'utf8');
      break;

    case 'python-uv':
      writeFileSync(join(dir, 'pyproject.toml'), '[tool.uv.workspace]\nmembers = ["packages/*"]', 'utf8');
      mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
      break;

    case 'single-package':
      // No sentinel files — just the empty dir
      break;

    default:
      throw new Error(`Unknown stack type: ${stackType}`);
  }

  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── withStubBinary ───────────────────────────────────────────────
export function withStubBinary(name, scriptContent, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cds-stub-'));
  const stubPath = join(dir, name);
  writeFileSync(stubPath, `#!/bin/sh\n${scriptContent}`, 'utf8');
  chmodSync(stubPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = dir + delimiter + originalPath;

  let result;
  try {
    result = fn(dir);
  } finally {
    process.env.PATH = originalPath;
    rmSync(dir, { recursive: true, force: true });
  }
  return result;
}
