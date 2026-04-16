// tests/doctor-gsd-permissions.test.mjs
// Tests for `claude-dev-stack doctor --gsd-permissions` flow.
// Source: Phase 40 Plan 03
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'bin', 'cli.mjs');

describe('claude-dev-stack doctor --gsd-permissions', () => {
  let tempProject;

  afterEach(() => {
    if (tempProject) rmSync(tempProject, { recursive: true, force: true });
  });

  it('bin/cli.mjs accepts doctor --gsd-permissions flag without error', () => {
    // We run the doctor command in a temp dir (no vault, minimal env).
    // It should succeed (exit 0) — the flag is recognized.
    tempProject = mkdtempSync(join(tmpdir(), 'cds-doctor-perms-'));
    const result = execFileSync(process.execPath, [cliPath, 'doctor', '--gsd-permissions'], {
      cwd: tempProject,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000,
    });
    // Should mention "pattern" (either added or already present)
    expect(result).toMatch(/pattern|permission/i);
  });

  it('creates .claude/settings.local.json in cwd', () => {
    tempProject = mkdtempSync(join(tmpdir(), 'cds-doctor-perms-create-'));
    execFileSync(process.execPath, [cliPath, 'doctor', '--gsd-permissions'], {
      cwd: tempProject,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000,
    });
    const settingsPath = join(tempProject, '.claude', 'settings.local.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.permissions.allow).toContain('Bash(pnpm:*)');
    expect(settings.permissions.allow).toContain('Bash(vitest:*)');
  });

  it('is idempotent — running twice produces same output', () => {
    tempProject = mkdtempSync(join(tmpdir(), 'cds-doctor-perms-idem-'));
    execFileSync(process.execPath, [cliPath, 'doctor', '--gsd-permissions'], {
      cwd: tempProject,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000,
    });
    const output = execFileSync(process.execPath, [cliPath, 'doctor', '--gsd-permissions'], {
      cwd: tempProject,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000,
    });
    expect(output).toMatch(/already present|no changes/i);
  });
});
